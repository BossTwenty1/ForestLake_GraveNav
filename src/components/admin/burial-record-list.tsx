"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon, type IconName } from "@/components/ui/icons";
import { PageHeading } from "@/components/ui/page-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { isSyntheticPlot } from "@/lib/synthetic-plots";
import type { BurialRecordQuery, BurialRecordSort, DashboardCounts } from "@/lib/supabase/admin-data";
import type { AdminRecord } from "@/lib/supabase/types";

type RecordStatus = AdminRecord["recordStatus"];
type QueryUpdate = Partial<BurialRecordQuery>;
type Props = {
  records: AdminRecord[]; total: number; totalAll: number; sections: string[];
  counts: DashboardCounts | null; loading: boolean; error: string; busy: boolean;
  canAdmin: boolean; queryState: BurialRecordQuery;
  onAdd: () => void; onEdit: (record: AdminRecord) => void;
  onDelete: (record: AdminRecord) => void;
  onChangeStatus: (record: AdminRecord, status: RecordStatus) => void;
  onBatchStatus: (records: AdminRecord[], status: RecordStatus) => Promise<boolean> | void;
  onQueryStateChange: (state: BurialRecordQuery) => void; onRetry: () => void;
};

export function BurialRecordList({ records, total, totalAll, sections, counts, loading, error, busy, canAdmin, queryState, onAdd, onEdit, onDelete, onChangeStatus, onBatchStatus, onQueryStateChange, onRetry }: Props) {
  const [selected, setSelected] = useState<Map<number, AdminRecord>>(new Map());
  const selectAllRef = useRef<HTMLInputElement>(null);
  const visibleIds = records.map((record) => record.burialId);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someVisibleSelected = visibleIds.some((id) => selected.has(id));
  const filterCount = getFilterCount(queryState);
  const pageCount = Math.max(1, Math.ceil(total / queryState.pageSize));

  useEffect(() => { if (selectAllRef.current) selectAllRef.current.indeterminate = someVisibleSelected && !allVisibleSelected; }, [allVisibleSelected, someVisibleSelected]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setOrDelete(params, "query", queryState.query);
    setOrDelete(params, "section", queryState.section === "all" ? "" : queryState.section);
    setOrDelete(params, "status", queryState.status === "all" ? "" : queryState.status);
    setOrDelete(params, "verification", queryState.verification === "all" ? "" : queryState.verification);
    setOrDelete(params, "date", queryState.dateFilter === "all" ? "" : queryState.dateFilter);
    setOrDelete(params, "sort", queryState.sort === "updated" ? "" : queryState.sort);
    setOrDelete(params, "direction", queryState.direction === "desc" ? "" : queryState.direction);
    setOrDelete(params, "page", queryState.page ? String(queryState.page + 1) : "");
    setOrDelete(params, "pageSize", queryState.pageSize === 20 ? "" : String(queryState.pageSize));
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
  }, [queryState]);

  function update(updateValue: QueryUpdate, resetPage = true) { onQueryStateChange({ ...queryState, ...updateValue, page: resetPage ? 0 : (updateValue.page ?? queryState.page) }); }
  function resetFilters() { update({ query: "", section: "all", status: "all", verification: "all", dateFilter: "all" }); }
  function toggleRecord(record: AdminRecord) { setSelected((current) => { const next = new Map(current); if (next.has(record.burialId)) next.delete(record.burialId); else next.set(record.burialId, record); return next; }); }
  function toggleVisible() { setSelected((current) => { const next = new Map(current); if (allVisibleSelected) records.forEach((record) => next.delete(record.burialId)); else records.forEach((record) => next.set(record.burialId, record)); return next; }); }
  async function batch(event: ChangeEvent<HTMLSelectElement>) {
    const status = event.target.value as RecordStatus | "";
    event.target.value = "";
    if (!status || !selected.size) return;
    const ok = await onBatchStatus([...selected.values()], status);
    if (ok !== false) setSelected(new Map());
  }
  function sortBy(sort: BurialRecordSort) { update({ sort, direction: queryState.sort === sort ? (queryState.direction === "asc" ? "desc" : "asc") : sort === "interment-date" ? "desc" : "asc" }); }

  return <section aria-label="Deceased & Interments" className="admin-burial-list">
    <PageHeading actions={<Button icon="plus" onClick={onAdd}>Add Deceased / Interment Record</Button>} breadcrumbs={[{ label: "Dashboard", href: "/admin" }, { label: "Deceased & Interments" }]} description="Search, review, and maintain the protected cemetery interment registry." title="Deceased & Interments" />
    <Metrics counts={counts} loading={loading && !totalAll && !counts} total={totalAll || (counts ? counts.active + counts.pending + counts.archived : 0)} />
    <Toolbar filterCount={filterCount} queryState={queryState} records={records} sections={sections} onReset={resetFilters} onUpdate={update} />
    {filterCount ? <ActiveFilters queryState={queryState} onReset={resetFilters} onUpdate={update} /> : null}
    {selected.size ? <SelectionToolbar busy={busy} count={selected.size} onBatch={batch} onClear={() => setSelected(new Map())} /> : null}
    <div aria-busy={loading} className="admin-burial-data-panel">
      {error ? <EmptyState action={<Button onClick={onRetry} variant="secondary">Try again</Button>} className="admin-burial-empty" description={error} icon="alert" title="Burial records unavailable" />
        : loading ? <Loading filtered={Boolean(records.length || filterCount)} />
        : records.length ? <>
          <RecordTable allVisibleSelected={allVisibleSelected} busy={busy} canAdmin={canAdmin} queryState={queryState} records={records} selectAllRef={selectAllRef} selectedIds={new Set(selected.keys())} onChangeSort={sortBy} onChangeStatus={onChangeStatus} onDelete={onDelete} onEdit={onEdit} onToggleRecord={toggleRecord} onToggleVisible={toggleVisible} />
          <MobileCards busy={busy} canAdmin={canAdmin} queryState={queryState} records={records} selectedIds={new Set(selected.keys())} onChangeStatus={onChangeStatus} onDelete={onDelete} onEdit={onEdit} onToggleRecord={toggleRecord} />
          <Pagination pageCount={pageCount} queryState={queryState} total={total} visibleCount={records.length} onUpdate={update} />
        </> : <EmptyState action={filterCount ? <Button onClick={resetFilters} variant="secondary">Clear filters</Button> : <Button icon="plus" onClick={onAdd}>Add Deceased / Interment Record</Button>} className="admin-burial-empty" description={filterCount ? "No records match the current search and filters. Adjust or clear them to see more records." : "No burial records have been added yet. Create the first protected registry entry."} icon={filterCount ? "filter" : "records"} title={filterCount ? "No matching burial records" : "No burial records yet"} />}
    </div>
  </section>;
}

