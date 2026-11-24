"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { localSupabaseConfig, getBrowserSupabase } from "@/lib/supabase/config";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { BrandLockup } from "@/components/brand-lockup";
import { getAuthFlowType, restoreSessionFromAuthUrl } from "@/lib/auth-client";
import { ThemeToggle } from "@/components/theme-toggle";

function initialMessageFor(code?: string): { title: string; copy: string; variant: "danger" | "info" | "success" } {
  if (code === "config") {
    return { title: "Authentication not configured", copy: "Supabase environment variables are missing for this deployment.", variant: "danger" };
  }
  if (code === "auth_callback") {
    return { title: "Sign-in link expired", copy: "Please sign in below or request a new password reset email.", variant: "info" };
  }
  return { title: "", copy: "", variant: "info" };
}

export function AdminLoginForm({ initialError }: { initialError?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ title: string; copy: string; variant: "danger" | "info" | "success" }>(() => initialMessageFor(initialError));

  useEffect(() => {
    const flowType = getAuthFlowType();
    if (flowType !== "invite" && flowType !== "recovery" && flowType !== "password_setup") return;

    let active = true;
    void (async () => {
      if (active && await restoreSessionFromAuthUrl()) router.replace("/auth/set-password");
    })();
    return () => { active = false; };
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage({ title: "", copy: "", variant: "info" });
    const client = getBrowserSupabase();
    if (!client) {
      setMessage({ title: "Supabase is not configured", copy: "Add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local, then restart the frontend.", variant: "info" });
      return;
    }

    if (mode === "reset") {
      if (!email.trim()) {
        setMessage({ title: "Enter your email", copy: "Enter the email address associated with your staff account.", variant: "danger" });
        return;
      }
      setBusy(true);
      try {
        const redirectTo = `${window.location.origin}/auth/callback?type=recovery`;
        const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo });
        if (error) {
          setMessage({ title: "Reset unavailable", copy: "A password reset email could not be sent right now. Try again shortly.", variant: "danger" });
          return;
        }
        setMessage({
          title: "Check your email",
          copy: "If an active staff account exists for that email, a password reset link has been sent.",
          variant: "success",
        });
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!email.trim() || !password) {
      setMessage({ title: "Check your details", copy: "Enter the administrator email and password to continue.", variant: "danger" });
      return;
    }
    setBusy(true);
    try {
      const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setMessage({ title: "Unable to sign in", copy: "The email or password was not accepted, or the Auth service is unavailable.", variant: "danger" });
        return;
      }
      router.push("/admin");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin-login-page" id="main-content">
      <a className="skip-link" href="#admin-login-form">Skip to sign in</a>
      <div className="admin-login-card">
        <div className="admin-login-topline">
          <Link href="/" aria-label="Back to GraveNav home"><BrandLockup /></Link>
          <ThemeToggle compact />
        </div>
        <div className="admin-login-heading">
          <div className="badge-row">
            <Badge icon="shield" variant="info">Protected workspace</Badge>
            <Badge variant="info">{localSupabaseConfig.environmentLabel}</Badge>
          </div>
          <h1>{mode === "reset" ? "Reset staff password" : "Administrator sign in"}</h1>
          <p>
            {mode === "reset"
              ? "Enter your staff email to receive a secure password recovery link."
              : "Use a Supabase Auth account with an active ADMIN or MANAGER role."}
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="card-title-with-icon">
              <Icon className="text-green" name="shield" size={22} />
              {mode === "reset" ? "Password recovery" : "Sign in to GraveNav"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="admin-form" id="admin-login-form" onSubmit={submit}>
              <Input
                autoComplete="username"
                label="Email address"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="staff@forestlake.ph"
                type="email"
                value={email}
              />
              {mode === "signin" ? (
                <Input
                  autoComplete="current-password"
                  label="Password"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter password"
                  type="password"
                  value={password}
                />
              ) : null}
              <Button className="button--full" disabled={busy} icon="shield" size="lg" type="submit">
                {busy
                  ? mode === "reset" ? "Sending reset link…" : "Signing in…"
                  : mode === "reset" ? "Send password reset email" : "Sign in"}
              </Button>
              <button
                className="text-button"
                onClick={() => {
                  setMessage({ title: "", copy: "", variant: "info" });
                  setMode((current) => (current === "signin" ? "reset" : "signin"));
                }}
                type="button"
              >
                {mode === "signin" ? "Forgot password?" : "Back to sign in"}
              </button>
              {message.copy ? (
                <Alert icon={message.variant === "danger" ? "alert" : message.variant === "success" ? "check" : "info"} title={message.title} variant={message.variant}>
                  {message.copy}
                </Alert>
              ) : null}
            </form>
          </CardContent>
        </Card>
        <p className="admin-login-footnote">Visitor search remains available without an account. Staff accounts are managed by cemetery administrators.</p>
        {!localSupabaseConfig.configured ? <p className="admin-login-config">Supabase Auth is not configured. Add the public Supabase variables to .env.local, then restart the frontend.</p> : null}
      </div>
    </main>
  );
}
