import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import type { PublicBurialRecord } from "@/lib/supabase/types";
import { visitorPlotDetails } from "@/lib/visitor-presentation";

export function GravesiteLocationCard({ record, mapScope = "unavailable", showMapLink = true }: {
  record: PublicBurialRecord;
  mapScope?: "phase2" | "unavailable";
  showMapLink?: boolean;
}) {
  const plot = visitorPlotDetails(record);
  const state: LocationState = mapScope === "unavailable" ? {
    label: "Location unavailable",
    heading: "Gravesite location unavailable",
    description: "Please ask cemetery staff for help locating this gravesite. The recorded plot details are shown above.",
    tone: "unavailable",
    icon: "alert",
  } : locationState(record.coordinateStatus);

  return (
    <section
      aria-labelledby="plot-location-title"
      className="profile-location-card"
    >
      <div className="profile-section-heading">
        <div>
          <h2 id="plot-location-title">Gravesite Details</h2>
        </div>
        <span className={`profile-status profile-status--${state.tone}`}>
          <Icon name={state.icon} size={14} />
          {state.label}
        </span>
      </div>

      <dl className="profile-plot-grid">
        <div>
          <dt>Garden</dt>
          <dd>{plot.garden}</dd>
        </div>
        <div>
          <dt>Block</dt>
          <dd>{plot.block}</dd>
        </div>
        <div>
          <dt>Lot</dt>
          <dd>{plot.lot}</dd>
        </div>
      </dl>

      <div
        className={`profile-location-state profile-location-state--${state.tone}`}
      >
        <span>
          <Icon name={state.icon} size={22} />
        </span>
        <div>
          <strong>{state.heading}</strong>
          <p>{state.description}</p>
        </div>
      </div>

      {showMapLink ? <div className="profile-location-actions">
        <Link
          className="button button--secondary button--lg"
          href={`/map?id=${encodeURIComponent(record.id)}`}
        >
          <Icon name="map" size={19} />
          <span>View gravesite on map</span>
        </Link>
      </div> : null}
    </section>
  );
}

type LocationState = {
  label: string;
  heading: string;
  description: string;
  tone: "verified" | "pending" | "unavailable";
  icon: "verification" | "clock" | "alert" | "location";
};

function locationState(
  status: PublicBurialRecord["coordinateStatus"],
): LocationState {
  if (status === "verified") {
    return {
      label: "Location available",
      heading: "Gravesite location available",
      description:
        "Open the map to view the gravesite and check available walking directions.",
      tone: "verified",
      icon: "verification",
    };
  }

  if (status === "rejected") {
    return {
      label: "Location unavailable",
      heading: "Navigation unavailable",
      description:
        "Please ask cemetery staff for help locating this gravesite.",
      tone: "unavailable",
      icon: "alert",
    };
  }

  if (status === "pending") {
    return {
      label: "Location unavailable",
      heading: "Walking directions unavailable",
      description:
        "Walking directions are not available for this gravesite yet. Please ask cemetery staff for assistance.",
      tone: "pending",
      icon: "clock",
    };
  }

  return {
    label: "Location unavailable",
    heading: "Gravesite location unavailable",
    description:
      "You can still view the recorded garden, block and plot details. Please ask cemetery staff for help locating the gravesite.",
    tone: "unavailable",
    icon: "location",
  };
}
