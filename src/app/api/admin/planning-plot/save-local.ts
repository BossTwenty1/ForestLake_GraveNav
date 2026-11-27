import { getCurrentStaff } from "@/lib/auth";
import { planningDataSha256 } from "@/lib/phase2-planning";
import { localSupabaseConfig } from "@/lib/supabase/config";
import { getServerSupabase } from "@/lib/supabase/server";
import { isStaffJsonRequest, staffReply } from "@/lib/supabase/staff-account-server";

export async function saveLocalMappedBurial(request: Request) {
  if (localSupabaseConfig.environment !== "local") return staffReply({ error: "Local testing only." }, 403);
  if (!isStaffJsonRequest(request)) return staffReply({ error: "Invalid request." }, 400);
  const staff = await getCurrentStaff();
  if (!staff?.isActive || staff.accountStatus !== "ACTIVE") return staffReply({ error: "Staff access required." }, 403);
  let input: Record<string, unknown>;
  try { input = await request.json(); } catch { return staffReply({ error: "Invalid request." }, 400); }
  if (!input || typeof input.candidate !== "string" || !/^(lawn|estates):[1-9]\d{0,15}$/.test(input.candidate)
    || typeof input.lotId !== "number" || !Number.isSafeInteger(input.lotId) || input.lotId < 1
    || typeof input.lotCode !== "string" || !input.lotCode || input.lotCode.length > 150
    || typeof input.requestId !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(input.requestId)
    || !input.values || typeof input.values !== "object" || Array.isArray(input.values)) return staffReply({ error: "Invalid burial details." }, 400);
  try {
    const client = await getServerSupabase();
    const rpc = client as unknown as { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }> } | null;
    const result = await rpc?.rpc("staff_create_mapped_burial", { p_candidate: input.candidate, p_plan_sha256: planningDataSha256,
      p_expected_lot_id: input.lotId, p_expected_lot_code: input.lotCode, p_values: input.values, p_request_id: input.requestId });
    if (result && !result.error) return staffReply({ receipt: result.data });
    if (result?.error?.code === "40001" || result?.error?.code === "22023") return staffReply({ error: result.error.message ?? "The plot needs review." }, 409);
  } catch { /* Never treat a failed response as a successful save. */ }
  return staffReply({ error: "The burial could not be saved. Check the plot and its capacity." }, 503);
}
