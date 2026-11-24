"use client";

import { getBrowserSupabase } from "./config";
import { acknowledgeRequest, mutationFingerprint, pendingRequestId } from "./mutation-receipts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "./database.types";
import type { AdminAccount, AdminLot, AdminPhoto, AdminRecord, GraveType, AuditLogEntry, BurialPlotOption, CoordinateVerificationItem, CoordinateVerificationSummary, DashboardData, LotOwner, PlotAreaOption, PlotManagementItem, PlotManagementSummary } from "./types";

const RECORD_COLUMNS = "revision,burial_id,deceased_id,lot_id,interment_date,record_status,interment_status,remains_type,reference_no,service_provider,record_source,quality_notes,inscription,created_by,updated_by,updated_at,interment_order_number,interment_confirmed";
const DECEASED_COLUMNS = "deceased_id,display_name,birth_date,death_date,public_display";
const LOT_COLUMNS = "revision,lot_id,lot_code,area_id,block_id,lot_owner_id,legacy_location_code,legacy_pa_number,status,length_m,width_m,px_loc_x,px_loc_y,location_geom,coordinate_accuracy_m,coordinate_status,coordinate_verified,coordinate_rejection_reason,updated_at,deleted_at";
const OWNER_COLUMNS = "revision,lot_owner_id,first_name,middle_name,last_name,suffix,aliases,address,representative_name,representative_contact,representative_relation";
const PHOTO_COLUMNS = "revision,photo_id,burial_id,file_name,caption,captured_at,approval_status,public_display,created_at,uploaded_by";
const PHOTO_COLUMNS_EXTENDED = `${PHOTO_COLUMNS},photo_kind,submitted_by_name,submitted_by_relation,submitted_by_contact`;
const PHOTO_COLUMNS_V1_WITH_RECORD = `${PHOTO_COLUMNS},photo_kind,submitted_by_name,submitted_by_relation,burial_record(lot_id,deceased(display_name),lot(lot_code))`;
const PHOTO_COLUMNS_WITH_RECORD = `${PHOTO_COLUMNS_EXTENDED},burial_record(lot_id,deceased(display_name),lot(lot_code))`;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

export type PageResult<T> = { items: T[]; hasMore: boolean; total: number | null };
type PageOptions = { page?: number; pageSize?: number };
type OwnerPageOptions = PageOptions & { search?: string };
export type BurialRecordSort = "updated" | "name" | "plot" | "interment-date" | "status";
export type BurialRecordDirection = "asc" | "desc";
export type BurialRecordQuery = {
  query: string;
  section: string;
  status: AdminRecord["recordStatus"] | "all";
  verification: AdminRecord["coordinateStatus"] | "verified" | "all";
  dateFilter: "all" | "this-year" | "last-five-years" | "undated";
  sort: BurialRecordSort;
  direction: BurialRecordDirection;
  page: number;
  pageSize: number;
};
export type BurialRecordPage = {
  items: AdminRecord[];
  total: number;
  totalAll: number;
  sections: string[];
};
export type PlotManagementSort = "updated" | "plot" | "area" | "state" | "coordinate";
export type PlotManagementQuery = {
  query: string;
  area: string;
  state: PlotManagementItem["operationalState"] | "all";
  verification: PlotManagementItem["coordinateState"] | "all";
  sort: PlotManagementSort;
  direction: "asc" | "desc";
  page: number;
  pageSize: number;
};
export type PlotManagementPage = {
  items: PlotManagementItem[];
  total: number;
  totalAll: number;
  summary: PlotManagementSummary;
  areas: PlotAreaOption[];
};
export type CoordinateVerificationSort = "priority" | "updated" | "plot" | "area" | "status" | "accuracy";
export type CoordinateVerificationQuery = {
  query: string;
  area: string;
  state: CoordinateVerificationItem["coordinateState"] | "actionable" | "all";
  sort: CoordinateVerificationSort;
  direction: "asc" | "desc";
  page: number;
  pageSize: number;
};
export type CoordinateVerificationPage = {
  items: CoordinateVerificationItem[];
  total: number;
  totalAll: number;
  summary: CoordinateVerificationSummary;
  areas: PlotAreaOption[];
};
export type LotRow = { revision: number; coordinate_rejection_reason: string | null; lot_id: number; lot_code: string; area_id: number; block_id: number | null; lot_owner_id: number | null; legacy_location_code: string | null; legacy_pa_number: string | null; status: "UNKNOWN" | "AVAILABLE" | "BOOKED" | "HOLD"; length_m: number | null; width_m: number | null; px_loc_x: number | null; px_loc_y: number | null; location_geom: unknown; coordinate_accuracy_m: number | null; coordinate_status: "pending" | "verified" | "rejected"; coordinate_verified: boolean; updated_at: string; location: { longitude: number; latitude: number } | null };
type OwnerRow = { revision: number; lot_owner_id: number; first_name: string; middle_name: string | null; last_name: string; suffix: string | null; aliases: string | null; address: string; representative_name: string | null; representative_contact: string | null; representative_relation: string | null };

export async function getAdminRecords(options: PageOptions = {}) {
  return (await getAdminRecordsPage(options)).items;
}

export async function getAllAdminRecords() {
  const items: AdminRecord[] = [];
  let page = 0;
  let nextPage: PageResult<AdminRecord>;
  do {
    nextPage = await getAdminRecordsPage({ page });
    items.push(...nextPage.items);
    page += 1;
  } while (nextPage.hasMore);
  return items;
}

