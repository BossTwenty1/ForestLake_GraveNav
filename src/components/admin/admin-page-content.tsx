"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { PageHeading, type PageBreadcrumb } from "@/components/ui/page-heading";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { AdminCemeteryMap } from "@/components/admin/admin-cemetery-map";
import { AdminPhotoUploader } from "@/components/admin/admin-photo-uploader";
import { csvCell } from "@/lib/csv";
import { accountAction, getAdminAccounts, getAuditLog, getAuditLogPage } from "@/lib/supabase/admin-data";
import type { AdminAccount, AuditLogEntry } from "@/lib/supabase/types";

export function AdminCemeteryMapPage({ hasPlanningMap = false }: { hasPlanningMap?: boolean }) {
  return <AdminPageFrame title="Cemetery Map" description="Explore the Phase 2 landscape and review CAD planning candidates."><AdminCemeteryMap hasPlanningMap={hasPlanningMap} /></AdminPageFrame>;
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
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [error, setError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  useEffect(() => { getAuditLogPage({ page: 0 }).then((result) => { setEntries(result.items); setHasMore(result.hasMore); }).catch((reason) => setError(errorMessage(reason))); }, []);
  async function loadMore() { if (loadingMore || !hasMore) return; setLoadingMore(true); try { const result = await getAuditLogPage({ page: page + 1 }); setEntries((current) => [...current, ...result.items]); setPage((current) => current + 1); setHasMore(result.hasMore); } catch (reason) { setError(errorMessage(reason)); } finally { setLoadingMore(false); } }
  async function exportLog() { try { const rows = await getAuditLog(true); const csv = ["audit_id,action,table_name,record_id,created_at", ...rows.map((row) => [row.audit_id, row.action, row.table_name, row.record_id, row.created_at].map(csvCell).join(","))].join("\n"); const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "gravenav-local-audit-log.csv"; anchor.click(); URL.revokeObjectURL(url); } catch (reason) { setError(errorMessage(reason)); } }
  return <AdminPageFrame title="Audit Log" description="Review and export audit events through the protected local surfaces." actions={<Button icon="download" onClick={() => void exportLog()}>Export audit log</Button>}>{error ? <DataError message={error} /> : null}<Card><CardHeader><CardTitle>Recent events</CardTitle><Badge variant="info">{entries.length}{hasMore ? "+" : ""} loaded</Badge></CardHeader>{entries.length ? <><Table caption="Audit log"><TableHead><TableRow><TableHeaderCell>Action</TableHeaderCell><TableHeaderCell>Table</TableHeaderCell><TableHeaderCell>Record</TableHeaderCell><TableHeaderCell>Created</TableHeaderCell><TableHeaderCell>Changes</TableHeaderCell></TableRow></TableHead><TableBody>{entries.map((entry) => <TableRow key={entry.audit_id}><TableCell><Badge variant={entry.action === "verify" || entry.action === "approve" ? "success" : "neutral"}>{entry.action}</Badge></TableCell><TableCell>{entry.table_name}</TableCell><TableCell>{entry.record_id}</TableCell><TableCell>{new Date(entry.created_at).toLocaleString()}</TableCell><TableCell><details><summary>Before / after</summary><pre className="audit-values">{JSON.stringify({ before: entry.old_values, after: entry.new_values }, null, 2)}</pre></details></TableCell></TableRow>)}</TableBody></Table>{hasMore ? <CardContent><Button disabled={loadingMore} onClick={() => void loadMore()} variant="secondary">{loadingMore ? "Loading more…" : "Load more events"}</Button></CardContent> : null}</> : <CardContent><EmptyState description="No audit events have been generated locally yet." icon="audit" title="No events" /></CardContent>}</Card></AdminPageFrame>;
}

export function AdminAccountsPage({ pendingOnly = false }: { pendingOnly?: boolean }) {
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"ADMIN" | "MANAGER">("MANAGER");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const displayedAccounts = pendingOnly ? accounts.filter((account) => account.accountStatus === "PENDING") : accounts;
  async function refresh() { try { setAccounts(await getAdminAccounts()); } catch (reason) { setError(errorMessage(reason)); } }
  useEffect(() => { const timer = window.setTimeout(() => { void refresh(); }, 0); return () => window.clearTimeout(timer); }, []);
  async function run(action: "approve" | "activate" | "deactivate" | "role", accountId: string, value?: string) { if (actionBusy) return; setActionBusy(true); try { await accountAction(action, accountId, accounts.find((account) => account.accountId === accountId)!.revision, value); setMessage("Account action completed."); await refresh(); } catch (reason) { setError(errorMessage(reason)); } finally { setActionBusy(false); } }
  async function invite(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (inviteBusy) return; setError(""); setMessage(""); setInviteBusy(true); try { const response = await fetch("/api/admin/accounts/provision", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, username, role }) }); let result: { error?: string } = {}; try { result = await response.json() as { error?: string }; } catch { /* Use a safe generic message for non-JSON responses. */ } if (!response.ok) { setError(result.error || "The protected invitation could not be created."); return; } setEmail(""); setUsername(""); setMessage("Supabase invitation created. The matching account is pending approval."); await refresh(); } catch { setError("The invitation request could not reach the server. Check your connection and try again."); } finally { setInviteBusy(false); } }
  return <AdminPageFrame title={pendingOnly ? "Pending accounts" : "Account Management"} description="ADMIN-only account lifecycle controls backed by protected Auth and database operations." actions={<Link href={pendingOnly ? "/admin/accounts" : "/admin/accounts/pending"}><Button icon={pendingOnly ? "records" : "clock"}>{pendingOnly ? "View all accounts" : "View pending"}</Button></Link>}>{error ? <DataError message={error} /> : null}{message ? <Alert icon="check" title="Account update" variant="success">{message}</Alert> : null}{!pendingOnly ? <Card className="admin-form-card"><CardHeader><CardTitle>Invite or create account</CardTitle><Badge variant="warning">Protected Auth Admin setup</Badge></CardHeader><CardContent><form className="admin-form" onSubmit={invite}><Input label="Email address" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /><Input label="Username" onChange={(event) => setUsername(event.target.value)} required value={username} /><label className="input-field"><span className="input-label">Role</span><select className="input-control" onChange={(event) => setRole(event.target.value as "ADMIN" | "MANAGER")} value={role}><option value="MANAGER">MANAGER</option><option value="ADMIN">ADMIN</option></select></label><Button disabled={inviteBusy} icon="shield" type="submit">{inviteBusy ? "Creating invitation…" : "Invite through Supabase Auth"}</Button><p className="admin-card-muted">Protected Auth Admin provisioning runs only on the server for the active Supabase environment. Private credentials never reach the browser.</p></form></CardContent></Card> : null}<Card><CardHeader><CardTitle>{pendingOnly ? "Pending accounts" : "Accounts"}</CardTitle><Badge variant="info">{displayedAccounts.length} loaded</Badge></CardHeader>{displayedAccounts.length ? <Table caption="Administrator accounts"><TableHead><TableRow><TableHeaderCell>Username</TableHeaderCell><TableHeaderCell>Role</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell><TableHeaderCell>Actions</TableHeaderCell></TableRow></TableHead><TableBody>{displayedAccounts.map((account) => <TableRow key={account.accountId}><TableCell>{account.username}</TableCell><TableCell><Badge variant="info">{account.role}</Badge></TableCell><TableCell><Badge variant={account.accountStatus === "ACTIVE" ? "success" : account.accountStatus === "PENDING" ? "warning" : "danger"}>{account.accountStatus}</Badge></TableCell><TableCell><div className="table-actions">{account.accountStatus === "PENDING" && !account.approvedAt ? <Button size="sm" variant="secondary" disabled={actionBusy} onClick={() => void run("approve", account.accountId)}>Approve</Button> : null}{account.accountStatus === "PENDING" && account.approvedAt ? <Button size="sm" variant="secondary" disabled={actionBusy} onClick={() => void run("activate", account.accountId)}>Activate</Button> : null}{account.accountStatus === "ACTIVE" ? <Button size="sm" variant="danger" disabled={actionBusy} onClick={() => void run("deactivate", account.accountId, "SUSPENDED")}>Suspend</Button> : null}<Button size="sm" variant="quiet" disabled={actionBusy} onClick={() => void run("role", account.accountId, account.role === "ADMIN" ? "MANAGER" : "ADMIN")}>Make {account.role === "ADMIN" ? "manager" : "admin"}</Button></div></TableCell></TableRow>)}</TableBody></Table> : <CardContent><EmptyState description={pendingOnly ? "There are no pending accounts to review." : "The configured Supabase schema contains no administrator rows until the protected bootstrap process is run."} icon="shield" title={pendingOnly ? "No pending accounts" : "No accounts loaded"} /></CardContent>}</Card></AdminPageFrame>;
}