function Metrics({ counts, loading, total }: { counts: DashboardCounts | null; loading: boolean; total: number }) {
  if (loading) return <div aria-label="Loading burial record totals" className="admin-burial-metrics" role="status">{Array.from({ length: 4 }, (_, index) => <Skeleton className="admin-burial-metric admin-burial-metric--loading" key={index} />)}</div>;
  return <div className="admin-burial-metrics"><Metric icon="records" label="Total records" value={total} /><Metric icon="check" label="Active" tone="success" value={counts?.active} /><Metric icon="clock" label="Pending review" tone="warning" value={counts?.pending} /><Metric icon="audit" label="Archived" value={counts?.archived} /></div>;
}
function Metric({ icon, label, value, tone = "neutral" }: { icon: IconName; label: string; value: number | null | undefined; tone?: "neutral" | "success" | "warning" }) { return <div className={`admin-burial-metric admin-burial-metric--${tone}`}><div><span>{label}</span><strong>{value == null ? "—" : value.toLocaleString()}</strong></div><span className="admin-burial-metric__icon"><Icon name={icon} size={20} /></span></div>; }

function Toolbar({ queryState, sections, records, filterCount, onUpdate, onReset }: { queryState: BurialRecordQuery; sections: string[]; records: AdminRecord[]; filterCount: number; onUpdate: (update: QueryUpdate, resetPage?: boolean) => void; onReset: () => void }) {
  return <div className="admin-burial-toolbar"><label className="admin-burial-search"><span className="sr-only">Search burial records</span><Icon name="search" size={18} /><input autoComplete="off" maxLength={160} onChange={(event) => onUpdate({ query: event.target.value })} placeholder="Search name, record ID, reference, or plot…" type="search" value={queryState.query} />{queryState.query ? <button aria-label="Clear burial record search" onClick={() => onUpdate({ query: "" })} type="button"><Icon name="x" size={16} /></button> : null}</label><div className="admin-burial-toolbar__actions"><FilterMenu filterCount={filterCount} queryState={queryState} sections={sections} onReset={onReset} onUpdate={onUpdate} /><label className="admin-burial-sort-select"><span className="sr-only">Sort burial records</span><Icon name="sort" size={17} /><select aria-label="Sort burial records" onChange={(event) => { const [sort, direction] = event.target.value.split(":") as [BurialRecordSort, BurialRecordQuery["direction"]]; onUpdate({ sort, direction }); }} value={`${queryState.sort}:${queryState.direction}`}><option value="updated:desc">Recently updated</option><option value="updated:asc">Oldest updated</option><option value="name:asc">Name A–Z</option><option value="name:desc">Name Z–A</option><option value="plot:asc">Plot ascending</option><option value="plot:desc">Plot descending</option><option value="interment-date:desc">Newest burial date</option><option value="interment-date:asc">Oldest burial date</option><option value="status:asc">Status ascending</option><option value="status:desc">Status descending</option></select><Icon name="chevronDown" size={15} /></label><Button disabled={!records.length} icon="download" onClick={() => downloadCsv(records)} size="sm" variant="secondary">Export page</Button></div><p aria-live="polite" className="admin-burial-toolbar__scope">Search and filters apply to the complete protected registry. Results update automatically.</p></div>;
}

