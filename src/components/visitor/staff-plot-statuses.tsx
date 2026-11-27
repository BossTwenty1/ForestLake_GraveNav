"use client";

import { useEffect, useState } from "react";
import type { PathOptions } from "leaflet";
import styles from "./plot-highlights.module.css";

export type StaffPlotState = "occupied" | "available" | "booked" | "hold" | "unavailable" | "unknown";
export type StaffLotType = "standard" | "premium" | "special_premium" | "mausoleum" | "unknown";
export type StaffPlotFilters = { status: StaffPlotState | "all"; lotType: StaffLotType | "all" };
type KnownState = Exclude<StaffPlotState, "unknown">;
type KnownLotType = Exclude<StaffLotType, "unknown">;
type StaffStatuses = Record<KnownState, Set<string>> & { types: Record<KnownLotType, Set<string>>; exampleMode: boolean };
const knownStates: KnownState[] = ["occupied", "available", "booked", "hold", "unavailable"];
const knownTypes: KnownLotType[] = ["standard", "premium", "special_premium", "mausoleum"];
const isIds = (value: unknown): value is string[] => Array.isArray(value) && value.every(id => typeof id === "string" && /^(lawn|estates):[1-9]\d*$/.test(id));

export function useStaffPlotStatuses(enabled: boolean) {
  const [result, setResult] = useState<{ data: StaffStatuses | null } | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const refresh = () => setVersion(value => value + 1);
    window.addEventListener("gravenav:planning-status-changed", refresh);
    return () => window.removeEventListener("gravenav:planning-status-changed", refresh);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetch("/api/admin/planning-statuses", { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw Error("Status unavailable");
        const data: unknown = await response.json();
        if (!data || typeof data !== "object" || Array.isArray(data)) throw Error("Invalid status data");
        const value = data as Record<string, unknown>;
        if (!knownStates.every(key => isIds(value[key])) || !value.types || typeof value.types !== "object" || Array.isArray(value.types)) {
          throw Error("Invalid status data");
        }
        const types = value.types as Record<string, unknown>;
        if (!knownTypes.every(key => types[key] === undefined || isIds(types[key]))) throw Error("Invalid lot type data");
        if (!controller.signal.aborted) setResult({ data: {
          occupied: new Set(value.occupied as string[]), available: new Set(value.available as string[]),
          booked: new Set(value.booked as string[]), hold: new Set(value.hold as string[]), unavailable: new Set(value.unavailable as string[]),
          types: { standard: new Set(types.standard as string[] ?? []), premium: new Set(types.premium as string[] ?? []),
            special_premium: new Set(types.special_premium as string[] ?? []), mausoleum: new Set(types.mausoleum as string[] ?? []) },
          exampleMode: value.exampleMode === true,
        } });
      })
      .catch(() => { if (!controller.signal.aborted) setResult({ data: null }); });
    return () => controller.abort();
  }, [enabled, version]);
  return enabled ? result : null;
}

export function staffPlotState(id: string, statuses: StaffStatuses): StaffPlotState {
  return knownStates.find(state => statuses[state].has(id)) ?? "unknown";
}

export function staffLotType(id: string, statuses: StaffStatuses): StaffLotType {
  return knownTypes.find(type => statuses.types[type].has(id)) ?? "unknown";
}

export function matchesStaffFilters(id: string, statuses: StaffStatuses, filters: StaffPlotFilters): boolean {
  return (filters.status === "all" || staffPlotState(id, statuses) === filters.status)
    && (filters.lotType === "all" || staffLotType(id, statuses) === filters.lotType);
}

const colors: Record<StaffPlotState, string> = {
  available: "#6db784", booked: "#699cd1", hold: "#dda55a", unavailable: "#dc6b6b", occupied: "#ffdf00", unknown: "#604079",
};

export function staffPlotStyle(state: StaffPlotState, matches = true): PathOptions {
  if (!matches) return { color: "#3e4c43", weight: 1.1, opacity: 0.95, fillColor: "#9ca3a0", fillOpacity: 0.85 };
  return { color: state === "unknown" ? "#604079" : "#354739", weight: 1.1, opacity: 0.95, fillColor: colors[state],
    ...(state === "unknown" ? { fillColor: "#e6d4f1", fillOpacity: 0.72, dashArray: "2 3" } : { fillOpacity: 0.82 }) };
}

export function StaffPlotStatusLegend({ unavailable, filtered, exampleMode }: { unavailable: boolean; filtered: boolean; exampleMode: boolean }) {
  if (unavailable) return <div className={styles.legend + " " + styles.staffLegend} role="status">Plot statuses unavailable</div>;
  return <div className={styles.legend + " " + styles.staffLegend} aria-label="Plot status colors">
    {([ ["available", "Available"], ["booked", "Booked"], ["hold", "On hold"], ["unavailable", "Temporarily unavailable"],
      ["occupied", "Occupied"], ["unknown", "Not assessed"] ] as const).map(([state, label]) =>
      <span key={state}><i aria-hidden="true" className={state === "unknown" ? styles.unknownSwatch : styles.statusSwatch} style={{ backgroundColor: state === "unknown" ? "transparent" : colors[state] }} />{label}</span>)}
    {filtered ? <span><i aria-hidden="true" className={styles.statusSwatch} style={{ backgroundColor: "#9ca3a0" }} />Filtered out</span> : null}
    {exampleMode ? <span className={styles.exampleNotice}>Some statuses are local test examples</span> : null}
  </div>;
}
