"use client";

import Link from "next/link";
import { isSyntheticPlot, plotAvailabilityLabel, syntheticPlotDescription } from "@/lib/synthetic-plots";
import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon, type IconName } from "@/components/ui/icons";
import { PageHeading } from "@/components/ui/page-heading";
import { Skeleton } from "@/components/ui/skeleton";
import type { PlotManagementQuery, PlotManagementSort } from "@/lib/supabase/admin-data";
import type { PlotManagementItem, PlotManagementSummary, PlotAreaOption } from "@/lib/supabase/types";

type QueryUpdate = Partial<PlotManagementQuery>;
type Props = {
  plots: PlotManagementItem[];
  total: number;
  summary: PlotManagementSummary | null;
  areas: PlotAreaOption[];
  loading: boolean;
  error: string;
  busy: boolean;
  canAdmin: boolean;
  queryState: PlotManagementQuery;
  onAdd: () => void;
  onEdit: (plot: PlotManagementItem) => void;
  onDelete: (plot: PlotManagementItem) => void;
  onQueryStateChange: (state: PlotManagementQuery) => void;
  onRetry: () => void;
};

export function PlotManagementList({ plots, total, summary, areas, loading, error, busy, canAdmin, queryState, onAdd, onEdit, onDelete, onQueryStateChange, onRetry }: Props) {
  const filterCount = getFilterCount(queryState);
  const pageCount = Math.max(1, Math.ceil(total / queryState.pageSize));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setOrDelete(params, "query", queryState.query);
    setOrDelete(params, "area", queryState.area === "all" ? "" : queryState.area);
    setOrDelete(params, "state", queryState.state === "all" ? "" : queryState.state);
    setOrDelete(params, "verification", queryState.verification === "all" ? "" : queryState.verification);
    setOrDelete(params, "sort", queryState.sort === "updated" ? "" : queryState.sort);
    setOrDelete(params, "direction", queryState.direction === "desc" ? "" : queryState.direction);
    setOrDelete(params, "page", queryState.page ? String(queryState.page + 1) : "");
    setOrDelete(params, "pageSize", queryState.pageSize === 20 ? "" : String(queryState.pageSize));
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
  }, [queryState]);

  function update(value: QueryUpdate, resetPage = true) {
    onQueryStateChange({ ...queryState, ...value, page: resetPage ? 0 : (value.page ?? queryState.page) });
  }
  function resetFilters() { update({ query: "", area: "all", state: "all", verification: "all" }); }
  function sortBy(sort: PlotManagementSort) {
    update({ sort, direction: queryState.sort === sort ? (queryState.direction === "asc" ? "desc" : "asc") : "asc" });
  }

  return <section aria-label="Plot Management" className="admin-burial-list admin-plot-list">
    <PageHeading actions={<Button icon="plus" onClick={onAdd}>Add plot</Button>} breadcrumbs={[{ label: "Dashboard", href: "/admin" }, { label: "Plot Management" }]} description="Review plot availability, assignments, and coordinate readiness across the cemetery." title="Plot Management" />
    <Metrics loading={loading && !summary} summary={summary} />
    <Toolbar areas={areas} filterCount={filterCount} queryState={queryState} onReset={resetFilters} onUpdate={update} />
    {filterCount ? <ActiveFilters areas={areas} queryState={queryState} onReset={resetFilters} onUpdate={update} /> : null}
    <div aria-busy={loading} className="admin-burial-data-panel">
      {error ? <EmptyState action={<Button onClick={onRetry} variant="secondary">Try again</Button>} className="admin-burial-empty" description={error} icon="alert" title="Plots unavailable" />
        : loading ? <Loading filtered={Boolean(plots.length || filterCount)} />
        : plots.length ? <>
          <PlotTable busy={busy} canAdmin={canAdmin} plots={plots} queryState={queryState} onChangeSort={sortBy} onDelete={onDelete} onEdit={onEdit} />
          <MobileCards busy={busy} canAdmin={canAdmin} plots={plots} onDelete={onDelete} onEdit={onEdit} />
          <Pagination pageCount={pageCount} queryState={queryState} total={total} visibleCount={plots.length} onUpdate={update} />
        </> : <EmptyState action={filterCount ? <Button onClick={resetFilters} variant="secondary">Clear filters</Button> : <Button icon="plus" onClick={onAdd}>Add plot</Button>} className="admin-burial-empty" description={filterCount ? "No plots match the current search and filters. Adjust or clear them to see more plots." : "No current plots have been added. Add the first plot after its cemetery area exists."} icon={filterCount ? "filter" : "grid"} title={filterCount ? "No matching plots" : "No plots yet"} />}
    </div>
  </section>;
}

