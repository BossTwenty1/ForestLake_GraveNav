import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createTestDatabase } from "./database-helper.mjs";
import { gisActors, gisLogin, seedGisFixtures } from "./gis-fixtures.mjs";

// Render actual existing presentation components without any Auth session or API transport.
const nativeRequire = createRequire(import.meta.url);
const loaded = new Map();
function loadSource(path) {
  const file = resolve(path);
  if (loaded.has(file)) return loaded.get(file).exports;
  const sourceModule = { exports: {} };
  loaded.set(file, sourceModule);
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function("require", "module", "exports", code)((name) => {
    if (!name.startsWith("@/") && !name.startsWith(".")) return nativeRequire(name);
    const base = name.startsWith("@/") ? resolve("src", name.slice(2)) : resolve(dirname(file), name);
    for (const extension of [".tsx", ".ts"]) {
      try { readFileSync(base + extension); } catch { continue; }
      return loadSource(base + extension);
    }
    throw Error("Unknown source dependency " + name);
  }, sourceModule, sourceModule.exports);
  return sourceModule.exports;
}

test("synthetic labels are precise and present in desktop/mobile plot presentation", () => {
  const code = "P2S-" + "a".repeat(64);
  const { isSyntheticPlot, plotAvailabilityLabel } = loadSource("src/lib/synthetic-plots.ts");
  assert.equal(isSyntheticPlot(code), true);
  for (const other of [null, "P2S-old", "P2S-" + "a".repeat(63), "PHYSICAL-1"]) {
    assert.equal(isSyntheticPlot(other), false);
  }
  assert.equal(plotAvailabilityLabel(code, "AVAILABLE"), "Sample admission eligible");
  assert.equal(plotAvailabilityLabel("PHYSICAL-1", "HOLD"), "HOLD");
  const { PlotManagementList } = loadSource("src/components/admin/plot-management-list.tsx");
  const noop = () => {};
  const html = renderToStaticMarkup(React.createElement(PlotManagementList, {
    plots: [{ lotId: 1, lotCode: code, areaId: 1, areaName: "Garden", status: "AVAILABLE",
      operationalState: "occupied", coordinateState: "missing", updatedAt: "2026-11-17",
      remainingInterments: 4, interments: [{ id: 1, name: "Fictional person", status: "pending" }] }],
    summary: { total: 4494, occupied: 0, available: 0, needsVerification: 4494, syntheticPlots: 90 },
    areas: [], total: 1, loading: false, error: "", busy: false, canAdmin: true,
    queryState: { query: "", area: "all", state: "all", verification: "all",
      sort: "updated", direction: "desc", page: 0, pageSize: 20 },
    onAdd: noop, onEdit: noop, onDelete: noop, onQueryStateChange: noop, onRetry: noop,
  }));
  assert.match(html, /Physical plot records/);
  assert.match(html, /Synthetic project plots: 90/);
  assert.match(html, /Sample admission eligible/);
  assert.match(html, /No verified physical location/);
  assert.match(html, /sample reservations/);
  assert.match(html, /admin-burial-table/);
  assert.match(html, /admin-burial-mobile-card/);
  assert.doesNotMatch(html, /Available — confirmed/);
});

test("read-only SQL correction preserves records, writer definitions and reader grants", async (t) => {
  const db = await createTestDatabase({
    throughMigration: "20261117010000_project_sample_plot_reference.sql",
  });
  t.after(() => db.close());
  await seedGisFixtures(db);
  await gisLogin(db);
  const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.result;
  const snapshot = () => scalar(`select jsonb_build_object(
    'lots',(select jsonb_agg(to_jsonb(l) order by lot_id) from public.lot l),
    'areas',(select jsonb_agg(to_jsonb(a) order by area_id) from public.area a),
    'writers',(select jsonb_agg(pg_get_functiondef(oid) order by proname,oid) from pg_proc
      where pronamespace='public'::regnamespace and
      (proname like 'staff_save%' or proname like 'staff_verify%' or proname like 'staff_publish%')),
    'grants',(select jsonb_agg(jsonb_build_object('name',proname,'acl',proacl::text) order by proname)
      from pg_proc where pronamespace='public'::regnamespace and proname in
      ('staff_dashboard_data','staff_dashboard_counts','staff_plot_management',
       'staff_coordinate_verification','staff_gis_readiness'))
  ) result`);
  const before = await snapshot();
  await gisLogin(db, gisActors.admin, "postgres");
  await db.exec(readFileSync(new URL(
    "../supabase/migrations/20261117020000_separate_synthetic_plot_inventory.sql", import.meta.url), "utf8"));
  await gisLogin(db);
  assert.deepEqual(await snapshot(), before);
  const dashboard = () => scalar("select public.staff_dashboard_data() result");
  const coordinates = () => scalar("select public.staff_coordinate_verification() result");
  const gis = () => scalar("select public.staff_gis_readiness(1,1) result");
  const counts = () => scalar("select public.staff_dashboard_counts() result");
  const baseline = { dashboard: await dashboard(), coordinates: await coordinates(),
    gis: await gis(), counts: await counts() };
  const codes = ["a", "b", "c"].map((c) => "P2S-" + c.repeat(64));
  for (const [index, code] of codes.entries()) {
    await scalar("select public.staff_save_record('lot',null,null,$1::jsonb,$2,'save') result",
      [JSON.stringify({ area_id: 1, lot_code: code, status: index === 1 ? "HOLD" : "AVAILABLE" }), randomUUID()]);
  }
  const plotPage = (state = "all", verification = "all") => scalar(
    "select public.staff_plot_management('P2S-','all',$1,$2) result", [state, verification]);
  await t.test("samples stay searchable while physical aggregates and verification queues stay unchanged", async () => {
    const actual = await dashboard();
    assert.deepEqual(actual.occupancy, baseline.dashboard.occupancy);
    assert.equal(actual.summary.needsVerification, baseline.dashboard.summary.needsVerification);
    assert.equal(actual.summary.syntheticPlots, 3);
    assert.ok(actual.verificationItems.every((row) => !codes.includes(row.plot)));
    const currentCounts = await counts();
    assert.equal(currentCounts.syntheticPlots, 3);
    const physicalCounts = { ...currentCounts, syntheticPlots: 0 };
    assert.deepEqual(physicalCounts, baseline.counts);
    assert.deepEqual(await coordinates(), baseline.coordinates);
    assert.deepEqual(await gis(), baseline.gis);
    const page = await plotPage();
    assert.equal(page.total, 3);
    assert.equal(page.summary.syntheticPlots, 3);
    assert.equal(page.summary.total, baseline.dashboard.occupancy.total);
  });
  await t.test("physical availability, occupancy and coordinate filters exclude sample rows", async () => {
    for (const state of ["available", "occupied", "hold", "unknown", "booked"]) {
      assert.equal((await plotPage(state)).total, 0);
    }
    for (const verification of ["missing", "pending", "verified", "rejected"]) {
      assert.equal((await plotPage("all", verification)).total, 0);
    }
  });
  await t.test("existing authorized staff can read; anonymous and inactive users remain denied", async () => {
    await gisLogin(db, gisActors.manager);
    assert.equal((await plotPage()).total, 3);
    await gisLogin(db, null, "anon");
    for (const reader of [dashboard, counts, coordinates, gis, plotPage]) {
      await assert.rejects(reader(), /permission|staff/i);
    }
    await gisLogin(db, gisActors.inactive);
    await assert.rejects(dashboard(), /staff/i);
  });
});
