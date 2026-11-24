"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { localSupabaseConfig } from "@/lib/supabase/config";
import { restoreAuthCallback } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function AuthCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;

    async function finishAuth() {
      const result = await restoreAuthCallback();
      if (!result.ok) {
        if (active) setError(true);
        return;
      }

      const flowType = result.flowType || searchParams.get("type")?.toLowerCase();
      if (isPasswordSetupType(flowType)) {
        window.history.replaceState({}, document.title, "/auth/callback");
        router.replace("/auth/set-password");
      } else {
        router.replace("/admin");
      }
    }

    void finishAuth();
    return () => { active = false; };
  }, [router, searchParams]);

  return (
    <main className="admin-login-page">
      <div className="admin-login-card">
        <div className="admin-login-heading">
          <h1>{error ? "Sign-in link unavailable" : "Finishing secure sign-in"}</h1>
          <p>
            {error
              ? "This link is invalid or expired. Request a new password recovery email or invitation."
              : "Please wait while GraveNav verifies your session."}
          </p>
        </div>
        {error ? (
          <>
            <p className="admin-login-config">{localSupabaseConfig.environmentLabel} authentication could not be completed.</p>
            <Link href="/admin/login">
              <Button className="button--full" size="lg">Return to administrator sign in</Button>
            </Link>
          </>
        ) : null}
      </div>
    </main>
  );
}

function isPasswordSetupType(value: string | undefined) {
  return value === "invite" || value === "recovery" || value === "password_setup";
}