export async function getAdminRecordsPage(
  options: PageOptions & { recordId?: number } = {},
): Promise<PageResult<AdminRecord>> {
  const client = requireClient();
  const { from, to } = pageRange(options);
  let query = client.from("burial_record").select(RECORD_COLUMNS, { count: "exact" })
    .is("deleted_at", null);
  if (options.recordId !== undefined) query = query.eq("burial_id", options.recordId);
  const { data: records, error, count } = await query
    .order("updated_at", { ascending: false }).order("burial_id", { ascending: false })
    .range(from, to);
  if (error) throw error;
  if (!records?.length) return { items: [], hasMore: false, total: count };

  const deceasedIds = records.map((record) => record.deceased_id);
  const lotIds = records.map((record) => record.lot_id);
  const [{ data: deceased, error: deceasedError }, { data: lots, error: lotsError }] = await Promise.all([
    client.from("deceased").select(DECEASED_COLUMNS).in("deceased_id", deceasedIds),
    client.from("lot").select(LOT_COLUMNS).in("lot_id", lotIds),
  ]);
  if (deceasedError) throw deceasedError;
  if (lotsError) throw lotsError;
  const areaIds = (lots || []).map((lot) => lot.area_id).filter((areaId): areaId is number => areaId !== null && areaId !== undefined);
  const { data: areas, error: areasError } = areaIds.length ? await client.from("area").select("area_id,area_name").in("area_id", areaIds) : { data: [], error: null };
  if (areasError) throw areasError;

  const deceasedById = new Map((deceased || []).map((item) => [item.deceased_id, item]));
  const lotById = new Map((lots || []).map((item) => [item.lot_id, item]));
  const areaById = new Map((areas || []).map((item) => [item.area_id, item]));
  const items = records.map((record) => {
    const deceasedRecord = deceasedById.get(record.deceased_id);
    const lot = lotById.get(record.lot_id);
    const area = lot?.area_id ? areaById.get(lot.area_id) : undefined;
    return {
      revision: record.revision,
      burialId: record.burial_id,
      name: deceasedRecord?.display_name || "Unnamed record",
      deceasedId: record.deceased_id,
      lotId: record.lot_id,
      lotRemoved: !lot || Boolean(lot.deleted_at),
      plot: lot?.lot_code || "Unassigned",
      section: area?.area_name || "Unassigned",
      recordStatus: enumValue(record.record_status, ["active", "pending", "archived"]),
      birthDate: deceasedRecord?.birth_date || null,
      deathDate: deceasedRecord?.death_date || null,
      publicDisplay: Boolean(deceasedRecord?.public_display),
      intermentDate: record.interment_date,
      intermentStatus: record.interment_status,
      remainsType: record.remains_type,
      referenceNo: record.reference_no,
      intermentOrderNumber: record.interment_order_number,
      intermentConfirmed: record.interment_confirmed,
      serviceProvider: record.service_provider || null,
      recordSource: record.record_source || null,
      qualityNotes: record.quality_notes || null,
      inscription: record.inscription || null,
      updatedAt: record.updated_at,
      location: parsePoint(lot?.location_geom),
      pixelLocation: lot?.px_loc_x !== null && lot?.px_loc_x !== undefined && lot?.px_loc_y !== null && lot?.px_loc_y !== undefined ? { x: lot.px_loc_x, y: lot.px_loc_y } : null,
      coordinateStatus: enumValue(lot?.coordinate_status || "pending", ["pending", "verified", "rejected"]),
      coordinateVerified: Boolean(lot?.coordinate_verified),
    } satisfies AdminRecord;
  });
  return { items, hasMore: hasMore(from, items.length, count), total: count };
}

export async function getAvailableBurialPlots() {
  const { data, error } = await requireClient().rpc("staff_interment_plot_options");
  if (error) throw error;
  if (!Array.isArray(data) || !data.every((item) => isObject(item)
    && isCount(item.lotId) && typeof item.lotCode === "string" && typeof item.section === "string"
    && item.status === "AVAILABLE" && (item.graveType === null || item.graveType === "regular" || item.graveType === "mausoleum")
    && isCount(item.confirmedCount) && isCount(item.remaining))) throw new Error("Plot availability could not be read.");
  return data as BurialPlotOption[];
}

export async function getAdminRecord(id: string): Promise<AdminRecord | null> {
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) return null;
  const record = (await getAdminRecordsPage({ recordId: Number(id), pageSize: 1 })).items[0];
  if (!record) return null;
  const client = requireClient();
  const [referencesResult, personResult] = await Promise.all([
    client.rpc("staff_sample_plot_references", { p_lot_ids: [record.lotId] }),
    client.from("deceased").select("sex").eq("deceased_id", record.deceasedId).maybeSingle(),
  ]);
  // Keep the detail page usable while the database migration is pending.
  if (personResult.error && personResult.error.code !== "42703") throw personResult.error;
  const sex = personResult.data?.sex;
  const detail = { ...record, sex: sex == null ? sex : enumValue(sex, ["female", "male"]) };
  const { data, error } = referencesResult;
  if (error?.code === "PGRST202") return detail;
  if (error) throw error;
  if (!Array.isArray(data) || !data.every((item) => isObject(item)
    && typeof item.lotId === "string"
    && (item.reference === null || typeof item.reference === "string"))) {
    throw new Error("Plot references could not be read. Please retry.");
  }
  const references = data as { lotId: string; reference: string | null }[];
  const reference = references.find((item) => item.lotId === String(record.lotId));
  return { ...detail, syntheticPlotReference: reference?.reference ?? null };
}


