import { getBurialMapScope, getCapstonePlanningPlot } from "@/lib/supabase/phase2-data";
import { redirect } from "next/navigation";
import Link from "next/link";
import { safeResultsReturnTo } from "@/lib/visitor-presentation";
import { getPublicMemorialPhotos } from "@/lib/supabase/public-memorial-photos";
import { PublicMemorialProfile } from "./public-memorial-profile";
import styles from "./memorial.module.css";
import { VisitorShell } from "@/components/visitor/visitor-shell";
import { getPublicBurialRecord, getPublicSharedPlotBurials } from "@/lib/supabase/public-data";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function GravesitePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const id = getParam(params.id);
  const returnTo = safeResultsReturnTo(params.returnTo);
  let record;
  try {
    record = await getPublicBurialRecord(id);
  } catch {
    const retryHref = "/gravesite?" + new URLSearchParams({ id, returnTo });
    return <VisitorShell batchOne wide className={styles.shell}>
      <section className={styles.recovery}>
        <h1>Memorial temporarily unavailable</h1>
        <p>The public registry could not be reached. Please try again.</p>
        <div><a className="button button--primary" href={retryHref}>Try again</a>
          <Link className="button button--secondary" href={returnTo}>Back to search results</Link></div>
      </section>
    </VisitorShell>;
  }
  if (!record) redirect("/record-not-found?" + new URLSearchParams({ returnTo }));

  const [mapScope, planningPlot, shared, photos] = await Promise.all([
    getBurialMapScope(record), getCapstonePlanningPlot(record.id), getPublicSharedPlotBurials(record.id), getPublicMemorialPhotos(record.id).catch(() => []),
  ]);

  return <VisitorShell backHref={returnTo} backLabel="Back to Search Results" batchOne wide className={styles.shell} helpHref="#gravesite-details">
    <PublicMemorialProfile record={record} mapScope={mapScope === "unavailable" && planningPlot ? "planning" : mapScope} planningPlot={planningPlot} shared={shared} photos={photos} returnTo={returnTo} />
  </VisitorShell>;
}

function getParam(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] || "" : value || ""; }
