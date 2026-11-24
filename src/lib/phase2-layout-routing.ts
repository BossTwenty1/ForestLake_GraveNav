import { PARK_ADDRESS, PARK_NAME } from "./park-details";
import { landmarkName, type Bounds, type CadFeature, type PlanningBundle, type Shape } from "./phase2-planning";

export type LayoutPoint = [number, number];
export type LayoutRouteMode = "shortest" | "paved";

export type LayoutStartPoint = {
  id: string;
  label: string;
  position: LayoutPoint;
};
export type LayoutRouteStep = {
  instruction: string;
  kind: "start" | "turn" | "continue" | "arrive";
};
export type LayoutRoute = {
  start: LayoutStartPoint;
  path: LayoutPoint[];
  approach: LayoutPoint[];
  steps: LayoutRouteStep[];
  distanceMeters: number;
  estimatedMinutes: number;
  mode: LayoutRouteMode;
};

type EdgeKind = "road" | "path" | "cross" | "crossing" | "lawn";
type GraphEdge = { to: number; length: number; kind: EdgeKind };

type BBox = [number, number, number, number];
type ObstaclePolygon = { id: string; rings: LayoutPoint[][]; bbox: BBox };
type ObstacleSegment = { a: LayoutPoint; b: LayoutPoint; bbox: BBox };

export type LayoutWalkwayGraph = {
  nodes: LayoutPoint[];
  nodeKinds: ("paved" | "lawn")[];
  adj: GraphEdge[][];
  parkBoundary: ObstaclePolygon | null;
  hardPolygons: ObstaclePolygon[];
  estatePolygons: ObstaclePolygon[];
  barrierSegments: ObstacleSegment[];
  gradedLawnCells: Set<string> | null;
};

const LAWN_CELL_SIZE = 4;

function buildGradedLawnCells(lawnFeatures: CadFeature[] | undefined): Set<string> | null {
  if (!Array.isArray(lawnFeatures) || lawnFeatures.length === 0) return null;
  const cells = new Set<string>();
  for (const feature of lawnFeatures) {
    if (!feature.bounds) continue;
    const minCx = Math.floor(feature.bounds[0] / LAWN_CELL_SIZE);
    const maxCx = Math.floor(feature.bounds[2] / LAWN_CELL_SIZE);
    const minCy = Math.floor(feature.bounds[1] / LAWN_CELL_SIZE);
    const maxCy = Math.floor(feature.bounds[3] / LAWN_CELL_SIZE);
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        cells.add(`${cx},${cy}`);
      }
    }
  }
  return cells;
}

function isOnGradedLawn(point: LayoutPoint, cells: Set<string> | null): boolean {
  if (!cells) return true;
  const cx = Math.floor(point[0] / LAWN_CELL_SIZE);
  const cy = Math.floor(point[1] / LAWN_CELL_SIZE);
  // Check exact cell or immediate 1-cell border (<= 4m aisle beside lawn plots).
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (cells.has(`${cx + dx},${cy + dy}`)) return true;
    }
  }
  return false;
}

function isOffRoadSegmentOnGradedLawn(a: LayoutPoint, b: LayoutPoint, cells: Set<string> | null): boolean {
  if (!cells) return true;
  for (const t of [0.2, 0.5, 0.8]) {
    const sample: LayoutPoint = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    if (!isOnGradedLawn(sample, cells)) return false;
  }
  return true;
}

const METERS_PER_CAD_UNIT = 0.99961295;

const HARD_POLYGON_LAYERS = new Set([
  "[SDP] Slope Protection",
  "[Amenities] Roof",
  "[Amenities] Floor",
  "A_Floor",
  "Existing Structures-Building-Developments",
]);

const BARRIER_LINE_LAYERS = new Set([
  "[SDP] Slope Protection",
  "RIPRAP",
  "[SDP] River Encroachment",
  "[SDP] Perimeter Fence",
]);

export function formatRouteDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return "Approx. 1 m";
  if (meters >= 1000) return `Approx. ${(meters / 1000).toFixed(1)} km`;
  return `Approx. ${Math.round(meters)} m`;
}

export const PARK_ENTRANCE_MAPS_URL =
  "https://www.google.com/maps/search/?api=1&query=" +
  encodeURIComponent(`${PARK_NAME}, ${PARK_ADDRESS}`);

function dist(a: LayoutPoint, b: LayoutPoint): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function segmentBBox(a: LayoutPoint, b: LayoutPoint): BBox {
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[0], b[0]),
    Math.max(a[1], b[1]),
  ];
}

