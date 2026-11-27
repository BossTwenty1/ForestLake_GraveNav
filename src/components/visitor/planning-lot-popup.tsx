"use client";

import L from "leaflet";
import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Popup, useMap } from "react-leaflet";
import { Icon } from "@/components/ui/icons";
import type { Bounds, CadFeature } from "@/lib/phase2-planning";
import type { CapstonePlanningMemorial } from "@/lib/supabase/phase2-data";
import { localSupabaseConfig } from "@/lib/supabase/config";
import { useStaff } from "@/components/admin/staff-context";
import { MapBurialPreview } from "./map-burial-preview";
import styles from "./planning-lot-popup.module.css";

const MapBurialEditor = dynamic(() => import("@/components/admin/burial-record-pages").then(module => module.MapBurialEditor), { ssr: false });
const MapPlotEditor = dynamic(() => import("@/components/admin/admin-crud-pages").then(module => module.MapPlotEditor), { ssr: false });

export type PlanningLotPopupOptions = {
  preferredId?: string;
  returnTo?: string;
  staffMode?: boolean;
  onClose: () => void;
  project?: (xy: [number, number]) => L.LatLng;
  anchorBounds?: Bounds;
};

const compactQuery = "(max-width: 899px)";
type StaffPlot = {
  lotId: number | null;
  lotCode: string | null;
  status: string | null;
  holdKind?: "on_hold" | "unavailable" | null;
  revision?: number | null;
  coordinateStatus?: "pending" | "verified" | "rejected" | null;
  burialCount: number | null;
  graveType: string | null;
  lotType?: "standard" | "premium" | "special_premium" | "mausoleum" | null;
  ownerName?: string | null;
  latitude: number | null;
  longitude: number | null;
  draftCode?: string | null;
  draftType?: string | null;
  draftReview?: string | null;
  coordinateFromDraft?: boolean;
  exampleStatus?: string;
  burials?: { id: number; name: string; birthDate: string | null; deathDate: string | null; portraitId: number | null }[];
  proposedReview?: { lotId: number; lotCode: string; revision: number; proposedCode: string; lotType: string; distanceM: number } | null;
};
const compactSnapshot = () => window.matchMedia(compactQuery).matches;
function subscribeToCompact(change: () => void) {
  const query = window.matchMedia(compactQuery);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
}

