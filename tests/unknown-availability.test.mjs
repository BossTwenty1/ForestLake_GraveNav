import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { test } from "node:test";
import { createTestDatabase } from "./database-helper.mjs";
import { gisActors, gisLogin, seedGisFixtures } from "./gis-fixtures.mjs";

function load(file, dependencies = {}) {
  const output = ts.transpileModule(readFileSync(new URL("../" + file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loadedModule = { exports: {} };
  new Function("require", "module", "exports", output)((name) => {
    if (!(name in dependencies)) throw new Error("Unexpected dependency " + name);
    return dependencies[name];
  }, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

test("UNKNOWN availability preserves existing facts and protected contracts", async (t) => {
  const db = await createTestDatabase({ throughMigration: "20261107010000_shared_gravesite_interments.sql" });
  t.after(() => db.close());
  await seedGisFixtures(db);
  await gisLogin(db);
  const result = async (sql, params = []) => (await db.query(sql, params)).rows[0]?.result;
  const save = (values, { id = null, revision = null, request = randomUUID() } = {}) =>
    result("select public.staff_save_record('lot',$1,$2,$3::jsonb,$4,'save') result", [id, revision, JSON.stringify(values), request]);
  const old = [];
  for (const status of ["AVAILABLE", "BOOKED", "HOLD"]) old.push(await save({ area_id: 1, lot_code: "TEST-EXISTING-" + status, status }));
  const stored = () => result("select jsonb_agg(to_jsonb(l) order by lot_id) result from public.lot l");
  const before = await stored();
  const privileges = await result("select jsonb_agg(jsonb_build_object('name',proname,'acl',proacl::text) order by proname) result from pg_proc where pronamespace='public'::regnamespace and proname in ('staff_save_record','staff_plot_management','staff_dashboard_data','staff_gis_readiness')");
  await gisLogin(db, gisActors.admin, "postgres");
  await db.exec(readFileSync(new URL("../supabase/migrations/20261116010000_unknown_plot_availability.sql", import.meta.url), "utf8"));
  await gisLogin(db);
  let unknown, explicit;

  await t.test("forward migration changes no existing IDs, statuses, revisions or reader grants", async () => {
    assert.deepEqual(await stored(), before);
    assert.deepEqual(await result("select jsonb_agg(jsonb_build_object('name',proname,'acl',proacl::text) order by proname) result from pg_proc where pronamespace='public'::regnamespace and proname in ('staff_save_record','staff_plot_management','staff_dashboard_data','staff_gis_readiness')"), privileges);
  });
  await t.test("omitted availability creates UNKNOWN; request replay preserves its ID", async () => {
    const values = { area_id: 1, lot_code: "TEST-UNKNOWN" };
    const request = randomUUID();
    unknown = await save(values, { request });
    assert.deepEqual(await save(values, { request }), unknown);
    assert.equal(await result("select status result from public.lot where lot_id=$1", [unknown.id]), "UNKNOWN");
    assert.equal(await result("select count(*)::int result from public.lot where lot_code='TEST-UNKNOWN'"), 1);
    await assert.rejects(save({ ...values, status: "AVAILABLE" }, { request }), /different changes/);
  });
  await t.test("explicit UNKNOWN and partial updates work without changing confirmed status", async () => {
    explicit = await save({ area_id: 1, lot_code: "TEST-EXPLICIT-UNKNOWN", status: "UNKNOWN" });
    explicit = await save({ lot_code: "TEST-EXPLICIT-UNKNOWN", legacy_pa_number: "TEST-ONLY" }, explicit);
    assert.equal(await result("select status result from public.lot where lot_id=$1", [explicit.id]), "UNKNOWN");
    old[0] = await save({ lot_code: "TEST-EXISTING-AVAILABLE", legacy_pa_number: "TEST-ONLY" }, old[0]);
    assert.equal(await result("select status result from public.lot where lot_id=$1", [old[0].id]), "AVAILABLE");
    explicit = await save({ lot_code: "TEST-EXPLICIT-UNKNOWN", status: "HOLD" }, explicit);
    explicit = await save({ lot_code: "TEST-EXPLICIT-UNKNOWN", status: "UNKNOWN" }, explicit);
    await assert.rejects(save({ lot_code: "TEST-EXPLICIT-UNKNOWN", status: "AVAILABLE" }, { ...explicit, revision: 1 }), /Another staff member/);
    await assert.rejects(save({ area_id: 1, lot_code: "TEST-NULL", status: null }), /not-null/);
    await assert.rejects(save({ area_id: 1, lot_code: "TEST-INVALID", status: "VACANT" }), /lot_status_check/);
  });
  await t.test("actual staff and GIS readers preserve UNKNOWN, with adapter decoding", async () => {
    const client = { rpc: async (name, args = {}) => {
      const calls = {
        staff_dashboard_data: ["select public.staff_dashboard_data() result", []],
        staff_plot_management: ["select public.staff_plot_management($1,$2,$3,$4,$5,$6,$7,$8) result", [args.p_query,args.p_area,args.p_state,args.p_verification,args.p_sort,args.p_direction,args.p_page,args.p_page_size]],
      };
      const [sql, params] = calls[name] ?? [];
      assert.ok(sql, "Unexpected RPC " + name);
      return { data: await result(sql, params), error: null };
    } };
    const adapters = load("src/lib/supabase/admin-data.ts", { "./config": { getBrowserSupabase: () => client }, "./mutation-receipts": {} });
    const page = await adapters.getPlotManagementPage({ query: "", area: "all", state: "unknown", verification: "all", sort: "plot", direction: "asc", page: 0, pageSize: 20 });
    assert.equal(page.total, 2);
    assert.equal(page.summary.unknown, 2);
    assert.equal(page.summary.available, 1);
    for (const plot of page.items) {
      assert.equal(plot.status, "UNKNOWN");
      assert.equal(plot.operationalState, "unknown");
      assert.equal(plot.lotOwnerId, null);
      assert.equal(plot.location, null);
    }
    const dashboard = await adapters.getDashboardData();
    assert.equal(dashboard.occupancy.unknown, 2);
    assert.equal(dashboard.occupancy.available, 1);
    assert.equal(dashboard.occupancy.total, 5);
    assert.equal(Object.entries(dashboard.occupancy).filter(([k]) => !["total","occupancyPercent"].includes(k)).reduce((n,[,v])=>n+v,0), 5);
    const gis = await result("select public.staff_gis_readiness(1,1,1,20) result");
    const decoded = load("src/lib/supabase/gis-types.ts").decodeGisReadinessPage(gis);
    assert.equal(decoded.rows.find((row) => row.lotId === unknown.id).occupancy, "unknown");
    assert.equal(decoded.rows.find((row) => row.lotId === unknown.id).geometryReady, false);
    assert.equal(decoded.rows.find((row) => row.lotId === old[0].id).occupancy, "available");
  });
  await t.test("UNKNOWN is not an eligible burial plot and cannot admit an interment", async () => {
    const options = await result("select public.staff_interment_plot_options() result");
    assert.equal(options.some((row) => String(row.lotId) === unknown.id), false);
    assert.equal(options.some((row) => String(row.lotId) === old[0].id), true);
    await assert.rejects(result("select public.staff_save_record('burial_record',null,null,$1::jsonb,$2,'save') result", [JSON.stringify({ lot_id: unknown.id, display_name: "Isolated fictional rejection test", interment_date: "2026-01-01", record_status: "pending", interment_status: "PERMANENT", remains_type: "ASH" }),randomUUID()]), /not available/);
    assert.equal(await result("select count(*)::int result from public.deceased"), 0);
    assert.equal(await result("select count(*)::int result from public.burial_record"), 0);
    await gisLogin(db, gisActors.admin, "postgres");
    assert.equal(await result("select public.grave_interment_limit('regular',null) result"), 6);
    await gisLogin(db);
  });
  await t.test("staff create/update adapters send UNKNOWN and the verification reader accepts it", async () => {
    const client = {
      auth: { getUser: async () => ({ data: { user: { id: gisActors.admin } }, error: null }) },
      rpc: async (name, args) => {
        assert.equal(name, "staff_save_record");
        assert.equal(args.p_values.status, "UNKNOWN");
        return { data: await result("select public.staff_save_record($1,$2,$3,$4::jsonb,$5,$6) result", [args.p_entity,args.p_id,args.p_revision,JSON.stringify(args.p_values),args.p_request_id,args.p_operation]), error: null };
      },
      from: (table) => {
        assert.equal(table, "lot");
        const builder = { select: () => builder, is: () => builder, order: () => builder,
          range: async () => ({ data: (await db.query("select * from public.lot where deleted_at is null")).rows, error: null, count: 6 }) };
        return builder;
      },
    };
    const adapters = load("src/lib/supabase/admin-data.ts", {
      "./config": { getBrowserSupabase: () => client },
      "./mutation-receipts": { mutationFingerprint: async (value) => value, pendingRequestId: () => randomUUID(), acknowledgeRequest: () => {} },
    });
    const input = { areaId: 1, lotCode: "TEST-ADAPTER-UNKNOWN", status: "UNKNOWN" };
    const created = await adapters.createLot(input);
    const updated = await adapters.updateLot(Number(created.id), { ...input, revision: created.revision });
    assert.equal(updated.id, created.id);
    const rows = (await adapters.getLotsForVerificationPage()).items;
    assert.equal(rows.find((row) => String(row.lot_id) === created.id).status, "UNKNOWN");
  });
  await t.test("manager may preserve UNKNOWN; inactive, anonymous and direct writes remain blocked", async () => {
    await gisLogin(db, gisActors.manager);
    explicit = await save({ lot_code: "TEST-EXPLICIT-UNKNOWN", status: "UNKNOWN" }, explicit);
    await assert.rejects(db.exec("update public.lot set status='AVAILABLE'"), /permission denied/);
    await gisLogin(db, gisActors.inactive);
    await assert.rejects(save({ area_id: 1, lot_code: "TEST-INACTIVE" }), /active|permission/i);
    await gisLogin(db, null, "anon");
    await assert.rejects(save({ area_id: 1, lot_code: "TEST-ANON" }), /permission denied/);
    await assert.rejects(result("select public.staff_dashboard_data() result"), /permission denied/);
    const publicSearch = await result("select public.search_public_burials('TEST-UNKNOWN') result");
    assert.deepEqual(publicSearch.items, []);
    await assert.rejects(db.exec("select * from public.lot"), /permission denied/);
  });
});
