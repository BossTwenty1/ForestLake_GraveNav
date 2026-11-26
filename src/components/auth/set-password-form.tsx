"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BrandLockup } from "@/components/brand-lockup";
import { localSupabaseConfig } from "@/lib/supabase/config";
import { validateStaffPassword } from "@/lib/staff-password";

export function SetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingNotice, setPendingNotice] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setPendingNotice("");
    const strength = validateStaffPassword(password);
    if (!strength.valid) {
      setError(strength.error || "Choose a stronger password.");
      return;
    }
    if (password !== confirmation) {
      setError("The password confirmation does not match.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      let result: { destination?: string | null; accountStatus?: string; notice?: string; error?: string } = {};
      try {
        result = await response.json() as typeof result;
      } catch {
        // Fallback handled below.
      }
      if (result.accountStatus === "PENDING") {
        setPendingNotice(
          result.notice || "Your password was saved. An Administrator must grant access before you can sign in.",
        );
        return;
      }
      if (result.destination) {
        window.location.assign(result.destination);
        return;
      }
      setError(result.error || "Your password was saved, but the GraveNav account could not be verified.");
    } catch {
      setError("Your password may have been saved, but we could not reach the server to verify your account. Try signing in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin-login-page">
      <div className="admin-login-card">
        <Link href="/" aria-label="Back to GraveNav home"><BrandLockup /></Link>
        <div className="admin-login-heading">
          <div className="badge-row">
            <Badge icon="shield" variant="info">Protected workspace</Badge>
            <Badge variant="info">{localSupabaseConfig.environmentLabel}</Badge>
          </div>
          <h1>Set your GraveNav password</h1>
          <p>Finish setting up your staff account before entering the protected workspace.</p>
        </div>
        <Card>
          <CardHeader><CardTitle>{pendingNotice ? "Password saved" : "Choose a password"}</CardTitle></CardHeader>
          <CardContent>
            {pendingNotice ? (
              <div className="admin-form">
                <Alert icon="check" title="Awaiting administrator activation" variant="success">
                  {pendingNotice}
                </Alert>
                <Link href="/admin/login">
                  <Button className="button--full" size="lg" variant="secondary">Return to administrator sign in</Button>
                </Link>
              </div>
            ) : (
              <form className="admin-form" onSubmit={submit}>
                <Input autoComplete="new-password" hint="Use at least 8 characters, including a letter and a number." label="New password" minLength={8} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
                <Input autoComplete="new-password" label="Confirm password" minLength={8} onChange={(event) => setConfirmation(event.target.value)} required type="password" value={confirmation} />
                {error ? <Alert icon="alert" title="Password setup unavailable" variant="danger">{error}</Alert> : null}
                <Button className="button--full" disabled={busy} icon="shield" size="lg" type="submit">{busy ? "Saving password…" : "Set password"}</Button>
              </form>
            )}
          </CardContent>
        </Card>
        <p className="admin-login-footnote">Your password is handled by Supabase Auth. Visitors can continue using public GraveNav search without an account.</p>
      </div>
    </main>
  );
}
