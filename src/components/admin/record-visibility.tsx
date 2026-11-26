"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useStaff } from "./staff-context";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { getRecordVisitorVisibility, updateBurialRecord } from "@/lib/supabase/admin-data";
import { publicationBlocker, visibilityInput } from "@/lib/record-visibility";
import type { AdminRecord } from "@/lib/supabase/types";
import styles from "./owner-pages.module.css";

export function RecordVisibility({ record, onReload }: {
  record: AdminRecord; onReload: () => void;
}) {
  const staff = useStaff();
  const allowed = staff?.isActive && staff.accountStatus === "ACTIVE" &&
    (staff.role === "SUPER_ADMIN" || staff.role === "ADMIN" || staff.role === "MANAGER");
  const [visible, setVisible] = useState<boolean | null>(null);
  const [readError, setReadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [confirm, setConfirm] = useState<"publish" | "hide" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const blocker = publicationBlocker(record);

  useEffect(() => {
    let active = true;
    getRecordVisitorVisibility(record.burialId).then((isVisible) => {
      if (active) { setVisible(isVisible); setReadError(""); }
    }).catch(() => {
      if (active) { setVisible(null); setReadError("Visitor visibility could not be checked."); }
    });
    return () => { active = false; };
  }, [record.burialId, record.revision, attempt]);

  async function save() {
    if (!allowed || !confirm || busy) return;
    const publish = confirm === "publish";
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await updateBurialRecord(record.burialId, visibilityInput(record, publish));
      setConfirm(null);
      setVisible(null);
      setMessage(publish ? "Publication setting saved." :
        "Record hidden. Its interment details were retained.");
      setAttempt((value) => value + 1);
      onReload();
    } catch (reason) {
      setConfirm(null);
      setError(reason instanceof Error ? reason.message : "Visibility could not be saved. Please retry.");
    } finally { setBusy(false); }
  }

  let summary = "Checking visitor visibility…";
  if (readError) summary = "Visitor visibility unavailable";
  else if (visible === true) summary = "Published — visible to visitors";
  else if (visible === false) summary = "Not visible to visitors";
  return <Card>
    <CardHeader><CardTitle>Visitor visibility</CardTitle></CardHeader>
    <CardContent>
      <p aria-live="polite"><strong>{summary}</strong></p>
      {blocker && visible !== true ? <p>{blocker}</p> : null}
      {!blocker && visible === false && !record.publicDisplay
        ? <p>This record is hidden. Review the visitor preview before publishing.</p> : null}
      {!blocker && visible === false && record.publicDisplay
        ? <p>The display setting is enabled, but the public reader has not confirmed visibility.
          Reload the record to review its current state.</p> : null}
      {readError ? <Alert title="Visibility check failed" variant="warning">{readError}</Alert> : null}
      {error ? <Alert title="Visibility was not changed" variant="danger">{error}</Alert> : null}
      {message ? <Alert title="Visibility update" variant="success">{message}</Alert> : null}
      <div className={styles.actions}>
        <Link className="button button--secondary button--md"
          href={"/admin/burial-records/" + record.burialId + "/preview"}>
          Preview as Visitor
        </Link>
        {allowed && !record.publicDisplay ? <Button
          disabled={busy || Boolean(blocker) || visible === null || Boolean(readError)}
          onClick={() => setConfirm("publish")}
        >Publish Record</Button> : null}
        {allowed && record.publicDisplay ? <Button
          disabled={busy} onClick={() => setConfirm("hide")} variant="secondary"
        >Hide Record</Button> : null}
        <Button disabled={busy} onClick={() => {
          setError(""); setMessage(""); setVisible(null); setAttempt((value) => value + 1); onReload();
        }} variant="quiet">Reload status</Button>
      </div>
      <ConfirmationDialog
        open={Boolean(confirm)}
        title={confirm === "publish" ? "Publish this record?" : "Hide this record?"}
        description={<p>{confirm === "publish"
          ? "The approved deceased information will appear to visitors only while the existing eligibility rules are met. Record status and interment details will stay unchanged."
          : "This removes the record from visitor search, profiles and memorial map details. It does not delete the record or change its interment details."}</p>}
        confirmLabel={busy ? "Saving…" : confirm === "publish" ? "Publish Record" : "Hide Record"}
        onConfirm={() => void save()}
        onClose={() => { if (!busy) setConfirm(null); }}
      />
    </CardContent>
  </Card>;
}
