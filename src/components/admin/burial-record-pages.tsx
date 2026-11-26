"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isSyntheticPlot, plotOptionLabel } from "@/lib/synthetic-plots";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AdminPageFrame } from "./admin-page-content";
import { AdminEditMenu } from "./admin-edit-menu";
import { RecordVisibility } from "./record-visibility";
import { useStaff } from "./staff-context";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Icon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import {
  createBurialRecord, deleteBurialRecord, getAdminPhotoPreview, getAdminPhotoThumbnails, getAdminRecord,
  getAvailableBurialPlots, getBurialPhotos, getLotCoInterments, getStorageStatus, updateBurialRecord,
  updatePhotoReview, uploadBurialPhoto, type BurialRecordInput,
} from "@/lib/supabase/admin-data";
import type { AdminPhoto, AdminRecord, BurialPlotOption } from "@/lib/supabase/types";
import { burialDirectory, recordInputFromRecord, safeBurialReturnTo } from "@/lib/burial-records";
import styles from "./owner-pages.module.css";

const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

function primaryPortrait(photos: AdminPhoto[]): AdminPhoto | null {
  const portraits = photos.filter((photo) => photo.photoKind === "portrait");
  return portraits.find((photo) => photo.approvalStatus === "approved")
    ?? portraits.find((photo) => photo.approvalStatus === "pending")
    ?? portraits[0]
    ?? null;
}

function isDeletedVisitorPhoto(photo: AdminPhoto) {
  return Boolean((photo.isVisitorSubmitted || photo.photoKind === "tribute") && photo.approvalStatus === "rejected");
}

function formatEnumLabel(value: string | null | undefined) {
  if (!value) return null;
  const map: Record<string, string> = {
    PERMANENT: "Permanent",
    TEMPORARY: "Temporary",
    FRESH: "Fresh",
    ASH: "Ash",
    BONE: "Bone",
    active: "Active",
    pending: "Pending",
    archived: "Archived",
  };
  return map[value] ?? value;
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function photoStatusBadge(status: AdminPhoto["approvalStatus"]) {
  if (status === "approved") return <Badge variant="success">Approved · Public</Badge>;
  if (status === "rejected") return <Badge variant="danger">Rejected</Badge>;
  return <Badge variant="warning">Pending review</Badge>;
}

function validatePhotoFile(file: File): string {
  if (!ALLOWED_PHOTO_TYPES.has(file.type)) return "Use a JPG, PNG, or WebP image for the profile picture.";
  if (file.size === 0 || file.size > MAX_PHOTO_BYTES) return "Profile pictures must be 10 MB or smaller.";
  return "";
}

type PageProps = { recordId?: string; returnTo?: string };
const sexLabels = { female: "Female", male: "Male" };

function errorMessage(reason: unknown) {
  if (reason && typeof reason === "object" && "message" in reason &&
    typeof reason.message === "string") return reason.message;
  return "The record could not be loaded. Please try again.";
}

function useRecord(recordId?: string, withPlots = false) {
  const [data, setData] = useState<{
    record: AdminRecord | null; plots: BurialPlotOption[];
  } | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.all([
      recordId ? getAdminRecord(recordId) : Promise.resolve(null),
      withPlots ? getAvailableBurialPlots() : Promise.resolve([]),
    ]).then(([record, plots]) => {
      if (active) { setData({ record, plots }); setError(""); }
    }).catch((reason) => { if (active) setError(errorMessage(reason)); });
    return () => { active = false; };
  }, [recordId, withPlots, attempt]);
  return { data, error, retry: () => setAttempt((value) => value + 1) };
}

export function BurialRecordEditor({ recordId, returnTo }: PageProps) {
  const state = useRecord(recordId, true);
  const back = safeBurialReturnTo(returnTo);
  const title = recordId ? "Edit Deceased / Interment Record" : "Add Deceased / Interment Record";
  let content: ReactNode = <p role="status">Loading record and eligible plots…</p>;
  if (state.error) content = <LoadError message={state.error} onRetry={state.retry} />;
  else if (state.data) {
    content = recordId && !state.data.record ? <MissingRecord back={back} /> :
      <BurialRecordForm record={state.data.record} availablePlots={state.data.plots} back={back} />;
  }
  return <AdminPageFrame
    title={title}
    description="Register or maintain a deceased person and their interment using the existing cemetery records."
    breadcrumbs={[
      { label: "Dashboard", href: "/admin" },
      { label: "Deceased & Interments", href: back },
      { label: recordId ? "Edit record" : "New record" },
    ]}
  >{content}</AdminPageFrame>;
}