function FilterMenu({ queryState, sections, filterCount, onUpdate, onReset }: { queryState: BurialRecordQuery; sections: string[]; filterCount: number; onUpdate: (update: QueryUpdate) => void; onReset: () => void }) {
  const id = useId(); const [open, setOpen] = useState(false); const trigger = useRef<HTMLButtonElement>(null); const panel = useRef<HTMLDivElement>(null); useDismiss(open, setOpen, trigger, panel);
  return <div className="admin-burial-filter-menu"><Button aria-controls={id} aria-expanded={open} aria-haspopup="dialog" className={filterCount ? "is-active" : undefined} icon="filter" onClick={() => setOpen((value) => !value)} ref={trigger} size="sm" variant="secondary">Filters{filterCount ? ` (${filterCount})` : ""}</Button>{open ? <div aria-label="Burial record filters" className="admin-burial-filter-popover" id={id} ref={panel} role="dialog"><div className="admin-burial-filter-popover__header"><div><strong>Filter records</strong><span>Combine filters to narrow the registry.</span></div><button aria-label="Close filters" onClick={() => { setOpen(false); trigger.current?.focus(); }} type="button"><Icon name="x" size={16} /></button></div><div className="admin-burial-filter-grid"><FilterSelect label="Cemetery section" value={queryState.section} onChange={(section) => onUpdate({ section })} options={[["all", "All sections"], ...sections.map((section) => [section, section] as [string, string])]} /><FilterSelect label="Record status" value={queryState.status} onChange={(status) => onUpdate({ status: status as BurialRecordQuery["status"] })} options={[["all", "All statuses"], ["active", "Active"], ["pending", "Pending"], ["archived", "Archived"]]} /><FilterSelect label="Coordinate readiness" value={queryState.verification} onChange={(verification) => onUpdate({ verification: verification as BurialRecordQuery["verification"] })} options={[["all", "All states"], ["verified", "Verified"], ["pending", "Needs review"], ["rejected", "Rejected"]]} /><FilterSelect label="Burial date" value={queryState.dateFilter} onChange={(dateFilter) => onUpdate({ dateFilter: dateFilter as BurialRecordQuery["dateFilter"] })} options={[["all", "All time"], ["this-year", "This year"], ["last-five-years", "Last five years"], ["undated", "Date not recorded"]]} /></div><div className="admin-burial-filter-popover__footer"><Button disabled={!filterCount} onClick={onReset} size="sm" variant="quiet">Clear all</Button><Button onClick={() => { setOpen(false); trigger.current?.focus(); }} size="sm">Done</Button></div></div> : null}</div>;
}
function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) { return <label className="admin-burial-filter-select"><span>{label}</span><select onChange={(event) => onChange(event.target.value)} value={value}>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select><Icon name="chevronDown" size={15} /></label>; }
function ActiveFilters({ queryState, onUpdate, onReset }: { queryState: BurialRecordQuery; onUpdate: (update: QueryUpdate) => void; onReset: () => void }) { const chips = [queryState.query ? { label: `Search: ${queryState.query}`, clear: () => onUpdate({ query: "" }) } : null, queryState.section !== "all" ? { label: `Section: ${queryState.section}`, clear: () => onUpdate({ section: "all" }) } : null, queryState.status !== "all" ? { label: `Status: ${title(queryState.status)}`, clear: () => onUpdate({ status: "all" }) } : null, queryState.verification !== "all" ? { label: `Coordinates: ${queryState.verification === "pending" ? "Needs review" : title(queryState.verification)}`, clear: () => onUpdate({ verification: "all" }) } : null, queryState.dateFilter !== "all" ? { label: `Date: ${title(queryState.dateFilter.replaceAll("-", " "))}`, clear: () => onUpdate({ dateFilter: "all" }) } : null].filter((chip): chip is { label: string; clear: () => void } => Boolean(chip)); return <div aria-label="Active burial record filters" className="admin-burial-filter-chips"><span>{chips.length} active</span>{chips.map((chip) => <button aria-label={`Remove ${chip.label} filter`} key={chip.label} onClick={chip.clear} type="button">{chip.label}<Icon name="x" size={14} /></button>)}<button className="admin-burial-filter-chips__clear" onClick={onReset} type="button">Clear all</button></div>; }
function SelectionToolbar({ count, busy, onBatch, onClear }: { count: number; busy: boolean; onBatch: (event: ChangeEvent<HTMLSelectElement>) => void; onClear: () => void }) { return <div aria-label="Selected burial record actions" className="admin-burial-selection-toolbar"><div><Icon name="check" size={17} /><strong>{count.toLocaleString()} selected</strong></div><label><span>Change status</span><select aria-label="Change status for selected burial records" defaultValue="" disabled={busy} onChange={onBatch}><option disabled value="">Choose action</option><option value="active">Activate selected</option><option value="pending">Mark pending</option><option value="archived">Archive selected</option></select></label><Button disabled={busy} onClick={onClear} size="sm" variant="quiet">Clear selection</Button></div>; }

