import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const compiled = ts.transpileModule(readFileSync(new URL("../src/lib/phase2-cad-details.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
new Function("exports", compiled)(loaded.exports);
const { validateCadDetails, cadDetailRoles } = loaded.exports;
const dataDigest = "a".repeat(64);
const fixture = () => ({
  format: "gravenav-cad-details-v1",
  coordinateSystem: { type: "local-cartesian", georeferenced: false },
  targetDataSha256: dataDigest, candidateCount: 4494, parkingBayCount: 81,
  bounds: [0, 0, 300, 300], alignment: { maxResidualUnits: 0.00001 },
  sourceFiles: [{ sha256: "c34847dff62d973d276883c2d683a94453a274924e6379deab7531af9d8fb22c" }],
  layers: Object.fromEntries(cadDetailRoles.map(role => [role, {
    image: `${role}.${"b".repeat(12)}.svg`, sha256: "b".repeat(64), bytes: 1024, features: 1,
  }])),
  labels: ["A", "B", "C", "D", "A"].map((name, i) => ({ id: "section-" + i, name, kind: "section", cadXY: [50 + i, 100] })),
});

test("Aligned CAD details remain a separate unreferenced planning layer", () => {
  const data = fixture();
  assert.equal(validateCadDetails(data, dataDigest), data);
  assert.equal(data.coordinateSystem.georeferenced, false);
});

test("Details from another geometry, source or coordinate frame are rejected", () => {
  for (const change of [
    data => { data.targetDataSha256 = "c".repeat(64); },
    data => { data.sourceFiles = []; },
    data => { data.sourceFiles = [null]; },
    data => { data.candidateCount = 4493; },
    data => { data.coordinateSystem.georeferenced = true; },
    data => { data.alignment.maxResidualUnits = 0.1; },
    data => { data.alignment.maxResidualUnits = NaN; },
    data => { data.bounds = [300, 0, 0, 300]; },
  ]) {
    const data = fixture(); change(data);
    assert.throws(() => validateCadDetails(data, dataDigest), /CAD detail layers do not match/);
  }
});

test("Only the versioned local SVG assets and finite distinct labels can load", () => {
  for (const change of [
    data => { data.layers.site.image = "../../foreign.svg"; },
    data => { delete data.layers.paths; },
    data => { data.labels[0].cadXY[0] = Infinity; },
    data => { data.labels[1].id = data.labels[0].id; },
    data => { data.labels[0].kind = "gps"; },
  ]) {
    const data = fixture(); change(data);
    assert.throws(() => validateCadDetails(data, dataDigest), /CAD detail layers do not match/);
  }
});
