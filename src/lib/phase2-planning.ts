import { validateCadDetails, type CadDetails } from "./phase2-cad-details";
import { validatePlotCoordinates, type PlotCoordinateReferences } from "./phase2-plot-coordinates";

export type Position = [number, number, ...number[]]
export type Bounds = [number, number, number, number]
export type Shape =
  | { kind: 'point'; positions: Position }
  | { kind: 'line'; positions: Position[] }
  | { kind: 'polygon'; positions: Position[][] }
  | { kind: 'collection'; parts: Shape[] }

export type LayerKey = 'lawn' | 'estates' | 'blocks' | 'boundary' | 'roads' | 'paths' | 'context' | 'overlaps'
export type Visibility = Record<LayerKey, boolean>
export interface CadFeature {
  id: string
  fid: number
  shape: Shape
  bounds: Bounds
  properties: Record<string, string | null>
  review?: { nativeQgisShapeMismatch: boolean; overlapReviewFids: number[] }
}
export interface LocalData {
  format: 'gravenav-local-cartesian-v1'
  coordinateSystem: { type: 'local-cartesian'; georeferenced: false; units: string }
  bounds: Bounds
  source: { package: string; sha256: string }
  layerSummary: Record<LayerKey, { count: number; bounds: Bounds; sourceTable: string }>
  layers: Record<LayerKey, CadFeature[]>
}

export const layerDefinitions: { key: LayerKey; name: string; description: string }[] = [
  { key: 'lawn', name: 'Lawn plots', description: 'CAD plot candidates' },
  { key: 'estates', name: 'Estate lots', description: 'Internal estate outlines' },
  { key: 'blocks', name: 'Estate blocks', description: 'Block envelopes' },
  { key: 'boundary', name: 'Cemetery boundary', description: 'Property-line candidate' },
  { key: 'roads', name: 'Roads', description: 'CAD road edges' },
  { key: 'paths', name: 'Pathways', description: 'CAD pedestrian linework' },
]

export const initialVisibility: Visibility = {
  lawn: true, estates: true, blocks: true, boundary: true,
  roads: true, paths: true, context: false, overlaps: false,
}

export function featureLayer(feature: CadFeature): LayerKey {
  return feature.id.split(':')[0] as LayerKey
}

// A mausoleum is one selectable block even though the CAD has 12 inner spaces.
// Fail closed if the source grouping is incomplete or ambiguous.
export function mausoleumEnvelope(data: LocalData, feature: CadFeature): CadFeature | null {
  const handle = feature.properties.root_handle
  if (featureLayer(feature) !== 'estates' || !handle) return null
  const spaces = data.layers.estates.filter(item => item.properties.root_handle === handle)
  const envelopes = data.layers.blocks.filter(item => item.properties.root_handle === handle)
  return spaces.length === 12 && envelopes.length === 1 ? envelopes[0] : null
}

export function landmarkName(name: string): string {
  if (name === "NEW MPH (CAD name)") return "Multipurpose hall";
  if (name === "Standard Gazebo") return "Gazebo";
  return name;
}

// Leaflet calls these lat/lng; with CRS.Simple they are strictly local Y/X.
export function cadToMap(position: Position): [number, number] {
  return [position[1], position[0]]
}

export function mapBounds(bounds: Bounds): [[number, number], [number, number]] {
  return [[bounds[1], bounds[0]], [bounds[3], bounds[2]]]
}

export function validateData(value: unknown): LocalData {
  const data = value as LocalData
  if (data?.format !== 'gravenav-local-cartesian-v1' ||
      data.coordinateSystem?.type !== 'local-cartesian' || data.coordinateSystem.georeferenced !== false) {
    throw new Error('The map asset is not an unreferenced local Cartesian dataset.')
  }
  const counts: Record<LayerKey, number> = {
    lawn: 4146, estates: 348, blocks: 29, boundary: 1, roads: 153, paths: 196, context: 1152, overlaps: 20,
  }
  const finiteBounds = (bounds: Bounds) => Array.isArray(bounds) && bounds.length === 4 && bounds.every(Number.isFinite) && bounds[0] <= bounds[2] && bounds[1] <= bounds[3]
  const position = (p: unknown): p is Position => Array.isArray(p) && p.length >= 2 && p.length <= 4 && p.every(Number.isFinite)
  const shape = (s: Shape, depth = 0): boolean => {
    if (!s || depth > 4) return false
    if (s.kind === 'point') return position(s.positions)
    if (s.kind === 'line') return Array.isArray(s.positions) && s.positions.length >= 2 && s.positions.every(position)
    if (s.kind === 'polygon') return Array.isArray(s.positions) && s.positions.length > 0 && s.positions.every(r =>
      Array.isArray(r) && r.length >= 4 && r.every(position) && r[0].every((v, i) => v === r[r.length - 1][i]))
    return s.kind === 'collection' && Array.isArray(s.parts) && s.parts.length > 0 && s.parts.every(p => shape(p, depth + 1))
  }
  if (!finiteBounds(data.bounds)) throw new Error('The map has invalid local bounds.')
  if (!data.source || !/^[a-f0-9]{64}$/i.test(data.source.sha256)) throw new Error('The map source reference is missing.')
  const ids = new Set<string>()
  for (const [key, count] of Object.entries(counts)) {
    const features = data.layers?.[key as LayerKey]
    const summary = data.layerSummary?.[key as LayerKey]
    if (!summary || summary.count !== count || !finiteBounds(summary.bounds) || !Array.isArray(features) || features.length !== count || features.some(f => {
      if (!f || !Number.isInteger(f.fid) || f.id !== `${key}:${f.fid}` || ids.has(f.id) || !finiteBounds(f.bounds) || !f.properties || !shape(f.shape)) return true
      ids.add(f.id)
      return (key === 'lawn' || key === 'estates') && (f.shape.kind !== 'polygon' || !f.properties.instance_path || f.properties.plot_identifier !== null)
    })) {
      throw new Error(`The ${key} map data is incomplete or invalid. Restore the supplied planning dataset.`)
    }
  }
  return data
}

