"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { recordInputFromRecord } from "@/lib/burial-records";
import { useStaff } from "./staff-context";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Input } from "@/components/ui/input";
import { BurialRecordList } from "@/components/admin/burial-record-list";
import { PlotManagementList } from "@/components/admin/plot-management-list";
import {
  createLot,
  deleteBurialRecord,
  deleteLot,
  getDashboardCounts,
  getOwnerRecord,
  getOwnerRecords,
  getOwnerRecordsPage,
  getPlotAreas,
  getPlotManagementPage,
  getStaffBurialRecords,
  updateBurialRecord,
  updateLot,
  type BurialRecordQuery,
  type DashboardCounts,
  type LotInput,
  type PlotManagementQuery,
} from "@/lib/supabase/admin-data";
import type { AdminRecord, LotOwner, PlotAreaOption, PlotManagementItem, PlotManagementSummary } from "@/lib/supabase/types";
import mapEditorStyles from "@/components/visitor/map-burial-preview.module.css";

type BurialRecordsCrudProps = {
  initialQueryState: BurialRecordQuery;
};

export function BurialRecordsCrud({
  initialQueryState,
}: BurialRecordsCrudProps) {
  const canAdmin = ["ADMIN", "SUPER_ADMIN"].includes(useStaff()?.role ?? "");
  const router = useRouter();
  const [records, setRecords] = useState<AdminRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [totalAll, setTotalAll] = useState(0);
  const [sections, setSections] = useState<string[]>([]);
  const [counts, setCounts] = useState<DashboardCounts | null>(null);
  const [queryState, setQueryState] = useState(initialQueryState);
  const [deleteTarget, setDeleteTarget] = useState<AdminRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const requestSeq = useRef(0);
  const lastQueryText = useRef(initialQueryState.query);
  const lastInitialSearch = useRef(initialQueryState.query);

  useEffect(() => {
    if (initialQueryState.query !== lastInitialSearch.current) {
      lastInitialSearch.current = initialQueryState.query;
      setQueryState((current) => ({ ...current, query: initialQueryState.query, page: 0 }));
    }
  }, [initialQueryState.query]);

  const loadRecords = useCallback(async (nextQuery: BurialRecordQuery) => {
    const req = ++requestSeq.current;
    setLoading(true);
    try {
      const recordPage = await getStaffBurialRecords(nextQuery);
      if (req !== requestSeq.current) return;
      if (!recordPage.items.length && recordPage.total > 0 && nextQuery.page > 0) {
        setQueryState((current) => ({ ...current, page: current.page - 1 }));
        return;
      }
      setRecords(recordPage.items);
      setTotal(recordPage.total);
      setTotalAll(recordPage.totalAll);
      setSections(recordPage.sections);
      setLoadError("");
    } catch (reason) {
      if (req === requestSeq.current) setLoadError(errorMessage(reason));
    } finally {
      if (req === requestSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const queryChanged = queryState.query !== lastQueryText.current;
    lastQueryText.current = queryState.query;
    const delay = queryChanged ? 260 : 0;
    const timer = window.setTimeout(() => void loadRecords(queryState), delay);
    return () => window.clearTimeout(timer);
  }, [loadRecords, queryState]);

  useEffect(() => {
    void getDashboardCounts().then(setCounts).catch((reason) => setError(errorMessage(reason)));
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([
      loadRecords(queryState),
      getDashboardCounts().then(setCounts),
    ]);
  }, [loadRecords, queryState]);

  async function changeStatus(record: AdminRecord, status: AdminRecord["recordStatus"]) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await updateBurialRecord(
        record.burialId,
        recordInputFromRecord(record, { recordStatus: status }),
      );
      await refresh();
      setMessage("Burial record status updated.");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function changeStatuses(
    selectedRecords: AdminRecord[],
    status: AdminRecord["recordStatus"],
  ): Promise<boolean> {
    if (busy || !selectedRecords.length) return false;
    setBusy(true);
    setError("");
    setMessage("");
    let updatedCount = 0;
    try {
      for (const record of selectedRecords) {
        await updateBurialRecord(
          record.burialId,
          recordInputFromRecord(record, { recordStatus: status }),
        );
        updatedCount += 1;
      }
      await refresh();
      setMessage(
        `${selectedRecords.length} burial ${selectedRecords.length === 1 ? "record" : "records"} updated.`,
      );
      return true;
    } catch (reason) {
      if (updatedCount > 0) await refresh().catch(() => {});
      setError(
        updatedCount > 0
          ? `${updatedCount} of ${selectedRecords.length} records updated before an error occurred: ${errorMessage(reason)}`
          : errorMessage(reason),
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function removeRecord() {
    if (!deleteTarget || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await deleteBurialRecord(deleteTarget.burialId, deleteTarget.revision);
      setDeleteTarget(null);
      setMessage("Burial record removed. It can be restored in Recovery.");
      await refresh();
    } catch (reason) {
      setDeleteTarget(null);
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-page-frame admin-burial-page">
      {error && error !== loadError ? <DataError message={error} /> : null}
      {message ? (
        <Alert icon="check" title="Record update" variant="success">{message}</Alert>
      ) : null}
      <BurialRecordList
        busy={busy}
        canAdmin={canAdmin}
        counts={counts}
        error={loadError}
        loading={loading}
        queryState={queryState}
        records={records}
        sections={sections}
        total={total}
        totalAll={totalAll}
        onAdd={() => router.push("/admin/burial-records/new?" + new URLSearchParams({
          returnTo: window.location.pathname + window.location.search,
        }))}
        onBatchStatus={(selectedRecords, status) => changeStatuses(selectedRecords, status)}
        onChangeStatus={(record, status) => {
          void changeStatus(record, status);
        }}
        onDelete={setDeleteTarget}
        onEdit={(record) => router.push("/admin/burial-records/" + record.burialId +
          "/edit?" + new URLSearchParams({ returnTo: window.location.pathname + window.location.search }))}
        onQueryStateChange={setQueryState}
        onRetry={() => void loadRecords(queryState)}
      />
      <ConfirmationDialog
        confirmLabel={busy ? "Deleting…" : "Delete record"}
        description={(
          <p>
            This hides the burial record from visitors and operational lists.
            Administrators can restore it in Recovery. Its plot remains reserved.
          </p>
        )}
        open={Boolean(deleteTarget)}
        title="Delete burial record?"
        variant="danger"
        onClose={() => {
          if (!busy) setDeleteTarget(null);
        }}
        onConfirm={() => void removeRecord()}
      />
    </div>
  );
}


export function PlotManagementCrud({ initialQueryState, mapAreaId, mapAreaIds }: {
  initialQueryState: PlotManagementQuery;
  mapAreaId?: string;
  mapAreaIds?: string[];
}) {
  const canAdmin = ["ADMIN", "SUPER_ADMIN"].includes(useStaff()?.role ?? "");
  const [lots, setLots] = useState<PlotManagementItem[]>([]);
  const [owners, setOwners] = useState<LotOwner[]>([]);
  const [areas, setAreas] = useState<PlotAreaOption[]>([]);
  const [summary, setSummary] = useState<PlotManagementSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [queryState, setQueryState] = useState(initialQueryState);
  const [editing, setEditing] = useState<PlotManagementItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PlotManagementItem | null>(null);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const requestSeq = useRef(0);
  const lastQueryText = useRef(initialQueryState.query);
  const formRef = useRef<HTMLDivElement>(null);

  const loadPlots = useCallback(async (nextQuery: PlotManagementQuery) => {
    const req = ++requestSeq.current;
    setLoading(true);
    try {
      const page = await getPlotManagementPage(nextQuery);
      if (req !== requestSeq.current) return;
      if (!page.items.length && page.total > 0 && nextQuery.page > 0) {
        setQueryState((current) => ({ ...current, page: current.page - 1 }));
        return;
      }
      setLots(page.items);
      setTotal(page.total);
      setSummary(page.summary);
      setAreas(page.areas);
      setLoadError("");
    } catch (reason) {
      if (req === requestSeq.current) setLoadError(errorMessage(reason));
    } finally {
      if (req === requestSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const queryChanged = queryState.query !== lastQueryText.current;
    lastQueryText.current = queryState.query;
    const delay = queryChanged ? 260 : 0;
    const timer = window.setTimeout(() => void loadPlots(queryState), delay);
    return () => window.clearTimeout(timer);
  }, [loadPlots, queryState]);

  useEffect(() => {
    void Promise.all([getOwnerRecords({ page: 0, pageSize: 100 }), getPlotAreas()])
      .then(([nextOwners, nextAreas]) => {
        setOwners(nextOwners);
        setAreas((current) => current.length ? current : nextAreas);
      })
      .catch((reason) => setError(errorMessage(reason)));
  }, []);

  useEffect(() => {
    if (formOpen) {
      requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }, [formOpen, editing]);

  const refresh = useCallback(async () => {
    await Promise.all([
      loadPlots(queryState),
      getOwnerRecords({ page: 0, pageSize: 100 }).then(setOwners),
      getPlotAreas().then((nextAreas) => setAreas((current) => current.length ? current : nextAreas)),
    ]);
  }, [loadPlots, queryState]);

  const searchOwners = useCallback(async (search: string) => (await getOwnerRecordsPage({ search, pageSize: 20 })).items, []);
  async function removeLot() {
    if (!deleteTarget || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await deleteLot(deleteTarget.lotId, deleteTarget.revision);
      setDeleteTarget(null);
      setMessage("Plot removed. It can be restored in Recovery.");
      await refresh();
    } catch (reason) {
      setDeleteTarget(null);
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  return <div className="admin-page-frame admin-plot-page">
    {error && error !== loadError ? <DataError message={error} /> : null}{message ? <Alert icon="check" title="Plot update" variant="success">{message}</Alert> : null}
    <div ref={formRef}>
      {formOpen ? <LotForm key={editing?.lotId ?? "new"} lot={editing} areas={areas} owners={owners} onSearchOwners={searchOwners} onCancel={() => { setFormOpen(false); setEditing(null); }} onSaved={async () => { setFormOpen(false); setEditing(null); setMessage(editing ? "Plot updated." : "Plot created."); await refresh(); }} /> : null}
    </div>
    <PlotManagementList areas={areas} busy={busy} canAdmin={canAdmin} error={loadError} loading={loading} mapAreaId={mapAreaId} mapAreaIds={mapAreaIds} plots={lots} queryState={queryState} summary={summary} total={total} onAdd={() => { setError(""); setMessage(""); setEditing(null); setFormOpen(true); }} onDelete={setDeleteTarget} onEdit={(plot) => { setError(""); setMessage(""); setEditing(plot); setFormOpen(true); }} onQueryStateChange={setQueryState} onRetry={() => void loadPlots(queryState)} />
    <ConfirmationDialog open={Boolean(deleteTarget)} title="Delete plot?" description={<p>Only plots without a burial record can be removed. Administrators can restore removed plots in Recovery.</p>} confirmLabel={busy ? "Deleting…" : "Delete plot"} variant="danger" onConfirm={() => void removeLot()} onClose={() => { if (!busy) setDeleteTarget(null); }} />
  </div>;
}

export function MapPlotEditor({ lotId, lotCode, onClose, onSaved }: { lotId: number; lotCode: string; onClose: () => void; onSaved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<{ lot: PlotManagementItem; areas: PlotAreaOption[]; owners: LotOwner[] } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const searchOwners = useCallback(async (search: string) => (await getOwnerRecordsPage({ search, pageSize: 20 })).items, []);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    let active = true;
    Promise.all([
      getPlotManagementPage({ query: lotCode, area: "all", state: "all", verification: "all", sort: "updated", direction: "desc", page: 0, pageSize: 50 }),
      getPlotAreas(), getOwnerRecords({ page: 0, pageSize: 100 }),
    ]).then(([page, areas, owners]) => {
      const lot = page.items.find(item => item.lotId === lotId && item.lotCode === lotCode);
      if (!active) return;
      if (!lot) { setError("The linked plot could not be found. Reopen it and try again."); return; }
      setData({ lot, areas, owners });
    }).catch(reason => { if (active) setError(errorMessage(reason)); });
    return () => { active = false; };
  }, [lotId, lotCode]);
  return createPortal(<dialog ref={dialog} className={mapEditorStyles.dialog} aria-label="Edit plot and owner" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className={mapEditorStyles.header}><h2>Edit plot and owner</h2><button type="button" disabled={busy} onClick={onClose} aria-label="Close plot form">×</button></header>
    <div className={mapEditorStyles.form}>{error ? <DataError message={error} /> : data
      ? <LotForm lot={data.lot} areas={data.areas} owners={data.owners} onSearchOwners={searchOwners} onCancel={() => { if (!busy) onClose(); }} onBusyChange={setBusy} onSaved={async () => onSaved()} />
      : <p role="status">Loading plot details…</p>}</div>
  </dialog>, document.body);
}

function LotForm({ lot, areas, owners, onSearchOwners, onCancel, onSaved, onBusyChange }: { lot: PlotManagementItem | null; areas: PlotAreaOption[]; owners: LotOwner[]; onSearchOwners: (search: string) => Promise<LotOwner[]>; onCancel: () => void; onSaved: () => Promise<void>; onBusyChange?: (busy: boolean) => void }) {
  const canApprove = ["ADMIN", "SUPER_ADMIN"].includes(useStaff()?.role ?? "");
  const hasBurialRecords = Boolean(lot && (lot.assignedBurialId !== null || (lot.interments?.length ?? 0) > 0));
  const [form, setForm] = useState<LotInput>(() => lot ? lotInputFromLot(lot) : { areaId: 0, lotOwnerId: null, lotCode: "", legacyLocationCode: "", legacyPaNumber: "", status: "UNKNOWN", lengthM: null, widthM: null });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  function setField<K extends keyof LotInput>(key: K, value: LotInput[K]) { setForm((current) => ({ ...current, [key]: value })); }
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (saving) return; setError(""); if (!form.areaId || !form.lotCode.trim()) { setError("Select a garden / area and enter a plot label or code."); return; } if ((form.lengthM !== null && form.lengthM <= 0) || (form.widthM !== null && form.widthM <= 0)) { setError("Plot dimensions must be greater than zero."); return; } const hasLongitude = form.longitude !== null && form.longitude !== undefined && String(form.longitude) !== ""; const hasLatitude = form.latitude !== null && form.latitude !== undefined && String(form.latitude) !== ""; if (hasLongitude !== hasLatitude) { setError("Enter both longitude and latitude, or leave both coordinates blank."); return; } if (hasLongitude && (!Number.isFinite(form.longitude) || !Number.isFinite(form.latitude))) { setError("Enter valid numeric coordinates."); return; } const coordinatesChanged = Boolean(lot && (form.longitude !== (lot.location?.longitude ?? null) || form.latitude !== (lot.location?.latitude ?? null))); setSaving(true); onBusyChange?.(true); try { const input = { ...form, graveType: canApprove ? form.graveType : undefined, lotCode: form.lotCode.trim(), legacyLocationCode: form.legacyLocationCode?.trim() || "", coordinateStatus: coordinatesChanged ? "pending" as const : form.coordinateStatus, coordinateVerified: coordinatesChanged ? false : form.coordinateVerified }; await (lot ? updateLot(lot.lotId, input) : createLot(input)); await onSaved(); } catch (reason) { setError(errorMessage(reason)); } finally { setSaving(false); onBusyChange?.(false); } }
  return <Card className="admin-form-card"><CardHeader><CardTitle>{lot ? "Edit plot" : "Add plot"}</CardTitle><Badge variant="info">Coordinate-safe operation</Badge></CardHeader><CardContent><form className="admin-form" onSubmit={(event) => void submit(event)}><div className="filter-grid"><SelectField id="plot-area" label="Garden / area" value={String(form.areaId || "")} onChange={(value) => setField("areaId", Number(value))} options={[["", "Select a garden / area"], ...areas.map((area) => [String(area.areaId), `${area.label} (${area.areaCode})`] as [string, string])]} hint="Choose the recorded Phase 2 garden / area for this plot." /><Input id="plot-code" label="Plot label or code" hint="The visible identifier used by administrators." onChange={(event) => setField("lotCode", event.target.value)} required value={form.lotCode} /></div><div className="filter-grid"><Input id="plot-legacy-location" label="Original location reference (optional)" hint="Use the old Lot Location value when this plot has an older record. Leave blank for a new plot." onChange={(event) => setField("legacyLocationCode", event.target.value)} value={form.legacyLocationCode || ""} /><Input id="plot-legacy-pa" label="Old PA number (optional)" hint="Leave blank if no confirmed value exists." onChange={(event) => setField("legacyPaNumber", event.target.value)} value={form.legacyPaNumber || ""} /></div><div className="filter-grid"><OwnerPicker owners={owners} onSearchOwners={onSearchOwners} value={form.lotOwnerId ? String(form.lotOwnerId) : ""} onChange={(value) => setField("lotOwnerId", value ? Number(value) : null)} />{hasBurialRecords ? <div className="input-field"><span className="input-label">Plot status</span><span>{lot?.operationalState === "occupied" ? "Occupied" : "Locked"}</span><span className="input-hint">Status cannot be changed while burial records are assigned to this plot.</span></div> : <SelectField id="plot-status" label="Plot availability" hint="Unknown means availability has not been assessed. Confirm availability before selecting Available." value={form.status} onChange={(value) => setField("status", value as LotInput["status"])} options={[["UNKNOWN", "Unknown — not assessed"], ["AVAILABLE", "Available — confirmed"], ["BOOKED", "Reserved or assigned"], ["HOLD", "Temporarily unavailable"]]} />}</div><div className="filter-grid">{canApprove ? <><SelectField id="plot-grave-type" label="Approved grave type" value={form.graveType ?? ""} onChange={(value) => setForm((current) => ({ ...current, graveType: value === "regular" || value === "mausoleum" ? value : null, gravePolicyReference: value ? current.gravePolicyReference : "", approvedMausoleumCapacity: null }))} options={[["", "Unclassified"], ["regular", "Regular grave (six interments)"], ["mausoleum", "Mausoleum"]]} />{form.graveType ? <Input id="plot-policy-reference" label="Approval reference" maxLength={250} required value={form.gravePolicyReference ?? ""} onChange={(event) => setField("gravePolicyReference", event.target.value)} /> : null}{form.graveType === "mausoleum" ? <p className="input-hint">Mausoleums have no burial limit.</p> : null}</> : null}<Input id="plot-length" label="Plot length (m)" min="0" onChange={(event) => setField("lengthM", optionalNumber(event.target.value))} step="0.01" type="number" value={form.lengthM ?? ""} /><Input id="plot-width" label="Plot width (m)" min="0" onChange={(event) => setField("widthM", optionalNumber(event.target.value))} step="0.01" type="number" value={form.widthM ?? ""} /></div><div className="filter-grid"><Input id="plot-longitude" label="Longitude (optional)" hint="Paste the longitude recorded in Google Earth or on site." onChange={(event) => setField("longitude", optionalNumber(event.target.value))} step="any" type="number" value={form.longitude ?? ""} /><Input id="plot-latitude" label="Latitude (optional)" hint="Paste the latitude recorded in Google Earth or on site." onChange={(event) => setField("latitude", optionalNumber(event.target.value))} step="any" type="number" value={form.latitude ?? ""} /></div><Input id="plot-coordinate-accuracy" label="Coordinate accuracy in meters (optional)" min="0" onChange={(event) => setField("coordinateAccuracyM", optionalNumber(event.target.value))} step="0.01" type="number" value={form.coordinateAccuracyM ?? ""} />{error ? <DataError message={error} /> : null}<div className="admin-form-actions"><Button onClick={onCancel} type="button" variant="secondary">Cancel</Button><Button disabled={saving || !areas.length || !form.areaId} icon="check" type="submit">{saving ? "Saving…" : lot ? "Save changes" : "Create plot"}</Button></div></form></CardContent></Card>;
}

function OwnerPicker({ value, owners, onSearchOwners, onChange }: { value: string; owners: LotOwner[]; onSearchOwners: (search: string) => Promise<LotOwner[]>; onChange: (value: string) => void }) {
  const [query, setQuery] = useState("");
  const [remoteMatches, setRemoteMatches] = useState<{ query: string; items: LotOwner[]; failed: boolean } | null>(null);
  const [pickedOwner, setPickedOwner] = useState<LotOwner | null>(null);
  const normalizedQuery = query.toLowerCase().trim();

  useEffect(() => {
    if (!value) return;
    if (owners.some((owner) => String(owner.lotOwnerId) === value)) return;
    if (pickedOwner && String(pickedOwner.lotOwnerId) === value) return;
    let active = true;
    void getOwnerRecord(value).then((owner) => {
      if (active && owner) setPickedOwner(owner);
    }).catch(() => {});
    return () => { active = false; };
  }, [value, owners, pickedOwner]);

  useEffect(() => {
    if (normalizedQuery.length < 2) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void onSearchOwners(normalizedQuery).then((result) => {
        if (active) setRemoteMatches({ query: normalizedQuery, items: result, failed: false });
      }).catch(() => {
        if (active) setRemoteMatches({ query: normalizedQuery, items: [], failed: true });
      });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [normalizedQuery, onSearchOwners]);

  const currentSearch = remoteMatches?.query === normalizedQuery ? remoteMatches : null;
  const matches = normalizedQuery.length >= 2
    ? currentSearch?.items ?? []
    : owners.filter((owner) => [owner.firstName, owner.middleName, owner.lastName, owner.suffix, owner.aliases].filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery));
  const selected = (value
    ? owners.find((owner) => String(owner.lotOwnerId) === value)
      ?? (pickedOwner && String(pickedOwner.lotOwnerId) === value ? pickedOwner : null)
      ?? currentSearch?.items.find((owner) => String(owner.lotOwnerId) === value)
      ?? null
    : null);
  const hasSearch = normalizedQuery.length >= 2;
  const ownerName = (owner: LotOwner) => [owner.firstName, owner.middleName, owner.lastName, owner.suffix].filter(Boolean).join(" ");
  function selectOwner(owner: LotOwner) {
    setPickedOwner(owner);
    onChange(String(owner.lotOwnerId));
    setQuery(ownerName(owner));
  }
  return <div className="input-field"><span className="input-label">Plot owner (optional)</span><input aria-controls="plot-owner-results" aria-expanded={hasSearch && matches.length > 0} aria-label="Search plot owners" aria-autocomplete="list" className="input-control" id="plot-owner-search" onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && matches[0]) { event.preventDefault(); selectOwner(matches[0]); } }} placeholder="Search owner name or alias" role="combobox" value={query} />{selected ? <span className="input-hint">Selected owner: <strong>{ownerName(selected)}</strong> <button className="text-button" onClick={() => { setPickedOwner(null); onChange(""); setQuery(""); }} type="button">Clear</button></span> : value ? <span className="input-hint">Selected owner #{value} <button className="text-button" onClick={() => { setPickedOwner(null); onChange(""); setQuery(""); }} type="button">Clear</button></span> : null}{hasSearch && matches.length ? <div aria-label="Matching plot owners" className="owner-picker-results" id="plot-owner-results" role="listbox">{matches.slice(0, 20).map((owner) => <button aria-selected={owner.lotOwnerId === selected?.lotOwnerId} className="text-button" key={owner.lotOwnerId} onClick={() => selectOwner(owner)} role="option" type="button">{ownerName(owner)}</button>)}</div> : null}{hasSearch && !currentSearch ? <span className="input-hint" role="status">Searching owners…</span> : null}{hasSearch && currentSearch?.failed ? <span className="input-hint" role="status">Owner search is unavailable. Try searching again.</span> : null}{hasSearch && currentSearch && !currentSearch.failed && !matches.length ? <span className="input-hint">No owners found. <Link className="subtle-link" href="/admin/owner-data/new">Add a Plot Owner.</Link></span> : null}{!owners.length && !hasSearch ? <span className="input-hint">No owners found. <Link className="subtle-link" href="/admin/owner-data/new">Add a Plot Owner.</Link></span> : null}<span className="input-hint">Type at least 2 characters to search. One owner may have multiple plots.</span></div>;
}

function SelectField({ id, label, value, options, onChange, hint }: { id: string; label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void; hint?: ReactNode }) { return <label className="input-field" htmlFor={id}><span className="input-label">{label}</span><select className="input-control" id={id} onChange={(event) => onChange(event.target.value)} value={value}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select>{hint ? <span className="input-hint">{hint}</span> : null}</label>; }
function DataError({ message }: { message: string }) { return <Alert icon="alert" title="Change could not be completed" variant="danger">{message}</Alert>; }
function errorMessage(reason: unknown) { return reason instanceof Error ? reason.message : "The protected operation could not be completed."; }
function optionalNumber(value: string) { return value.trim() ? Number(value) : null; }
function lotInputFromLot(lot: PlotManagementItem): LotInput { return { revision: lot.revision, graveType: lot.graveType, gravePolicyReference: lot.gravePolicyReference ?? undefined, approvedMausoleumCapacity: lot.approvedMausoleumCapacity, areaId: lot.areaId, blockId: lot.blockId, lotOwnerId: lot.lotOwnerId, lotCode: lot.lotCode, legacyLocationCode: lot.legacyLocationCode || "", legacyPaNumber: lot.legacyPaNumber || "", status: lot.status, lengthM: lot.lengthM, widthM: lot.widthM, longitude: lot.location?.longitude ?? null, latitude: lot.location?.latitude ?? null, coordinateAccuracyM: lot.coordinateAccuracyM, coordinateStatus: lot.coordinateStatus, coordinateVerified: lot.coordinateVerified }; }
