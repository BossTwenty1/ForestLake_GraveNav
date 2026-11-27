import { getCurrentStaff } from "@/lib/auth";
import { planningDataSha256 } from "@/lib/phase2-planning";
import { getServerSupabase } from "@/lib/supabase/server";
import { updateLocalStatus } from "./route-local-update";
import { changeLocalMappedStatus } from "./change-local";

export const POST = updateLocalStatus;
export const PATCH = changeLocalMappedStatus;

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  const staff = await getCurrentStaff();
  if (!staff?.isActive || staff.accountStatus !== "ACTIVE") {
    return Response.json({ error: "Active staff access is required." }, { status: 403, headers });
  }
  try {
    const client = await getServerSupabase();
    const rpc = client as unknown as { rpc: (name: string, args: { p_plan_sha256: string }) => PromiseLike<{ data: unknown; error: unknown }> } | null;
    const result = await rpc?.rpc("staff_planning_plot_statuses", { p_plan_sha256: planningDataSha256 });
    if (result && !result.error) return Response.json(result.data, { headers });
  } catch {
    // A missing status must never be interpreted as availability.
  }
  return Response.json({ error: "Plot status colors are unavailable." }, { status: 503, headers });
}
