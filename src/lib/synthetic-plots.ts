// Internal lot-code key format used by the Phase 2 plot register.
export function isSyntheticPlot(lotCode: string | null | undefined): boolean {
  return typeof lotCode === "string" && /^P2S-[0-9a-f]{64}$/.test(lotCode);
}

export const syntheticPlotDescription =
  "Forest Lake Phase 2 cemetery plot managed in the active plot register.";

export function plotOptionLabel(lotCode: string, friendlyReference?: string | null): string {
  if (friendlyReference?.trim()) return friendlyReference.trim();
  return isSyntheticPlot(lotCode) ? "Phase 2 plot" : lotCode;
}

export function plotAvailabilityLabel(_lotCode: string, status: string): string {
  switch (status.toUpperCase()) {
    case "AVAILABLE":
      return "Available";
    case "BOOKED":
      return "Booked";
    case "HOLD":
      return "On hold";
    case "UNKNOWN":
      return "Unknown";
    default:
      return status;
  }
}
