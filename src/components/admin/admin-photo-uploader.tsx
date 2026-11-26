"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import {
  getAdminPhotoCounts,
  getAdminPhotoPreview,
  getAdminPhotoThumbnails,
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

function isVisitorSubmission(photo: AdminPhoto) {
  return Boolean(photo.isVisitorSubmitted || photo.photoKind === "tribute");
}

function isStorageDeletedVisitorPhoto(photo: AdminPhoto) {
  return isVisitorSubmission(photo) && photo.approvalStatus === "rejected";
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function AdminPhotoUploader() {
  const canAdmin = ["ADMIN", "SUPER_ADMIN"].includes(useStaff()?.role ?? "");
  const [counts, setCounts] = useState<AdminPhotoCounts>({ pending: 0, approved: 0, rejected: 0, visitorPending: 0, total: 0 });
  const [photos, setPhotos] = useState<AdminPhoto[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
  const [photoPage, setPhotoPage] = useState(0);
  const [photoTotal, setPhotoTotal] = useState(0);
  const [status, setStatus] = useState<AdminPhoto["approvalStatus"] | "all">(() => {
    if (typeof window === "undefined") return "pending";
    const param = new URLSearchParams(window.location.search).get("status");
    return param === "approved" || param === "rejected" || param === "all" || param === "pending" ? param : "pending";
  });
  const [kindFilter, setKindFilter] = useState<"all" | "tribute" | "portrait">("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | "visitor" | "staff">("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [photoLoading, setPhotoLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  const [preview, setPreview] = useState<{ photo: AdminPhoto; url: string } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const previewRequest = useRef(0);

  const [rejectTarget, setRejectTarget] = useState<AdminPhoto | null>(null);

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
    const timer = window.setTimeout(() => {
      const normalized = searchInput.trim();
      if (normalized !== searchQuery) {
        setSearchQuery(normalized);
        setPhotoPage(0);
        setPhotoLoading(true);
        setPreview(null);
      }
    }, 260);
    return () => window.clearTimeout(timer);
  }, [searchInput, searchQuery]);

  useEffect(() => {
    let active = true;
    Promise.all([
      getAdminPhotos({
        page: photoPage,
        pageSize: 20,
        status,
        kind: kindFilter,
        source: sourceFilter,
        query: searchQuery,
      }),
      getAdminPhotoCounts().catch(() => null),
    ])
      .then(([result, nextCounts]) => {
        if (!active) return;
        setPhotos(result.items);
        setPhotoTotal(result.total || 0);
        if (nextCounts) setCounts(nextCounts);

        const activePhotoIds = result.items
          .filter((photo) => !isStorageDeletedVisitorPhoto(photo))
          .map((photo) => photo.photoId);
        if (activePhotoIds.length) {
          getAdminPhotoThumbnails(activePhotoIds)
            .then((nextThumbs) => {
              if (active) setThumbnails(nextThumbs);
            })
            .catch(() => {});
        } else {
          setThumbnails({});
        }
      })
      .catch((reason: unknown) => { if (active) setError(errorMessage(reason)); })
      .finally(() => { if (active) setPhotoLoading(false); });
    return () => { active = false; };
  }, [photoPage, status, kindFilter, sourceFilter, searchQuery, refresh]);

  function reloadQueue() {
    setError("");
    setPhotoLoading(true);
    setRefresh((value) => value + 1);
  }

  function applyFilters(next: {
    status?: AdminPhoto["approvalStatus"] | "all";
    kind?: "all" | "tribute" | "portrait";
    source?: "all" | "visitor" | "staff";
  }) {
    const nextStatus = next.status ?? status;
    const nextKind = next.kind ?? kindFilter;
    const nextSource = next.source ?? sourceFilter;
    const changed = nextStatus !== status || nextKind !== kindFilter || nextSource !== sourceFilter || photoPage !== 0;
    if (!changed) {
      reloadQueue();
      return;
    }
    setStatus(nextStatus);
    setKindFilter(nextKind);
    setSourceFilter(nextSource);
    setPhotoPage(0);
    setPhotoLoading(true);
    setPreview(null);
  }

  function changePhotoPage(page: number) {
    if (page === photoPage) return;
    setPhotoLoading(true);
    setPhotoPage(page);
    setPreview(null);
  }

  function requestReject(photo: AdminPhoto) {
    if (!canAdmin || busy) return;
    if (isVisitorSubmission(photo)) {
      setRejectTarget(photo);
      return;
    }
    void review(photo, "rejected");
  }

  async function review(photo: AdminPhoto, approvalStatus: AdminPhoto["approvalStatus"]) {
    if (submission.current || !canAdmin) return;
    submission.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    setRejectTarget(null);
    try {
      const outcome = await updatePhotoReview(photo.photoId, approvalStatus, photo.revision);
      const isVisitor = isVisitorSubmission(photo);
      setMessage(
        approvalStatus === "approved"
          ? photo.photoKind === "tribute"
            ? "Visitor gallery photo approved and published."
            : "Memorial portrait approved for public display."
          : isVisitor
            ? outcome.storageDeleted
              ? "Visitor photo rejected, removed from storage, and upload slot reopened."
              : "Visitor photo rejected and upload slot reopened. Storage cleanup could not be confirmed."
            : "Photo rejected and kept private.",
      );
      setPreview(null);
      previewRequest.current += 1;
      if (photos.length === 1 && photoPage > 0 && status !== "all") {
        setPhotoPage((value) => value - 1);
      }
      reloadQueue();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      submission.current = false;
      setBusy(false);
    }
  }

  async function showPreview(photo: AdminPhoto) {
    if (isStorageDeletedVisitorPhoto(photo)) return;
    const cachedUrl = thumbnails[photo.photoId];
    if (cachedUrl) {
      setError("");
      setPreview({ photo, url: cachedUrl });
      return;
    }
    const request = ++previewRequest.current;
    setPreviewBusy(true);
    setPreview(null);
    setError("");
    try {
      const url = await getAdminPhotoPreview(photo.photoId);
      if (request === previewRequest.current) setPreview({ photo, url });
    } catch (reason) {
      if (request === previewRequest.current) setError(errorMessage(reason));
    } finally {
      if (request === previewRequest.current) setPreviewBusy(false);
    }
  }

  return (
    <div className={styles.workspace}>
      {configured === false ? (
        <Alert title="Photo storage is not configured" variant="warning">
          Configure the private photo bucket before approving or previewing memorial photos.
        </Alert>
      ) : null}
      {!canAdmin ? (
        <Alert title="Administrator approval required" variant="info">
          You can view photo status in read-only mode. Only an active ADMIN account can approve or reject photos and view private submitter verification contacts.
        </Alert>
      ) : null}
      {error ? <Alert title="Photo action unavailable" variant="danger">{error}</Alert> : null}
      {message ? <div role="status"><Alert title="Photo update" variant="success">{message}</Alert></div> : null}

      <section className={styles.kpiGrid} aria-label="Photo moderation summary">
        <button
          type="button"
          className={styles.kpiCard + (status === "pending" && sourceFilter === "all" && kindFilter === "all" ? " " + styles.kpiCardActive : "")}
          onClick={() => applyFilters({ status: "pending", kind: "all", source: "all" })}
        >
          <span className={styles.kpiLabel}>Pending Review</span>
          <strong className={styles.kpiValue}>{counts.pending}</strong>
          <span className={styles.kpiHint}>Awaiting administrator approval</span>
        </button>
        <button
          type="button"
          className={styles.kpiCard + (status === "pending" && sourceFilter === "visitor" ? " " + styles.kpiCardActive : "")}
          onClick={() => applyFilters({ status: "pending", kind: "all", source: "visitor" })}
        >
          <span className={styles.kpiLabel}>Visitor Submissions Pending</span>
          <strong className={styles.kpiValue}>{counts.visitorPending}</strong>
          <span className={styles.kpiHint}>Portraits &amp; gallery awaiting review</span>
        </button>
        <button
          type="button"
          className={styles.kpiCard + (status === "approved" && sourceFilter === "all" ? " " + styles.kpiCardActive : "")}
          onClick={() => applyFilters({ status: "approved", kind: "all", source: "all" })}
        >
          <span className={styles.kpiLabel}>Published Photos</span>
          <strong className={styles.kpiValue}>{counts.approved}</strong>
          <span className={styles.kpiHint}>Visible on memorial profiles</span>
        </button>
        <button
          type="button"
          className={styles.kpiCard + (status === "rejected" && sourceFilter === "all" ? " " + styles.kpiCardActive : "")}
          onClick={() => applyFilters({ status: "rejected", kind: "all", source: "all" })}
        >
          <span className={styles.kpiLabel}>Rejected</span>
          <strong className={styles.kpiValue}>{counts.rejected}</strong>
          <span className={styles.kpiHint}>Kept private or removed</span>
        </button>
      </section>

      <Card>
        <CardHeader>
          <div className={styles.queueHeader}>
            <CardTitle>Photo Review Queue</CardTitle>
            <div className={styles.queueHeaderActions}>
              <div className={styles.searchBox}>
                <Input
                  aria-label="Search photos by memorial, ID, submitter, or caption"
                  icon="search"
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search memorial, submitter, or ID…"
                  type="search"
                  value={searchInput}
                />
              </div>
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
                  onClick={() => applyFilters({ status: tab.key })}
                >
                  <span>{tab.label}</span>
                  <span className={styles.tabCount}>{tab.count}</span>
                </button>
              ))}
            </div>

            <div className={styles.secondaryFilters}>
              <div className={styles.tabGroup} role="group" aria-label="Filter photos by source">
                {([
                  { key: "all", label: "All sources" },
                  { key: "visitor", label: "Visitor" },
                  { key: "staff", label: "Staff" },
                ] as const).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    aria-pressed={sourceFilter === item.key}
                    className={styles.tabButton + (sourceFilter === item.key ? " " + styles.tabButtonActive : "")}
                    onClick={() => applyFilters({ source: item.key })}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className={styles.tabGroup} role="group" aria-label="Filter photos by type">
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
                    onClick={() => applyFilters({ kind: item.key })}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
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
                  {preview.photo.lotCode && !isSyntheticPlot(preview.photo.lotCode) ? (
                    <span><strong>Plot reference:</strong> {preview.photo.lotCode}</span>
                  ) : null}
                  {preview.photo.submittedByName ? (
                    <span>
                      <strong>Submitted by:</strong> {preview.photo.submittedByName}
                      {preview.photo.submittedByRelation ? ` (${preview.photo.submittedByRelation})` : ""}
                    </span>
                  ) : null}
                  {canAdmin && preview.photo.submittedByContact ? (
                    <span><strong>Verification contact (private):</strong> {preview.photo.submittedByContact}</span>
                  ) : null}
                  <span><strong>Caption:</strong> {preview.photo.caption || "No caption provided"}</span>
                  <span><strong>File:</strong> {preview.photo.fileName} · {formatShortDate(preview.photo.createdAt)}</span>
                </div>
                <div className={styles.previewActions}>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busy || !canAdmin || preview.photo.approvalStatus === "approved" || isStorageDeletedVisitorPhoto(preview.photo)}
                    onClick={() => void review(preview.photo, "approved")}
                  >
                    Approve &amp; Publish
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy || !canAdmin || preview.photo.approvalStatus === "rejected"}
                    onClick={() => requestReject(preview.photo)}
                  >
                    {isVisitorSubmission(preview.photo) ? "Reject & Delete" : "Reject"}
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
                    <TableHeaderCell>Photo &amp; Memorial</TableHeaderCell>
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
                    const isVisitor = isVisitorSubmission(photo);
                    const deletedVisitor = isStorageDeletedVisitorPhoto(photo);
                    const thumbUrl = thumbnails[photo.photoId];
                    return (
                      <TableRow key={photo.photoId}>
                        <TableCell>
                          <div className={styles.memorialCell}>
                            <button
                              type="button"
                              className={styles.thumbButton}
                              disabled={deletedVisitor || previewBusy}
                              onClick={() => void showPreview(photo)}
                              aria-label={deletedVisitor ? "Image removed from storage" : `Preview ${photo.fileName}`}
                            >
                              {deletedVisitor ? (
                                <span className={styles.thumbPlaceholder} title="Removed from storage">
                                  <Icon name="close" size={16} />
                                </span>
                              ) : thumbUrl ? (
                                <Image src={thumbUrl} alt="" fill sizes="48px" unoptimized />
                              ) : (
                                <span className={styles.thumbPlaceholder}>
                                  <Icon name="photos" size={16} />
                                </span>
                              )}
                            </button>
                            <div>
                              <Link className={styles.recordLink} href={`/admin/burial-records/${photo.burialId}`}>
                                {photo.deceasedName || `Record #${photo.burialId}`}
                              </Link>
                              <span className={styles.metaSub}>
                                Record #{photo.burialId}{cleanLotCode ? ` · ${cleanLotCode}` : ""}
                              </span>
                            </div>
                          </div>
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
                              {canAdmin && photo.submittedByContact ? (
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
                            {deletedVisitor ? "rejected · deleted" : photo.approvalStatus}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className={styles.rowActions}>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={previewBusy || deletedVisitor}
                              title={deletedVisitor ? "File was permanently removed from storage" : undefined}
                              onClick={() => void showPreview(photo)}
                            >
                              Preview
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busy || !canAdmin || photo.approvalStatus === "approved" || deletedVisitor}
                              title={deletedVisitor ? "Rejected visitor photos are deleted from storage and cannot be re-approved" : undefined}
                              onClick={() => void review(photo, "approved")}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              disabled={busy || !canAdmin || photo.approvalStatus === "rejected"}
                              onClick={() => requestReject(photo)}
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
              title={status === "pending" && !searchQuery ? "All caught up" : "No photos found"}
              description={
                searchQuery
                  ? "No photos matched your search query and active filters."
                  : status === "pending"
                    ? "There are no pending visitor submissions or portraits awaiting review right now."
                    : "No photos match the selected status, source, and type filters."
              }
              action={
                status === "pending" && !searchQuery && counts.approved > 0 ? (
                  <Button variant="secondary" size="sm" onClick={() => applyFilters({ status: "approved", source: "all", kind: "all" })}>
                    View {counts.approved} published photos
                  </Button>
                ) : searchQuery || sourceFilter !== "all" || kindFilter !== "all" ? (
                  <Button variant="secondary" size="sm" onClick={() => { setSearchInput(""); setSearchQuery(""); applyFilters({ status: "all", source: "all", kind: "all" }); }}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          )}
        </CardContent>
      </Card>

      <ConfirmationDialog
        open={Boolean(rejectTarget)}
        title="Reject and permanently delete visitor photo?"
        description={
          rejectTarget ? (
            <>
              Rejecting <strong>{rejectTarget.fileName}</strong> for{" "}
              <strong>{rejectTarget.deceasedName || `Record #${rejectTarget.burialId}`}</strong>{" "}
              permanently deletes the uploaded image from storage and reopens the visitor upload slot. This cannot be undone.
            </>
          ) : null
        }
        confirmLabel="Reject & Delete"
        variant="danger"
        onConfirm={() => { if (rejectTarget) void review(rejectTarget, "rejected"); }}
        onClose={() => setRejectTarget(null)}
      />
    </div>
  );
}

function errorMessage(reason: unknown) {
  return reason && typeof reason === "object" && "message" in reason
    ? String(reason.message)
    : "The action could not be completed. Try again.";
}
