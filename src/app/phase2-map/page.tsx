import { existsSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { VisitorShell } from "@/components/visitor/visitor-shell";
import { Alert } from "@/components/ui/alert";
import { PhaseTwoGeographicMap } from "@/components/visitor/phase2-geographic-map";
import { getPublicBurialRecord } from "@/lib/supabase/public-data";
import { getPhaseTwoGeography } from "@/lib/supabase/phase2-data";

export default async function PhaseTwoMapPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const id = typeof params.id === "string" ? params.id : "";
  let record = null;
  let result;
  try {
    record = id ? await getPublicBurialRecord(id) : null;
    result = id && !record ? { state: "unavailable", message: "This public memorial record is unavailable.", data: null } :
      await getPhaseTwoGeography(record);
  } catch {
    result = { state: "unavailable", message: "Cemetery information is temporarily unavailable. Reload to try again.", data: null };
  }
  return <VisitorShell wide backHref={record ? `/gravesite?id=${encodeURIComponent(record.id)}` : "/"} backLabel={record ? "Back to gravesite" : "Back to GraveNav"}>
    <section className="map-page-state">
      <h1>Phase 2 geographic map</h1>
      <Alert title={result.message} variant={result.data ? "info" : "warning"}>
        {result.data ? result.data.destinationMessage : "Approved geographic information is required before a destination can be displayed."}
      </Alert>
      {record ? <p>{record.name} · {record.plotLabel}</p> : null}
      {result.data ? <PhaseTwoGeographicMap data={result.data} /> : null}
      <p>Walking directions are unavailable while Phase 2 navigation awaits field validation.</p>
      <button className="button button--secondary" type="button" disabled>Phase 2 directions unavailable</button>
      <p><Link href="/search">Search public burial records</Link></p>
      {existsSync(join(process.cwd(), "public", "phase2-viewer", "index.html")) ?
        <p><a href="/phase2-viewer/index.html">Phase 2 Planning Map (local CAD reference)</a></p> : null}
    </section>
  </VisitorShell>;
}
