import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { createTestDatabase } from "./database-helper.mjs";
import { gisActors, gisLogin, seedGisFixtures } from "./gis-fixtures.mjs";

function load(file, dependencies = {}) {
  const source = readFileSync(new URL("../" + file, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", output)((name) => {
    if (!(name in dependencies)) throw Error("Unexpected dependency: " + name);
    return dependencies[name];
  }, loaded, loaded.exports);
  return loaded.exports;
}
const mapping = load("src/lib/burial-records.ts");
const visibility = load("src/lib/record-visibility.ts", { "./burial-records": mapping });
const presentation = load("src/lib/visitor-presentation.ts", {
  "./synthetic-plots": load("src/lib/synthetic-plots.ts"),
});

test("the list shows public visibility only when the visitor reader confirms it", () => {
  assert.equal(visibility.visitorVisibilityLabel({ visitorVisible: true }), "Published");
  assert.equal(visibility.visitorVisibilityLabel({ visitorVisible: false }), "Staff only");
  assert.equal(visibility.visitorVisibilityLabel({ visitorVisible: null }), "Visibility unavailable");
  assert.equal(visibility.visitorVisibilityLabel({}), "Visibility unavailable");
});

test("publication never activates ineligible records; hiding retains every save field", () => {
  const record = {
    revision: 4, recordStatus: "active", publicDisplay: true, name: "Test",
    lotId: 1, intermentConfirmed: true, intermentOrderNumber: "ORDER",
    qualityNotes: "PRIVATE", recordSource: "SOURCE",
  };
  for (const patch of [{ recordStatus: "pending" }, { recordStatus: "archived" }, { lotRemoved: true }]) {
    assert.throws(() => visibility.visibilityInput({ ...record, ...patch }, true));
  }
  assert.deepEqual(visibility.visibilityInput(record, false),
    { ...mapping.recordInputFromRecord(record), publicDisplay: false });
  assert.equal(visibility.visibilityInput({ ...record, publicDisplay: false }, true).recordStatus, "active");
});

test("preview authenticates before reads and serializes only public-safe projected fields", async () => {
  const calls = [];
  const row = {
    burial_id: 7, lot_id: 8, interment_date: "2020-01-02", record_status: "pending",
    deceased: { display_name: "Preview Person", birth_date: null, death_date: "2020-01-01" },
    lot: { lot_code: "INTERNAL", deleted_at: null, area: { area_name: "Test garden" }, block: null },
    quality_notes: "SECRET_NOTES", owner: { address: "SECRET_CONTACT" }, audit: "SECRET_AUDIT",
  };
  const client = {
    from(table) {
      calls.push(["from", table]);
      const chain = new Proxy({}, {
        get: (_, method) => method === "then"
          ? (resolve, reject) => Promise.resolve({
            data: table === "burial_record" ? row : null, error: null,
          }).then(resolve, reject)
          : (...args) => { calls.push([method, ...args]); return chain; },
      });
      return chain;
    },
    async rpc() { return { data: [{ lotId: "8", reference: "SYNTHETIC" }], error: null }; },
  };
  const publicReaders = load("src/lib/supabase/public-data.ts", { "./config": {} });
  const preview = load("src/lib/supabase/staff-visitor-preview.ts", {
    "server-only": {},
    "@/lib/auth": { requireStaff: async () => { calls.push(["auth"]); } },
    "./server": { getServerSupabase: async () => client },
    "./public-data": publicReaders,
    "@/lib/visitor-presentation": presentation,
  });
  const result = await preview.getStaffVisitorPreview("7");
  assert.equal(calls[0][0], "auth");
  assert.equal(result.visible, false);
  assert.equal(result.record.status, "Pending");
  assert.equal(result.record.gravesiteReference, "SYNTHETIC");
  assert.equal(result.record.syntheticPlotReference, null);
  assert.equal(result.record.location, null);
  assert.equal(result.record.locationVerified, false);
  assert.doesNotMatch(JSON.stringify(result), /SECRET_|quality_notes|owner|audit|credential/i);
  const columns = calls.find(([method]) => method === "select")[1];
  assert.doesNotMatch(columns, /quality_notes|lot_owner|record_source|created_by|updated_by/);
  const denied = load("src/lib/supabase/staff-visitor-preview.ts", {
    "server-only": {},
    "@/lib/auth": { requireStaff: async () => { throw Error("Denied"); } },
    "./server": { getServerSupabase: () => { throw Error("Must not read"); } },
    "./public-data": publicReaders,
    "@/lib/visitor-presentation": presentation,
  });
  await assert.rejects(denied.getStaffVisitorPreview("7"), /Denied/);
});

