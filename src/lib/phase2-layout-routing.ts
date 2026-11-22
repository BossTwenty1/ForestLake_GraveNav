import { PARK_ADDRESS, PARK_NAME } from "./park-details";
import { landmarkName, type CadFeature, type PlanningBundle } from "./phase2-planning";

export type LayoutPoint = [number, number];
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
};

type EdgeKind = "road" | "path" | "cross";
type GraphEdge = { to: number; cost: number; kind: EdgeKind };
export type LayoutWalkwayGraph = {
  nodes: LayoutPoint[];
  adj: GraphEdge[][];
};

export const PARK_ENTRANCE_MAPS_URL =
  "https://www.google.com/maps/search/?api=1&query=" +
  encodeURIComponent(`${PARK_NAME}, ${PARK_ADDRESS}`);

function dist(a: LayoutPoint, b: LayoutPoint) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
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

export function buildLayoutWalkwayGraph(bundle: PlanningBundle): LayoutWalkwayGraph {
  const nodes: LayoutPoint[] = [];
  const adj: GraphEdge[][] = [];
  const keyMap = new Map<string, number>();

  function addNode(x: number, y: number) {
    const key = `${Math.round(x)},${Math.round(y)}`;
    const existing = keyMap.get(key);
    if (existing !== undefined) return existing;
    const id = nodes.length;
    nodes.push([x, y]);
    adj.push([]);
    keyMap.set(key, id);
    return id;
  }

  function link(a: number, b: number, cost: number, kind: EdgeKind) {
    if (a === b || !Number.isFinite(cost) || cost <= 0) return;
    adj[a].push({ to: b, cost, kind });
    adj[b].push({ to: a, cost, kind });
  }

  const segments: { kind: "road" | "path"; pts: LayoutPoint[] }[] = [
    ...extractLines(bundle.data?.layers?.roads).map((pts) => ({ kind: "road" as const, pts })),
    ...extractLines(bundle.data?.layers?.paths).map((pts) => ({ kind: "path" as const, pts })),
  ];

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
          );
          if (prev !== null) link(prev, id, dist(nodes[prev], nodes[id]), segment.kind);
          prev = id;
        }
      }
      const id = addNode(cur[0], cur[1]);
      if (prev !== null) link(prev, id, dist(nodes[prev], nodes[id]), segment.kind);
      prev = id;
    }
  }

  // Connect road/walkway junctions within 3.5 drawing units.
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d = dist(nodes[i], nodes[j]);
      if (d <= 3.5) link(i, j, d * 1.1, "cross");
    }
  }

  // Bridge parallel curb/walkway edges into one connected pedestrian network.
  const findComponents = () => {
    const comp = new Int32Array(nodes.length).fill(-1);
    let count = 0;
    for (let i = 0; i < nodes.length; i++) {
      if (comp[i] !== -1) continue;
      const queue = [i];
      comp[i] = count;
      while (queue.length) {
        const current = queue.pop()!;
        for (const edge of adj[current]) {
          if (comp[edge.to] === -1) {
            comp[edge.to] = count;
            queue.push(edge.to);
          }
        }
      }
      count++;
    }
    return { comp, count };
  };

  let { comp, count } = findComponents();
  while (count > 1) {
    const best = new Map<number, { u: number; v: number; d: number }>();
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (comp[i] === comp[j]) continue;
        const d = dist(nodes[i], nodes[j]);
        if (d > 15) continue;
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
      link(bridge.u, bridge.v, bridge.d * 1.2, "cross");
    }
    ({ comp, count } = findComponents());
  }

  return { nodes, adj };
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

function nearestNode(graph: LayoutWalkwayGraph, target: LayoutPoint): number {
  let bestIndex = -1;
  let bestDist = Infinity;
  for (let i = 0; i < graph.nodes.length; i++) {
    const d = dist(graph.nodes[i], target);
    if (d < bestDist) {
      bestDist = d;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function pointToSegmentDist(p: LayoutPoint, a: LayoutPoint, b: LayoutPoint) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  return dist(p, [a[0] + t * dx, a[1] + t * dy]);
}

function simplifyPath(points: LayoutPoint[], tolerance = 0.85): LayoutPoint[] {
  if (points.length <= 2) return points;
  let maxDist = 0;
  let index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = pointToSegmentDist(points[i], points[0], points[end]);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist > tolerance) {
    const left = simplifyPath(points.slice(0, index + 1), tolerance);
    const right = simplifyPath(points.slice(index), tolerance);
    return [...left.slice(0, -1), ...right];
  }
  return [points[0], points[end]];
}

function buildSteps(startLabel: string, path: LayoutPoint[], plotCenter: LayoutPoint): LayoutRouteStep[] {
  const steps: LayoutRouteStep[] = [
    { instruction: `Start from ${startLabel} and follow the park pathway`, kind: "start" },
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
          ? "Turn left along the pathway"
          : "Turn right along the pathway";
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
): LayoutRoute | null {
  if (!graph.nodes.length || !target.bounds) return null;
  const plotCenter: LayoutPoint = [
    (target.bounds[0] + target.bounds[2]) / 2,
    (target.bounds[1] + target.bounds[3]) / 2,
  ];
  const startNode = nearestNode(graph, start.position);
  const endNode = nearestNode(graph, plotCenter);
  if (startNode < 0 || endNode < 0) return null;

  const n = graph.nodes.length;
  const distances = new Float64Array(n).fill(Infinity);
  const previous = new Int32Array(n).fill(-1);
  const visited = new Uint8Array(n);
  distances[startNode] = 0;

  for (let step = 0; step < n; step++) {
    let current = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      if (!visited[i] && distances[i] < best) {
        best = distances[i];
        current = i;
      }
    }
    if (current === -1 || current === endNode) break;
    visited[current] = 1;
    for (const edge of graph.adj[current]) {
      if (visited[edge.to]) continue;
      const nextDist = best + edge.cost;
      if (nextDist < distances[edge.to]) {
        distances[edge.to] = nextDist;
        previous[edge.to] = current;
      }
    }
  }

  if (!Number.isFinite(distances[endNode])) return null;

  const rawPath: LayoutPoint[] = [];
  for (let cur = endNode; cur !== -1; cur = previous[cur]) {
    rawPath.push(graph.nodes[cur]);
  }
  rawPath.reverse();

  const path = simplifyPath(rawPath, 0.85);
  const approachStart = path[path.length - 1] ?? graph.nodes[endNode];
  const approach: LayoutPoint[] = [approachStart, plotCenter];
  const steps = buildSteps(start.label, path, plotCenter);

  return { start, path, approach, steps };
}
