"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { StaffAccountDetails, StaffDirectory, StaffDirectoryEntry } from "@/lib/staff-account-access";
import type { StaffRole } from "@/lib/supabase/types";
import { accountAction } from "@/lib/supabase/admin-data";
import { getBrowserSupabase } from "@/lib/supabase/config";
import { AdminPageFrame } from "./admin-page-content";
import { useStaff } from "./staff-context";
import styles from "./admin-accounts.module.css";

const roleLabels = { SUPER_ADMIN: "Super Administrator", ADMIN: "Administrator", MANAGER: "Manager" } as const;
const summaries = [["total", "Total staff"], ["active", "Active"], ["pending", "Pending"], ["suspended", "Suspended"]] as const;
const pageSize = 20;
type Filter = "ALL" | "ACTIVE" | "PENDING" | "SUSPENDED";
const actionText = {
  grant: ["Grant access", "The staff member will be able to sign in and use the workspace."],
  restore: ["Restore access", "The staff member will be able to sign in again."],
  suspend: ["Suspend access", "This blocks access, including in open sessions. Their work and history stay in GraveNav."],
  role: ["Change role", ""],
  resend: ["Resend invitation", "A new setup email will be sent to the staff member."],
  recovery: ["Send password reset", "The staff member will receive a link to choose their own password."],
  delete: ["Delete account", "This permanently removes the staff member's sign-in and personal account details."],
} as const;
type Choice = keyof typeof actionText;

function statusLabel(account: StaffDirectoryEntry) {
  if (account.status === "DELETING" || account.deletionPending) return "Deletion incomplete";
  if (account.status === "ACTIVE") return "Active";
  if (account.status === "SUSPENDED") return "Suspended";
  if (account.setupReady) return "Ready for approval";
  return account.invitedAt && !account.emailVerified ? "Invitation pending" : "Setup incomplete";
}

function AccessBadge({ account }: { account: StaffDirectoryEntry }) {
  return <Badge variant={
    account.status === "DELETING" || account.deletionPending ? "danger"
      : account.status === "ACTIVE" ? "success"
        : account.status === "SUSPENDED" ? "neutral" : "warning"
  }>
    {statusLabel(account)}
  </Badge>;
}

const dateFormat = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });
function dateLabel(value: string | null) {
  return value ? dateFormat.format(new Date(value)) : "Unavailable";
}

function activityLabel(event: StaffAccountDetails["activity"][number]) {
  if (event.action === "invite_sent") return "Invitation sent";
  if (event.action === "invite_resent") return "Invitation resent";
  if (event.action === "invite_failed") return "Invitation could not be sent";
  if (event.action === "password_setup") return "Password setup completed";
  if (event.action === "deletion_started") return "Permanent deletion started";
  if (event.action === "deletion_failed") return "Sign-in removal did not finish";
  if (event.action === "account_deleted") return "Account permanently deleted";
  if (event.action === "super_admin_bootstrap") return "Super Administrator assigned";
  if (event.action === "insert") return "Account created";
  if (event.fromRole && event.toRole && event.fromRole !== event.toRole) {
    return `Role changed to ${roleLabels[event.toRole]}`;
  }
  if (event.fromStatus !== event.toStatus) {
    if (event.toStatus === "SUSPENDED") return "Access suspended";
    if (event.toStatus === "ACTIVE" && event.fromStatus === "SUSPENDED") return "Access restored";
    if (event.toStatus === "ACTIVE" && event.fromStatus === "PENDING") return "Access granted";
  }
  return "Account updated";
}

class StaffActionError extends Error {
  retryable?: boolean;
  revision?: number;
  constructor(message: string, details?: { retryable?: boolean; revision?: number }) {
    super(message);
    this.retryable = details?.retryable;
    this.revision = details?.revision;
  }
}

async function postAccount(path: "provision" | "reset-password" | "remove", values: object) {
  const response = await fetch("/api/admin/accounts/" + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(values),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) {
    throw new StaffActionError(result?.error || "The request could not be completed.", {
      retryable: Boolean(result?.retryable),
      revision: typeof result?.revision === "number" ? result.revision : undefined,
    });
  }
  return result as { alreadySent?: boolean; alreadyDeleted?: boolean };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Please try again.";
}

