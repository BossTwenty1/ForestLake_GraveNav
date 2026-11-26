import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildPhaseTwoPackage, loadControlPointObservations } from "../scripts/gis/build-phase2-package.mjs";
import { cadDetailRoles, validateCadDetails } from "../src/lib/phase2-cad-details.ts";
import { validatePlotCoordinates } from "../src/lib/phase2-plot-coordinates.ts";

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

const manifestUrl = new URL("../public/phase2-planning/cad-details/manifest.json", import.meta.url);
test("Installed local detail assets keep the original plot geometry and verified hashes", () => {
  const manifest = JSON.parse(readFileSync(manifestUrl, "utf8"));
  const sourceUrl = new URL("../public/phase2-viewer/data/phase2.local.json", import.meta.url);
  const digest = bytes => createHash("sha256").update(bytes).digest("hex");
  const bytes = readFileSync(sourceUrl);
  assert.equal(digest(bytes), "02a4dba490872f9be8cf56280ccf432d31796431c1f808f542fbff86ac28ca77");
  validateCadDetails(manifest, digest(bytes));
  const original = JSON.parse(bytes);
  assert.equal(original.layers.lawn.length + original.layers.estates.length, 4494);
  for (const role of cadDetailRoles) {
    const asset = readFileSync(new URL(manifest.layers[role].image, manifestUrl));
    assert.equal(digest(asset), manifest.layers[role].sha256);
    assert.equal(asset.length, manifest.layers[role].bytes);
    assert.doesNotMatch(asset.toString("utf8"), /<script|<foreignObject|(?:href|src)=["']https?:/i);
  }
});

const coordinatesUrl = new URL("../public/phase2-planning/plot-coordinates.json", import.meta.url);
test("Installed coordinate references cover all original candidates with the pinned data hash", () => {
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

test("Wayfinding labels cover parking and six compact lights follow the existing walkway centreline", () => {
  const manifest = JSON.parse(readFileSync(manifestUrl));
  const parking = manifest.labels.filter(label => label.name === "Parking");
  const instances = parking.flatMap(label => label.sourcePaths);
  assert.equal(instances.length, 81);
  assert.equal(new Set(instances).size, 81);
  assert.ok(manifest.labels.some(label => label.name === "Walkway"));
  assert.equal(manifest.streetLights.length, 6);
  const landscape = JSON.parse(readFileSync(new URL("../public/phase2-viewer/landscape/manifest.json", import.meta.url)));
  const ends = landscape.pathways.find(path => path.id === "broad-pathwalk").provisionalEnds.map(pair => pair[0].map((n, i) => (n + pair[1][i]) / 2));
  const [a, b] = ends;
  for (const light of manifest.streetLights) {
    const [x, y] = light.displayCadXY;
    const cross = (x - a[0]) * (b[1] - a[1]) - (y - a[1]) * (b[0] - a[0]);
    assert.ok(Math.abs(cross) < 1e-7);
    assert.ok(light.centrelineOffsetUnits < 5);
  }
  const site = readFileSync(new URL(manifest.layers.site.image, manifestUrl), "utf8");
  assert.equal((site.match(/data-kind="street-light"/g) || []).length, 6);
});