function BurialRecordForm({ record, availablePlots, back }: {
  record: AdminRecord | null; availablePlots: BurialPlotOption[]; back: string;
}) {
  const canAdmin = useStaff()?.role === "ADMIN";
  const router = useRouter();
  const [form, setForm] = useState<BurialRecordInput>(() => record
    ? recordInputFromRecord(record)
    : {
      name: "", lotId: 0, birthDate: "", deathDate: "", publicDisplay: false,
      intermentDate: "", recordStatus: "pending", intermentStatus: "PERMANENT",
      remainsType: "FRESH", referenceNo: "", serviceProvider: "", recordSource: "", qualityNotes: "", inscription: "",
    });
  const [storageConfigured, setStorageConfigured] = useState<boolean | null>(null);
  const [existingPortrait, setExistingPortrait] = useState<AdminPhoto | null>(null);
  const [existingPortraitUrl, setExistingPortraitUrl] = useState<string>("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoCaption, setPhotoCaption] = useState("");
  const [approvePhotoOnSave, setApprovePhotoOnSave] = useState(true);
  const [photoValidationError, setPhotoValidationError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  useEffect(() => {
    let active = true;
    getStorageStatus()
      .then((value) => { if (active) setStorageConfigured(value.configured); })
      .catch(() => { if (active) setStorageConfigured(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!record) return;
    let active = true;
    getBurialPhotos(record.burialId)
      .then(async (photos) => {
        if (!active) return;
        const primary = primaryPortrait(photos);
        setExistingPortrait(primary);
        if (primary) {
          const url = await getAdminPhotoPreview(primary.photoId).catch(() => "");
          if (active) setExistingPortraitUrl(url);
        }
      })
      .catch(() => {
        if (active) { setExistingPortrait(null); setExistingPortraitUrl(""); }
      });
    return () => { active = false; };
  }, [record]);

  const photoPreviewUrl = useMemo(() => (photoFile ? URL.createObjectURL(photoFile) : ""), [photoFile]);
  useEffect(() => {
    if (!photoPreviewUrl) return;
    return () => URL.revokeObjectURL(photoPreviewUrl);
  }, [photoPreviewUrl]);

  const confirmed = record?.intermentConfirmed === true;
  const selectedPlot = availablePlots.find((plot) => plot.lotId === form.lotId);
  const noEligiblePlots = !record && !availablePlots.length;
  const detailHref = record
    ? burialDirectory + "/" + record.burialId + "?" + new URLSearchParams({ returnTo: back })
    : back;
  function setField<K extends keyof BurialRecordInput>(key: K, value: BurialRecordInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  function handlePhotoSelect(nextFile: File | null) {
    setPhotoValidationError("");
    if (!nextFile) {
      setPhotoFile(null);
      return;
    }
    const issue = validatePhotoFile(nextFile);
    if (issue) {
      setPhotoValidationError(issue);
      setPhotoFile(null);
      if (photoInputRef.current) photoInputRef.current.value = "";
      return;
    }
    setPhotoFile(nextFile);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError("");
    if (!form.name.trim() || !Number.isInteger(form.lotId) || form.lotId <= 0) {
      setError("Enter the deceased person's name and select an eligible existing plot.");
      return;
    }
    if (form.birthDate && form.deathDate && form.birthDate > form.deathDate) {
      setError("Birth date cannot be later than death date.");
      return;
    }
    if (photoFile) {
      const issue = validatePhotoFile(photoFile);
      if (issue) {
        setPhotoValidationError(issue);
        return;
      }
    }
    setSaving(true);
    try {
      const input = { ...form, name: form.name.trim() };
      const receipt = record
        ? await updateBurialRecord(record.burialId, input)
        : await createBurialRecord(input);
      if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)
        || !("id" in receipt) || !/^[1-9]\d*$/.test(String(receipt.id))) {
        throw new Error("The save response could not be confirmed. Retry to safely resume the same request.");
      }
      const savedBurialId = Number(receipt.id);
      let photoStatus = "";
      if (photoFile) {
        try {
          const insertedPhotoId = await uploadBurialPhoto({
            burialId: savedBurialId,
            file: photoFile,
            caption: photoCaption.trim() || undefined,
          });
          photoStatus = "uploaded";
          if (canAdmin && approvePhotoOnSave) {
            try {
              const uploadedPhotos = await getBurialPhotos(savedBurialId);
              const newest = (insertedPhotoId
                ? uploadedPhotos.find((item) => item.photoId === insertedPhotoId)
                : null)
                ?? [...uploadedPhotos]
                  .reverse()
                  .find((item) => item.photoKind === "portrait" && !item.isVisitorSubmitted && item.approvalStatus === "pending" && item.fileName === photoFile.name);
              if (newest) {
                await updatePhotoReview(newest.photoId, "approved", newest.revision);
                photoStatus = "approved";
              }
            } catch {
              photoStatus = "uploaded";
            }
          }
        } catch {
          photoStatus = "failed";
        }
      }
      const nextParams = new URLSearchParams({ returnTo: back, saved: "1" });
      if (photoStatus) nextParams.set("photoStatus", photoStatus);
      router.push(burialDirectory + "/" + receipt.id + "?" + nextParams);
    } catch (reason) { setError(errorMessage(reason)); setSaving(false); }
  }
  const activePreviewUrl = photoPreviewUrl || existingPortraitUrl;
  return <Card className={styles.formCard}><CardContent>
    {noEligiblePlots ? <Alert title="No eligible plots available" variant="warning">
      Registration requires an existing eligible plot. Ask an administrator to review the plot records.
      No plot will be created automatically.
    </Alert> : null}
    <form className="admin-form" onSubmit={(event) => void submit(event)}>
      <p className="input-hint">Fields marked * are required. Optional details can be left blank.</p>
      <fieldset className={styles.fieldset} disabled={saving}>
        <legend>Deceased person</legend>
        <div className={styles.portraitBox}>
          <div className={styles.portraitFrame}>
            {activePreviewUrl ? (
              <Image
                alt={form.name ? `Profile photo for ${form.name}` : "Selected family profile photo"}
                className={styles.portraitImg}
                height={104}
                src={activePreviewUrl}
                unoptimized
                width={104}
              />
            ) : (
              <Icon name="person" size={40} />
            )}
          </div>
          <div className={styles.portraitControls}>
            <div className={styles.portraitHeader}>
              <strong>Profile picture (family-provided photo)</strong>
              {!photoFile && existingPortrait ? photoStatusBadge(existingPortrait.approvalStatus) : null}
              {photoFile ? <Badge variant="info">Ready to upload on save</Badge> : null}
            </div>
            <Input
              ref={photoInputRef}
              accept="image/jpeg,image/png,image/webp"
              disabled={storageConfigured === false || saving}
              hint={storageConfigured === false
                ? "Photo storage is not configured in this environment. You can still save the burial record."
                : "Upload a family-provided portrait (JPG, PNG, or WebP; max 10 MB) during setup or anytime after interment."}
              id="burial-profile-photo"
              label={existingPortrait ? "Upload new or replacement photo (optional)" : "Upload profile photo (optional)"}
              type="file"
              onChange={(e) => handlePhotoSelect(e.target.files?.[0] || null)}
            />
            {photoValidationError ? (
              <Alert title="Invalid profile photo" variant="danger">{photoValidationError}</Alert>
            ) : null}
            {photoFile ? <>
              <Input
                disabled={saving}
                id="burial-profile-photo-caption"
                label="Photo caption (optional)"
                maxLength={2000}
                placeholder="e.g. Family portrait provided by next of kin"
                value={photoCaption}
                onChange={(e) => setPhotoCaption(e.target.value)}
              />
              {canAdmin ? (
                <label className="checkbox-field">
                  <input
                    checked={approvePhotoOnSave}
                    type="checkbox"
                    onChange={(e) => setApprovePhotoOnSave(e.target.checked)}
                  />
                  <span>Approve this photo for public memorial display immediately</span>
                </label>
              ) : (
                <p className="input-hint">
                  Family photos uploaded by a manager are saved privately and queued for administrator approval before public display.
                </p>
              )}
              <div className={styles.portraitActions}>
                <Button
                  size="sm"
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setPhotoFile(null);
                    setPhotoCaption("");
                    setPhotoValidationError("");
                    if (photoInputRef.current) photoInputRef.current.value = "";
                  }}
                >
                  Remove selected photo
                </Button>
              </div>
            </> : null}
          </div>
        </div>
        <Input
          label="Full / display name *"
          required
          value={form.name}
          onChange={(e) => setField("name", e.target.value)}
        />
        <div className="filter-grid">
          <Input label="Birth date" type="date" value={form.birthDate}
            onChange={(e) => setField("birthDate", e.target.value)} />
          <Input label="Death date" type="date" value={form.deathDate}
            onChange={(e) => setField("deathDate", e.target.value)} />
        </div>
        <SelectField
          label="Sex"
          value={form.sex ?? ""}
          options={[["", "Not recorded"], ...Object.entries(sexLabels)]}
          onChange={(value) => setField("sex", value === "female" || value === "male" ? value : null)}
        />
        <label className="input-field" htmlFor="burial-inscription">
          <span className="input-label">Memorial inscription (public)</span>
          <textarea
            aria-describedby="burial-inscription-hint"
            aria-label="Memorial inscription (public)"
            className="input-control"
            id="burial-inscription"
            maxLength={600}
            placeholder="e.g. A beloved mother, teacher, and grandmother whose kindness and faith guided generations."
            rows={3}
            value={form.inscription ?? ""}
            onChange={(e) => setField("inscription", e.target.value)}
          />
          <span className="input-hint" id="burial-inscription-hint">
            Optional remembrance quote shown on the visitor memorial profile (up to 600 characters).
          </span>
        </label>
      </fieldset>
      <fieldset className={styles.fieldset} disabled={saving}>
        <legend>Plot and interment</legend>
        <label className="input-field" htmlFor="burial-plot">
          <span className="input-label" id="burial-plot-label">Existing cemetery plot *</span>
          <select
            aria-describedby="burial-plot-hint"
            aria-labelledby="burial-plot-label"
            className="input-control"
            disabled={confirmed}
            id="burial-plot"
            required
            value={form.lotId || ""}
            onChange={(e) => setField("lotId", Number(e.target.value))}
          >
            <option value="">Select an eligible existing plot…</option>
            {record ? <option value={record.lotId}>
              Current: {plotOptionLabel(record.plot, record.syntheticPlotReference)} — {record.section}
            </option> : null}
            {availablePlots.filter((plot) => plot.lotId !== record?.lotId).map((plot) => (
              <option key={plot.lotId} value={plot.lotId}>
                {plotOptionLabel(plot.lotCode)} — {plot.section}
              </option>
            ))}
          </select>
          <span className="input-hint" id="burial-plot-hint">
            {confirmed ? "This confirmed interment retains its existing plot." :
              selectedPlot?.graveType
                ? selectedPlot.confirmedCount + " confirmed; " + selectedPlot.remaining +
                  " admissions remain after reservations."
                : "Select the established cemetery plot for this interment."}
          </span>
        </label>
        {record?.syntheticPlotReference ? <p className="input-hint">
          Gravesite reference: {record.syntheticPlotReference}
        </p> : null}
        <Input label="Interment date" aria-label="Interment date" type="date" value={form.intermentDate}
          hint="Classified interments require the existing order, date and confirmation checks."
          onChange={(e) => setField("intermentDate", e.target.value)} />
        <div className="filter-grid">
          <SelectField
            label="Interment status" value={form.intermentStatus}
            options={[["PERMANENT", "Permanent"], ["TEMPORARY", "Temporary"]]}
            onChange={(value) => setField("intermentStatus", value as BurialRecordInput["intermentStatus"])}
          />
          <SelectField
            label="Remains type" value={form.remainsType}
            options={[["FRESH", "Fresh"], ["ASH", "Ash"], ["BONE", "Bone"]]}
            onChange={(value) => setField("remainsType", value as BurialRecordInput["remainsType"])}
          />
        </div>
        <Input
          label="Verified interment order"
          aria-label="Verified interment order"
          readOnly={confirmed}
          value={form.intermentOrderNumber ?? ""}
          hint="Use the reviewed order reference. Confirmed orders cannot be changed here."
          onChange={(e) => setField("intermentOrderNumber", e.target.value)}
        />
        <label className="checkbox-field">
          <input
            checked={form.intermentConfirmed === true}
            disabled={confirmed}
            type="checkbox"
            onChange={(e) => setField("intermentConfirmed", e.target.checked)}
          />
          <span>I verified this actual interment and checked for duplicates at this plot</span>
        </label>
      </fieldset>
      <fieldset className={styles.fieldset} disabled={saving}>
        <legend>Record details</legend>
        <div className="filter-grid">
          <Input label="Record reference" value={form.referenceNo}
            onChange={(e) => setField("referenceNo", e.target.value)} />
          <Input label="Service provider" value={form.serviceProvider}
            onChange={(e) => setField("serviceProvider", e.target.value)} />
        </div>
        <Input label="Record source" value={form.recordSource}
          onChange={(e) => setField("recordSource", e.target.value)} />
        <SelectField
          label="Record status" value={form.recordStatus || "pending"}
          options={[["pending", "Pending"], ["active", "Active"], ["archived", "Archived"]]}
          onChange={(value) => setField("recordStatus", value as AdminRecord["recordStatus"])}
        />
        <p className="input-hint">
          Visitor visibility is managed on the record detail page after saving.
          Changing record status still affects existing publication eligibility.
        </p>
        <label className="input-field" htmlFor="burial-quality-notes">
          <span className="input-label">Quality notes (staff only)</span>
          <textarea
            aria-label="Quality notes (staff only)"
            className="input-control" id="burial-quality-notes" rows={3}
            value={form.qualityNotes}
            onChange={(e) => setField("qualityNotes", e.target.value)}
          />
        </label>
      </fieldset>
      {error ? <div ref={errorRef} tabIndex={-1}>
        <Alert title="Record could not be saved" variant="danger">{error}</Alert>
      </div> : null}
      <div className="admin-form-actions">
        {saving ? null : <Link className="button button--secondary button--md" href={detailHref}>
          Cancel
        </Link>}
        <Button disabled={saving || noEligiblePlots || !form.lotId} icon="check" type="submit">
          {saving ? "Saving…" : record ? "Save changes" : "Save record"}
        </Button>
      </div>
    </form>
  </CardContent></Card>;
}

function RecordPortraitCard({ record }: { record: AdminRecord }) {
  const canAdmin = useStaff()?.role === "ADMIN";
  const [photos, setPhotos] = useState<AdminPhoto[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
  const [previewUrl, setPreviewUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [approveNow, setApproveNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    getStorageStatus()
      .then((value) => { if (active) setConfigured(value.configured); })
      .catch(() => { if (active) setConfigured(false); });
    getBurialPhotos(record.burialId)
      .then(async (list) => {
        if (!active) return;
        setPhotos(list);
        const activeIds = list.filter((item) => !isDeletedVisitorPhoto(item)).map((item) => item.photoId);
        const signedMap = activeIds.length ? await getAdminPhotoThumbnails(activeIds).catch(() => ({} as Record<number, string>)) : {};
        if (!active) return;
        setThumbnails(signedMap);
        const primary = primaryPortrait(list);
        if (primary && !isDeletedVisitorPhoto(primary)) {
          const url = signedMap[primary.photoId] || await getAdminPhotoPreview(primary.photoId).catch(() => "");
          if (active) setPreviewUrl(url);
        } else {
          setPreviewUrl("");
        }
      })
      .catch((reason) => {
        if (active) setError(errorMessage(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [record.burialId, refresh]);

  const localPreview = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);
  useEffect(() => {
    if (!localPreview) return;
    return () => URL.revokeObjectURL(localPreview);
  }, [localPreview]);

  function reloadPhotos() {
    setLoading(true);
    setRefresh((value) => value + 1);
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;
    const issue = validatePhotoFile(file);
    if (issue) { setError(issue); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const insertedPhotoId = await uploadBurialPhoto({ burialId: record.burialId, file, caption: caption.trim() || undefined });
      let statusMsg = "Family profile photo uploaded for administrator review. It stays private until approved.";
      if (canAdmin && approveNow) {
        try {
          const refreshed = await getBurialPhotos(record.burialId);
          const newest = (insertedPhotoId
            ? refreshed.find((item) => item.photoId === insertedPhotoId)
            : null)
            ?? [...refreshed]
              .reverse()
              .find((item) => item.photoKind === "portrait" && !item.isVisitorSubmitted && item.approvalStatus === "pending" && item.fileName === file.name);
          if (newest) {
            await updatePhotoReview(newest.photoId, "approved", newest.revision);
            statusMsg = "Family profile photo uploaded and approved for public memorial display.";
          }
        } catch {
          statusMsg = "Family profile photo uploaded, but immediate approval could not be completed. Approve it below.";
        }
      }
      setFile(null);
      setCaption("");
      if (inputRef.current) inputRef.current.value = "";
      setMessage(statusMsg);
      reloadPhotos();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function handleReview(photo: AdminPhoto, nextStatus: AdminPhoto["approvalStatus"]) {
    if (!canAdmin || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await updatePhotoReview(photo.photoId, nextStatus, photo.revision);
      setMessage(nextStatus === "approved"
        ? photo.photoKind === "tribute"
          ? "Visitor gallery photo approved for public memorial display."
          : "Profile photo approved for public memorial display."
        : isDeletedVisitorPhoto({ ...photo, approvalStatus: "rejected" })
          ? "Visitor photo rejected and removed from storage."
          : "Profile photo rejected and kept private.");
      reloadPhotos();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const primary = primaryPortrait(photos);
  const shownUrl = localPreview || previewUrl;

  return <Card>
    <CardHeader>
      <CardTitle>Profile picture &amp; memorial gallery</CardTitle>
      <Link className="subtle-link" href="/admin/photos">Open Photo Moderation</Link>
    </CardHeader>
    <CardContent>
      {error ? <Alert title="Photo update unavailable" variant="danger">{error}</Alert> : null}
      {message ? <div role="status"><Alert title="Photo updated" variant="success">{message}</Alert></div> : null}
      <div className={styles.portraitBox}>
        <div className={styles.portraitFrame}>
          {shownUrl ? (
            <Image
              alt={`Profile photo for ${record.name}`}
              className={styles.portraitImg}
              height={104}
              src={shownUrl}
              unoptimized
              width={104}
            />
          ) : (
            <Icon name="person" size={40} />
          )}
        </div>
        <div className={styles.portraitControls}>
          <div className={styles.portraitHeader}>
            <strong>{primary ? "Current memorial profile photo" : "No profile photo uploaded yet"}</strong>
            {primary ? photoStatusBadge(primary.approvalStatus) : null}
          </div>
          <p className="input-hint">
            Upload a portrait provided by the family before or after interment. The approved profile portrait appears on the public memorial header.
          </p>
          <form className="admin-form" onSubmit={(e) => void handleUpload(e)}>
            <Input
              ref={inputRef}
              accept="image/jpeg,image/png,image/webp"
              disabled={configured === false || busy}
              hint={configured === false ? "Photo storage is not configured in this environment." : "JPG, PNG, or WebP; maximum 10 MB."}
              id="detail-profile-photo"
              label={primary ? "Add another or replacement family photo" : "Upload family-provided profile photo"}
              type="file"
              onChange={(e) => {
                setError("");
                const next = e.target.files?.[0] || null;
                if (next) {
                  const issue = validatePhotoFile(next);
                  if (issue) {
                    setError(issue);
                    setFile(null);
                    if (inputRef.current) inputRef.current.value = "";
                    return;
                  }
                }
                setFile(next);
              }}
            />
            {file ? <>
              <Input
                disabled={busy}
                id="detail-profile-photo-caption"
                label="Caption (optional)"
                maxLength={2000}
                placeholder="e.g. Family portrait provided by next of kin"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
              />
              {canAdmin ? (
                <label className="checkbox-field">
                  <input checked={approveNow} type="checkbox" onChange={(e) => setApproveNow(e.target.checked)} />
                  <span>Approve for public memorial display immediately</span>
                </label>
              ) : null}
              <div className={styles.portraitActions}>
                <Button disabled={busy || configured === false} icon="upload" size="sm" type="submit">
                  {busy ? "Uploading…" : "Upload family photo"}
                </Button>
                <Button
                  disabled={busy}
                  size="sm"
                  type="button"
                  variant="secondary"
                  onClick={() => { setFile(null); setCaption(""); if (inputRef.current) inputRef.current.value = ""; }}
                >
                  Cancel
                </Button>
              </div>
            </> : null}
          </form>
        </div>
      </div>

      {loading ? <p role="status">Loading attached photos…</p> : photos.length ? (
        <div className={styles.photoList}>
          {photos.map((photo) => {
            const deletedVisitor = isDeletedVisitorPhoto(photo);
            const thumb = thumbnails[photo.photoId];
            return (
              <div className={styles.photoItem} key={photo.photoId}>
                <div className={styles.photoItemLead}>
                  <div className={styles.photoThumb}>
                    {thumb ? (
                      <Image alt={photo.fileName} fill sizes="48px" src={thumb} unoptimized />
                    ) : (
                      <Icon name={deletedVisitor ? "close" : "photos"} size={18} />
                    )}
                  </div>
                  <div className={styles.photoItemMeta}>
                    <div className={styles.portraitHeader}>
                      <strong>{photo.fileName}</strong>
                      <Badge variant={photo.photoKind === "tribute" ? "info" : "neutral"}>
                        {photo.photoKind === "tribute"
                          ? "Visitor gallery"
                          : photo.isVisitorSubmitted
                            ? "Visitor portrait"
                            : "Profile portrait"}
                      </Badge>
                    </div>
                    <span>
                      {photo.caption || (photo.photoKind === "tribute" ? "Visitor remembrance photo" : "Family memorial portrait")}
                      {" · "}Photo #{photo.photoId}
                      {photo.submittedByName ? ` · Submitted by ${photo.submittedByName}${photo.submittedByRelation ? ` (${photo.submittedByRelation})` : ""}` : ""}
                      {canAdmin && photo.submittedByContact ? ` · Contact: ${photo.submittedByContact}` : ""}
                    </span>
                  </div>
                </div>
                <div className={styles.portraitActions}>
                  {photoStatusBadge(photo.approvalStatus)}
                  {canAdmin && photo.approvalStatus !== "approved" && !deletedVisitor ? (
                    <Button disabled={busy} size="sm" variant="secondary" onClick={() => void handleReview(photo, "approved")}>
                      Approve
                    </Button>
                  ) : null}
                  {canAdmin && photo.approvalStatus !== "rejected" ? (
                    <Button disabled={busy} size="sm" variant="danger" onClick={() => void handleReview(photo, "rejected")}>
                      {photo.isVisitorSubmitted || photo.photoKind === "tribute" ? "Reject & Delete" : "Reject"}
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </CardContent>
  </Card>;
}

function SharedGravesiteCard({ lotId, burialId, back }: { lotId: number; burialId: number; back: string }) {
  const [siblings, setSiblings] = useState<Awaited<ReturnType<typeof getLotCoInterments>> | null>(null);
  useEffect(() => {
    let active = true;
    getLotCoInterments(lotId, burialId)
      .then((rows) => { if (active) setSiblings(rows); })
      .catch(() => { if (active) setSiblings([]); });
    return () => { active = false; };
  }, [lotId, burialId]);

  if (!siblings || !siblings.length) return null;
  return (
    <Card>
      <CardHeader><CardTitle>Shared gravesite roster ({siblings.length} other)</CardTitle></CardHeader>
      <CardContent>
        <p className="input-hint">Other individuals recorded at this same physical cemetery plot.</p>
        <ul className={styles.records}>
          {siblings.map((person) => (
            <li key={person.burialId}>
              <Link
                className="subtle-link"
                href={`${burialDirectory}/${person.burialId}?${new URLSearchParams({ returnTo: back })}`}
              >
                {person.name} · Burial #{person.burialId}
              </Link>
              <span>Status: {formatEnumLabel(person.recordStatus)} · Interment: {person.intermentDate || "Not recorded"}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function BurialRecordDetail({ recordId, returnTo, saved = false, photoStatus }: {
  recordId: string; returnTo?: string; saved?: boolean; photoStatus?: string;
}) {
  const canAdmin = useStaff()?.role === "ADMIN";
  const router = useRouter();
  const state = useRecord(recordId);
  const record = state.data?.record;
  const back = safeBurialReturnTo(returnTo);
  const editHref = burialDirectory + "/" + recordId + "/edit?" + new URLSearchParams({ returnTo: back });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function removeRecord() {
    if (!record || deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteBurialRecord(record.burialId, record.revision);
      router.push(back);
    } catch (reason) {
      setConfirmDelete(false);
      setDeleteError(errorMessage(reason));
      setDeleting(false);
    }
  }

  let content: ReactNode = <p role="status">Loading deceased and interment record…</p>;
  if (state.error) content = <LoadError message={state.error} onRetry={state.retry} />;
  else if (state.data && !record) content = <MissingRecord back={back} />;
  else if (record) content = <>
    {deleteError ? <Alert title="Record could not be deleted" variant="danger">{deleteError}</Alert> : null}
    {saved ? <Alert title="Record saved" variant={photoStatus === "failed" ? "warning" : "success"}>
      {photoStatus === "approved"
        ? "Deceased details were saved and the family profile photo was approved for public memorial display."
        : photoStatus === "uploaded"
          ? "Deceased details were saved and the family profile photo was uploaded for administrator review."
          : photoStatus === "failed"
            ? "Deceased details were saved, but the family profile photo could not be uploaded. You can upload it again below."
            : "Deceased and interment details were saved successfully."}
    </Alert> : null}
    <RecordVisibility record={record} onReload={state.retry} />
    <RecordPortraitCard record={record} />
    <RecordSection title="Deceased person">
      <Detail label="Full / display name">{record.name}</Detail>
      <Detail label="Sex">{record.sex ? sexLabels[record.sex] : null}</Detail>
      <Detail label="Birth date">{record.birthDate}</Detail>
      <Detail label="Death date">{record.deathDate}</Detail>
      <Detail label="Memorial inscription">{record.inscription || null}</Detail>
    </RecordSection>
    <RecordSection title="Interment">
      <Detail label="Interment date">{record.intermentDate}</Detail>
      <Detail label="Interment status">{formatEnumLabel(record.intermentStatus)}</Detail>
      <Detail label="Remains type">{formatEnumLabel(record.remainsType)}</Detail>
      <Detail label="Verified interment order">{record.intermentOrderNumber}</Detail>
      <Detail label="Interment confirmation">{record.intermentConfirmed === true
        ? "Confirmed" : record.intermentConfirmed === false ? "Not confirmed" : "Not recorded"}</Detail>
    </RecordSection>
    <RecordSection title="Associated cemetery plot">
      <Detail label="Garden / area">{record.section}</Detail>
      {record.syntheticPlotReference ? <Detail label="Gravesite Reference">
        {record.syntheticPlotReference}
      </Detail> : null}
      {!isSyntheticPlot(record.plot) ? <Detail label="Lot">{record.plot}</Detail> : null}
      <Detail label="Map & plot tools">
        <div className={styles.actions}>
          <Link className="subtle-link" href={`/admin/cemetery-map?plot=${record.lotId}`}>View plot on map</Link>
          <Link className="subtle-link" href={`/admin/plot-management?query=${encodeURIComponent(record.syntheticPlotReference || record.plot)}`}>Open in Plot Management</Link>
        </div>
      </Detail>
    </RecordSection>
    <SharedGravesiteCard back={back} burialId={record.burialId} lotId={record.lotId} />
    <RecordSection title="Record status">
      <Detail label="Record status">{formatEnumLabel(record.recordStatus)}</Detail>
      <Detail label="Service provider">{record.serviceProvider}</Detail>
      <Detail label="Last updated">{formatTimestamp(record.updatedAt)}</Detail>
    </RecordSection>
    <Card><CardContent>
      <details className="admin-internal-record-details">
        <summary>Internal Record Details</summary>
        <dl className={styles.profile}>
          <Detail label="Deceased ID">{record.deceasedId}</Detail>
          <Detail label="Interment ID">{record.burialId}</Detail>
          <Detail label="Lot ID">{record.lotId}</Detail>
          <Detail label="Internal Lot Code">{record.plot}</Detail>
          <Detail label="Record source">{record.recordSource}</Detail>
          <Detail label="Record reference">{record.referenceNo}</Detail>
          <Detail label="Revision">{record.revision}</Detail>
          <Detail label="Quality notes (staff only)">{record.qualityNotes}</Detail>
        </dl>
      </details>
    </CardContent></Card>
    <ConfirmationDialog
      confirmLabel={deleting ? "Deleting…" : "Delete record"}
      description={<p>This hides the burial record from visitors and operational lists. Administrators can restore it in Recovery.</p>}
      open={confirmDelete}
      title="Delete burial record?"
      variant="danger"
      onClose={() => { if (!deleting) setConfirmDelete(false); }}
      onConfirm={() => void removeRecord()}
    />
  </>;
  return <AdminPageFrame
    title={record?.name || "Deceased / Interment Record"}
    description={record ? "Burial record #" + record.burialId + " · Restricted staff record" : undefined}
    breadcrumbs={[
      { label: "Dashboard", href: "/admin" },
      { label: "Deceased & Interments", href: back },
      { label: "Record details" },
    ]}
    actions={record ? <div className={styles.actions}>
      <AdminEditMenu actionLabel="Edit record" deleteLabel="Delete record" disabled={deleting} href={editHref} label={`More actions for ${record.name}`} onDelete={canAdmin ? () => setConfirmDelete(true) : undefined} />
    </div> : undefined}
  >
    {content}
    <Link className="subtle-link" href={back}>Back to Deceased &amp; Interments</Link>
  </AdminPageFrame>;
}

function RecordSection({ title, children }: { title: string; children: ReactNode }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader>
    <CardContent><dl className={styles.profile}>{children}</dl></CardContent>
  </Card>;
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  const empty = children === null || children === undefined || children === "";
  return <div><dt>{label}</dt><dd>{empty ? "Not recorded" : children}</dd></div>;
}

function SelectField({ label, value, options, onChange }: {
  label: string; value: string; options: string[][]; onChange: (value: string) => void;
}) {
  return <label className="input-field">
    <span className="input-label">{label}</span>
    <select className="input-control" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
    </select>
  </label>;
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <Alert title="Record unavailable" variant="danger">
    <p>{message}</p><Button onClick={onRetry} size="sm" variant="secondary">Retry</Button>
  </Alert>;
}

function MissingRecord({ back }: { back: string }) {
  return <Alert title="Record not found" variant="warning">
    This record is unavailable or has been removed. <Link className="subtle-link" href={back}>
      Return to Deceased & Interments
    </Link>.
  </Alert>;
}
