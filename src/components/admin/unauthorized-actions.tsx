"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function UnauthorizedActions({ isActiveStaff }: { isActiveStaff: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    if (busy) return;
    setBusy(true);
    try {
      await signOut();
      router.push("/admin/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "10px", width: "100%" }}>
      {isActiveStaff ? (
        <Link href="/admin">
          <Button className="button--full" size="lg">Back to Dashboard</Button>
        </Link>
      ) : (
        <Button className="button--full" disabled={busy} onClick={() => void handleSignOut()} size="lg" variant="secondary">
          {busy ? "Signing out…" : "Sign out and switch account"}
        </Button>
      )}
      <Link href="/">
        <Button className="button--full" size="lg" variant="quiet">Open Visitor Site</Button>
      </Link>
    </div>
  );
}
