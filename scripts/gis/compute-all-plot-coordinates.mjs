#!/usr/bin/env node
/**
 * Computes WGS84 (EPSG:4326) and UTM Zone 51N (EPSG:32651) coordinates for all
 * 4,494 Phase 2 CAD plots directly from your observed Ground Control Points
 * (`docs/gis/phase2-control-points.csv`).
 *
 * Outputs into `--out-dir`:
 *  1. `phase2-all-plot-coordinates.csv`  — all 4,494 plot centers with section,
 *     CAD/LPCS coordinates, UTM 51N Easting/Northing, and WGS84 lat/lng.
 *  2. `phase2-all-plots.geojson`         — all 4,494 plot polygons in EPSG:4326
 *     (ready to inspect in QGIS or Google Earth Pro).
 *  3. `georeferencing-report.json`       — transform parameters, per-GCP fitting
 *     residuals (m), and independent held-out VALIDATION checkpoint errors (m).
 *
 * Never marks imagery_reference inputs as field-survey verified GPS.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { loadControlPointObservations } from "./build-phase2-package.mjs";
import { evaluateGeoreferencing } from "./georeference.mjs";

const DEFAULT_LOCAL_DATA = "public/phase2-viewer/data/phase2.local.json";
const DEFAULT_PLOT_COORDS = "public/phase2-planning/plot-coordinates.json";

const SECTION_NAMES = [
  "Butterfly Palm Garden B",
  "Butterfly Palm Garden A",
  "Majestic Palm Court C",
  "Majestic Palm Garden D",
  "Majestic Palm Garden A",
  "Majestic Palm Garden C",
];

function polygonCentroid(positions) {
  const ring = positions[0];
  let area = 0; let cx = 0; let cy = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    const cross = x1 * y2 - x2 * y1;
    area += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  area *= 0.5;
  return [cx / (6 * area), cy / (6 * area)];
}

function classifyDraftSections(lawn, estates) {
  const pts = lawn.map((f) => [(f.bounds[0] + f.bounds[2]) / 2, (f.bounds[1] + f.bounds[3]) / 2]);
  const parent = pts.map((_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent[rb] = ra; };
  const cell = 4.5;
  const buckets = new Map();
  pts.forEach(([x, y], i) => {
    const k = `${Math.floor(x / cell)}:${Math.floor(y / cell)}`;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(i);
  });
  pts.forEach(([x, y], i) => {
    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const list = buckets.get(`${gx + dx}:${gy + dy}`);
        if (!list) continue;
        for (const j of list) {
          if (j > i && Math.hypot(x - pts[j][0], y - pts[j][1]) <= 4.0) union(i, j);
        }
      }
    }
  });
  const comps = new Map();
  pts.forEach(([x, y], i) => {
    const r = find(i);
    if (!comps.has(r)) comps.set(r, { ids: [], sx: 0, sy: 0 });
    const c = comps.get(r);
    c.ids.push(i); c.sx += x; c.sy += y;
  });
  const anchors = [
    { sec: 0, x: 106.3, y: 160.0 },
    { sec: 1, x: 147.8, y: 151.9 },
    { sec: 3, x: 89.9, y: 46.4 },
    { sec: 4, x: 170.2, y: 75.4 },
    { sec: 5, x: 208.3, y: 88.6 },
  ];
  const map = new Map();
  for (const c of comps.values()) {
    const cx = c.sx / c.ids.length;
    const cy = c.sy / c.ids.length;
    if (c.ids.length > 2000) {
      for (const i of c.ids) map.set(lawn[i].id, SECTION_NAMES[pts[i][0] < 141.6 ? 3 : 4]);
    } else {
      let best = anchors[0];
      let bestD = Infinity;
      for (const a of anchors) {
        const dist = Math.hypot(cx - a.x, cy - a.y);
        if (dist < bestD) { bestD = dist; best = a; }
      }
      for (const i of c.ids) map.set(lawn[i].id, SECTION_NAMES[best.sec]);
    }
  }
  for (const f of estates) map.set(f.id, SECTION_NAMES[2]);
  return map;
}

function round7(n) {
  return Math.round(n * 1e7) / 1e7;
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function computeAllPlotCoordinates({
  gcpCsvPath,
  outDir,
  localDataPath = DEFAULT_LOCAL_DATA,
  plotCoordsPath = DEFAULT_PLOT_COORDS,
  method = "similarity",
  maxValidationErrorM = 3.0,
} = {}) {
  const [csvText, localData, plotCoords] = await Promise.all([
    readFile(resolve(gcpCsvPath), "utf8"),
    readFile(resolve(localDataPath), "utf8").then(JSON.parse),
    readFile(resolve(plotCoordsPath), "utf8").then(JSON.parse),
  ]);

  const points = loadControlPointObservations(csvText);
  const gcpPoints = points.filter((p) => p.role === "GCP");
  const validationPoints = points.filter((p) => p.role === "VALIDATION");
  if (gcpPoints.length < 3 || validationPoints.length < 1) {
    throw new Error(
      `Need at least 3 filled GCP rows and 1 filled VALIDATION row in ${gcpCsvPath} `
      + `(found ${gcpPoints.length} GCP, ${validationPoints.length} VALIDATION).`,
    );
  }

  const allFieldSurvey = points.every((p) => p.sourceMethod === "field_survey");
  const geo = evaluateGeoreferencing({ gcpPoints, validationPoints, method });
  const withinTolerance = geo.metrics.validationMaxM <= maxValidationErrorM;
  const verificationStatus = allFieldSurvey && withinTolerance
    ? "FIELD_SURVEY_CANDIDATE_PENDING_ADMIN_REVIEW"
    : allFieldSurvey
      ? "FIELD_SURVEY_EXCEEDS_TOLERANCE"
      : "IMAGERY_REFERENCE_DRAFT_NOT_FOR_NAVIGATION";

  const lawn = localData.layers.lawn;
  const estates = localData.layers.estates;
  const sectionById = classifyDraftSections(lawn, estates);
  const items = [...lawn, ...estates];

  const csvRows = [[
    "candidate_id",
    "plot_kind",
    "draft_garden_section",
    "instance_path",
    "cad_x",
    "cad_y",
    "lpcs_x",
    "lpcs_y",
    "utm51n_easting",
    "utm51n_northing",
    "latitude",
    "longitude",
    "verification_status",
  ].join(",")];

  const geoFeatures = [];
  const sectionCounts = {};

  for (const feature of items) {
    const ref = plotCoords.entries[feature.id];
    const centerCad = polygonCentroid(feature.shape.positions);
    const [utmE, utmN] = geo.cadToUtm51N(centerCad);
    const [lon, lat] = geo.cadToWgs84(centerCad);
    const section = sectionById.get(feature.id) || "Unclassified";
    const plotKind = feature.id.startsWith("estates:") ? "estate" : "lawn";
    sectionCounts[section] = (sectionCounts[section] || 0) + 1;

    csvRows.push([
      feature.id,
      plotKind,
      section,
      ref?.instancePath || "",
      centerCad[0].toFixed(4),
      centerCad[1].toFixed(4),
      ref ? ref.lpcsCenter[0].toFixed(4) : "",
      ref ? ref.lpcsCenter[1].toFixed(4) : "",
      utmE.toFixed(3),
      utmN.toFixed(3),
      lat.toFixed(7),
      lon.toFixed(7),
      verificationStatus,
    ].map(csvEscape).join(","));

    const ring = feature.shape.positions[0].map((pt) => {
      const [pLon, pLat] = geo.cadToWgs84(pt);
      return [round7(pLon), round7(pLat)];
    });
    if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
      ring.push([...ring[0]]);
    }

    geoFeatures.push({
      type: "Feature",
      id: feature.id,
      properties: {
        candidateId: feature.id,
        plotKind,
        draftGardenSection: section,
        centerLat: round7(lat),
        centerLng: round7(lon),
        verificationStatus,
        navigationApproved: false,
      },
      geometry: { type: "Polygon", coordinates: [ring] },
    });
  }

  const targetDir = resolve(outDir);
  await mkdir(targetDir, { recursive: true });

  const csvOut = resolve(targetDir, "phase2-all-plot-coordinates.csv");
  const geoOut = resolve(targetDir, "phase2-all-plots.geojson");
  const reportOut = resolve(targetDir, "georeferencing-report.json");

  const report = {
    generatedAt: new Date().toISOString(),
    sourceGcpCsv: resolve(gcpCsvPath),
    plotCount: items.length,
    sectionCounts,
    method: geo.method,
    allFieldSurvey,
    withinTolerance,
    maxValidationErrorM,
    verificationStatus,
    parameters: geo.parameters,
    metrics: geo.metrics,
    fittingResiduals: geo.fittingResiduals,
    validationResults: geo.validationResults,
  };

  await Promise.all([
    writeFile(csvOut, `${csvRows.join("\n")}\n`, "utf8"),
    writeFile(geoOut, `${JSON.stringify({
      type: "FeatureCollection",
      name: "forest-lake-phase2-all-plots",
      verificationStatus,
      features: geoFeatures,
    })}\n`, "utf8"),
    writeFile(reportOut, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
  ]);

  return { csvOut, geoOut, reportOut, report };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--") && argv[i + 1] !== undefined) {
      out[argv[i].slice(2)] = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = parseArgs(process.argv.slice(2));
  if (!args["gcp-csv"] || !args["out-dir"]) {
    console.error("Usage: node scripts/gis/compute-all-plot-coordinates.mjs --gcp-csv <csv> --out-dir <dir> [--method similarity|affine] [--max-error-m 3.0]");
    process.exit(1);
  }
  computeAllPlotCoordinates({
    gcpCsvPath: args["gcp-csv"],
    outDir: args["out-dir"],
    method: args.method || "similarity",
    maxValidationErrorM: Number(args["max-error-m"] || "3.0"),
  })
    .then(({ csvOut, geoOut, reportOut, report }) => {
      console.log(JSON.stringify({
        csvOut,
        geoOut,
        reportOut,
        plotCount: report.plotCount,
        verificationStatus: report.verificationStatus,
        metrics: report.metrics,
      }, null, 2));
    })
    .catch((err) => {
      console.error(err.message || err);
      process.exitCode = 1;
    });
}
