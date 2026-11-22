#!/usr/bin/env node
/**
 * Phase 2 Georeferencing, Walking Graph & `schema_version: 2` GIS Package Builder.
 *
 * Reads:
 *  1. An organized GCP & Validation Checkpoint CSV (`--gcp-csv`)
 *  2. A lot/area crosswalk JSON (`--crosswalk`) binding official DB `lotId` &
 *     `areaId` to exact Phase 2 CAD candidate IDs (`lawn:...` / `estates:...`)
 *  3. Local Phase 2 CAD planning geometry (`public/phase2-viewer/data/phase2.local.json`)
 *     and landmarks (`public/phase2-planning/places.json`)
 *
 * Produces:
 *  - A deterministic, SHA-256 hashed 15-file `schema_version: 2` GIS package
 *    validated offline via `validatePackageDirectory()`.
 *  - Full fitting residuals (m) on GCPs and independent held-out checkpoint
 *    errors (m) on VALIDATION points.
 *  - Refuses non-`field_survey` observations unless `--allow-imagery-rehearsal`
 *    is explicitly passed (in which case output is tagged non-operational).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { DATA_FILE_NAMES, computeSha256 } from "./package-contract.mjs";
import { validatePackageDirectory } from "./package-validator.mjs";
import { evaluateGeoreferencing, haversineMeters, wgs84ToUtm51N } from "./georeference.mjs";

const DEFAULT_LOCAL_DATA = "public/phase2-viewer/data/phase2.local.json";
const DEFAULT_PLACES = "public/phase2-planning/places.json";

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field); field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field); field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cols) => Object.fromEntries(headers.map((h, idx) => [h, (cols[idx] ?? "").trim()])));
}

export function loadControlPointObservations(csvText) {
  const rows = parseCsv(csvText);
  const grouped = new Map();
  for (const row of rows) {
    const lat = Number(row.observed_lat);
    const lng = Number(row.observed_lng);
    if (!row.observed_lat || !row.observed_lng || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const cadX = Number(row.cad_x);
    const cadY = Number(row.cad_y);
    const acc = Number(row.reported_accuracy_m || "1.5");
    if (!Number.isFinite(cadX) || !Number.isFinite(cadY)) continue;

    const code = row.point_code;
    const role = row.role;
    if (!["GCP", "VALIDATION"].includes(role)) throw new Error(`Unsupported point role for ${code}: ${role}`);
    const sourceMethod = (row.source_method || "imagery_reference").toLowerCase();
    if (!["field_survey", "imagery_reference"].includes(sourceMethod)) {
      throw new Error(`Unsupported source_method for ${code}: ${sourceMethod}`);
    }
    const entry = grouped.get(code) ?? {
      pointCode: code,
      role,
      description: row.location_description || code,
      cadReference: row.cad_reference || code,
      cadX,
      cadY,
      sourceMethod,
      deviceReference: row.device_reference || "unspecified",
      operatorReference: row.operator_reference || "unspecified",
      observations: [],
    };
    if (entry.sourceMethod !== sourceMethod) entry.sourceMethod = "imagery_reference";
    entry.observations.push({
      latitude: lat,
      longitude: lng,
      reportedAccuracyM: Number.isFinite(acc) && acc >= 0 ? acc : 1.5,
      capturedAt: row.captured_at && !Number.isNaN(Date.parse(row.captured_at))
        ? new Date(row.captured_at).toISOString()
        : "2026-11-22T00:00:00.000Z",
    });
    grouped.set(code, entry);
  }

  const points = [];
  for (const entry of grouped.values()) {
    // Inverse-variance (1 / max(acc, 0.5)^2) weighted mean for multi-reading captures
    let wSum = 0; let latSum = 0; let lngSum = 0;
    for (const obs of entry.observations) {
      const w = 1 / Math.max(obs.reportedAccuracyM, 0.5) ** 2;
      wSum += w;
      latSum += obs.latitude * w;
      lngSum += obs.longitude * w;
    }
    points.push({
      ...entry,
      latitude: latSum / wSum,
      longitude: lngSum / wSum,
    });
  }
  return points;
}

function roundCoord(value) {
  return Math.round(value * 1e7) / 1e7;
}

function transformPoint(xy, cadToWgs84) {
  const [lon, lat] = cadToWgs84(xy);
  return [roundCoord(lon), roundCoord(lat)];
}

function closeRing(ring) {
  if (ring.length < 3) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) return [...ring, [...first]];
  return ring;
}

function boundingBoxPolygon(points, padDeg = 0.00004) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const x0 = roundCoord(minX - padDeg);
  const y0 = roundCoord(minY - padDeg);
  const x1 = roundCoord(maxX + padDeg);
  const y1 = roundCoord(maxY + padDeg);
  return [[
    [x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0],
  ]];
}

function extractCadLines(feature) {
  const lines = [];
  function walk(shape) {
    if (!shape) return;
    if (shape.kind === "line" && shape.positions.length >= 2) lines.push(shape.positions);
    else if (shape.kind === "polygon") for (const ring of shape.positions) if (ring.length >= 2) lines.push(ring);
    else if (shape.kind === "collection") for (const part of shape.parts) walk(part);
  }
  walk(feature.shape);
  return lines;
}

/**
 * Builds a clean, connected, deduplicated pedestrian graph in WGS84 from CAD
 * roads and pathways. Snaps nearby endpoints within `snapMeters` and connects
 * isolated components via short bridge segments so every walkable node is
 * reachable from the entrance node.
 */
