import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import { PARK_NAME } from "@/lib/park-details";
import { canNavigateToPublicRecord } from "@/lib/public-navigation";
import { safePreviewReturnTo, visitorPlotDetails } from "@/lib/visitor-presentation";
import type { PublicBurialRecord } from "@/lib/supabase/types";

export function PublicSearchResultCard({
  record,
  photo,
  returnTo,
  preview = false,
}: {
  record: PublicBurialRecord;
  photo?: { src: string; caption?: string | null } | null;
  returnTo?: string;
  preview?: boolean;
}) {
  const plot = visitorPlotDetails(record);
  const hasRecordedCoordinates = !preview && canNavigateToPublicRecord(record);
  const matchLabel = getMatchLabel(record.matchType);
  const location = getLocationPresentation(record, hasRecordedCoordinates);
  const locationIcon = hasRecordedCoordinates
    ? "location"
    : "records";
  const statusClassName =
    "result-status result-status--" +
    (hasRecordedCoordinates ? "verified" : "pending");
  const statusIcon = hasRecordedCoordinates
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

  const actionLabel = `View ${record.matchType === "similar" ? "suggested " : ""}Memorial Profile for ${record.name}`;
  const status = <span className={statusClassName} data-location={hasRecordedCoordinates ? "check" : record.coordinateStatus}>
    <Icon name={statusIcon} size={12} />{location.label}
  </span>;
  const match = <span className="result-match">{matchLabel}</span>;

  if (!preview) {
    return (
      <article className="search-memorial-card">
        <div className="search-memorial-badges">{status}{match}</div>
        {photo?.src ? (
          <div className="search-memorial-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={photo.caption || `Memorial photograph for ${record.name}`}
              decoding="async"
              loading="lazy"
              src={photo.src}
            />
          </div>
        ) : (
          <div aria-label="Memorial photo unavailable" className="search-memorial-placeholder" role="img">
            <Icon name="tree" size={48} /><span>{PARK_NAME}</span>
          </div>
        )}
        <div className="search-memorial-details">
          <h2>{record.name}</h2>
          <p className="search-memorial-years"><Icon name="clock" size={15} />{record.dates}</p>
          <dl className="search-memorial-reference">
            <div><Icon name="location" size={14} /><dt>Gravesite Reference</dt><dd>{plot.reference}</dd></div>
            <div><dt>Interment Date</dt><dd>{record.burialDate}</dd></div>
          </dl>
        </div>
        <Link className="search-memorial-action" href={profileHref} aria-label={actionLabel}>
          <Icon name="eye" size={17} /><span>View Memorial</span><Icon name="chevronRight" size={16} />
        </Link>
      </article>
    );
  }

  return (
    <article className="public-result-card">
      <div className="public-result-card__top">
        <div aria-label="Memorial photo unavailable" className={`public-result-card__media ${record.tone}`} role="img">
          <Icon name="photos" size={27} /><span>Memorial record</span>
        </div>
        <div className="public-result-card__identity">
          <div className="public-result-card__badges">{status}{match}</div>
          <h2>{record.name}</h2>
          <p className="public-result-card__years">{record.dates}</p>
          <div className="public-result-card__metadata">
            <span>{plot.garden}</span><span>Gravesite Reference: {plot.reference}</span>
          </div>
        </div>
      </div>
      <div className="public-result-card__detail"><Icon name={locationIcon} size={17} /><span>{location.detail}</span></div>
      <dl className="public-result-card__facts">
        <div><dt>Interment Date</dt><dd>{record.burialDate}</dd></div>
        <div><dt>Block</dt><dd>{plot.block}</dd></div>
      </dl>
      <Link className="public-result-card__action" href={profileHref} aria-label={actionLabel}>
        <Icon name="records" size={17} />
        <span>View {record.matchType === "similar" ? "suggested " : ""}Memorial Profile</span>
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
  hasRecordedCoordinates: boolean,
) {
  if (hasRecordedCoordinates) {
    return {
      label: "Check map availability",
      detail: "Open the memorial to check the gravesite location and available directions.",
    };
  }

  if (record.coordinateStatus === "rejected") {
    return {
      label: "Location unavailable",
      detail: "Please ask cemetery staff for help locating this gravesite.",
    };
  }

  if (record.coordinateStatus === "pending") {
    return {
      label: "Location pending",
      detail:
        "Walking directions are unavailable. Please ask cemetery staff for assistance.",
    };
  }

  return {
      label: "Location unavailable",
      detail: "Walking directions are unavailable. Please contact cemetery staff for assistance.",
  };
}
