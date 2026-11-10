import { getBurialMapScope } from "@/lib/supabase/phase2-data";
import { redirect } from "next/navigation";
import Link from "next/link";
import { GravesiteLocationCard } from "@/components/visitor/gravesite-location-card";
import { VisitorShell } from "@/components/visitor/visitor-shell";
import { Icon } from "@/components/ui/icons";
import { getPublicBurialRecord, getPublicSharedPlotBurials } from "@/lib/supabase/public-data";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function GravesitePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const id = getParam(params.id);
  const returnTo = safeReturnPath(getParam(params.returnTo));
  const record = await getPublicBurialRecord(id);
  if (!record) redirect(`/record-not-found?${new URLSearchParams({ query: id || "that gravesite" })}`);

  const [mapScope, shared] = await Promise.all([getBurialMapScope(record.id), getPublicSharedPlotBurials(record.id)]);

  return <VisitorShell backHref={returnTo} backLabel="Back to search results" wide><article className="public-profile">
    <section aria-labelledby="memorial-name" className="profile-memorial-card">
      <div aria-label="Memorial photograph unavailable" className={`profile-memorial-media ${record.tone}`} role="img">
        <div className="profile-media-badge"><Icon name="photos" size={14} />Photo unavailable</div>
        <span className="profile-media-mark"><Icon name="tree" size={46} /></span>
        <div className="profile-media-identity"><span>Public memorial record</span><h1 id="memorial-name">{record.name}</h1><p>{record.dates}</p></div>
      </div>
      <div className="profile-memorial-summary">
        <span className="profile-record-badge"><Icon name="verification" size={14} />Active public record</span>
        <dl><div><dt>Interred</dt><dd>{record.burialDate}</dd></div><div><dt>Resting place</dt><dd>{record.section} · {record.plotLabel}</dd></div></dl>
      </div>
    </section>

    <div className="profile-information-column">
      <GravesiteLocationCard record={record} mapScope={mapScope} />
      {shared.state === "unavailable" ? <section className="profile-information-card" aria-labelledby="shared-plot-status"><h2 id="shared-plot-status">Other interments at this plot</h2><p role="status">The shared-grave list is temporarily unavailable. This does not mean that this is the only person interred here.</p><Link href={"/gravesite?id=" + encodeURIComponent(record.id)}>Retry shared-grave list</Link></section> : null}
      {shared.items.length ? <section className="profile-information-card" aria-labelledby="shared-plot-title"><h2 id="shared-plot-title">Also interred at this plot</h2><ul>{shared.items.map((person) => <li key={person.id}><Link href={`/gravesite?${new URLSearchParams({ id: person.id, returnTo })}`}>{person.name}</Link></li>)}</ul></section> : null}
      <section aria-labelledby="memorial-information-title" className="profile-information-card"><div className="profile-section-heading"><div><p>Memorial information</p><h2 id="memorial-information-title">Public registry details</h2></div><Icon name="records" size={22} /></div><dl className="profile-registry-list"><div><dt>Full name</dt><dd>{record.name}</dd></div><div><dt>Life dates</dt><dd>{record.dates}</dd></div><div><dt>Burial date</dt><dd>{record.burialDate}</dd></div><div><dt>Record status</dt><dd>{record.status}</dd></div></dl><p className="profile-registry-note"><Icon name="info" size={17} />Only cemetery-approved public information is shown. Biography, family details, tributes, and marker inscriptions are omitted when they are not part of the public record.</p></section>
    </div>
  </article></VisitorShell>;
}

function getParam(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] || "" : value || ""; }
function safeReturnPath(value: string) { return value === "/results" || value.startsWith("/results?") ? value : "/results"; }
