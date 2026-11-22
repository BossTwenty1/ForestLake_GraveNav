import { existsSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { safeResultsReturnTo } from "@/lib/visitor-presentation";
import { VisitorShell } from "@/components/visitor/visitor-shell";
import { ParkExplorer } from "@/components/visitor/park-explorer";
import { MapExplorer } from "@/components/visitor/map-explorer";
import { getPublicGardenNames, searchPublicBurials } from "@/lib/supabase/public-data";
import { getPhaseTwoDestination } from "@/lib/supabase/phase2-data";
import type { PublicBurialRecord } from "@/lib/supabase/types";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function MapPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const value = (key: string) => typeof params[key] === "string" ? params[key] : "";
  const id = value("id");
  const view = value("view") === "planning" ? "planning" : id || value("view") === "geographic" ? "geographic" : "planning";
  const query = (value("query") || value("plot")).slice(0, 160);
  const section = value("section") || "all";
  const requestedPage = Number(value("page"));
  const page = Number.isInteger(requestedPage) ? Math.max(1, Math.min(requestedPage, 10000)) : 1;
  const hasPlanningMap = existsSync(join(process.cwd(), "public/phase2-viewer/data/phase2.local.json"));
  if (!hasPlanningMap) {
    const { geography } = await getPhaseTwoDestination(id);
    if (!geography.data) {
      return <VisitorShell wide>
        <section className="public-results-state">
          <h1>Park map</h1>
          <p>The park map and walking directions are unavailable in this preview.</p>
          <Link className="button button--primary" href="/search">Search Memorials</Link>
        </section>
      </VisitorShell>;
    }
  }
  if (!id && !query && section === "all" && page === 1) {
    const { geography } = await getPhaseTwoDestination();
    return <VisitorShell wide><ParkExplorer geography={geography.data} startPublished={view === "geographic"} /></VisitorShell>;
  }
  let gardens: string[] = [];
  let records: PublicBurialRecord[] = [];
  let total = 0;
  let pageSize = 20;
  let recordsError = "";
  let gardenListUnavailable = false;
  const destination = id || view === "geographic" ? getPhaseTwoDestination(id) : Promise.resolve(null);
  try {
    const [names, result] = await Promise.all([getPublicGardenNames().catch(() => null), searchPublicBurials({ query, section, page })]);
    gardenListUnavailable = names === null;
    gardens = names ?? []; records = result.items; total = result.total; pageSize = result.pageSize;
  } catch {
    recordsError = "Memorial search is temporarily unavailable. You can still explore the park map.";
  }
  const selected = await destination;
  const returnTo = typeof params.returnTo === "string" ? safeResultsReturnTo(params.returnTo) : undefined;
  const backHref = selected?.record
    ? "/gravesite?" + new URLSearchParams({ id: selected.record.id, ...(returnTo ? { returnTo } : {}) })
    : undefined;
  return <VisitorShell wide backHref={backHref} backLabel="Back to memorial profile">
    <MapExplorer key={selected?.planningPlot ? id : undefined} gardens={gardens} records={records} query={query} section={section}
      page={page} total={total} pageSize={pageSize} recordsError={recordsError} gardenListUnavailable={gardenListUnavailable}
      view={view} destination={selected?.record ?? null} geography={selected?.geography ?? null} planningPlot={selected?.planningPlot ?? null} requestedId={id} returnTo={returnTo} />
  </VisitorShell>;
}
