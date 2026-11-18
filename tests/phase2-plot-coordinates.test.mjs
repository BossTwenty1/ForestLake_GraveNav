import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

function load(file, dependencies = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL("../" + file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "exports", compiled)(name => {
    assert.ok(name in dependencies, "Unexpected dependency " + name);
    return dependencies[name];
  }, loaded.exports);
  return loaded.exports;
}
const { validatePlotCoordinates } = load("src/lib/phase2-plot-coordinates.ts");
const geometrySha256 = "a".repeat(64);
const targets = Array.from({ length: 4494 }, (_, i) => ({ id: "lawn:" + i, properties: { instance_path: "OLD/" + i } }));
const reference = { instancePath: "OLD/0", lpcsInstancePath: "14106/14225/1", gridInstancePath: "10636/18629/1",
  lpcsCenter: [20050.25, 18660.5], gridCenter: [580400.125, 1451660.75] };
function fixture() {
  return { format: "gravenav-plot-coordinate-references-v1", status: "cad-reference-only", sourceDatum: "unresolved",
    geographicApproved: false, coordinateUnits: "source-drawing-units", targetDataSha256: geometrySha256, candidateCount: 4494,
    sourceHashes: { lpcs: "c34847dff62d973d276883c2d683a94453a274924e6379deab7531af9d8fb22c",
      grid: "27090b58f56453429c8df661197142c7a3df45b659991656e485643f064f0964", controlEvidence: "b".repeat(64) },
    alignment: { controlPairCount: 7, maxCentroidResidualUnits: 0, maxLocalPolygonResidualUnits: 1e-9, maxGridPolygonResidualUnits: 1e-8 },
    entries: Object.fromEntries(targets.map(t => [t.id, { ...structuredClone(reference), instancePath: t.properties.instance_path }])),
  };
}

test("Every coordinate reference retains its exact candidate and source identity", () => {
  const value = fixture();
  assert.equal(validatePlotCoordinates(value, geometrySha256, targets), value);
});

test("Foreign, incomplete, nonfinite or relabelled coordinate references fail closed", () => {
  for (const change of [
    v => { v.targetDataSha256 = "c".repeat(64); },
    v => { v.geographicApproved = true; },
    v => { v.sourceDatum = "WGS84"; },
    v => { v.sourceHashes.lpcs = "d".repeat(64); },
    v => { v.sourceHashes.controlEvidence = ""; },
    v => { v.alignment.maxGridPolygonResidualUnits = 0.1; },
    v => { v.alignment.maxLocalPolygonResidualUnits = -1; },
    v => { v.alignment.maxCentroidResidualUnits = Infinity; },
    v => { delete v.entries["lawn:0"]; },
    v => { v.entries["lawn:0"].instancePath = "another candidate"; },
    v => { v.entries["lawn:0"].gridCenter = [NaN, 1]; },
    v => { v.entries["lawn:0"].lpcsCenter = [1, 2, 3]; },
    v => { v.entries["lawn:0"].lpcsInstancePath = ""; },
  ]) {
    const value = fixture(); change(value);
    assert.throws(() => validatePlotCoordinates(value, geometrySha256, targets), /coordinate references do not match/);
  }
});

test("Coordinate disclosure shows CAD centres without offering unverified GPS directions", () => {
  const { PlotCoordinateDetails } = load("src/components/visitor/plot-coordinate-details.tsx", {
    "react/jsx-runtime": jsx, "./plot-coordinate-details.module.css": { default: { coordinates: "coordinates" } },
  });
  const html = renderToStaticMarkup(jsx.jsx(PlotCoordinateDetails, { reference }));
  assert.match(html, /Plot coordinates/);
  assert.match(html, /20050\.250/);
  assert.match(html, /1451660\.750/);
  assert.match(html, /not a verified GPS location or walking destination/);
  assert.match(html, /Source datum unresolved/);
  assert.doesNotMatch(html, /<a |latitude|longitude|google|navigator|geolocation/i);
});

const coordinatesUrl = new URL("../public/phase2-planning/plot-coordinates.json", import.meta.url);
test("Installed coordinate references cover all original candidates with the pinned data hash", { skip: !existsSync(coordinatesUrl) }, () => {
  const raw = readFileSync(coordinatesUrl);
  const dataBytes = readFileSync(new URL("../public/phase2-viewer/data/phase2.local.json", import.meta.url));
  const hash = bytes => createHash("sha256").update(bytes).digest("hex");
  assert.equal(hash(dataBytes), "02a4dba490872f9be8cf56280ccf432d31796431c1f808f542fbff86ac28ca77");
  const source = JSON.parse(dataBytes);
  const value = validatePlotCoordinates(JSON.parse(raw), hash(dataBytes), [...source.layers.lawn, ...source.layers.estates]);
  assert.equal(Object.keys(value.entries).length, 4494);
  const loader = readFileSync(new URL("../src/lib/phase2-planning.ts", import.meta.url), "utf8");
  assert.ok(loader.includes(`coordinates: "${hash(raw)}"`));
  assert.doesNotMatch(raw.toString("utf8"), /latitude|longitude|centreLonLat/);
});