function bboxesOverlap(a: BBox, b: BBox, pad = 0): boolean {
  return !(
    a[2] + pad < b[0] ||
    b[2] + pad < a[0] ||
    a[3] + pad < b[1] ||
    b[3] + pad < a[1]
  );
}

function polygonBBox(rings: LayoutPoint[][]): BBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return [minX, minY, maxX, maxY];
}

function pointInRing(point: LayoutPoint, ring: LayoutPoint[]): boolean {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point: LayoutPoint, poly: ObstaclePolygon): boolean {
  if (
    point[0] < poly.bbox[0] ||
    point[0] > poly.bbox[2] ||
    point[1] < poly.bbox[1] ||
    point[1] > poly.bbox[3]
  ) {
    return false;
  }
  if (!poly.rings.length || !pointInRing(point, poly.rings[0])) return false;
  for (let i = 1; i < poly.rings.length; i++) {
    if (pointInRing(point, poly.rings[i])) return false;
  }
  return true;
}

function cross2(a: LayoutPoint, b: LayoutPoint, c: LayoutPoint): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a: LayoutPoint, b: LayoutPoint, p: LayoutPoint): boolean {
  return (
    p[0] >= Math.min(a[0], b[0]) - 1e-9 &&
    p[0] <= Math.max(a[0], b[0]) + 1e-9 &&
    p[1] >= Math.min(a[1], b[1]) - 1e-9 &&
    p[1] <= Math.max(a[1], b[1]) + 1e-9
  );
}

function segmentsIntersect(a: LayoutPoint, b: LayoutPoint, c: LayoutPoint, d: LayoutPoint): boolean {
  const d1 = cross2(c, d, a);
  const d2 = cross2(c, d, b);
  const d3 = cross2(a, b, c);
  const d4 = cross2(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  if (Math.abs(d1) < 1e-9 && onSegment(c, d, a)) return true;
  if (Math.abs(d2) < 1e-9 && onSegment(c, d, b)) return true;
  if (Math.abs(d3) < 1e-9 && onSegment(a, b, c)) return true;
  if (Math.abs(d4) < 1e-9 && onSegment(a, b, d)) return true;
  return false;
}

function segmentsStrictlyCross(a: LayoutPoint, b: LayoutPoint, c: LayoutPoint, d: LayoutPoint): boolean {
  const d1 = cross2(c, d, a);
  const d2 = cross2(c, d, b);
  const d3 = cross2(a, b, c);
  const d4 = cross2(a, b, d);
  return ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9))
    && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9));
}

function segmentIntersectsPolygon(a: LayoutPoint, b: LayoutPoint, sBox: BBox, poly: ObstaclePolygon): boolean {
  if (!bboxesOverlap(sBox, poly.bbox)) return false;
  // Check multiple interior samples along the segment so even a thin 1-2m retaining wall cannot be jumped across.
  for (const t of [0.15, 0.35, 0.5, 0.65, 0.85]) {
    const sample: LayoutPoint = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    if (pointInPolygon(sample, poly)) return true;
  }
  for (const ring of poly.rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const p1 = ring[i];
      const p2 = ring[i + 1];
      if (bboxesOverlap(sBox, segmentBBox(p1, p2)) && segmentsStrictlyCross(a, b, p1, p2)) {
        return true;
      }
    }
  }
  return false;
}

function extractLines(features: CadFeature[] | undefined): LayoutPoint[][] {
  if (!Array.isArray(features)) return [];
  const lines: LayoutPoint[][] = [];
  for (const feature of features) {
    if (feature.shape.kind === "line") {
      lines.push(feature.shape.positions.map((pos) => [pos[0], pos[1]]));
    } else if (feature.shape.kind === "collection") {
      for (const part of feature.shape.parts) {
        if (part.kind === "line") {
          lines.push(part.positions.map((pos) => [pos[0], pos[1]]));
        }
      }
    }
  }
  return lines;
}

function extractPolygonsFromShape(id: string, shape: Shape): ObstaclePolygon[] {
  if (shape.kind === "polygon") {
    const rings = shape.positions.map((ring) => ring.map((pos): LayoutPoint => [pos[0], pos[1]]));
    if (!rings.length || rings[0].length < 4) return [];
    return [{ id, rings, bbox: polygonBBox(rings) }];
  }
  if (shape.kind === "collection") {
    return shape.parts.flatMap((part, idx) => extractPolygonsFromShape(`${id}:${idx}`, part));
  }
  return [];
}

