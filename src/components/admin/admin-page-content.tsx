"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeading, type PageBreadcrumb } from "@/components/ui/page-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { AdminCemeteryMap } from "@/components/admin/admin-cemetery-map";
import { AdminPhotoUploader } from "@/components/admin/admin-photo-uploader";
import { useStaff } from "@/components/admin/staff-context";
import { csvCell } from "@/lib/csv";
import { getAdminAccounts, getAuditLog, getAuditLogPage } from "@/lib/supabase/admin-data";
import type { AuditLogEntry } from "@/lib/supabase/types";

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
  const canAdmin = ["ADMIN", "SUPER_ADMIN"].includes(useStaff()?.role ?? "");
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

export function AdminPageFrame({ title, description, actions, breadcrumbs, children }: { title: string; description?: string; actions?: ReactNode; breadcrumbs?: PageBreadcrumb[]; children: ReactNode }) {
  return <div className="admin-page-frame"><PageHeading actions={actions} breadcrumbs={breadcrumbs ?? [{ label: "Dashboard", href: "/admin" }, { label: title }]} description={description} title={title} />{children}</div>;
}

function DataError({ message }: { message: string }) {
  return <Alert icon="alert" title="Action could not be completed" variant="danger">{message}</Alert>;
}

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : "The operation could not be completed.";
}
