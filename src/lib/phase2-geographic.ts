// @ts-expect-error Native Node contract tests require the explicit TypeScript extension.
import { parseGisBigintId } from "./supabase/gis-types.ts";
import type { GeoJsonGeometry, PublicBurialGis, PublicGisFeature, PublicMappingLayer, PublicMappingPage } from "./supabase/gis-types";
import type { PublicBurialRecord } from "./supabase/types";

export type PhaseTwoScope = { siteId: string; areaId: string };
export type PhaseTwoReader = {
  layer: (args: PhaseTwoScope & { layer: PublicMappingLayer; page: number; pageSize: number; expectedReleaseId?: string }) => Promise<PublicMappingPage>;
  burial: (id: string) => Promise<PublicBurialGis | null>;
};
export type PhaseTwoGeography = {
  releaseId: string;
  scopeRevision: number;
  layers: Record<PublicMappingLayer, PublicGisFeature[]>;
  target: PublicGisFeature | null;
  accessPoint: PublicGisFeature | null;
  destinationMessage: string;
};
export type PhaseTwoResult = { state: "ready" | "scope_unavailable" | "no_published_release" | "unavailable"; message: string; data: PhaseTwoGeography | null };

export function phaseTwoScope(siteId?: string, areaId?: string): PhaseTwoScope | null {
  try {
    return { siteId: parseGisBigintId(siteId, "siteId"), areaId: parseGisBigintId(areaId, "areaId") };
  } catch { return null; }
}

function validGeometry(geometry: GeoJsonGeometry): boolean {
  const point = (value: unknown): value is number[] => Array.isArray(value) && value.length === 2 &&
    value.every(Number.isFinite) && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
  if (geometry.type === "Point") return point(geometry.coordinates);
  if (geometry.type === "LineString") return geometry.coordinates.length >= 2 && geometry.coordinates.every(point);
  return geometry.type === "Polygon" && geometry.coordinates.length > 0 && geometry.coordinates.every((ring) =>
    Array.isArray(ring) && ring.length >= 4 && ring.every(point) &&
    ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]);
}

const layers: PublicMappingLayer[] = ["boundaries", "plots", "access_points", "walkways", "nodes", "edges", "landmarks"];
const geometryTypes: Record<PublicMappingLayer, string[]> = {
  boundaries: ["Polygon"], plots: ["Polygon"], access_points: ["Point"], walkways: ["LineString"],
  nodes: ["Point"], edges: ["LineString"], landmarks: ["Point", "Polygon"],
};

export async function loadPhaseTwoGeography(reader: PhaseTwoReader, scope: PhaseTwoScope | null, record: PublicBurialRecord | null = null): Promise<PhaseTwoResult> {
  if (!scope) return { state: "scope_unavailable", message: "The approved Phase 2 pilot area has not been configured.", data: null };
  try {
    const first = await reader.layer({ ...scope, layer: "boundaries", page: 1, pageSize: 200 });
    if (!first.releaseId) {
      if (first.features.length || first.total) throw new Error("Unpublished features");
      return { state: "no_published_release", message: "No approved geographic release is currently published for this Phase 2 area.", data: null };
    }
    const releaseId = first.releaseId;
    const output = {} as Record<PublicMappingLayer, PublicGisFeature[]>;
    for (const layer of layers) {
      const features: PublicGisFeature[] = [];
      let total = 0;
      let totalPages = 1;
      for (let page = 1; page <= totalPages; page++) {
        const result = layer === "boundaries" && page === 1 ? first :
          await reader.layer({ ...scope, layer, page, pageSize: 200, expectedReleaseId: releaseId });
        if (result.releaseId !== releaseId || result.scopeRevision !== first.scopeRevision || result.layer !== layer ||
          result.page !== page || result.pageSize !== 200 || result.totalPages !== Math.ceil(result.total / 200)) throw new Error("Publication changed");
        if (page === 1) { total = result.total; totalPages = result.totalPages; }
        if (result.total !== total || result.totalPages !== totalPages) throw new Error("Layer changed");
        if (result.features.length !== Math.min(200, total - (page - 1) * 200)) throw new Error("Incomplete page");
        features.push(...result.features);
      }
      if (features.length !== total || new Set(features.map(feature => feature.id)).size !== total) throw new Error("Incomplete layer");
      if (features.some(feature => !geometryTypes[layer].includes(feature.geometry.type) || !validGeometry(feature.geometry))) throw new Error("Invalid geography");
      if (features.some(feature => feature.properties.areaId != null && feature.properties.areaId !== scope.areaId)) throw new Error("Wrong area");
      output[layer] = features;
    }
    if (!output.boundaries.some(feature => feature.properties.kind === "area" && feature.properties.areaId === scope.areaId) || !output.plots.length) throw new Error("Incomplete publication");
    if (new Set(output.plots.map(feature => feature.properties.lotId)).size !== output.plots.length) throw new Error("Ambiguous lots");
    let target: PublicGisFeature | null = null;
    let accessPoint: PublicGisFeature | null = null;
    let destinationMessage = "Choose a public burial record from search to locate its approved plot.";
    if (record) {
      const association = await reader.burial(record.id);
      if (!association || association.burialId !== record.id || association.areaId !== scope.areaId) {
        return { state: "unavailable", message: "This public record has no available Phase 2 plot association.", data: null };
      }
      const plot = output.plots.find(feature => feature.properties.lotId === association.lotId);
      if (association.releaseId !== releaseId || !association.geometryReady || !plot || plot.properties.lotCode !== association.lotCode ||
          association.lotCode !== record.plot || JSON.stringify(plot.geometry) !== JSON.stringify(association.plotGeometry)) {
        return { state: "unavailable", message: "The record's approved Phase 2 plot geometry is unavailable.", data: null };
      }
      if (!record.locationVerified || record.coordinateStatus !== "verified") {
        destinationMessage = "This record's coordinate review is incomplete. Its destination is unavailable.";
      } else {
        target = plot;
        accessPoint = output.access_points.find(feature => association.routingReady && feature.properties.lotId === association.lotId &&
          JSON.stringify(feature.geometry) === JSON.stringify(association.accessPoint) &&
          output.nodes.some(node => node.properties.nodeId === feature.properties.nodeId &&
            JSON.stringify(node.geometry) === JSON.stringify(feature.geometry))) ?? null;
        destinationMessage = accessPoint ? "Approved plot and reviewed walking access are available. Field directions await navigation validation." :
          "Approved plot available. Reviewed walking access is unavailable.";
      }
    }
    // Fence all paginated reads and the burial association against selector changes.
    const current = await reader.layer({ ...scope, layer: "boundaries", page: 1, pageSize: 200, expectedReleaseId: releaseId });
    if (current.releaseId !== releaseId || current.scopeRevision !== first.scopeRevision) throw new Error("Publication changed");
    return { state: "ready", message: "Published Phase 2 geographic map", data: { releaseId, scopeRevision: first.scopeRevision, layers: output, target, accessPoint, destinationMessage } };
  } catch {
    return { state: "unavailable", message: "The Phase 2 geographic map is temporarily unavailable or incomplete. Reload to try again.", data: null };
  }
}