function extractObstacles(bundle: PlanningBundle) {
  const boundaryFeature = bundle.data?.layers?.boundary?.[0];
  const parkBoundary = boundaryFeature
    ? extractPolygonsFromShape(boundaryFeature.id, boundaryFeature.shape)[0] ?? null
    : null;

  const hardPolygons: ObstaclePolygon[] = [];
  const barrierSegments: ObstacleSegment[] = [];

  for (const feature of bundle.data?.layers?.context ?? []) {
    const layerName = feature.properties?.effective_layer || feature.properties?.source_layer || "";
    if (HARD_POLYGON_LAYERS.has(layerName)) {
      hardPolygons.push(...extractPolygonsFromShape(feature.id, feature.shape));
    }
    if (BARRIER_LINE_LAYERS.has(layerName)) {
      const lines = extractLines([feature]);
      for (const line of lines) {
        for (let i = 1; i < line.length; i++) {
          const a = line[i - 1];
          const b = line[i];
          if (dist(a, b) > 0.25) {
            barrierSegments.push({ a, b, bbox: segmentBBox(a, b) });
          }
        }
      }
    }
  }

  const estatePolygons: ObstaclePolygon[] = [];
  for (const block of bundle.data?.layers?.blocks ?? []) {
    estatePolygons.push(...extractPolygonsFromShape(block.id, block.shape));
  }

  return { parkBoundary, hardPolygons, estatePolygons, barrierSegments };
}

function isPointBlocked(
  point: LayoutPoint,
  hardPolygons: ObstaclePolygon[],
  estatePolygons: ObstaclePolygon[],
  exemptEstateId?: string,
): boolean {
  for (const poly of hardPolygons) {
    if (pointInPolygon(point, poly)) return true;
  }
  for (const poly of estatePolygons) {
    if (exemptEstateId && poly.id === exemptEstateId) continue;
    if (pointInPolygon(point, poly)) return true;
  }
  return false;
}

function isSegmentBlocked(
  a: LayoutPoint,
  b: LayoutPoint,
  hardPolygons: ObstaclePolygon[],
  estatePolygons: ObstaclePolygon[],
  barrierSegments: ObstacleSegment[],
  parkBoundary: ObstaclePolygon | null,
  exemptEstateId?: string,
): boolean {
  const sBox = segmentBBox(a, b);
  if (parkBoundary) {
    const mid: LayoutPoint = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (!pointInPolygon(mid, parkBoundary)) return true;
  }
  for (const poly of hardPolygons) {
    if (segmentIntersectsPolygon(a, b, sBox, poly)) return true;
  }
  for (const poly of estatePolygons) {
    if (exemptEstateId && poly.id === exemptEstateId) continue;
    if (segmentIntersectsPolygon(a, b, sBox, poly)) return true;
  }
  for (const seg of barrierSegments) {
    if (bboxesOverlap(sBox, seg.bbox) && segmentsIntersect(a, b, seg.a, seg.b)) {
      return true;
    }
  }
  return false;
}

function edgeWeight(kind: EdgeKind, mode: LayoutRouteMode): number {
  if (kind === "road" || kind === "path") return 1.0;
  if (kind === "cross") return 1.05;
  if (kind === "crossing") return mode === "paved" ? 1.12 : 1.08;
  return mode === "paved" ? 6.0 : 1.28;
}

const walkwayGraphCache = new WeakMap<PlanningBundle, LayoutWalkwayGraph>();

