"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export default function PreviewError({ reset }: { reset: () => void }) {
  return (
    <div className="admin-page-frame" style={{ maxWidth: 680, margin: "40px auto", padding: "0 20px" }}>
      <Alert title="Visitor preview unavailable" variant="danger">
        <p>The preview could not be loaded. No visibility change was made.</p>
        <div className="admin-form-actions">
          <Button onClick={reset} variant="secondary">Retry preview</Button>
          <Link className="subtle-link" href="/admin/burial-records">Back to Deceased &amp; Interments</Link>
        </div>
      </Alert>
    </div>
  );
}