function Metrics({ summary, loading }: { summary: PlotManagementSummary | null; loading: boolean }) {
  if (loading) return <div aria-label="Loading plot totals" className="admin-burial-metrics" role="status">{Array.from({ length: 4 }, (_, index) => <Skeleton className="admin-burial-metric admin-burial-metric--loading" key={index} />)}</div>;
  return <><div className="admin-burial-metrics"><Metric icon="grid" label="Physical plot records" value={summary?.total} /><Metric icon="records" label="Occupied" value={summary?.occupied} /><Metric icon="check" label="Available" tone="success" value={summary?.available} /><Metric icon="verification" label="Needs coordinate review" tone="warning" value={summary?.needsVerification} /></div>
    <p className="input-hint">Synthetic project plots: {summary?.syntheticPlots ?? "Count requires the staff read-model update"}.
      {summary?.syntheticPlots !== undefined ? " Excluded from physical totals and coordinate reviews." : ""}
    </p></>;
}
function Metric({ icon, label, value, tone = "neutral" }: { icon: IconName; label: string; value: number | null | undefined; tone?: "neutral" | "success" | "warning" }) { return <div className={`admin-burial-metric admin-burial-metric--${tone}`}><div><span>{label}</span><strong>{value == null ? "—" : value.toLocaleString()}</strong></div><span className="admin-burial-metric__icon"><Icon name={icon} size={20} /></span></div>; }

function Toolbar({ queryState, areas, filterCount, onUpdate, onReset }: { queryState: PlotManagementQuery; areas: PlotAreaOption[]; filterCount: number; onUpdate: (update: QueryUpdate, resetPage?: boolean) => void; onReset: () => void }) {
  return <div className="admin-burial-toolbar"><label className="admin-burial-search"><span className="sr-only">Search plots</span><Icon name="search" size={18} /><input autoComplete="off" maxLength={160} onChange={(event) => onUpdate({ query: event.target.value })} placeholder="Search plot, area, reference, or assigned person…" type="search" value={queryState.query} />{queryState.query ? <button aria-label="Clear plot search" onClick={() => onUpdate({ query: "" })} type="button"><Icon name="x" size={16} /></button> : null}</label><div className="admin-burial-toolbar__actions"><FilterMenu areas={areas} filterCount={filterCount} queryState={queryState} onReset={onReset} onUpdate={onUpdate} /><label className="admin-burial-sort-select"><span className="sr-only">Sort plots</span><Icon name="sort" size={17} /><select aria-label="Sort plots" onChange={(event) => { const [sort, direction] = event.target.value.split(":") as [PlotManagementSort, PlotManagementQuery["direction"]]; onUpdate({ sort, direction }); }} value={`${queryState.sort}:${queryState.direction}`}><option value="updated:desc">Recently updated</option><option value="updated:asc">Oldest updated</option><option value="plot:asc">Plot A–Z</option><option value="plot:desc">Plot Z–A</option><option value="area:asc">Area A–Z</option><option value="area:desc">Area Z–A</option><option value="state:asc">Operational state</option><option value="coordinate:asc">Coordinate readiness</option></select><Icon name="chevronDown" size={15} /></label></div><p aria-live="polite" className="admin-burial-toolbar__scope">Search and filters apply to all current plots. Results update automatically.</p></div>;
}

