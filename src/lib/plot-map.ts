import type { PhaseTwoGeography, PhaseTwoResult, PhaseTwoScope } from "./phase2-geographic";
import type { PlotManagementQuery } from "./supabase/admin-data";
import { isSyntheticPlot } from "./synthetic-plots";

export const plotManagementPath = "/admin/plot-management";
export const staffMapPath = "/admin/cemetery-map";

export function parseStaffPlotId(value: unknown): number | null {
  if (typeof value !== "string" || !/^[1-9]\d{0,15}$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

export function plotFilterParams(query: PlotManagementQuery, params = new URLSearchParams()) {
  const filters = {
    query: query.query.slice(0, 160),
    area: query.area === "all" ? "" : query.area,
    state: query.state === "all" ? "" : query.state,
    verification: query.verification === "all" ? "" : query.verification,
    sort: query.sort === "updated" ? "" : query.sort,
    direction: query.direction === "desc" ? "" : query.direction,
    page: query.page ? String(query.page + 1) : "",
    pageSize: query.pageSize === 20 ? "" : String(query.pageSize),
  };
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  return params;
}

export function staffPlotMapHref(lotId: number, query: PlotManagementQuery) {
  const filters = plotFilterParams(query);
  const returnTo = plotManagementPath + (filters.size ? "?" + filters : "");
  return staffMapPath + "?" + new URLSearchParams({ plot: String(lotId), returnTo });
}

export function safePlotMapReturn(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) return plotManagementPath;
  const origin = "http://plot-directory.invalid";
  let url: URL;
  try { url = new URL(value, origin); } catch { return plotManagementPath; }
  if (url.origin !== origin || url.pathname !== plotManagementPath) return plotManagementPath;
  const filtered = new URLSearchParams();
  for (const key of ["query", "area", "state", "verification", "sort", "direction", "page", "pageSize"]) {
    const item = url.searchParams.get(key);
    if (item) filtered.set(key, item.slice(0, key === "query" ? 160 : 24));
  }
  return plotManagementPath + (filtered.size ? "?" + filtered : "");
}

export type StaffPlotMapIdentity = {
  lotId: number;
  lotCode: string;
  areaId: number;
  coordinatesVerified: boolean;
};

export function plotMapUnavailable(plot: StaffPlotMapIdentity, scope: PhaseTwoScope | null) {
  if (isSyntheticPlot(plot.lotCode)) {
    return "This synthetic project plot has no physical map position.";
  }
  if (!plot.coordinatesVerified) {
    return "This plot has no verified geographic coordinates. Its recorded plot reference is shown below.";
  }
  if (!scope) {
    return "An approved geographic map area is not configured. Recorded coordinate verification alone does not link this plot to a map.";
  }
  if (String(plot.areaId) !== scope.areaId) {
    return "This plot is outside the approved geographic map area.";
  }
  return null;
}

export function focusPublishedStaffPlot(
  plot: StaffPlotMapIdentity, scope: PhaseTwoScope | null, geography: PhaseTwoResult,
): PhaseTwoGeography | null {
  if (plotMapUnavailable(plot, scope) || geography.state !== "ready" || !geography.data) return null;
  const { releaseId, scopeRevision, layers } = geography.data;
  const targets = layers.plots.filter((feature) =>
    feature.properties.lotId === String(plot.lotId) &&
    feature.properties.lotCode === plot.lotCode &&
    feature.properties.areaId === String(plot.areaId) &&
    feature.geometry.type === "Polygon");
  if (targets.length !== 1) return null;

  // The staff canvas only needs display geometry and the exact plot, never GPS routing data.
  return {
    releaseId, scopeRevision,
    layers: {
      boundaries: layers.boundaries, plots: targets, walkways: layers.walkways,
      access_points: [], nodes: [], edges: [], landmarks: [],
    },
    target: targets[0], accessPoint: null, destinationMessage: "",
  };
}
