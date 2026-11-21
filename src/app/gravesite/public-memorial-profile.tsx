import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/icons";
import { GravesiteLocationCard } from "@/components/visitor/gravesite-location-card";
import { PARK_ADDRESS, PARK_NAME } from "@/lib/park-details";
import type { SharedPlotBurials } from "@/lib/supabase/public-data";
import type { PublicMemorialPhoto } from "@/lib/supabase/public-memorial-photos";
import type { PublicBurialRecord } from "@/lib/supabase/types";
import { memorialMapHref, visitorPlotDetails, type GravesiteMapScope } from "@/lib/visitor-presentation";
import { MemorialActions } from "./memorial-actions";
import { MemorialGallery, MemorialPhoto } from "./memorial-gallery";
import styles from "./memorial.module.css";

function recordedDate(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) ? null : new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" }).format(date);
}

export function PublicMemorialProfile({ record, mapScope, shared, photos, returnTo }: {
  record: PublicBurialRecord;
  mapScope: GravesiteMapScope;
  shared: SharedPlotBurials;
  photos: PublicMemorialPhoto[];
  returnTo: string;
}) {
  const plot = visitorPlotDetails(record);
  const birth = recordedDate(record.birthDate);
  const passing = recordedDate(record.deathDate);
  const dates = [birth, passing].filter(Boolean).join(" – ") || record.dates;
  const facts: { label: string; value: string | null; icon: IconName }[] = [
    { label: "Date of birth", value: birth, icon: "sun" },
    { label: "Date of passing", value: passing, icon: "clock" },
    { label: "Interment date", value: record.burialDate === "Not recorded" ? null : record.burialDate, icon: "records" },
  ];
  const datesAvailable = facts.some(fact => fact.value);
  return (
    <article className={styles.content} aria-labelledby="memorial-name">
      <section className={styles.hero} aria-labelledby="memorial-name">
        <div className={styles.heroPhoto}><MemorialPhoto name={record.name} photo={photos[0]} priority /></div>
        <div className={styles.identity}>
          <p className={styles.recordContext}>Memorial record{plot.garden !== "Not recorded" ? <> · <span>{plot.garden}</span></> : null}</p>
          <h1 id="memorial-name">{record.name}</h1>
          <p className={styles.lifeDates}>{dates}</p>
          <p className={styles.place}><Icon name="location" size={17} />{PARK_NAME} · {PARK_ADDRESS}</p>
        </div>
        <div className={styles.heroActions}>
          <Link className={styles.mapAction} href={memorialMapHref(record.id, mapScope, returnTo)}>
            <Icon name="map" size={18} />
            <span>{mapScope === "unavailable" ? "Browse Park Map" : "Find Gravesite on Map"}</span>
          </Link>
          <MemorialActions id={record.id} key={record.id} name={record.name} />
        </div>
      </section>

      <div className={styles.layout}>
        <section className={styles.remembering} aria-labelledby="memorial-remembering">
          <div className={styles.sectionTitle}><h2 id="memorial-remembering">Remembering {record.name}</h2><Icon name="tree" size={21} /></div>
          {datesAvailable ? <>
            <h3 className={styles.timelineTitle}>Biographical &amp; Interment Timeline</h3>
            <dl className={styles.timeline}>
              {facts.map(({ label, value, icon }) => value ? <div key={label}><Icon name={icon} size={19} />
                <dt>{label}</dt><dd>{value}</dd></div> : null)}
            </dl>
          </> : <p className={styles.muted}>Biographical dates are unavailable in this memorial record.</p>}
        </section>
        <div className={styles.location} id="gravesite-details" tabIndex={-1}>
          <GravesiteLocationCard record={record} mapScope={mapScope} returnTo={returnTo} memorialOverview />
        </div>
        {shared.state === "unavailable" || shared.items.length ? <section className={styles.shared} aria-labelledby="memorial-shared-title">
          <div className={styles.sectionTitle}><h2 id="memorial-shared-title"><Icon name="users" size={21} />Others at This Gravesite</h2>
            {shared.state === "ready" ? <span>{shared.items.length} {shared.items.length === 1 ? "memorial" : "memorials"}</span> : null}</div>
          {shared.state === "unavailable" ? <p className={styles.muted} role="status">
            The shared-grave list is temporarily unavailable. <a href={"/gravesite?" + new URLSearchParams({ id: record.id, returnTo })}>Retry shared-grave list</a>
          </p> : <ul className={styles.roster}>
            {shared.items.map(person => <li key={person.id}>
              <span className={styles.rosterIcon}><Icon name="person" size={20} /></span><strong>{person.name}</strong>
              <Link aria-label={`View Memorial for ${person.name}`} href={"/gravesite?" + new URLSearchParams({ id: person.id, returnTo })}>View Memorial<Icon name="chevronRight" size={15} /></Link>
            </li>)}
          </ul>}
        </section> : null}
        {photos.length ? <MemorialGallery photos={photos} key={record.id} name={record.name} /> : null}
      </div>
      <footer className={styles.footer}><Icon name="location" size={17} />{PARK_NAME}, {PARK_ADDRESS}</footer>
    </article>
  );
}