function FilterMenu({ queryState, areas, filterCount, onUpdate, onReset }: { queryState: PlotManagementQuery; areas: PlotAreaOption[]; filterCount: number; onUpdate: (update: QueryUpdate) => void; onReset: () => void }) {
  const id = useId(); const [open, setOpen] = useState(false); const trigger = useRef<HTMLButtonElement>(null); const panel = useRef<HTMLDivElement>(null); useDismiss(open, setOpen, trigger, panel);
  return <div className="admin-burial-filter-menu"><Button aria-controls={id} aria-expanded={open} aria-haspopup="dialog" className={filterCount ? "is-active" : undefined} icon="filter" onClick={() => setOpen((value) => !value)} ref={trigger} size="sm" variant="secondary">Filters{filterCount ? ` (${filterCount})` : ""}</Button>{open ? <div aria-label="Plot filters" className="admin-burial-filter-popover" id={id} ref={panel} role="dialog"><div className="admin-burial-filter-popover__header"><div><strong>Filter plots</strong><span>Combine operational and coordinate states.</span></div><button aria-label="Close filters" onClick={() => { setOpen(false); trigger.current?.focus(); }} type="button"><Icon name="x" size={16} /></button></div><div className="admin-burial-filter-grid"><FilterSelect label="Cemetery area" value={queryState.area} onChange={(area) => onUpdate({ area })} options={[["all", "All areas"], ...areas.map((area) => [String(area.areaId), `${area.label} (${area.areaCode})`] as [string, string])]} /><FilterSelect label="Operational state" value={queryState.state} onChange={(state) => onUpdate({ state: state as PlotManagementQuery["state"] })} options={[["all", "All states"], ["unknown", "Unknown — not assessed"], ["available", "Available"], ["occupied", "Occupied"], ["booked", "Booked"], ["hold", "On hold"]]} /><FilterSelect label="Coordinate readiness" value={queryState.verification} onChange={(verification) => onUpdate({ verification: verification as PlotManagementQuery["verification"] })} options={[["all", "All states"], ["missing", "Coordinates missing"], ["pending", "Pending review"], ["verified", "Verified"], ["rejected", "Rejected"]]} /></div><div className="admin-burial-filter-popover__footer"><Button disabled={!filterCount} onClick={onReset} size="sm" variant="quiet">Clear all</Button><Button onClick={() => { setOpen(false); trigger.current?.focus(); }} size="sm">Done</Button></div></div> : null}</div>;
}
function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) { return <label className="admin-burial-filter-select"><span>{label}</span><select onChange={(event) => onChange(event.target.value)} value={value}>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select><Icon name="chevronDown" size={15} /></label>; }
function ActiveFilters({ queryState, areas, onUpdate, onReset }: { queryState: PlotManagementQuery; areas: PlotAreaOption[]; onUpdate: (update: QueryUpdate) => void; onReset: () => void }) { const area = areas.find((item) => String(item.areaId) === queryState.area); const chips = [queryState.query ? { label: `Search: ${queryState.query}`, clear: () => onUpdate({ query: "" }) } : null, queryState.area !== "all" ? { label: `Area: ${area?.label || queryState.area}`, clear: () => onUpdate({ area: "all" }) } : null, queryState.state !== "all" ? { label: `State: ${stateLabel(queryState.state)}`, clear: () => onUpdate({ state: "all" }) } : null, queryState.verification !== "all" ? { label: `Coordinates: ${coordinateLabel(queryState.verification)}`, clear: () => onUpdate({ verification: "all" }) } : null].filter((chip): chip is { label: string; clear: () => void } => Boolean(chip)); return <div aria-label="Active plot filters" className="admin-burial-filter-chips"><span>{chips.length} active</span>{chips.map((chip) => <button aria-label={`Remove ${chip.label} filter`} key={chip.label} onClick={chip.clear} type="button">{chip.label}<Icon name="x" size={14} /></button>)}<button className="admin-burial-filter-chips__clear" onClick={onReset} type="button">Clear all</button></div>; }

