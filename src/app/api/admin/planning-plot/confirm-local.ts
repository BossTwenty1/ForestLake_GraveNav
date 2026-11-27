import { getCurrentStaff } from "@/lib/auth";
import { planningDataSha256 } from "@/lib/phase2-planning";
import { localSupabaseConfig } from "@/lib/supabase/config";
import { getServerSupabase } from "@/lib/supabase/server";
import { isStaffJsonRequest, staffReply } from "@/lib/supabase/staff-account-server";

export async function confirmLocalPlotMatch(request: Request) {
  if (localSupabaseConfig.environment !== "local") return staffReply({ error: "Local testing only." }, 403);
  if (!isStaffJsonRequest(request)) return staffReply({ error: "Invalid request." }, 400);
  const staff = await getCurrentStaff();
  if (!staff?.isActive || staff.accountStatus !== "ACTIVE" || !["ADMIN", "SUPER_ADMIN"].includes(staff.role)) return staffReply({ error: "Administrator access required." }, 403);
  let input: Record<string, unknown>;
  try { input = await request.json(); } catch { return staffReply({ error: "Invalid request." }, 400); }
  if (typeof input.candidate !== "string" || !/^lawn:[1-9]\d{0,15}$/.test(input.candidate)
    || typeof input.lotId !== "number" || !Number.isSafeInteger(input.lotId) || input.lotId < 1
    || typeof input.revision !== "number" || !Number.isSafeInteger(input.revision) || input.revision < 1
    || typeof input.oldCode !== "string" || !input.oldCode || input.oldCode.length > 150
    || typeof input.proposedCode !== "string" || !input.proposedCode || input.proposedCode.length > 150
    || typeof input.reason !== "string" || input.reason.trim().length < 10 || input.reason.length > 500
    || typeof input.requestId !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(input.requestId)) return staffReply({ error: "Enter a review note of at least 10 characters." }, 400);
  try {
    const client = await getServerSupabase();
    const rpc = client as unknown as { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }> } | null;
    const result = await rpc?.rpc("staff_confirm_proposed_plot", { p_candidate: input.candidate, p_plan_sha256: planningDataSha256,
      p_lot_id: input.lotId, p_old_code: input.oldCode, p_revision: input.revision, p_proposed_code: input.proposedCode,
      p_reason: input.reason.trim(), p_request_id: input.requestId });
    if (result && !result.error) return staffReply({ receipt: result.data });
    if (result?.error?.code === "40001" || result?.error?.code === "22023") return staffReply({ error: result.error.message || "Reopen the plot and try again." }, 409);
  } catch { /* Do not report a failed review as a success. */ }
  return staffReply({ error: "The plot match could not be saved." }, 503);
}
