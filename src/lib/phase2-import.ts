import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database-schema";
import type { Json } from "./supabase/database.types";

export const PROJECT = "ddoowghocqyfoxaikifb";
export const PROJECT_URL = `https://${PROJECT}.supabase.co`;
export const PUGI_ID = "9f08a285-a1e2-444f-b07e-b897e43e6c92";
export const POLICY = "GRAVENAV-P2S-20261117";
export const PLAN_HASH = "bf006431c72c844df43336c101caba2df88622df90cb6cf0e9cf3e24df116b93";
export const WORKBOOK_HASH = "d513d28922dfce121422916fbb94138e652dcf0080e146d51ad8c540b5bdcc0f";
export const SQL_HASH = "f4a257e463b5c22cb0b728349744beb646a15ef1b647daddf6eac3b9e0d3350e";
export const LOTS_HASH = "88d29e467313b2e23301040a45325cd09de9e8db826cd65aefd97a195d0a9973";
export const AREAS_HASH = "0a1558f5982122367817a79f9172f3babc14ce6e31789482628d511dd12d9f45";
export const LOCAL_PORT = "3237";
// Reviewed server-side switches; no environment variable or HTTP parameter can enable writes.
export const HOSTED_WRITES_ENABLED = false;
export const IMPORT_CONTROL_RETIRED = true;

type Values = Record<string, Json>;
type Entry = { request_id: string; values: Values };
type Group = {
  source_row_key: string;
  owner: Entry | null;
  lot: Entry;
  interments: Entry[];
};
export type FixedPlan = { project_ref: string; assignments: Group[] };
type Operation = { entity: "lot_owner" | "lot" | "burial_record"; entry: Entry; group: Group };
export type SaveReceipt = { id: string; revision: number };
export type Saved = {
  requestId: string; entity: Operation["entity"]; values: Values;
  payloadHash: string; receipt: SaveReceipt;
};
export type Journal = {
  version: 1; project: string; planHash: string; actorId: string;
  completed: Saved[];
  pending: Omit<Saved, "receipt"> | null;
};
export type Client = SupabaseClient<Database>;
export type Clearance = {
  project: string; actorId: string; policy: string; planHash: string; inventorySqlHash: string;
  inventoryMigration: string; inventorySqlApprovedAndApplied: boolean;
  importExecutionApproved: boolean; readOnlyPreflight: boolean; checkedAt: string;
  existingLotsHash: string; existingAreasHash: string;
  resumeFrom?: number;
};

export class ImportBlocked extends Error {
  constructor(message: string, public status = 423) { super(message); }
}
function check(ok: unknown, message: string, status = 423): asserts ok {
  if (!ok) throw new ImportBlocked(message, status);
}
export const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");

export function assertLocalRequest(request: Request, env = process.env, now = Date.now()) {
  const until = Date.parse(env.GRAVENAV_LOCAL_PHASE2_IMPORT_UNTIL || "");
  const url = new URL(request.url);
  const host = request.headers.get("host");
  check(!IMPORT_CONTROL_RETIRED && env.NODE_ENV === "development" && !env.VERCEL && !env.CI &&
    until > now && until - now <= 2 * 60 * 60 * 1000,
  "This temporary local control is disabled or expired.", 404);
  check(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname) &&
    url.port === LOCAL_PORT && /^(127\.0\.0\.1|localhost):3237$/.test(host || ""),
  "Loopback access on the dedicated local port is required.", 404);
  const forwardedHost = request.headers.get("x-forwarded-host");
  check(!forwardedHost || forwardedHost === host, "Forwarded requests are blocked.", 403);
  const forwardedProtocol = request.headers.get("x-forwarded-proto");
  check(!forwardedProtocol || forwardedProtocol === "http", "Forwarded requests are blocked.", 403);
  check(!request.headers.has("authorization"), "Use the existing application cookie session.", 403);
  if (request.method !== "GET") {
    // Next normalizes request.url to localhost; browser Origin must match the validated Host.
    check(request.headers.get("origin") === "http://" + host,
      "A same-origin application request is required.", 403);
    check(request.headers.get("content-type") === "application/json",
      "A fixed JSON action is required.", 400);
  }
}

