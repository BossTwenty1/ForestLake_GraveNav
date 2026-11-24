"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/icons";
import type { MemorialGallerySlots, PublicMemorialPhoto } from "@/lib/supabase/public-memorial-photos";
import { MAX_VISITOR_PHOTO_BYTES, VISITOR_RELATIONS, type VisitorRelation } from "@/lib/visitor-photo-security";
import styles from "./memorial.module.css";

export function MemorialPhoto({ photo, name, priority = false }: { photo?: PublicMemorialPhoto; name: string; priority?: boolean }) {
  const [failedSrc, setFailedSrc] = useState("");
  if (!photo || failedSrc === photo.src) {
    return <div className={styles.photoPlaceholder}><Icon name="tree" size={45} /><span>Photo unavailable</span></div>;
  }
  return <Image alt={photo.caption || `Memorial photograph for ${name}`} fill preload={priority} unoptimized
    src={photo.src} onError={() => setFailedSrc(photo.src)} />;
}

export function MemorialGallery({
  photos,
  name,
  burialId,
  initialSlots,
}: {
  photos: PublicMemorialPhoto[];
  name: string;
  burialId?: string;
  initialSlots?: MemorialGallerySlots;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<PublicMemorialPhoto | null>(null);
  const [failed, setFailed] = useState<number[]>([]);
  const [slots, setSlots] = useState<MemorialGallerySlots | null>(initialSlots ?? null);
  const [formOpen, setFormOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [submitterName, setSubmitterName] = useState("");
  const [relation, setRelation] = useState<VisitorRelation>("Family");
  const [caption, setCaption] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const available = photos.filter(photo => !failed.includes(photo.id));
  const canAcceptVisitorUploads = Boolean(burialId && slots);
  if (!available.length && !canAcceptVisitorUploads) return null;

  const maxSlots = slots?.maxSlots ?? 5;
  const approvedCount = slots?.approved ?? available.filter(photo => photo.photoKind === "tribute").length;
  const pendingCount = slots?.pending ?? 0;
  const remainingSlots = slots ? slots.remaining : 0;
  const galleryFull = Boolean(slots && remainingSlots <= 0);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!burialId || !file || busy) return;
    if (file.size > MAX_VISITOR_PHOTO_BYTES) {
      setError("Please choose an image that is 3 MB or smaller.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccessMessage("");
    try {
      const formData = new FormData();
      formData.append("burialId", burialId);
      formData.append("file", file);
      formData.append("name", submitterName.trim());
      formData.append("relation", relation);
      formData.append("caption", caption.trim());
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
        setSlots(payload.slots);
      }

      if (!response.ok) {
        setError(payload?.error || "Your photo could not be submitted right now. Please try again.");
        if (payload?.slots && payload.slots.remaining <= 0) setFormOpen(false);
        return;
      }

      setFile(null);
      setSubmitterName("");
      setRelation("Family");
      setCaption("");
      setConsent(false);
      setWebsite("");
      if (fileInput.current) fileInput.current.value = "";
      setFormOpen(false);
      setSuccessMessage(
        payload?.message || "Thank you — your photo has been submitted for administrator review. It will appear in this gallery once approved.",
      );
    } catch {
      setError("Network error while submitting your photo. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <section className={styles.gallery} aria-labelledby="memorial-gallery-title">
    <div className={styles.sectionTitle}>
      <h2 id="memorial-gallery-title"><Icon name="photos" size={21} />Memorial Photo Gallery</h2>
      <span>
        {slots
          ? `${approvedCount} of ${maxSlots} ${maxSlots === 1 ? "photo" : "photos"}`
          : `${available.length} ${available.length === 1 ? "photo" : "photos"}`}
      </span>
    </div>

    {available.length ? (
      <div className={styles.thumbnails}>
        {available.map((photo, index) => <button aria-label={photo.caption ? `Enlarge photo: ${photo.caption}` : `Enlarge memorial photo ${index + 1}`}
          key={photo.id} type="button" onClick={event => {
            opener.current = event.currentTarget;
            setSelected(photo);
            dialog.current?.showModal();
          }}>
          <Image alt="" fill unoptimized src={photo.src} onError={() => setFailed(ids => [...ids, photo.id])} />
        </button>)}
      </div>
    ) : (
      <p className={styles.muted}>No remembrance photos have been published in this gallery yet.</p>
    )}

    {canAcceptVisitorUploads ? (
      <div className={styles.uploadBox}>
        {successMessage ? (
          <p className={styles.uploadSuccess} role="status">{successMessage}</p>
        ) : null}
        {error ? (
          <p className={styles.uploadError} role="alert">{error}</p>
        ) : null}

        {galleryFull ? (
          <p className={styles.uploadLimitNote} role="status">
            <Icon name="info" size={16} />
            <span>
              {approvedCount >= maxSlots
                ? `This memorial gallery has reached its ${maxSlots}-photo limit.`
                : `All ${maxSlots} gallery slots are currently filled or awaiting administrator review.`}
            </span>
          </p>
        ) : !formOpen ? (
          <div className={styles.uploadIntroRow}>
            <div className={styles.uploadIntroCopy}>
              <strong>Share a remembrance photo</strong>
              <span>
                {remainingSlots} of {maxSlots} gallery {remainingSlots === 1 ? "slot" : "slots"} available
                {pendingCount > 0 ? ` · ${pendingCount} pending review` : ""}. Reviewed by cemetery staff before display.
              </span>
            </div>
            <button
              type="button"
              className={styles.uploadTrigger}
              onClick={() => {
                setError("");
                setSuccessMessage("");
                setFormOpen(true);
              }}
            >
              <Icon name="upload" size={16} />Share Photo
            </button>
          </div>
        ) : (
          <form className={styles.uploadForm} onSubmit={event => void handleSubmit(event)}>
            <div className={styles.uploadFormHead}>
              <strong>Share a Remembrance Photo</strong>
              <button
                type="button"
                className={styles.uploadCancel}
                disabled={busy}
                onClick={() => { setFormOpen(false); setError(""); }}
              >
                Cancel
              </button>
            </div>
            <p className={styles.uploadHint}>
              Submitted photos require administrator approval and appear only in this gallery — they never replace {name}’s official profile portrait.
            </p>
            <label className={styles.uploadField}>
              <span>Choose photo (JPG, PNG, or WebP · max 3 MB)</span>
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
                <Image src={previewUrl} alt="Selected photo preview" width={120} height={120} unoptimized />
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
              <span>Short message or caption (optional)</span>
              <input
                type="text"
                maxLength={160}
                disabled={busy}
                placeholder="e.g., Flowers from our All Souls’ Day visit"
                value={caption}
                onChange={event => setCaption(event.target.value)}
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
                I confirm I have permission to share this photo respectfully. Camera GPS and EXIF metadata are removed automatically on upload.
              </span>
            </label>
            <div className={styles.uploadActions}>
              <button
                type="submit"
                className={styles.uploadSubmit}
                disabled={busy || !file || !submitterName.trim() || !consent}
              >
                <Icon name="upload" size={16} />
                {busy ? "Submitting…" : "Submit for Admin Review"}
              </button>
            </div>
          </form>
        )}
      </div>
    ) : null}

    <dialog ref={dialog} className={styles.photoDialog} aria-label="Enlarged memorial photo" onClose={() => {
      setSelected(null);
      opener.current?.focus();
    }}>
      <button aria-label="Close photo" className={styles.closePhoto} type="button" onClick={() => dialog.current?.close()}>
        <Icon name="close" size={22} />
      </button>
      {selected ? <figure>
        <div className={styles.enlargedPhoto}><MemorialPhoto name={name} photo={selected} key={selected.id} /></div>
        {selected.caption || selected.submittedByName ? (
          <figcaption>
            {selected.caption ? <span>{selected.caption}</span> : null}
            {selected.submittedByName ? (
              <small className={styles.photoAttribution}>
                Shared by {selected.submittedByName}{selected.submittedByRelation ? ` · ${selected.submittedByRelation}` : ""}
              </small>
            ) : null}
          </figcaption>
        ) : null}
      </figure> : null}
    </dialog>
  </section>;
}
