import { existsSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminCemeteryMapPage, AdminPageFrame } from "@/components/admin/admin-page-content";
import { AdminCemeteryMap, StaffPlotGeographicMap } from "@/components/admin/admin-cemetery-map";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStaff } from "@/lib/auth";
import { focusPublishedStaffPlot, parseStaffPlotId, plotMapUnavailable, safePlotMapReturn } from "@/lib/plot-map";
import { getCapstonePlanningPlot, getPhaseTwoGeography, getPhaseTwoScope } from "@/lib/supabase/phase2-data";
import { getServerSupabase } from "@/lib/supabase/server";
import { isSyntheticPlot } from "@/lib/synthetic-plots";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cemetery Map | GraveNav", robots: { index: false, follow: false } };

function planningMapAvailable() {
  return process.env.VERCEL === "1" || existsSync(join(process.cwd(), "public", "phase2-viewer", "index.html"));
}

export default async function AdminCemeteryMapRoute({ searchParams }: {
  searchParams: Promise<{ plot?: string | string[]; returnTo?: string | string[] }>;
}) {
  const params = await searchParams;
  const hasPlanningMap = planningMapAvailable();
  if (params.plot === undefined) {
    return (
      <AdminShell active="Cemetery Map">
        <AdminCemeteryMapPage hasPlanningMap={hasPlanningMap} />
      </AdminShell>
    );
  }

  const client = await getServerSupabase();
  await requireStaff(undefined, client);
  const back = safePlotMapReturn(params.returnTo);
  const lotId = parseStaffPlotId(params.plot);
  const selection = lotId && client ? await readPlotSelection(client, lotId) : null;

  return (
    <AdminShell active="Cemetery Map">
      <AdminPageFrame
        title="Selected plot map"
        description="Inspect the selected plot, its assigned memorials, and its Phase 2 map position."
        breadcrumbs={[{ label: "Plot Management", href: back }, { label: "Selected plot map" }]}
        actions={<Link className="button button--secondary button--md" href={back}>Back to Plot Management</Link>}
      >
        {selection?.map ? (
          <Alert title="Approved plot outline" variant="success">
            The highlighted outline matches this plot in the published geographic release.
          </Alert>
        ) : selection?.planningPlot && hasPlanningMap ? (
          <Alert title="Phase 2 park layout" variant="info" icon="map">
            Highlighted on the interactive Phase 2 map. Switch between Park Map and Satellite view or click the outline to manage assigned memorials.
          </Alert>
        ) : (
          <Alert title="Map location unavailable" variant="info" icon="map">
            {selection?.message || "This plot reference is invalid. Choose a current plot in Plot Management."}
          </Alert>
        )}
        {selection?.plot && (
          <Card>
            <CardHeader><CardTitle>{selection.plot.label}</CardTitle></CardHeader>
            <CardContent>
              <dl className="admin-burial-mobile-card__details">
                <div><dt>Garden or area</dt><dd>{selection.plot.area}</dd></div>
                <div><dt>Block</dt><dd>{selection.plot.block}</dd></div>
                <div><dt>Plot reference</dt><dd>{selection.plot.reference}</dd></div>
                <div><dt>Map status</dt><dd>{selection.plot.coordinate}</dd></div>
              </dl>
            </CardContent>
          </Card>
        )}
        {selection?.map
          ? <StaffPlotGeographicMap data={selection.map} />
          : selection?.planningPlot && hasPlanningMap
            ? <AdminCemeteryMap hasPlanningMap planningPlot={selection.planningPlot} />
            : null}
      </AdminPageFrame>
    </AdminShell>
  );
}

async function readPlotSelection(client: NonNullable<Awaited<ReturnType<typeof getServerSupabase>>>, lotId: number) {
  const { data: lot, error } = await client.from("lot").select(
    "lot_id,lot_code,area_id,location_geom,coordinate_status,coordinate_verified,area(area_name),block(block_number)",
  ).eq("lot_id", lotId).is("deleted_at", null).maybeSingle();
  if (error) return { message: "The plot register could not be read. Reload to try again." };
  if (!lot || lot.lot_id !== lotId) return { message: "This plot is no longer available in the current plot register." };

  const isPhase2Key = isSyntheticPlot(lot.lot_code);
  const coordinatesVerified =
    lot.location_geom != null && lot.coordinate_status === "verified" && lot.coordinate_verified === true;
  let reference = isPhase2Key ? "Not recorded" : lot.lot_code;
  if (isPhase2Key) {
    const { data } = await client.rpc("staff_sample_plot_references", { p_lot_ids: [lotId] });
    const match = Array.isArray(data) && data.find((item) => item && typeof item === "object" &&
      !Array.isArray(item) && item.lotId === String(lotId));
    if (match && typeof match === "object" && !Array.isArray(match) && typeof match.reference === "string") {
      reference = match.reference;
    }
  }

  let planningPlot: string | null = null;
  const { data: burialRows } = await client
    .from("burial_record")
    .select("burial_id")
    .eq("lot_id", lotId)
    .is("deleted_at", null)
    .order("burial_id", { ascending: true })
    .limit(1);
  const firstBurialId = burialRows?.[0]?.burial_id;
  if (typeof firstBurialId === "number") {
    planningPlot = await getCapstonePlanningPlot(String(firstBurialId));
  }

  const plot = {
    label: reference !== "Not recorded" ? reference : `Plot #${lotId}`,
    area: lot.area?.area_name ?? "Not recorded",
    block: lot.block?.block_number ?? "Not recorded",
    reference,
    coordinate: planningPlot
      ? "Mapped on Phase 2 park layout"
      : coordinatesVerified
        ? "Verified in the plot register"
        : "Not mapped yet",
  };

  if (planningPlot) {
    return { plot, planningPlot, map: null, message: "" };
  }

  const identity = { lotId, lotCode: lot.lot_code, areaId: lot.area_id, coordinatesVerified };
  const scope = getPhaseTwoScope();
  const unavailable = plotMapUnavailable(identity, scope);
  if (unavailable) {
    return {
      plot,
      planningPlot: null,
      map: null,
      message: isPhase2Key
        ? "No mapped park layout outline is linked to this plot yet."
        : unavailable,
    };
  }

  const geography = await getPhaseTwoGeography(null, String(lot.area_id));
  const map = focusPublishedStaffPlot(identity, scope, geography);
  const message = geography.state === "ready"
    ? "The published geographic layer has no exact match for this plot."
    : geography.message;
  return { plot, planningPlot: null, map, message };
}