function buildWalkwayGraphWgs84(localData, places, cadToWgs84, { snapMeters = 2.5, maxNodes = 4000, maxEdges = 8000 } = {}) {
  const rawPolylines = [];
  for (const feature of localData.layers.roads || []) {
    for (const line of extractCadLines(feature)) {
      rawPolylines.push({ edgeType: "road", coords: line.map((p) => transformPoint(p, cadToWgs84)) });
    }
  }
  for (const feature of localData.layers.paths || []) {
    for (const line of extractCadLines(feature)) {
      rawPolylines.push({ edgeType: "path", coords: line.map((p) => transformPoint(p, cadToWgs84)) });
    }
  }

  // Cluster endpoints & sample vertices on a metric grid (UTM 51N) to merge junctions cleanly
  const cellSize = Math.max(snapMeters, 1.0);
  const buckets = new Map();
  const nodes = [];

  function getOrCreateNode(lonLat, preferredName = null, nodeType = "junction") {
    const [e, n] = wgs84ToUtm51N(lonLat[0], lonLat[1]);
    const cx = Math.floor(e / cellSize);
    const cy = Math.floor(n / cellSize);
    let bestIdx = -1;
    let bestDist = snapMeters;
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const list = buckets.get(`${cx + dx}:${cy + dy}`);
        if (!list) continue;
        for (const idx of list) {
          const d = Math.hypot(nodes[idx].utm[0] - e, nodes[idx].utm[1] - n);
          if (d < bestDist) { bestDist = d; bestIdx = idx; }
        }
      }
    }
    if (bestIdx >= 0) {
      if (nodeType === "entrance") {
        nodes[bestIdx].nodeType = "entrance";
        if (preferredName) nodes[bestIdx].nodeName = preferredName;
      }
      return bestIdx;
    }
    const idx = nodes.length;
    nodes.push({
      id: `node.${idx + 1}`,
      lonLat,
      utm: [e, n],
      nodeName: preferredName || `Junction ${idx + 1}`,
      nodeType,
    });
    const key = `${cx}:${cy}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(idx);
    return idx;
  }

  const edgeMap = new Map();
  const addEdge = (u, v, edgeType) => {
    if (u === v) return;
    const key = u < v ? `${u}:${v}` : `${v}:${u}`;
    if (edgeMap.has(key)) return;
    edgeMap.set(key, { from: u, to: v, edgeType });
  };

  for (const poly of rawPolylines) {
    if (poly.coords.length < 2) continue;
    // Keep start, end, and intermediate vertices spaced >= 8m apart so node count stays compact
    let prevIdx = getOrCreateNode(poly.coords[0]);
    let accum = 0;
    for (let i = 1; i < poly.coords.length; i += 1) {
      accum += haversineMeters(poly.coords[i - 1], poly.coords[i]);
      if (i === poly.coords.length - 1 || accum >= 8) {
        const nextIdx = getOrCreateNode(poly.coords[i]);
        addEdge(prevIdx, nextIdx, poly.edgeType);
        prevIdx = nextIdx;
        accum = 0;
      }
    }
  }

  // Mark entrance node closest to Guard House landmark
  const guardHouse = places.landmarks.find((l) => l.id === "185B") || places.landmarks[0];
  const entranceLonLat = transformPoint(guardHouse.cadXY, cadToWgs84);
  let entranceIdx = 0;
  let bestEntDist = Infinity;
  for (let i = 0; i < nodes.length; i += 1) {
    const d = haversineMeters(nodes[i].lonLat, entranceLonLat);
    if (d < bestEntDist) { bestEntDist = d; entranceIdx = i; }
  }
  nodes[entranceIdx].nodeType = "entrance";
  nodes[entranceIdx].nodeName = "Main Entrance (Guard House)";

  // Ensure single connected component via greedy nearest-component bridges
  const parent = nodes.map((_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent[rb] = ra; };
  for (const e of edgeMap.values()) union(e.from, e.to);

  while (true) {
    const comps = new Map();
    for (let i = 0; i < nodes.length; i += 1) {
      const r = find(i);
      if (!comps.has(r)) comps.set(r, []);
      comps.get(r).push(i);
    }
    if (comps.size <= 1) break;
    const rootComp = comps.get(find(entranceIdx));
    let bestBridge = null;
    for (const [root, members] of comps.entries()) {
      if (root === find(entranceIdx)) continue;
      for (const a of members) {
        for (const b of rootComp) {
          const d = Math.hypot(nodes[a].utm[0] - nodes[b].utm[0], nodes[a].utm[1] - nodes[b].utm[1]);
          if (!bestBridge || d < bestBridge.d) bestBridge = { a, b, d };
        }
      }
    }
    if (!bestBridge) break;
    addEdge(bestBridge.a, bestBridge.b, "path");
    union(bestBridge.a, bestBridge.b);
  }

  if (nodes.length > maxNodes) throw new Error(`Generated ${nodes.length} route nodes, exceeding cap ${maxNodes}`);
  const edges = [...edgeMap.values()];
  if (edges.length > maxEdges) throw new Error(`Generated ${edges.length} route edges, exceeding cap ${maxEdges}`);

  return { nodes, edges, entranceIdx };
}

export async function buildPhaseTwoPackage({
  gcpCsvPath,
  crosswalkPath,
  outDir,
  localDataPath = DEFAULT_LOCAL_DATA,
  placesPath = DEFAULT_PLACES,
  method = "similarity",
  maxValidationErrorM = 3.0,
  allowImageryRehearsal = false,
  qgisVersion = "gravenav-builder-1.0",
} = {}) {
  const [csvText, crosswalk, localData, places] = await Promise.all([
    readFile(resolve(gcpCsvPath), "utf8"),
    readFile(resolve(crosswalkPath), "utf8").then(JSON.parse),
    readFile(resolve(localDataPath), "utf8").then(JSON.parse),
    readFile(resolve(placesPath), "utf8").then(JSON.parse),
  ]);

  const points = loadControlPointObservations(csvText);
  const gcpPoints = points.filter((p) => p.role === "GCP");
  const validationPoints = points.filter((p) => p.role === "VALIDATION");
  const hasNonField = points.some((p) => p.sourceMethod !== "field_survey");

  if (hasNonField && !allowImageryRehearsal) {
    throw new Error(
      "Control point file contains non-field_survey observations (e.g. imagery_reference). "
      + "Refusing to build an operational GIS package without real field_survey readings. "
      + "Pass --allow-imagery-rehearsal only for clearly non-operational local testing.",
    );
  }

  const geo = evaluateGeoreferencing({ gcpPoints, validationPoints, method });
  if (geo.metrics.validationMaxM > maxValidationErrorM) {
    throw new Error(
      `Independent validation max error ${geo.metrics.validationMaxM.toFixed(2)} m exceeds tolerance ${maxValidationErrorM} m`,
    );
  }

  const siteId = String(crosswalk.siteId);
  const releaseCode = String(crosswalk.releaseCode);
  const areaIds = [...new Set(crosswalk.lots.map((item) => String(item.areaId)))];
  const declaredLotIds = crosswalk.lots.map((item) => String(item.lotId));
  const layerVersion = crosswalk.layerVersion || "v2";
  const exportedAt = crosswalk.exportedAt || new Date().toISOString();
  const sourceHash = localData.source.sha256;
  const runCode = crosswalk.selectedRunCode || `RUN-${releaseCode}`;
  const artifactHash = computeSha256(Buffer.from(`${releaseCode}:${sourceHash}:${geo.method}`, "utf8"));

  const commonProps = (sourceFeatureId) => ({
    source_feature_id: sourceFeatureId,
    site_id: siteId,
    artifact_hash: artifactHash,
    layer_version: layerVersion,
  });

  // 1. Transform CAD cemetery boundary
  const cadBoundaryRing = localData.layers.boundary[0].shape.positions[0];
  const wgsBoundaryRing = closeRing(cadBoundaryRing.map((pt) => transformPoint(pt, geo.cadToWgs84)));
  const cemeteryBoundary = {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [wgsBoundaryRing] },
      properties: { ...commonProps("boundary.cemetery"), kind: "cemetery", area_id: null },
    }],
  };

  // 2. Transform crosswalked plots & compute per-area section envelopes
  const cadFeatureById = new Map([
    ...localData.layers.lawn.map((f) => [f.id, f]),
    ...localData.layers.estates.map((f) => [f.id, f]),
  ]);

  const pointsByArea = new Map(areaIds.map((id) => [id, []]));
  const plotFeatures = [];
  const plotCentroids = new Map();

  for (const entry of crosswalk.lots) {
    const cadFeature = cadFeatureById.get(entry.cadCandidateId);
    if (!cadFeature) throw new Error(`Unknown CAD candidate ${entry.cadCandidateId} for lot ${entry.lotId}`);
    const ring = closeRing(cadFeature.shape.positions[0].map((pt) => transformPoint(pt, geo.cadToWgs84)));
    const areaId = String(entry.areaId);
    const lotId = String(entry.lotId);
    pointsByArea.get(areaId).push(...ring);
    const cx = ring.slice(0, -1).reduce((s, p) => s + p[0], 0) / (ring.length - 1);
    const cy = ring.slice(0, -1).reduce((s, p) => s + p[1], 0) / (ring.length - 1);
    plotCentroids.set(lotId, [roundCoord(cx), roundCoord(cy)]);

    plotFeatures.push({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [ring] },
      properties: { ...commonProps(`plot.${lotId}`), lot_id: lotId, area_id: areaId },
    });
  }

  const gardenSections = {
    type: "FeatureCollection",
    features: areaIds.map((areaId) => ({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: boundingBoxPolygon(pointsByArea.get(areaId)) },
      properties: { ...commonProps(`boundary.area.${areaId}`), kind: "area", area_id: areaId },
    })),
  };

  // 3. Build connected WGS84 walkway network (roads_walkways, route_nodes, route_edges)
  const graph = buildWalkwayGraphWgs84(localData, places, geo.cadToWgs84);

  // One walkway lineage feature per edge (or grouped) so every route_edge is covered by its walkway
  const walkwayFeatures = graph.edges.map((edge, idx) => ({
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: [graph.nodes[edge.from].lonLat, graph.nodes[edge.to].lonLat],
    },
    properties: {
      ...commonProps(`walkway.${idx + 1}`),
      edge_type: edge.edgeType === "road" ? "road" : "walkway",
      walking_allowed: true,
      is_restricted: false,
    },
  }));

  const routeNodeFeatures = graph.nodes.map((node) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: node.lonLat },
    properties: {
      ...commonProps(node.id),
      node_name: node.nodeName,
      node_type: node.nodeType,
    },
  }));

  const routeEdgeFeatures = graph.edges.map((edge, idx) => ({
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: [graph.nodes[edge.from].lonLat, graph.nodes[edge.to].lonLat],
    },
    properties: {
      ...commonProps(`edge.${idx + 1}`),
      from_source_feature_id: graph.nodes[edge.from].id,
      to_source_feature_id: graph.nodes[edge.to].id,
      walkway_source_feature_id: `walkway.${idx + 1}`,
      edge_type: edge.edgeType === "road" ? "road" : "walkway",
      walking_allowed: true,
      is_restricted: false,
      direction: "both",
    },
  }));

  // 4. Snap each crosswalked lot to its nearest route node
  const nearestNode = (lonLat) => {
    let best = graph.nodes[0];
    let bestDist = Infinity;
    for (const node of graph.nodes) {
      const d = haversineMeters(lonLat, node.lonLat);
      if (d < bestDist) { bestDist = d; best = node; }
    }
    return best;
  };

  const accessPointFeatures = crosswalk.lots.map((entry) => {
    const lotId = String(entry.lotId);
    const areaId = String(entry.areaId);
    const node = nearestNode(plotCentroids.get(lotId));
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: node.lonLat },
      properties: {
        ...commonProps(`access.${lotId}`),
        lot_id: lotId,
        area_id: areaId,
        node_source_feature_id: node.id,
      },
    };
  });

  // 5. Transform landmarks
  const landmarkFeatures = places.landmarks.map((lm) => {
    const coords = transformPoint(lm.cadXY, geo.cadToWgs84);
    const node = nearestNode(coords);
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: coords },
      properties: {
        ...commonProps(`landmark.${lm.id}`),
        kind: lm.id === "185B" ? "entrance" : lm.kind === "facility" ? "building" : "landmark",
        label: lm.name,
        node_source_feature_id: node.id,
      },
    };
  });

  // 6. Evidence files
  const surveyPoints = points.map((p) => ({
    point_code: p.pointCode,
    site_id: siteId,
    role: p.role,
    description: p.description,
    source_plan_reference: p.cadReference,
    active: true,
  }));

  const surveyCaptures = points.map((p) => ({
    capture_code: `CAP-${p.pointCode}`,
    point_code: p.pointCode,
    site_id: siteId,
    started_at: p.observations[0].capturedAt,
    ended_at: p.observations[p.observations.length - 1].capturedAt,
    device_reference: p.deviceReference,
    operator_reference: p.operatorReference,
    remeasures_capture_code: null,
    remeasure_required: false,
  }));

  const surveyObservations = [];
  for (const p of points) {
    p.observations.forEach((obs, idx) => {
      surveyObservations.push({
        capture_code: `CAP-${p.pointCode}`,
        observation_order: idx + 1,
        latitude: obs.latitude,
        longitude: obs.longitude,
        reported_accuracy_m: obs.reportedAccuracyM,
        captured_at: obs.capturedAt,
      });
    });
  }

  const georeferencingRuns = [{
    run_code: runCode,
    release_code: releaseCode,
    site_id: siteId,
    source_reference: "phase2.local.json",
    source_sha256: sourceHash,
    source_coordinate_space: "cad-local-cartesian",
    working_srid: 32651,
    output_srid: 4326,
    method: geo.method,
    processing_parameters: { expected_validation_count: validationPoints.length },
    processed_at: exportedAt,
    qgis_version: qgisVersion,
    output_artifact_reference: `phase2-${releaseCode}.geojson`,
    output_artifact_sha256: artifactHash,
  }];

  const fitResidualByCode = new Map(geo.fittingResiduals.map((r) => [r.pointCode, r.residualM]));
  const georeferencingRunPoints = points.map((p) => ({
    run_code: runCode,
    point_code: p.pointCode,
    capture_code: `CAP-${p.pointCode}`,
    role: p.role === "GCP" ? "FITTING" : "VALIDATION",
    source_x: p.cadX,
    source_y: p.cadY,
    fitting_residual_m: p.role === "GCP" ? Number(fitResidualByCode.get(p.pointCode).toFixed(4)) : null,
  }));

  const georeferencingValidation = geo.validationResults.map((v) => ({
    run_code: runCode,
    point_code: v.pointCode,
    transformed_plan_point: {
      type: "Point",
      coordinates: [roundCoord(v.predictedLonLat[0]), roundCoord(v.predictedLonLat[1])],
    },
    review_state: hasNonField ? "draft" : "reviewed",
  }));

  const dataPayloads = {
    "cemetery_boundary.geojson": cemeteryBoundary,
    "garden_sections.geojson": gardenSections,
    "roads_walkways.geojson": { type: "FeatureCollection", features: walkwayFeatures },
    "grave_plots.geojson": { type: "FeatureCollection", features: plotFeatures },
    "grave_access_points.geojson": { type: "FeatureCollection", features: accessPointFeatures },
    "route_nodes.geojson": { type: "FeatureCollection", features: routeNodeFeatures },
    "route_edges.geojson": { type: "FeatureCollection", features: routeEdgeFeatures },
    "landmarks.geojson": { type: "FeatureCollection", features: landmarkFeatures },
    "survey_points.json": surveyPoints,
    "survey_captures.json": surveyCaptures,
    "survey_observations.json": surveyObservations,
    "georeferencing_runs.json": georeferencingRuns,
    "georeferencing_run_points.json": georeferencingRunPoints,
    "georeferencing_validation.json": georeferencingValidation,
  };

  const targetDir = resolve(outDir);
  await mkdir(targetDir, { recursive: true });

  const fileEntries = [];
  for (const name of DATA_FILE_NAMES) {
    const payload = dataPayloads[name];
    const bytes = Buffer.from(`${JSON.stringify(payload)}\n`, "utf8");
    await writeFile(resolve(targetDir, name), bytes);
    fileEntries.push({
      name,
      sha256: computeSha256(bytes),
      bytes: bytes.byteLength,
      feature_count: Array.isArray(payload) ? payload.length : payload.features.length,
      layer_version: layerVersion,
    });
  }

  const manifest = {
    schema_version: 2,
    package_id: crosswalk.packageId || `forest-lake-phase2-${releaseCode.toLowerCase()}`,
    site_id: siteId,
    area_ids: areaIds,
    release_code: releaseCode,
    title: crosswalk.title || `Forest Lake Phase 2 GIS Package (${releaseCode})`,
    description: hasNonField
      ? "NON-OPERATIONAL IMAGERY REHEARSAL ONLY — NOT VERIFIED FIELD SURVEY GPS"
      : (crosswalk.description || "Field-surveyed Forest Lake Memorial Park Phase 2 GIS package"),
    source_plan: {
      reference: "FL LGP PH2_Sch 6.2_ for Pama.dxf",
      version: layerVersion,
      sha256: sourceHash,
      coordinate_space: "cad-local-cartesian",
    },
    crs: { field: 4326, working: 32651, export: 4326 },
    exported_at: exportedAt,
    qgis_version: qgisVersion,
    selected_run_code: runCode,
    declared_lot_ids: declaredLotIds,
    provenance_notes: hasNonField
      ? "Rehearsal build from imagery_reference control points. Not approved for live navigation."
      : `Built from ${gcpPoints.length} field_survey GCPs and ${validationPoints.length} held-out checkpoints.`,
    limitations: hasNonField
      ? ["Imagery reference only; on-site GPS survey and field acceptance still required."]
      : ["Requires SQL import validation, ADMIN approval, and real smartphone walk test before activation."],
    files: fileEntries,
  };

  await writeFile(resolve(targetDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const validation = await validatePackageDirectory(targetDir);

  return {
    outDir: targetDir,
    fieldSurveyApproved: !hasNonField && validation.valid,
    georeferencing: geo.metrics,
    graph: {
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      entranceNode: graph.nodes[graph.entranceIdx].id,
    },
    offlineValidation: validation,
  };
}

function parseCliArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--allow-imagery-rehearsal") { out.allowImageryRehearsal = true; continue; }
    if (arg.startsWith("--") && argv[i + 1] !== undefined) {
      out[arg.slice(2)] = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = parseCliArgs(process.argv.slice(2));
  if (!args["gcp-csv"] || !args.crosswalk || !args["out-dir"]) {
    console.error("Usage: node scripts/gis/build-phase2-package.mjs --gcp-csv <csv> --crosswalk <json> --out-dir <dir> [--method similarity|affine] [--max-error-m 3.0] [--allow-imagery-rehearsal]");
    process.exit(1);
  }
  buildPhaseTwoPackage({
    gcpCsvPath: args["gcp-csv"],
    crosswalkPath: args.crosswalk,
    outDir: args["out-dir"],
    method: args.method || "similarity",
    maxValidationErrorM: Number(args["max-error-m"] || "3.0"),
    allowImageryRehearsal: Boolean(args.allowImageryRehearsal),
  })
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      if (!summary.offlineValidation.valid) process.exitCode = 1;
    })
    .catch((err) => {
      console.error(err.message || err);
      process.exitCode = 1;
    });
}