export function AdminSettingsPage() { return <AdminPageFrame title="Settings" description="Supabase environment and security boundaries for the GraveNav workspace."><div className="admin-settings-grid"><SettingCard icon="shield" title="Authentication" description="Supabase Auth owns passwords. The frontend requires an active ADMIN or MANAGER account." /><SettingCard icon="map" title="Map display" description="Existing coordinates are shown; missing coordinates stay nullable and use the layout fallback." /><SettingCard icon="photos" title="Storage" description="Photos require a private bucket and short-lived signed URLs before uploads are enabled." /></div><Alert icon="info" title="Environment configuration" variant="info">The active Supabase target is shown in the administrator header. Local Docker remains available as a documented fallback.</Alert></AdminPageFrame>; }
export function AdminSupportPage() { return <AdminPageFrame title="Support" description="Local help for the administrator workspace."><div className="admin-settings-grid"><SettingCard icon="help" title="Protected access" description="The server checks the current Auth session and database role on every administrator route." /><SettingCard icon="support" title="Need access?" description="An active ADMIN must approve and activate pending staff accounts." /></div></AdminPageFrame>; }

export function AdminPageFrame({ title, description, actions, breadcrumbs, children }: { title: string; description?: string; actions?: ReactNode; breadcrumbs?: PageBreadcrumb[]; children: ReactNode }) { return <div className="admin-page-frame"><PageHeading actions={actions} breadcrumbs={breadcrumbs ?? [{ label: "Dashboard", href: "/admin" }, { label: title }]} description={description} title={title} />{children}</div>; }
function SettingCard({ icon, title, description }: { icon: "shield" | "map" | "photos" | "help" | "support"; title: string; description: string }) { return <Card><CardContent><span className="metric-icon"><Icon name={icon} size={21} /></span><h2 className="admin-card-title">{title}</h2><p className="admin-card-muted">{description}</p></CardContent></Card>; }
function DataError({ message }: { message: string }) { return <Alert icon="alert" title="Supabase data connection unavailable" variant="danger">{message}</Alert>; }
function errorMessage(reason: unknown) { return reason instanceof Error ? reason.message : "The local operation could not be completed."; }
