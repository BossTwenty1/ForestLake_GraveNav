import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import { canNavigateToPublicRecord } from "@/lib/public-navigation";
import { safePreviewReturnTo, visitorPlotDetails } from "@/lib/visitor-presentation";
import type { PublicBurialRecord } from "@/lib/supabase/types";

export function PublicSearchResultCard({
  record,
  returnTo,
  preview = false,
}: {
  record: PublicBurialRecord;
  returnTo?: string;
  preview?: boolean;
}) {
  const plot = visitorPlotDetails(record);
  const destinationVerified = !preview && canNavigateToPublicRecord(record);
  const matchLabel = getMatchLabel(record.matchType);
  const location = getLocationPresentation(record, destinationVerified);
  const locationIcon = destinationVerified
    ? "location"
    : "records";
  const statusClassName =
    "result-status result-status--" +
    (destinationVerified ? "verified" : "pending");
  const statusIcon = destinationVerified
    ? "verification"
    : record.coordinateStatus === "rejected"
      ? "alert"
      : "clock";
  const profileParams = new URLSearchParams({
    id: record.id,
    ...(returnTo ? { returnTo } : {}),
  });
  const profileHref = preview
    ? `/admin/burial-records/${encodeURIComponent(record.id)}/preview?` +
      new URLSearchParams({ returnTo: safePreviewReturnTo(returnTo) })
    : `/gravesite?${profileParams}`;

  return (
    <article className="public-result-card">
      <div className="public-result-card__top">
        <div
          aria-label="Memorial photo unavailable"
          className={`public-result-card__media ${record.tone}`}
          role="img"
        >
          <Icon name="photos" size={27} />
          <span>Memorial record</span>
        </div>

        <div className="public-result-card__identity">
          <div className="public-result-card__badges">
            <span
              className={statusClassName}
            >
              <Icon name={statusIcon} size={12} />
              {location.label}
            </span>
            <span className="result-match">{matchLabel}</span>
          </div>
          <h2>{record.name}</h2>
          <p className="public-result-card__years">{record.dates}</p>
          <div className="public-result-card__metadata">
            <span>{plot.garden}</span>
            <span>Gravesite Reference: {plot.reference}</span>
          </div>
        </div>
      </div>

      <div className="public-result-card__detail">
        <Icon name={locationIcon} size={17} />
        <span>{location.detail}</span>
      </div>

      <dl className="public-result-card__facts">
        <div>
          <dt>Interment Date</dt>
          <dd>{record.burialDate}</dd>
        </div>
        <div>
          <dt>Block</dt>
          <dd>{plot.block}</dd>
        </div>
      </dl>

      <Link
        className="public-result-card__action"
        href={profileHref}
      >
        <Icon name="records" size={17} />
        <span>
          View {record.matchType === "similar" ? "suggested " : ""}Memorial Profile
        </span>
        <Icon name="chevronRight" size={16} />
      </Link>
    </article>
  );
}

function getMatchLabel(matchType: PublicBurialRecord["matchType"]) {
  if (matchType === "similar") return "Similar name";
  if (matchType === "exact") return "Exact match";
  return "Matching record";
}

function getLocationPresentation(
  record: PublicBurialRecord,
  destinationVerified: boolean,
) {
  if (destinationVerified) {
    return {
      label: "Verified destination",
      detail: "Location is verified. Open the record before starting guidance.",
    };
  }

  if (record.coordinateStatus === "rejected") {
    return {
      label: "Location not valid",
      detail:
        "The recorded coordinate did not pass verification; exact guidance is unavailable.",
    };
  }

  if (record.coordinateStatus === "pending") {
    return {
      label: "Location pending",
      detail:
        "Coordinates are awaiting verification; exact guidance stays unavailable.",
    };
  }

  return {
      label: "Location unavailable",
      detail: "Walking directions are unavailable. Please contact cemetery staff for assistance.",
  };
}
