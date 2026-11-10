import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import type { PublicBurialRecord } from "@/lib/supabase/types";

export function GravesiteLocationCard({ record, mapScope = "unavailable" }: { record: PublicBurialRecord; mapScope?: "phase2" | "unavailable" }) {
  const state: LocationState = mapScope === "unavailable" ? {
    label: "Map unavailable",
    heading: "Geographic guidance unavailable",
    description: "This record has no approved Phase 2 plot association.",
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
          <p>Gravesite location</p>
          <h2 id="plot-location-title">Recorded plot details</h2>
        </div>
        <span className={`profile-status profile-status--${state.tone}`}>
          <Icon name={state.icon} size={14} />
          {state.label}
        </span>
      </div>

      <dl className="profile-plot-grid">
        <div>
          <dt>Garden</dt>
          <dd>{record.section}</dd>
        </div>
        <div>
          <dt>Block / row</dt>
          <dd>{record.row}</dd>
        </div>
        <div>
          <dt>Plot</dt>
          <dd>{record.plot}</dd>
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
          <p>{mapScope === "phase2" ? "Published Phase 2 geometry and reviewed walking access are required for geographic guidance." : state.description}</p>
        </div>
      </div>

      <div className="profile-location-actions">
        <Link
          className="button button--secondary button--lg"
          href={`/map?id=${encodeURIComponent(record.id)}`}
        >
          <Icon name="map" size={19} />
          <span>View gravesite on map</span>
        </Link>
      </div>
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
      label: "Verified",
      heading: "Verified destination",
      description:
        "This recorded coordinate is eligible for gravesite guidance.",
      tone: "verified",
      icon: "verification",
    };
  }

  if (status === "rejected") {
    return {
      label: "Not valid",
      heading: "Navigation unavailable",
      description:
        "The previous coordinate did not pass cemetery verification. " +
        "Staff must correct it before guidance can be offered.",
      tone: "unavailable",
      icon: "alert",
    };
  }

  if (status === "pending") {
    return {
      label: "Awaiting review",
      heading: "Coordinate verification pending",
      description:
        "A coordinate exists, but exact guidance remains unavailable until " +
        "cemetery staff verify it.",
      tone: "pending",
      icon: "clock",
    };
  }

  return {
    label: "Not recorded",
    heading: "No navigation coordinate",
    description:
      "This memorial has no public GPS destination. You can still view its " +
      "recorded section and plot on the cemetery map.",
    tone: "unavailable",
    icon: "location",
  };
}