export function buildLayoutWalkwayGraph(bundle: PlanningBundle): LayoutWalkwayGraph {
  const cached = walkwayGraphCache.get(bundle);
  if (cached) return cached;
  const { parkBoundary, hardPolygons, estatePolygons, barrierSegments } = extractObstacles(bundle);
  const gradedLawnCells = buildGradedLawnCells(bundle.data?.layers?.lawn);
  const nodes: LayoutPoint[] = [];
  const nodeKinds: ("paved" | "lawn")[] = [];
  const adj: GraphEdge[][] = [];
  const keyMap = new Map<string, number>();

  function addNode(x: number, y: number, nodeKind: "paved" | "lawn") {
    // 0.25-unit precision prevents merging opposite sides of thin 1-2 m retaining walls into one node.
    const key = `${Math.round(x * 4)},${Math.round(y * 4)}`;
    const existing = keyMap.get(key);
    if (existing !== undefined) {
      if (nodeKind === "paved") nodeKinds[existing] = "paved";
      return existing;
    }
    const id = nodes.length;
    nodes.push([x, y]);
    nodeKinds.push(nodeKind);
    adj.push([]);
    keyMap.set(key, id);
    return id;
  }

  function link(a: number, b: number, length: number, kind: EdgeKind) {
    if (a === b || !Number.isFinite(length) || length <= 0) return;
    const existing = adj[a].find((edge) => edge.to === b);
    if (existing) {
      if (edgeWeight(kind, "shortest") < edgeWeight(existing.kind, "shortest")) {
        existing.kind = kind;
        existing.length = Math.min(existing.length, length);
        const rev = adj[b].find((edge) => edge.to === a);
        if (rev) {
          rev.kind = kind;
          rev.length = Math.min(rev.length, length);
        }
      }
      return;
    }
    adj[a].push({ to: b, length, kind });
    adj[b].push({ to: a, length, kind });
  }

  const segments: { kind: "road" | "path"; pts: LayoutPoint[] }[] = [
    ...extractLines(bundle.data?.layers?.roads).map((pts) => ({ kind: "road" as const, pts })),
    ...extractLines(bundle.data?.layers?.paths).map((pts) => ({ kind: "path" as const, pts })),
  ];

  const isInsideHardPolygon = (a: LayoutPoint, b: LayoutPoint) => {
    const mid: LayoutPoint = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    for (const poly of hardPolygons) {
      if (pointInPolygon(mid, poly)) return true;
    }
    return false;
  };

  for (const segment of segments) {
    let prev: number | null = null;
    for (let i = 0; i < segment.pts.length; i++) {
      const cur = segment.pts[i];
      if (i > 0) {
        const start = segment.pts[i - 1];
        const len = dist(start, cur);
        const steps = Math.max(1, Math.ceil(len / 4));
        for (let k = 1; k < steps; k++) {
          const id = addNode(
            start[0] + ((cur[0] - start[0]) * k) / steps,
            start[1] + ((cur[1] - start[1]) * k) / steps,
            "paved",
          );
          if (prev !== null && !(segment.kind === "path" && isInsideHardPolygon(nodes[prev], nodes[id]))) {
            link(prev, id, dist(nodes[prev], nodes[id]), segment.kind);
          }
          prev = id;
        }
      }
      const id = addNode(cur[0], cur[1], "paved");
      if (prev !== null && !(segment.kind === "path" && isInsideHardPolygon(nodes[prev], nodes[id]))) {
        link(prev, id, dist(nodes[prev], nodes[id]), segment.kind);
      }
      prev = id;
    }
  }

  const pavedCount = nodes.length;

  // Connect adjacent road/walkway junctions within 3.5 drawing units ONLY when no retaining wall or barrier lies between them.
  for (let i = 0; i < pavedCount; i++) {
    for (let j = i + 1; j < pavedCount; j++) {
      const d = dist(nodes[i], nodes[j]);
      if (d <= 3.5) {
        if (
          !isSegmentBlocked(
            nodes[i],
            nodes[j],
            hardPolygons,
            estatePolygons,
            barrierSegments,
            parkBoundary,
          )
        ) {
          link(i, j, d, "cross");
        }
      }
    }
  }

  // Add obstacle-free street crossings across the 6-11 m paved park roads.
  for (let i = 0; i < pavedCount; i += 2) {
    let bestJ = -1;
    let bestDist = 11.5;
    for (let j = 0; j < pavedCount; j++) {
      if (i === j) continue;
      const d = dist(nodes[i], nodes[j]);
      if (d <= 4.0 || d >= bestDist) continue;
      const alreadyClose = adj[i].some((e) => e.to === j);
      if (alreadyClose) continue;
      if (
        !isSegmentBlocked(
          nodes[i],
          nodes[j],
          hardPolygons,
          estatePolygons,
          barrierSegments,
          parkBoundary,
        )
      ) {
        bestDist = d;
        bestJ = j;
      }
    }
    if (bestJ >= 0) {
      link(i, bestJ, bestDist, "crossing");
    }
  }

  // Bridge remaining paved components into one connected pedestrian network.
  const findComponents = (limit: number) => {
    const comp = new Int32Array(limit).fill(-1);
    let count = 0;
    for (let i = 0; i < limit; i++) {
      if (comp[i] !== -1) continue;
      const queue = [i];
      comp[i] = count;
      while (queue.length) {
        const current = queue.pop()!;
        for (const edge of adj[current]) {
          if (edge.to < limit && comp[edge.to] === -1) {
            comp[edge.to] = count;
            queue.push(edge.to);
          }
        }
      }
      count++;
    }
    return { comp, count };
  };

  let { comp, count } = findComponents(pavedCount);
  while (count > 1) {
    const best = new Map<number, { u: number; v: number; d: number }>();
    for (let i = 0; i < pavedCount; i++) {
      for (let j = i + 1; j < pavedCount; j++) {
        if (comp[i] === comp[j]) continue;
        const d = dist(nodes[i], nodes[j]);
        if (d > 15) continue;
        if (
          isSegmentBlocked(
            nodes[i],
            nodes[j],
            hardPolygons,
            estatePolygons,
            barrierSegments,
            parkBoundary,
          )
        ) {
          continue;
        }
        const ca = comp[i];
        const cb = comp[j];
        const curA = best.get(ca);
        if (!curA || d < curA.d) best.set(ca, { u: i, v: j, d });
        const curB = best.get(cb);
        if (!curB || d < curB.d) best.set(cb, { u: i, v: j, d });
      }
    }
    if (!best.size) break;
    for (const bridge of best.values()) {
      link(bridge.u, bridge.v, bridge.d, "crossing");
    }
    ({ comp, count } = findComponents(pavedCount));
  }

  // Build an obstacle-free flat-ground walkable mesh inside the park boundary (avoiding slopes, fences, buildings, and estates).
  const bounds: Bounds | undefined = bundle.data?.bounds;
  if (bounds && parkBoundary) {
    const step = 8;
    const cols = Math.floor((bounds[2] - bounds[0]) / step) + 1;
    const rows = Math.floor((bounds[3] - bounds[1]) / step) + 1;
    const gridIds = new Int32Array(cols * rows).fill(-1);

    for (let r = 0; r < rows; r++) {
      const y = bounds[1] + r * step;
      for (let c = 0; c < cols; c++) {
        const x = bounds[0] + c * step;
        const pt: LayoutPoint = [x, y];
        if (!pointInPolygon(pt, parkBoundary)) continue;
        // Restrict flat-ground shortcuts strictly to graded lawn burial terraces (never empty steep hillsides).
        if (!isOnGradedLawn(pt, gradedLawnCells)) continue;
        if (isPointBlocked(pt, hardPolygons, estatePolygons)) continue;
        gridIds[r * cols + c] = addNode(x, y, "lawn");
      }
    }

    const dirs = [
      [1, 0],
      [0, 1],
      [1, 1],
      [-1, 1],
    ] as const;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const u = gridIds[r * cols + c];
        if (u < 0) continue;
        for (const [dc, dr] of dirs) {
          const nc = c + dc;
          const nr = r + dr;
          if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
          const v = gridIds[nr * cols + nc];
          if (v < 0) continue;
          if (
            isOffRoadSegmentOnGradedLawn(nodes[u], nodes[v], gradedLawnCells) &&
            !isSegmentBlocked(
              nodes[u],
              nodes[v],
              hardPolygons,
              estatePolygons,
              barrierSegments,
              parkBoundary,
            )
          ) {
            link(u, v, dist(nodes[u], nodes[v]), "lawn");
          }
        }
        // Connect flat-ground lawn terrace seamlessly to the nearest obstacle-free paved road/path node.
        let bestPaved = -1;
        let bestDist = 11;
        for (let p = 0; p < pavedCount; p++) {
          const d = dist(nodes[u], nodes[p]);
          if (d >= bestDist) continue;
          if (
            isOffRoadSegmentOnGradedLawn(nodes[u], nodes[p], gradedLawnCells) &&
            !isSegmentBlocked(
              nodes[u],
              nodes[p],
              hardPolygons,
              estatePolygons,
              barrierSegments,
              parkBoundary,
            )
          ) {
            bestDist = d;
            bestPaved = p;
          }
        }
        if (bestPaved >= 0) {
          link(u, bestPaved, bestDist, "lawn");
        }
      }
    }
  }

  const built: LayoutWalkwayGraph = {
    nodes,
    nodeKinds,
    adj,
    parkBoundary,
    hardPolygons,
    estatePolygons,
    barrierSegments,
    gradedLawnCells,
  };
  walkwayGraphCache.set(bundle, built);
  return built;
}

