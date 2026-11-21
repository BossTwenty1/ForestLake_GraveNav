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
  lot_id: id, lot_code: "PHYSICAL-" + id, area_id: 1, status: "HOLD",
  deleted_at: null, location_geom: null, coordinate_status: "pending", coordinate_verified: false,
  ...values,
});
const interment = (id, lotId, values = {}) => ({
  burial_id: id, lot_id: lotId, record_status: "pending", interment_date: "2026-01-01",
  interment_confirmed: false, deceased: { display_name: "Fixture " + id }, ...values,
});
const syntheticCode = (index) => "P2S-" + index.toString(16).padStart(64, "0");

test("the synthetic admission set never changes confirmed physical, availability or coordinate counts", () => {
  const lots = [
    ...Array.from({ length: 4494 }, (_, i) => plot(i + 1)),
    ...Array.from({ length: 90 }, (_, i) => plot(i + 4495, {
      area_id: 2, lot_code: syntheticCode(i), status: "AVAILABLE",
      location_geom: {}, coordinate_status: "verified", coordinate_verified: true,
    })),
  ];
  const interments = Array.from({ length: 100 }, (_, i) => interment(i + 1, 4495 + i % 90));
  const report = buildReport({ areas: area, lots, interments }, {}, now);
  assert.equal(report.year, "2026", "default year must change at Manila midnight");
  assert.deepEqual(report.plots, { physical: 4494, synthetic: 90 });
  assert.deepEqual(report.plotStatuses, { hold: 4494, booked: 0, available: 0, unknown: 0, other: 0 });
  assert.deepEqual(report.coordinates, { verified: 0, pending: 0, rejected: 0, missing: 4494 });
  assert.deepEqual(report.activity, { records: 100, confirmed: 0, pending: 100, synthetic: 100, undated: 0 });
  assert.deepEqual(report.months[0], { label: "Jan", confirmed: 0, pending: 100 });
  assert.equal(report.gardens[1].synthetic, 90);
  assert.equal(report.gardens[1].physical, 0);
});

test("month and area filters keep archived, removed-lot, synthetic and legacy null-confirmation rows out of confirmed totals", () => {
  const lots = [
    plot(1, { location_geom: {}, coordinate_status: "verified", coordinate_verified: true }),
    plot(2, { area_id: 2, status: "BOOKED", location_geom: {}, coordinate_status: "rejected" }),
    plot(3, { status: "UNKNOWN", location_geom: {}, coordinate_status: "verified" }),
    plot(4, { deleted_at: "2026-01-01" }),
    plot(5, { lot_code: syntheticCode(1), status: "AVAILABLE" }),
  ];
  const confirmed = { record_status: "active", interment_confirmed: true };
  const interments = [
    interment(1, 1, confirmed),
    interment(2, 1, { ...confirmed, interment_date: "2026-02-02" }),
    interment(3, 2, confirmed),
    interment(4, 1, { ...confirmed, interment_date: "2025-01-01" }),
    interment(5, 1, { ...confirmed, interment_confirmed: null }),
    interment(6, 1, { ...confirmed, record_status: "archived" }),
    interment(7, 1, { interment_confirmed: true }),
    interment(8, 4, confirmed),
    interment(9, 5, confirmed),
    interment(10, 3, { interment_date: null }),
  ];
  const source = { areas: area, lots, interments };
  const report = buildReport(source, { area: "1", year: "2026" }, now);
  assert.deepEqual(report.coordinates, { verified: 1, pending: 1, rejected: 0, missing: 0 });
  assert.deepEqual(report.activity, { records: 7, confirmed: 2, pending: 1, synthetic: 1, undated: 1 });
  assert.deepEqual(report.months.slice(0, 2).map((m) => m.confirmed), [1, 1]);
  assert.equal(report.gardens.length, 1);
  assert.equal(report.gardens[0].confirmed, 2);
  assert.deepEqual(report.exportRows.map((row) => row[0]), [1, 2, 5, 6, 7, 8, 9]);
  assert.deepEqual(
    buildReport(source, { area: "1", year: "all" }, now).exportRows.map((row) => row[0]),
    [1, 2, 4, 5, 6, 7, 8, 9, 10],
  );
  assert.equal(buildReport(source, { year: "2025" }, now).plots.physical, 3);
  assert.equal(buildReport(source, { year: "2025" }, now).activity.confirmed, 1);
});

test("empty datasets and invalid page filters resolve to an empty current-year report", () => {
  const report = buildReport({ areas: [], lots: [], interments: [] }, { year: ["2025"], area: "99" }, now);
  assert.equal(report.year, "2026");
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