test("protected publish/hide controls public APIs and preserves interment/plot data", async (t) => {
  const db = await createTestDatabase();
  t.after(() => db.close());
  await seedGisFixtures(db);
  await gisLogin(db);
  const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0]?.result;
  const save = (entity, id, revision, values, operation = "save", request = randomUUID()) =>
    scalar("select public.staff_save_record($1,$2,$3,$4::jsonb,$5,$6) result",
      [entity, id, revision, JSON.stringify(values), request, operation]);
  const plot = await save("lot", null, null, {
    area_id: 1, lot_code: "VISIBILITY-TEST", status: "AVAILABLE",
    grave_type: "regular", grave_policy_reference: "Isolated approval",
  });
  const values = {
    display_name: "Visibility Test Person", birth_date: "1900-01-01", death_date: "2020-01-01",
    lot_id: Number(plot.id), interment_date: "2020-01-02", record_status: "active",
    interment_status: "PERMANENT", remains_type: "ASH", interment_confirmed: true,
    interment_order_number: "VISIBILITY-ORDER", public_display: false,
    quality_notes: "PRIVATE_VISIBILITY_NOTES", record_source: "PRIVATE_SOURCE",
  };
  let record = await save("burial_record", null, null, values);
  const sibling = await save("burial_record", null, null, {
    ...values, display_name: "Visible Sibling", interment_order_number: "SIBLING-ORDER",
    public_display: true,
  });
  async function checkPublic(visible) {
    await gisLogin(db, null, "anon");
    const rows = await db.query("select * from public.public_burial_records where burial_id=$1", [record.id]);
    const search = await scalar("select public.search_public_burials($1) result", ["Visibility Test Person"]);
    const gis = await scalar("select public.public_burial_gis($1) result", [record.id]);
    const roster = await scalar("select public.public_shared_plot_burials($1) result", [sibling.id]);
    assert.equal(rows.rows.length, visible ? 1 : 0);
    assert.equal(search.items.some((item) => String(item.burial_id) === record.id), visible);
    assert.equal(Boolean(gis), visible);
    assert.equal(roster.some((item) => item.id === record.id), visible);
    assert.doesNotMatch(JSON.stringify([rows.rows, search, gis, roster]), /PRIVATE_VISIBILITY|PRIVATE_SOURCE|quality_notes|lot_owner_id/);
    await gisLogin(db);
  }
  await checkPublic(false);
  const before = await scalar("select to_jsonb(b)-array['revision','updated_at','updated_by'] result from public.burial_record b where burial_id=$1", [record.id]);
  const plotBefore = await scalar("select to_jsonb(l) result from public.lot l where lot_id=$1", [plot.id]);
  const request = randomUUID();
  await gisLogin(db, gisActors.manager);
  const published = await save("burial_record", record.id, record.revision,
    { ...values, public_display: true }, "save", request);
  assert.deepEqual(await save("burial_record", record.id, record.revision,
    { ...values, public_display: true }, "save", request), published);
  await assert.rejects(save("burial_record", record.id, record.revision, values), /changed|revision|reload/i);
  record = published;
  await checkPublic(true);
  record = await save("burial_record", record.id, record.revision, values);
  await checkPublic(false);
  const after = await scalar("select to_jsonb(b)-array['revision','updated_at','updated_by'] result from public.burial_record b where burial_id=$1", [record.id]);
  assert.deepEqual(after, before);
  assert.deepEqual(await scalar("select to_jsonb(l) result from public.lot l where lot_id=$1", [plot.id]), plotBefore);
  for (const status of ["pending", "archived"]) {
    record = await save("burial_record", record.id, record.revision, {
      ...values, public_display: true, record_status: status,
    });
    await checkPublic(false);
  }
  record = await save("burial_record", record.id, record.revision, {
    ...values, public_display: true,
  });
  record = await save("burial_record", record.id, record.revision, {}, "delete");
  await checkPublic(false);
  await gisLogin(db, gisActors.inactive);
  await assert.rejects(save("burial_record", record.id, record.revision, values), /staff|active|permission/i);
  await gisLogin(db, null, "anon");
  await assert.rejects(save("burial_record", record.id, record.revision, values), /permission|staff/i);
  await gisLogin(db, gisActors.admin, "postgres");
  await db.query("update public.lot set deleted_at=now() where lot_id=$1", [plot.id]);
  await gisLogin(db, null, "anon");
  assert.equal(await scalar("select public.public_burial_gis($1) result", [sibling.id]), null);
  assert.equal((await db.query("select * from public.public_burial_records where burial_id=$1", [sibling.id])).rows.length, 0);
});
