"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getRecordHistory, saveStaffRecord, type RecordHistory } from "@/lib/supabase/admin-data";
import { AdminPageFrame } from "./admin-page-content";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

const ENTITY_LABELS: Record<string, string> = {
  burial_record: "Burial Record",
  lot: "Cemetery Plot",
  lot_owner: "Plot Owner",
  photo: "Photo",
};

function entityHref(entity: string, recordId: string) {
  if (entity === "burial_record") return `/admin/burial-records/${recordId}`;
  if (entity === "lot_owner") return `/admin/owner-data/${recordId}`;
  if (entity === "lot") return `/admin/plot-management`;
  return null;
}

function sanitizeValues(values: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!values || typeof values !== "object") return values;
  const cleaned: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(values)) {
    if (key === "location_geom" && typeof val === "string" && val.length > 32) {
      cleaned[key] = "(geometry recorded)";
    } else {
      cleaned[key] = val;
    }
  }
  return cleaned;
}

export function RecoveryPage() {
  const [rows, setRows] = useState<RecordHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityFilter, setEntityFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<RecordHistory | null>(null);

  async function load(nextPage = 0) {
    const next = await getRecordHistory(nextPage);
    setRows((current) => (nextPage ? [...current, ...next] : next));
    setHasMore(next.length === 25);
    setPage(nextPage);
  }

  useEffect(() => {
    let active = true;
    void getRecordHistory()
      .then((next) => {
        if (active) {
          setRows(next);
          setHasMore(next.length === 25);
        }
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load recovery history.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  // Track the highest history_id per (entity, record_id) so superseded older edits are clearly disabled.
  const latestHistoryByRecord = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) {
      const key = `${row.entity}:${row.record_id}`;
      const prev = map.get(key);
      if (prev === undefined || row.history_id > prev) {
        map.set(key, row.history_id);
      }
    }
    return map;
  }, [rows]);

  const filteredRows = useMemo(
    () => (entityFilter === "all" ? rows : rows.filter((row) => row.entity === entityFilter)),
    [rows, entityFilter],
  );

  async function recover() {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await saveStaffRecord(
        selected.entity,
        selected.record_id,
        selected.after_revision,
        selected.operation === "delete" ? {} : { history_id: selected.history_id },
        selected.operation === "delete" ? "restore" : "revert",
      );
      setSelected(null);
      setMessage("Recovery saved and recorded in the audit history.");
    } catch (reason) {
      setSelected(null);
      setError(reason instanceof Error ? reason.message : "Recovery failed.");
      setBusy(false);
      return;
    }
    try {
      await load();
    } catch {
      setError("Recovery succeeded, but the list could not refresh automatically. Reload the page.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPageFrame
      title="Recovery"
      description="Administrators can restore removed records or undo the latest unchanged edit. Review the saved values before confirming."
      breadcrumbs={[{ label: "Dashboard", href: "/admin" }, { label: "Recovery" }]}
    >
      {error ? <Alert title="Recovery notice" variant="danger">{error}</Alert> : null}
      {message ? <Alert title="Recovered" variant="success">{message}</Alert> : null}

      <div className="filter-grid" style={{ maxWidth: 320 }}>
        <label className="input-field">
          <span className="input-label">Record type</span>
          <select className="input-control" onChange={(e) => setEntityFilter(e.target.value)} value={entityFilter}>
            <option value="all">All record types</option>
            <option value="burial_record">Burial Records</option>
            <option value="lot">Cemetery Plots</option>
            <option value="lot_owner">Plot Owners</option>
          </select>
        </label>
      </div>

      {loading ? (
        <div style={{ display: "grid", gap: 12 }} role="status" aria-label="Loading recovery history">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} style={{ height: 112, borderRadius: 14 }} />)}
        </div>
      ) : !filteredRows.length ? (
        <Card>
          <CardContent>
            <EmptyState
              icon="audit"
              title="No recoverable changes"
              description={rows.length ? "No recovery entries match the selected record type." : "No recoverable edits or deletions have been recorded yet."}
            />
          </CardContent>
        </Card>
      ) : (
        filteredRows.map((row) => {
          const isLatest = latestHistoryByRecord.get(`${row.entity}:${row.record_id}`) === row.history_id;
          const isRestored = row.operation === "restore";
          const canRecover = isLatest && !isRestored;
          const href = entityHref(row.entity, row.record_id);
          return (
            <Card key={row.history_id}>
              <CardContent>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <h2 style={{ margin: 0, fontSize: "1.02rem" }}>
                      {ENTITY_LABELS[row.entity] || row.entity} #{row.record_id}
                    </h2>
                    <Badge variant={row.operation === "delete" ? "danger" : row.operation === "restore" ? "success" : "info"}>
                      {row.operation}
                    </Badge>
                    {!isLatest ? <Badge variant="neutral">Superseded</Badge> : null}
                  </div>
                  {href && row.operation !== "delete" ? (
                    <Link className="subtle-link" href={href}>Open current record</Link>
                  ) : null}
                </div>
                <p className="input-hint" style={{ margin: "6px 0 10px" }}>
                  Revision {row.after_revision} · {new Date(row.created_at).toLocaleString()}
                </p>
                <details style={{ marginBottom: 12 }}>
                  <summary>Review previous values</summary>
                  <pre className="audit-values">{JSON.stringify(sanitizeValues(row.before_values), null, 2)}</pre>
                </details>
                <Button
                  disabled={busy || !canRecover}
                  onClick={() => setSelected(row)}
                  size="sm"
                  title={!isLatest ? "A newer change exists for this record" : undefined}
                  variant="secondary"
                >
                  {isRestored
                    ? "Already restored"
                    : !isLatest
                      ? "Superseded by newer change"
                      : row.operation === "delete"
                        ? "Restore removed record"
                        : "Undo this change"}
                </Button>
              </CardContent>
            </Card>
          );
        })
      )}

      {!loading && hasMore ? (
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await load(page + 1);
            } catch {
              setError("Could not load more history.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Load more history
        </Button>
      ) : null}

      <ConfirmationDialog
        open={Boolean(selected)}
        title="Apply this recovery?"
        description={
          <p>
            {selected?.entity === "burial_record"
              ? "The burial record must still be at the version shown. Restoring a published burial makes it visible on the Visitor site again."
              : selected?.entity === "lot"
                ? "The cemetery plot must still be at the version shown. Reverted coordinates will require verification."
                : "The record must still be at the version shown before this recovery is applied."}
          </p>
        }
        confirmLabel={busy ? "Recovering…" : "Apply recovery"}
        onConfirm={() => void recover()}
        onClose={() => { if (!busy) setSelected(null); }}
      />
    </AdminPageFrame>
  );
}
