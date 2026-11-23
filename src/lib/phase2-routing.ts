// @ts-expect-error Native Node contract tests use explicit TypeScript extensions.
import { distanceMeters, usablePosition } from "./navigation-geo.ts";
import type { GpsPosition } from "./navigation-geo";
import type { PhaseTwoGeography } from "./phase2-geographic";
import type { PublicGisFeature } from "./supabase/gis-types";

type Point = [number, number]; // longitude, latitude, never CAD X/Y
export type PhaseTwoNavigationPolicy = {
  releaseId: string; scopeRevision: number;
  maxAccuracyM: number; maxOffRouteM: number; arrivalDistanceM: number; maxFixAgeMs: number;
};
export type PhaseTwoRouteState = "ready" | "arrived" | "policy_unavailable" | "no_destination" | "no_network"
  | "location_unavailable" | "stale" | "inaccurate" | "outside" | "off_route" | "unreachable";
export type PhaseTwoRoute = { state: PhaseTwoRouteState; coordinates: Point[]; distanceM: number | null };
type Arc = { to: string; cost: number; coordinates: Point[] };
type Edge = { from: string; to: string; forward: number | null; reverse: number | null; coordinates: Point[] };

function parseSinglePolicy(value: unknown, data: Pick<PhaseTwoGeography, "releaseId" | "scopeRevision">): PhaseTwoNavigationPolicy | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.releaseId !== data.releaseId || candidate.scopeRevision !== data.scopeRevision ||
      typeof candidate.reviewReference !== "string" || !candidate.reviewReference.trim() || candidate.reviewReference.length > 250) return null;
  for (const key of ["maxAccuracyM", "maxOffRouteM", "arrivalDistanceM", "maxFixAgeMs"]) {
    if (typeof candidate[key] !== "number" || !Number.isFinite(candidate[key]) || (candidate[key] as number) <= 0) return null;
  }
  // A reviewed policy can tighten the existing GPS freshness ceiling, never extend it.
  if ((candidate.maxFixAgeMs as number) > 30000) return null;
  return {
    releaseId: candidate.releaseId as string,
    scopeRevision: candidate.scopeRevision as number,
    maxAccuracyM: candidate.maxAccuracyM as number,
    maxOffRouteM: candidate.maxOffRouteM as number,
    arrivalDistanceM: candidate.arrivalDistanceM as number,
    maxFixAgeMs: candidate.maxFixAgeMs as number,
  };
}

export function readNavigationPolicy(raw: string | undefined, data: Pick<PhaseTwoGeography, "releaseId" | "scopeRevision">): PhaseTwoNavigationPolicy | null {
  try {
    const value = JSON.parse(raw || "null");
    if (Array.isArray(value)) {
      const matches = value.filter(
        entry => entry && typeof entry === "object" && !Array.isArray(entry) &&
          (entry as Record<string, unknown>).releaseId === data.releaseId &&
          (entry as Record<string, unknown>).scopeRevision === data.scopeRevision,
      );
      if (matches.length !== 1) return null;
      return parseSinglePolicy(matches[0], data);
    }
    return parseSinglePolicy(value, data);
  } catch { return null; }
}
const empty = (state: PhaseTwoRouteState): PhaseTwoRoute => ({ state, coordinates: [], distanceM: null });
const point = (value: unknown): value is Point => Array.isArray(value) && value.length === 2 &&
  value.every(Number.isFinite) && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
const same = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];
const location = (p: Point) => ({ longitude: p[0], latitude: p[1] });
const length = (line: Point[]) => line.slice(1).reduce((total, p, i) => total + distanceMeters(location(line[i]), location(p)), 0);
const unique = (line: Point[]) => line.filter((p, i) => !i || !same(p, line[i - 1]));

