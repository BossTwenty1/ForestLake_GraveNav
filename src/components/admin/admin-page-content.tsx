"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { PageHeading, type PageBreadcrumb } from "@/components/ui/page-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { AdminCemeteryMap } from "@/components/admin/admin-cemetery-map";
import { AdminPhotoUploader } from "@/components/admin/admin-photo-uploader";
import { useStaff } from "@/components/admin/staff-context";
import { csvCell } from "@/lib/csv";
import { generateStaffPassword, validateStaffPassword } from "@/lib/staff-password";
import { accountAction, getAdminAccounts, getAuditLog, getAuditLogPage } from "@/lib/supabase/admin-data";
import type { AdminAccount, AuditLogEntry } from "@/lib/supabase/types";
import accountStyles from "./admin-accounts.module.css";

export function AdminCemeteryMapPage({ hasPlanningMap = false }: { hasPlanningMap?: boolean }) {
  return (
    <AdminPageFrame
      title="Cemetery Map"
      description="Inspect the Forest Lake Phase 2 park layout and satellite imagery, or click any occupied plot to manage its memorial record."
    >
      <AdminCemeteryMap hasPlanningMap={hasPlanningMap} />
    </AdminPageFrame>
  );
}

export function AdminPhotosPage() {
  return (
    <AdminPageFrame
      title="Photo Moderation & Gallery"
      description="Review visitor remembrance submissions and manage memorial portraits before public display."
    >
      <AdminPhotoUploader />
    </AdminPageFrame>
  );
}