export async function createBurialRecord(input: BurialRecordInput) {
  return saveStaffRecord("burial_record", null, null, burialPayload(input));
}
export async function getRecordVisitorVisibility(burialId: number) {
  const { data, error } = await requireClient().from("public_burial_records")
    .select("burial_id").eq("burial_id", burialId).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
export async function updateBurialRecord(burialId: number, input: BurialRecordInput) {
  return saveStaffRecord("burial_record", burialId, input.revision ?? null, burialPayload(input));
}
export async function deleteBurialRecord(burialId: number, revision: number) {
  return saveStaffRecord("burial_record", burialId, revision, {}, "delete");
}


export async function getLotsForVerification(options: PageOptions = {}) {
  return (await getLotsForVerificationPage(options)).items;
}

export async function getLotsForVerificationPage(options: PageOptions = {}): Promise<PageResult<LotRow>> {
  const client = requireClient();
  const { from, to } = pageRange(options);
  const { data, error, count } = await client.from("lot").select(LOT_COLUMNS, { count: "exact" }).is("deleted_at", null).order("updated_at", { ascending: false }).order("lot_id", { ascending: false }).range(from, to);
  if (error) throw error;
  const items = (data || []).map((lot) => ({ ...lot, status: enumValue(lot.status, ["UNKNOWN", "AVAILABLE", "BOOKED", "HOLD"]), coordinate_status: enumValue(lot.coordinate_status, ["pending", "verified", "rejected"]), location: parsePoint(lot.location_geom) }));
  return { items, hasMore: hasMore(from, items.length, count), total: count };
}

export async function getAdminLots(options: PageOptions = {}) {
  return (await getAdminLotsPage(options)).items;
}

export async function getAdminLotsPage(options: PageOptions = {}): Promise<PageResult<AdminLot>> {
  const lotsPage = await getLotsForVerificationPage(options);
  return { ...lotsPage, items: lotsPage.items.map((lot) => ({
    revision: lot.revision,
    lotId: lot.lot_id,
    lotCode: lot.lot_code,
    areaId: lot.area_id,
    blockId: lot.block_id,
    lotOwnerId: lot.lot_owner_id,
    legacyLocationCode: lot.legacy_location_code,
    legacyPaNumber: lot.legacy_pa_number,
    status: lot.status,
    lengthM: lot.length_m,
    widthM: lot.width_m,
    pxLocX: lot.px_loc_x,
    pxLocY: lot.px_loc_y,
    coordinateStatus: lot.coordinate_status,
    coordinateVerified: Boolean(lot.coordinate_verified),
    coordinateRejectionReason: lot.coordinate_rejection_reason,
    coordinateAccuracyM: lot.coordinate_accuracy_m,
    location: lot.location,
    updatedAt: lot.updated_at,
  } satisfies AdminLot)) };
}

export async function getPlotAreas() {
  const client = requireClient();
  const { data: areas, error } = await client.from("area").select("area_id,area_code,area_name").eq("area_category", "garden").order("area_name");
  if (error) throw error;
  return (areas || []).map((area) => ({ areaId: area.area_id, areaCode: area.area_code, label: area.area_name }) satisfies PlotAreaOption);
}

export async function getPlotManagementPage(options: PlotManagementQuery): Promise<PlotManagementPage> {
  const { data, error } = await requireClient().rpc("staff_plot_management", {
    p_query: options.query.slice(0, 160),
    p_area: options.area.slice(0, 16),
    p_state: options.state,
    p_verification: options.verification,
    p_sort: options.sort,
    p_direction: options.direction,
    p_page: options.page + 1,
    p_page_size: options.pageSize,
  });
  if (error) {
    throw new Error(error.code === "PGRST202"
      ? "The Plot Management data migration has not been applied. Contact the project administrator."
      : error.message || "Plots could not be loaded. Reload to try again.");
  }
  if (!isObject(data)
    || !Array.isArray(data.items)
    || !data.items.every(isPlotManagementItem)
    || !isCount(data.total)
    || !isCount(data.totalAll)
    || !isPlotManagementSummary(data.summary)
    || !Array.isArray(data.areas)
    || !data.areas.every(isPlotAreaOption)) {
    throw new Error("Plot Management returned an unexpected response. Reload to try again.");
  }
  const page = data as PlotManagementPage;
  const lotIds = page.items.filter(item => item.assignedBurialId || item.interments?.length).map(item => item.lotId);
  if (!lotIds.length) return page;
  const { data: references, error: referenceError } = await requireClient().rpc("staff_sample_plot_references", { p_lot_ids: lotIds });
  // Older databases retain their existing plot workflow until the local migration is approved.
  if (referenceError?.code === "PGRST202") return page;
  if (referenceError) throw new Error("Plot references could not be loaded. Reload to try again.");
  if (!Array.isArray(references) || !references.every(item => isObject(item) && typeof item.lotId === "string"
    && (item.reference === null || (typeof item.reference === "string" && item.reference.trim().length > 0 && item.reference.length <= 200)))) {
    throw new Error("Plot references returned an unexpected response. Reload to try again.");
  }
  const byLot = new Map((references as { lotId: string; reference: string | null }[]).map(item => [item.lotId, item.reference]));
  return { ...page, items: page.items.map(item => ({ ...item, syntheticPlotReference: byLot.get(String(item.lotId)) ?? null })) };
}

export async function getCoordinateVerificationPage(options: CoordinateVerificationQuery): Promise<CoordinateVerificationPage> {
  const { data, error } = await requireClient().rpc("staff_coordinate_verification", {
    p_query: options.query.slice(0, 160),
    p_area: options.area.slice(0, 16),
    p_state: options.state,
    p_sort: options.sort,
    p_direction: options.direction,
    p_page: options.page + 1,
    p_page_size: options.pageSize,
  });
  if (error) {
    throw new Error(error.code === "PGRST202"
      ? "The Coordinate Verification data migration has not been applied. Contact the project administrator."
      : error.message || "Coordinate records could not be loaded. Reload to try again.");
  }
  if (!isObject(data)
    || !Array.isArray(data.items)
    || !data.items.every(isCoordinateVerificationItem)
    || !isCount(data.total)
    || !isCount(data.totalAll)
    || !isCoordinateVerificationSummary(data.summary)
    || !Array.isArray(data.areas)
    || !data.areas.every(isPlotAreaOption)) {
    throw new Error("Coordinate Verification returned an unexpected response. Reload to try again.");
  }
  return data as CoordinateVerificationPage;
}


function lotPayload(input: LotInput) {
  const coordinate = coordinatePayload(input);
  return {
    area_id: input.areaId, block_id: input.blockId ?? null, lot_owner_id: input.lotOwnerId,
    lot_code: input.lotCode, legacy_location_code: input.legacyLocationCode?.trim() || null,
    legacy_pa_number: input.legacyPaNumber || null, status: input.status, length_m: input.lengthM, width_m: input.widthM,
    location_geom: coordinate.location_geom, coordinate_accuracy_m: coordinate.coordinate_accuracy_m,
    ...(input.graveType === undefined ? {} : {
      grave_type: input.graveType, grave_policy_reference: input.gravePolicyReference?.trim() || null,
      approved_mausoleum_capacity: input.graveType === "mausoleum" ? input.approvedMausoleumCapacity ?? null : null,
    }),
  };
}
export async function createLot(input: LotInput) { return saveStaffRecord("lot", null, null, lotPayload(input)); }
export async function updateLot(lotId: number, input: LotInput) { return saveStaffRecord("lot", lotId, input.revision ?? null, lotPayload(input)); }
export async function deleteLot(lotId: number, revision: number) { return saveStaffRecord("lot", lotId, revision, {}, "delete"); }
export async function updateLotVerification(lotId: number, revision: number, status: "verified" | "rejected", reason = "") {
  return saveStaffRecord("lot", lotId, revision, { status, reason }, "review");
}


export async function getAdminAccounts() {
  const client = requireClient();
  const { data: accounts, error } = await client.from("account").select("revision,account_id,username,role_id,is_active,account_status,created_at,approved_at").order("created_at", { ascending: false });
  if (error) throw error;
  const roleIds = (accounts || []).map((account) => account.role_id);
  const { data: roles, error: roleError } = roleIds.length ? await client.from("role").select("role_id,role_name").in("role_id", roleIds) : { data: [], error: null };
  if (roleError) throw roleError;
  const roleById = new Map((roles || []).map((item) => [item.role_id, item.role_name]));
  return (accounts || []).map((account) => ({
    revision: account.revision,
    accountId: account.account_id,
    username: account.username,
    role: roleById.get(account.role_id) === "ADMIN" ? "ADMIN" : "MANAGER",
    accountStatus: account.account_status,
    isActive: account.is_active,
    createdAt: account.created_at,
    approvedAt: account.approved_at,
  })) as AdminAccount[];
}

export async function getLotOwners(options: OwnerPageOptions = {}) {
  return (await getLotOwnersPage(options)).items;
}

export async function getLotOwnersPage(options: OwnerPageOptions = {}): Promise<PageResult<OwnerRow>> {
  const client = requireClient();
  const { from, to } = pageRange(options);
  let query = client.from("lot_owner").select(OWNER_COLUMNS, { count: "exact" }).is("deleted_at", null);
  const search = safeOwnerSearch(options.search);
  if (search) {
    const tokens = search.split(/\s+/).filter(Boolean).slice(0, 4);
    for (const token of tokens) {
      query = query.or(
        `first_name.ilike.*${token}*,middle_name.ilike.*${token}*,last_name.ilike.*${token}*,aliases.ilike.*${token}*,address.ilike.*${token}*,representative_name.ilike.*${token}*`,
      );
    }
  }
  const { data, error, count } = await query.order("last_name").order("lot_owner_id").range(from, to);
  if (error) throw error;
  const items = data || [];
  return { items, hasMore: hasMore(from, items.length, count), total: count };
}

export async function getLotCoInterments(lotId: number, excludeBurialId?: number): Promise<{ burialId: number; name: string; recordStatus: AdminRecord["recordStatus"]; intermentDate: string | null }[]> {
  if (!Number.isInteger(lotId) || lotId <= 0) return [];
  const client = requireClient();
  let query = client
    .from("burial_record")
    .select("burial_id,record_status,interment_date,deceased(display_name)")
    .eq("lot_id", lotId)
    .is("deleted_at", null)
    .order("burial_id", { ascending: true });
  if (excludeBurialId) query = query.neq("burial_id", excludeBurialId);
  const { data, error } = await query;
  if (error || !data) return [];
  return data.map((row) => {
    const deceased = firstOne(row.deceased as { display_name?: string | null } | { display_name?: string | null }[] | null);
    return {
      burialId: row.burial_id,
      name: deceased?.display_name || `Burial #${row.burial_id}`,
      recordStatus: row.record_status as AdminRecord["recordStatus"],
      intermentDate: row.interment_date,
    };
  });
}

export async function getOwnerRecords(options: OwnerPageOptions = {}) {
  return (await getOwnerRecordsPage(options)).items;
}

export async function getOwnerRecordsPage(options: OwnerPageOptions = {}): Promise<PageResult<LotOwner>> {
  const ownersPage = await getLotOwnersPage(options);
  return { ...ownersPage, items: ownersPage.items.map(toLotOwner) };
}

function toLotOwner(owner: OwnerRow): LotOwner {
  return {
    revision: owner.revision,
    lotOwnerId: owner.lot_owner_id,
    firstName: owner.first_name,
    middleName: owner.middle_name,
    lastName: owner.last_name,
    suffix: owner.suffix,
    aliases: owner.aliases,
    address: owner.address,
    representativeName: owner.representative_name,
    representativeContact: owner.representative_contact,
    representativeRelation: owner.representative_relation,
  };
}

export async function getOwnerRecord(id: string): Promise<LotOwner | null> {
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) return null;
  const { data, error } = await requireClient().from("lot_owner")
    .select(OWNER_COLUMNS).eq("lot_owner_id", Number(id)).is("deleted_at", null).maybeSingle();
  if (error) throw error;
  return data ? toLotOwner(data) : null;
}

