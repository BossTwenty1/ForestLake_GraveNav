import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

function load(path, dependencies = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  const exports = {};
  new Function("exports", "require", outputText)(exports, (name) => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  });
  return exports;
}

const { focusPublishedStaffPlot, parseStaffPlotId, plotMapUnavailable, safePlotMapReturn, staffPlotMapHref } =
  load("../src/lib/plot-map.ts", { "./synthetic-plots": load("../src/lib/synthetic-plots.ts") });
const scope = { siteId: "1", areaId: "2" };
const plot = { lotId: 3, lotCode: "FIXTURE-ONLY", areaId: 2, coordinatesVerified: true };
// Fixture geometry never leaves this test.
const geometry = { type: "Polygon", coordinates: [[[1, 1], [2, 1], [2, 2], [1, 1]]] };
const target = { type: "Feature", id: "approved-outline", geometry, properties: {
  lotId: "3", lotCode: "FIXTURE-ONLY", areaId: "2",
} };
const unrelatedPlot = { ...target, id: "unrelated-outline", properties: { ...target.properties, lotId: "4" } };
const geography = { state: "ready", data: {
  releaseId: "fixture-release", scopeRevision: 1, target: unrelatedPlot, accessPoint: { id: "access" },
  navigationPolicy: { approved: true },
  layers: { plots: [unrelatedPlot, target], boundaries: [], walkways: [], access_points: [{}],
    nodes: [{}], edges: [{}], landmarks: [{}] },
} };

test("Staff map uses one exact positive lot ID and preserves the plot directory filters", () => {
  const query = { query: "Garden C & D", area: "2", state: "hold", verification: "verified",
    sort: "plot", direction: "asc", page: 2, pageSize: 25 };
  const route = new URL(staffPlotMapHref(3, query), "http://fixture.test");
  assert.equal(route.pathname, "/admin/cemetery-map");
  assert.equal(parseStaffPlotId(route.searchParams.get("plot")), 3);
  const back = "/admin/plot-management?query=Garden+C+%26+D&area=2&state=hold&verification=verified&sort=plot&direction=asc&page=3&pageSize=25";
  assert.equal(safePlotMapReturn(route.searchParams.get("returnTo")), back);
  assert.equal(safePlotMapReturn(back + "&extra=anything#other"), back);
  for (const id of ["", "002", "0", "-3", "3.5", "1e3", "9007199254740992", ["3", "4"], null]) {
    assert.equal(parseStaffPlotId(id), null);
  }
  for (const url of ["//elsewhere.test/admin/plot-management", "https://elsewhere.test/admin/plot-management",
    "/admin/cemetery-map", "javascript:alert(1)", [back, back]]) {
    assert.equal(safePlotMapReturn(url), "/admin/plot-management");
  }
});

test("Staff highlight uses one exact approved plot outline and removes navigation data", () => {
  const map = focusPublishedStaffPlot(plot, scope, geography);
  assert.equal(map.target, target);
  assert.deepEqual(map.layers.plots, [target]);
  for (const layer of ["access_points", "nodes", "edges", "landmarks"]) assert.deepEqual(map.layers[layer], []);
  assert.equal(map.accessPoint, null);
  assert.equal(map.navigationPolicy, undefined);
});

test("Unconfigured, unverified and synthetic plots cannot become map targets", () => {
  assert.match(plotMapUnavailable(plot, null), /not configured/);
  assert.match(plotMapUnavailable({ ...plot, coordinatesVerified: false }, scope), /no verified/);
  const synthetic = { ...plot, lotCode: "P2S-" + "a".repeat(64) };
  assert.match(plotMapUnavailable(synthetic, scope), /no physical map position/);
  assert.equal(focusPublishedStaffPlot(synthetic, scope, geography), null);
  assert.equal(focusPublishedStaffPlot(plot, null, geography), null);
  assert.equal(focusPublishedStaffPlot({ ...plot, coordinatesVerified: false }, scope, geography), null);
});

test("An adjacent, unapproved, mismatched or ambiguous outline is never selected", () => {
  for (const selection of [{ ...plot, lotId: 99 }, { ...plot, lotCode: "OTHER" }, { ...plot, areaId: 4 }]) {
    assert.equal(focusPublishedStaffPlot(selection, scope, geography), null);
  }
  assert.equal(focusPublishedStaffPlot(plot, scope, { state: "no_published_release", data: null }), null);
  for (const plots of [[target, target], [{ ...target, geometry: { type: "Point", coordinates: [1, 1] } }]]) {
    const result = { ...geography, data: { ...geography.data, layers: { ...geography.data.layers, plots } } };
    assert.equal(focusPublishedStaffPlot(plot, scope, result), null);
  }
});

test("Multi-area Phase 2 scope accepts plots in any configured approved area and still rejects foreign areas", () => {
  const multiScope = { siteId: "1", areaId: "2", areaIds: ["2", "3", "4"] };
  const plotInArea3 = { lotId: 30, lotCode: "AREA3-LOT", areaId: 3, coordinatesVerified: true };
  const target3 = { type: "Feature", id: "outline-3", geometry, properties: { lotId: "30", lotCode: "AREA3-LOT", areaId: "3" } };
  const multiGeo = { ...geography, data: { ...geography.data, layers: { ...geography.data.layers, plots: [target, target3] } } };
  assert.equal(plotMapUnavailable(plotInArea3, multiScope), null);
  assert.equal(focusPublishedStaffPlot(plotInArea3, multiScope, multiGeo)?.target, target3);
  assert.match(plotMapUnavailable({ ...plotInArea3, areaId: 9 }, multiScope), /outside the approved/);
});

