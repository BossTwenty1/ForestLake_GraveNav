"use client";

import dynamic from "next/dynamic";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { MapExplorer } from "@/components/visitor/map-explorer";
import type { PhaseTwoGeography } from "@/lib/phase2-geographic";

const GeographicCanvas = dynamic(() => import("@/components/visitor/phase2-geographic-canvas"), {
  ssr: false,
  loading: () => <p role="status">Loading the selected plot map…</p>,
});

export function StaffPlotGeographicMap({ data }: { data: PhaseTwoGeography }) {
  return <GeographicCanvas data={data} />;
}

export function AdminCemeteryMap({ hasPlanningMap = false }: { hasPlanningMap?: boolean }) {
  return <>
    <Alert icon="info" title="Phase 2 planning reference" variant="info">
      CAD outlines are planning references. Linking an official plot requires an approved match and reviewed field evidence.
    </Alert>
    {hasPlanningMap ? <MapExplorer showHeading={false} staffTools /> : <EmptyState icon="map" title="Phase 2 landscape unavailable" description="Install the verified local Phase 2 viewer package to open this planning reference." />}
  </>;
}
