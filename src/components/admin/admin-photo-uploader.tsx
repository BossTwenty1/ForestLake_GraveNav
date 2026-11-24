"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import {
  getAdminPhotoCounts,
  getAdminPhotoPreview,
  getAdminPhotos,
  getStorageStatus,
  searchStaffBurials,
  updatePhotoReview,
  uploadBurialPhoto,
  type AdminPhotoCounts,
  type StaffBurialOption,
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
  const [uploadOpen, setUploadOpen] = useState(false);
  const [records, setRecords] = useState<StaffBurialOption[]>([]);
  const [recordQuery, setRecordQuery] = useState("");
  const [recordPage, setRecordPage] = useState(1);
  const [recordTotal, setRecordTotal] = useState(0);
  const [recordLoading, setRecordLoading] = useState(false);
  const [selected, setSelected] = useState<StaffBurialOption | null>(null);

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
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [capturedAt, setCapturedAt] = useState("");
  const [busy, setBusy] = useState(false);
  const submission = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const localPreviewUrl = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);
  useEffect(() => {
    if (!localPreviewUrl) return;
    return () => URL.revokeObjectURL(localPreviewUrl);
  }, [localPreviewUrl]);

  useEffect(() => {
    let active = true;
    getStorageStatus()
      .then((value) => { if (active) setConfigured(value.configured); })
      .catch(() => { if (active) setError("Photo storage could not be checked. Reload to try again."); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!uploadOpen) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setRecordLoading(true);
      searchStaffBurials(recordQuery, recordPage)
        .then((result) => {
          if (active) { setRecords(result.items); setRecordTotal(result.total); }
        })
        .catch((reason: unknown) => { if (active) setError(errorMessage(reason)); })
        .finally(() => { if (active) setRecordLoading(false); });
    }, 200);
    return () => { active = false; window.clearTimeout(timer); };
  }, [uploadOpen, recordQuery, recordPage]);

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
  function changeRecordPage(page: number) { setRecordPage(page); }
  function changePhotoPage(page: number) { setPhotoLoading(true); setPhotoPage(page); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submission.current || !selected || !file) return;
    submission.current = true; setBusy(true); setError(""); setMessage("");
    try {
      await uploadBurialPhoto({ burialId: selected.burial_id, file, caption, capturedAt });
      setFile(null); setCaption(""); setCapturedAt("");
      if (fileInput.current) fileInput.current.value = "";
      setUploadOpen(false);
      setMessage(`Photo uploaded for ${selected.display_name}. It remains private until an administrator approves it.`);
      setStatus("pending"); setKindFilter("all"); setPhotoPage(0); reloadQueue();
    } catch (reason) { setError(errorMessage(reason)); }
    finally { submission.current = false; setBusy(false); }
  }

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
          Configure the private photo bucket before uploading or approving memorial photos.
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

      {uploadOpen ? (
        <Card>
          <CardHeader>
            <div className={styles.queueHeader}>
              <CardTitle>Upload Memorial Portrait</CardTitle>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => setUploadOpen(false)}>Close</Button>
            </div>
          </CardHeader>
          <CardContent>
            <form className="admin-form" onSubmit={(event) => void submit(event)}>
              <div className={styles.uploadGrid}>
                <div className={styles.uploadColumn}>
                  <Input
                    id="photo-record-search"
                    label="Find a burial record"
                    value={recordQuery}
                    maxLength={160}
                    placeholder="Search deceased name or plot code…"
                    onChange={(event) => { setRecordQuery(event.target.value); setRecordPage(1); }}
                  />
                  <div aria-busy={recordLoading}>
                    <label className="input-field" htmlFor="photo-burial">
                      <span className="input-label">Matching records</span>
                      <select
                        className="input-control"
                        disabled={recordLoading || busy}
                        id="photo-burial"
                        value={selected ? String(selected.burial_id) : ""}
                        onChange={(event) => setSelected(records.find((record) => String(record.burial_id) === event.target.value) || null)}
                      >
                        <option value="">{recordLoading ? "Searching…" : records.length ? "Select a burial record" : "No matching records"}</option>
                        {selected && !records.some((record) => record.burial_id === selected.burial_id) ? (
                          <option value={selected.burial_id}>{selected.display_name} — {selected.lot_code} (selected)</option>
                        ) : null}
                        {records.map((record) => (
                          <option key={record.burial_id} value={record.burial_id}>
                            {record.display_name} — {record.area_name} · {record.lot_code}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className={styles.recordPager}>
                      <Button type="button" size="sm" variant="secondary" disabled={recordLoading || recordPage <= 1} onClick={() => changeRecordPage(recordPage - 1)}>Previous</Button>
                      <span>{recordTotal} records · page {recordPage}</span>
                      <Button type="button" size="sm" variant="secondary" disabled={recordLoading || recordPage * 20 >= recordTotal} onClick={() => changeRecordPage(recordPage + 1)}>Next</Button>
                    </div>
                  </div>
                  {selected ? (
                    <p className={styles.selectedNotice}>
                      Selected: <strong>{selected.display_name}</strong> · {selected.area_name} · {selected.lot_code}
                    </p>
                  ) : null}
                </div>

                <div className={styles.uploadColumn}>
                  <Input
                    ref={fileInput}
                    accept="image/jpeg,image/png,image/webp"
                    disabled={!configured || busy}
                    id="photo-file"
                    label="Image file"
                    onChange={(event) => setFile(event.target.files?.[0] || null)}
                    type="file"
                    hint="JPG, PNG, or WebP; maximum 10 MB. Uploaded portraits stay private until approved."
                  />
                  {localPreviewUrl && file ? (
                    <div className={styles.localPreview}>
                      <div className={styles.localPreviewThumb}>
                        <Image src={localPreviewUrl} alt="Selected upload preview" width={68} height={68} unoptimized />
                      </div>
                      <div>
                        <strong>{file.name}</strong>
                        <span className={styles.metaSub}>{(file.size / 1024).toFixed(0)} KB · Ready to upload</span>
                      </div>
                    </div>
                  ) : null}
                  <div className="filter-grid">
                    <Input disabled={busy} id="photo-caption" label="Caption (optional)" maxLength={2000} onChange={(event) => setCaption(event.target.value)} value={caption} placeholder="e.g., Family-provided portrait" />
                    <Input disabled={busy} id="photo-captured-at" label="Captured date (optional)" onChange={(event) => setCapturedAt(event.target.value)} type="date" value={capturedAt} />
                  </div>
                </div>
              </div>

              <div className={styles.uploadFooter}>
                <Button type="button" variant="secondary" disabled={busy} onClick={() => setUploadOpen(false)}>Cancel</Button>
                <Button disabled={!configured || busy || !selected || !file} icon="upload" type="submit">
                  {busy ? "Uploading…" : "Upload for review"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className={styles.queueHeader}>
            <CardTitle>Photo Review Queue</CardTitle>
            <div className={styles.queueHeaderActions}>
              <Button variant="secondary" size="sm" disabled={busy || photoLoading} onClick={reloadQueue}>
                Refresh
              </Button>
              <Button
                variant={uploadOpen ? "secondary" : "primary"}
                size="sm"
                icon="upload"
                disabled={!configured}
                onClick={() => setUploadOpen((open) => !open)}
              >
                {uploadOpen ? "Hide Upload" : "Upload Photo"}
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
            <p role="status">Loading photos…</p>
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
