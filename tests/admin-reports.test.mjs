import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

function load(path, dependencies = {}) {
  const source = readFileSync(new URL("../src/lib/" + path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", code)(
    (name) => {
      assert.ok(name in dependencies, "Unexpected dependency " + name);
      return dependencies[name];
    }, loaded, loaded.exports,
  );
  return loaded.exports;
}

const { buildReport } = load("admin-reports.ts", { "./synthetic-plots": load("synthetic-plots.ts") });
const { csvCell } = load("csv.ts");
const now = new Date("2025-12-31T16:00:00Z");
const area = [{ area_id: 1, area_name: "Garden A" }, { area_id: 2, area_name: "Garden B" }];
const plot = (id, values = {}) => ({
  lot_id: id, lot_code: "PLOT-" + id, area_id: 1, status: "HOLD",
  deleted_at: null, location_geom: null, coordinate_status: "pending", coordinate_verified: false,
  ...values,
});
const interment = (id, lotId, values = {}) => ({
  burial_id: id, lot_id: lotId, record_status: "pending", interment_date: "2026-01-01",
  interment_confirmed: false, remains_type: "FRESH", public_display: true,
  deceased: { display_name: "Record " + id }, ...values,
});
const phase2Code = (index) => "P2S-" + index.toString(16).padStart(64, "0");

test("Phase 2 records and plots reconcile into total, occupied, shared, and period counts", () => {
  const lots = [
    ...Array.from({ length: 10 }, (_, i) => plot(i + 1, { status: "AVAILABLE" })),
    ...Array.from({ length: 90 }, (_, i) => plot(i + 11, {
      area_id: 2, lot_code: phase2Code(i), status: "AVAILABLE",
    })),
  ];
  const interments = Array.from({ length: 100 }, (_, i) => interment(i + 1, 11 + (i % 90), {
    record_status: i < 80 ? "active" : "pending",
    interment_confirmed: i < 80,
    public_display: i < 90,
  }));
  const plotReferences = { 11: "Garden B · Blk 1 · Lot 1" };
  const report = buildReport({ areas: area, lots, interments, plotReferences }, {}, now);
  assert.equal(report.year, "all");
  assert.deepEqual(report.plots, { total: 100, occupied: 90, shared: 10 });
  assert.deepEqual(report.plotStatuses, { occupied: 90, available: 10, booked: 0, hold: 0, unknown: 0, other: 0 });
  assert.equal(
    report.activity.active + report.activity.pending + report.activity.archived,
    report.activity.records,
  );
  assert.equal(report.activity.records, 100);
  assert.equal(report.activity.active, 80);
  assert.equal(report.activity.pending, 20);
  assert.equal(report.activity.publicVisible, 90);
  assert.equal(report.activity.hiddenStaffOnly, 10);
  assert.deepEqual(report.months[0], { label: "Jan", active: 80, pending: 20 });
  assert.equal(report.gardens[1].totalPlots, 90);
  assert.equal(report.gardens[1].occupiedPlots, 90);
  assert.equal(report.exportRows[0][2], "Garden B · Blk 1 · Lot 1");
  assert.equal(report.exportRows[1][2], "Plot #12");
});

test("year and area filters reconcile active, pending, archived, and export rows", () => {
  const lots = [
    plot(1, { status: "AVAILABLE" }),
    plot(2, { area_id: 2, status: "BOOKED" }),
    plot(3, { status: "UNKNOWN" }),
    plot(4, { deleted_at: "2026-01-01" }),
    plot(5, { lot_code: phase2Code(1), status: "AVAILABLE" }),
  ];
  const active = { record_status: "active", interment_confirmed: true, public_display: true };
  const interments = [
    interment(1, 1, active),
    interment(2, 1, { ...active, interment_date: "2026-02-02" }),
    interment(3, 2, active),
    interment(4, 1, { ...active, interment_date: "2025-01-01" }),
    interment(5, 1, { ...active, record_status: "archived", public_display: true }),
    interment(6, 5, active),
    interment(7, 3, { interment_date: null, record_status: "pending", public_display: false }),
  ];
  const source = { areas: area, lots, interments };
  const report = buildReport(source, { area: "1", year: "2026" }, now);
  assert.equal(report.year, "2026");
  assert.deepEqual(report.plots, { total: 3, occupied: 3, shared: 1 });
  assert.equal(report.activity.records, 4);
  assert.equal(report.activity.active, 3);
  assert.equal(report.activity.archived, 1);
  assert.equal(report.activity.publicVisible, 3);
  assert.equal(report.activity.undated, 1);
  assert.deepEqual(report.months.slice(0, 2).map((m) => m.active), [2, 1]);
  assert.equal(report.gardens.length, 1);
  assert.deepEqual(report.exportRows.map((row) => row[0]), [1, 2, 5, 6]);
  assert.deepEqual(
    buildReport(source, { area: "1", year: "all" }, now).exportRows.map((row) => row[0]),
    [1, 2, 4, 5, 6, 7],
  );
  assert.equal(buildReport(source, { year: "2025" }, now).activity.active, 1);
});

test("empty datasets and invalid filters resolve cleanly", () => {
  const report = buildReport({ areas: [], lots: [], interments: [] }, { year: ["2025"], area: "99" }, now);
  assert.equal(report.year, "all");
  assert.equal(report.area, undefined);
  assert.equal(report.months.length, 12);
  assert.equal(report.activity.records, 0);
  assert.deepEqual(report.exportRows, []);
});

test("CSV preserves quotes, delimiters and line breaks and escapes leading formulas", () => {
  assert.equal(csvCell('Test, "Clerk"\nExample'), '"Test, ""Clerk""\nExample"');
  assert.equal(csvCell(" \t=1+1"), "\"' \t=1+1\"");
  assert.equal(csvCell("@formula"), "\"'@formula\"");
  assert.equal(csvCell(null), '""');
});