export function layoutStartPoints(bundle: PlanningBundle): LayoutStartPoint[] {
  const points: LayoutStartPoint[] = [];
  const landmarks = bundle.places?.landmarks ?? [];
  const guardHouse = landmarks.find((item) => item.name === "Guard House");
  if (guardHouse) {
    points.push({
      id: "entrance",
      label: "Main Entrance (Guard House)",
      position: guardHouse.cadXY,
    });
  }
  for (const item of landmarks) {
    if (item.kind !== "facility" || item.name === "Guard House") continue;
    points.push({
      id: item.id,
      label: landmarkName(item.name),
      position: item.cadXY,
    });
  }
  const parking = bundle.details?.labels?.find((label) => label.name === "Parking");
  if (parking) {
    points.push({
      id: parking.id,
      label: "Park Parking",
      position: parking.cadXY,
    });
  }
  return points;
}

class MinHeap {
  private items: { node: number; f: number }[] = [];

  get size() {
    return this.items.length;
  }

  push(node: number, f: number) {
    this.items.push({ node, f });
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent].f <= this.items[i].f) break;
      const tmp = this.items[parent];
      this.items[parent] = this.items[i];
      this.items[i] = tmp;
      i = parent;
    }
  }

  pop(): { node: number; f: number } | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length && last) {
      this.items[0] = last;
      let i = 0;
      const len = this.items.length;
      while (true) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < len && this.items[left].f < this.items[smallest].f) smallest = left;
        if (right < len && this.items[right].f < this.items[smallest].f) smallest = right;
        if (smallest === i) break;
        const tmp = this.items[i];
        this.items[i] = this.items[smallest];
        this.items[smallest] = tmp;
        i = smallest;
      }
    }
    return top;
  }
}