export async function verifyPugi(client: Client, projectUrl: string) {
  check(projectUrl === PROJECT_URL, "The connected Supabase project is not the approved project.", 403);
  const { data: { user }, error: authError } = await client.auth.getUser();
  check(!authError && user, "Sign in through the existing GraveNav login page.", 401);
  check(user.id === PUGI_ID, "This temporary control is restricted to PUGI.", 403);
  const { data, error } = await client.rpc("get_my_account");
  const account = Array.isArray(data) && data.length === 1 ? data[0] : null;
  check(!error && account && account.account_id === user.id &&
    account.username === "PUGI" && account.role_name === "ADMIN" &&
    account.account_status === "ACTIVE" && account.is_active === true,
  "PUGI must resolve to the exact ACTIVE ADMIN account through get_my_account.", 403);
  return { status: "VERIFIED" as const, project: PROJECT, userId: user.id,
    username: "PUGI", role: "ADMIN", checkedAt: new Date().toISOString() };
}

export function validatePlan(value: unknown): FixedPlan {
  check(hash(JSON.stringify(value)) === PLAN_HASH, "The pinned import plan changed.");
  const plan = value as FixedPlan;
  const operations = operationsFor(plan);
  check(plan.project_ref === PROJECT && operations.length === 235 &&
    new Set(operations.map((op) => op.entry.request_id)).size === 235,
  "The fixed project or 235 deterministic requests do not match.");
  check(plan.assignments.length === 90 && plan.assignments.filter((g) => !g.owner).length === 45 &&
    plan.assignments.filter((g) => g.interments.length === 2).length === 10,
  "The approved plot/owner/shared relationships do not match.");
  const records = plan.assignments.flatMap((g) => g.interments);
  check(records.length === 100 && records.every(({ values }) =>
    values.record_status === "pending" && values.public_display === false &&
    values.interment_confirmed === false), "Every record must stay pending, hidden and unconfirmed.");
  return plan;
}

function operationsFor(plan: FixedPlan): Operation[] {
  return plan.assignments.flatMap((group) => [
    ...(group.owner ? [{ entity: "lot_owner" as const, entry: group.owner, group }] : []),
    { entity: "lot" as const, entry: group.lot, group },
    ...group.interments.map((entry) => ({ entity: "burial_record" as const, entry, group })),
  ]);
}
export function newJournal(): Journal {
  return { version: 1, project: PROJECT, planHash: PLAN_HASH, actorId: PUGI_ID,
    completed: [], pending: null };
}
function valuesFor(op: Operation, completed: Saved[]): Values {
  const idFor = (entry: Entry) => {
    const saved = completed.find((row) => row.requestId === entry.request_id);
    check(saved, "A prerequisite receipt is missing; stop and reconcile the journal.");
    return saved.receipt.id;
  };
  if (op.entity === "lot_owner") return op.entry.values;
  if (op.entity === "lot") return { ...op.entry.values,
    lot_owner_id: op.group.owner ? idFor(op.group.owner) : null };
  const lotId = idFor(op.group.lot);
  const notes = JSON.parse(String(op.entry.values.quality_notes));
  return { ...op.entry.values, lot_id: lotId,
    quality_notes: JSON.stringify({ ...notes, existing_lot_id: lotId }) };
}
function pendingFor(op: Operation, completed: Saved[]) {
  const values = valuesFor(op, completed);
  return { requestId: op.entry.request_id, entity: op.entity, values,
    payloadHash: hash(JSON.stringify(values)) };
}
function validateReceipt(value: unknown): SaveReceipt {
  const receipt = value as SaveReceipt | null;
  check(receipt && typeof receipt.id === "string" && /^[1-9]\d*$/.test(receipt.id) &&
    Number.isSafeInteger(receipt.revision) && receipt.revision > 0,
  "The protected receipt is unexpected; retain the pending request for reconciliation.");
  return { id: receipt.id, revision: receipt.revision };
}
export function validateJournal(plan: FixedPlan, journal: Journal) {
  check(journal.version === 1 && journal.project === PROJECT && journal.planHash === PLAN_HASH &&
    journal.actorId === PUGI_ID && journal.completed.length <= 235,
  "The journal belongs to another actor, project or plan.");
  const operations = operationsFor(plan);
  journal.completed.forEach((row, index) => {
    const expected = pendingFor(operations[index], journal.completed.slice(0, index));
    check(JSON.stringify({ ...row, receipt: undefined }) === JSON.stringify(expected),
      "A completed request or payload changed; stop and reconcile.");
    validateReceipt(row.receipt);
  });
  if (journal.pending) {
    check(journal.completed.length < 235 && JSON.stringify(journal.pending) ===
      JSON.stringify(pendingFor(operations[journal.completed.length], journal.completed)),
    "The pending request changed; never allocate a replacement UUID.");
  }
}

