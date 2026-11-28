import type { AdminRecord } from "./supabase/types";
import { recordInputFromRecord } from "./burial-records";

export function visitorVisibilityLabel(record: Pick<AdminRecord, "visitorVisible">) {
  return record.visitorVisible === true ? "Published" : record.visitorVisible === false ? "Staff only" : "Visibility unavailable";
}

// Mirrors the existing public view's eligibility predicates; not a stored status.
export function publicationBlocker(record: Pick<AdminRecord, "recordStatus" | "lotRemoved">) {
  if (record.lotRemoved) return "The associated plot has been removed or is unavailable.";
  if (record.recordStatus !== "active") {
    return "This record is " + record.recordStatus +
      ". Review its status through Edit record before publishing. Publishing will not activate it.";
  }
  return null;
}

export function visibilityInput(record: AdminRecord, publish: boolean) {
  const reason = publicationBlocker(record);
  if (publish && reason) throw new Error(reason);
  return recordInputFromRecord(record, { publicDisplay: publish });
}