function StaffDialog({ title, drawer = false, busy, onClose, children }: {
  title: string; drawer?: boolean; busy: boolean; onClose: () => void; children: ReactNode;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog ref={dialog} aria-labelledby={titleId}
      className={drawer ? styles.drawer : styles.dialog}
      onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
      <header className={styles.dialogHeader}>
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" type="button" disabled={busy} onClick={onClose} aria-label="Close dialog"><Icon name="x" size={18} /></button>
      </header>
      <div className={styles.dialogContent}>{children}</div>
    </dialog>
  );
}

export function AdminStaffAccounts({ initialFilter = "ALL" }: { initialFilter?: Filter }) {
  const staff = useStaff();
  const [directory, setDirectory] = useState<StaffDirectory | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ search: "", role: "ALL", status: initialFilter });
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [message, setMessage] = useState("");
  const [inviting, setInviting] = useState(false);
  const [selected, setSelected] = useState<StaffDirectoryEntry | null>(null);
  const [details, setDetails] = useState<StaffAccountDetails | null>(null);
  const [detailsError, setDetailsError] = useState("");
  const [detailsRefresh, setDetailsRefresh] = useState(0);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [nextRole, setNextRole] = useState<StaffRole>("MANAGER");
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const dialogTrigger = useRef<HTMLButtonElement | null>(null);
  const inviteButton = useRef<HTMLButtonElement>(null);
  const actionTrigger = useRef<HTMLElement | null>(null);
  const cancelAction = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const client = getBrowserSupabase();
      const result = await client?.rpc("staff_account_directory", {
        p_search: filters.search, p_role: filters.role, p_status: filters.status, p_page: page,
      }).abortSignal(controller.signal);
      if (controller.signal.aborted) return;
      if (!result?.data || result.error) {
        setDirectory(null);
        setListError("Staff accounts could not load. Refresh the list to try again.");
      } else {
        const lastPage = Math.max(1, Math.ceil(result.data.total / pageSize));
        if (page > lastPage) { setPage(lastPage); return; }
        setDirectory(result.data);
      }
      setLoading(false);
    }
    void load();
    return () => controller.abort();
  }, [filters, page, refresh]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    async function load(accountId: string) {
      const client = getBrowserSupabase();
      const result = await client?.rpc("staff_account_details", { p_account_id: accountId }).abortSignal(controller.signal);
      if (controller.signal.aborted) return;
      if (result?.data && !result.error) setDetails(result.data);
      else setDetailsError("Account details could not load. Try again.");
    }
    void load(selected.accountId);
    return () => controller.abort();
  }, [selected, detailsRefresh]);

  useEffect(() => {
    if (choice) cancelAction.current?.focus();
  }, [choice]);

  function updateFilters(next: Partial<typeof filters>) {
    setPage(1);
    setLoading(true);
    setListError("");
    setFilters(current => ({ ...current, ...next }));
  }

  function reloadList() {
    setLoading(true);
    setListError("");
    setRefresh(value => value + 1);
  }

  function reloadDetails() {
    setDetails(null);
    setDetailsError("");
    setDetailsRefresh(value => value + 1);
  }

  function closeDialog() {
    setInviting(false);
    setSelected(null);
    setChoice(null);
    setDeleteConfirmed(false);
    setDetails(null);
    setDetailsError("");
    setActionError("");
    requestAnimationFrame(() => {
      const trigger = dialogTrigger.current;
      (trigger?.isConnected ? trigger : inviteButton.current)?.focus();
    });
  }

  function choose(action: Choice) {
    actionTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setActionError("");
    setDeleteConfirmed(false);
    if (action === "role" && details) setNextRole(details.account.role);
    setChoice(action);
  }

  function cancelChoice() {
    setActionError("");
    setDeleteConfirmed(false);
    setChoice(null);
    requestAnimationFrame(() => actionTrigger.current?.focus());
  }

  async function sendInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setActionError("");
    setMessage("");
    try {
      const result = await postAccount("provision", {
        username: form.get("name"), email: form.get("email"), role: form.get("role"),
      });
      closeDialog();
      setSearch("");
      updateFilters({ search: "", role: "ALL", status: "PENDING" });
      setMessage(result.alreadySent ? "This staff member already has an invitation." : "Invitation sent. The staff member can now set up their password.");
      reloadList();
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function confirmAction() {
    if (!choice || !details || busy) return;
    const { account } = details;
    const { accountId, revision } = account;
    setBusy(true);
    setActionError("");
    setMessage("");
    try {
      switch (choice) {
        case "grant": {
          const client = getBrowserSupabase();
          const result = await client?.rpc("staff_grant_account", { p_account_id: accountId, p_revision: revision });
          if (!result || result.error) throw new Error(result?.error?.message || "Access could not be granted.");
          break;
        }
        case "restore":
          await accountAction("activate", accountId, revision);
          break;
        case "suspend":
          await accountAction("deactivate", accountId, revision, "SUSPENDED");
          break;
        case "role":
          await accountAction("role", accountId, revision, nextRole);
          break;
        case "resend":
          await postAccount("provision", { accountId, revision });
          break;
        case "recovery":
          await postAccount("reset-password", { accountId, revision });
          break;
        case "delete":
          await postAccount("remove", { accountId, revision });
          break;
      }
      setMessage({
        grant: "Access granted.", restore: "Access restored.", suspend: "Access suspended.",
        role: "Role changed.", resend: "Invitation email sent.", recovery: "Password reset email requested.",
        delete: "Account permanently deleted. Existing cemetery records and audit history were preserved.",
      }[choice]);
      closeDialog();
      reloadList();
    } catch (error) {
      if (choice === "delete" && error instanceof StaffActionError && error.retryable) {
        if (typeof error.revision === "number") {
          setDetails(current => current ? {
            ...current,
            account: {
              ...current.account,
              revision: error.revision!,
              status: "DELETING",
              deletionPending: true,
            },
          } : current);
        }
        reloadList();
      }
      setActionError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const account = details?.account;
  const isSelf = account?.accountId === staff?.accountId;
  const isDeletionPending = Boolean(account?.deletionPending || account?.status === "DELETING");
  const canDeleteAccount = Boolean(account && !isSelf && (account.canDelete ?? staff?.role === "SUPER_ADMIN"));
  const lastPage = Math.max(1, Math.ceil((directory?.total ?? 0) / pageSize));
  const directoryFiltered = filters.search || filters.role !== "ALL" || filters.status !== "ALL";

  return (
    <AdminPageFrame title="Staff Accounts" description="Invite staff and manage who can sign in to GraveNav."
      actions={<Button ref={inviteButton} icon="plus" onClick={event => {
        dialogTrigger.current = event.currentTarget;
        setActionError("");
        setInviting(true);
      }}>Invite staff</Button>}>
      {message && <Alert variant="success">{message}</Alert>}
      <section aria-label="Staff access summary" className={styles.summary}>
        <dl>
          {summaries.map(([key, label]) => (
            <div key={key}><dt>{label}</dt><dd>{directory?.summary[key] ?? (loading ? "…" : "Unavailable")}</dd></div>
          ))}
        </dl>
        <p>Totals cover current staff. Deleted and revoked accounts cannot sign in; historical records stay in audit history.</p>
      </section>

      <Card>
        <CardContent>
          <form className={styles.filters} onSubmit={event => { event.preventDefault(); updateFilters({ search: search.trim() }); }}>
            <Input label="Find staff" type="search" placeholder="Name or work email" icon="search" maxLength={254}
              value={search} onChange={event => setSearch(event.target.value)} />
            <label className="input-field">
              <span className="input-label">Role</span>
              <select className="input-control" value={filters.role} onChange={event => updateFilters({ role: event.target.value })}>
                <option value="ALL">All roles</option>
                <option value="MANAGER">Manager</option>
                <option value="ADMIN">Administrator</option>
                <option value="SUPER_ADMIN">Super Administrator</option>
              </select>
            </label>
            <label className="input-field">
              <span className="input-label">Access status</span>
              <select className="input-control" value={filters.status} onChange={event => updateFilters({ status: event.target.value as Filter })}>
                <option value="ALL">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="PENDING">Pending</option>
                <option value="SUSPENDED">Suspended</option>
              </select>
            </label>
            <Button type="submit" variant="secondary">Search</Button>
          </form>
          {directoryFiltered && <Button className={styles.clear} variant="quiet" onClick={() => {
            setSearch(""); updateFilters({ search: "", role: "ALL", status: "ALL" });
          }}>Clear filters</Button>}

          {loading ? <div className={styles.loading} role="status" aria-label="Loading staff accounts">
            {[1, 2, 3].map(index => <Skeleton key={index} style={{ height: 48 }} />)}
          </div> : listError ? <div className={styles.loading}>
            <Alert variant="danger">{listError}</Alert>
            <Button variant="secondary" onClick={reloadList}>Retry</Button>
          </div> : directory?.items.length ? <>
            <div className={styles.headings} aria-hidden="true"><span>Staff member</span><span>Role</span><span>Access</span></div>
            <ul className={styles.list} aria-label="Staff members" role="list">
              {directory.items.map(entry => (
                <li className={styles.row} key={entry.accountId}>
                  <div className={styles.member}>
                    <strong>{entry.username}{entry.accountId === staff?.accountId && <span className={styles.you}>You</span>}</strong>
                    {entry.email && <span>{entry.email}</span>}
                  </div>
                  <span className={styles.role}>{roleLabels[entry.role]}</span>
                  <div className={styles.status}><AccessBadge account={entry} /></div>
                  <Button size="sm" variant="secondary" className={styles.manage} aria-label={`Manage ${entry.username}`}
                    onClick={event => {
                      dialogTrigger.current = event.currentTarget;
                      setActionError("");
                      setDetailsError("");
                      setSelected(entry);
                    }}>Manage</Button>
                </li>
              ))}
            </ul>
            <div className={styles.pagination}>
              <p role="status">Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, directory.total)} of {directory.total} staff</p>
              {lastPage > 1 && <nav aria-label="Staff list pages">
                <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => { setLoading(true); setPage(page - 1); }}>Previous</Button>
                <Button variant="secondary" size="sm" disabled={page >= lastPage} onClick={() => { setLoading(true); setPage(page + 1); }}>Next</Button>
              </nav>}
            </div>
          </> : <EmptyState
            title={directoryFiltered ? "No matching staff" : "No staff accounts"}
            description={directoryFiltered ? "Try a different search, role, or access status." : "Invite someone when they need access to GraveNav."}
            icon="users"
          />}
        </CardContent>
      </Card>

      {inviting && <StaffDialog title="Invite staff" busy={busy} onClose={closeDialog}>
        <p className={styles.secondary}>Staff will receive an email to set their own password.</p>
        <form className={styles.inviteForm} onSubmit={sendInvite}>
          <Input label="Staff name" name="name" required minLength={2} maxLength={80} disabled={busy} />
          <Input label="Work email" name="email" type="email" required maxLength={254} disabled={busy} />
          <fieldset className={styles.roles}>
            <legend>Role</legend>
            <label><input type="radio" name="role" value="MANAGER" defaultChecked disabled={busy} />
              <span><strong>Manager</strong><small>Day-to-day cemetery operations.</small></span></label>
            <label><input type="radio" name="role" value="ADMIN" disabled={busy} />
              <span><strong>Administrator</strong><small>Oversees cemetery records, verification, and recovery.</small></span></label>
            <label><input type="radio" name="role" value="SUPER_ADMIN" disabled={busy} />
              <span><strong>Super Administrator</strong><small>Manages staff access and security settings.</small></span></label>
          </fieldset>
          {actionError && <Alert variant="danger">{actionError}</Alert>}
          <div className={styles.dialogActions}>
            <Button variant="secondary" onClick={closeDialog} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Sending…" : "Send invitation"}</Button>
          </div>
        </form>
      </StaffDialog>}

      {selected && <StaffDialog title={selected.username} drawer busy={busy} onClose={closeDialog}>
        {detailsError ? <>
          <Alert variant="danger">{detailsError}</Alert>
          <Button variant="secondary" onClick={reloadDetails}>Retry</Button>
        </> : !account ? <p role="status">Loading account details…</p> : <>
          <div className={styles.detailStatus}><AccessBadge account={account} /><span>{roleLabels[account.role]}</span></div>
          <dl className={styles.details}>
            <div><dt>Work email</dt><dd>{account.email || "Unavailable"}</dd></div>
            <div><dt>Account added</dt><dd>{dateLabel(account.createdAt)}</dd></div>
            <div><dt>Last sign-in</dt><dd>{dateLabel(account.lastSignInAt)}</dd></div>
          </dl>
          <section className={styles.detailSection}>
            <h3>Permissions</h3>
            <p>{account.role === "SUPER_ADMIN"
              ? "Staff access, security settings, and cemetery operations."
              : account.role === "ADMIN"
                ? "Cemetery operations, verification, and recovery."
                : "Cemetery records, plots, owners, and operational reports."}</p>
            {account.status !== "ACTIVE" && <p>Workspace access is currently blocked.</p>}
          </section>
          {!isSelf && <section className={styles.detailSection}>
            <h3>Manage access</h3>
            {isDeletionPending && <Alert variant="warning">
              Workspace access is already blocked, but permanent sign-in removal did not finish. Retry Delete account to complete removal.
            </Alert>}
            {choice ? <div className={styles.confirmation} role="group" aria-label={actionText[choice][0]}>
              {choice === "role" ? <label className="input-field">
                <span className="input-label">Choose a new role</span>
                <select className="input-control" value={nextRole} disabled={busy}
                  onChange={event => setNextRole(event.target.value as StaffRole)}>
                  <option value="MANAGER">Manager</option>
                  <option value="ADMIN">Administrator</option>
                  <option value="SUPER_ADMIN">Super Administrator</option>
                </select>
              </label> : choice === "delete" ? <>
                <p><strong>Permanent deletion cannot be undone.</strong></p>
                <ul className={styles.deleteSummary}>
                  <li><strong>Removed permanently:</strong> Supabase Auth sign-in credentials, work email, active sessions, and current display name.</li>
                  <li><strong>Kept for cemetery records:</strong> Existing burial records, photos, and audit history remain linked to a minimal non-login historical identity. Older audit entries recorded before deletion may still contain the former username.</li>
                </ul>
                <label className={styles.deleteAck}>
                  <input type="checkbox" checked={deleteConfirmed} disabled={busy}
                    onChange={event => setDeleteConfirmed(event.target.checked)} />
                  <span>I understand this permanently removes sign-in access for {account.username} and cannot be undone.</span>
                </label>
              </> : <p>{actionText[choice][1]}</p>}
              {actionError && <Alert variant="danger">{actionError}</Alert>}
              <div className={styles.dialogActions}>
                <Button ref={cancelAction} variant="secondary" onClick={cancelChoice} disabled={busy}>Cancel</Button>
                <Button variant={choice === "suspend" || choice === "delete" ? "danger" : "primary"}
                  onClick={() => void confirmAction()}
                  disabled={busy || (choice === "role" && nextRole === account.role) || (choice === "delete" && !deleteConfirmed)}>
                  {busy
                    ? (choice === "delete" ? "Deleting…" : "Applying…")
                    : choice === "role"
                      ? "Save role"
                      : choice === "delete" && isDeletionPending
                        ? "Retry delete account"
                        : actionText[choice][0]}
                </Button>
              </div>
              {actionError && <Button variant="quiet" onClick={() => { cancelChoice(); reloadDetails(); }}>Reload account details</Button>}
            </div> : <>
              {!isDeletionPending && <div className={styles.detailActions}>
                {account.status === "PENDING" && account.setupReady && <Button onClick={() => choose("grant")}>Grant access</Button>}
                {account.status === "PENDING" && !account.setupReady && <p>Grant access becomes available after password setup.</p>}
                {account.canResend && <Button variant="secondary" onClick={() => choose("resend")}>Resend invitation</Button>}
                {account.status === "SUSPENDED" && account.setupReady && <Button onClick={() => choose("restore")}>Restore access</Button>}
                {account.status === "SUSPENDED" && !account.setupReady && <p>This account needs verified password setup before access can be restored.</p>}
                {account.canRecover && <Button variant="secondary" onClick={() => choose("recovery")}>Send password reset</Button>}
                <Button variant="secondary" onClick={() => choose("role")}>Change role</Button>
                {account.status === "ACTIVE" && <Button variant="secondary" onClick={() => choose("suspend")}>Suspend access</Button>}
              </div>}
              {canDeleteAccount && <div className={styles.dangerZone}>
                <h4>Permanent deletion</h4>
                <p>Permanently remove sign-in access and personal account details while keeping cemetery records and audit history.</p>
                <div className={styles.detailActions}>
                  <Button variant="danger" onClick={() => choose("delete")}>
                    {isDeletionPending ? "Retry delete account" : "Delete account"}
                  </Button>
                </div>
              </div>}
            </>}
          </section>}
          {isSelf && <p className={styles.secondary}>Change your password from your account menu.</p>}
          <section className={styles.detailSection}>
            <h3>Recent activity</h3>
            {details.activity.length ? <ul className={styles.activity} role="list">
              {details.activity.map(event => <li key={event.id}>
                <strong>{activityLabel(event)}</strong><span>{event.actor} · {dateLabel(event.at)}</span>
              </li>)}
            </ul> : <p>No account activity is available.</p>}
          </section>
        </>}
      </StaffDialog>}
    </AdminPageFrame>
  );
}
