"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { getOwnerRecordsPage, uploadBurialPhoto } from "@/lib/supabase/admin-data";
import type { LotOwner } from "@/lib/supabase/types";
import styles from "./map-burial-preview.module.css";

type Props = { code: string; lotType: string; coordinates: string; ownerName?: string | null; onClose: () => void;
  operational?: { candidate: string; lotId: number; lotCode: string; onSaved: () => void } };
const Required = () => <span className={styles.required} aria-hidden="true">*</span>;

export function MapBurialPreview({ code, lotType, coordinates, ownerName, onClose, operational }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const [ownerMode, setOwnerMode] = useState("none");
  const [ownerSearch, setOwnerSearch] = useState("");
  const [owners, setOwners] = useState<LotOwner[]>([]);
  const [ownerError, setOwnerError] = useState("");
  const [result, setResult] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedBurialId, setSavedBurialId] = useState<number | null>(null);
  const uploads = useRef<{ file: File; kind: "portrait" | "tribute"; done: boolean }[]>([]);
  const requestId = useRef<string | null>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    if (ownerMode !== "existing") return;
    let active = true;
    getOwnerRecordsPage({ search: ownerSearch, pageSize: 20 }).then(page => {
      if (active) { setOwners(page.items); setOwnerError(page.hasMore ? "Refine the search to see more owners." : ""); }
    }).catch(() => { if (active) setOwnerError("Owners could not be loaded."); });
    return () => { active = false; };
  }, [ownerMode, ownerSearch]);

  async function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (savedBurialId && operational) { await uploadPhotos(savedBurialId); return; }
    const form = event.currentTarget;
    const values = new FormData(form);
    if (String(values.get("name") ?? "").trim().length === 0) { setResult("Enter a name."); return; }
    if (ownerMode === "new" && ["ownerFirst", "ownerLast", "ownerAddress"].some(field => !String(values.get(field) ?? "").trim())) {
      setResult("First name, last name, and address are required for the owner."); return;
    }
    if (String(values.get("birthDate")) > String(values.get("deathDate"))) { setResult("Birth date must be on or before the death date."); return; }
    const files = [...form.querySelectorAll<HTMLInputElement>('input[type="file"]')].flatMap(input => Array.from(input.files ?? []));
    if (files.some(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024 || file.size === 0)) {
      setResult("Choose JPG, PNG, or WebP images of up to 10 MB each."); return;
    }
    if (!operational) { setResult("The form passed these checks. This preview does not save records or upload photos."); return; }
    uploads.current = [
      ...Array.from(form.querySelector<HTMLInputElement>('input[name="portrait"]')?.files ?? []).map(file => ({ file, kind: "portrait" as const, done: false })),
      ...Array.from(form.querySelector<HTMLInputElement>('input[name="tributes"]')?.files ?? []).map(file => ({ file, kind: "tribute" as const, done: false })),
    ];
    const owner = ownerMode === "existing" ? { mode: "existing", id: values.get("owner") }
      : ownerMode === "new" ? { mode: "new", first_name: values.get("ownerFirst"), middle_name: values.get("ownerMiddle"),
        last_name: values.get("ownerLast"), suffix: values.get("ownerSuffix"), aliases: values.get("ownerAliases"), address: values.get("ownerAddress"),
        representative_name: values.get("representativeName"), representative_relation: values.get("representativeRelation"), representative_contact: values.get("representativeContact") }
      : { mode: "none" };
    requestId.current ??= crypto.randomUUID();
    setSaving(true);
    try {
      const response = await fetch("/api/admin/planning-plot", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...operational, onSaved: undefined, requestId: requestId.current, values: {
          display_name: String(values.get("name") ?? "").trim(), sex: values.get("sex"), birth_date: values.get("birthDate"),
          death_date: values.get("deathDate"), interment_date: values.get("intermentDate"), interment_status: values.get("intermentStatus"),
          remains_type: values.get("remainsType"), inscription: values.get("inscription"), public_display: values.get("publicDisplay") === "on", owner,
        } }) });
      const data: { error?: string; receipt?: { id?: string | number } } = await response.json();
      if (!response.ok) throw new Error(data.error || "The burial could not be saved.");
      const id = Number(data.receipt?.id);
      if (!Number.isSafeInteger(id) || id < 1) throw new Error("The save response could not be confirmed. Retry without changing the form.");
      setSavedBurialId(id);
      await uploadPhotos(id);
    } catch (reason) { setResult(reason instanceof Error ? reason.message : "The burial could not be saved."); }
    finally { setSaving(false); }
  }

  async function uploadPhotos(burialId: number) {
    setSaving(true);
    const failed: string[] = [];
    for (const item of uploads.current) {
      if (item.done) continue;
      try { await uploadBurialPhoto({ burialId, file: item.file, photoKind: item.kind }); item.done = true; }
      catch { failed.push(item.file.name); }
    }
    setSaving(false);
    if (failed.length) { setResult(`Burial saved, but ${failed.length} photo(s) could not be uploaded. Retry or manage photos later.`); return; }
    operational?.onSaved();
    onClose();
  }
  function close() { if (savedBurialId) operational?.onSaved(); onClose(); }

  return createPortal(<dialog ref={dialog} className={styles.dialog} aria-labelledby={title} onCancel={event => { event.preventDefault(); if (!saving) close(); }}>
    <header className={styles.header}><div><h2 id={title}>Add burial record</h2><p>{operational ? "Local test: records can appear on the visitor map when public display is selected. Photos require approval." : "Local preview only — nothing is saved or uploaded."}</p></div>
      <button type="button" onClick={close} disabled={saving} aria-label="Close burial form">×</button></header>
    <form onSubmit={event => void check(event)} className={styles.form}>
      <p className={styles.requiredNote}><Required /> Required fields</p>
      <fieldset disabled={saving || savedBurialId !== null}><legend>Selected plot</legend><div className={styles.grid}>
        <label>Plot code<input value={code} readOnly /></label><label>Lot type<input value={lotType} readOnly /></label>
        <label className={styles.wide}>Coordinates<input value={coordinates} readOnly /></label>
      </div></fieldset>
      <fieldset disabled={saving || savedBurialId !== null}><legend>Deceased and burial</legend><div className={styles.grid}>
        <label className={styles.wide}><span>Full or display name <Required /></span><input name="name" required maxLength={200} /></label>
        <label><span>Birth date <Required /></span><input name="birthDate" type="date" required /></label><label><span>Death date <Required /></span><input name="deathDate" type="date" required /></label>
        <label><span>Sex <Required /></span><select name="sex" required defaultValue=""><option value="" disabled>Select</option><option value="female">Female</option><option value="male">Male</option></select></label>
        <label><span>Interment status <Required /></span><select name="intermentStatus" required defaultValue=""><option value="" disabled>Select</option><option value="PERMANENT">Permanent</option><option value="TEMPORARY">Temporary</option></select></label>
        <label><span>Remains type <Required /></span><select name="remainsType" required defaultValue=""><option value="" disabled>Select</option><option value="FRESH">Fresh</option><option value="ASH">Ash</option><option value="BONE">Bone</option></select></label>
        <label>Interment date<input name="intermentDate" type="date" /></label>
        <label>Profile picture<input name="portrait" type="file" accept="image/jpeg,image/png,image/webp" /></label>
        <label>Tribute photos<input name="tributes" type="file" accept="image/jpeg,image/png,image/webp" multiple /></label>
        <label className={styles.wide}>Memorial inscription<textarea name="inscription" maxLength={600} rows={3} /></label>
        <label className={`${styles.wide} ${styles.checkbox}`}><input name="publicDisplay" type="checkbox" defaultChecked /> Show this memorial on the visitor site</label>
      </div></fieldset>
      <fieldset disabled={saving || savedBurialId !== null}><legend>Plot owner (optional)</legend><div className={styles.grid}>
        {ownerName ? <p className={styles.wide}>Current owner: {ownerName}</p> : null}
        <label className={styles.wide}>Owner<select value={ownerMode} onChange={event => setOwnerMode(event.target.value)}><option value="none">No owner selected</option><option value="existing">Select an existing owner</option><option value="new">Add a new owner</option></select></label>
        {ownerMode === "existing" ? <><label className={styles.wide}>Search owners<input value={ownerSearch} onChange={event => setOwnerSearch(event.target.value)} /></label>
          <label className={styles.wide}><span>Existing owner <Required /></span><select name="owner" required defaultValue=""><option value="">Select an owner</option>{owners.map(owner => <option key={owner.lotOwnerId} value={owner.lotOwnerId}>{owner.firstName} {owner.lastName}</option>)}</select></label>
          {ownerError ? <p className={styles.wide} role="status">{ownerError}</p> : null}</> : null}
        {ownerMode === "new" ? <>
          <label><span>First name <Required /></span><input name="ownerFirst" required /></label>
          <label>Middle name<input name="ownerMiddle" /></label>
          <label><span>Last name <Required /></span><input name="ownerLast" required /></label>
          <label>Suffix<input name="ownerSuffix" /></label>
          <label className={styles.wide}>Aliases<input name="ownerAliases" /></label>
          <label className={styles.wide}><span>Address <Required /></span><textarea name="ownerAddress" required rows={3} /></label>
          <label>Representative name<input name="representativeName" /></label>
          <label>Representative relation<input name="representativeRelation" /></label>
          <label className={styles.wide}>Representative contact<input name="representativeContact" /></label>
        </> : null}
      </div></fieldset>
      {result ? <p role="status" className={styles.notice}>{result}</p> : null}
      <div className={styles.actions}><button type="button" onClick={close} disabled={saving}>Close</button><button type="submit" disabled={saving}>{saving ? "Saving…" : savedBurialId ? "Retry photos" : operational ? "Save burial" : "Check form"}</button></div>
    </form>
  </dialog>, document.body);
}
