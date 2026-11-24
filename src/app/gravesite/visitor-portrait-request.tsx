"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/icons";
import type { MemorialGallerySlots } from "@/lib/supabase/public-memorial-photos";
import { MAX_VISITOR_PHOTO_BYTES, VISITOR_RELATIONS, type VisitorRelation } from "@/lib/visitor-photo-security";
import styles from "./memorial.module.css";

export function VisitorPortraitRequest({
  burialId,
  name,
  initialSlots,
}: {
  burialId: string;
  name: string;
  initialSlots: MemorialGallerySlots;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [canSubmit, setCanSubmit] = useState(initialSlots.canSubmitPortrait);
  const [pendingCount, setPendingCount] = useState(initialSlots.portraitPending);
  const [file, setFile] = useState<File | null>(null);
  const [submitterName, setSubmitterName] = useState("");
  const [relation, setRelation] = useState<VisitorRelation>("Family");
  const [contact, setContact] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submittedNotice, setSubmittedNotice] = useState("");

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  // Completely hidden whenever a portrait already exists.
  if (initialSlots.portraitApproved > 0) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;
    if (file.size > MAX_VISITOR_PHOTO_BYTES) {
      setError("Please choose an image that is 3 MB or smaller.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("burialId", burialId);
      formData.append("kind", "portrait");
      formData.append("file", file);
      formData.append("name", submitterName.trim());
      formData.append("relation", relation);
      formData.append("contact", contact.trim());
      formData.append("caption", "Family-submitted profile portrait");
      formData.append("consent", consent ? "true" : "false");
      formData.append("website", website);

      const response = await fetch("/api/gravesite/photos/submit", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        message?: string;
        slots?: MemorialGallerySlots;
      } | null;

      if (payload?.slots) {
        setCanSubmit(payload.slots.canSubmitPortrait);
        setPendingCount(payload.slots.portraitPending);
      }

      if (!response.ok) {
        setError(payload?.error || "Your portrait request could not be submitted. Please try again.");
        if (payload?.slots && !payload.slots.canSubmitPortrait) {
          dialog.current?.close();
        }
        return;
      }

      setFile(null);
      setSubmitterName("");
      setRelation("Family");
      setContact("");
      setConsent(false);
      setWebsite("");
      if (fileInput.current) fileInput.current.value = "";
      setCanSubmit(false);
      setPendingCount((current) => Math.max(1, current + 1));
      setSubmittedNotice(
        payload?.message || "Portrait submitted for administrator verification and approval.",
      );
      dialog.current?.close();
    } catch {
      setError("Network error while submitting your portrait. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.portraitRequestWrap}>
      {submittedNotice ? (
        <span className={styles.portraitPendingBadge} role="status">
          <Icon name="clock" size={13} />Submitted for review
        </span>
      ) : pendingCount > 0 || !canSubmit ? (
        <span className={styles.portraitPendingBadge} role="status">
          <Icon name="clock" size={13} />Portrait pending review
        </span>
      ) : (
        <button
          type="button"
          className={styles.portraitRequestBtn}
          onClick={() => {
            setError("");
            dialog.current?.showModal();
          }}
        >
          <Icon name="upload" size={13} />Add portrait
        </button>
      )}

      <dialog ref={dialog} className={styles.portraitDialog} aria-labelledby="portrait-request-title">
        <div className={styles.uploadFormHead}>
          <strong id="portrait-request-title">Submit Profile Portrait for {name}</strong>
          <button
            type="button"
            className={styles.uploadCancel}
            disabled={busy}
            onClick={() => dialog.current?.close()}
          >
            Close
          </button>
        </div>
        <p className={styles.uploadHint}>
          This memorial does not have a profile portrait yet. Submit a clear, respectful portrait of {name} for cemetery administrator verification and approval. Once approved, profile portrait uploads close automatically.
        </p>
        {error ? <p className={styles.uploadError} role="alert">{error}</p> : null}
        <form className={styles.portraitDialogForm} onSubmit={event => void handleSubmit(event)}>
          <label className={styles.uploadField}>
            <span>Portrait image (JPG, PNG, or WebP · max 3 MB)</span>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              required
              onChange={event => {
                const picked = event.target.files?.[0] || null;
                setError("");
                if (picked && picked.size > MAX_VISITOR_PHOTO_BYTES) {
                  setError("Please choose an image that is 3 MB or smaller.");
                  setFile(null);
                  event.target.value = "";
                  return;
                }
                setFile(picked);
              }}
            />
          </label>
          {previewUrl ? (
            <div className={styles.uploadPreview}>
              <Image src={previewUrl} alt="Selected portrait preview" width={120} height={120} unoptimized />
            </div>
          ) : null}
          <div className={styles.uploadFieldRow}>
            <label className={styles.uploadField}>
              <span>Your name</span>
              <input
                type="text"
                required
                minLength={2}
                maxLength={80}
                disabled={busy}
                placeholder="e.g., Maria Santos"
                value={submitterName}
                onChange={event => setSubmitterName(event.target.value)}
              />
            </label>
            <label className={styles.uploadField}>
              <span>Relationship</span>
              <select
                disabled={busy}
                value={relation}
                onChange={event => setRelation(event.target.value as VisitorRelation)}
              >
                {VISITOR_RELATIONS.map(item => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>
          <label className={styles.uploadField}>
            <span>Phone number or email (private — for administrator verification only)</span>
            <input
              type="text"
              required
              minLength={5}
              maxLength={120}
              disabled={busy}
              placeholder="e.g., 0917 123 4567 or maria@example.com"
              value={contact}
              onChange={event => setContact(event.target.value)}
            />
          </label>
          <div className={styles.honeypot} aria-hidden="true">
            <label>
              <span>Website</span>
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={event => setWebsite(event.target.value)}
              />
            </label>
          </div>
          <label className={styles.uploadConsent}>
            <input
              type="checkbox"
              checked={consent}
              disabled={busy}
              required
              onChange={event => setConsent(event.target.checked)}
            />
            <span>
              I confirm this is a respectful portrait of {name} and I have family permission to submit it. Your contact info stays private (staff only) and camera GPS/EXIF metadata is removed automatically.
            </span>
          </label>
          <div className={styles.uploadActions}>
            <button
              type="submit"
              className={styles.uploadSubmit}
              disabled={busy || !file || !submitterName.trim() || contact.trim().length < 5 || !consent}
            >
              <Icon name="upload" size={16} />
              {busy ? "Submitting…" : "Submit Portrait for Approval"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