export function AdminAuditLogPage() {
  const canAdmin = useStaff()?.role === "ADMIN";
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [actors, setActors] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [tableFilter, setTableFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      getAuditLogPage({ page: 0 }),
      canAdmin ? getAdminAccounts().catch(() => []) : Promise.resolve([]),
    ])
      .then(([result, accounts]) => {
        if (!active) return;
        setEntries(result.items);
        setHasMore(result.hasMore);
        setActors(new Map(accounts.map((a) => [a.accountId, a.username])));
      })
      .catch((reason) => { if (active) setError(errorMessage(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [canAdmin]);

  const tables = useMemo(() => Array.from(new Set(entries.map((e) => e.table_name))).sort(), [entries]);
  const actions = useMemo(() => Array.from(new Set(entries.map((e) => e.action))).sort(), [entries]);
  const filteredEntries = useMemo(() => {
    const term = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (tableFilter !== "all" && entry.table_name !== tableFilter) return false;
      if (actionFilter !== "all" && entry.action !== actionFilter) return false;
      if (!term) return true;
      const actorName = entry.actor_account_id ? (actors.get(entry.actor_account_id) || entry.actor_account_id) : "";
      return [entry.action, entry.table_name, entry.record_id, actorName]
        .some((v) => String(v ?? "").toLowerCase().includes(term));
    });
  }, [entries, tableFilter, actionFilter, search, actors]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const result = await getAuditLogPage({ page: page + 1 });
      setEntries((current) => [...current, ...result.items]);
      setPage((current) => current + 1);
      setHasMore(result.hasMore);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoadingMore(false);
    }
  }

  async function exportLog() {
    if (exporting || !canAdmin) return;
    setExporting(true);
    setError("");
    try {
      const rows = await getAuditLog(true);
      const header = "audit_id,actor,action,table_name,record_id,created_at";
      const csv = "\uFEFF" + [
        header,
        ...rows.map((row) => [
          row.audit_id,
          row.actor_account_id ? (actors.get(row.actor_account_id) || row.actor_account_id) : "System",
          row.action,
          row.table_name,
          row.record_id,
          row.created_at,
        ].map(csvCell).join(",")),
      ].join("\r\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "gravenav-audit-log.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setExporting(false);
    }
  }

  return (
    <AdminPageFrame
      title="Audit Log"
      description="Review staff actions across memorials, photos, plots, owners, and accounts."
      actions={canAdmin ? (
        <Button disabled={exporting} icon="download" onClick={() => void exportLog()}>
          {exporting ? "Exporting…" : "Export audit log"}
        </Button>
      ) : undefined}
    >
      {error ? <DataError message={error} /> : null}
      <Card>
        <CardHeader>
          <CardTitle>Recent events</CardTitle>
          <Badge variant="info">{filteredEntries.length} shown{hasMore ? " (more available)" : ""}</Badge>
        </CardHeader>
        <CardContent>
          <div className="filter-grid" style={{ marginBottom: 14 }}>
            <Input
              aria-label="Filter audit events"
              icon="search"
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search record ID, table, action, or staff…"
              type="search"
              value={search}
            />
            <label className="input-field">
              <span className="input-label">Table</span>
              <select className="input-control" onChange={(e) => setTableFilter(e.target.value)} value={tableFilter}>
                <option value="all">All tables</option>
                {tables.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="input-field">
              <span className="input-label">Action</span>
              <select className="input-control" onChange={(e) => setActionFilter(e.target.value)} value={actionFilter}>
                <option value="all">All actions</option>
                {actions.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
          </div>
          {loading ? (
            <div style={{ display: "grid", gap: 10 }} role="status" aria-label="Loading audit events">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} style={{ height: 48, borderRadius: 8 }} />)}
            </div>
          ) : filteredEntries.length ? (
            <>
              <Table caption="Audit log">
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Actor</TableHeaderCell>
                    <TableHeaderCell>Action</TableHeaderCell>
                    <TableHeaderCell>Table</TableHeaderCell>
                    <TableHeaderCell>Record</TableHeaderCell>
                    <TableHeaderCell>Timestamp</TableHeaderCell>
                    <TableHeaderCell>Changes</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredEntries.map((entry) => {
                    const actorLabel = entry.actor_account_id
                      ? (actors.get(entry.actor_account_id) || `${entry.actor_account_id.slice(0, 8)}…`)
                      : "System";
                    return (
                      <TableRow key={entry.audit_id}>
                        <TableCell>{actorLabel}</TableCell>
                        <TableCell>
                          <Badge variant={entry.action === "verify" || entry.action === "approve" ? "success" : entry.action === "delete" || entry.action === "reject" ? "danger" : "neutral"}>
                            {entry.action}
                          </Badge>
                        </TableCell>
                        <TableCell>{entry.table_name}</TableCell>
                        <TableCell>{entry.record_id}</TableCell>
                        <TableCell>{new Date(entry.created_at).toLocaleString()}</TableCell>
                        <TableCell>
                          <details>
                            <summary>Before / after</summary>
                            <pre className="audit-values">{JSON.stringify({ before: entry.old_values, after: entry.new_values }, null, 2)}</pre>
                          </details>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {hasMore ? (
                <div style={{ marginTop: 14 }}>
                  <Button disabled={loadingMore} onClick={() => void loadMore()} variant="secondary">
                    {loadingMore ? "Loading more…" : "Load more events"}
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <EmptyState
              description={entries.length ? "No loaded audit events match the active filters." : "No audit events have been recorded yet."}
              icon="audit"
              title="No matching events"
            />
          )}
        </CardContent>
      </Card>
    </AdminPageFrame>
  );
}

type PendingAccountAction = {
  action: "approve" | "activate" | "deactivate" | "role" | "remove";
  account: AdminAccount;
  value?: string;
  title: string;
  description: string;
  confirmLabel: string;
  variant: "primary" | "danger";
};

type CredentialHandoff = {
  heading: string;
  username: string;
  email: string | null;
  role: "ADMIN" | "MANAGER";
  status: string;
  password: string;
};

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "ST";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function AdminAccountsPage({ pendingOnly = false }: { pendingOnly?: boolean }) {
  const currentStaff = useStaff();
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "PENDING" | "SUSPENDED">(pendingOnly ? "PENDING" : "ALL");
  const [search, setSearch] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"ADMIN" | "MANAGER">("MANAGER");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [activateImmediately, setActivateImmediately] = useState(true);
  const [createBusy, setCreateBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<PendingAccountAction | null>(null);
  const [handoff, setHandoff] = useState<CredentialHandoff | null>(null);
  const [showHandoffPassword, setShowHandoffPassword] = useState(false);
  const [copiedHandoff, setCopiedHandoff] = useState(false);

  // Set New Password modal state for existing staff rows
  const [passwordModalAccount, setPasswordModalAccount] = useState<AdminAccount | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState("");

  async function refresh() {
    try {
      setAccounts(await getAdminAccounts());
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    getAdminAccounts()
      .then((next) => { if (active) setAccounts(next); })
      .catch((reason) => { if (active) setError(errorMessage(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  // Close row overflow menu on outside click or Escape
  useEffect(() => {
    if (!openMenuId) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-account-menu]")) return;
      setOpenMenuId(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenuId(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenuId]);

  // Exclude permanently removed (REVOKED) accounts from the active directory display
  const activeDirectoryAccounts = useMemo(
    () => accounts.filter((account) => account.accountStatus !== "REVOKED"),
    [accounts],
  );

  const displayedAccounts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return activeDirectoryAccounts.filter((account) => {
      if (statusFilter !== "ALL" && account.accountStatus !== statusFilter) return false;
      if (!term) return true;
      return account.username.toLowerCase().includes(term) || account.role.toLowerCase().includes(term);
    });
  }, [activeDirectoryAccounts, statusFilter, search]);

  const passwordCheck = useMemo(() => validateStaffPassword(password), [password]);
  const resetPasswordCheck = useMemo(() => validateStaffPassword(resetPassword), [resetPassword]);

  async function executeAccountAction(pending: PendingAccountAction) {
    if (actionBusy) return;
    setActionBusy(true);
    setError("");
    setMessage("");
    setConfirmAction(null);
    try {
      if (pending.action === "remove") {
        const response = await fetch("/api/admin/accounts/remove", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ accountId: pending.account.accountId }),
        });
        let result: { error?: string } = {};
        try {
          result = await response.json() as { error?: string };
        } catch {
          // Safe fallback below.
        }
        if (!response.ok) {
          setError(result.error || "The staff account could not be deleted.");
          return;
        }
        setAccounts((prev) => prev.filter((item) => item.accountId !== pending.account.accountId));
        setMessage(`Account "${pending.account.username}" has been deleted.`);
        await refresh();
      } else {
        await accountAction(pending.action, pending.account.accountId, pending.account.revision, pending.value);
        setMessage(`Account "${pending.account.username}" updated successfully.`);
        await refresh();
      }
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setActionBusy(false);
    }
  }

  async function runDirect(action: "approve" | "activate", account: AdminAccount) {
    if (actionBusy) return;
    setActionBusy(true);
    setError("");
    setMessage("");
    try {
      await accountAction(action, account.accountId, account.revision);
      setMessage(action === "approve"
        ? `Account "${account.username}" approved. Click Activate to grant access.`
        : `Account "${account.username}" activated.`);
      await refresh();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setActionBusy(false);
    }
  }

  function handleGenerateCreatePassword() {
    const generated = generateStaffPassword(14);
    setPassword(generated);
    setConfirmPassword(generated);
    setShowPassword(true);
  }

  function handleGenerateResetPassword() {
    const generated = generateStaffPassword(14);
    setResetPassword(generated);
    setResetConfirmPassword(generated);
    setShowResetPassword(true);
    setResetError("");
  }

  async function createStaffAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createBusy) return;
    setError("");
    setMessage("");

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedUsername = username.trim();
    if (!trimmedEmail || !trimmedUsername) {
      setError("Enter both the staff member's display name and email address.");
      return;
    }
    if (!passwordCheck.valid) {
      setError(passwordCheck.error || "Enter a stronger initial password.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Initial password and confirmation password do not match.");
      return;
    }

    setCreateBusy(true);
    try {
      const response = await fetch("/api/admin/accounts/provision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          username: trimmedUsername,
          role,
          password,
          activateImmediately,
        }),
      });
      let result: {
        error?: string;
        accountStatus?: string;
        email?: string;
        username?: string;
        role?: "ADMIN" | "MANAGER";
        notice?: string | null;
      } = {};
      try {
        result = await response.json() as typeof result;
      } catch {
        // Safe fallback below.
      }
      if (!response.ok) {
        setError(result.error || "The staff account could not be created.");
        return;
      }

      const finalStatus = result.accountStatus || (activateImmediately ? "ACTIVE" : "PENDING");
      setHandoff({
        heading: "Staff account created",
        username: result.username || trimmedUsername,
        email: result.email || trimmedEmail,
        role: result.role || role,
        status: finalStatus,
        password,
      });
      setShowHandoffPassword(false);
      setCopiedHandoff(false);
      setEmail("");
      setUsername("");
      setPassword("");
      setConfirmPassword("");
      setShowPassword(false);
      setShowCreateForm(false);
      setMessage(
        result.notice ||
          (finalStatus === "ACTIVE"
            ? `Account "${trimmedUsername}" is active and ready to sign in immediately.`
            : `Account "${trimmedUsername}" created as PENDING. Approve and activate below when ready.`),
      );
      await refresh();
    } catch {
      setError("The account request could not reach the server. Check your connection and try again.");
    } finally {
      setCreateBusy(false);
    }
  }

  async function submitResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passwordModalAccount || resetBusy) return;
    setResetError("");

    if (!resetPasswordCheck.valid) {
      setResetError(resetPasswordCheck.error || "Enter a stronger password.");
      return;
    }
    if (resetPassword !== resetConfirmPassword) {
      setResetError("New password and confirmation do not match.");
      return;
    }

    setResetBusy(true);
    try {
      const response = await fetch("/api/admin/accounts/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId: passwordModalAccount.accountId,
          password: resetPassword,
        }),
      });
      let result: { error?: string; email?: string | null; username?: string } = {};
      try {
        result = await response.json() as typeof result;
      } catch {
        // Safe fallback below.
      }
      if (!response.ok) {
        setResetError(result.error || "The password could not be updated.");
        return;
      }

      const target = passwordModalAccount;
      setHandoff({
        heading: "Staff password updated",
        username: result.username || target.username,
        email: result.email ?? null,
        role: target.role,
        status: target.accountStatus,
        password: resetPassword,
      });
      setShowHandoffPassword(false);
      setCopiedHandoff(false);
      setPasswordModalAccount(null);
      setResetPassword("");
      setResetConfirmPassword("");
      setShowResetPassword(false);
      setMessage(`Password updated for "${target.username}".`);
    } catch {
      setResetError("Could not reach the server. Try again.");
    } finally {
      setResetBusy(false);
    }
  }

  async function copyHandoffCredentials() {
    if (!handoff) return;
    const loginUrl = `${window.location.origin}/admin/login`;
    const lines = [
      `GraveNav Staff Access (${handoff.role})`,
      `Sign in: ${loginUrl}`,
      `Name: ${handoff.username}`,
      ...(handoff.email ? [`Email: ${handoff.email}`] : []),
      `Password: ${handoff.password}`,
      `Status: ${handoff.status}`,
      "Note: Please change your password after signing in via Account Menu -> Change Password.",
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopiedHandoff(true);
    } catch {
      setError("Could not copy automatically. Reveal and copy the password manually.");
    }
  }

  const pendingCount = activeDirectoryAccounts.filter((a) => a.accountStatus === "PENDING").length;
  const activeCount = activeDirectoryAccounts.filter((a) => a.accountStatus === "ACTIVE").length;
  const suspendedCount = activeDirectoryAccounts.filter((a) => a.accountStatus === "SUSPENDED").length;

  return (
    <AdminPageFrame
      title="Account Management"
      description="Add ADMIN or MANAGER accounts, set passwords, change roles, or delete staff accounts."
      actions={
        <Button
          icon={showCreateForm ? "x" : "plus"}
          onClick={() => setShowCreateForm((v) => !v)}
          variant={showCreateForm ? "secondary" : "primary"}
        >
          {showCreateForm ? "Close form" : "Add staff account"}
        </Button>
      }
    >
      {error ? <DataError message={error} /> : null}
      {message ? <Alert icon="check" title="Account update" variant="success">{message}</Alert> : null}

      {/* Summary Strip */}
      <div className={accountStyles.summaryStrip}>
        <button
          className={`${accountStyles.summaryPill} ${statusFilter === "ALL" ? accountStyles.summaryPillActive : ""}`}
          onClick={() => setStatusFilter("ALL")}
          type="button"
        >
          <span className={accountStyles.summaryPillText}>
            <span>Total staff</span>
            <strong>{activeDirectoryAccounts.length}</strong>
          </span>
          <Icon name="users" size={18} />
        </button>
        <button
          className={`${accountStyles.summaryPill} ${statusFilter === "ACTIVE" ? accountStyles.summaryPillActive : ""}`}
          onClick={() => setStatusFilter("ACTIVE")}
          type="button"
        >
          <span className={accountStyles.summaryPillText}>
            <span>Active</span>
            <strong>{activeCount}</strong>
          </span>
          <Icon name="check" size={18} />
        </button>
        <button
          className={`${accountStyles.summaryPill} ${statusFilter === "PENDING" ? accountStyles.summaryPillActive : ""}`}
          onClick={() => setStatusFilter("PENDING")}
          type="button"
        >
          <span className={accountStyles.summaryPillText}>
            <span>Pending approval</span>
            <strong>{pendingCount}</strong>
          </span>
          <Icon name="clock" size={18} />
        </button>
        <button
          className={`${accountStyles.summaryPill} ${statusFilter === "SUSPENDED" ? accountStyles.summaryPillActive : ""}`}
          onClick={() => setStatusFilter("SUSPENDED")}
          type="button"
        >
          <span className={accountStyles.summaryPillText}>
            <span>Suspended</span>
            <strong>{suspendedCount}</strong>
          </span>
          <Icon name="lock" size={18} />
        </button>
      </div>

      {/* One-Time Credential Handoff Card */}
      {handoff ? (
        <section aria-label="New staff login credentials" className={accountStyles.handoffCard}>
          <div className={accountStyles.handoffTop}>
            <div className={accountStyles.handoffTitleWrap}>
              <Icon className="text-green" name="check" size={20} />
              <strong>{handoff.heading}</strong>
            </div>
            <span className={accountStyles.handoffOnceBadge}>Shown once — copy before closing</span>
          </div>
          <div className={accountStyles.handoffGrid}>
            <div className={accountStyles.handoffItem}>
              <span>Display name</span>
              <strong>{handoff.username}</strong>
            </div>
            {handoff.email ? (
              <div className={accountStyles.handoffItem}>
                <span>Email</span>
                <code>{handoff.email}</code>
              </div>
            ) : null}
            <div className={accountStyles.handoffItem}>
              <span>Role &amp; Status</span>
              <strong>{handoff.role} · {handoff.status}</strong>
            </div>
            <div className={accountStyles.handoffItem}>
              <span>Password</span>
              <code>{showHandoffPassword ? handoff.password : "•".repeat(Math.min(handoff.password.length, 14))}</code>
            </div>
          </div>
          <div className={accountStyles.handoffActions}>
            <div className={accountStyles.handoffActionsLeft}>
              <Button icon="check" onClick={() => void copyHandoffCredentials()} size="sm" variant="primary">
                {copiedHandoff ? "Copied login details!" : "Copy login details"}
              </Button>
              <Button onClick={() => setShowHandoffPassword((v) => !v)} size="sm" variant="secondary">
                {showHandoffPassword ? "Hide password" : "Reveal password"}
              </Button>
              <Button onClick={() => setHandoff(null)} size="sm" variant="quiet">
                Done
              </Button>
            </div>
            <p className={accountStyles.handoffNote}>
              Share privately with the staff member. They can update it anytime via Account Menu → Change Password.
            </p>
          </div>
        </section>
      ) : null}

      {/* Expandable Direct Staff Account Creation Form */}
      {showCreateForm ? (
        <Card className="admin-form-card">
          <CardHeader>
            <CardTitle>Add staff account</CardTitle>
            <Badge variant="success">Set password directly · No email needed</Badge>
          </CardHeader>
          <CardContent>
            <form className="admin-form" onSubmit={createStaffAccount}>
              <div className={accountStyles.createGrid}>
                <Input
                  autoComplete="off"
                  label="Display name / Username"
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="e.g., Maria Santos"
                  required
                  value={username}
                />
                <Input
                  autoComplete="off"
                  label="Email address"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="staff@forestlake.ph"
                  required
                  type="email"
                  value={email}
                />
                <label className="input-field">
                  <span className="input-label">Staff role</span>
                  <select
                    className="input-control"
                    onChange={(event) => setRole(event.target.value as "ADMIN" | "MANAGER")}
                    value={role}
                  >
                    <option value="MANAGER">MANAGER — Records, Photos, Plots &amp; Reports</option>
                    <option value="ADMIN">ADMIN — Full System &amp; Account Administration</option>
                  </select>
                </label>

                <div className={accountStyles.passwordField}>
                  <div className={accountStyles.passwordHeader}>
                    <label className="input-label" htmlFor="new-staff-password" style={{ marginBottom: 0 }}>
                      Initial password
                    </label>
                    <button
                      className={accountStyles.generateBtn}
                      disabled={createBusy}
                      onClick={handleGenerateCreatePassword}
                      type="button"
                    >
                      Generate strong password
                    </button>
                  </div>
                  <div className={accountStyles.passwordInputWrap}>
                    <input
                      autoComplete="new-password"
                      className={`input-control ${accountStyles.passwordInput}`}
                      disabled={createBusy}
                      id="new-staff-password"
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Minimum 8 characters"
                      required
                      type={showPassword ? "text" : "password"}
                      value={password}
                    />
                    <button
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className={accountStyles.eyeToggle}
                      onClick={() => setShowPassword((prev) => !prev)}
                      type="button"
                    >
                      <Icon name="eye" size={17} />
                    </button>
                  </div>
                  <div className={accountStyles.policyRow}>
                    <span className={`${accountStyles.policyChip} ${passwordCheck.checks.minLength ? accountStyles.policyChipMet : ""}`}>
                      8+ chars
                    </span>
                    <span className={`${accountStyles.policyChip} ${passwordCheck.checks.hasLetter ? accountStyles.policyChipMet : ""}`}>
                      Letter
                    </span>
                    <span className={`${accountStyles.policyChip} ${passwordCheck.checks.hasNumber ? accountStyles.policyChipMet : ""}`}>
                      Number
                    </span>
                  </div>
                </div>

                <div className={accountStyles.passwordField}>
                  <label className="input-label" htmlFor="new-staff-password-confirm" style={{ marginBottom: 0 }}>
                    Confirm initial password
                  </label>
                  <input
                    autoComplete="new-password"
                    className={`input-control ${accountStyles.passwordInput}`}
                    disabled={createBusy}
                    id="new-staff-password-confirm"
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Re-enter password"
                    required
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                  />
                  {confirmPassword && confirmPassword !== password ? (
                    <span style={{ color: "var(--admin-danger)", fontSize: "0.72rem", fontWeight: 620 }}>
                      Passwords do not match.
                    </span>
                  ) : null}
                </div>

                <label className={accountStyles.activateToggle}>
                  <input
                    checked={activateImmediately}
                    disabled={createBusy}
                    onChange={(event) => setActivateImmediately(event.target.checked)}
                    type="checkbox"
                  />
                  <span className={accountStyles.activateToggleText}>
                    <strong>Activate account immediately</strong>
                    <span>Staff member can sign in right away at /admin/login without a separate approval step.</span>
                  </span>
                </label>
              </div>

              <div className={accountStyles.formFooter}>
                <p className={accountStyles.formHint}>
                  This account will be ready right away — no email confirmation needed.
                </p>
                <div className={accountStyles.formFooterActions}>
                  <Button disabled={createBusy} onClick={() => setShowCreateForm(false)} type="button" variant="quiet">
                    Cancel
                  </Button>
                  <Button disabled={createBusy} icon="shield" type="submit">
                    {createBusy ? "Creating account…" : "Create staff account"}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {/* Redesigned Staff Accounts Directory */}
      <Card>
        <CardHeader>
          <CardTitle>Staff accounts</CardTitle>
          <Badge variant="info">{displayedAccounts.length} shown · {pendingCount} pending</Badge>
        </CardHeader>
        <CardContent>
          <div className={accountStyles.directoryToolbar}>
            <label className={accountStyles.searchWrap}>
              <span className="sr-only">Search staff accounts</span>
              <span aria-hidden="true" className={accountStyles.searchIcon}>
                <Icon name="search" size={16} />
              </span>
              <input
                className={accountStyles.searchInput}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by username or role…"
                type="search"
                value={search}
              />
            </label>

            <div aria-label="Filter by status" className={accountStyles.filterTabs} role="group">
              {(
                [
                  ["ALL", `All (${activeDirectoryAccounts.length})`],
                  ["ACTIVE", `Active (${activeCount})`],
                  ["PENDING", `Pending (${pendingCount})`],
                  ["SUSPENDED", `Suspended (${suspendedCount})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  aria-pressed={statusFilter === key}
                  className={`${accountStyles.filterTab} ${statusFilter === key ? accountStyles.filterTabActive : ""}`}
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div style={{ display: "grid", gap: 10 }} role="status" aria-label="Loading staff accounts">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} style={{ height: 54, borderRadius: 10 }} />)}
            </div>
          ) : displayedAccounts.length ? (
            <div className={accountStyles.directoryTableWrap}>
              <table className={accountStyles.directoryTable}>
                <caption className="sr-only">Active and manageable staff accounts</caption>
                <thead>
                  <tr>
                    <th scope="col">Staff member</th>
                    <th scope="col">Role</th>
                    <th scope="col">Status</th>
                    <th scope="col">Added</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedAccounts.map((account) => {
                    const isSelf = currentStaff?.accountId === account.accountId;
                    const targetRole = account.role === "ADMIN" ? "MANAGER" : "ADMIN";
                    const menuOpen = openMenuId === account.accountId;
                    return (
                      <tr key={account.accountId}>
                        <td>
                          <div className={accountStyles.memberCell}>
                            <span
                              aria-hidden="true"
                              className={`${accountStyles.memberAvatar} ${account.role === "MANAGER" ? accountStyles.memberAvatarManager : ""}`}
                            >
                              {initialsFor(account.username)}
                            </span>
                            <div className={accountStyles.memberInfo}>
                              <strong>{account.username}</strong>
                              {isSelf ? <span className={accountStyles.youChip}>You</span> : null}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span
                            className={`${accountStyles.rolePill} ${account.role === "ADMIN" ? accountStyles.roleAdmin : accountStyles.roleManager}`}
                          >
                            {account.role}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`${accountStyles.statusPill} ${
                              account.accountStatus === "ACTIVE"
                                ? accountStyles.statusActive
                                : account.accountStatus === "PENDING"
                                  ? accountStyles.statusPending
                                  : accountStyles.statusSuspended
                            }`}
                          >
                            <span aria-hidden="true" className={accountStyles.statusDot} />
                            {account.accountStatus === "ACTIVE"
                              ? "Active"
                              : account.accountStatus === "PENDING"
                                ? "Pending"
                                : "Suspended"}
                          </span>
                        </td>
                        <td className={accountStyles.dateCell}>{formatShortDate(account.createdAt)}</td>
                        <td>
                          <div className={accountStyles.rowActions}>
                            {isSelf ? (
                              <span className={accountStyles.selfMuted}>Current session</span>
                            ) : (
                              <>
                                {account.accountStatus === "PENDING" && !account.approvedAt ? (
                                  <Button
                                    disabled={actionBusy}
                                    onClick={() => void runDirect("approve", account)}
                                    size="sm"
                                    variant="primary"
                                  >
                                    Approve
                                  </Button>
                                ) : null}
                                {account.accountStatus === "PENDING" && account.approvedAt ? (
                                  <Button
                                    disabled={actionBusy}
                                    onClick={() => void runDirect("activate", account)}
                                    size="sm"
                                    variant="primary"
                                  >
                                    Activate
                                  </Button>
                                ) : null}
                                {account.accountStatus === "SUSPENDED" ? (
                                  <Button
                                    disabled={actionBusy}
                                    onClick={() => setConfirmAction({
                                      action: "activate",
                                      account,
                                      title: `Reactivate ${account.username}?`,
                                      description: "Reactivating restores workspace access for this suspended staff account.",
                                      confirmLabel: "Reactivate account",
                                      variant: "primary",
                                    })}
                                    size="sm"
                                    variant="primary"
                                  >
                                    Reactivate
                                  </Button>
                                ) : null}

                                <Button
                                  disabled={actionBusy}
                                  icon="lock"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    setPasswordModalAccount(account);
                                    setResetPassword("");
                                    setResetConfirmPassword("");
                                    setShowResetPassword(false);
                                    setResetError("");
                                  }}
                                  size="sm"
                                  variant="secondary"
                                >
                                  Set password
                                </Button>

                                <div className={accountStyles.menuWrap} data-account-menu>
                                  <button
                                    aria-expanded={menuOpen}
                                    aria-haspopup="menu"
                                    aria-label={`More actions for ${account.username}`}
                                    className={accountStyles.menuTrigger}
                                    disabled={actionBusy}
                                    onClick={() => setOpenMenuId(menuOpen ? null : account.accountId)}
                                    type="button"
                                  >
                                    <Icon name="more" size={16} />
                                  </button>

                                  {menuOpen ? (
                                    <div className={accountStyles.menuPopover} role="menu">
                                      <button
                                        className={accountStyles.menuItem}
                                        onClick={() => {
                                          setOpenMenuId(null);
                                          setConfirmAction({
                                            action: "role",
                                            account,
                                            value: targetRole,
                                            title: `Change ${account.username} to ${targetRole}?`,
                                            description: targetRole === "ADMIN"
                                              ? "Granting ADMIN allows account management, visitor site settings, deletion, and recovery."
                                              : "Switching to MANAGER removes ADMIN-only account, site settings, and deletion privileges.",
                                            confirmLabel: `Make ${targetRole.toLowerCase()}`,
                                            variant: "primary",
                                          });
                                        }}
                                        role="menuitem"
                                        type="button"
                                      >
                                        <Icon name="shield" size={15} />
                                        <span>Change to {targetRole}</span>
                                      </button>

                                      {account.accountStatus === "ACTIVE" ? (
                                        <button
                                          className={accountStyles.menuItem}
                                          onClick={() => {
                                            setOpenMenuId(null);
                                            setConfirmAction({
                                              action: "deactivate",
                                              account,
                                              value: "SUSPENDED",
                                              title: `Suspend ${account.username}?`,
                                              description: "Suspending temporarily blocks workspace sign-in until reactivated.",
                                              confirmLabel: "Suspend access",
                                              variant: "danger",
                                            });
                                          }}
                                          role="menuitem"
                                          type="button"
                                        >
                                          <Icon name="clock" size={15} />
                                          <span>Suspend access</span>
                                        </button>
                                      ) : null}

                                      <div className={accountStyles.menuDivider} />

                                      <button
                                        className={`${accountStyles.menuItem} ${accountStyles.menuItemDanger}`}
                                        onClick={() => {
                                          setOpenMenuId(null);
                                          setConfirmAction({
                                            action: "remove",
                                            account,
                                            title: `Delete ${account.username}?`,
                                            description: "This permanently deletes this staff account so they can no longer sign in or appear in the list.",
                                            confirmLabel: "Delete account",
                                            variant: "danger",
                                          });
                                        }}
                                        role="menuitem"
                                        type="button"
                                      >
                                        <Icon name="trash" size={15} />
                                        <span>Delete account</span>
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              action={statusFilter !== "ALL" || search ? (
                <Button onClick={() => { setStatusFilter("ALL"); setSearch(""); }} variant="secondary">
                  Show all staff
                </Button>
              ) : undefined}
              description={search || statusFilter !== "ALL" ? "No staff accounts match the current search or filter." : "No other staff accounts have been added yet."}
              icon="shield"
              title="No matching accounts"
            />
          )}
        </CardContent>
      </Card>

      {/* Set New Password Modal for Existing Staff Accounts */}
      {passwordModalAccount ? (
        <div
          aria-labelledby="reset-staff-password-title"
          aria-modal="true"
          className={accountStyles.modalBackdrop}
          role="dialog"
        >
          <form className={accountStyles.modalDialog} onSubmit={submitResetPassword}>
            <div className={accountStyles.modalHeader}>
              <h2 id="reset-staff-password-title">Set new password for {passwordModalAccount.username}</h2>
              <p>
                Updates this staff member&apos;s sign-in password immediately with no email needed. Share the new
                password privately.
              </p>
            </div>

            {resetError ? <Alert icon="alert" title="Password not updated" variant="danger">{resetError}</Alert> : null}

            <div className={accountStyles.passwordField}>
              <div className={accountStyles.passwordHeader}>
                <label className="input-label" htmlFor="reset-staff-pw" style={{ marginBottom: 0 }}>
                  New password
                </label>
                <button
                  className={accountStyles.generateBtn}
                  disabled={resetBusy}
                  onClick={handleGenerateResetPassword}
                  type="button"
                >
                  Generate strong password
                </button>
              </div>
              <div className={accountStyles.passwordInputWrap}>
                <input
                  autoComplete="new-password"
                  className={`input-control ${accountStyles.passwordInput}`}
                  disabled={resetBusy}
                  id="reset-staff-pw"
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  required
                  type={showResetPassword ? "text" : "password"}
                  value={resetPassword}
                />
                <button
                  aria-label={showResetPassword ? "Hide password" : "Show password"}
                  className={accountStyles.eyeToggle}
                  onClick={() => setShowResetPassword((v) => !v)}
                  type="button"
                >
                  <Icon name="eye" size={17} />
                </button>
              </div>
              <div className={accountStyles.policyRow}>
                <span className={`${accountStyles.policyChip} ${resetPasswordCheck.checks.minLength ? accountStyles.policyChipMet : ""}`}>
                  8+ chars
                </span>
                <span className={`${accountStyles.policyChip} ${resetPasswordCheck.checks.hasLetter ? accountStyles.policyChipMet : ""}`}>
                  Letter
                </span>
                <span className={`${accountStyles.policyChip} ${resetPasswordCheck.checks.hasNumber ? accountStyles.policyChipMet : ""}`}>
                  Number
                </span>
              </div>
            </div>

            <div className={accountStyles.passwordField}>
              <label className="input-label" htmlFor="reset-staff-pw-confirm" style={{ marginBottom: 0 }}>
                Confirm new password
              </label>
              <input
                autoComplete="new-password"
                className={`input-control ${accountStyles.passwordInput}`}
                disabled={resetBusy}
                id="reset-staff-pw-confirm"
                onChange={(e) => setResetConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                required
                type={showResetPassword ? "text" : "password"}
                value={resetConfirmPassword}
              />
            </div>

            <div className={accountStyles.modalActions}>
              <Button
                disabled={resetBusy}
                onClick={() => setPasswordModalAccount(null)}
                type="button"
                variant="quiet"
              >
                Cancel
              </Button>
              <Button disabled={resetBusy} icon="lock" type="submit">
                {resetBusy ? "Updating…" : "Update password"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      <ConfirmationDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.title || "Confirm account action"}
        description={<p>{confirmAction?.description}</p>}
        confirmLabel={actionBusy ? "Applying…" : confirmAction?.confirmLabel || "Confirm"}
        variant={confirmAction?.variant || "primary"}
        onConfirm={() => { if (confirmAction) void executeAccountAction(confirmAction); }}
        onClose={() => { if (!actionBusy) setConfirmAction(null); }}
      />
    </AdminPageFrame>
  );
}

export function AdminPageFrame({ title, description, actions, breadcrumbs, children }: { title: string; description?: string; actions?: ReactNode; breadcrumbs?: PageBreadcrumb[]; children: ReactNode }) {
  return <div className="admin-page-frame"><PageHeading actions={actions} breadcrumbs={breadcrumbs ?? [{ label: "Dashboard", href: "/admin" }, { label: title }]} description={description} title={title} />{children}</div>;
}

function DataError({ message }: { message: string }) {
  return <Alert icon="alert" title="Action could not be completed" variant="danger">{message}</Alert>;
}

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : "The operation could not be completed.";
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" }).format(date);
}
