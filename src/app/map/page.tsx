import { VisitorShell } from "@/components/visitor/visitor-shell";
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
  let gardens: string[] = [];
  let records: PublicBurialRecord[] = [];
  let total = 0;
  let pageSize = 20;
  let recordsError = "";
  const destination = id || view === "geographic" ? getPhaseTwoDestination(id) : Promise.resolve(null);
  try {
    const [names, result] = await Promise.all([getPublicGardenNames(), searchPublicBurials({ query, section, page })]);
    gardens = names; records = result.items; total = result.total; pageSize = result.pageSize;
  } catch {
    recordsError = "Memorial search is temporarily unavailable. You can still explore the park map.";
  }
  const selected = await destination;
  return <VisitorShell wide>
    <MapExplorer gardens={gardens} records={records} query={query} section={section}
      page={page} total={total} pageSize={pageSize} recordsError={recordsError}
      view={view} destination={selected?.record ?? null} geography={selected?.geography ?? null} requestedId={id} />
  </VisitorShell>;
}
