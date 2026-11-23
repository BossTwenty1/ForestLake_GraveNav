#!/usr/bin/env node
/**
 * Exports the 20 Phase 2 control points (15 GCP + 5 VALIDATION) and site
 * boundary outline to a Google Earth Pro `.kml` file with separate folders for
 * the conditional PRS92 (EPSG:3124) and Luzon 1911 (EPSG:25394) reference
 * hypotheses so the team can visually verify datum alignment before/during
 * on-site GPS collection.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { parseCsv } from "./build-phase2-package.mjs";
import { fitSimilarity2D, gridZone4ReferenceToWgs84 } from "./georeference.mjs";

const DEFAULT_CSV = "docs/gis/phase2-control-points.csv";
const DEFAULT_LOCAL_DATA = "public/phase2-viewer/data/phase2.local.json";
const DEFAULT_PLOT_COORDS = "public/phase2-planning/plot-coordinates.json";
const DEFAULT_OUT = "docs/gis/phase2-control-points-check.kml";

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

export async function exportControlPointsKml({
  csvPath = DEFAULT_CSV,
  localDataPath = DEFAULT_LOCAL_DATA,
  plotCoordsPath = DEFAULT_PLOT_COORDS,
  outputPath = DEFAULT_OUT,
} = {}) {
  const [csvText, localData, plotCoords] = await Promise.all([
    readFile(resolve(csvPath), "utf8"),
    readFile(resolve(localDataPath), "utf8").then(JSON.parse),
    readFile(resolve(plotCoordsPath), "utf8").then(JSON.parse),
  ]);

  const rows = parseCsv(csvText);

  // Fit CAD -> Grid from paired plots so we can also draw the reference boundary ring
  const allPlots = [...localData.layers.lawn, ...localData.layers.estates];
  const gridPairs = [];
  for (const f of allPlots) {
    const entry = plotCoords.entries[f.id];
    if (!entry) continue;
    gridPairs.push({ source: polygonCentroid(f.shape.positions), target: entry.gridCenter });
  }
  const cadToGrid = fitSimilarity2D(gridPairs);
  const boundaryRing = localData.layers.boundary[0].shape.positions[0];

  function buildFolder(name, hypothesis, latKey, lngKey, pinStyle, lineStyle) {
    const placemarks = rows.map((row) => {
      const lat = row[latKey];
      const lng = row[lngKey];
      const roleTag = row.role === "VALIDATION" ? "[CHECKPOINT]" : "[GCP]";
      return `      <Placemark>
        <name>${xmlEscape(`${row.point_code} ${roleTag}`)}</name>
        <description>${xmlEscape(`${row.location_description} (${row.zone}) | CAD: ${row.cad_x}, ${row.cad_y} | Ref ${hypothesis}: ${lat}, ${lng} (NOT verified GPS)`)}</description>
        <styleUrl>#${pinStyle}</styleUrl>
        <Point><coordinates>${lng},${lat},0</coordinates></Point>
      </Placemark>`;
    });

    const ringCoords = boundaryRing
      .map((pt) => {
        const [e, n] = cadToGrid.apply(pt);
        const [lon, lat] = gridZone4ReferenceToWgs84(e, n, hypothesis);
        return `${lon.toFixed(7)},${lat.toFixed(7)},0`;
      })
      .join(" ");

    placemarks.push(`      <Placemark>
        <name>${xmlEscape(`Phase 2 Boundary (${hypothesis} Reference)`)}</name>
        <styleUrl>#${lineStyle}</styleUrl>
        <LineString><tessellate>1</tessellate><coordinates>${ringCoords}</coordinates></LineString>
      </Placemark>`);

    return `    <Folder>
      <name>${xmlEscape(name)}</name>
${placemarks.join("\n")}
    </Folder>`;
  }

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Forest Lake Phase 2 — Control Points Reference Check (NOT Verified GPS)</name>
    <description>Compare PRS92 (EPSG:3124) vs Luzon 1911 (EPSG:25394) in Google Earth Pro before on-site GPS collection. Imagery pins are for reference checking only.</description>
    <Style id="prs92Pin"><IconStyle><color>ff34d399</color><scale>1.0</scale></IconStyle></Style>
    <Style id="luzonPin"><IconStyle><color>ff60a5fa</color><scale>1.0</scale></IconStyle></Style>
    <Style id="prs92Line"><LineStyle><color>ff34d399</color><width>2.5</width></LineStyle></Style>
    <Style id="luzonLine"><LineStyle><color>ff60a5fa</color><width>2.5</width></LineStyle></Style>
${buildFolder("PRS92 Zone IV (EPSG:3124) — Reference Only", "EPSG:3124", "ref_if_prs92_lat_NOT_FOR_NAV", "ref_if_prs92_lng_NOT_FOR_NAV", "prs92Pin", "prs92Line")}
${buildFolder("Luzon 1911 Zone IV (EPSG:25394) — Reference Only", "EPSG:25394", "ref_if_luzon1911_lat_NOT_FOR_NAV", "ref_if_luzon1911_lng_NOT_FOR_NAV", "luzonPin", "luzonLine")}
  </Document>
</kml>
`;

  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  await writeFile(resolve(outputPath), kml, "utf8");
  return { outputPath: resolve(outputPath), pointCount: rows.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  exportControlPointsKml()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((err) => { console.error(err); process.exitCode = 1; });
}
