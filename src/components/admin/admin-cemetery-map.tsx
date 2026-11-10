import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { MapExplorer } from "@/components/visitor/map-explorer";

export function AdminCemeteryMap({ hasPlanningMap = false }: { hasPlanningMap?: boolean }) {
  return <>
    <Alert icon="info" title="Phase 2 planning reference" variant="info">
      Match official Section D lot identifiers and reviewed field evidence before linking a candidate to a burial record.
    </Alert>
    {hasPlanningMap ? <MapExplorer showHeading={false} /> : <EmptyState icon="map" title="Phase 2 landscape unavailable" description="Install the verified local Phase 2 viewer package to open this planning reference." />}
  </>;
}
