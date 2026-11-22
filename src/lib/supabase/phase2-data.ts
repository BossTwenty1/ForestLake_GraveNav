import { canNavigateToPublicRecord } from "@/lib/public-navigation";
import { planningDataSha256 } from "@/lib/phase2-planning";
import { getPublicSupabase, localSupabaseConfig } from "./config";
import { getPublicBurialGis, getPublicMappingLayer } from "./gis-data";
import { loadPhaseTwoGeography, phaseTwoScope } from "@/lib/phase2-geographic";
import { getPublicBurialRecord } from "./public-data";
import { readNavigationPolicy } from "@/lib/phase2-routing";
import type { PhaseTwoResult } from "@/lib/phase2-geographic";
import type { PublicBurialRecord } from "./types";

export function getPhaseTwoScope() {
  return phaseTwoScope(
    process.env.GRAVENAV_PHASE2_SITE_ID,
    process.env.GRAVENAV_PHASE2_AREA_ID,
    process.env.GRAVENAV_PHASE2_AREA_IDS,
  );
}

export async function getPhaseTwoGeography(record: PublicBurialRecord | null = null, areaId?: string): Promise<PhaseTwoResult> {
  const scope = getPhaseTwoScope();
  const client = getPublicSupabase();
  if (!client) return { state: "unavailable" as const, message: "The cemetery data service is unavailable.", data: null };
  const result = await loadPhaseTwoGeography({
    layer: args => getPublicMappingLayer(client, args),
    burial: id => getPublicBurialGis(client, id),
  }, scope, record, areaId);
  if (result.data) {
    result.data.navigationPolicy = readNavigationPolicy(process.env.GRAVENAV_PHASE2_NAVIGATION_POLICY, result.data);
    result.data.checkedAt = Date.now();
  }
  return result;
}

type CapstonePlanningDatabase = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: {
      get_capstone_planning_memorials: {
        Args: { p_cad_candidate_id: string; p_plan_sha256: string };
        Returns: { id: string; name: string; birth_date: string | null; death_date: string | null; reference: string | null }[];
      };
      get_capstone_planning_plot: { Args: { p_burial_id: number; p_plan_sha256: string }; Returns: string | null };
    };
  };
};

export async function getCapstonePlanningPlot(id: string): Promise<string | null> {
  if (localSupabaseConfig.environment !== "local" || !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) return null;
  try {
    const client = getPublicSupabase<CapstonePlanningDatabase>();
    if (!client) return null;
    const { data, error } = await client.rpc("get_capstone_planning_plot", {
      p_burial_id: Number(id), p_plan_sha256: planningDataSha256,
    });
    return !error && typeof data === "string" && /^(lawn|estates):[1-9]\d*$/.test(data) ? data : null;
  } catch {
    return null;
  }
}

export type CapstonePlanningMemorial = { id: string; name: string; dates: string; reference: string | null };

export async function getCapstonePlanningMemorials(candidateId: string, signal: AbortSignal): Promise<CapstonePlanningMemorial[]> {
  if (localSupabaseConfig.environment !== "local") return [];
  const client = getPublicSupabase<CapstonePlanningDatabase>();
  if (!client) throw Error("Local memorial registry is unavailable");
  const { data, error } = await client.rpc("get_capstone_planning_memorials", {
    p_cad_candidate_id: candidateId, p_plan_sha256: planningDataSha256,
  }).abortSignal(signal);
  if (error?.code === "PGRST202") return [];
  if (error || !Array.isArray(data)) throw Error("Planning memorials are unavailable");
  return data.map(({ id, name, birth_date, death_date, reference }) => ({
    id, name, reference, dates: [birth_date?.slice(0, 4), death_date?.slice(0, 4)].filter(Boolean).join("–"),
  }));
}

export async function getPhaseTwoDestination(id = ""): Promise<{ record: PublicBurialRecord | null; geography: PhaseTwoResult; planningPlot: string | null }> {
  try {
    const record = id ? await getPublicBurialRecord(id) : null;
    if (id && !record) return { record: null, planningPlot: null, geography: {
      state: "unavailable", message: "This public memorial record is unavailable. No plot has been selected.", data: null,
    } };
    const [geography, planningPlot] = await Promise.all([
      getPhaseTwoGeography(record), record ? getCapstonePlanningPlot(record.id) : null,
    ]);
    return { record, geography, planningPlot };
  } catch {
    return { record: null, planningPlot: null, geography: {
      state: "unavailable", message: "The cemetery data service is unavailable. No gravesite location has been assumed.", data: null,
    } };
  }
}

export async function getBurialMapScope(record: PublicBurialRecord): Promise<"phase2" | "unavailable"> {
  const scope = getPhaseTwoScope();
  if (!scope || !canNavigateToPublicRecord(record)) return "unavailable";
  const client = getPublicSupabase();
  if (!client) return "unavailable";
  try {
    const association = await getPublicBurialGis(client, record.id);
    if (!association?.geometryReady || association.burialId !== record.id || association.lotCode !== record.plot) {
      return "unavailable";
    }
    const allowedAreas = scope.areaIds?.length ? scope.areaIds : [scope.areaId];
    return allowedAreas.includes(association.areaId) ? "phase2" : "unavailable";
  } catch {
    return "unavailable";
  }
}
