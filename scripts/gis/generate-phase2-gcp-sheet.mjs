#!/usr/bin/env node
/**
 * Generates an organized Phase 2 Ground Control Points (GCP) & Validation
 * Checkpoints CSV sheet directly from the local Phase 2 CAD geometry and
 * paired DWG coordinate references (LPCS + Grid).
 *
 * Output contains:
 *  - 15 well-distributed GCP fitting anchors + 5 held-out VALIDATION checkpoints
 *  - Exact CAD X/Y, LPCS X/Y, and Grid Easting/Northing
 *  - Explicit reference-only search hints under PRS92 (EPSG:3124) and Luzon 1911
 *    (EPSG:25394) so you know where to look on Google Earth or stand on-site
 *  - Empty observation columns for real GPS / Google Earth reference capture
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fitSimilarity2D, gridZone4ReferenceToWgs84 } from "./georeference.mjs";

const DEFAULT_LOCAL_DATA = "public/phase2-viewer/data/phase2.local.json";
const DEFAULT_PLACES = "public/phase2-planning/places.json";
const DEFAULT_CAD_DETAILS = "public/phase2-planning/cad-details/manifest.json";
const DEFAULT_PLOT_COORDS = "public/phase2-planning/plot-coordinates.json";
const DEFAULT_OUTPUT = "docs/gis/phase2-control-points.csv";

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

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function generateControlPointSheet({
  localDataPath = DEFAULT_LOCAL_DATA,
  placesPath = DEFAULT_PLACES,
  cadDetailsPath = DEFAULT_CAD_DETAILS,
  plotCoordsPath = DEFAULT_PLOT_COORDS,
  outputPath = DEFAULT_OUTPUT,
} = {}) {
  const [localData, places, cadDetails, plotCoords] = await Promise.all([
    readFile(resolve(localDataPath), "utf8").then(JSON.parse),
    readFile(resolve(placesPath), "utf8").then(JSON.parse),
    readFile(resolve(cadDetailsPath), "utf8").then(JSON.parse),
    readFile(resolve(plotCoordsPath), "utf8").then(JSON.parse),
  ]);

  // Fit CAD -> LPCS and CAD -> Grid using all 4,494 verified paired lot centres
  const allPlots = [...localData.layers.lawn, ...localData.layers.estates];
  const lpcsPairs = [];
  const gridPairs = [];
  for (const feature of allPlots) {
    const entry = plotCoords.entries[feature.id];
    if (!entry) continue;
    const center = polygonCentroid(feature.shape.positions);
    lpcsPairs.push({ source: center, target: entry.lpcsCenter });
    gridPairs.push({ source: center, target: entry.gridCenter });
  }
  const cadToLpcs = fitSimilarity2D(lpcsPairs);
  const cadToGrid = fitSimilarity2D(gridPairs);

  const byPlaceId = new Map(places.landmarks.map((item) => [item.id, item]));
  const byLabelId = new Map(cadDetails.labels.map((item) => [item.id, item]));
  const boundaryRing = localData.layers.boundary[0].shape.positions[0];

  function pickBoundaryCorner(predicate, fallback) {
    let best = null;
    for (const pt of boundaryRing) {
      const score = predicate(pt);
      if (!best || score > best.score) best = { pt, score };
    }
    return best ? [best.pt[0], best.pt[1]] : fallback;
  }

  // 15 GCP fitting anchors + 5 held-out VALIDATION checkpoints spanning the full Phase 2 footprint
  const stations = [
    // North / Entrance & Butterfly Palm Garden
    { code: "GCP-01", role: "GCP", zone: "Main Entrance", desc: "Guard House center (North Main Entrance)", ref: "185B", xy: byPlaceId.get("185B").cadXY },
    { code: "GCP-02", role: "GCP", zone: "Main Entrance", desc: "Water Tank pad center (North of Guard House)", ref: "1759", xy: byPlaceId.get("1759").cadXY },
    { code: "GCP-03", role: "GCP", zone: "Perimeter North", desc: "North-most property boundary corner (near road entrance)", ref: "boundary:north", xy: pickBoundaryCorner(([, y]) => y) },
    { code: "GCP-04", role: "GCP", zone: "Butterfly Palm Garden B", desc: "Butterfly Palm Garden B center / upper road curve", ref: "1867", xy: byPlaceId.get("1867").cadXY },
    { code: "VAL-01", role: "VALIDATION", zone: "Butterfly Palm Garden A/B", desc: "Parking Area 01 (48 slots along 11.5m RROW between Butterfly A and B)", ref: "parking-6", xy: byLabelId.get("parking-6").cadXY },
    { code: "GCP-05", role: "GCP", zone: "Butterfly Palm Garden A", desc: "Butterfly Palm Garden A sector marker (11.5m RROW curve)", ref: "section-13173", xy: byLabelId.get("section-13173").cadXY },

    // East Perimeter & Parking 03 / Majestic C
    { code: "GCP-06", role: "GCP", zone: "East Perimeter", desc: "Parking Area 03 (6 slots on east property fence line)", ref: "parking-3", xy: byLabelId.get("parking-3").cadXY },
    { code: "VAL-02", role: "VALIDATION", zone: "Majestic Palm Garden C", desc: "Majestic Palm Garden C section center", ref: "section-13148", xy: byLabelId.get("section-13148").cadXY },
    { code: "GCP-07", role: "GCP", zone: "Majestic Palm Garden C", desc: "Broad walkway junction along Majestic C / A boundary", ref: "broad-walkway", xy: byLabelId.get("broad-walkway").cadXY },
    { code: "GCP-08", role: "GCP", zone: "Perimeter East", desc: "East-most property boundary corner (3m Creek Easement junction)", ref: "boundary:east", xy: pickBoundaryCorner(([x]) => x) },

    // Central Spine / Majestic Palm Court C / MPH / Meter Center / Gazebo
    { code: "GCP-09", role: "GCP", zone: "Majestic Palm Court C", desc: "NEW MPH (Multipurpose Hall) building footprint center", ref: "1898/27D", xy: byPlaceId.get("1898").cadXY },
    { code: "VAL-03", role: "VALIDATION", zone: "Majestic Palm Court C", desc: "Meter Center structure footprint center (9.5m RROW)", ref: "1A25/1345", xy: byPlaceId.get("1A25").cadXY },
    { code: "GCP-10", role: "GCP", zone: "Majestic Palm Garden Central", desc: "Standard Gazebo (25 sqm) footprint center between Majestic D and A", ref: "18C3/283", xy: byPlaceId.get("18C3").cadXY },
    { code: "GCP-11", role: "GCP", zone: "Majestic Palm Garden A", desc: "Majestic Palm Garden A sector center", ref: "section-13291", xy: byLabelId.get("section-13291").cadXY },

    // West Perimeter / Parking 02 / Majestic D / Creek
    { code: "GCP-12", role: "GCP", zone: "West Perimeter", desc: "Parking Area 02 north end (west property line near 9.5m RROW)", ref: "parking-1", xy: byLabelId.get("parking-1").cadXY },
    { code: "GCP-13", role: "GCP", zone: "Perimeter West", desc: "West-most property boundary corner (steel matting fence)", ref: "boundary:west", xy: pickBoundaryCorner(([x]) => -x) },
    { code: "VAL-04", role: "VALIDATION", zone: "West Parking 02", desc: "Parking Area 02 south bay (near southwest Majestic D corner)", ref: "parking-4", xy: byLabelId.get("parking-4").cadXY },
    { code: "GCP-14", role: "GCP", zone: "Majestic Palm Garden D", desc: "Majestic Palm Garden D section center", ref: "section-13255", xy: byLabelId.get("section-13255").cadXY },
    { code: "GCP-15", role: "GCP", zone: "Perimeter South", desc: "South-most property boundary corner along creek easement", ref: "boundary:south", xy: pickBoundaryCorner(([, y]) => -y) },
    { code: "VAL-05", role: "VALIDATION", zone: "South Creek Edge", desc: "South creek edge midpoint (south of Standard Gazebo)", ref: "edge-13265", xy: byLabelId.get("edge-13265").cadXY },
  ];

  const headers = [
    "point_code",
    "role",
    "zone",
    "location_description",
    "cad_reference",
    "cad_x",
    "cad_y",
    "lpcs_x",
    "lpcs_y",
    "grid_easting",
    "grid_northing",
    "ref_if_prs92_lat_NOT_FOR_NAV",
    "ref_if_prs92_lng_NOT_FOR_NAV",
    "ref_if_luzon1911_lat_NOT_FOR_NAV",
    "ref_if_luzon1911_lng_NOT_FOR_NAV",
    "source_method",
    "observed_lat",
    "observed_lng",
    "reported_accuracy_m",
    "captured_at",
    "device_reference",
    "operator_reference",
    "notes",
  ];

  const rows = [headers.join(",")];
  for (const s of stations) {
    const [lpcsX, lpcsY] = cadToLpcs.apply(s.xy);
    const [gridE, gridN] = cadToGrid.apply(s.xy);
    const [prsLon, prsLat] = gridZone4ReferenceToWgs84(gridE, gridN, "EPSG:3124");
    const [luzLon, luzLat] = gridZone4ReferenceToWgs84(gridE, gridN, "EPSG:25394");

    rows.push([
      s.code,
      s.role,
      s.zone,
      s.desc,
      s.ref,
      s.xy[0].toFixed(4),
      s.xy[1].toFixed(4),
      lpcsX.toFixed(4),
      lpcsY.toFixed(4),
      gridE.toFixed(4),
      gridN.toFixed(4),
      prsLat.toFixed(7),
      prsLon.toFixed(7),
      luzLat.toFixed(7),
      luzLon.toFixed(7),
      "", "", "", "", "", "", "", "",
    ].map(csvEscape).join(","));
  }

  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  await writeFile(resolve(outputPath), `${rows.join("\n")}\n`, "utf8");
  return { outputPath: resolve(outputPath), count: stations.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  generateControlPointSheet()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((err) => { console.error(err); process.exitCode = 1; });
}