export async function getOwnerPlots(ownerId: number, page = 0) {
  const { from, to } = pageRange({ page, pageSize: 20 });
  const { data, error, count } = await requireClient().from("lot")
    .select("lot_id,lot_code,status,area(area_name)", { count: "exact" })
    .eq("lot_owner_id", ownerId).is("deleted_at", null)
    .order("lot_code").order("lot_id").range(from, to);
  if (error) throw error;
  const items = data || [];
  return { items, hasMore: hasMore(from, items.length, count), total: count };
}

export async function getOwnerInterments(ownerId: number, page = 0) {
  const { from, to } = pageRange({ page, pageSize: 20 });
  const { data, error, count } = await requireClient().from("burial_record")
    .select(
      "burial_id,interment_date,record_status,deceased(display_name),lot!inner(lot_code,lot_owner_id,deleted_at)",
      { count: "exact" },
    )
    .eq("lot.lot_owner_id", ownerId).is("lot.deleted_at", null).is("deleted_at", null)
    .order("burial_id", { ascending: false }).range(from, to);
  if (error) throw error;
  const items = data || [];
  return { items, hasMore: hasMore(from, items.length, count), total: count };
}


export async function createLotOwner(input: OwnerInput) { return saveStaffRecord("lot_owner", null, null, ownerPayload(input)); }
export async function updateLotOwner(lotOwnerId: number, input: OwnerInput) { return saveStaffRecord("lot_owner", lotOwnerId, input.revision ?? null, ownerPayload(input)); }
export async function deleteLotOwner(lotOwnerId: number, revision: number) { return saveStaffRecord("lot_owner", lotOwnerId, revision, {}, "delete"); }
export async function accountAction(action: "approve" | "activate" | "deactivate" | "role", accountId: string, revision: number, value?: string) {
  return saveStaffRecord("account", accountId, revision, { value: value || null }, action);
}


export async function getAuditLog(exportRows = false, options: PageOptions = {}) {
  const client = requireClient();
  if (exportRows) {
    const { data, error } = await client.rpc("export_audit_log", {});
    if (error) throw error;
    return (data || []) as AuditLogEntry[];
  }
  return (await getAuditLogPage(options)).items;
}

export async function getAuditLogPage(options: PageOptions = {}): Promise<PageResult<AuditLogEntry>> {
  const client = requireClient();
  const { from, to } = pageRange(options);
  const { data, error, count } = await client.from("audit_log").select("audit_id,actor_account_id,action,table_name,record_id,old_values,new_values,created_at", { count: "exact" }).order("created_at", { ascending: false }).range(from, to);
  if (error) throw error;
  const items = (data || []) as AuditLogEntry[];
  return { items, hasMore: hasMore(from, items.length, count), total: count };
}

export async function getStorageStatus() {
  const bucket = process.env.NEXT_PUBLIC_SUPABASE_PHOTOS_BUCKET;
  // Bucket metadata endpoints are administrative and should not be called
  // with the browser key. The upload operation below is the authoritative
  // capability check and will return a safe error if the bucket is missing or
  // its Storage policies do not allow the current account.
  return { configured: Boolean(getBrowserSupabase() && bucket), bucket: bucket || null };
}

export async function uploadBurialPhoto(input: { burialId: number; file: File; caption?: string; capturedAt?: string }) {
  const client = requireClient();
  const bucket = process.env.NEXT_PUBLIC_SUPABASE_PHOTOS_BUCKET;
  if (!bucket) throw new Error("Photo storage is not configured for this Supabase environment.");
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!allowedTypes.has(input.file.type)) throw new Error("Use a JPG, PNG, or WebP image.");
  if (input.file.size > 10 * 1024 * 1024) throw new Error("Images must be 10 MB or smaller.");
  const userId = await getCurrentUserId(client);
  const fileName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120) || "photo";
  const storagePath = `burial/${input.burialId}/${crypto.randomUUID()}-${fileName}`;
  const { error: uploadError } = await client.storage.from(bucket).upload(storagePath, input.file, { contentType: input.file.type, upsert: false });
  if (uploadError) throw uploadError;
  const { data: inserted, error: metadataError } = await client.from("photo").insert({
    burial_id: input.burialId,
    uploaded_by: userId,
    storage_path: storagePath,
    file_name: input.file.name,
    caption: input.caption?.trim() || null,
    captured_at: input.capturedAt || null,
    approval_status: "pending",
    public_display: false,
  }).select("photo_id").single();
  if (metadataError) {
    await client.storage.from(bucket).remove([storagePath]);
    throw metadataError;
  }
  return inserted?.photo_id ?? null;
}

