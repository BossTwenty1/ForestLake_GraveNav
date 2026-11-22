"use client";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export default function PreviewError({ reset }: { reset: () => void }) {
  return <Alert title="Visitor preview unavailable" variant="danger">
    <p>The preview could not be loaded. No visibility change was made.</p>
    <Button onClick={reset} variant="secondary">Retry preview</Button>
  </Alert>;
}
