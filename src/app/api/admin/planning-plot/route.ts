import { getCurrentStaff } from "@/lib/auth";
import { planningDataSha256 } from "@/lib/phase2-planning";
import { getServerSupabase } from "@/lib/supabase/server";
import { saveLocalMappedBurial } from "./save-local";
import { reviewLocalCoordinates } from "./review-local";
import { confirmLocalPlotMatch } from "./confirm-local";
import { localSupabaseConfig } from "@/lib/supabase/config";

export const POST = saveLocalMappedBurial;
export const PATCH = reviewLocalCoordinates;
export const PUT = confirmLocalPlotMatch;

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const candidate = new URL(request.url).searchParams.get("candidate") ?? "";
  if (candidate.length > 24 || !/^(lawn|estates):[1-9]\d*$/.test(candidate)) {
    return Response.json({ error: "Invalid plot reference." }, { status: 400, headers });
  }
  const staff = await getCurrentStaff();
  if (!staff?.isActive || staff.accountStatus !== "ACTIVE") {
    return Response.json({ error: "Active staff access is required." }, { status: 403, headers });
  }
  try {
    const client = await getServerSupabase();
    const rpc = client as unknown as { rpc: (name: string, args: { p_candidate: string; p_plan_sha256: string }) => PromiseLike<{ data: unknown; error: unknown }> } | null;
    const result = await rpc?.rpc("staff_planning_plot_details", { p_candidate: candidate, p_plan_sha256: planningDataSha256 });
    if (result && !result.error) {
      if (localSupabaseConfig.environment === "local" && result.data && typeof result.data === "object" && !Array.isArray(result.data)) {
        const proposed = await rpc?.rpc("staff_proposed_plot_review", { p_candidate: candidate, p_plan_sha256: planningDataSha256 });
        if (proposed && !proposed.error && proposed.data) return Response.json({ ...result.data, proposedReview: proposed.data }, { headers });
      }
      return Response.json(result.data, { headers });
    }
  } catch {
    // Show an unavailable state; don't infer a plot's availability.
  }
  return Response.json({ error: "Plot details are temporarily unavailable." }, { status: 503, headers });
}
