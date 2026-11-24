"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeading, type PageBreadcrumb } from "@/components/ui/page-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { AdminCemeteryMap } from "@/components/admin/admin-cemetery-map";
import { AdminPhotoUploader } from "@/components/admin/admin-photo-uploader";
import { useStaff } from "@/components/admin/staff-context";
import { csvCell } from "@/lib/csv";
import { accountAction, getAdminAccounts, getAuditLog, getAuditLogPage } from "@/lib/supabase/admin-data";
import type { AdminAccount, AuditLogEntry } from "@/lib/supabase/types";

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
  action: "approve" | "activate" | "deactivate" | "role";
  account: AdminAccount;
  value?: string;
  title: string;
  description: string;
  confirmLabel: string;
  variant: "primary" | "danger";
};

export function AdminAccountsPage({ pendingOnly = false }: { pendingOnly?: boolean }) {
  const currentStaff = useStaff();
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"ALL" | AdminAccount["accountStatus"]>(pendingOnly ? "PENDING" : "ALL");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"ADMIN" | "MANAGER">("MANAGER");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<PendingAccountAction | null>(null);

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

  const displayedAccounts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return accounts.filter((account) => {
      if (statusFilter !== "ALL" && account.accountStatus !== statusFilter) return false;
      if (!term) return true;
      return account.username.toLowerCase().includes(term) || account.role.toLowerCase().includes(term);
    });
  }, [accounts, statusFilter, search]);

  async function executeAccountAction(pending: PendingAccountAction) {
    if (actionBusy) return;
    setActionBusy(true);
    setError("");
    setMessage("");
    setConfirmAction(null);
    try {
      await accountAction(pending.action, pending.account.accountId, pending.account.revision, pending.value);
      setMessage(`Account "${pending.account.username}" updated successfully.`);
      await refresh();
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

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inviteBusy) return;
    setError("");
    setMessage("");
    setInviteBusy(true);
    try {
      const response = await fetch("/api/admin/accounts/provision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, username, role }),
      });
      let result: { error?: string } = {};
      try {
        result = await response.json() as { error?: string };
      } catch {
        // Safe fallback below.
      }
      if (!response.ok) {
        setError(result.error || "The protected invitation could not be created.");
        return;
      }
      setEmail("");
      setUsername("");
      setMessage("Invitation sent. Approve and activate the account below once verified.");
      await refresh();
    } catch {
      setError("The invitation request could not reach the server. Check your connection and try again.");
    } finally {
      setInviteBusy(false);
    }
  }

  const pendingCount = accounts.filter((a) => a.accountStatus === "PENDING").length;

  return (
    <AdminPageFrame
      title="Account Management"
      description="Invite staff accounts, approve pending users, manage roles, and suspend or revoke access."
    >
      {error ? <DataError message={error} /> : null}
      {message ? <Alert icon="check" title="Account update" variant="success">{message}</Alert> : null}

      <Card className="admin-form-card">
        <CardHeader>
          <CardTitle>Invite staff account</CardTitle>
          <Badge variant="info">Protected Auth Admin setup</Badge>
        </CardHeader>
        <CardContent>
          <form className="admin-form" onSubmit={invite}>
            <div className="filter-grid">
              <Input label="Email address" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
              <Input label="Username" onChange={(event) => setUsername(event.target.value)} required value={username} />
              <label className="input-field">
                <span className="input-label">Role</span>
                <select className="input-control" onChange={(event) => setRole(event.target.value as "ADMIN" | "MANAGER")} value={role}>
                  <option value="MANAGER">MANAGER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </label>
            </div>
            <Button disabled={inviteBusy} icon="shield" type="submit">
              {inviteBusy ? "Creating invitation…" : "Send staff invitation"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Staff accounts</CardTitle>
          <Badge variant="info">{displayedAccounts.length} shown · {pendingCount} pending</Badge>
        </CardHeader>
        <CardContent>
          <div className="filter-grid" style={{ marginBottom: 14 }}>
            <Input
              aria-label="Search accounts"
              icon="search"
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search username or role…"
              type="search"
              value={search}
            />
            <label className="input-field">
              <span className="input-label">Account status</span>
              <select
                className="input-control"
                onChange={(e) => setStatusFilter(e.target.value as "ALL" | AdminAccount["accountStatus"])}
                value={statusFilter}
              >
                <option value="ALL">All statuses ({accounts.length})</option>
                <option value="PENDING">Pending ({pendingCount})</option>
                <option value="ACTIVE">Active ({accounts.filter((a) => a.accountStatus === "ACTIVE").length})</option>
                <option value="SUSPENDED">Suspended ({accounts.filter((a) => a.accountStatus === "SUSPENDED").length})</option>
                <option value="REVOKED">Revoked ({accounts.filter((a) => a.accountStatus === "REVOKED").length})</option>
              </select>
            </label>
          </div>

          {loading ? (
            <div style={{ display: "grid", gap: 10 }} role="status" aria-label="Loading staff accounts">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} style={{ height: 48, borderRadius: 8 }} />)}
            </div>
          ) : displayedAccounts.length ? (
            <Table caption="Administrator accounts">
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Username</TableHeaderCell>
                  <TableHeaderCell>Role</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Created</TableHeaderCell>
                  <TableHeaderCell>Actions</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {displayedAccounts.map((account) => {
                  const isSelf = currentStaff?.accountId === account.accountId;
                  const isRevoked = account.accountStatus === "REVOKED";
                  const targetRole = account.role === "ADMIN" ? "MANAGER" : "ADMIN";
                  return (
                    <TableRow key={account.accountId}>
                      <TableCell>
                        <strong>{account.username}</strong>
                        {isSelf ? <span style={{ marginLeft: 8 }}><Badge variant="neutral">You</Badge></span> : null}
                      </TableCell>
                      <TableCell><Badge variant="info">{account.role}</Badge></TableCell>
                      <TableCell>
                        <Badge variant={account.accountStatus === "ACTIVE" ? "success" : account.accountStatus === "PENDING" ? "warning" : "danger"}>
                          {account.accountStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatShortDate(account.createdAt)}</TableCell>
                      <TableCell>
                        <div className="table-actions">
                          {account.accountStatus === "PENDING" && !account.approvedAt ? (
                            <Button size="sm" variant="secondary" disabled={actionBusy} onClick={() => void runDirect("approve", account)}>
                              Approve
                            </Button>
                          ) : null}
                          {account.accountStatus === "PENDING" && account.approvedAt ? (
                            <Button size="sm" variant="primary" disabled={actionBusy} onClick={() => void runDirect("activate", account)}>
                              Activate
                            </Button>
                          ) : null}
                          {account.accountStatus === "SUSPENDED" && !isSelf ? (
                            <Button
                              size="sm"
                              variant="primary"
                              disabled={actionBusy}
                              onClick={() => setConfirmAction({
                                action: "activate",
                                account,
                                title: `Reactivate ${account.username}?`,
                                description: "Reactivating restores workspace access for this suspended staff account.",
                                confirmLabel: "Reactivate account",
                                variant: "primary",
                              })}
                            >
                              Reactivate
                            </Button>
                          ) : null}
                          {account.accountStatus === "ACTIVE" && !isSelf ? (
                            <Button
                              size="sm"
                              variant="danger"
                              disabled={actionBusy}
                              onClick={() => setConfirmAction({
                                action: "deactivate",
                                account,
                                value: "SUSPENDED",
                                title: `Suspend ${account.username}?`,
                                description: "Suspending immediately blocks workspace access for this staff account.",
                                confirmLabel: "Suspend account",
                                variant: "danger",
                              })}
                            >
                              Suspend
                            </Button>
                          ) : null}
                          {!isRevoked && !isSelf ? (
                            <Button
                              size="sm"
                              variant="quiet"
                              disabled={actionBusy}
                              onClick={() => setConfirmAction({
                                action: "deactivate",
                                account,
                                value: "REVOKED",
                                title: `Permanently revoke ${account.username}?`,
                                description: "Revoking permanently terminates this staff account's access. This cannot be undone.",
                                confirmLabel: "Revoke permanently",
                                variant: "danger",
                              })}
                            >
                              Revoke
                            </Button>
                          ) : null}
                          {!isRevoked && !isSelf ? (
                            <Button
                              size="sm"
                              variant="quiet"
                              disabled={actionBusy}
                              onClick={() => setConfirmAction({
                                action: "role",
                                account,
                                value: targetRole,
                                title: `Change ${account.username} to ${targetRole}?`,
                                description: targetRole === "ADMIN"
                                  ? "Granting ADMIN allows photo moderation, account provisioning, deletion, and recovery."
                                  : "Switching to MANAGER removes ADMIN-only account, deletion, and photo approval privileges.",
                                confirmLabel: `Make ${targetRole.toLowerCase()}`,
                                variant: "primary",
                              })}
                            >
                              Make {targetRole.toLowerCase()}
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              description="No staff accounts match the active filter."
              icon="shield"
              title="No matching accounts"
            />
          )}
        </CardContent>
      </Card>

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