export type LandscapeRole = "base" | "roads" | "paths" | "protection" | "trees";
export interface PlanningPlaces {
  sourcePackageSha256: string;
  geometrySha256: string;
  landmarks: { id: string; name: string; kind: string; cadXY: [number, number] }[];
}
export interface PlanningLandscape {
  format: string;
  bounds: Bounds;
  sourceSha256: string;
  dataSha256: string;
  candidateCount: number;
  layers: Record<LandscapeRole, { image: string; sha256: string }>;
  wallAlignment: Position[];
  roadEvidence: { closure: Position[] };
  pathways: { provisionalEnds: Position[][] }[];
}
export interface PlanningBundle {
  data: LocalData;
  landscape: PlanningLandscape;
  places: PlanningPlaces;
  details: CadDetails;
  coordinates: PlotCoordinateReferences;
}
export const planningAssetRoot = "/phase2-viewer/";
export const planningDataSha256 = "02a4dba490872f9be8cf56280ccf432d31796431c1f808f542fbff86ac28ca77";
const frozenDigests = {
  data: planningDataSha256,
  landscape: "7231314fc2aa5ad72df98a050bea717a069591a08dca82700d7e62e96b1c9ebc",
  places: "ccb2ef4624573ff918e789ec9035efccf847880c5908ea91c9e9111ce03c381b",
  details: "00fd5a81075418e916a11ae28d442d57534ee0fb6dbf57b3ad43eaa584ab1de5",
  coordinates: "11939315dbd2ea87de374e57290bb96acd6f1bf6a30a9f136b71c441b91c7b23",
};
async function verifiedJson(url: string, expected: string) {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error("The Phase 2 map files could not be loaded.");
  const bytes = await response.arrayBuffer();
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (digest !== expected) throw new Error("The Phase 2 map files differ from the verified release.");
  return JSON.parse(new TextDecoder().decode(bytes));
}

type PlanningCoreBundle = Omit<PlanningBundle, "coordinates">;
const emptyCoordinates = { entries: {} } as unknown as PlotCoordinateReferences;

let cachedCorePromise: Promise<PlanningCoreBundle> | null = null;
let cachedCoordinatesPromise: Promise<PlotCoordinateReferences> | null = null;

export function clearPlanningBundleCache() {
  cachedCorePromise = null;
  cachedCoordinatesPromise = null;
}

function loadPlanningCore(): Promise<PlanningCoreBundle> {
  if (!cachedCorePromise) {
    cachedCorePromise = (async () => {
      const [raw, landscape, places, rawDetails] = await Promise.all([
        verifiedJson(planningAssetRoot + "data/phase2.local.json", frozenDigests.data),
        verifiedJson(planningAssetRoot + "landscape/manifest.json", frozenDigests.landscape),
        verifiedJson("/phase2-planning/places.json", frozenDigests.places),
        verifiedJson("/phase2-planning/cad-details/manifest.json", frozenDigests.details),
      ]);
      const data = validateData(raw);
      if (landscape.format !== "gravenav-full-landscape-v1" ||
          landscape.sourceSha256 !== data.source.sha256 || landscape.dataSha256 !== frozenDigests.data ||
          landscape.candidateCount !== 4494 || places.sourcePackageSha256 !== data.source.sha256 ||
          places.geometrySha256 !== frozenDigests.data || places.landmarks.length !== 9) {
        throw new Error("The landscape and CAD references do not match.");
      }
      const details = validateCadDetails(rawDetails, frozenDigests.data);
      if (details.bounds.some((coordinate, index) => coordinate !== landscape.bounds[index])) {
        throw new Error("The CAD details and landscape use different map extents.");
      }
      return { data, landscape, places, details };
    })().catch((reason) => {
      cachedCorePromise = null;
      throw reason;
    });
  }
  return cachedCorePromise;
}

function loadPlanningCoordinates(core: PlanningCoreBundle): Promise<PlotCoordinateReferences> {
  if (!cachedCoordinatesPromise) {
    cachedCoordinatesPromise = verifiedJson("/phase2-planning/plot-coordinates.json", frozenDigests.coordinates)
      .then((rawCoordinates) =>
        validatePlotCoordinates(rawCoordinates, frozenDigests.data, [...core.data.layers.lawn, ...core.data.layers.estates]),
      )
      .catch((reason) => {
        cachedCoordinatesPromise = null;
        throw reason;
      });
  }
  return cachedCoordinatesPromise;
}

export async function loadPlanningBundle(
  signal?: AbortSignal,
  options?: { includeCoordinates?: boolean; bypassCache?: boolean },
): Promise<PlanningBundle> {
  if (options?.bypassCache) clearPlanningBundleCache();
  const includeCoordinates = Boolean(options?.includeCoordinates);
  const work = (async () => {
    const core = await loadPlanningCore();
    const coordinates = includeCoordinates ? await loadPlanningCoordinates(core) : emptyCoordinates;
    return { ...core, coordinates };
  })();
  if (!signal) return work;
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  return new Promise<PlanningBundle>((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (value) => { signal.removeEventListener("abort", onAbort); resolve(value); },
      (reason) => { signal.removeEventListener("abort", onAbort); reject(reason); },
    );
  });
}