function PlotTable({ plots, queryState, busy, canAdmin, onEdit, onDelete, onChangeSort }: { plots: PlotManagementItem[]; queryState: PlotManagementQuery; busy: boolean; canAdmin: boolean; onEdit: (plot: PlotManagementItem) => void; onDelete: (plot: PlotManagementItem) => void; onChangeSort: (sort: PlotManagementSort) => void }) { return <div className="admin-burial-table-wrap"><table className="admin-burial-table admin-plot-table"><caption className="sr-only">Current GraveNav plots matching the search and filters</caption><thead><tr><SortHeader label="Plot" sort="plot" state={queryState} onSort={onChangeSort} /><SortHeader label="Area" sort="area" state={queryState} onSort={onChangeSort} /><th scope="col">Assignment</th><SortHeader label="Operational state" sort="state" state={queryState} onSort={onChangeSort} /><SortHeader label="Coordinates" sort="coordinate" state={queryState} onSort={onChangeSort} /><th scope="col">Updated</th><th className="admin-burial-table__actions-heading" scope="col">Actions</th></tr></thead><tbody>{plots.map((plot) => <tr key={plot.lotId}><td><PlotIdentity plot={plot} /></td><td><Area plot={plot} /></td><td><Assignment plot={plot} /></td><td><OperationalState plot={plot} /></td><td><CoordinateState plot={plot} /></td><td><span className="admin-record-muted">{formatDate(plot.updatedAt)}</span></td><td><Actions busy={busy} canAdmin={canAdmin} plot={plot} onDelete={onDelete} onEdit={onEdit} /></td></tr>)}</tbody></table></div>; }
function SortHeader({ label, sort, state, onSort }: { label: string; sort: PlotManagementSort; state: PlotManagementQuery; onSort: (sort: PlotManagementSort) => void }) { const active = state.sort === sort; return <th aria-sort={active ? state.direction === "asc" ? "ascending" : "descending" : "none"} scope="col"><button className="admin-burial-sort-button" onClick={() => onSort(sort)} type="button">{label}<Icon className={active ? `is-${state.direction}` : undefined} name="chevronDown" size={14} /></button></th>; }
function MobileCards({ plots, busy, canAdmin, onEdit, onDelete }: { plots: PlotManagementItem[]; busy: boolean; canAdmin: boolean; onEdit: (plot: PlotManagementItem) => void; onDelete: (plot: PlotManagementItem) => void }) { return <div className="admin-burial-mobile-list">{plots.map((plot) => <article aria-label={`Plot ${plot.lotCode}, ${plot.areaName || "unassigned area"}`} className="admin-burial-mobile-card admin-plot-mobile-card" key={plot.lotId}><div className="admin-burial-mobile-card__top"><PlotIdentity plot={plot} /><OperationalState plot={plot} /></div><dl className="admin-burial-mobile-card__details"><div><dt>Area</dt><dd><Area plot={plot} /></dd></div><div><dt>Assignment</dt><dd><Assignment plot={plot} /></dd></div><div><dt>Coordinates</dt><dd><CoordinateState plot={plot} /></dd></div><div><dt>Updated</dt><dd>{formatDate(plot.updatedAt)}</dd></div></dl><Actions busy={busy} canAdmin={canAdmin} plot={plot} onDelete={onDelete} onEdit={onEdit} /></article>)}</div>; }

function PlotIdentity({ plot }: { plot: PlotManagementItem }) {
  const synthetic = isSyntheticPlot(plot.lotCode);
  return <div className="admin-record-identity">
    <span aria-hidden="true" className="admin-record-avatar"><Icon name="grid" size={17} /></span>
    <span>
      <strong>{synthetic ? "Synthetic project plot" : plot.lotCode}</strong>
      {synthetic ? <small style={{ overflowWrap: "anywhere" }}>Internal code: {plot.lotCode}</small> : null}
      {plot.syntheticPlotReference ? <small>Synthetic plot reference: {plot.syntheticPlotReference}</small> : null}
      <small>{synthetic ? "No verified physical location" : plot.legacyLocationCode || `Plot #${plot.lotId}`}</small>
    </span>
  </div>;
}
function Area({ plot }: { plot: PlotManagementItem }) { return <span className="admin-record-plot"><Icon name="location" size={14} /><span>{plot.areaName || "Unassigned area"}{plot.areaCode ? <small>{plot.areaCode}</small> : null}</span></span>; }
function Assignment({ plot }: { plot: PlotManagementItem }) {
  if (isSyntheticPlot(plot.lotCode)) return <details>
    <summary>{plot.interments?.length ?? 0} sample reservations · {plot.remainingInterments ?? 0} slots remain</summary>
    <p>{syntheticPlotDescription}</p>
    {plot.interments?.length ? <ul>{plot.interments.map((entry) => <li key={entry.id}>
      {entry.name} · {entry.removed ? "Reserved for recovery" : entry.status}
    </li>)}</ul> : <p>No sample interment assigned.</p>}
  </details>;
  if (plot.graveType || plot.interments?.length) return <details><summary>{plot.confirmedCount ?? 0} confirmed · {plot.remainingInterments ?? 0} open</summary>{plot.interments?.length ? <ul>{plot.interments.map((entry) => <li key={entry.id}>{entry.name} · {entry.removed ? "Reserved for recovery" : entry.status}{entry.confirmed === true ? " · confirmed" : " · confirmation not recorded"}</li>)}</ul> : <p>No burial assigned</p>}</details>; if (!plot.assignedBurialId) return <span className="admin-record-muted">No burial assigned</span>; return <span className="admin-plot-assignment"><strong>{plot.assignedDeceasedName || `Burial #${plot.assignedBurialId}`}</strong><small>{plot.assignedBurialDeleted ? "Reserved for recovery" : `Burial #${plot.assignedBurialId}`}</small></span>; }
