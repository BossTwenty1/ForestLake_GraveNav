"use client";

import { Button } from "@/components/ui/button";

export function ReportPrintButton() {
  return <Button onClick={() => window.print()} variant="secondary">Print report</Button>;
}
