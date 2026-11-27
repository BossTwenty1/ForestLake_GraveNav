"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { isSyntheticPlot, plotAvailabilityLabel } from "@/lib/synthetic-plots";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/icons";
import { AdminPageFrame } from "./admin-page-content";
import { AdminEditMenu } from "./admin-edit-menu";
import { useStaff } from "./staff-context";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow,
} from "@/components/ui/table";
import {
  createLotOwner, deleteLotOwner, getOwnerInterments, getOwnerPlots,
  getOwnerRecord, getOwnerRecordsPage, updateLotOwner, type OwnerInput,
} from "@/lib/supabase/admin-data";
import type { LotOwner } from "@/lib/supabase/types";
import styles from "./owner-pages.module.css";

const directory = "/admin/owner-data";
const breadcrumbs = [
  { label: "Dashboard", href: "/admin" },
  { label: "Plot Owners", href: directory },
];
const ownerName = (owner: LotOwner) =>
  [owner.firstName, owner.middleName, owner.lastName, owner.suffix].filter(Boolean).join(" ");
function errorMessage(reason: unknown) {
  if (reason && typeof reason === "object" && "message" in reason &&
    typeof reason.message === "string") return reason.message;
  return "The operation failed. Please try again.";
}

function OwnerActions({ owner, canAdmin, busy, onDelete }: {
  owner: LotOwner; canAdmin: boolean; busy: boolean; onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !trigger.current?.contains(event.target) &&
          !panel.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    };
    const close = () => setOpen(false);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    const frame = requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      cancelAnimationFrame(frame);
    };
  }, [open]);

  function toggle() {
    if (!open && trigger.current) {
      const rect = trigger.current.getBoundingClientRect();
      const height = canAdmin ? 132 : 88;
      setPosition({
        top: rect.bottom + height + 6 > window.innerHeight ? Math.max(8, rect.top - height - 6) : rect.bottom + 6,
        left: Math.max(8, Math.min(rect.right - 210, window.innerWidth - 218)),
      });
    }
    setOpen(!open);
  }

  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (!items.length || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 :
      event.key === "ArrowDown" ? (current + 1) % items.length : (current <= 0 ? items.length : current) - 1;
    items[next]?.focus();
  }

  return <div className="admin-record-menu">
    <button ref={trigger} type="button" aria-label={`More actions for ${ownerName(owner)}`}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      disabled={busy} onClick={toggle}><Icon name="more" size={18} /></button>
    {open && createPortal(
      <div id={id} ref={panel} role="menu" onKeyDown={navigate}
        className="admin-record-menu__popover admin-record-menu__popover--portal" style={position}>
        <Link href={directory + "/" + owner.lotOwnerId} role="menuitem" onClick={() => setOpen(false)}>
          <Icon name="eye" size={16} />View
        </Link>
        <Link href={directory + "/" + owner.lotOwnerId + "/edit"} role="menuitem" onClick={() => setOpen(false)}>
          <Icon name="edit" size={16} />Edit
        </Link>
        {canAdmin && <button type="button" role="menuitem" className="admin-record-menu__danger"
          onClick={() => { setOpen(false); trigger.current?.focus(); onDelete(); }}>
          <Icon name="trash" size={16} />Delete
        </button>}
      </div>, document.body,
    )}
  </div>;
}