type PresentProps = { records: AdminRecord[]; selectedIds: Set<number>; queryState: BurialRecordQuery; busy: boolean; canAdmin: boolean; onToggleRecord: (record: AdminRecord) => void; onEdit: (record: AdminRecord) => void; onDelete: (record: AdminRecord) => void; onChangeStatus: (record: AdminRecord, status: RecordStatus) => void };
function RecordTable({ records, selectedIds, busy, canAdmin, allVisibleSelected, selectAllRef, queryState, onToggleVisible, onToggleRecord, onEdit, onDelete, onChangeStatus, onChangeSort }: PresentProps & { allVisibleSelected: boolean; selectAllRef: React.RefObject<HTMLInputElement | null>; onToggleVisible: () => void; onChangeSort: (sort: BurialRecordSort) => void }) { return <div className="admin-burial-table-wrap"><table className="admin-burial-table"><caption className="sr-only">Protected GraveNav burial records matching the current search and filters</caption><thead><tr><th className="admin-burial-table__select" scope="col"><Checkbox checked={allVisibleSelected} label="Select all records on this page" onChange={onToggleVisible} inputRef={selectAllRef} /></th><SortHeader label="Deceased name and ID" sort="name" state={queryState} onSort={onChangeSort} /><th scope="col">Lifespan</th><SortHeader label="Burial date" sort="interment-date" state={queryState} onSort={onChangeSort} /><SortHeader label="Plot location" sort="plot" state={queryState} onSort={onChangeSort} /><SortHeader label="Record status" sort="status" state={queryState} onSort={onChangeSort} /><th scope="col">Visitor site</th><th className="admin-burial-table__actions-heading" scope="col">Actions</th></tr></thead><tbody>{records.map((record) => { const checked = selectedIds.has(record.burialId); return <tr data-selected={checked || undefined} key={record.burialId}><td className="admin-burial-table__select"><Checkbox checked={checked} label={`Select ${record.name}`} onChange={() => onToggleRecord(record)} /></td><td><Identity record={record} /></td><td><Lifespan record={record} /></td><td>{formatDate(record.intermentDate)}</td><td><Plot record={record} /></td><td><StatusBadge status={record.recordStatus} /></td><td><VisitorBadge record={record} /></td><td><Actions busy={busy} canAdmin={canAdmin} queryState={queryState} record={record} onChangeStatus={onChangeStatus} onDelete={onDelete} onEdit={onEdit} /></td></tr>; })}</tbody></table></div>; }
function SortHeader({ label, sort, state, onSort }: { label: string; sort: BurialRecordSort; state: BurialRecordQuery; onSort: (sort: BurialRecordSort) => void }) { const active = state.sort === sort; return <th aria-sort={active ? state.direction === "asc" ? "ascending" : "descending" : "none"} scope="col"><button className="admin-burial-sort-button" onClick={() => onSort(sort)} type="button">{label}<Icon className={active ? `is-${state.direction}` : undefined} name="chevronDown" size={14} /></button></th>; }
function MobileCards({ records, selectedIds, queryState, busy, canAdmin, onToggleRecord, onEdit, onDelete, onChangeStatus }: PresentProps) { return <div className="admin-burial-mobile-list">{records.map((record) => { const checked = selectedIds.has(record.burialId); return <article aria-label={`${record.name}, ${record.syntheticPlotReference || record.plot}`} className="admin-burial-mobile-card" data-selected={checked || undefined} key={record.burialId}><div className="admin-burial-mobile-card__top"><Checkbox checked={checked} label={`Select ${record.name}`} onChange={() => onToggleRecord(record)} /><Identity record={record} /><StatusBadge status={record.recordStatus} /></div><dl className="admin-burial-mobile-card__details"><div><dt>Plot</dt><dd><Plot record={record} /></dd></div><div><dt>Burial date</dt><dd>{formatDate(record.intermentDate)}</dd></div><div><dt>Lifespan</dt><dd><Lifespan record={record} /></dd></div><div><dt>Visitor site</dt><dd><VisitorBadge record={record} /></dd></div></dl><Actions busy={busy} canAdmin={canAdmin} queryState={queryState} record={record} onChangeStatus={onChangeStatus} onDelete={onDelete} onEdit={onEdit} /></article>; })}</div>; }
function Checkbox({ checked, label, onChange, inputRef }: { checked: boolean; label: string; onChange: () => void; inputRef?: React.RefObject<HTMLInputElement | null> }) { return <label className="admin-record-checkbox"><input aria-label={label} checked={checked} onChange={onChange} ref={inputRef} type="checkbox" /><span /></label>; }
function Identity({ record }: { record: AdminRecord }) { return <div className="admin-record-identity"><span aria-hidden="true" className="admin-record-avatar">{initials(record.name)}</span><span><strong>{record.name}</strong><small>{record.referenceNo || `Record #${record.burialId}`}</small></span></div>; }
function Lifespan({ record }: { record: AdminRecord }) { return !record.birthDate && !record.deathDate ? <span className="admin-record-muted">Not recorded</span> : <span className="admin-record-lifespan"><Icon name="clock" size={14} />{formatDate(record.birthDate)} – {formatDate(record.deathDate)}</span>; }
function Plot({ record }: { record: AdminRecord }) { const label = record.syntheticPlotReference || (isSyntheticPlot(record.plot) ? `Plot #${record.lotId}` : `${record.section} · ${record.plot}`); return <span className="admin-record-plot"><Icon name="location" size={14} /><span>{label}</span></span>; }
function StatusBadge({ status }: { status: RecordStatus }) { return <span className={`admin-record-status admin-record-status--${status}`}><span aria-hidden="true" />{title(status)}</span>; }
function VisitorBadge({ record }: { record: AdminRecord }) { const isPublic = Boolean(record.publicDisplay && record.recordStatus !== "archived" && !record.lotRemoved); return <Badge variant={isPublic ? "success" : "neutral"}>{isPublic ? "Published" : "Staff only"}</Badge>; }

