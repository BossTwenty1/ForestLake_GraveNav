import { getBurialMapScope } from "@/lib/supabase/phase2-data";
import { redirect } from "next/navigation";
import { MemorialProfile } from "@/components/visitor/memorial-profile";
import { VisitorShell } from "@/components/visitor/visitor-shell";
import { getPublicBurialRecord, getPublicSharedPlotBurials } from "@/lib/supabase/public-data";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function GravesitePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const id = getParam(params.id);
  const returnTo = safeReturnPath(getParam(params.returnTo));
  const record = await getPublicBurialRecord(id);
  if (!record) redirect(`/record-not-found?${new URLSearchParams({ query: id || "that gravesite" })}`);

  const [mapScope, shared] = await Promise.all([getBurialMapScope(record.id), getPublicSharedPlotBurials(record.id)]);

  return <VisitorShell backHref={returnTo} backLabel="Back to search results" wide>
    <MemorialProfile record={record} mapScope={mapScope} shared={shared} returnTo={returnTo} />
  </VisitorShell>;
}

function getParam(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] || "" : value || ""; }
function safeReturnPath(value: string) { return value === "/results" || value.startsWith("/results?") ? value : "/results"; }
