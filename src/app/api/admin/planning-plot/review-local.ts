import { getCurrentStaff } from "@/lib/auth";
import { planningDataSha256 } from "@/lib/phase2-planning";
import { getServerSupabase } from "@/lib/supabase/server";
import { isStaffJsonRequest, staffReply } from "@/lib/supabase/staff-account-server";

export async function reviewLocalCoordinates(request: Request) {
  if (!isStaffJsonRequest(request)) return staffReply({ error: "Invalid request." }, 400);
  const staff = await getCurrentStaff();
  if (!staff?.isActive || staff.accountStatus !== "ACTIVE" || !["ADMIN", "SUPER_ADMIN"].includes(staff.role)) return staffReply({ error: "Administrator access required." }, 403);
  let input: Record<string, unknown>;
  try { input = await request.json(); } catch { return staffReply({ error: "Invalid request." }, 400); }
  if (!input || typeof input.candidate !== "string" || !/^(lawn|estates):[1-9]\d{0,15}$/.test(input.candidate)
    || typeof input.lotId !== "number" || !Number.isSafeInteger(input.lotId) || input.lotId < 1
    || typeof input.lotCode !== "string" || !input.lotCode || input.lotCode.length > 150
    || typeof input.revision !== "number" || !Number.isSafeInteger(input.revision) || input.revision < 1
    || (input.status !== "verified" && input.status !== "rejected") || typeof input.reason !== "string" || input.reason.length > 2000
    || (input.status === "rejected" && !input.reason.trim())
    || typeof input.requestId !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(input.requestId)) return staffReply({ error: "Invalid coordinate review." }, 400);
  try {
    const client = await getServerSupabase();
    const rpc = client as unknown as { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }> } | null;
    const result = await rpc?.rpc("staff_review_mapped_coordinates", { p_candidate: input.candidate, p_plan_sha256: planningDataSha256,
      p_lot_id: input.lotId, p_lot_code: input.lotCode, p_revision: input.revision, p_status: input.status, p_reason: input.reason, p_request_id: input.requestId });
    if (result && !result.error) return staffReply({ receipt: result.data });
    if (result?.error?.code === "40001" || result?.error?.code === "22023") return staffReply({ error: result.error.message ?? "Reopen the plot and try again." }, 409);
  } catch { /* A failed response must never be treated as a successful review. */ }
  return staffReply({ error: "Coordinate review could not be saved." }, 503);
}