function Actions({ record, queryState, busy, canAdmin, onEdit, onDelete, onChangeStatus }: { record: AdminRecord; queryState: BurialRecordQuery; busy: boolean; canAdmin: boolean; onEdit: (record: AdminRecord) => void; onDelete: (record: AdminRecord) => void; onChangeStatus: (record: AdminRecord, status: RecordStatus) => void }) {
  const id = useId(); const [open, setOpen] = useState(false); const [position, setPosition] = useState({ top: 0, left: 0 }); const trigger = useRef<HTMLButtonElement>(null); const panel = useRef<HTMLDivElement>(null); useDismiss(open, setOpen, trigger, panel);
  useEffect(() => { if (!open) return; const close = () => setOpen(false); window.addEventListener("resize", close); window.addEventListener("scroll", close, true); return () => { window.removeEventListener("resize", close); window.removeEventListener("scroll", close, true); }; }, [open]);
  useEffect(() => { if (!open) return; const frame = window.requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()); return () => window.cancelAnimationFrame(frame); }, [open]);
  function toggle() { setOpen((current) => { if (!current && trigger.current) { const rect = trigger.current.getBoundingClientRect(); setPosition({ top: rect.bottom + 6, left: Math.max(12, Math.min(rect.right - 190, window.innerWidth - 202)) }); } return !current; }); }
  function choose(action: () => void) { trigger.current?.focus(); setOpen(false); action(); }
  function navigateMenu(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (!items.length || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLElement);
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (current + 1) % items.length : (current <= 0 ? items.length : current) - 1;
    items[nextIndex]?.focus();
  }
  const menu = open ? <div className="admin-record-menu__popover admin-record-menu__popover--portal" id={id} onKeyDown={navigateMenu} ref={panel} role="menu" style={position}>
    <Link href={recordHref(queryState, record.burialId)} onClick={() => setOpen(false)} role="menuitem"><Icon name="eye" size={16} />View record</Link>
    {record.recordStatus !== "active" ? <button onClick={() => choose(() => onChangeStatus(record, "active"))} role="menuitem" type="button"><Icon name="check" size={16} />Activate record</button> : null}
    {record.recordStatus !== "pending" ? <button onClick={() => choose(() => onChangeStatus(record, "pending"))} role="menuitem" type="button"><Icon name="clock" size={16} />Mark pending</button> : null}
    {record.recordStatus !== "archived" ? <button onClick={() => choose(() => onChangeStatus(record, "archived"))} role="menuitem" type="button"><Icon name="audit" size={16} />Archive record</button> : null}
    {canAdmin ? <><span className="admin-record-menu__separator" /><button className="admin-record-menu__danger" onClick={() => choose(() => onDelete(record))} role="menuitem" type="button"><Icon name="trash" size={16} />Remove record</button></> : null}
  </div> : null;
  return <div className="admin-record-actions"><Link className="admin-record-actions__view" href={recordHref(queryState, record.burialId)}><Icon name="eye" size={15} /><span>View</span></Link><button className="admin-record-actions__edit" disabled={busy} onClick={() => onEdit(record)} type="button"><Icon name="edit" size={16} /><span>Edit</span></button><div className="admin-record-menu"><button aria-controls={id} aria-expanded={open} aria-haspopup="menu" aria-label={`More actions for ${record.name}`} disabled={busy} onClick={toggle} ref={trigger} type="button"><Icon name="more" size={18} /></button>{menu ? createPortal(menu, document.body) : null}</div></div>;
}

