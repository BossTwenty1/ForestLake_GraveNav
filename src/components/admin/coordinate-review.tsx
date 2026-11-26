"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { AdminEditMenu } from "@/components/admin/admin-edit-menu";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon, type IconName } from "@/components/ui/icons";
import { PageHeading } from "@/components/ui/page-heading";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getCoordinateVerificationPage,
  updateLotVerification,
  type CoordinateVerificationQuery,
  type CoordinateVerificationSort,
} from "@/lib/supabase/admin-data";
import type {
  CoordinateVerificationItem,
  CoordinateVerificationSummary,
  PlotAreaOption,
  PlotCoordinateState,
} from "@/lib/supabase/types";

type QueryUpdate = Partial<CoordinateVerificationQuery>;

export function CoordinateReview({ initialQueryState, selectedPlot = "" }: { initialQueryState: CoordinateVerificationQuery; selectedPlot?: string }) {
  const [queryState, setQueryState] = useState(initialQueryState);
  const [items, setItems] = useState<CoordinateVerificationItem[]>([]);
  const [summary, setSummary] = useState<CoordinateVerificationSummary | null>(null);
  const [areas, setAreas] = useState<PlotAreaOption[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<CoordinateVerificationItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const selectedFromUrl = useRef(false);
  const loadSequence = useRef(0);

  const load = useCallback(async (state: CoordinateVerificationQuery) => {
    const sequence = ++loadSequence.current;
    let recoveringPage = false;
    setLoading(true);
    try {
      const page = await getCoordinateVerificationPage(state);
      if (sequence !== loadSequence.current) return;
      const lastPage = Math.max(0, Math.ceil(page.total / state.pageSize) - 1);
      if (state.page > lastPage) {
        recoveringPage = true;
        setQueryState((current) => ({ ...current, page: lastPage }));
        return;
      }
      setItems(page.items);
      setTotal(page.total);
      setSummary(page.summary);
      setAreas(page.areas);
      setLoadError("");
      if (selectedPlot && !selectedFromUrl.current) {
        const match = page.items.find((item) => item.lotCode.toLocaleLowerCase() === selectedPlot.toLocaleLowerCase());
        if (match) {
          selectedFromUrl.current = true;
          setSelected(match);
        }
      }
    } catch (reason) {
      if (sequence === loadSequence.current) setLoadError(errorMessage(reason));
    } finally {
      if (sequence === loadSequence.current && !recoveringPage) setLoading(false);
    }
  }, [selectedPlot]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(queryState), 260);
    return () => { window.clearTimeout(timer); loadSequence.current += 1; };
  }, [load, queryState]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setOrDelete(params, "query", queryState.query);
    setOrDelete(params, "area", queryState.area === "all" ? "" : queryState.area);
    setOrDelete(params, "state", queryState.state === "actionable" ? "" : queryState.state);
    setOrDelete(params, "sort", queryState.sort === "priority" ? "" : queryState.sort);
    setOrDelete(params, "direction", queryState.direction === "asc" ? "" : queryState.direction);
    setOrDelete(params, "page", queryState.page ? String(queryState.page + 1) : "");
    setOrDelete(params, "pageSize", queryState.pageSize === 20 ? "" : String(queryState.pageSize));
    setOrDelete(params, "plot", selected?.lotCode || "");
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
  }, [queryState, selected]);

  function update(value: QueryUpdate, resetPage = true) {
    loadSequence.current += 1;
    setLoading(true);
    setQueryState((current) => ({ ...current, ...value, page: resetPage ? 0 : (value.page ?? current.page) }));
  }

  async function review(item: CoordinateVerificationItem, status: "verified" | "rejected", reason = "") {
    if (busy) return;
    setBusy(true);
    setActionError("");
    setMessage("");
    try {
      await updateLotVerification(item.lotId, item.revision, status, reason);
      setSelected(null);
      setMessage(status === "verified"
        ? `${item.lotCode} coordinates were verified.`
        : `${item.lotCode} coordinates were rejected for follow-up.`);
      await load(queryState);
    } catch (reason) {
      setActionError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const filterCount = getFilterCount(queryState);
  const pageCount = Math.max(1, Math.ceil(total / queryState.pageSize));
  const zeroWork = total === 0 && summary?.needsVerification === 0 && !filterCount && queryState.state === "actionable";

  return <section aria-label="Coordinate Verification" className="admin-burial-list admin-coordinate-page">
    <PageHeading breadcrumbs={[{ label: "Dashboard", href: "/admin" }, { label: "Coordinate Verification" }]} description="Review plot coordinates that are missing, pending, or rejected before they can support eligible map and visitor-navigation experiences." title="Coordinate Verification" />
    {message ? <Alert icon="check" title="Coordinate review saved" variant="success">{message}</Alert> : null}
    <Metrics loading={loading && !summary} summary={summary} />
    <Toolbar areas={areas} filterCount={filterCount} queryState={queryState} onReset={() => update({ query: "", area: "all", state: "actionable" })} onUpdate={update} />
    {filterCount ? <ActiveFilters areas={areas} queryState={queryState} onReset={() => update({ query: "", area: "all", state: "actionable" })} onUpdate={update} /> : null}
    <div aria-busy={loading} className="admin-burial-data-panel">
      {loadError ? <EmptyState action={<Button onClick={() => void load(queryState)} variant="secondary">Try again</Button>} className="admin-burial-empty" description={loadError} icon="alert" title="Coordinate queue unavailable" />
        : loading ? <Loading filtered={Boolean(items.length || filterCount)} />
        : items.length ? <>
          <CoordinateTable items={items} queryState={queryState} selectedId={selected?.lotId ?? null} onReview={setSelected} onSort={(sort) => update({ sort, direction: queryState.sort === sort ? (queryState.direction === "asc" ? "desc" : "asc") : "asc" })} />
          <MobileCards items={items} onReview={setSelected} />
          <Pagination pageCount={pageCount} queryState={queryState} total={total} visibleCount={items.length} onUpdate={update} />
        </> : <EmptyState
          action={filterCount || queryState.state !== "actionable" ? <Button onClick={() => update({ query: "", area: "all", state: "actionable" })} variant="secondary">Return to work queue</Button> : undefined}
          className="admin-burial-empty"
          description={emptyDescription(queryState, zeroWork)}
          icon={zeroWork ? "check" : "filter"}
          title={zeroWork ? "Coordinate work is up to date" : queryState.state === "verified" ? "No verified coordinates" : "No matching coordinates"}
        />}
    </div>
    {selected && typeof document !== "undefined" ? createPortal(<ReviewDrawer busy={busy} error={actionError} item={selected} onClose={() => { if (!busy) { setSelected(null); setActionError(""); } }} onReview={review} />, document.querySelector(".admin-shell") || document.body) : null}
  </section>;
}

function Metrics({ summary, loading }: { summary: CoordinateVerificationSummary | null; loading: boolean }) {
  if (loading) return <div aria-label="Loading coordinate totals" className="admin-burial-metrics" role="status">{Array.from({ length: 4 }, (_, index) => <Skeleton className="admin-burial-metric admin-burial-metric--loading" key={index} />)}</div>;
  return <div className="admin-burial-metrics">
    <Metric icon="verification" label="Needs attention" tone="warning" value={summary?.needsVerification} />
    <Metric icon="location" label="Missing coordinates" tone="danger" value={summary?.missing} />
    <Metric icon="clock" label="Pending review" tone="warning" value={summary?.pending} />
    <Metric icon="alert" label="Rejected" tone="danger" value={summary?.rejected} />
  </div>;
}

function Metric({ icon, label, value, tone = "neutral" }: { icon: IconName; label: string; value: number | null | undefined; tone?: "neutral" | "warning" | "danger" }) {
  return <div className={`admin-burial-metric admin-burial-metric--${tone}`}><div><span>{label}</span><strong>{value == null ? "—" : value.toLocaleString()}</strong></div><span className="admin-burial-metric__icon"><Icon name={icon} size={20} /></span></div>;
}

function Toolbar({ queryState, areas, filterCount, onUpdate, onReset }: { queryState: CoordinateVerificationQuery; areas: PlotAreaOption[]; filterCount: number; onUpdate: (update: QueryUpdate, resetPage?: boolean) => void; onReset: () => void }) {
  return <div className="admin-burial-toolbar">
    <label className="admin-burial-search"><span className="sr-only">Search coordinate queue</span><Icon name="search" size={18} /><input autoComplete="off" maxLength={160} onChange={(event) => onUpdate({ query: event.target.value })} placeholder="Search plot, area, or assigned person…" type="search" value={queryState.query} />{queryState.query ? <button aria-label="Clear coordinate search" onClick={() => onUpdate({ query: "" })} type="button"><Icon name="x" size={16} /></button> : null}</label>
    <div className="admin-burial-toolbar__actions"><FilterMenu areas={areas} filterCount={filterCount} queryState={queryState} onReset={onReset} onUpdate={onUpdate} /><label className="admin-burial-sort-select"><span className="sr-only">Sort coordinate queue</span><Icon name="sort" size={17} /><select aria-label="Sort coordinate queue" onChange={(event) => { const [sort, direction] = event.target.value.split(":") as [CoordinateVerificationSort, CoordinateVerificationQuery["direction"]]; onUpdate({ sort, direction }); }} value={`${queryState.sort}:${queryState.direction}`}><option value="priority:asc">Review priority</option><option value="updated:desc">Recently updated</option><option value="updated:asc">Oldest updated</option><option value="plot:asc">Plot A–Z</option><option value="plot:desc">Plot Z–A</option><option value="area:asc">Area A–Z</option><option value="area:desc">Area Z–A</option><option value="status:asc">Coordinate state</option><option value="accuracy:asc">Best recorded accuracy</option><option value="accuracy:desc">Lowest recorded accuracy</option></select><Icon name="chevronDown" size={15} /></label></div>
    <p aria-live="polite" className="admin-burial-toolbar__scope">The default work queue shows missing, pending, and rejected coordinates. Verified plots remain available through filters.</p>
  </div>;
}

function FilterMenu({ queryState, areas, filterCount, onUpdate, onReset }: { queryState: CoordinateVerificationQuery; areas: PlotAreaOption[]; filterCount: number; onUpdate: (update: QueryUpdate) => void; onReset: () => void }) {
  const id = useId(); const [open, setOpen] = useState(false); const trigger = useRef<HTMLButtonElement>(null); const panel = useRef<HTMLDivElement>(null); useDismiss(open, setOpen, trigger, panel);
  return <div className="admin-burial-filter-menu"><Button aria-controls={id} aria-expanded={open} aria-haspopup="dialog" className={filterCount ? "is-active" : undefined} icon="filter" onClick={() => setOpen((value) => !value)} ref={trigger} size="sm" variant="secondary">Filters{filterCount ? ` (${filterCount})` : ""}</Button>{open ? <div aria-label="Coordinate queue filters" className="admin-burial-filter-popover" id={id} ref={panel} role="dialog"><div className="admin-burial-filter-popover__header"><div><strong>Filter coordinate work</strong><span>Choose an area and coordinate state.</span></div><button aria-label="Close filters" onClick={() => { setOpen(false); trigger.current?.focus(); }} type="button"><Icon name="x" size={16} /></button></div><div className="admin-burial-filter-grid"><FilterSelect label="Cemetery area" value={queryState.area} onChange={(area) => onUpdate({ area })} options={[["all", "All areas"], ...areas.map((area) => [String(area.areaId), `${area.label} (${area.areaCode})`] as [string, string])]} /><FilterSelect label="Coordinate state" value={queryState.state} onChange={(state) => onUpdate({ state: state as CoordinateVerificationQuery["state"] })} options={[["actionable", "Needs attention"], ["all", "All coordinate states"], ["missing", "Missing coordinates"], ["pending", "Pending review"], ["rejected", "Rejected"], ["verified", "Verified"]]} /></div><div className="admin-burial-filter-popover__footer"><Button disabled={!filterCount} onClick={onReset} size="sm" variant="quiet">Clear all</Button><Button onClick={() => { setOpen(false); trigger.current?.focus(); }} size="sm">Done</Button></div></div> : null}</div>;
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) { return <label className="admin-burial-filter-select"><span>{label}</span><select onChange={(event) => onChange(event.target.value)} value={value}>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select><Icon name="chevronDown" size={15} /></label>; }

function ActiveFilters({ queryState, areas, onUpdate, onReset }: { queryState: CoordinateVerificationQuery; areas: PlotAreaOption[]; onUpdate: (update: QueryUpdate) => void; onReset: () => void }) {
  const area = areas.find((item) => String(item.areaId) === queryState.area);
  const chips = [queryState.query ? { label: `Search: ${queryState.query}`, clear: () => onUpdate({ query: "" }) } : null, queryState.area !== "all" ? { label: `Area: ${area?.label || queryState.area}`, clear: () => onUpdate({ area: "all" }) } : null, queryState.state !== "actionable" ? { label: `State: ${stateLabel(queryState.state)}`, clear: () => onUpdate({ state: "actionable" }) } : null].filter((chip): chip is { label: string; clear: () => void } => Boolean(chip));
  return <div aria-label="Active coordinate filters" className="admin-burial-filter-chips"><span>{chips.length} active</span>{chips.map((chip) => <button aria-label={`Remove ${chip.label} filter`} key={chip.label} onClick={chip.clear} type="button">{chip.label}<Icon name="x" size={14} /></button>)}<button className="admin-burial-filter-chips__clear" onClick={onReset} type="button">Clear all</button></div>;
}

function CoordinateTable({ items, queryState, selectedId, onReview, onSort }: { items: CoordinateVerificationItem[]; queryState: CoordinateVerificationQuery; selectedId: number | null; onReview: (item: CoordinateVerificationItem) => void; onSort: (sort: CoordinateVerificationSort) => void }) {
  return <div className="admin-burial-table-wrap"><table className="admin-burial-table admin-coordinate-table"><caption className="sr-only">Plots matching the coordinate verification search and filters</caption><thead><tr><SortHeader label="Plot" sort="plot" state={queryState} onSort={onSort} /><SortHeader label="Area" sort="area" state={queryState} onSort={onSort} /><th scope="col">Assignment</th><SortHeader label="Coordinate state" sort="status" state={queryState} onSort={onSort} /><SortHeader label="Coordinates and accuracy" sort="accuracy" state={queryState} onSort={onSort} /><SortHeader label="Updated" sort="updated" state={queryState} onSort={onSort} /><th className="admin-burial-table__actions-heading" scope="col">Action</th></tr></thead><tbody>{items.map((item) => <tr data-selected={selectedId === item.lotId} key={item.lotId}><td><PlotIdentity item={item} /></td><td><Area item={item} /></td><td><Assignment item={item} /></td><td><CoordinateState item={item} /></td><td><CoordinateValues item={item} /></td><td><time className="admin-record-muted" dateTime={item.updatedAt}>{formatDate(item.updatedAt)}</time></td><td><button className="admin-row-action" onClick={() => onReview(item)} type="button">Review<span className="sr-only"> {item.lotCode}</span></button></td></tr>)}</tbody></table></div>;
}

function SortHeader({ label, sort, state, onSort }: { label: string; sort: CoordinateVerificationSort; state: CoordinateVerificationQuery; onSort: (sort: CoordinateVerificationSort) => void }) { const active = state.sort === sort; return <th aria-sort={active ? state.direction === "asc" ? "ascending" : "descending" : "none"} scope="col"><button className="admin-burial-sort-button" onClick={() => onSort(sort)} type="button">{label}<Icon className={active ? `is-${state.direction}` : undefined} name="chevronDown" size={14} /></button></th>; }
function MobileCards({ items, onReview }: { items: CoordinateVerificationItem[]; onReview: (item: CoordinateVerificationItem) => void }) { return <div className="admin-burial-mobile-list">{items.map((item) => <article aria-label={`Plot ${item.lotCode}, ${stateLabel(item.coordinateState)}`} className="admin-burial-mobile-card admin-coordinate-mobile-card" key={item.lotId}><div className="admin-burial-mobile-card__top"><PlotIdentity item={item} /><CoordinateState item={item} /></div><dl className="admin-burial-mobile-card__details"><div><dt>Area</dt><dd><Area item={item} /></dd></div><div><dt>Assignment</dt><dd><Assignment item={item} /></dd></div><div><dt>Coordinates</dt><dd><CoordinateValues item={item} /></dd></div><div><dt>Updated</dt><dd>{formatDate(item.updatedAt)}</dd></div></dl><Button onClick={() => onReview(item)} size="sm" variant="secondary">Review coordinates</Button></article>)}</div>; }
function PlotIdentity({ item }: { item: CoordinateVerificationItem }) { return <div className="admin-record-identity"><span aria-hidden="true" className="admin-record-avatar"><Icon name="target" size={17} /></span><span><strong>{item.lotCode}</strong><small>Plot #{item.lotId}</small></span></div>; }
function Area({ item }: { item: CoordinateVerificationItem }) { return <span className="admin-record-plot"><Icon name="location" size={14} /><span>{item.areaName || "Unassigned area"}{item.areaCode ? <small>{item.areaCode}</small> : null}</span></span>; }
function Assignment({ item }: { item: CoordinateVerificationItem }) { if (!item.assignedBurialId) return <span className="admin-record-muted">No burial assigned</span>; return <span className="admin-plot-assignment"><strong>{item.assignedDeceasedName || `Burial #${item.assignedBurialId}`}</strong><small>{item.assignedBurialDeleted ? "Reserved for recovery" : `Burial #${item.assignedBurialId}`}</small></span>; }
function CoordinateState({ item }: { item: CoordinateVerificationItem }) { return <span className={`admin-record-verification admin-record-verification--${item.coordinateState}`}><Icon name={item.coordinateState === "verified" ? "check" : item.coordinateState === "missing" ? "location" : "verification"} size={14} />{stateLabel(item.coordinateState)}</span>; }
function CoordinateValues({ item }: { item: CoordinateVerificationItem }) { return item.location ? <span className="admin-coordinate-values"><span>{formatCoordinate(item.location.latitude)}, {formatCoordinate(item.location.longitude)}</span><small>{item.coordinateAccuracyM == null ? "Accuracy not recorded" : `± ${formatAccuracy(item.coordinateAccuracyM)} m`}</small></span> : <span className="admin-coordinate-values admin-coordinate-values--missing"><span>Not recorded</span><small>Add coordinates in Plot Management</small></span>; }

function ReviewDrawer({ item, busy, error, onClose, onReview }: { item: CoordinateVerificationItem; busy: boolean; error: string; onClose: () => void; onReview: (item: CoordinateVerificationItem, status: "verified" | "rejected", reason?: string) => Promise<void> }) {
  const titleId = useId(); const panel = useRef<HTMLDivElement>(null); const closeButton = useRef<HTMLButtonElement>(null); const restoreFocus = useRef<HTMLElement | null>(null); const closeRef = useRef(onClose); const busyRef = useRef(busy); const [rejecting, setRejecting] = useState(false); const [reason, setReason] = useState(item.rejectionReason || ""); const [validation, setValidation] = useState("");
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => {
    restoreFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => closeButton.current?.focus());
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busyRef.current) { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== "Tab" || !panel.current) return;
      const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], textarea:not([disabled])'));
      if (!focusable.length) return; const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => { window.cancelAnimationFrame(frame); document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", keydown); restoreFocus.current?.focus(); };
  }, []);
  async function reject() { const trimmed = reason.trim(); if (!trimmed) { setValidation("Enter a reason so the next staff member knows what must be corrected."); return; } setValidation(""); await onReview(item, "rejected", trimmed); }
  return <div className="admin-coordinate-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><div aria-labelledby={titleId} aria-modal="true" className="admin-coordinate-drawer" ref={panel} role="dialog"><header className="admin-coordinate-drawer__header"><div><span className="admin-coordinate-drawer__icon"><Icon name="target" size={20} /></span><div><p>Coordinate review</p><h2 id={titleId}>{item.lotCode}</h2></div></div><button aria-label="Close coordinate review" disabled={busy} onClick={onClose} ref={closeButton} type="button"><Icon name="x" size={19} /></button></header><div className="admin-coordinate-drawer__body">{error ? <Alert icon="alert" title="Review not saved" variant="danger">{error}</Alert> : null}<section aria-labelledby={`${titleId}-decision`} className="admin-coordinate-review-summary"><div><h3 id={`${titleId}-decision`}>Current decision</h3><CoordinateState item={item} /></div><p>{issueText(item)}</p>{item.rejectionReason ? <div className="admin-coordinate-rejection"><strong>Rejection reason</strong><p>{item.rejectionReason}</p></div> : null}</section><section aria-labelledby={`${titleId}-coordinate`}><h3 id={`${titleId}-coordinate`}>Recorded coordinate</h3><dl className="admin-coordinate-detail-grid"><Detail label="Latitude" value={item.location ? formatCoordinate(item.location.latitude) : "Not recorded"} /><Detail label="Longitude" value={item.location ? formatCoordinate(item.location.longitude) : "Not recorded"} /><Detail label="Reported accuracy" value={item.coordinateAccuracyM == null ? "Not recorded" : `± ${formatAccuracy(item.coordinateAccuracyM)} m`} /><Detail label="Last updated" value={formatDateTime(item.updatedAt)} /></dl>{item.coordinateAccuracyM == null && item.location ? <p className="admin-coordinate-note">No GPS accuracy was stored with this coordinate. Verification status does not imply a particular measurement precision.</p> : null}</section><section aria-labelledby={`${titleId}-context`}><h3 id={`${titleId}-context`}>Plot context</h3><dl className="admin-coordinate-detail-grid"><Detail label="Cemetery area" value={[item.areaName, item.areaCode].filter(Boolean).join(" · ") || "Unassigned"} /><Detail label="Burial assignment" value={item.assignedDeceasedName || (item.assignedBurialId ? `Burial #${item.assignedBurialId}` : "No burial assigned")} /></dl>{item.assignedBurialDeleted ? <p className="admin-coordinate-note">This plot remains reserved for a recoverable burial record.</p> : null}</section><section aria-labelledby={`${titleId}-history`}><h3 id={`${titleId}-history`}>Coordinate activity</h3>{item.history.length ? <ol className="admin-coordinate-history">{item.history.map((event) => <li key={event.auditId}><span aria-hidden="true" /><div><strong>{eventLabel(event.event)}</strong><p>{event.reason || (event.actorName ? `Recorded by ${event.actorName}` : "Recorded by an authorized administrator")}</p></div><time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time></li>)}</ol> : <p className="admin-coordinate-note">No coordinate-specific audit event is available for this plot yet.</p>}</section>{rejecting ? <section aria-labelledby={`${titleId}-reject`} className="admin-coordinate-reject"><h3 id={`${titleId}-reject`}>Reject coordinates</h3><p>Explain what must be corrected before these coordinates can be verified.</p><label><span>Rejection reason</span><textarea aria-describedby={validation ? `${titleId}-reject-error` : undefined} aria-invalid={Boolean(validation)} disabled={busy} maxLength={2000} onChange={(event) => setReason(event.target.value)} rows={4} value={reason} /></label>{validation ? <p className="admin-coordinate-field-error" id={`${titleId}-reject-error`} role="alert">{validation}</p> : null}</section> : null}</div><footer className="admin-coordinate-drawer__footer"><AdminEditMenu actionLabel={item.location ? "Edit coordinates in Plot Management" : "Add coordinates in Plot Management"} disabled={busy} href={`/admin/plot-management?query=${encodeURIComponent(item.lotCode)}`} label={`More actions for plot ${item.lotCode}`} /><div className="admin-coordinate-drawer__actions">{rejecting ? <><Button disabled={busy} onClick={() => { setRejecting(false); setValidation(""); }} variant="secondary">Cancel rejection</Button><Button disabled={busy} onClick={() => void reject()} variant="danger">{busy ? "Saving…" : "Confirm rejection"}</Button></> : item.location ? <label className="admin-row-status-select"><span className="sr-only">Coordinate review actions</span><select aria-label="Coordinate review action" disabled={busy} onChange={(event) => { const action = event.target.value; event.currentTarget.value = ""; if (action === "verified") void onReview(item, "verified"); if (action === "rejected") setRejecting(true); }} value=""><option value="">Review action…</option>{item.coordinateState !== "verified" ? <option value="verified">Verify coordinates</option> : null}<option value="rejected">Reject coordinates</option></select><Icon name="chevronDown" size={14} /></label> : null}</div></footer></div></div>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