function inRing(p: Point, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function onRing(p: Point, ring: Point[]): boolean {
  return ring.some((a, i) => {
    const b = ring[(i + 1) % ring.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    // Numeric equality only: this is not an assumed physical corridor buffer.
    const epsilon = Number.EPSILON * Math.max(1, Math.abs(a[0]), Math.abs(a[1]), Math.abs(b[0]), Math.abs(b[1])) * 4;
    return Math.abs(dx * (p[1] - a[1]) - dy * (p[0] - a[0])) <= epsilon * Math.max(Math.abs(dx), Math.abs(dy)) &&
      p[0] >= Math.min(a[0], b[0]) - epsilon && p[0] <= Math.max(a[0], b[0]) + epsilon &&
      p[1] >= Math.min(a[1], b[1]) - epsilon && p[1] <= Math.max(a[1], b[1]) + epsilon;
  });
}
function inside(p: Point, feature: PublicGisFeature, includeBoundary = true): boolean {
  if (feature.geometry.type !== "Polygon") return false;
  const rings = feature.geometry.coordinates as Point[][];
  return rings.length > 0 && rings.every(ring => ring.every(point)) &&
    (onRing(p, rings[0]) ? includeBoundary : inRing(p, rings[0])) && !rings.slice(1).some(ring => onRing(p, ring) || inRing(p, ring));
}
function graph(data: PhaseTwoGeography) {
  const nodes = new Map<string, Point>();
  for (const feature of data.layers.nodes) {
    const id = feature.properties.nodeId;
    if (typeof id !== "string" || nodes.has(id) || feature.geometry.type !== "Point" || !point(feature.geometry.coordinates)) return null;
    nodes.set(id, feature.geometry.coordinates);
  }
  const adjacency = new Map<string, Arc[]>();
  const edges: Edge[] = [];
  const add = (from: string, arc: Arc) => adjacency.set(from, [...(adjacency.get(from) || []), arc]);
  const ids = new Set<string>();
  for (const feature of data.layers.edges) {
    const p = feature.properties;
    const from = p.fromNodeId, to = p.toNodeId, direction = p.direction;
    const line = feature.geometry.coordinates as Point[];
    if (ids.has(feature.id) || typeof from !== "string" || typeof to !== "string" || from === to ||
        !nodes.has(from) || !nodes.has(to) || feature.geometry.type !== "LineString" || line.length < 2 || !line.every(point) ||
        !same(line[0], nodes.get(from)!) || !same(line[line.length - 1], nodes.get(to)!) ||
        p.walkingAllowed === false || p.isRestricted === true ||
        !["both", "forward", "reverse"].includes(String(direction))) return null;
    ids.add(feature.id);
    const validCost = (cost: unknown): cost is number => typeof cost === "number" && Number.isFinite(cost) && cost > 0;
    const forward = direction === "both" || direction === "forward";
    const reverse = direction === "both" || direction === "reverse";
    if ((forward ? !validCost(p.forwardCostM) : p.forwardCostM !== null) ||
        (reverse ? !validCost(p.reverseCostM) : p.reverseCostM !== null) || length(line) <= 0) return null;
    const edge: Edge = { from, to, coordinates: line, forward: forward ? p.forwardCostM as number : null, reverse: reverse ? p.reverseCostM as number : null };
    edges.push(edge);
    if (edge.forward !== null) add(from, { to, cost: edge.forward, coordinates: line });
    if (edge.reverse !== null) add(to, { to: from, cost: edge.reverse, coordinates: [...line].reverse() });
  }
  return edges.length ? { nodes, adjacency, edges } : null;
}
function nearestOnEdge(origin: Point, edge: Edge) {
  const scale = Math.cos(origin[1] * Math.PI / 180);
  let best: { gap: number; prefix: Point[]; suffix: Point[] } | null = null;
  for (let i = 0; i < edge.coordinates.length - 1; i++) {
    const a = edge.coordinates[i], b = edge.coordinates[i + 1];
    const dx = (b[0] - a[0]) * scale, dy = b[1] - a[1];
    const squared = dx * dx + dy * dy;
    const t = squared ? Math.max(0, Math.min(1, (((origin[0] - a[0]) * scale) * dx + (origin[1] - a[1]) * dy) / squared)) : 0;
    const p: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const gap = distanceMeters(location(origin), location(p));
    if (!best || gap < best.gap) best = { gap, prefix: unique([...edge.coordinates.slice(0, i + 1), p]),
      suffix: unique([p, ...edge.coordinates.slice(i + 1)]) };
  }
  return best!;
}

export function routePhaseTwo(data: PhaseTwoGeography, fix: GpsPosition | null, now = Date.now()): PhaseTwoRoute {
  const policy = data.navigationPolicy;
  if (!policy || policy.releaseId !== data.releaseId || policy.scopeRevision !== data.scopeRevision) return empty("policy_unavailable");
  if (!data.target || !data.accessPoint || data.target.properties.lotId !== data.accessPoint.properties.lotId) return empty("no_destination");
  const network = graph(data);
  const targetId = data.accessPoint.properties.nodeId;
  if (!network || typeof targetId !== "string" || !network.nodes.has(targetId) ||
      !point(data.accessPoint.geometry.coordinates) || !same(network.nodes.get(targetId)!, data.accessPoint.geometry.coordinates)) return empty("no_network");
  if (!fix || !point([fix.longitude, fix.latitude]) || !Number.isFinite(fix.accuracy) || fix.accuracy < 0) return empty("location_unavailable");
  if (!usablePosition(fix, now) || now - fix.timestamp > policy.maxFixAgeMs) return empty("stale");
  if (fix.accuracy > policy.maxAccuracyM) return empty("inaccurate");
  const origin: Point = [fix.longitude, fix.latitude];
  const site = data.layers.boundaries.filter(feature => feature.properties.kind === "cemetery");
  const bounds = site.length ? site : data.layers.boundaries.filter(feature => feature.properties.kind === "area");
  if (!bounds.some(feature => inside(origin, feature))) return empty("outside");
  if (data.layers.plots.some(feature => inside(origin, feature, false))) return empty("off_route");
  const options = network.edges.map(edge => ({ edge, ...nearestOnEdge(origin, edge) })).sort((a, b) => a.gap - b.gap);
  const snapped = options[0];
  if (snapped.gap > policy.maxOffRouteM) return empty("off_route");

  // Start on a reviewed edge, never draw an unsurveyed GPS-to-node/grave connector.
  const distances = new Map<string, number>();
  const paths = new Map<string, Point[]>();
  const seed = (id: string, cost: number, line: Point[]) => {
    if (cost < (distances.get(id) ?? Infinity)) { distances.set(id, cost); paths.set(id, line); }
  };
  const total = length(snapped.edge.coordinates);
  if (snapped.edge.reverse !== null || length(snapped.prefix) === 0) seed(snapped.edge.from,
    length(snapped.prefix) / total * (snapped.edge.reverse ?? 0), [...snapped.prefix].reverse());
  if (snapped.edge.forward !== null || length(snapped.suffix) === 0) seed(snapped.edge.to,
    length(snapped.suffix) / total * (snapped.edge.forward ?? 0), snapped.suffix);
  const pending = new Set(network.nodes.keys());
  while (pending.size) {
    let current: string | null = null;
    for (const id of pending) if (Number.isFinite(distances.get(id)) &&
      (current === null || distances.get(id)! < distances.get(current)!)) current = id;
    if (current === null) break;
    pending.delete(current);
    if (current === targetId) break;
    for (const arc of network.adjacency.get(current) || []) {
      const cost = distances.get(current)! + arc.cost;
      if (pending.has(arc.to) && cost < (distances.get(arc.to) ?? Infinity)) {
        distances.set(arc.to, cost);
        paths.set(arc.to, [...paths.get(current)!, ...arc.coordinates.slice(1)]);
      }
    }
  }
  const coordinates = paths.get(targetId), distanceM = distances.get(targetId);
  if (!coordinates || distanceM === undefined) return empty("unreachable");
  const arrival = distanceM <= policy.arrivalDistanceM &&
    distanceMeters(fix, location(network.nodes.get(targetId)!)) + fix.accuracy <= policy.arrivalDistanceM;
  return { state: arrival ? "arrived" : "ready", coordinates: unique(coordinates), distanceM };
}

export function routePhaseTwoFromEntrance(data: PhaseTwoGeography): PhaseTwoRoute {
  if (!data.target || !data.accessPoint || data.target.properties.lotId !== data.accessPoint.properties.lotId) {
    return empty("no_destination");
  }
  const network = graph(data);
  const targetId = data.accessPoint.properties.nodeId;
  if (!network || typeof targetId !== "string" || !network.nodes.has(targetId) ||
      !point(data.accessPoint.geometry.coordinates) || !same(network.nodes.get(targetId)!, data.accessPoint.geometry.coordinates)) {
    return empty("no_network");
  }
  const entranceFeature =
    data.layers.nodes.find((feature) => {
      const kind = String(feature.properties.nodeType ?? feature.properties.node_type ?? "").toLowerCase();
      return kind === "main_entrance" || kind === "entrance";
    }) ?? data.layers.nodes[0];
  const startId = entranceFeature?.properties.nodeId;
  if (typeof startId !== "string" || !network.nodes.has(startId)) return empty("no_network");
  if (startId === targetId) return { state: "ready", coordinates: [network.nodes.get(targetId)!], distanceM: 0 };

  const distances = new Map<string, number>([[startId, 0]]);
  const paths = new Map<string, Point[]>([[startId, [network.nodes.get(startId)!]]]);
  const pending = new Set(network.nodes.keys());
  while (pending.size) {
    let current: string | null = null;
    for (const id of pending) {
      if (Number.isFinite(distances.get(id)) && (current === null || distances.get(id)! < distances.get(current)!)) {
        current = id;
      }
    }
    if (current === null) break;
    pending.delete(current);
    if (current === targetId) break;
    for (const arc of network.adjacency.get(current) || []) {
      const cost = distances.get(current)! + arc.cost;
      if (pending.has(arc.to) && cost < (distances.get(arc.to) ?? Infinity)) {
        distances.set(arc.to, cost);
        paths.set(arc.to, [...paths.get(current)!, ...arc.coordinates.slice(1)]);
      }
    }
  }
  const coordinates = paths.get(targetId);
  const distanceM = distances.get(targetId);
  if (!coordinates || distanceM === undefined) return empty("unreachable");
  return { state: "ready", coordinates: unique(coordinates), distanceM };
}

export type WalkingStep = { instruction: string; distanceM: number | null };

export function walkingSteps(route: PhaseTwoRoute): WalkingStep[] {
  const line = route.coordinates;
  if (route.state !== "ready" || line.length < 2) return [];
  const steps: WalkingStep[] = [];
  let instruction = "Follow the highlighted path";
  let distanceM = 0;
  for (let i = 1; i < line.length; i++) {
    const [a, b, c] = [line[i - 1], line[i], line[i + 1]];
    distanceM += distanceMeters(location(a), location(b));
    if (!c) continue;
    const scale = Math.cos(b[1] * Math.PI / 180);
    const [dx, dy] = [(b[0] - a[0]) * scale, b[1] - a[1]];
    const [nx, ny] = [(c[0] - b[0]) * scale, c[1] - b[1]];
    const turn = Math.atan2(dx * ny - dy * nx, dx * nx + dy * ny) * 180 / Math.PI;
    if (Math.abs(turn) < 45 || distanceM < 4 || distanceMeters(location(b), location(c)) < 4) continue;
    steps.push({ instruction, distanceM });
    instruction = Math.abs(turn) >= 150 ? "Follow the bend in the path" : turn > 0 ? "Turn left along the path" : "Turn right along the path";
    distanceM = 0;
  }
  steps.push({ instruction, distanceM }, { instruction: "Approach the gravesite and check the marker", distanceM: null });
  return steps;
}