function Pagination({ total, visibleCount, pageCount, queryState, onUpdate }: { total: number; visibleCount: number; pageCount: number; queryState: BurialRecordQuery; onUpdate: (update: QueryUpdate, resetPage?: boolean) => void }) { const first = total ? queryState.page * queryState.pageSize + 1 : 0; const last = total ? first + visibleCount - 1 : 0; return <footer className="admin-burial-pagination"><div aria-live="polite" className="admin-burial-pagination__summary"><span>Showing <strong>{first.toLocaleString()}–{last.toLocaleString()}</strong> of <strong>{total.toLocaleString()}</strong> records</span><label><span>Rows per page</span><select onChange={(event) => onUpdate({ pageSize: Number(event.target.value) })} value={queryState.pageSize}><option value="10">10</option><option value="20">20</option><option value="25">25</option><option value="50">50</option></select></label></div><nav aria-label="Burial record pages" className="admin-burial-pagination__controls"><button disabled={!queryState.page} onClick={() => onUpdate({ page: queryState.page - 1 }, false)} type="button">Previous</button>{pageWindow(queryState.page, pageCount).map((page) => <button aria-current={page === queryState.page ? "page" : undefined} className={page === queryState.page ? "is-current" : undefined} key={page} onClick={() => onUpdate({ page }, false)} type="button"><span className="sr-only">Page </span>{page + 1}</button>)}<button disabled={queryState.page >= pageCount - 1} onClick={() => onUpdate({ page: queryState.page + 1 }, false)} type="button">Next</button></nav></footer>; }
function Loading({ filtered }: { filtered: boolean }) { return <div aria-label={filtered ? "Updating burial record results" : "Loading burial records"} className="admin-burial-loading" role="status"><div className="admin-burial-loading__label"><Icon name="search" size={16} /><span>{filtered ? "Updating results…" : "Loading protected burial records…"}</span></div>{Array.from({ length: 6 }, (_, index) => <Skeleton className="admin-burial-loading__row" key={index} />)}</div>; }

