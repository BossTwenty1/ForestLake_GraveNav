"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import {
  getAdminPhotoCounts,
  getAdminPhotoPreview,
  getAdminPhotos,
  getStorageStatus,
  updatePhotoReview,
  type AdminPhotoCounts,
} from "@/lib/supabase/admin-data";
import type { AdminPhoto } from "@/lib/supabase/types";
import { isSyntheticPlot } from "@/lib/synthetic-plots";
import { useStaff } from "./staff-context";
import styles from "./admin-photos.module.css";

function photoTypeBadge(photo: AdminPhoto) {
  if (photo.photoKind === "tribute") {
    return { label: "Visitor gallery", className: styles.typeTribute, icon: "photos" as const };
  }
  if (photo.isVisitorSubmitted) {
    return { label: "Visitor portrait", className: styles.typeVisitorPortrait, icon: "person" as const };
  }
  return { label: "Profile portrait", className: styles.typePortrait, icon: "person" as const };
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function AdminPhotoUploader() {
  const canAdmin = useStaff()?.role === "ADMIN";
  const [counts, setCounts] = useState<AdminPhotoCounts>({ pending: 0, approved: 0, rejected: 0, visitorPending: 0, total: 0 });
  const [photos, setPhotos] = useState<AdminPhoto[]>([]);
  const [photoPage, setPhotoPage] = useState(0);
  const [photoTotal, setPhotoTotal] = useState(0);
  const [status, setStatus] = useState<AdminPhoto["approvalStatus"] | "all">("pending");
  const [kindFilter, setKindFilter] = useState<"all" | "tribute" | "portrait">("all");
  const [photoLoading, setPhotoLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  const [preview, setPreview] = useState<{ photo: AdminPhoto; url: string } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const previewRequest = useRef(0);

  const [configured, setConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const submission = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    getStorageStatus()
      .then((value) => { if (active) setConfigured(value.configured); })
      .catch(() => { if (active) setError("Photo storage could not be checked. Reload to try again."); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      getAdminPhotos({ page: photoPage, pageSize: 20, status, kind: kindFilter }),
      getAdminPhotoCounts().catch(() => null),
    ])
      .then(([result, nextCounts]) => {
        if (!active) return;
        setPhotos(result.items);
        setPhotoTotal(result.total || 0);
        if (nextCounts) setCounts(nextCounts);
      })
      .catch((reason: unknown) => { if (active) setError(errorMessage(reason)); })
      .finally(() => { if (active) setPhotoLoading(false); });
    return () => { active = false; };
  }, [photoPage, status, kindFilter, refresh]);

  function reloadQueue() { setPhotoLoading(true); setRefresh((value) => value + 1); }
  function switchStatus(next: AdminPhoto["approvalStatus"] | "all") {
    if (next === status) return;
    setStatus(next);
    setPhotoPage(0);
    setPhotoLoading(true);
    setPreview(null);
  }
  function switchKind(next: "all" | "tribute" | "portrait") {
    if (next === kindFilter) return;
    setKindFilter(next);
    setPhotoPage(0);
    setPhotoLoading(true);
    setPreview(null);
  }
  function changePhotoPage(page: number) { setPhotoLoading(true); setPhotoPage(page); }

  async function review(photo: AdminPhoto, approvalStatus: AdminPhoto["approvalStatus"]) {
    if (submission.current || !canAdmin) return;
    submission.current = true; setBusy(true); setError(""); setMessage("");
    try {
      await updatePhotoReview(photo.photoId, approvalStatus, photo.revision);
      const isVisitor = Boolean(photo.isVisitorSubmitted || photo.photoKind === "tribute");
      setMessage(
        approvalStatus === "approved"
          ? photo.photoKind === "tribute"
            ? "Visitor gallery photo approved and published."
            : "Memorial portrait approved for public display."
          : isVisitor
            ? "Visitor photo rejected, removed from storage, and upload slot reopened."
            : "Photo rejected and kept private.",
      );
      setPreview(null); previewRequest.current += 1;
      if (photos.length === 1 && photoPage > 0 && status !== "all") setPhotoPage((value) => value - 1);
      reloadQueue();
    } catch (reason) { setError(errorMessage(reason)); }
    finally { submission.current = false; setBusy(false); }
  }

  async function showPreview(photo: AdminPhoto) {
    const request = ++previewRequest.current;
    setPreviewBusy(true); setPreview(null); setError("");
    try {
      const url = await getAdminPhotoPreview(photo.photoId);
      if (request === previewRequest.current) setPreview({ photo, url });
    } catch (reason) { if (request === previewRequest.current) setError(errorMessage(reason)); }
    finally { if (request === previewRequest.current) setPreviewBusy(false); }
  }

  return (
    <div className={styles.workspace}>
      {configured === false ? (
        <Alert title="Photo storage is not configured" variant="warning">
          Configure the private photo bucket before approving or previewing memorial photos.
        </Alert>
      ) : null}
      {error ? <Alert title="Photo action unavailable" variant="danger">{error}</Alert> : null}
      {message ? <div role="status"><Alert title="Photo update" variant="success">{message}</Alert></div> : null}

      <section className={styles.kpiGrid} aria-label="Photo moderation summary">
        <button
          type="button"
          className={styles.kpiCard + (status === "pending" && kindFilter === "all" ? " " + styles.kpiCardActive : "")}
          onClick={() => { switchStatus("pending"); switchKind("all"); }}
        >
          <span className={styles.kpiLabel}>Pending Review</span>
          <strong className={styles.kpiValue}>{counts.pending}</strong>
          <span className={styles.kpiHint}>Awaiting administrator approval</span>
        </button>
        <button
          type="button"
          className={styles.kpiCard + (status === "pending" && kindFilter === "tribute" ? " " + styles.kpiCardActive : "")}
          onClick={() => { setStatus("pending"); setKindFilter("all"); setPhotoPage(0); setPhotoLoading(true); }}
        >
          <span className={styles.kpiLabel}>Visitor Submissions Pending</span>
          <strong className={styles.kpiValue}>{counts.visitorPending}</strong>
          <span className={styles.kpiHint}>Portraits &amp; gallery awaiting review</span>
        </button>
        <button
          type="button"
          className={styles.kpiCard + (status === "approved" ? " " + styles.kpiCardActive : "")}
          onClick={() => { switchStatus("approved"); switchKind("all"); }}
        >
          <span className={styles.kpiLabel}>Published Photos</span>
          <strong className={styles.kpiValue}>{counts.approved}</strong>
          <span className={styles.kpiHint}>Visible on memorial profiles</span>
        </button>
        <button
          type="button"
          className={styles.kpiCard + (status === "rejected" ? " " + styles.kpiCardActive : "")}
          onClick={() => { switchStatus("rejected"); switchKind("all"); }}
        >
          <span className={styles.kpiLabel}>Rejected</span>
          <strong className={styles.kpiValue}>{counts.rejected}</strong>
          <span className={styles.kpiHint}>Kept private or deleted</span>
        </button>
      </section>

      <Card>
        <CardHeader>
          <div className={styles.queueHeader}>
            <CardTitle>Photo Review Queue</CardTitle>
            <div className={styles.queueHeaderActions}>
              <Button variant="secondary" size="sm" disabled={busy || photoLoading} onClick={reloadQueue}>
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className={styles.filterBar}>
            <div className={styles.tabGroup} role="tablist" aria-label="Filter photos by status">
              {([
                { key: "pending", label: "Pending", count: counts.pending },
                { key: "approved", label: "Approved", count: counts.approved },
                { key: "rejected", label: "Rejected", count: counts.rejected },
                { key: "all", label: "All", count: counts.total },
              ] as const).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={status === tab.key}
                  className={styles.tabButton + (status === tab.key ? " " + styles.tabButtonActive : "")}
                  onClick={() => switchStatus(tab.key)}
                >
                  <span>{tab.label}</span>
                  <span className={styles.tabCount}>{tab.count}</span>
                </button>
              ))}
            </div>

            <div className={styles.tabGroup} role="group" aria-label="Filter photos by source">
              {([
                { key: "all", label: "All types" },
                { key: "tribute", label: "Visitor gallery" },
                { key: "portrait", label: "Profile portraits" },
              ] as const).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={kindFilter === item.key}
                  className={styles.tabButton + (kindFilter === item.key ? " " + styles.tabButtonActive : "")}
                  onClick={() => switchKind(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {previewBusy ? <p role="status">Loading private preview…</p> : null}

          {preview ? (
            <div className={styles.previewDrawer}>
              <div className={styles.previewFrame}>
                <Image
                  src={preview.url}
                  alt={`Review image: ${preview.photo.fileName}`}
                  fill
                  unoptimized
                  onError={() => setError("The preview expired or could not be loaded. Click Preview again.")}
                />
              </div>
              <div className={styles.previewMeta}>
                <div>
                  {(() => {
                    const badge = photoTypeBadge(preview.photo);
                    return <span className={styles.typePill + " " + badge.className}>{badge.label}</span>;
                  })()}
                </div>
                <h4>{preview.photo.deceasedName || `Burial Record #${preview.photo.burialId}`}</h4>
                <div className={styles.previewDetails}>
                  {preview.photo.submittedByName ? (
                    <span>
                      <strong>Submitted by:</strong> {preview.photo.submittedByName}
                      {preview.photo.submittedByRelation ? ` (${preview.photo.submittedByRelation})` : ""}
                    </span>
                  ) : null}
                  {preview.photo.submittedByContact ? (
                    <span><strong>Verification contact (private):</strong> {preview.photo.submittedByContact}</span>
                  ) : null}
                  <span><strong>Caption:</strong> {preview.photo.caption || "No caption provided"}</span>
                  <span><strong>File:</strong> {preview.photo.fileName} · {formatShortDate(preview.photo.createdAt)}</span>
                </div>
                <div className={styles.previewActions}>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busy || !canAdmin || preview.photo.approvalStatus === "approved"}
                    onClick={() => void review(preview.photo, "approved")}
                  >
                    Approve &amp; Publish
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy || !canAdmin || preview.photo.approvalStatus === "rejected"}
                    onClick={() => void review(preview.photo, "rejected")}
                  >
                    {preview.photo.isVisitorSubmitted || preview.photo.photoKind === "tribute" ? "Reject & Delete" : "Reject"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => { previewRequest.current += 1; setPreview(null); }}
                  >
                    Close Preview
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {photoLoading ? (
            <div className={styles.skeletonRows} role="status" aria-label="Loading photos">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton className={styles.skeletonRow} key={index} />
              ))}
            </div>
          ) : photos.length ? (
            <>
              <Table caption="Photo review queue">
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Memorial</TableHeaderCell>
                    <TableHeaderCell>Type</TableHeaderCell>
                    <TableHeaderCell>Details &amp; Attribution</TableHeaderCell>
                    <TableHeaderCell>Submitted</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Actions</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {photos.map((photo) => {
                    const badge = photoTypeBadge(photo);
                    const cleanLotCode = photo.lotCode && !isSyntheticPlot(photo.lotCode) ? photo.lotCode : null;
                    const isVisitor = Boolean(photo.isVisitorSubmitted || photo.photoKind === "tribute");
                    return (
                      <TableRow key={photo.photoId}>
                        <TableCell>
                          <Link className={styles.recordLink} href={`/admin/burial-records/${photo.burialId}`}>
                            {photo.deceasedName || `Record #${photo.burialId}`}
                          </Link>
                          <span className={styles.metaSub}>
                            Record #{photo.burialId}{cleanLotCode ? ` · ${cleanLotCode}` : ""}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={styles.typePill + " " + badge.className}>
                            <Icon name={badge.icon} size={13} />
                            {badge.label}
                          </span>
                        </TableCell>
                        <TableCell>
                          {photo.submittedByName ? (
                            <>
                              <strong>{photo.submittedByName}</strong>
                              {photo.submittedByRelation ? ` (${photo.submittedByRelation})` : ""}
                              {photo.submittedByContact ? (
                                <span className={styles.metaSub}>Contact: {photo.submittedByContact}</span>
                              ) : null}
                              <span className={styles.metaSub}>{photo.caption || photo.fileName}</span>
                            </>
                          ) : (
                            <>
                              <span>{photo.caption || "Family portrait"}</span>
                              <span className={styles.metaSub}>{photo.fileName}</span>
                            </>
                          )}
                        </TableCell>
                        <TableCell>{formatShortDate(photo.createdAt)}</TableCell>
                        <TableCell>
                          <Badge variant={photo.approvalStatus === "approved" ? "success" : photo.approvalStatus === "rejected" ? "danger" : "warning"}>
                            {photo.approvalStatus}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className={styles.rowActions}>
                            <Button size="sm" variant="secondary" disabled={previewBusy} onClick={() => void showPreview(photo)}>
                              Preview
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busy || !canAdmin || photo.approvalStatus === "approved"}
                              onClick={() => void review(photo, "approved")}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              disabled={busy || !canAdmin || photo.approvalStatus === "rejected"}
                              onClick={() => void review(photo, "rejected")}
                            >
                              {isVisitor ? "Reject & Delete" : "Reject"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {photoTotal > 20 ? (
                <div className={styles.paginationRow}>
                  <Button variant="secondary" size="sm" disabled={photoLoading || busy || photoPage === 0} onClick={() => changePhotoPage(photoPage - 1)}>
                    Previous
                  </Button>
                  <span>Showing {photoPage * 20 + 1}–{Math.min((photoPage + 1) * 20, photoTotal)} of {photoTotal} photos</span>
                  <Button variant="secondary" size="sm" disabled={photoLoading || busy || (photoPage + 1) * 20 >= photoTotal} onClick={() => changePhotoPage(photoPage + 1)}>
                    Next
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <EmptyState
              icon="photos"
              title={status === "pending" ? "All caught up" : "No photos found"}
              description={
                status === "pending"
                  ? "There are no pending visitor submissions or portraits awaiting review right now."
                  : "No photos match the selected status and type filters."
              }
              action={
                status === "pending" && counts.approved > 0 ? (
                  <Button variant="secondary" size="sm" onClick={() => switchStatus("approved")}>
                    View {counts.approved} published photos
                  </Button>
                ) : undefined
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function errorMessage(reason: unknown) {
  return reason && typeof reason === "object" && "message" in reason
    ? String(reason.message)
    : "The action could not be completed. Try again.";
}
