import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import { PARK_NAME } from "@/lib/park-details";
import type { PublicBurialRecord } from "@/lib/supabase/types";
import { memorialMapHref, visitorPlotDetails, type GravesiteMapScope } from "@/lib/visitor-presentation";

export function GravesiteLocationCard({ record, mapScope = "unavailable", showMapLink = true, returnTo, memorialOverview = false }: {
  record: PublicBurialRecord;
  mapScope?: GravesiteMapScope;
  showMapLink?: boolean;
  returnTo?: string;
  memorialOverview?: boolean;
}) {
  const plot = visitorPlotDetails(record);
  const mapped = mapScope === "phase2";
  const onLayout = mapScope === "planning";
  const state: LocationState = onLayout ? {
    label: "Park layout available",
    heading: "Plot assigned on the park layout",
    description: "View the assigned plot on the planning map. GPS and walking directions are unavailable.",
    tone: "unavailable",
    icon: "info",
  } : !mapped ? {
    label: "Location unavailable",
    heading: "Gravesite location unavailable",
    description: "Please ask cemetery staff for help locating this gravesite. The recorded plot details are shown above.",
    tone: "unavailable",
    icon: "alert",
  } : {
    label: "Location available",
    heading: "Gravesite location available",
    description: "Open the map to view the gravesite and check whether walking directions are available.",
    tone: "verified",
    icon: "verification",
  };
  const mapHref = mapped || onLayout || memorialOverview ? memorialMapHref(record.id, mapScope, returnTo) : "/map";

  const heading = (
    <div className="profile-section-heading">
      <div><h2 id="plot-location-title">{memorialOverview ? "Gravesite Information" : "Gravesite Details"}</h2></div>
      <span className={`profile-status profile-status--${state.tone}`}>
        <Icon name={state.icon} size={14} />{state.label}
      </span>
    </div>
  );
  const plotFields = (
    <dl className="profile-plot-grid">
      <div><dt>Garden</dt><dd>{plot.garden}</dd></div>
      <div><dt>Block</dt><dd>{plot.block}</dd></div>
      <div><dt>Lot</dt><dd>{plot.lot}</dd></div>
    </dl>
  );
  const mapActions = (
    <>
      <div className={`profile-location-state profile-location-state--${state.tone}`}>
        <span><Icon name={state.icon} size={22} /></span>
        <div><strong>{state.heading}</strong><p>{state.description}</p></div>
      </div>
      {showMapLink ? <div className="profile-location-actions">
        <Link className={`button button--${mapped || onLayout ? "primary" : "secondary"}`} href={mapHref}>
          <Icon name="map" size={19} />
          <span>{onLayout ? "View on Park Layout" : mapped ? (memorialOverview ? "View on Park Map" : "View gravesite on map") : "Browse park map"}</span>
        </Link>
      </div> : null}
    </>
  );

  return (
    <section aria-labelledby="plot-location-title" className="profile-location-card">
      {memorialOverview ? <>
        <div className="memorial-plot-information">{heading}{plotFields}</div>
        <div className="memorial-map-overview">
          <h3>Park Map Overview</h3>
          <div className="memorial-map-surface"><Icon name="map" size={36} />{PARK_NAME}</div>
          {mapActions}
        </div>
      </> : <>{heading}{plotFields}{mapActions}</>}
    </section>
  );
}

type LocationState = {
  label: string;
  heading: string;
  description: string;
  tone: "verified" | "unavailable";
  icon: "verification" | "alert" | "info";
};
