import { getPublicSupabase } from "./config";
import { getPublicBurialGis, getPublicMappingLayer } from "./gis-data";
import { loadPhaseTwoGeography, phaseTwoScope } from "@/lib/phase2-geographic";
import { getPublicBurialRecord } from "./public-data";
import { readNavigationPolicy } from "@/lib/phase2-routing";
import type { PhaseTwoResult } from "@/lib/phase2-geographic";
import type { PublicBurialRecord } from "./types";

export function getPhaseTwoScope() {
  return phaseTwoScope(process.env.GRAVENAV_PHASE2_SITE_ID, process.env.GRAVENAV_PHASE2_AREA_ID);
}

export async function getPhaseTwoGeography(record: PublicBurialRecord | null = null): Promise<PhaseTwoResult> {
  const scope = getPhaseTwoScope();
  const client = getPublicSupabase();
  if (!client) return { state: "unavailable" as const, message: "The cemetery data service is unavailable.", data: null };
  const result = await loadPhaseTwoGeography({
    layer: args => getPublicMappingLayer(client, args),
    burial: id => getPublicBurialGis(client, id),
  }, scope, record);
  if (result.data) {
    result.data.navigationPolicy = readNavigationPolicy(process.env.GRAVENAV_PHASE2_NAVIGATION_POLICY, result.data);
    result.data.checkedAt = Date.now();
  }
  return result;
}

export async function getPhaseTwoDestination(id = ""): Promise<{ record: PublicBurialRecord | null; geography: PhaseTwoResult }> {
  try {
    const record = id ? await getPublicBurialRecord(id) : null;
    if (id && !record) return { record: null, geography: {
      state: "unavailable", message: "This public memorial record is unavailable. No plot has been selected.", data: null,
    } };
    return { record, geography: await getPhaseTwoGeography(record) };
  } catch {
    return { record: null, geography: {
      state: "unavailable", message: "The cemetery data service is unavailable. No gravesite location has been assumed.", data: null,
    } };
  }
}

export async function getBurialMapScope(id: string): Promise<"phase2" | "unavailable"> {
  const scope = getPhaseTwoScope();
  if (!scope) return "unavailable";
  const client = getPublicSupabase();
  if (!client) return "unavailable";
  try {
    const association = await getPublicBurialGis(client, id);
    if (!association || association.burialId !== id) return "unavailable";
    return association.areaId === scope.areaId ? "phase2" : "unavailable";
  } catch {
    return "unavailable";
  }
}