type JoinedPhotoRow = {
  revision: number;
  photo_id: number;
  burial_id: number;
  file_name: string;
  caption: string | null;
  captured_at: string | null;
  approval_status: string;
  public_display: boolean;
  created_at: string;
  uploaded_by?: string | null;
  photo_kind?: "portrait" | "tribute";
  submitted_by_name?: string | null;
  submitted_by_relation?: string | null;
  submitted_by_contact?: string | null;
  burial_record?: {
    lot_id?: number | null;
    deceased?: { display_name?: string | null } | { display_name?: string | null }[] | null;
    lot?: { lot_code?: string | null } | { lot_code?: string | null }[] | null;
  } | {
    lot_id?: number | null;
    deceased?: { display_name?: string | null } | { display_name?: string | null }[] | null;
    lot?: { lot_code?: string | null } | { lot_code?: string | null }[] | null;
  }[] | null;
};

function firstOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function mapAdminPhoto(photo: JoinedPhotoRow, friendlyRefs?: Map<number, string>): AdminPhoto {
  const burial = firstOne(photo.burial_record);
  const deceased = firstOne(burial?.deceased);
  const lot = firstOne(burial?.lot);
  const lotId = typeof burial?.lot_id === "number" ? burial.lot_id : null;
  const resolvedLot = lotId !== null ? friendlyRefs?.get(lotId) ?? lot?.lot_code ?? null : lot?.lot_code ?? null;
  return {
    revision: photo.revision,
    photoId: photo.photo_id,
    burialId: photo.burial_id,
    deceasedName: deceased?.display_name ?? null,
    lotCode: resolvedLot,
    fileName: photo.file_name,
    caption: photo.caption,
    capturedAt: photo.captured_at,
    approvalStatus: photo.approval_status as AdminPhoto["approvalStatus"],
    publicDisplay: Boolean(photo.public_display),
    createdAt: photo.created_at,
    photoKind: photo.photo_kind === "tribute" ? "tribute" : "portrait",
    isVisitorSubmitted: photo.uploaded_by === null,
    submittedByName: photo.submitted_by_name ?? null,
    submittedByRelation: photo.submitted_by_relation ?? null,
    submittedByContact: photo.submitted_by_contact ?? null,
  };
}

async function resolvePhotoPlotReferences(client: SupabaseClient, rows: JoinedPhotoRow[]): Promise<Map<number, string>> {
  const lotIds = Array.from(new Set(rows.map((row) => {
    const burial = firstOne(row.burial_record);
    const lot = firstOne(burial?.lot);
    return typeof burial?.lot_id === "number" && lot?.lot_code && /^P2S-[0-9a-f]{64}$/i.test(lot.lot_code)
      ? burial.lot_id
      : null;
  }).filter((id): id is number => id !== null)));
  const refs = new Map<number, string>();
  if (!lotIds.length) return refs;
  const { data, error } = await client.rpc("staff_sample_plot_references", { p_lot_ids: lotIds });
  if (error || !Array.isArray(data)) return refs;
  for (const item of data) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const lotId = Number((item as { lotId?: unknown }).lotId);
      const ref = (item as { reference?: unknown }).reference;
      if (Number.isSafeInteger(lotId) && typeof ref === "string" && ref.trim()) {
        refs.set(lotId, ref.trim());
      }
    }
  }
  return refs;
}

export type AdminPhotoCounts = {
  pending: number;
  approved: number;
  rejected: number;
  visitorPending: number;
  total: number;
};

export async function getAdminPhotoCounts(): Promise<AdminPhotoCounts> {
  const client = requireClient();
  const [pendingRes, approvedRes, rejectedRes, visitorPendingRes] = await Promise.all([
    client.from("photo").select("photo_id", { count: "exact", head: true }).eq("approval_status", "pending"),
    client.from("photo").select("photo_id", { count: "exact", head: true }).eq("approval_status", "approved"),
    client.from("photo").select("photo_id", { count: "exact", head: true }).eq("approval_status", "rejected"),
    client.from("photo").select("photo_id", { count: "exact", head: true }).eq("approval_status", "pending").is("uploaded_by", null),
  ]);
  const pending = pendingRes.count ?? 0;
  const approved = approvedRes.count ?? 0;
  const rejected = rejectedRes.count ?? 0;
  const visitorPending = visitorPendingRes.error ? 0 : (visitorPendingRes.count ?? 0);
  return { pending, approved, rejected, visitorPending, total: pending + approved + rejected };
}

export async function getAdminPhotos(
  options: PageOptions & {
    status?: AdminPhoto["approvalStatus"] | "all";
    kind?: "all" | "portrait" | "tribute";
    source?: "all" | "visitor" | "staff";
    query?: string;
  } = {},
) {
  const client = requireClient();
  const { from, to } = pageRange(options);
  const trimmedQuery = options.query?.trim().slice(0, 120) || "";

  let matchingBurialIds: number[] | null = null;
  if (trimmedQuery) {
    const idSet = new Set<number>();
    if (/^[1-9]\d{0,9}$/.test(trimmedQuery)) {
      idSet.add(Number(trimmedQuery));
    }
    const { data: burialMatches } = await client.rpc("search_staff_burials", { p_query: trimmedQuery, p_page: 1 });
    if (burialMatches && typeof burialMatches === "object" && !Array.isArray(burialMatches) && Array.isArray((burialMatches as { items?: unknown }).items)) {
      for (const item of (burialMatches as { items: { burial_id?: unknown }[] }).items) {
        if (typeof item?.burial_id === "number") idSet.add(item.burial_id);
      }
    }
    matchingBurialIds = Array.from(idSet);
  }

  for (const columns of [PHOTO_COLUMNS_WITH_RECORD, PHOTO_COLUMNS_V1_WITH_RECORD]) {
    let query = client.from("photo").select(columns, { count: "exact" });
    if (options.status && options.status !== "all") query = query.eq("approval_status", options.status);
    if (options.kind && options.kind !== "all") query = query.eq("photo_kind", options.kind);
    if (options.source === "visitor") query = query.is("uploaded_by", null);
    if (options.source === "staff") query = query.not("uploaded_by", "is", null);
    if (trimmedQuery) {
      const escaped = trimmedQuery.replace(/[,()*\\]/g, " ").trim();
      const clauses: string[] = [];
      if (escaped) {
        clauses.push(`submitted_by_name.ilike.*${escaped}*`);
        clauses.push(`caption.ilike.*${escaped}*`);
        clauses.push(`file_name.ilike.*${escaped}*`);
      }
      if (matchingBurialIds?.length) {
        clauses.push(`burial_id.in.(${matchingBurialIds.join(",")})`);
      }
      if (clauses.length) {
        query = query.or(clauses.join(","));
      } else {
        return { items: [], hasMore: false, total: 0 } satisfies PageResult<AdminPhoto>;
      }
    }
    const result = await query.order("created_at", { ascending: false }).order("photo_id", { ascending: false }).range(from, to);
    if (!result.error) {
      const rows = (result.data || []) as unknown as JoinedPhotoRow[];
      const friendlyRefs = await resolvePhotoPlotReferences(client, rows);
      const items = rows.map((row) => mapAdminPhoto(row, friendlyRefs));
      return { items, hasMore: hasMore(from, items.length, result.count), total: result.count } satisfies PageResult<AdminPhoto>;
    }
  }
  let legacyQuery = client.from("photo").select(PHOTO_COLUMNS, { count: "exact" });
  if (options.status && options.status !== "all") legacyQuery = legacyQuery.eq("approval_status", options.status);
  if (options.source === "visitor") legacyQuery = legacyQuery.is("uploaded_by", null);
  if (options.source === "staff") legacyQuery = legacyQuery.not("uploaded_by", "is", null);
  const { data, error, count } = await legacyQuery.order("created_at", { ascending: false }).order("photo_id", { ascending: false }).range(from, to);
  if (error) throw error;
  const items = ((data || []) as unknown as JoinedPhotoRow[]).map((row) => mapAdminPhoto(row));
  return { items, hasMore: hasMore(from, items.length, count), total: count } satisfies PageResult<AdminPhoto>;
}