function candidateNodesNear(
  graph: LayoutWalkwayGraph,
  point: LayoutPoint,
  maxRadius: number,
  maxCount: number,
  exemptEstateId?: string,
): { index: number; length: number; isPaved: boolean }[] {
  const candidates: { index: number; length: number; isPaved: boolean }[] = [];
  for (let i = 0; i < graph.nodes.length; i++) {
    const d = dist(graph.nodes[i], point);
    if (d <= maxRadius) {
      candidates.push({ index: i, length: d, isPaved: graph.nodeKinds[i] === "paved" });
    }
  }
  candidates.sort((a, b) => a.length - b.length);

  const selected: { index: number; length: number; isPaved: boolean }[] = [];
  let pavedAdded = 0;
  let lawnAdded = 0;

  for (const item of candidates) {
    if (selected.length >= maxCount) break;
    if (item.isPaved && pavedAdded >= Math.ceil(maxCount * 0.65) && lawnAdded < 2) continue;
    if (!item.isPaved && lawnAdded >= Math.ceil(maxCount * 0.65) && pavedAdded < 2) continue;
    // Never connect a start/target point across an ungraded steep hillside gap (> 6 m without lawn plots).
    if (
      item.length > 6 &&
      !isOffRoadSegmentOnGradedLawn(point, graph.nodes[item.index], graph.gradedLawnCells)
    ) {
      continue;
    }
    if (
      item.length > 0.5 &&
      isSegmentBlocked(
        point,
        graph.nodes[item.index],
        graph.hardPolygons,
        graph.estatePolygons,
        graph.barrierSegments,
        graph.parkBoundary,
        exemptEstateId,
      )
    ) {
      continue;
    }
    selected.push(item);
    if (item.isPaved) pavedAdded++;
    else lawnAdded++;
  }

  // Fallback if the point sits slightly outside obstacle margins (e.g. landmark placed inside a building roof).
  if (!selected.length) {
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < graph.nodes.length; i++) {
      if (graph.nodeKinds[i] !== "paved") continue;
      const d = dist(graph.nodes[i], point);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      selected.push({ index: bestIdx, length: bestDist, isPaved: true });
    }
  }

  return selected;
}

function pointToSegmentDist(p: LayoutPoint, a: LayoutPoint, b: LayoutPoint): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  return dist(p, [a[0] + t * dx, a[1] + t * dy]);
}

function smoothLawnSegments(
  points: LayoutPoint[],
  kinds: ("paved" | "lawn")[],
  graph: LayoutWalkwayGraph,
  exemptEstateId?: string,
): LayoutPoint[] {
  if (points.length <= 2) return points;
  const out: LayoutPoint[] = [points[0]];
  let i = 0;
  while (i < points.length - 1) {
    let best = i + 1;
    // Allow string-pulling across consecutive flat-ground lawn segments without clipping obstacles.
    if (kinds[i] === "lawn" || kinds[i + 1] === "lawn") {
      for (let j = points.length - 1; j > i + 1; j--) {
        let allLawnBetween = true;
        for (let k = i + 1; k < j; k++) {
          if (kinds[k] !== "lawn") {
            allLawnBetween = false;
            break;
          }
        }
        if (!allLawnBetween) continue;
        if (
          isOffRoadSegmentOnGradedLawn(points[i], points[j], graph.gradedLawnCells) &&
          !isSegmentBlocked(
            points[i],
            points[j],
            graph.hardPolygons,
            graph.estatePolygons,
            graph.barrierSegments,
            graph.parkBoundary,
            exemptEstateId,
          )
        ) {
          best = j;
          break;
        }
      }
    }
    out.push(points[best]);
    i = best;
  }
  // Keep simplification strictly obstacle-free so curved paths never clip across retaining walls.
  const simplified: LayoutPoint[] = [out[0]];
  for (let idx = 1; idx < out.length - 1; idx++) {
    const prev = simplified[simplified.length - 1];
    const curr = out[idx];
    const next = out[idx + 1];
    const deviation = pointToSegmentDist(curr, prev, next);
    if (
      deviation <= 0.65 &&
      !isSegmentBlocked(
        prev,
        next,
        graph.hardPolygons,
        graph.estatePolygons,
        graph.barrierSegments,
        graph.parkBoundary,
        exemptEstateId,
      )
    ) {
      continue;
    }
    simplified.push(curr);
  }
  if (out.length > 1) simplified.push(out[out.length - 1]);
  return simplified;
}

