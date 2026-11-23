"use client";

import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeading } from "@/components/ui/page-heading";

type Result = {
  identity: { status: "VERIFIED" | "BLOCKED"; username?: string; userId?: string;
    project?: string; role?: string; checkedAt?: string };
  holds?: string[];
  reason?: string;
  progress?: { completed: number; total: number; pending: boolean };
  writesEnabled?: boolean;
  executionStatus?: "BLOCKED" | "READY" | "COMPLETE";
  approvedStartAt?: number;
};

async function checkReadiness(action: "readiness" | "continue" = "readiness"): Promise<Result> {
  const response = await fetch("/api/admin/phase2-import", {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  return response.json();
}

export async function runApprovedImport(
  initial: number, request: () => Promise<Result>, publish: (value: Result) => void,
  paused: () => boolean,
) {
  let completed = initial;
  if (!Number.isInteger(completed) || completed < 0 || completed > 235) {
    throw new Error("The starting receipt count is unexpected. Stop and reconcile.");
  }
  for (let batch = 0; completed < 235 && !paused(); batch++) {
    if (batch >= 47) throw new Error("The bounded run stopped before completion. Reconcile before continuing.");
    const value = await request();
    const next = value.progress?.completed;
    if (value.identity.status !== "VERIFIED" || !value.writesEnabled ||
      !["READY", "COMPLETE"].includes(value.executionStatus || "") ||
      value.progress?.total !== 235 || value.progress.pending ||
      !Number.isInteger(next) || next === undefined || next <= completed ||
      next > Math.min(235, completed + 5)) {
      throw new Error(value.reason || "The batch response is unexpected. Stop and reconcile the journal.");
    }
    publish(value);
    completed = next;
  }
}

export function approvedFirstRun(value: Result) {
  return value.identity.status === "VERIFIED" && value.writesEnabled === true &&
    value.executionStatus === "READY" &&
    value.progress?.completed === (value.approvedStartAt ?? 0) &&
    value.progress.total === 235 && !value.progress.pending;
}

export function Phase2ImportControl() {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [pauseRequested, setPauseRequested] = useState(false);
  const stopRequested = useRef(false);
  const runActive = useRef(false);
  async function verify(action: "readiness" | "continue" = "readiness") {
    setBusy(true);
    setError("");
    try {
      setResult(await checkReadiness(action));
    } catch { setError("Readiness could not be checked. Refresh this local page and try again."); }
    finally { setBusy(false); }
  }
  async function run(snapshot: Result | null) {
    if (!snapshot?.writesEnabled || snapshot.executionStatus !== "READY" || runActive.current) return;
    runActive.current = true;
    stopRequested.current = false;
    setPauseRequested(false);
    setBusy(true);
    setRunning(true);
    setError("");
    try {
      await runApprovedImport(snapshot.progress?.completed ?? 0,
        () => checkReadiness("continue"), setResult, () => stopRequested.current);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Import stopped. Reconcile before continuing.");
    } finally { runActive.current = false; setBusy(false); setRunning(false); }
  }
  useEffect(() => {
    let active = true;
    checkReadiness().then(async (value) => {
      if (active) {
        setResult(value);
        if (approvedFirstRun(value)) await run(value);
      }
    })
      .catch(() => { if (active) setError("Readiness could not be checked. Try again."); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; stopRequested.current = true; };
  }, []);
  const verified = result?.identity.status === "VERIFIED";
  return <div className="admin-page-frame">
    <PageHeading title="Phase 2 import readiness"
      description="Temporary local control for the approved fictional dataset. Each request uses your verified session." />
    <Alert title={result ? "Identity " + result.identity.status : "Checking signed-in identity…"}
      variant={verified ? "success" : "warning"}>
      {verified ? <>
        <p>{result.identity.username} · {result.identity.role} · ACTIVE</p>
        <p>Auth user ID: {result.identity.userId}</p>
        <p>Supabase project: {result.identity.project}</p>
        <p>Checked: {result.identity.checkedAt}</p>
      </> : <p>{result?.reason || "Validating the existing Supabase Auth session on the server."}</p>}
    </Alert>
    <p>45 fictional owners · 90 synthetic plots · 100 deceased/interment pairs · 235 fixed saves.</p>
    <p>All imported records will remain pending, hidden and unconfirmed.
      The 45 unowned plots and ten shared groups are retained.</p>
    {result?.progress ? <p role="status">
      Recorded protected receipts: {result.progress.completed} / {result.progress.total}.
      {result.progress.pending ? " One request needs exact replay/reconciliation." : ""}
    </p> : null}
    <Alert title={"Hosted execution " + (result?.executionStatus || "BLOCKED")} variant="warning">
      <ul>{(result?.reason ? [result.reason] : result?.holds || ["Hosted writes are hard-disabled."])
        .map((hold) => <li key={hold}>
        {hold}
      </li>)}</ul>
    </Alert>
    {error ? <Alert title="Check unavailable" variant="danger">{error}</Alert> : null}
    <div className="admin-form-actions">
      <Button disabled={busy} onClick={() => void verify()}>
        {busy ? "Verifying…" : "Verify identity and readiness"}
      </Button>
      <Button
        disabled={busy || !result?.writesEnabled || result.executionStatus !== "READY"}
        onClick={() => void run(result)}
        variant="secondary"
      >
        {result?.progress?.completed === 235 ? "Import complete" :
          result?.writesEnabled && result.executionStatus === "READY"
            ? "Run approved import (5 saves per batch)" : "Import disabled pending approval"}
      </Button>
      {running ? <Button disabled={pauseRequested} variant="secondary" onClick={() => {
        stopRequested.current = true;
        setPauseRequested(true);
      }}>{pauseRequested ? "Pausing after this batch…" : "Pause after current batch"}</Button> : null}
    </div>
  </div>;
}