export async function getAdminPhotoThumbnails(photoIds: number[]): Promise<Record<number, string>> {
  const uniqueIds = Array.from(new Set(photoIds.filter((id) => Number.isInteger(id) && id > 0)));
  if (!uniqueIds.length) return {};
  const client = requireClient();
  const bucket = process.env.NEXT_PUBLIC_SUPABASE_PHOTOS_BUCKET;
  if (!bucket) return {};
  const { data: rows, error } = await client
    .from("photo")
    .select("photo_id,storage_path")
    .in("photo_id", uniqueIds);
  if (error || !rows?.length) return {};
  const validRows = rows.filter((row): row is { photo_id: number; storage_path: string } => Boolean(row.storage_path));
  if (!validRows.length) return {};
  const { data: signed, error: signError } = await client.storage
    .from(bucket)
    .createSignedUrls(validRows.map((row) => row.storage_path), 120);
  if (signError || !signed) return {};
  const urls: Record<number, string> = {};
  signed.forEach((entry, index) => {
    const id = validRows[index]?.photo_id;
    if (id && entry.signedUrl && !entry.error) {
      urls[id] = entry.signedUrl;
    }
  });
  return urls;
}


export async function getBurialPhotos(burialId: number): Promise<AdminPhoto[]> {
  const client = requireClient();
  const extended = await client
    .from("photo")
    .select(PHOTO_COLUMNS_EXTENDED)
    .eq("burial_id", burialId)
    .order("photo_id", { ascending: true });
  if (!extended.error) {
    return ((extended.data || []) as unknown as JoinedPhotoRow[]).map((row) => mapAdminPhoto(row));
  }
  const { data, error } = await client
    .from("photo")
    .select(PHOTO_COLUMNS)
    .eq("burial_id", burialId)
    .order("photo_id", { ascending: true });
  if (error) throw error;
  return ((data || []) as unknown as JoinedPhotoRow[]).map((row) => mapAdminPhoto(row));
}

export async function updatePhotoReview(photoId: number, approvalStatus: AdminPhoto["approvalStatus"], revision: number) {
  let storagePathToDelete: string | null = null;
  const bucket = process.env.NEXT_PUBLIC_SUPABASE_PHOTOS_BUCKET;
  const client = requireClient();

  const { data: photo } = await client
    .from("photo")
    .select("storage_path,photo_kind,uploaded_by,approval_status")
    .eq("photo_id", photoId)
    .maybeSingle();

  const isVisitorPhoto = Boolean(photo && (photo.photo_kind === "tribute" || photo.uploaded_by === null));
  if (approvalStatus === "approved" && isVisitorPhoto && photo?.approval_status === "rejected") {
    throw new Error("Rejected visitor photos are permanently removed from storage and cannot be re-approved.");
  }
  if (approvalStatus === "rejected" && bucket && isVisitorPhoto && photo?.storage_path) {
    storagePathToDelete = photo.storage_path;
  }

  const result = await saveStaffRecord("photo", photoId, revision, { status: approvalStatus }, "review");

  let storageDeleted = false;
  if (storagePathToDelete && bucket) {
    const { error: removeError } = await client.storage.from(bucket).remove([storagePathToDelete]);
    storageDeleted = !removeError;
  }
  return { result, storageDeleted };
}

export type StaffBurialOption = { burial_id: number; display_name: string; lot_code: string; area_name: string | null };
export type DashboardCounts = { syntheticPlots?: number; active: number; pending: number; archived: number; plots: number; unverified: number; missingCoordinates: number; pendingCoordinates: number };
export async function getDashboardCounts(): Promise<DashboardCounts> {
  const { data, error } = await requireClient().rpc("staff_dashboard_counts");
  if (error || !data || typeof data !== "object" || Array.isArray(data) || !["active", "pending", "archived", "plots", "unverified", "missingCoordinates", "pendingCoordinates"].every((key) => typeof data[key] === "number")) throw new Error("Dashboard totals could not be loaded. Reload to try again.");
  return data as DashboardCounts;
}

export async function getStaffBurialRecords(options: BurialRecordQuery): Promise<BurialRecordPage> {
  const { data, error } = await requireClient().rpc("staff_burial_records", {
    p_query: options.query.slice(0, 160),
    p_section: options.section.slice(0, 160),
    p_status: options.status,
    p_verification: options.verification,
    p_date_filter: options.dateFilter,
    p_sort: options.sort,
    p_direction: options.direction,
    p_page: options.page + 1,
    p_page_size: options.pageSize,
  });
  if (error) {
    throw new Error(error.code === "PGRST202"
      ? "The Burial Records data migration has not been applied. Contact the project administrator."
      : error.message || "Burial records could not be loaded. Reload to try again.");
  }
  if (!isObject(data)
    || !Array.isArray(data.items)
    || !data.items.every(isAdminRecord)
    || !isCount(data.total)
    || !isCount(data.totalAll)
    || !Array.isArray(data.sections)
    || !data.sections.every((section) => typeof section === "string")) {
    throw new Error("Burial records returned an unexpected response. Reload to try again.");
  }
  return {
    items: data.items,
    total: data.total,
    totalAll: data.totalAll,
    sections: data.sections,
  };
}
export async function getDashboardData(): Promise<DashboardData> {
  const { data, error } = await requireClient().rpc("staff_dashboard_data");
  if (error) throw new Error(error.code === "PGRST202"
    ? "The Dashboard data migration has not been applied. Contact the project administrator."
    : error.message || "Dashboard data could not be loaded. Reload to try again.");
  if (!isDashboardData(data)) throw new Error("Dashboard data returned an unexpected response. Reload to try again.");
  return data;
}
export async function searchStaffBurials(query: string, page = 1): Promise<{ items: StaffBurialOption[]; total: number }> {
  const { data, error } = await requireClient().rpc("search_staff_burials", { p_query: query.slice(0, 160), p_page: page });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.items) || typeof data.total !== "number") throw new Error("Burial records could not be loaded.");
  return { items: data.items as StaffBurialOption[], total: data.total };
}