function buildSteps(
  startLabel: string,
  path: LayoutPoint[],
  plotCenter: LayoutPoint,
  mode: LayoutRouteMode,
  usedLawn: boolean,
): LayoutRouteStep[] {
  const modeHint = mode === "paved"
    ? "along the paved park road and walkway"
    : usedLawn
      ? "using the shortest flat walking path"
      : "along the park pathway";
  const steps: LayoutRouteStep[] = [
    { instruction: `Start from ${startLabel} and walk ${modeHint}`, kind: "start" },
  ];

  let sinceLastTurn = 0;
  for (let i = 1; i < path.length - 1; i++) {
    const a = path[i - 1];
    const b = path[i];
    const c = path[i + 1];
    const segLen = dist(a, b);
    const nextLen = dist(b, c);
    sinceLastTurn += segLen;
    if (sinceLastTurn < 8 || nextLen < 5) continue;

    const dx1 = b[0] - a[0];
    const dy1 = b[1] - a[1];
    const dx2 = c[0] - b[0];
    const dy2 = c[1] - b[1];
    const angle = (Math.atan2(dx1 * dy2 - dy1 * dx2, dx1 * dx2 + dy1 * dy2) * 180) / Math.PI;
    if (Math.abs(angle) < 38) continue;

    const instruction =
      Math.abs(angle) >= 145
        ? "Follow the bend along the road"
        : angle > 0
          ? "Turn left along the route"
          : "Turn right along the route";
    steps.push({ instruction, kind: "turn" });
    sinceLastTurn = 0;
  }

  let sideHint = "";
  if (path.length >= 2) {
    const prev = path[path.length - 2];
    const last = path[path.length - 1];
    const cross =
      (last[0] - prev[0]) * (plotCenter[1] - last[1]) -
      (last[1] - prev[1]) * (plotCenter[0] - last[0]);
    if (Math.abs(cross) > 2) {
      sideHint = cross > 0 ? " on your left" : " on your right";
    }
  }

  steps.push({
    instruction: `Approach the gravesite${sideHint} and check the grave marker`,
    kind: "arrive",
  });

  return steps;
}

