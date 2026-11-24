import Link from "next/link";
import { GravesiteLocationCard } from "./gravesite-location-card";
import { Icon } from "@/components/ui/icons";
import type { PublicBurialRecord } from "@/lib/supabase/types";
import type { SharedPlotBurials } from "@/lib/supabase/public-data";
import { visitorPlotDetails } from "@/lib/visitor-presentation";

export function MemorialProfile({ record, mapScope, shared, returnTo, preview = false }: {
  record: PublicBurialRecord;
  mapScope: "phase2" | "unavailable";
  shared: SharedPlotBurials;
  returnTo: string;
  preview?: boolean;
}) {
  const plot = visitorPlotDetails(record);
  const mediaClassName = `profile-memorial-media ${record.tone}` +
    (record.name.length > 60 ? " profile-memorial-media--long-name" : "");
  return <article className="public-profile">
    <section aria-labelledby="memorial-name" className="profile-memorial-card">
      <div
        className={mediaClassName}
      >
        <span className="profile-media-mark"><Icon name="tree" size={46} /></span>
        <div className="profile-media-identity"><span>Memorial Profile</span><h1 id="memorial-name">{record.name}</h1><p>{record.dates}</p></div>
        <div className="profile-media-badge"><Icon name="photos" size={14} />Photo unavailable</div>
      </div>
      <div className="profile-memorial-summary">
        <dl>
          <div><dt>Interment Date</dt><dd>{record.burialDate}</dd></div>
          <div><dt>Gravesite Reference</dt><dd>{plot.reference}</dd></div>
        </dl>
      </div>
    </section>

    <div className="profile-information-column">
      <GravesiteLocationCard record={record} mapScope={mapScope} returnTo={returnTo} showMapLink={!preview} />
      {shared.state === "unavailable" ? <section className="profile-information-card" aria-labelledby="shared-plot-status"><h2 id="shared-plot-status">Other interments at this plot</h2><p role="status">The shared-grave list is temporarily unavailable. Other interments may be recorded here.</p><a className="button button--primary profile-roster-retry" href={"/gravesite?" + new URLSearchParams({ id: record.id, returnTo })}>Retry shared-grave list</a></section> : null}
      {shared.items.length ? <section className="profile-information-card" aria-labelledby="shared-plot-title"><h2 id="shared-plot-title">Also interred at this plot</h2><ul>{shared.items.map((person) => <li key={person.id}><Link href={preview ? `/admin/burial-records/${person.id}/preview?${new URLSearchParams({ returnTo })}` : `/gravesite?${new URLSearchParams({ id: person.id, returnTo })}`}>{person.name}</Link></li>)}</ul></section> : null}
      <section aria-labelledby="memorial-information-title" className="profile-information-card">
        <div className="profile-section-heading">
          <h2 id="memorial-information-title">Deceased Information</h2>
          <Icon name="records" size={22} />
        </div>
        {record.inscription ? <blockquote className="profile-registry-note"><p>“{record.inscription}”</p></blockquote> : null}
        <dl className="profile-registry-list">
          <div><dt>Full name</dt><dd>{record.name}</dd></div>
          <div><dt>Life dates</dt><dd>{record.dates}</dd></div>
          <div><dt>Interment Date</dt><dd>{record.burialDate}</dd></div>
        </dl>
        <p className="profile-registry-note">
          <Icon name="info" size={17} />
          Only recorded memorial information is shown. Please contact cemetery staff for assistance.
        </p>
      </section>
    </div>
  </article>;
}