export async function getAdminPhotoPreview(photoId: number) {
  const client = requireClient();
  const bucket = process.env.NEXT_PUBLIC_SUPABASE_PHOTOS_BUCKET;
  if (!bucket) throw new Error("Photo storage is not configured.");
  const { data: photo, error } = await client.from("photo").select("storage_path").eq("photo_id", photoId).single();
  if (error || !photo) throw new Error("This photo could not be loaded.");
  const { data, error: storageError } = await client.storage.from(bucket).createSignedUrl(photo.storage_path, 120);
  if (storageError || !data) throw new Error("Photo preview is unavailable. Try again.");
  return data.signedUrl;
}
const inflight = new Map<string, Promise<unknown>>();
export async function saveStaffRecord(entity: string, id: string | number | null, revision: number | null, values: Record<string, unknown>, operation = "save") {
  const client = requireClient();
  const actor = await getCurrentUserId(client);
  const key = await mutationFingerprint(JSON.stringify([actor, entity, id, revision, values, operation]));
  if (inflight.has(key)) return inflight.get(key);
  const requestId = pendingRequestId(key);
  const pending = (async () => {
    const { data, error } = await client.rpc("staff_save_record", {
      p_entity: entity, p_id: id === null ? null : String(id), p_revision: revision,
      p_values: values as Json, p_request_id: requestId, p_operation: operation,
    });
    if (error) throw new Error(error.code === "PGRST202"
      ? "The database update for safe editing has not been applied. Contact the project administrator."
      : error.message || "The change could not be saved. Retry to safely resume the same request.");
    acknowledgeRequest(key);
    return data;
  })();
  inflight.set(key, pending);
  try { return await pending; } finally { inflight.delete(key); }
}
export type RecordHistory = { history_id: number; entity: string; record_id: string; operation: string; before_values: Record<string, unknown>; after_revision: number; created_at: string };
export async function getRecordHistory(page = 0) {
  const { data, error } = await requireClient().from("record_history").select("history_id,entity,record_id,operation,before_values,after_revision,created_at").order("history_id", { ascending: false }).range(page * 25, page * 25 + 24);
  if (error) throw new Error(error.message);
  return (data || []) as RecordHistory[];
}


export type BurialRecordInput = {
  revision?: number;
  name: string;
  sex?: AdminRecord["sex"];
  lotId: number;
  birthDate?: string;
  deathDate?: string;
  publicDisplay: boolean;
  intermentDate?: string;
  recordStatus?: AdminRecord["recordStatus"];
  intermentStatus: "PERMANENT" | "TEMPORARY";
  remainsType: "FRESH" | "ASH" | "BONE";
  referenceNo?: string;
  intermentOrderNumber?: string;
  intermentConfirmed?: boolean;
  serviceProvider?: string;
  recordSource?: string;
  qualityNotes?: string;
  inscription?: string;
};

export type LotInput = {
  revision?: number;
  areaId: number;
  blockId?: number | null;
  lotOwnerId: number | null;
  lotCode: string;
  legacyLocationCode?: string;
  legacyPaNumber?: string;
  graveType?: GraveType | null;
  gravePolicyReference?: string;
  approvedMausoleumCapacity?: number | null;
  status: "UNKNOWN" | "AVAILABLE" | "BOOKED" | "HOLD";
  lengthM: number | null;
  widthM: number | null;
  longitude?: number | null;
  latitude?: number | null;
  coordinateAccuracyM?: number | null;
  coordinateStatus?: "pending" | "verified" | "rejected";
  coordinateVerified?: boolean;
};

export type OwnerInput = {
  revision?: number;
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  aliases?: string;
  address: string;
  representativeName?: string;
  representativeContact?: string;
  representativeRelation?: string;
};

function requireClient() {
  const client = getBrowserSupabase();
  if (!client) throw new Error("Supabase is not configured.");
  return client;
}

function enumValue<T extends string>(value: string, allowed: readonly T[]): T {
  if (!allowed.includes(value as T)) throw new Error("A record contains an unsupported status. Contact the administrator.");
  return value as T;
}

async function getCurrentUserId(client: SupabaseClient) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Your authenticated session is no longer available.");
  return data.user.id;
}

function ownerPayload(input: OwnerInput) {
  return {
    first_name: input.firstName,
    middle_name: input.middleName || null,
    last_name: input.lastName,
    suffix: input.suffix || null,
    aliases: input.aliases || null,
    address: input.address,
    representative_name: input.representativeName || null,
    representative_contact: input.representativeContact || null,
    representative_relation: input.representativeRelation || null,
  };
}



function parsePoint(value: unknown) {
  const coordinates = getPointCoordinates(value);
  return coordinates ? { longitude: coordinates[0], latitude: coordinates[1] } : null;
}

function getPointCoordinates(value: unknown): [number, number] | null {
  if (value && typeof value === "object" && "coordinates" in value) {
    const coordinates = (value as { coordinates?: unknown }).coordinates;
    if (Array.isArray(coordinates) && coordinates.length >= 2 && typeof coordinates[0] === "number" && typeof coordinates[1] === "number") return [coordinates[0], coordinates[1]];
  }
  if (typeof value !== "string") return null;
  const normalized = value.replace(/^\s*SRID=\d+\s*;\s*/i, "");
  try {
    const parsed = JSON.parse(normalized) as { coordinates?: unknown };
    const coordinates = parsed.coordinates;
    if (Array.isArray(coordinates) && coordinates.length >= 2 && typeof coordinates[0] === "number" && typeof coordinates[1] === "number") return [coordinates[0], coordinates[1]];
  } catch {
    // PostgREST may return geography as WKT text.
  }
  const match = normalized.match(/^\s*POINT\s*\(\s*([^\s,]+)\s+([^\s,)]+)\s*\)\s*$/i);
  if (!match) return null;
  const longitude = Number(match[1]);
  const latitude = Number(match[2]);
  return Number.isFinite(longitude) && Number.isFinite(latitude) ? [longitude, latitude] : null;
}

function burialPayload(input: BurialRecordInput) {
  return {
    display_name: input.name,
    ...(input.sex === undefined ? {} : { sex: input.sex }),
    birth_date: input.birthDate || null,
    death_date: input.deathDate || null,
    public_display: input.publicDisplay,
    lot_id: input.lotId,
    interment_date: input.intermentDate || null,
    record_status: input.recordStatus || "pending",
    interment_status: input.intermentStatus,
    remains_type: input.remainsType,
    reference_no: input.referenceNo || null,
    ...(input.intermentOrderNumber === undefined ? {} : { interment_order_number: input.intermentOrderNumber.trim() || null }),
    ...(input.intermentConfirmed === undefined ? {} : { interment_confirmed: input.intermentConfirmed }),
    service_provider: input.serviceProvider || null,
    record_source: input.recordSource || null,
    quality_notes: input.qualityNotes || null,
    ...(input.inscription === undefined ? {} : { inscription: input.inscription.trim() || null }),
  };
}



