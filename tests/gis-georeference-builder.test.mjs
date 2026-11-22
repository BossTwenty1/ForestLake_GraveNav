import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  evaluateGeoreferencing,
  fitAffine2D,
  fitSimilarity2D,
  gridZone4ReferenceToWgs84,
  haversineMeters,
  utm51NToWgs84,
  wgs84ToUtm51N,
} from "../scripts/gis/georeference.mjs";
import { buildPhaseTwoPackage, loadControlPointObservations } from "../scripts/gis/build-phase2-package.mjs";

test("WGS84 <-> UTM Zone 51N projection round-trips within 1 mm across Albay", () => {
  const samples = [
    [123.7335123, 13.1391456],
    [123.7512345, 13.1489012],
    [123.6987654, 13.1200001],
  ];
  for (const [lon, lat] of samples) {
    const [e, n] = wgs84ToUtm51N(lon, lat);
    assert.ok(e > 550000 && e < 620000, `Unexpected easting ${e}`);
    assert.ok(n > 1440000 && n < 1470000, `Unexpected northing ${n}`);
    const [lon2, lat2] = utm51NToWgs84(e, n);
    const errM = haversineMeters([lon, lat], [lon2, lat2]);
    assert.ok(errM < 0.001, `Round-trip error ${errM}m exceeded 1 mm`);
  }
});

test("PRS92 and Luzon 1911 Zone IV reference conversions differ by ~8-9m in Albay", () => {
  const prs = gridZone4ReferenceToWgs84(580326.88, 1451631.51, "EPSG:3124");
  const luz = gridZone4ReferenceToWgs84(580326.88, 1451631.51, "EPSG:25394");
  const sep = haversineMeters(prs, luz);
  assert.ok(prs[0] > 123 && prs[0] < 124 && prs[1] > 13 && prs[1] < 14);
  assert.ok(sep > 6 && sep < 12, `Expected ~8.5 m datum separation, got ${sep.toFixed(2)} m`);
});

test("Similarity and affine solvers fit accurately and keep validation points independent", () => {
  const baseE = 580000;
  const baseN = 1451500;
  const angle = 0.25;
  const scale = 1.0;
  const truth = ([x, y]) => [
    baseE + scale * (x * Math.cos(angle) - y * Math.sin(angle)),
    baseN + scale * (x * Math.sin(angle) + y * Math.cos(angle)),
  ];

  const gcpCoords = [[10, 10], [200, 15], [190, 180], [20, 170], [110, 95]];
  const valCoords = [[60, 50], [150, 140]];

  const gcpPoints = gcpCoords.map(([cadX, cadY], i) => {
    const [longitude, latitude] = utm51NToWgs84(...truth([cadX, cadY]));
    return { pointCode: `GCP-0${i + 1}`, cadX, cadY, longitude, latitude };
  });
  const validationPoints = valCoords.map(([cadX, cadY], i) => {
    const [longitude, latitude] = utm51NToWgs84(...truth([cadX, cadY]));
    return { pointCode: `VAL-0${i + 1}`, cadX, cadY, longitude, latitude };
  });

  const sim = evaluateGeoreferencing({ gcpPoints, validationPoints, method: "similarity" });
  assert.ok(sim.metrics.fittingMaxM < 0.01);
  assert.ok(sim.metrics.validationMaxM < 0.01);

  const aff = evaluateGeoreferencing({ gcpPoints, validationPoints, method: "affine" });
  assert.ok(aff.metrics.fittingMaxM < 0.01);
  assert.ok(aff.metrics.validationMaxM < 0.01);

  assert.equal(fitSimilarity2D([{ source: [0, 0], target: [1, 2] }, { source: [1, 0], target: [2, 2] }]).parameters.scale, 1);
  assert.equal(fitAffine2D([
    { source: [0, 0], target: [5, 7] },
    { source: [1, 0], target: [6, 7] },
    { source: [0, 1], target: [5, 8] },
  ]).apply([2, 3])[0], 7);
});

