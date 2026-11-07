"use client";

import dynamic from "next/dynamic";
import type { PhaseTwoGeography } from "@/lib/phase2-geographic";

const GeographicCanvas = dynamic(() => import("./phase2-geographic-canvas"), {
  ssr: false, loading: () => <p role="status">Loading Phase 2 geography…</p>,
});

export function PhaseTwoGeographicMap({ data }: { data: PhaseTwoGeography }) {
  return <GeographicCanvas data={data} />;
}