function Pagination({ total, visibleCount, pageCount, queryState, onUpdate }: { total: number; visibleCount: number; pageCount: number; queryState: CoordinateVerificationQuery; onUpdate: (update: QueryUpdate, resetPage?: boolean) => void }) { const first = total ? queryState.page * queryState.pageSize + 1 : 0; const last = total ? first + visibleCount - 1 : 0; return <footer className="admin-burial-pagination"><div aria-live="polite" className="admin-burial-pagination__summary"><span>Showing <strong>{first.toLocaleString()}–{last.toLocaleString()}</strong> of <strong>{total.toLocaleString()}</strong> plots</span><label><span>Rows per page</span><select onChange={(event) => onUpdate({ pageSize: Number(event.target.value) })} value={queryState.pageSize}><option value="10">10</option><option value="20">20</option><option value="25">25</option><option value="50">50</option></select></label></div><nav aria-label="Coordinate verification pages" className="admin-burial-pagination__controls"><button disabled={!queryState.page} onClick={() => onUpdate({ page: queryState.page - 1 }, false)} type="button">Previous</button>{pageWindow(queryState.page, pageCount).map((page) => <button aria-current={page === queryState.page ? "page" : undefined} className={page === queryState.page ? "is-current" : undefined} key={page} onClick={() => onUpdate({ page }, false)} type="button"><span className="sr-only">Page </span>{page + 1}</button>)}<button disabled={queryState.page >= pageCount - 1} onClick={() => onUpdate({ page: queryState.page + 1 }, false)} type="button">Next</button></nav></footer>; }
function Loading({ filtered }: { filtered: boolean }) { return <div aria-label={filtered ? "Updating coordinate results" : "Loading coordinate verification queue"} className="admin-burial-loading" role="status"><div className="admin-burial-loading__label"><Icon name="verification" size={16} /><span>{filtered ? "Updating results…" : "Loading protected coordinate records…"}</span></div>{Array.from({ length: 6 }, (_, index) => <Skeleton className="admin-burial-loading__row" key={index} />)}</div>; }
function useDismiss(open: boolean, setOpen: (open: boolean) => void, trigger: React.RefObject<HTMLButtonElement | null>, panel: React.RefObject<HTMLDivElement | null>) { useEffect(() => { if (!open) return; const pointer = (event: PointerEvent) => { if (event.target instanceof Node && !panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false); }; const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); } }; document.addEventListener("pointerdown", pointer); document.addEventListener("keydown", key); return () => { document.removeEventListener("pointerdown", pointer); document.removeEventListener("keydown", key); }; }, [open, panel, setOpen, trigger]); }
function getFilterCount(state: CoordinateVerificationQuery) { return [state.query.trim(), state.area !== "all", state.state !== "actionable"].filter(Boolean).length; }
function setOrDelete(params: URLSearchParams, key: string, value: string) { if (value) params.set(key, value); else params.delete(key); }
function stateLabel(state: CoordinateVerificationQuery["state"] | PlotCoordinateState) { return ({ actionable: "Needs attention", all: "All states", missing: "Missing", pending: "Pending review", rejected: "Rejected", verified: "Verified" } as const)[state]; }
function issueText(item: CoordinateVerificationItem) { if (item.coordinateState === "missing") return "No geographic coordinate is recorded. Add coordinates in Plot Management before review."; if (item.coordinateState === "rejected") return "This coordinate needs correction before it can be used by eligible visitor-facing features."; if (item.coordinateState === "verified") return "This coordinate has completed administrator review. Downstream visibility still follows burial and public-display rules."; return "This coordinate is recorded and waiting for an administrator decision."; }
function eventLabel(event: CoordinateVerificationItem["history"][number]["event"]) { return ({ submitted: "Coordinates submitted", updated: "Coordinates updated", verified: "Coordinates verified", rejected: "Coordinates rejected" } as const)[event]; }
function formatCoordinate(value: number) { return value.toFixed(6); }
function formatAccuracy(value: number) { return value.toLocaleString(undefined, { maximumFractionDigits: 1 }); }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "Unknown" : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date); }
function formatDateTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "Unknown" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date); }
function emptyDescription(state: CoordinateVerificationQuery, zeroWork: boolean) { if (zeroWork) return "All submitted plot coordinates are currently verified, and no plots are missing coordinates."; if (state.state === "verified") return "No verified coordinates match the current search and area filters."; return "No plots match the current coordinate search and filters. Adjust or clear them to see more results."; }
function pageWindow(current: number, total: number) { const start = Math.max(0, Math.min(current - 1, total - 3)); return Array.from({ length: Math.min(3, total) }, (_, index) => start + index); }
function errorMessage(reason: unknown) { return reason instanceof Error ? reason.message : "The coordinate operation could not be completed."; }