test("buildPhaseTwoPackage builds a validated schema_version 2 multi-area package and rejects imagery by default", async (t) => {
  const workDir = await mkdtemp(join(tmpdir(), "gravenav-phase2-builder-"));
  t.after(() => rm(workDir, { recursive: true, force: true }));

  const templateCsv = await readFile(new URL("../docs/gis/phase2-control-points.csv", import.meta.url), "utf8");
  const lines = templateCsv.trim().split(/\r?\n/);
  const headers = lines[0].split(",");
  const idx = (name) => headers.indexOf(name);

  // Fill synthetic test observations using the PRS92 reference columns to test the full pipeline deterministically
  function makeFilledCsv(sourceMethod, perturbValMeters = 0) {
    const out = [lines[0]];
    for (const line of lines.slice(1)) {
      const cols = [];
      let field = ""; let inQ = false;
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (inQ) { if (ch === '"' && line[i + 1] === '"') { field += '"'; i += 1; } else if (ch === '"') inQ = false; else field += ch; }
        else if (ch === '"') inQ = true;
        else if (ch === ",") { cols.push(field); field = ""; }
        else field += ch;
      }
      cols.push(field);
      const isVal = cols[idx("role")] === "VALIDATION";
      const lat = Number(cols[idx("ref_if_prs92_lat_NOT_FOR_NAV")]) + (isVal ? perturbValMeters / 111320 : 0);
      const lng = Number(cols[idx("ref_if_prs92_lng_NOT_FOR_NAV")]);
      cols[idx("source_method")] = sourceMethod;
      cols[idx("observed_lat")] = lat.toFixed(7);
      cols[idx("observed_lng")] = lng.toFixed(7);
      cols[idx("reported_accuracy_m")] = "1.2";
      cols[idx("captured_at")] = "2026-11-22T01:00:00.000Z";
      cols[idx("device_reference")] = "synthetic-test-gnss";
      cols[idx("operator_reference")] = "test-suite";
      out.push(cols.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(","));
    }
    return `${out.join("\n")}\n`;
  }

  const imageryCsvPath = join(workDir, "imagery.csv");
  const fieldCsvPath = join(workDir, "field.csv");
  const badCsvPath = join(workDir, "bad.csv");
  await writeFile(imageryCsvPath, makeFilledCsv("imagery_reference"), "utf8");
  await writeFile(fieldCsvPath, makeFilledCsv("field_survey"), "utf8");
  await writeFile(badCsvPath, makeFilledCsv("field_survey", 15), "utf8");

  const parsed = loadControlPointObservations(await readFile(fieldCsvPath, "utf8"));
  assert.equal(parsed.length, 20);
  assert.equal(parsed.filter((p) => p.role === "GCP").length, 15);
  assert.equal(parsed.filter((p) => p.role === "VALIDATION").length, 5);

  // Build crosswalk with 65 lots spanning 3 approved areas (tests scaling past v1 50-lot limit)
  const crosswalkPath = join(workDir, "crosswalk.json");
  const lots = Array.from({ length: 65 }, (_, i) => ({
    lotId: String(1000 + i),
    areaId: i < 25 ? "2" : i < 50 ? "3" : "4",
    cadCandidateId: i < 55 ? `lawn:${i + 1}` : `estates:${i - 54}`,
  }));
  await writeFile(crosswalkPath, JSON.stringify({
    siteId: "1",
    releaseCode: "PHASE2-TEST-V2",
    title: "Synthetic Phase 2 Multi-Area Test Build",
    lots,
  }, null, 2));

  // 1. Imagery reference without explicit rehearsal flag MUST fail
  await assert.rejects(
    buildPhaseTwoPackage({ gcpCsvPath: imageryCsvPath, crosswalkPath, outDir: join(workDir, "pkg-img-fail") }),
    /non-field_survey/,
  );

  // 2. Excess held-out validation error (> 3.0 m) MUST fail
  await assert.rejects(
    buildPhaseTwoPackage({ gcpCsvPath: badCsvPath, crosswalkPath, outDir: join(workDir, "pkg-err-fail") }),
    /exceeds tolerance/,
  );

  // 3. Rehearsal build succeeds offline validation but marks fieldSurveyApproved = false
  const rehearsal = await buildPhaseTwoPackage({
    gcpCsvPath: imageryCsvPath,
    crosswalkPath,
    outDir: join(workDir, "pkg-rehearsal"),
    allowImageryRehearsal: true,
  });
  assert.equal(rehearsal.fieldSurveyApproved, false);
  assert.equal(rehearsal.offlineValidation.valid, true, JSON.stringify(rehearsal.offlineValidation));

  // 4. Field-survey build succeeds offline validation, builds full connected walkway graph, and passes schema_version 2
  const result = await buildPhaseTwoPackage({
    gcpCsvPath: fieldCsvPath,
    crosswalkPath,
    outDir: join(workDir, "pkg-field"),
  });
  assert.equal(result.fieldSurveyApproved, true);
  assert.equal(result.offlineValidation.valid, true, JSON.stringify(result.offlineValidation));
  assert.equal(result.offlineValidation.counts["grave_plots.geojson"], 65);
  assert.equal(result.offlineValidation.counts["garden_sections.geojson"], 3);
  assert.ok(result.graph.nodes >= 100 && result.graph.edges >= 100);
  assert.ok(result.georeferencing.validationMaxM < 0.5);
});
