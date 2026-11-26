"use client";

import { useEffect, useState } from "react";
import type { PathOptions } from "leaflet";
import styles from "./plot-highlights.module.css";

export const plotHighlightColor = "#ffea00";
export const plotHighlightEdge = "#392f08";
type PlotHighlights = { memorials: Set<string>; occupied: Set<string> };
type HighlightResult = { key: string; data: PlotHighlights | null };
const emptyHighlights: PlotHighlights = { memorials: new Set(), occupied: new Set() };

export function usePlotHighlights(releaseId?: string, staff = false) {
  const params = new URLSearchParams();
  if (releaseId) params.set("release", releaseId);
  if (staff) params.set("staff", "1");
  const key = params.toString();
  const [result, setResult] = useState<HighlightResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/map/plot-highlights?" + key, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Plot highlights unavailable");
        const data: { memorials: string[]; occupied: string[] } = await response.json();
        if (!Array.isArray(data.memorials) || !Array.isArray(data.occupied)) {
          throw new Error("Invalid plot highlights");
        }
        if (!controller.signal.aborted) {
          setResult({ key, data: { memorials: new Set(data.memorials), occupied: new Set(data.occupied) } });
        }
      } catch {
        if (!controller.signal.aborted) setResult({ key, data: null });
      }
    })();
    return () => controller.abort();
  }, [key]);

  const current = result?.key === key ? result : null;
  return { highlights: current?.data ?? emptyHighlights, unavailable: current?.data === null };
}

export function plotHighlightStyle(occupied: boolean): PathOptions {
  return {
    color: plotHighlightEdge,
    weight: 1.5,
    fillColor: plotHighlightColor,
    fillOpacity: 0.86,
    dashArray: occupied ? "4 2" : undefined,
  };
}

export function PlotHighlightLegend({ memorials, occupied, unavailable = false }: {
  memorials: boolean;
  occupied: boolean;
  unavailable?: boolean;
}) {
  if (!memorials && !occupied && !unavailable) return null;
  return (
    <div className={styles.legend} aria-label="Plot highlights">
      {unavailable ? <span role="status">Plot highlights unavailable</span> : null}
      {memorials ? <span><i aria-hidden="true" className={styles.swatch} />Plot with a memorial</span> : null}
      {occupied ? <span><i aria-hidden="true" className={styles.occupiedSwatch} />Occupied plot</span> : null}
    </div>
  );
}