export function PlanningLotPopup({ feature, preferredId, returnTo, staffMode = false, onClose, project, anchorBounds }: PlanningLotPopupOptions & { feature: CadFeature }) {
  const map = useMap();
  const staff = useStaff();
  const compact = useSyncExternalStore(subscribeToCompact, compactSnapshot, () => false);
  const heading = useId();
  const title = useRef<HTMLHeadingElement>(null);
  const sheet = useRef<HTMLElement>(null);
  const anchor = useMemo(() => {
    const [minX, minY, maxX, maxY] = anchorBounds ?? feature.bounds;
    const center: [number, number] = [(minX + maxX) / 2, (minY + maxY) / 2];
    return project ? project(center) : L.latLng(center[1], center[0]);
  }, [feature, project, anchorBounds]);
  const [records, setRecords] = useState<CapstonePlanningMemorial[] | null>(null);
  const [chosenId, setChosenId] = useState<string | undefined>(preferredId);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [staffPlot, setStaffPlot] = useState<StaffPlot | null | undefined>(undefined);
  const [staffError, setStaffError] = useState(false);
  const [staffPersonId, setStaffPersonId] = useState<number | null>(() => staffMode && preferredId && /^\d+$/.test(preferredId) ? Number(preferredId) : null);
  const [editingPersonId, setEditingPersonId] = useState<number | null>(null);
  const [editingPlot, setEditingPlot] = useState(false);
  const [editMessage, setEditMessage] = useState("");
  const [portraitUrl, setPortraitUrl] = useState("");
  const [editingStatus, setEditingStatus] = useState(false);
  const [nextStatus, setNextStatus] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [showBurialPreview, setShowBurialPreview] = useState(false);
  const [showCoordinateReview, setShowCoordinateReview] = useState(false);
  const [coordinateReason, setCoordinateReason] = useState("");
  const [coordinateBusy, setCoordinateBusy] = useState(false);
  const [coordinateError, setCoordinateError] = useState("");
  const [reviewMatch, setReviewMatch] = useState(false);
  const [matchReason, setMatchReason] = useState("");
  const [matchChecked, setMatchChecked] = useState(false);
  const [matchBusy, setMatchBusy] = useState(false);
  const [matchError, setMatchError] = useState("");
  const staffPerson = staffPlot?.burials?.find(person => person.id === staffPersonId) ?? staffPlot?.burials?.[0];
  const operationalPlot = localSupabaseConfig.environment === "local" && staffPlot?.lotId && staffPlot.lotCode
    && (!staffPlot.draftCode || staffPlot.draftCode === staffPlot.lotCode)
    && staffPlot.status === "AVAILABLE" && (staffPlot.graveType === "regular" || staffPlot.graveType === "mausoleum")
    && (staffPlot.graveType === "mausoleum" || (staffPlot.burialCount !== null && staffPlot.burialCount < 6))
    && staffPlot.latitude !== null && staffPlot.longitude !== null && !staffPlot.coordinateFromDraft
    ? { candidate: feature.id, lotId: staffPlot.lotId, lotCode: staffPlot.lotCode,
      onSaved: () => { window.dispatchEvent(new Event("gravenav:planning-status-changed")); onClose(); } } : undefined;
  const active = records?.find(person => person.id === chosenId) ?? records?.[0];
  const others = records?.filter(person => person.id !== active?.id) ?? [];
  const linkedCode = staffPlot?.lotCode && (!staffPlot.draftCode || staffPlot.draftCode === staffPlot.lotCode) ? staffPlot.lotCode : null;
  const linkedType = staffPlot?.lotType ? ({ standard: "Standard", premium: "Premium", special_premium: "Special premium", mausoleum: "Mausoleum" } as const)[staffPlot.lotType] : null;
  const canChangeMappedStatus = localSupabaseConfig.environment === "local" && feature.id.startsWith("lawn:") && !!linkedCode
    && !!staffPlot?.lotId && !!staffPlot.revision && staffPlot.burialCount === 0;
  const mappedStatus = staffPlot?.status === "AVAILABLE" ? "available" : staffPlot?.status === "BOOKED" ? "booked"
    : staffPlot?.holdKind === "on_hold" ? "hold" : staffPlot?.holdKind === "unavailable" ? "unavailable" : "";
  const canReviewCoordinates = staffMode && localSupabaseConfig.environment === "local" && ["ADMIN", "SUPER_ADMIN"].includes(staff?.role ?? "")
    && feature.id.startsWith("lawn:") && !!staffPlot?.lotId && !!staffPlot.lotCode && !!staffPlot.revision
    && (!staffPlot.draftCode || staffPlot.draftCode === staffPlot.lotCode)
    && staffPlot.latitude !== null && staffPlot.longitude !== null && !staffPlot.coordinateFromDraft;

  useEffect(() => {
    if (staffMode) return;
    const controller = new AbortController();
    fetch("/api/map/planning-memorials?" + new URLSearchParams({ candidate: feature.id }), { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw Error("Memorial details unavailable");
        const data: CapstonePlanningMemorial[] = await response.json();
        if (!controller.signal.aborted) setRecords(data);
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [feature.id, attempt, staffMode]);

  useEffect(() => {
    if (!staffMode) return;
    const controller = new AbortController();
    fetch("/api/admin/planning-plot?" + new URLSearchParams({ candidate: feature.id }), { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw Error("Plot details unavailable");
        const data: StaffPlot | null = await response.json();
        if (!controller.signal.aborted) setStaffPlot(data);
      })
      .catch(() => { if (!controller.signal.aborted) setStaffError(true); });
    return () => controller.abort();
  }, [feature.id, staffMode, attempt]);

  useEffect(() => {
    let cancelled = false;
    if (!staffPerson?.portraitId) return;
    import("@/lib/supabase/admin-data")
      .then(({ getAdminPhotoPreview }) => getAdminPhotoPreview(staffPerson.portraitId!))
      .then(url => { if (!cancelled) setPortraitUrl(url); })
      .catch(() => { if (!cancelled) setPortraitUrl(""); });
    return () => { cancelled = true; };
  }, [staffPerson?.id, staffPerson?.portraitId]);

  useEffect(() => {
    if (!compact || !sheet.current) return;
    L.DomEvent.disableClickPropagation(sheet.current);
    L.DomEvent.disableScrollPropagation(sheet.current);
    const point = map.latLngToContainerPoint(anchor);
    const size = map.getSize();
    map.panBy(point.subtract(L.point(size.x / 2, size.y * 0.27)), { animate: false });
  }, [anchor, compact, map]);

  function close() {
    onClose();
    map.getContainer().focus({ preventScroll: true });
  }

  async function saveExampleStatus() {
    if (!staffPlot || (!staffPlot.exampleStatus && !canChangeMappedStatus) || !nextStatus || savingStatus) return;
    setSavingStatus(true);
    setStatusError("");
    try {
      const response = await fetch("/api/admin/planning-statuses", { method: canChangeMappedStatus ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(canChangeMappedStatus ? { candidate: feature.id, lotId: staffPlot.lotId, lotCode: linkedCode,
          revision: staffPlot.revision, status: nextStatus, requestId: crypto.randomUUID() } : { candidate: feature.id, expected: staffPlot.exampleStatus, status: nextStatus }) });
      const data: { error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save. Reopen the plot and try again.");
      if (canChangeMappedStatus) { setStaffPlot(undefined); setAttempt(value => value + 1); }
      else setStaffPlot({ ...staffPlot, exampleStatus: nextStatus });
      setEditingStatus(false);
      window.dispatchEvent(new Event("gravenav:planning-status-changed"));
    } catch (reason) { setStatusError(reason instanceof Error ? reason.message : "Could not save. Reopen the plot and try again."); }
    finally { setSavingStatus(false); }
  }

  async function reviewCoordinates(status: "verified" | "rejected") {
    if (!canReviewCoordinates || !staffPlot?.lotId || !staffPlot.lotCode || !staffPlot.revision || coordinateBusy) return;
    if (status === "rejected" && !coordinateReason.trim()) { setCoordinateError("Enter a reason for the correction."); return; }
    setCoordinateBusy(true); setCoordinateError("");
    try {
      const response = await fetch("/api/admin/planning-plot", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate: feature.id, lotId: staffPlot.lotId, lotCode: staffPlot.lotCode, revision: staffPlot.revision,
          status, reason: coordinateReason.trim(), requestId: crypto.randomUUID() }) });
      const data: { error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error || "Coordinate review could not be saved.");
      setShowCoordinateReview(false); setStaffPlot(undefined); setAttempt(value => value + 1);
    } catch (reason) { setCoordinateError(reason instanceof Error ? reason.message : "Coordinate review could not be saved."); }
    finally { setCoordinateBusy(false); }
  }

  async function confirmMatch() {
    const proposed = staffPlot?.proposedReview;
    if (!proposed || !matchChecked || matchReason.trim().length < 10 || matchBusy) return;
    setMatchBusy(true); setMatchError("");
    try {
      const response = await fetch("/api/admin/planning-plot", { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate: feature.id, lotId: proposed.lotId, oldCode: proposed.lotCode, revision: proposed.revision,
          proposedCode: proposed.proposedCode, reason: matchReason.trim(), requestId: crypto.randomUUID() }) });
      const data: { error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error || "The plot match could not be saved.");
      setReviewMatch(false); setEditMessage("Plot match saved. The plot remains temporarily unavailable until its status is changed.");
      setStaffPlot(undefined); setAttempt(value => value + 1);
      window.dispatchEvent(new Event("gravenav:planning-status-changed"));
    } catch (error) { setMatchError(error instanceof Error ? error.message : "The plot match could not be saved."); }
    finally { setMatchBusy(false); }
  }

  const card = <section ref={sheet} aria-labelledby={heading} onClick={event => event.stopPropagation()}
    className={styles.card + (compact ? " " + styles.sheet : "")} data-lot-popup={compact ? "sheet" : "anchored"}>
    <div className={styles.header}>
      <div className={styles.identity}>
        <p className={styles.source}>Park layout</p>
        <h2 id={heading} ref={title} tabIndex={-1} aria-live="polite">{staffMode ? "Plot details" : active?.name ?? "Gravesite details"}</h2>
        {!staffMode && active?.dates ? <p className={styles.dates}>{active.dates}</p> : null}
      </div>
      <button type="button" className={styles.close} onClick={close} aria-label="Close gravesite popup" title="Close gravesite popup">
        <Icon name="close" size={20} />
      </button>
    </div>
    <div className={styles.body}>
      {staffMode ? staffError ? <p role="status">Staff plot details are temporarily unavailable.</p>
        : staffPlot === undefined ? <p role="status">Loading plot details…</p>
        : staffPlot === null ? <p>This map shape is not linked to a plot record yet.</p>
        : <>
        {staffPerson ? <section className={styles.staffPerson} aria-label="Deceased profile">
          <div className={styles.personHeader}>
            {portraitUrl && staffPerson.portraitId ? <Image src={portraitUrl} width={56} height={56} unoptimized alt={`Portrait of ${staffPerson.name}`} className={styles.portrait} onError={() => setPortraitUrl("")} /> : <span className={styles.portraitPlaceholder} aria-label="No profile picture"><Icon name="person" size={22} /></span>}
            <strong>{staffPerson.name}</strong>
          </div>
          <dl className={styles.plotDetails}>
            <div><dt>Birth date</dt><dd>{staffPerson.birthDate ?? "Not recorded"}</dd></div>
            <div><dt>Death date</dt><dd>{staffPerson.deathDate ?? "Not recorded"}</dd></div>
          </dl>
          {staffPlot.burials && staffPlot.burials.length > 1 ? <div className={styles.roster} aria-label="People in this plot">
            {staffPlot.burials.map(person => <button key={person.id} type="button" aria-pressed={person.id === staffPerson.id} onClick={() => { setPortraitUrl(""); setStaffPersonId(person.id); }}>{person.name}</button>)}
          </div> : null}
        </section> : null}
        <dl className={styles.plotDetails}>
          <div><dt>Plot code</dt><dd>{linkedCode ?? (staffPlot.draftCode ? `${staffPlot.draftCode} (draft)` : "Awaiting review")}</dd></div>
          <div><dt>Lot type</dt><dd>{linkedCode && linkedType ? linkedType : staffPlot.draftType ? `${staffPlot.draftType} (draft)` : "Not yet matched to the sector plan"}</dd></div>
          <div><dt>Coordinates</dt><dd>{staffPlot.latitude !== null && staffPlot.longitude !== null
            ? `${staffPlot.latitude.toFixed(7)}, ${staffPlot.longitude.toFixed(7)}${staffPlot.coordinateFromDraft ? " (draft match)" : ""}` : "Not recorded"}</dd></div>
        </dl></> : null}
      {!staffMode && (active ? <>
        {active.reference ? <p className={styles.reference}><Icon name="location" size={16} />{active.reference}</p> : null}
        {others.length ? <div className={styles.roster} aria-label="Other memorials at this gravesite" role="group">
          <p>Also at this gravesite</p>
          {others.map(person => <button key={person.id} type="button" onClick={() => {
            setChosenId(person.id);
            requestAnimationFrame(() => title.current?.focus({ preventScroll: true }));
          }}>{person.name}</button>)}
        </div> : null}
      </> : failed ? <p role="status">Memorial details are temporarily unavailable.{" "}
        <button type="button" className={styles.retry} onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>Try again</button>
      </p> : <p role="status">{records ? "No public memorial details available." : "Loading memorial details…"}</p>)}
    </div>
    {staffMode && staffPlot ? <div className={styles.actions}>
      {editMessage ? <p role="status">{editMessage}</p> : null}
      {localSupabaseConfig.environment === "local" && staffPlot.proposedReview && ["ADMIN", "SUPER_ADMIN"].includes(staff?.role ?? "") ? <button type="button" onClick={() => setReviewMatch(value => !value)}>Review plot match</button> : null}
      {reviewMatch && staffPlot.proposedReview ? <div className={styles.statusEditor}>
        <p>Existing plot: {staffPlot.proposedReview.lotCode}. Proposed map code: {staffPlot.proposedReview.proposedCode}. Lot type: {staffPlot.proposedReview.lotType}.</p>
        <p>Compare the PDF and CAD before confirming. This links the existing plot and keeps it temporarily unavailable; it does not verify its coordinates.</p>
        <label htmlFor={`${heading}-match-reason`}>What did you check?</label>
        <textarea id={`${heading}-match-reason`} value={matchReason} minLength={10} maxLength={500} onChange={event => setMatchReason(event.target.value)} />
        <label><input type="checkbox" checked={matchChecked} onChange={event => setMatchChecked(event.target.checked)} /> I checked that this is the correct plot.</label>
        <div><button type="button" disabled={matchBusy || !matchChecked || matchReason.trim().length < 10} onClick={() => void confirmMatch()}>Confirm plot match</button>{" "}
          <button type="button" disabled={matchBusy} onClick={() => setReviewMatch(false)}>Cancel</button></div>
        {matchError ? <p role="alert">{matchError}</p> : null}
      </div> : null}
      {!staffPlot.lotId && !staffPlot.proposedReview ? <p>This map shape needs a plot match before its status or coordinates can be changed.</p> : null}
      {localSupabaseConfig.environment === "local" && linkedCode && staffPlot.lotId ? <button type="button" onClick={() => setEditingPlot(true)}>Edit plot / owner</button> : null}
      {editingPlot && linkedCode && staffPlot.lotId ? <MapPlotEditor lotId={staffPlot.lotId} lotCode={linkedCode} onClose={() => setEditingPlot(false)} onSaved={() => {
        setEditingPlot(false); setEditMessage("Plot updated."); setStaffPlot(undefined); setAttempt(value => value + 1);
        window.dispatchEvent(new Event("gravenav:planning-status-changed"));
      }} /> : null}
      {staffPerson ? <button type="button" onClick={() => setEditingPersonId(staffPerson.id)}>Edit burial record</button> : null}
      {staffPerson ? <Link href={`/admin/burial-records/${staffPerson.id}?returnTo=${encodeURIComponent("/admin/cemetery-map")}`}>Record details</Link> : null}
      {editingPersonId !== null ? <MapBurialEditor recordId={String(editingPersonId)} onClose={() => setEditingPersonId(null)} onSaved={message => {
        setEditingPersonId(null); setEditMessage(message); setStaffPlot(undefined); setAttempt(value => value + 1);
        window.dispatchEvent(new Event("gravenav:planning-status-changed"));
      }} /> : null}
      <button type="button" disabled={!staffPlot.exampleStatus && !canChangeMappedStatus} title={!staffPlot.exampleStatus && !canChangeMappedStatus ? "This plot needs review before its status can be changed" : "Change the local test status"} onClick={() => { setNextStatus(staffPlot.exampleStatus ?? mappedStatus); setEditingStatus(true); }}>Change status</button>
      <button type="button" disabled={!operationalPlot && (localSupabaseConfig.environment !== "local" || staffPlot.exampleStatus !== "available")} title={operationalPlot ? "Add a local pending burial" : "Preview only; no records are saved"} onClick={() => setShowBurialPreview(true)}>Add burial record</button>
      {staffMode && ["ADMIN", "SUPER_ADMIN"].includes(staff?.role ?? "") ? <button type="button" disabled={!canReviewCoordinates} title={canReviewCoordinates ? "Review this plot's coordinates" : "A matching linked plot and its own coordinates are required"} onClick={() => setShowCoordinateReview(value => !value)}>Review coordinates</button> : null}
      {showCoordinateReview ? <div className={styles.statusEditor}>
        <p>Current status: {staffPlot.coordinateStatus ?? "pending"}. Verify only after checking the location and plot match.</p>
        <label htmlFor={`${heading}-coordinate-reason`}>Reason if correction is needed</label>
        <textarea id={`${heading}-coordinate-reason`} value={coordinateReason} maxLength={2000} onChange={event => setCoordinateReason(event.target.value)} />
        <div><button type="button" disabled={coordinateBusy || staffPlot.coordinateStatus === "verified"} onClick={() => void reviewCoordinates("verified")}>Verify</button>{" "}
          <button type="button" disabled={coordinateBusy} onClick={() => void reviewCoordinates("rejected")}>Needs correction</button>{" "}
          <button type="button" disabled={coordinateBusy} onClick={() => setShowCoordinateReview(false)}>Cancel</button></div>
        {coordinateError ? <p role="alert">{coordinateError}</p> : null}
      </div> : null}
      {showBurialPreview ? <MapBurialPreview code={linkedCode ?? staffPlot.draftCode ?? "Awaiting review"}
        lotType={linkedCode && linkedType ? linkedType : staffPlot.draftType ?? "Not recorded"} coordinates={staffPlot.latitude !== null && staffPlot.longitude !== null ? `${staffPlot.latitude.toFixed(7)}, ${staffPlot.longitude.toFixed(7)}` : "Not recorded"} ownerName={staffPlot.ownerName ?? null} operational={operationalPlot} onClose={() => setShowBurialPreview(false)} /> : null}
      {editingStatus ? <div className={styles.statusEditor}>
        <label htmlFor={`${heading}-status`}>Local test status</label>
        <select id={`${heading}-status`} value={nextStatus} onChange={event => setNextStatus(event.target.value)}>
          <option value="available">Available</option><option value="booked">Booked</option><option value="hold">On hold</option><option value="unavailable">Temporarily unavailable</option>
        </select>
        <div><button type="button" onClick={saveExampleStatus} disabled={savingStatus}>Save</button>{" "}<button type="button" onClick={() => setEditingStatus(false)} disabled={savingStatus}>Cancel</button></div>
        {statusError ? <p role="alert">{statusError}</p> : null}
      </div> : null}
    </div> : null}
    {!staffMode && active ? (
        <Link className={styles.profile} href={"/gravesite?" + new URLSearchParams({
          id: active.id, ...(returnTo ? { returnTo } : {}),
        })}>View Memorial Profile <Icon name="chevronRight" size={17} /></Link>
    ) : null}
  </section>;

  return compact ? card : <Popup position={anchor} className={styles.popup} offset={[0, -27]} maxWidth={340}
    closeButton={false} closeOnClick={false} closeOnEscapeKey={false} autoPanPadding={[20, 20]}>
    {card}
  </Popup>;
}