function OperationalState({ plot }: { plot: PlotManagementItem }) {
  if (isSyntheticPlot(plot.lotCode)) return <span className="admin-record-muted">
    {plotAvailabilityLabel(plot.lotCode, plot.status)}
  </span>;
  return <span className={`admin-record-status admin-record-status--plot-${plot.operationalState}`}>
    <span aria-hidden="true" />{stateLabel(plot.operationalState)}
  </span>;
}
function CoordinateState({ plot }: { plot: PlotManagementItem }) {
  if (isSyntheticPlot(plot.lotCode)) return <span className="admin-record-muted">No verified physical location</span>; return <span className={`admin-record-verification admin-record-verification--${plot.coordinateState}`}><Icon name={plot.coordinateState === "verified" ? "check" : "verification"} size={14} />{coordinateLabel(plot.coordinateState)}</span>; }

function Actions({ plot, busy, canAdmin, onEdit, onDelete }: { plot: PlotManagementItem; busy: boolean; canAdmin: boolean; onEdit: (plot: PlotManagementItem) => void; onDelete: (plot: PlotManagementItem) => void }) {
  const id = useId(); const [open, setOpen] = useState(false); const [position, setPosition] = useState({ top: 0, left: 0 }); const trigger = useRef<HTMLButtonElement>(null); const panel = useRef<HTMLDivElement>(null); useDismiss(open, setOpen, trigger, panel);
  useEffect(() => { if (!open) return; const close = () => setOpen(false); window.addEventListener("resize", close); window.addEventListener("scroll", close, true); return () => { window.removeEventListener("resize", close); window.removeEventListener("scroll", close, true); }; }, [open]);
  useEffect(() => { if (!open) return; const frame = window.requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()); return () => window.cancelAnimationFrame(frame); }, [open]);
  function toggle() { setOpen((current) => { if (!current && trigger.current) { const rect = trigger.current.getBoundingClientRect(); setPosition({ top: rect.bottom + 6, left: Math.max(12, Math.min(rect.right - 210, window.innerWidth - 222)) }); } return !current; }); }
  function choose(action: () => void) { trigger.current?.focus(); setOpen(false); action(); }
  function navigateMenu(event: ReactKeyboardEvent<HTMLDivElement>) { const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []); if (!items.length || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return; event.preventDefault(); const current = items.indexOf(document.activeElement as HTMLElement); const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (current + 1) % items.length : (current <= 0 ? items.length : current) - 1; items[nextIndex]?.focus(); }
  const canRemove = canAdmin && !plot.assignedBurialId;
  const canViewBurial = Boolean(plot.assignedBurialId && !plot.assignedBurialDeleted);
  const canReviewCoordinates = canAdmin && plot.coordinateState !== "verified";
  const hasMenuActions = canViewBurial || canReviewCoordinates || canRemove;
  const menu = open ? <div className="admin-record-menu__popover admin-record-menu__popover--portal" id={id} onKeyDown={navigateMenu} ref={panel} role="menu" style={position}>{canViewBurial ? <Link href={`/admin/burial-records?record=${plot.assignedBurialId}`} onClick={() => setOpen(false)} role="menuitem"><Icon name="eye" size={16} />View burial record</Link> : null}{canReviewCoordinates ? <Link href="/admin/coordinate-verification" onClick={() => setOpen(false)} role="menuitem"><Icon name="verification" size={16} />Review coordinates</Link> : null}{canRemove ? <><span className="admin-record-menu__separator" /><button className="admin-record-menu__danger" onClick={() => choose(() => onDelete(plot))} role="menuitem" type="button"><Icon name="trash" size={16} />Remove plot</button></> : null}</div> : null;
  return <div className="admin-record-actions"><button className="admin-record-actions__edit" disabled={busy} onClick={() => onEdit(plot)} type="button"><Icon name="edit" size={16} /><span>Edit</span></button>{hasMenuActions ? <div className="admin-record-menu"><button aria-controls={id} aria-expanded={open} aria-haspopup="menu" aria-label={`More actions for plot ${plot.lotCode}`} disabled={busy} onClick={toggle} ref={trigger} type="button"><Icon name="more" size={18} /></button>{menu ? createPortal(menu, document.body) : null}</div> : null}</div>;
}