function useDismiss(open: boolean, setOpen: (open: boolean) => void, trigger: React.RefObject<HTMLButtonElement | null>, panel: React.RefObject<HTMLDivElement | null>) { useEffect(() => { if (!open) return; const pointer = (event: PointerEvent) => { if (event.target instanceof Node && !panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false); }; const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); } }; document.addEventListener("pointerdown", pointer); document.addEventListener("keydown", key); return () => { document.removeEventListener("pointerdown", pointer); document.removeEventListener("keydown", key); }; }, [open, panel, setOpen, trigger]); }
function getFilterCount(state: BurialRecordQuery) { return [state.query.trim(), state.section !== "all", state.status !== "all", state.verification !== "all", state.dateFilter !== "all"].filter(Boolean).length; }
function setOrDelete(params: URLSearchParams, key: string, value: string) { if (value) params.set(key, value); else params.delete(key); }
function recordHref(state: BurialRecordQuery, burialId: number) { const params = new URLSearchParams(); setOrDelete(params, "query", state.query); setOrDelete(params, "section", state.section === "all" ? "" : state.section); setOrDelete(params, "status", state.status === "all" ? "" : state.status); setOrDelete(params, "verification", state.verification === "all" ? "" : state.verification); setOrDelete(params, "date", state.dateFilter === "all" ? "" : state.dateFilter); setOrDelete(params, "sort", state.sort === "updated" ? "" : state.sort); setOrDelete(params, "direction", state.direction === "desc" ? "" : state.direction); setOrDelete(params, "page", state.page ? String(state.page + 1) : ""); setOrDelete(params, "pageSize", state.pageSize === 20 ? "" : String(state.pageSize)); return "/admin/burial-records/" + burialId + "?" + new URLSearchParams({ returnTo: "/admin/burial-records" + (params.size ? "?" + params : "") }); }
function title(value: string) { return value.replace(/(^|\s)\S/g, (letter) => letter.toLocaleUpperCase()); }
function formatDate(value: string | null) { if (!value) return "Not recorded"; const date = new Date(`${value.slice(0, 10)}T00:00:00`); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "2-digit" }).format(date); }
function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase() || "GN"; }
function pageWindow(page: number, count: number) { const length = Math.min(count, 5); const start = Math.max(0, Math.min(page - 2, count - length)); return Array.from({ length }, (_, index) => start + index); }
function downloadCsv(records: AdminRecord[]) {
  const headers = ["burial_id", "display_name", "sex", "birth_date", "death_date", "interment_date", "section", "plot_reference", "record_status", "visitor_visibility", "interment_status", "remains_type", "inscription"];
  const rows = records.map((record) => [
    record.burialId,
    record.name,
    record.sex || "",
    record.birthDate || "",
    record.deathDate || "",
    record.intermentDate || "",
    record.section,
    record.syntheticPlotReference || (isSyntheticPlot(record.plot) ? `Plot #${record.lotId}` : record.plot),
    record.recordStatus,
    record.publicDisplay && record.recordStatus !== "archived" ? "Published" : "Staff only",
    record.intermentStatus,
    record.remainsType,
    record.inscription || "",
  ]);
  const csv = "\uFEFF" + [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "gravenav-burial-records.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
function csvCell(value: unknown) { const text = String(value ?? ""); const safe = /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text; return `"${safe.replaceAll('"', '""')}"`; }
