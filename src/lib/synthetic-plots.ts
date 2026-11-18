// Reserved by GRAVENAV-P2S-20261117; identical to the staff read RPC predicate.
export function isSyntheticPlot(lotCode: string | null | undefined): boolean {
  return typeof lotCode === "string" && /^P2S-[0-9a-f]{64}$/.test(lotCode);
}

export const syntheticPlotDescription =
  "Synthetic project plot — no verified physical location or commercial availability. " +
  "Availability and capacity apply only to fictional sample admissions.";

export function plotOptionLabel(lotCode: string): string {
  return isSyntheticPlot(lotCode) ? "Synthetic project plot — " + lotCode : lotCode;
}

export function plotAvailabilityLabel(lotCode: string, status: string): string {
  if (!isSyntheticPlot(lotCode)) return status;
  return status === "AVAILABLE" ? "Sample admission eligible" : "Sample admissions paused";
}