function Pagination({ total, visibleCount, pageCount, queryState, onUpdate }: { total: number; visibleCount: number; pageCount: number; queryState: PlotManagementQuery; onUpdate: (update: QueryUpdate, resetPage?: boolean) => void }) { const first = total ? queryState.page * queryState.pageSize + 1 : 0; const last = total ? first + visibleCount - 1 : 0; return <footer className="admin-burial-pagination"><div aria-live="polite" className="admin-burial-pagination__summary"><span>Showing <strong>{first.toLocaleString()}–{last.toLocaleString()}</strong> of <strong>{total.toLocaleString()}</strong> plots</span><label><span>Rows per page</span><select onChange={(event) => onUpdate({ pageSize: Number(event.target.value) })} value={queryState.pageSize}><option value="10">10</option><option value="20">20</option><option value="25">25</option><option value="50">50</option></select></label></div><nav aria-label="Plot pages" className="admin-burial-pagination__controls"><button disabled={!queryState.page} onClick={() => onUpdate({ page: queryState.page - 1 }, false)} type="button">Previous</button>{pageWindow(queryState.page, pageCount).map((page) => <button aria-current={page === queryState.page ? "page" : undefined} className={page === queryState.page ? "is-current" : undefined} key={page} onClick={() => onUpdate({ page }, false)} type="button"><span className="sr-only">Page </span>{page + 1}</button>)}<button disabled={queryState.page >= pageCount - 1} onClick={() => onUpdate({ page: queryState.page + 1 }, false)} type="button">Next</button></nav></footer>; }
function Loading({ filtered }: { filtered: boolean }) { return <div aria-label={filtered ? "Updating plot results" : "Loading plots"} className="admin-burial-loading" role="status"><div className="admin-burial-loading__label"><Icon name="search" size={16} /><span>{filtered ? "Updating results…" : "Loading protected plot records…"}</span></div>{Array.from({ length: 6 }, (_, index) => <Skeleton className="admin-burial-loading__row" key={index} />)}</div>; }
function useDismiss(open: boolean, setOpen: (open: boolean) => void, trigger: React.RefObject<HTMLButtonElement | null>, panel: React.RefObject<HTMLDivElement | null>) { useEffect(() => { if (!open) return; const pointer = (event: PointerEvent) => { if (event.target instanceof Node && !panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false); }; const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); } }; document.addEventListener("pointerdown", pointer); document.addEventListener("keydown", key); return () => { document.removeEventListener("pointerdown", pointer); document.removeEventListener("keydown", key); }; }, [open, panel, setOpen, trigger]); }
function getFilterCount(state: PlotManagementQuery) { return [state.query.trim(), state.area !== "all", state.state !== "all", state.verification !== "all"].filter(Boolean).length; }
function setOrDelete(params: URLSearchParams, key: string, value: string) { if (value) params.set(key, value); else params.delete(key); }
function stateLabel(value: PlotManagementItem["operationalState"] | "all") { return value === "unknown" ? "Unknown — not assessed" : value === "hold" ? "On hold" : title(value); }
function coordinateLabel(value: PlotManagementItem["coordinateState"] | "all") { return value === "missing" ? "Coordinates missing" : value === "pending" ? "Pending review" : title(value); }
function title(value: string) { return value.replace(/(^|\s)\S/g, (letter) => letter.toLocaleUpperCase()); }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "2-digit" }).format(date); }
function pageWindow(page: number, count: number) { const length = Math.min(count, 5); const start = Math.max(0, Math.min(page - 2, count - length)); return Array.from({ length }, (_, index) => start + index); }