export function routeOnParkLayout(
  graph: LayoutWalkwayGraph,
  start: LayoutStartPoint,
  target: CadFeature,
  options?: { mode?: LayoutRouteMode },
): LayoutRoute | null {
  if (!graph.nodes.length || !target.bounds) return null;
  const mode: LayoutRouteMode = options?.mode ?? "shortest";
  const plotCenter: LayoutPoint = [
    (target.bounds[0] + target.bounds[2]) / 2,
    (target.bounds[1] + target.bounds[3]) / 2,
  ];

  // If the target itself lies inside an estate block, exempt only that block during final entry.
  const targetEstateId = graph.estatePolygons.find((poly) => pointInPolygon(plotCenter, poly))?.id;

  const n = graph.nodes.length;
  const startId = n;
  const targetId = n + 1;
  const totalNodes = n + 2;

  const startLinks = candidateNodesNear(graph, start.position, 35, 8);
  const targetLinks = candidateNodesNear(graph, plotCenter, 35, 10, targetEstateId);
  if (!startLinks.length || !targetLinks.length) return null;

  // Map target-entry edge cost by graph node for fast lookup inside A*.
  const targetEntryCost = new Map<number, number>();
  const approachMultiplier = mode === "paved" ? 6.0 : 1.28;
  for (const link of targetLinks) {
    targetEntryCost.set(link.index, link.length * approachMultiplier);
  }

  // Direct local path candidate when already close on flat, graded lawn with no obstacles.
  const directDist = dist(start.position, plotCenter);
  const allowDirect =
    directDist <= 42 &&
    isOffRoadSegmentOnGradedLawn(start.position, plotCenter, graph.gradedLawnCells) &&
    !isSegmentBlocked(
      start.position,
      plotCenter,
      graph.hardPolygons,
      graph.estatePolygons,
      graph.barrierSegments,
      graph.parkBoundary,
      targetEstateId,
    );

  const gScore = new Float64Array(totalNodes).fill(Infinity);
  const previous = new Int32Array(totalNodes).fill(-1);
  const closed = new Uint8Array(totalNodes);
  const heap = new MinHeap();

  gScore[startId] = 0;
  heap.push(startId, directDist);

  while (heap.size > 0) {
    const top = heap.pop()!;
    const current = top.node;
    if (closed[current]) continue;
    closed[current] = 1;
    if (current === targetId) break;

    const currentG = gScore[current];

    if (current === startId) {
      if (allowDirect) {
        const directWeight = mode === "paved" ? 6.0 : 1.28;
        const nextG = currentG + directDist * directWeight;
        if (nextG < gScore[targetId]) {
          gScore[targetId] = nextG;
          previous[targetId] = startId;
          heap.push(targetId, nextG);
        }
      }
      for (const link of startLinks) {
        const mult = link.isPaved && link.length <= 6 ? 1.05 : approachMultiplier;
        const nextG = currentG + link.length * mult;
        if (nextG < gScore[link.index]) {
          gScore[link.index] = nextG;
          previous[link.index] = startId;
          heap.push(link.index, nextG + dist(graph.nodes[link.index], plotCenter));
        }
      }
      continue;
    }

    // Check direct transition into the virtual target node.
    const toTarget = targetEntryCost.get(current);
    if (toTarget !== undefined) {
      const nextG = currentG + toTarget;
      if (nextG < gScore[targetId]) {
        gScore[targetId] = nextG;
        previous[targetId] = current;
        heap.push(targetId, nextG);
      }
    }

    // Relax graph edges using mode-specific surface weights.
    for (const edge of graph.adj[current]) {
      if (closed[edge.to]) continue;
      const nextG = currentG + edge.length * edgeWeight(edge.kind, mode);
      if (nextG < gScore[edge.to]) {
        gScore[edge.to] = nextG;
        previous[edge.to] = current;
        heap.push(edge.to, nextG + dist(graph.nodes[edge.to], plotCenter));
      }
    }
  }

  if (!Number.isFinite(gScore[targetId])) return null;

  // Reconstruct node sequence excluding virtual target node (target becomes final approach point).
  const nodeSeq: number[] = [];
  for (let cur = previous[targetId]; cur !== -1; cur = previous[cur]) {
    nodeSeq.push(cur);
  }
  nodeSeq.reverse();

  // Direct local shortcut case (S -> T directly).
  if (nodeSeq.length === 1 && nodeSeq[0] === startId) {
    const path: LayoutPoint[] = [start.position, plotCenter];
    const approach: LayoutPoint[] = [start.position, plotCenter];
    const totalMeters = Math.max(1, Math.round(directDist * METERS_PER_CAD_UNIT));
    const estimatedMinutes = Math.max(1, Math.round(totalMeters / 72));
    const steps: LayoutRouteStep[] = [
      { instruction: `Walk directly (~${totalMeters} m) across flat ground toward the gravesite`, kind: "start" },
      { instruction: "Approach the gravesite and check the grave marker", kind: "arrive" },
    ];
    return { start, path, approach, steps, distanceMeters: totalMeters, estimatedMinutes, mode };
  }

  const rawPoints: LayoutPoint[] = [];
  const rawKinds: ("paved" | "lawn")[] = [];
  let usedLawn = false;

  for (const id of nodeSeq) {
    if (id === startId) {
      rawPoints.push(start.position);
      rawKinds.push("lawn");
    } else {
      rawPoints.push(graph.nodes[id]);
      const kind = graph.nodeKinds[id];
      rawKinds.push(kind);
      if (kind === "lawn") usedLawn = true;
    }
  }

  // Drop start.position if the first graph node is essentially the same spot (< 2 m).
  if (rawPoints.length >= 2 && dist(rawPoints[0], rawPoints[1]) < 2) {
    rawPoints.shift();
    rawKinds.shift();
  }

  const path = smoothLawnSegments(rawPoints, rawKinds, graph, targetEstateId);
  const approachStart = path[path.length - 1] ?? start.position;
  const approach: LayoutPoint[] = [approachStart, plotCenter];

  // Measure honest physical walking distance in meters (never inflated by surface preference weights).
  let physicalUnits = 0;
  for (let i = 1; i < path.length; i++) {
    physicalUnits += dist(path[i - 1], path[i]);
  }
  physicalUnits += dist(approachStart, plotCenter);

  const distanceMeters = Math.max(1, Math.round(physicalUnits * METERS_PER_CAD_UNIT));
  const estimatedMinutes = Math.max(1, Math.round(distanceMeters / 72));
  const steps = buildSteps(start.label, path, plotCenter, mode, usedLawn);

  return { start, path, approach, steps, distanceMeters, estimatedMinutes, mode };
}