export function assertClearance(clearance: Clearance | null, now = Date.now()) {
  check(clearance && clearance.project === PROJECT && clearance.actorId === PUGI_ID &&
    clearance.policy === POLICY && clearance.planHash === PLAN_HASH &&
    clearance.inventorySqlHash === SQL_HASH && clearance.inventoryMigration === "20261117020000" &&
    clearance.inventorySqlApprovedAndApplied === true && clearance.importExecutionApproved === true &&
    clearance.readOnlyPreflight === true && clearance.existingLotsHash === LOTS_HASH &&
    clearance.existingAreasHash === AREAS_HASH,
  "Separate SQL/import approval and matching hosted preservation evidence are still required.");
  const age = now - Date.parse(clearance.checkedAt);
  check(age >= 0 && age <= 15 * 60 * 1000, "The hosted read-only preflight must be refreshed.");
}

async function assertCounts(client: Client, completed: Saved[], pending: Journal["pending"]) {
  const tables = ["lot_owner", "lot", "deceased", "burial_record"] as const;
  const counts = await Promise.all(tables.map(async (table) => {
    const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
    check(!error && count !== null, "Hosted record counts could not be confirmed.");
    return count;
  }));
  const totals = (rows: { entity: string }[]) => [
    rows.filter((r) => r.entity === "lot_owner").length,
    4494 + rows.filter((r) => r.entity === "lot").length,
    rows.filter((r) => r.entity === "burial_record").length,
    rows.filter((r) => r.entity === "burial_record").length,
  ];
  const same = (a: number[]) => a.every((value, index) => value === counts[index]);
  check(same(totals(completed)) || (pending && same(totals([...completed, pending]))),
    "Hosted counts differ from the approved batch and its interruption boundary.");
}

async function save(client: Client, pending: Omit<Saved, "receipt">) {
  const { data, error } = await client.rpc("staff_save_record", {
    p_entity: pending.entity, p_id: null, p_revision: null,
    p_values: pending.values, p_request_id: pending.requestId, p_operation: "save",
  });
  check(!error, "The protected save was rejected; stop and retain the same request and journal.");
  return validateReceipt(data);
}

export async function executeBoundedBatch(
  client: Client, plan: FixedPlan, journal: Journal,
  persist: (journal: Journal) => Promise<void>, clearance: Clearance | null,
  signal?: AbortSignal,
) {
  // HTTP execution requires the reviewed switch, live identity and fresh private clearance.
  validatePlan(plan);
  validateJournal(plan, journal);
  assertClearance(clearance);
  await verifyPugi(client, PROJECT_URL);
  const { data: inventory, error: inventoryError } = await client.rpc("staff_dashboard_data");
  const readModel = inventory as { summary?: { syntheticPlots?: unknown } } | null;
  check(!inventoryError && typeof readModel?.summary?.syntheticPlots === "number",
    "The reviewed synthetic inventory read model is not available.");
  await assertCounts(client, journal.completed, journal.pending);
  const operations = operationsFor(plan);
  const start = journal.completed.length;
  const verifiedReceipts = new Set<string>();
  while (journal.completed.length < Math.min(235, start + 5) && !signal?.aborted) {
    const op = operations[journal.completed.length];
    // Reconcile dependency IDs with authoritative receipts before using them after interruption.
    for (const entry of [op.group.owner, op.entity === "burial_record" ? op.group.lot : null]) {
      const prior = entry && journal.completed.find((row) => row.requestId === entry.request_id);
      if (prior && !verifiedReceipts.has(prior.requestId)) {
        check(JSON.stringify(await save(client, prior)) === JSON.stringify(prior.receipt),
          "A dependency receipt differs from the journal; stop before saving dependent data.");
        verifiedReceipts.add(prior.requestId);
      }
    }
    journal.pending = pendingFor(op, journal.completed);
    await persist(journal); // Durable write-ahead checkpoint before any protected mutation.
    const receipt = await save(client, journal.pending);
    journal.completed.push({ ...journal.pending, receipt });
    verifiedReceipts.add(op.entry.request_id);
    journal.pending = null;
    await persist(journal);
  }
  return { completed: journal.completed.length, total: 235, pending: Boolean(journal.pending) };
}
