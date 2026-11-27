import { getCurrentStaff } from "@/lib/auth";
import { planningDataSha256 } from "@/lib/phase2-planning";
import { localSupabaseConfig } from "@/lib/supabase/config";
import { getServerSupabase } from "@/lib/supabase/server";
import { isStaffJsonRequest, staffReply } from "@/lib/supabase/staff-account-server";

// Only changes fictional examples in the local review database.
export async function updateLocalStatus(request: Request) {
  if (localSupabaseConfig.environment !== "local") return staffReply({ error: "Local testing only." }, 403);
  if (!isStaffJsonRequest(request)) return staffReply({ error: "Invalid request." }, 400);
  const staff = await getCurrentStaff();
  if (!staff?.isActive || staff.accountStatus !== "ACTIVE") return staffReply({ error: "Staff access required." }, 403);
  let input: { candidate?: unknown; expected?: unknown; status?: unknown };
  try { input = await request.json(); } catch { return staffReply({ error: "Invalid request." }, 400); }
  const valid = ["available", "booked", "hold", "unavailable"];
  if (!input || typeof input.candidate !== "string" || input.candidate.length > 24 || !/^(lawn|estates):[1-9]\d*$/.test(input.candidate)
    || typeof input.expected !== "string" || !valid.includes(input.expected)
    || typeof input.status !== "string" || !valid.includes(input.status)) return staffReply({ error: "Invalid status." }, 400);
  try {
    const client = await getServerSupabase();
    const rpc = client as unknown as { rpc: (name: string, args: Record<string, string>) => PromiseLike<{ data: unknown; error: { code?: string } | null }> } | null;
    const result = await rpc?.rpc("staff_update_review_status", { p_candidate: input.candidate, p_plan_sha256: planningDataSha256, p_expected: input.expected, p_status: input.status });
    if (result && !result.error) return staffReply({ status: input.status });
    if (result?.error?.code === "40001") return staffReply({ error: "The example changed or needs review. Reopen the plot." }, 409);
  } catch { /* Do not infer a successful save. */ }
  return staffReply({ error: "The example status could not be saved." }, 503);
}