export function OwnerDirectory({ search = "", page = 0 }: { search?: string; page?: number }) {
  const canAdmin = ["ADMIN", "SUPER_ADMIN"].includes(useStaff()?.role ?? "");
  const [result, setResult] = useState<Awaited<ReturnType<typeof getOwnerRecordsPage>> | null>(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [target, setTarget] = useState<LotOwner | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  useEffect(() => {
    let active = true;
    getOwnerRecordsPage({ search, page, pageSize: 20 }).then((next) => {
      if (!active) return;
      if (!next.items.length && page > 0 && next.total !== null && next.total > 0) {
        router.replace(directoryHref(search, page - 1));
      }
      setResult(next);
      setLoadError("");
      setLoading(false);
    }).catch((reason) => {
      if (active) { setLoadError(errorMessage(reason)); setLoading(false); }
    });
    return () => { active = false; };
  }, [search, page, revision, router]);

  async function removeOwner() {
    if (!target || busy) return;
    setBusy(true);
    setActionError("");
    setMessage("");
    try {
      await deleteLotOwner(target.lotOwnerId, target.revision);
      setTarget(null);
      setMessage("Plot owner removed. Administrators can restore it in Recovery.");
      setLoading(true);
      setRevision((value) => value + 1);
    } catch (reason) {
      setTarget(null);
      setActionError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const totalPages = result?.total ? Math.max(1, Math.ceil(result.total / 20)) : 1;

  return (
    <AdminPageFrame
      title="Plot Owners"
      description="Find and maintain owner records. A plot or interment is not required to register an owner."
      breadcrumbs={[{ label: "Dashboard", href: "/admin" }, { label: "Plot Owners" }]}
      actions={<Link className="button button--primary button--md" href={directory + "/new"}>Add Plot Owner</Link>}
    >
      <Card>
        <CardContent>
          <form action={directory} className={styles.search} role="search">
            <Input
              defaultValue={search}
              icon="search"
              key={search}
              label="Search plot owners"
              maxLength={80}
              name="query"
              placeholder="Full name, alias, address, or representative…"
              type="search"
            />
            <Button type="submit">Search</Button>
            {search ? <Link className="subtle-link" href={directory}>Clear search</Link> : null}
          </form>
        </CardContent>
      </Card>
      {message ? <Alert title="Owner update" variant="success">{message}</Alert> : null}
      {actionError ? <Alert title="Owner action failed" variant="danger">{actionError}</Alert> : null}
      {loadError ? <LoadError message={loadError} onRetry={() => { setLoading(true); setRevision((value) => value + 1); }} /> : null}
      {loading ? <p role="status">Loading plot owners…</p> : null}
      {!loading && !loadError && result ? (
        <Card>
          <CardHeader>
            <CardTitle>{search ? "Search results" : "Owner directory"}</CardTitle>
            <span className="input-hint">{result.total ?? result.items.length} owners</span>
          </CardHeader>
          {result.items.length ? (
            <>
              <div className={styles.desktopTable}>
                <Table caption="Plot owner directory">
                  <TableHead><TableRow>
                    <TableHeaderCell>Owner</TableHeaderCell>
                    <TableHeaderCell>Address</TableHeaderCell>
                    <TableHeaderCell>Representative</TableHeaderCell>
                    <TableHeaderCell>Actions</TableHeaderCell>
                  </TableRow></TableHead>
                  <TableBody>{result.items.map((owner) => (
                    <TableRow key={owner.lotOwnerId}>
                      <TableCell><Link className="subtle-link" href={directory + "/" + owner.lotOwnerId}>
                        {ownerName(owner)}
                      </Link><small className={styles.secondary}>Owner #{owner.lotOwnerId}</small>
                        {owner.aliases ? <small className={styles.secondary}>{owner.aliases}</small> : null}
                      </TableCell>
                      <TableCell>{owner.address || "Not recorded"}</TableCell>
                      <TableCell>{owner.representativeName || "Not recorded"}</TableCell>
                      <TableCell><OwnerActions owner={owner} canAdmin={canAdmin} busy={busy}
                        onDelete={() => { setActionError(""); setTarget(owner); }} /></TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              </div>
              <div className={styles.mobileCards}>
                {result.items.map((owner) => (
                  <article className={styles.mobileCard} key={owner.lotOwnerId}>
                    <div>
                      <Link className="subtle-link" href={directory + "/" + owner.lotOwnerId}>
                        <strong>{ownerName(owner)}</strong>
                      </Link>
                      <small className={styles.secondary}>Owner #{owner.lotOwnerId}{owner.aliases ? ` · ${owner.aliases}` : ""}</small>
                    </div>
                    <p className={styles.secondary}>{owner.address || "Address not recorded"}</p>
                    {owner.representativeName ? <p className={styles.secondary}>Representative: {owner.representativeName}</p> : null}
                    <OwnerActions owner={owner} canAdmin={canAdmin} busy={busy}
                      onDelete={() => { setActionError(""); setTarget(owner); }} />
                  </article>
                ))}
              </div>
            </>
          ) : <CardContent><EmptyState
            title={search ? "No matching plot owners" : "No plot owners yet"}
            description={search ? "Try another name, alias, or address, or clear the search." : "Use Add Plot Owner to register an owner without assigning a plot."}
            icon="userSearch"
          /></CardContent>}
          {totalPages > 1 || page > 0 || result.hasMore ? (
            <CardContent><nav aria-label="Owner directory pages" className={styles.actions}>
              {page > 0 ? <Link className="subtle-link" href={directoryHref(search, page - 1)}>Previous</Link> : null}
              <span>Page {page + 1} of {totalPages}</span>
              {result.hasMore ? <Link className="subtle-link" href={directoryHref(search, page + 1)}>Next</Link> : null}
            </nav></CardContent>
          ) : null}
        </Card>
      ) : null}
      <ConfirmationDialog
        open={Boolean(target)}
        title="Delete plot owner?"
        description={<p>Only unassigned owners can be removed. Administrators can restore them in Recovery.</p>}
        confirmLabel={busy ? "Deleting…" : "Delete owner"}
        variant="danger"
        onConfirm={() => void removeOwner()}
        onClose={() => { if (!busy) setTarget(null); }}
      />
    </AdminPageFrame>
  );
}

function directoryHref(search: string, page: number) {
  const params = new URLSearchParams();
  if (search.trim()) params.set("query", search.trim());
  if (page > 0) params.set("page", String(page + 1));
  return directory + (params.size ? "?" + params : "");
}

function useOwner(id?: string) {
  const [owner, setOwner] = useState<LotOwner | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!id) return;
    let active = true;
    getOwnerRecord(id).then((record) => {
      if (active) { setOwner(record); setError(""); setLoading(false); }
    }).catch((reason) => {
      if (active) { setError(errorMessage(reason)); setLoading(false); }
    });
    return () => { active = false; };
  }, [id, retry]);
  return { owner, loading, error, retry: () => setRetry((value) => value + 1) };
}

export function OwnerEditor({ ownerId }: { ownerId?: string }) {
  const state = useOwner(ownerId);
  const title = ownerId ? "Edit Plot Owner" : "Add Plot Owner";
  return (
    <AdminPageFrame
      title={title}
      description="Maintain the registered owner's details. Plot associations are managed separately."
      breadcrumbs={[...breadcrumbs, { label: title }]}
    >
      {state.loading ? <p role="status">Loading plot owner…</p> :
        state.error ? <LoadError message={state.error} onRetry={state.retry} /> :
          ownerId && !state.owner ? <MissingOwner /> :
            <OwnerForm key={ownerId || "new"} owner={state.owner} />}
    </AdminPageFrame>
  );
}

function OwnerForm({ owner }: { owner: LotOwner | null }) {
  const router = useRouter();
  const [form, setForm] = useState<OwnerInput>(() => ({
    revision: owner?.revision,
    firstName: owner?.firstName || "",
    middleName: owner?.middleName || "",
    lastName: owner?.lastName || "",
    suffix: owner?.suffix || "",
    aliases: owner?.aliases || "",
    address: owner?.address || "",
    representativeName: owner?.representativeName || "",
    representativeContact: owner?.representativeContact || "",
    representativeRelation: owner?.representativeRelation || "",
  }));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const cancelHref = owner ? directory + "/" + owner.lotOwnerId : directory;
  function setField(key: keyof OwnerInput, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError("");
    if (!form.firstName.trim() || !form.lastName.trim() || !form.address.trim()) {
      setError("First name, last name, and address are required.");
      return;
    }
    setSaving(true);
    try {
      const input = {
        ...form,
        firstName: form.firstName.trim(),
        middleName: (form.middleName ?? "").trim(),
        lastName: form.lastName.trim(),
        suffix: (form.suffix ?? "").trim(),
        aliases: (form.aliases ?? "").trim(),
        address: form.address.trim(),
        representativeName: (form.representativeName ?? "").trim(),
        representativeContact: (form.representativeContact ?? "").trim(),
        representativeRelation: (form.representativeRelation ?? "").trim(),
      };
      const receipt = owner
        ? await updateLotOwner(owner.lotOwnerId, input)
        : await createLotOwner(input);
      if (!receipt || typeof receipt !== "object" || Array.isArray(receipt) ||
        !("id" in receipt) || !/^[1-9]\d*$/.test(String(receipt.id))) {
        throw new Error("The save response could not be confirmed. Retry to safely resume the same request.");
      }
      router.push(directory + "/" + receipt.id);
    } catch (reason) { setError(errorMessage(reason)); setSaving(false); }
  }
  return (
    <Card className={styles.formCard}><CardContent>
      <form className="admin-form" onSubmit={(event) => void submit(event)}>
        <p className="input-hint">Fields marked * are required.</p>
        <fieldset className={styles.fieldset} disabled={saving}>
          <legend>Owner details</legend>
          <div className="filter-grid">
            <Input
              label="First name *"
              required
              value={form.firstName}
              onChange={(e) => setField("firstName", e.target.value)}
            />
            <Input
              label="Middle name"
              value={form.middleName}
              onChange={(e) => setField("middleName", e.target.value)}
            />
            <Input
              label="Last name *"
              required
              value={form.lastName}
              onChange={(e) => setField("lastName", e.target.value)}
            />
            <Input
              label="Suffix"
              value={form.suffix}
              onChange={(e) => setField("suffix", e.target.value)}
            />
          </div>
          <Input
            label="Aliases"
            value={form.aliases}
            onChange={(e) => setField("aliases", e.target.value)}
          />
          <label className="input-field" htmlFor="owner-address">
            <span className="input-label">Address<span aria-hidden="true" className="input-required-marker">*</span></span>
            <textarea
              className="input-control"
              id="owner-address"
              required
              rows={3}
              value={form.address}
              onChange={(e) => setField("address", e.target.value)}
            />
          </label>
        </fieldset>
        <fieldset className={styles.fieldset} disabled={saving}>
          <legend>Representative <span className="input-hint">(optional)</span></legend>
          <div className="filter-grid">
            <Input
              label="Representative name"
              value={form.representativeName}
              onChange={(e) => setField("representativeName", e.target.value)}
            />
            <Input
              label="Representative relation"
              value={form.representativeRelation}
              onChange={(e) => setField("representativeRelation", e.target.value)}
            />
          </div>
          <Input
            label="Representative contact"
            value={form.representativeContact}
            onChange={(e) => setField("representativeContact", e.target.value)}
          />
        </fieldset>
        {error ? <Alert title="Owner could not be saved" variant="danger">{error}</Alert> : null}
        <div className="admin-form-actions">
          {saving ? null : <Link className="button button--secondary button--md" href={cancelHref}>Cancel</Link>}
          <Button disabled={saving} icon="check" type="submit">
            {saving ? "Saving…" : owner ? "Save changes" : "Save Plot Owner"}
          </Button>
        </div>
      </form>
    </CardContent></Card>
  );
}

export function OwnerProfile({ ownerId }: { ownerId: string }) {
  const state = useOwner(ownerId);
  const owner = state.owner;
  return (
    <AdminPageFrame
      title={owner ? ownerName(owner) : "Plot Owner"}
      description={owner ? "Owner #" + owner.lotOwnerId + " · Restricted staff record" : undefined}
      breadcrumbs={[...breadcrumbs, { label: "Owner profile" }]}
      actions={owner ? <AdminEditMenu actionLabel="Edit Plot Owner"
        href={directory + "/" + owner.lotOwnerId + "/edit"} label={`More actions for ${ownerName(owner)}`} /> : null}
    >
      <Link className="subtle-link" href={directory}>Back to Plot Owners</Link>
      {state.loading ? <p role="status">Loading plot owner…</p> :
        state.error ? <LoadError message={state.error} onRetry={state.retry} /> :
          !owner ? <MissingOwner /> : <>
            <Card><CardHeader><CardTitle>Owner profile</CardTitle></CardHeader><CardContent>
              <dl className={styles.profile}>
                <Detail label="Full name">{ownerName(owner)}</Detail>
                <Detail label="Aliases">{owner.aliases}</Detail>
                <Detail label="Address">{owner.address}</Detail>
                <Detail label="Representative">{owner.representativeName}</Detail>
                <Detail label="Representative relation">{owner.representativeRelation}</Detail>
                <Detail label="Representative contact">{owner.representativeContact}</Detail>
              </dl>
            </CardContent></Card>
            <OwnerRelationships ownerId={owner.lotOwnerId} />
          </>}
    </AdminPageFrame>
  );
}

function OwnerRelationships({ ownerId }: { ownerId: number }) {
  const [plots, setPlots] = useState<Awaited<ReturnType<typeof getOwnerPlots>> | null>(null);
  const [interments, setInterments] = useState<Awaited<ReturnType<typeof getOwnerInterments>> | null>(null);
  const [plotPage, setPlotPage] = useState(0);
  const [intermentPage, setIntermentPage] = useState(0);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.all([getOwnerPlots(ownerId, plotPage), getOwnerInterments(ownerId, intermentPage)])
      .then(([nextPlots, nextInterments]) => {
        if (active) { setPlots(nextPlots); setInterments(nextInterments); setError(""); }
      }).catch((reason) => { if (active) setError(errorMessage(reason)); });
    return () => { active = false; };
  }, [ownerId, plotPage, intermentPage, retry]);
  if (error) return <LoadError message={error} onRetry={() => setRetry((value) => value + 1)} />;
  if (!plots || !interments) return <p role="status">Loading associated records…</p>;
  return <>
    <Card><CardHeader><CardTitle>Associated plots</CardTitle></CardHeader><CardContent>
      <p className="input-hint">Existing associations are shown for reference. Linking is not available here.</p>
      {plots.items.length ? <ul className={styles.records}>{plots.items.map((plot) => (
        <li key={plot.lot_id}>
          <strong>{isSyntheticPlot(plot.lot_code) ? `Phase 2 Plot #${plot.lot_id}` : plot.lot_code}</strong>
          <span>{plot.area?.area_name || "Garden not recorded"} · {plotAvailabilityLabel(plot.lot_code, plot.status)}</span>
        </li>
      ))}</ul> : <p>No associated plots yet.</p>}
      <RelationshipPages label="Associated plots" page={plotPage} hasMore={plots.hasMore} onChange={setPlotPage} />
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Related interments</CardTitle></CardHeader><CardContent>
      <p className="input-hint">Interments at this owner’s currently associated plots. This does not establish a family relationship.</p>
      {interments.items.length ? <ul className={styles.records}>{interments.items.map((record) => (
        <li key={record.burial_id}>
          <Link className="subtle-link" href={"/admin/burial-records/" + record.burial_id}>
            {record.deceased?.display_name || "Name not recorded"} · Burial #{record.burial_id}
          </Link>
          <span>{isSyntheticPlot(record.lot.lot_code) ? "Phase 2 Plot" : `Lot ${record.lot.lot_code}`}</span>
          <span>Interment: {record.interment_date || "Not recorded"} · Status: {record.record_status}</span>
        </li>
      ))}</ul> : <p>No related interments.</p>}
      <RelationshipPages label="Related interments" page={intermentPage} hasMore={interments.hasMore} onChange={setIntermentPage} />
    </CardContent></Card>
  </>;
}

function RelationshipPages({ label, page, hasMore, onChange }: {
  label: string; page: number; hasMore: boolean; onChange: (page: number) => void;
}) {
  if (!page && !hasMore) return null;
  return <nav aria-label={label + " pages"} className={styles.actions}>
    <Button disabled={!page} onClick={() => onChange(page - 1)} size="sm" variant="secondary">Previous</Button>
    <span>Page {page + 1}</span>
    <Button disabled={!hasMore} onClick={() => onChange(page + 1)} size="sm" variant="secondary">Next</Button>
  </nav>;
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt>{label}</dt><dd>{children || "Not recorded"}</dd></div>;
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <Alert title="Records could not be loaded" variant="danger">
    <p>{message}</p><Button onClick={onRetry} size="sm" variant="secondary">Retry</Button>
  </Alert>;
}

function MissingOwner() {
  return <div>
    <EmptyState title="Plot owner not found" icon="userSearch"
      description="This owner is unavailable or has been removed." />
    <Link className="subtle-link" href={directory}>Return to Plot Owners</Link>
  </div>;
}