function coordinatePayload(input: LotInput) {
  const hasLongitude = input.longitude !== null && input.longitude !== undefined;
  const hasLatitude = input.latitude !== null && input.latitude !== undefined;
  if (hasLongitude !== hasLatitude) throw new Error("Enter both longitude and latitude, or leave both coordinates blank.");
  if (!hasLongitude) return { location_geom: null, coordinate_accuracy_m: null, coordinate_status: "pending", coordinate_verified: false };
  const longitude = Number(input.longitude);
  const latitude = Number(input.latitude);
  const accuracy = input.coordinateAccuracyM === null || input.coordinateAccuracyM === undefined ? null : Number(input.coordinateAccuracyM);
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error("Enter valid longitude and latitude values.");
  if (accuracy !== null && (!Number.isFinite(accuracy) || accuracy < 0)) throw new Error("Coordinate accuracy must be zero or greater.");
  return {
    location_geom: { type: "Point", coordinates: [longitude, latitude] },
    coordinate_accuracy_m: accuracy,
    coordinate_status: input.coordinateStatus || "pending",
    coordinate_verified: Boolean(input.coordinateVerified),
  };
}

function pageRange(options: PageOptions) {
  const page = Number.isInteger(options.page) && (options.page || 0) >= 0 ? options.page || 0 : 0;
  const pageSize = Number.isInteger(options.pageSize) && (options.pageSize || 0) > 0 ? Math.min(options.pageSize || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
  const from = page * pageSize;
  return { from, to: from + pageSize - 1 };
}

function safeOwnerSearch(value: string | undefined) {
  return value?.trim().replace(/[^a-zA-Z0-9À-ž\s'._-]/g, "").slice(0, 80) || "";
}

function hasMore(from: number, itemCount: number, total: number | null) {
  return total === null ? itemCount > 0 : from + itemCount < total;
}

function isDashboardData(value: unknown): value is DashboardData {
  if (!isObject(value)) return false;
  const summary = value.summary;
  const occupancy = value.occupancy;
  if (!isObject(summary) || !isObject(occupancy)) return false;
  const summaryKeys = ["totalBurialRecords", "occupiedPlots", "availablePlots", "needsVerification"];
  const occupancyKeys = ["occupied", "available", "booked", "onHold", "unknown", "total", "occupancyPercent"];
  if (!summaryKeys.every((key) => isCount(summary[key]))) return false;
  if (summary.syntheticPlots !== undefined && !isCount(summary.syntheticPlots)) return false;
  if (!occupancyKeys.every((key) => isCount(occupancy[key]))) return false;
  if (!Array.isArray(value.burialsBySection) || !value.burialsBySection.every((item) =>
    isObject(item) && isCount(item.areaId) && typeof item.areaName === "string" && isCount(item.burialCount))) return false;
  if (!Array.isArray(value.recentChanges) || !value.recentChanges.every((item) =>
    isObject(item) && isCount(item.auditId) && typeof item.label === "string"
      && (item.subject === null || typeof item.subject === "string")
      && (item.plotCode === null || typeof item.plotCode === "string")
      && typeof item.createdAt === "string")) return false;
  if (!Array.isArray(value.verificationItems) || !value.verificationItems.every((item) =>
    isObject(item) && isCount(item.lotId) && typeof item.plot === "string" && typeof item.issue === "string"
      && ["missing", "pending", "rejected"].includes(String(item.status))
      && (item.rejectionReason === null || typeof item.rejectionReason === "string")
      && typeof item.updatedAt === "string")) return false;
  return true;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isAdminRecord(value: unknown): value is AdminRecord {
  if (!isObject(value)) return false;
  return isCount(value.revision)
    && isCount(value.burialId)
    && isCount(value.deceasedId)
    && isCount(value.lotId)
    && typeof value.name === "string"
    && typeof value.plot === "string"
    && typeof value.section === "string"
    && ["active", "pending", "archived"].includes(String(value.recordStatus))
    && ["pending", "verified", "rejected"].includes(String(value.coordinateStatus))
    && typeof value.coordinateVerified === "boolean"
    && typeof value.publicDisplay === "boolean"
    && typeof value.intermentStatus === "string"
    && typeof value.remainsType === "string"
    && typeof value.updatedAt === "string";
}

function isPlotManagementItem(value: unknown): value is PlotManagementItem {
  if (!isObject(value)) return false;
  return isCount(value.revision)
    && isCount(value.lotId)
    && typeof value.lotCode === "string"
    && isCount(value.areaId)
    && ["UNKNOWN", "AVAILABLE", "BOOKED", "HOLD"].includes(String(value.status))
    && ["unknown", "available", "occupied", "booked", "hold"].includes(String(value.operationalState))
    && ["missing", "pending", "verified", "rejected"].includes(String(value.coordinateState))
    && ["pending", "verified", "rejected"].includes(String(value.coordinateStatus))
    && typeof value.coordinateVerified === "boolean"
    && typeof value.assignedBurialDeleted === "boolean"
    && typeof value.updatedAt === "string";
}

function isPlotManagementSummary(value: unknown): value is PlotManagementSummary {
  return isObject(value)
    && (value.syntheticPlots === undefined || isCount(value.syntheticPlots))
    && ["total", "occupied", "available", "booked", "onHold", "unknown", "needsVerification"]
      .every((key) => isCount(value[key]));
}

function isCoordinateVerificationItem(value: unknown): value is CoordinateVerificationItem {
  if (!isObject(value)) return false;
  return isCount(value.revision)
    && isCount(value.lotId)
    && typeof value.lotCode === "string"
    && isCount(value.areaId)
    && ["missing", "pending", "verified", "rejected"].includes(String(value.coordinateState))
    && ["pending", "verified", "rejected"].includes(String(value.coordinateStatus))
    && typeof value.coordinateVerified === "boolean"
    && typeof value.assignedBurialDeleted === "boolean"
    && typeof value.updatedAt === "string"
    && Array.isArray(value.history)
    && value.history.every((event) => isObject(event)
      && isCount(event.auditId)
      && ["submitted", "updated", "verified", "rejected"].includes(String(event.event))
      && (event.actorName === null || typeof event.actorName === "string")
      && (event.reason === null || typeof event.reason === "string")
      && typeof event.createdAt === "string");
}

function isCoordinateVerificationSummary(value: unknown): value is CoordinateVerificationSummary {
  return isObject(value)
    && ["needsVerification", "missing", "pending", "rejected", "verified"]
      .every((key) => isCount(value[key]));
}

function isPlotAreaOption(value: unknown): value is PlotAreaOption {
  return isObject(value)
    && isCount(value.areaId)
    && typeof value.areaCode === "string"
    && typeof value.label === "string";
}
