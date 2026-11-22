"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { isSyntheticPlot, plotOptionLabel, syntheticPlotDescription } from "@/lib/synthetic-plots";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AdminPageFrame } from "./admin-page-content";
import { RecordVisibility } from "./record-visibility";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createBurialRecord, getAdminRecord, getAvailableBurialPlots, getOptionalBurialFields, updateBurialRecord,
  type BurialRecordInput,
} from "@/lib/supabase/admin-data";
import type { AdminRecord, BurialPlotOption } from "@/lib/supabase/types";
import { burialDirectory, recordInputFromRecord, safeBurialReturnTo } from "@/lib/burial-records";
import styles from "./owner-pages.module.css";

type PageProps = { recordId?: string; returnTo?: string };
type OptionalFields = Awaited<ReturnType<typeof getOptionalBurialFields>>;
const sexLabels = { female: "Female", male: "Male" };

function errorMessage(reason: unknown) {
  if (reason && typeof reason === "object" && "message" in reason &&
    typeof reason.message === "string") return reason.message;
  return "The record could not be loaded. Please try again.";
}

function useRecord(recordId?: string, withPlots = false) {
  const [data, setData] = useState<{
    record: AdminRecord | null; plots: BurialPlotOption[]; fields: OptionalFields | null;
  } | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.all([
      recordId ? getAdminRecord(recordId) : Promise.resolve(null),
      withPlots ? getAvailableBurialPlots() : Promise.resolve([]),
      withPlots && !recordId ? getOptionalBurialFields() : Promise.resolve(null),
    ]).then(([record, plots, fields]) => {
      if (active) { setData({ record, plots, fields }); setError(""); }
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
      <BurialRecordForm record={state.data.record} availablePlots={state.data.plots} fields={state.data.fields} back={back} />;
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

function BurialRecordForm({ record, availablePlots, fields, back }: {
  record: AdminRecord | null; availablePlots: BurialPlotOption[]; fields: OptionalFields | null; back: string;
}) {
  const router = useRouter();
  const sexAvailable = fields?.sex ?? record?.sex !== undefined;
  const inscriptionAvailable = fields?.inscription ?? record?.inscription !== undefined;
  const [form, setForm] = useState<BurialRecordInput>(() => record
    ? recordInputFromRecord(record)
    : {
      name: "", lotId: 0, birthDate: "", deathDate: "", publicDisplay: false,
      intermentDate: "", recordStatus: "pending", intermentStatus: "PERMANENT",
      remainsType: "FRESH", referenceNo: "", serviceProvider: "", recordSource: "", qualityNotes: "",
    });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const confirmed = record?.intermentConfirmed === true;
  const selectedPlot = availablePlots.find((plot) => plot.lotId === form.lotId);
  const selectedLotCode = selectedPlot?.lotCode || (form.lotId === record?.lotId ? record.plot : "");
  const synthetic = isSyntheticPlot(selectedLotCode);
  const noEligiblePlots = !record && !availablePlots.length;
  const detailHref = record
    ? burialDirectory + "/" + record.burialId + "?" + new URLSearchParams({ returnTo: back })
    : back;
  function setField<K extends keyof BurialRecordInput>(key: K, value: BurialRecordInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
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
      router.push(burialDirectory + "/" + receipt.id + "?" +
        new URLSearchParams({ returnTo: back, saved: "1" }));
    } catch (reason) { setError(errorMessage(reason)); setSaving(false); }
  }
  return <Card className={styles.formCard}><CardContent>
    {noEligiblePlots ? <Alert title="No eligible plots available" variant="warning">
      Registration requires an existing eligible plot. Ask an administrator to review the plot records.
      No plot will be created automatically.
    </Alert> : null}
    <form className="admin-form" onSubmit={(event) => void submit(event)}>
      <p className="input-hint">Fields marked * are required. Optional details can be left blank.</p>
      <fieldset className={styles.fieldset} disabled={saving}>
        <legend>Deceased person</legend>
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
          disabled={!sexAvailable}
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
            disabled={!inscriptionAvailable}
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
        {!sexAvailable || !inscriptionAvailable ? <p className="input-hint">
          {(!sexAvailable && !inscriptionAvailable) ? "Sex and memorial inscription require a database update."
            : sexAvailable ? "Memorial inscription requires a database update." : "Sex requires a database update."}
        </p> : null}
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
            <option value="">Select an eligible existing plot</option>
            {record ? <option value={record.lotId}>
              Current: {plotOptionLabel(record.plot)} — {record.section}
            </option> : null}
            {availablePlots.filter((plot) => plot.lotId !== record?.lotId).map((plot) => (
              <option key={plot.lotId} value={plot.lotId}>
                {plotOptionLabel(plot.lotCode)} — {plot.section}
              </option>
            ))}
          </select>
          <span className="input-hint" id="burial-plot-hint">
            {synthetic ? syntheticPlotDescription : confirmed ? "This confirmed interment retains its existing plot." :
              selectedPlot?.graveType
                ? selectedPlot.confirmedCount + " confirmed; " + selectedPlot.remaining +
                  " admissions remain after reservations."
                : "Select the established plot association. A lot code does not verify a CAD or GPS location."}
          </span>
        </label>
        {record?.syntheticPlotReference ? <p className="input-hint">
          Current synthetic plot reference: {record.syntheticPlotReference}
        </p> : null}
        {synthetic ? <p className="input-hint">
          Imported sample records use PERMANENT / ASH as synthetic project defaults,
          not verified interment facts. Confirmation and publication rules still apply.
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

export function BurialRecordDetail({ recordId, returnTo, saved = false }: {
  recordId: string; returnTo?: string; saved?: boolean;
}) {
  const state = useRecord(recordId);
  const record = state.data?.record;
  const back = safeBurialReturnTo(returnTo);
  const editHref = burialDirectory + "/" + recordId + "/edit?" + new URLSearchParams({ returnTo: back });
  let content: ReactNode = <p role="status">Loading deceased and interment record…</p>;
  if (state.error) content = <LoadError message={state.error} onRetry={state.retry} />;
  else if (state.data && !record) content = <MissingRecord back={back} />;
  else if (record) content = <>
    {saved ? <Alert title="Record saved" variant="success">
      Deceased and interment details were saved successfully.
    </Alert> : null}
    <RecordVisibility record={record} onReload={state.retry} />
    <RecordSection title="Deceased person">
      <Detail label="Full / display name">{record.name}</Detail>
      <Detail label="Sex">{record.sex ? sexLabels[record.sex] : null}</Detail>
      <Detail label="Birth date">{record.birthDate}</Detail>
      <Detail label="Death date">{record.deathDate}</Detail>
      <Detail label="Memorial inscription">{record.inscription || null}</Detail>
    </RecordSection>
    <RecordSection title="Interment">
      <Detail label="Interment date">{record.intermentDate}</Detail>
      <Detail label="Interment status">{record.intermentStatus}</Detail>
      <Detail label="Remains type">{record.remainsType}</Detail>
      <Detail label="Verified interment order">{record.intermentOrderNumber}</Detail>
      <Detail label="Interment confirmation">{record.intermentConfirmed === true
        ? "Confirmed" : record.intermentConfirmed === false ? "Not confirmed" : "Not recorded"}</Detail>
    </RecordSection>
    <RecordSection title="Associated cemetery plot">
      <Detail label="Garden / area">{record.section}</Detail>
      {record.syntheticPlotReference ? <Detail label="Gravesite Reference">
        {record.syntheticPlotReference}
      </Detail> : null}
      {isSyntheticPlot(record.plot) ? <Detail label="Plot classification">
        Synthetic project plot; no verified physical location or commercial availability.
        Availability and capacity support project admissions only. PERMANENT / ASH are project defaults.
      </Detail> : <Detail label="Lot">{record.plot}</Detail>}
    </RecordSection>
    <RecordSection title="Record status">
      <Detail label="Record status">{record.recordStatus}</Detail>
      <Detail label="Service provider">{record.serviceProvider}</Detail>
      <Detail label="Last updated">{record.updatedAt}</Detail>
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
  </>;
  return <AdminPageFrame
    title={record?.name || "Deceased / Interment Record"}
    description={record ? "Burial record #" + record.burialId + " · Restricted staff record" : undefined}
    breadcrumbs={[
      { label: "Dashboard", href: "/admin" },
      { label: "Deceased & Interments", href: back },
      { label: "Record details" },
    ]}
    actions={record ? <Link className="button button--secondary button--md" href={editHref}>
      Edit record
    </Link> : undefined}
  >
    {content}
    <Link className="subtle-link" href={back}>Back to Deceased & Interments</Link>
  </AdminPageFrame>;
}

function RecordSection({ title, children }: { title: string; children: ReactNode }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader>
    <CardContent><dl className={styles.profile}>{children}</dl></CardContent>
  </Card>;
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt>{label}</dt><dd>{children ?? "Not recorded"}</dd></div>;
}

function SelectField({ label, value, options, onChange, disabled }: {
  label: string; value: string; options: string[][]; onChange: (value: string) => void; disabled?: boolean;
}) {
  return <label className="input-field">
    <span className="input-label">{label}</span>
    <select className="input-control" disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)}>
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
