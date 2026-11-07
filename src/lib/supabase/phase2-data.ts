import { getPublicSupabase } from "./config";
import { getPublicBurialGis, getPublicMappingLayer } from "./gis-data";
import { loadPhaseTwoGeography, phaseTwoScope } from "@/lib/phase2-geographic";
import type { PublicBurialRecord } from "./types";

export function getPhaseTwoScope() {
  return phaseTwoScope(process.env.GRAVENAV_PHASE2_SITE_ID, process.env.GRAVENAV_PHASE2_AREA_ID);
}

export async function getPhaseTwoGeography(record: PublicBurialRecord | null = null) {
  const scope = getPhaseTwoScope();
  const client = getPublicSupabase();
  if (!client) return { state: "unavailable" as const, message: "The cemetery data service is unavailable.", data: null };
  return loadPhaseTwoGeography({
    layer: args => getPublicMappingLayer(client, args),
    burial: id => getPublicBurialGis(client, id),
  }, scope, record);
}

export async function getBurialMapScope(id: string): Promise<"legacy" | "phase2" | "unavailable"> {
  const scope = getPhaseTwoScope();
  if (!scope) return "legacy";
  const client = getPublicSupabase();
  if (!client) return "unavailable";
  try {
    const association = await getPublicBurialGis(client, id);
    if (!association || association.burialId !== id) return "unavailable";
    return association.areaId === scope.areaId ? "phase2" : "legacy";
  } catch {
    return "unavailable";
  }
}
