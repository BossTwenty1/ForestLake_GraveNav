import type { BurialRecordInput } from "./supabase/admin-data";
import type { AdminRecord } from "./supabase/types";

export const burialDirectory = "/admin/burial-records";

export function safeBurialReturnTo(value?: string) {
  return value === burialDirectory || value?.startsWith(burialDirectory + "?")
    ? value : burialDirectory;
}

export function recordInputFromRecord(
  record: AdminRecord,
  override: Partial<BurialRecordInput> = {},
): BurialRecordInput {
  return {
    revision: record.revision,
    name: record.name,
    sex: record.sex,
    lotId: record.lotId,
    birthDate: record.birthDate || "",
    deathDate: record.deathDate || "",
    publicDisplay: record.publicDisplay,
    intermentDate: record.intermentDate || "",
    recordStatus: record.recordStatus,
    intermentStatus: record.intermentStatus as BurialRecordInput["intermentStatus"],
    remainsType: record.remainsType as BurialRecordInput["remainsType"],
    referenceNo: record.referenceNo || "",
    intermentOrderNumber: record.intermentOrderNumber ?? undefined,
    intermentConfirmed: record.intermentConfirmed ?? undefined,
    serviceProvider: record.serviceProvider || "",
    recordSource: record.recordSource || "",
    qualityNotes: record.qualityNotes || "",
    inscription: record.inscription ?? undefined,
    ...override,
  };
}
