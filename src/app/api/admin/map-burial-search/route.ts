import { getCurrentStaff } from "@/lib/auth";
import { planningDataSha256 } from "@/lib/phase2-planning";
import { getServerSupabase } from "@/lib/supabase/server";
import { staffReply } from "@/lib/supabase/staff-account-server";

export async function POST(request: Request) {
  let query = "";
  try { const body = await request.json(); query = typeof body?.query === "string" ? body.query.trim() : ""; }
  catch { return staffReply({ error: "Enter a name to search." }, 400); }
  if (query.length < 2 || query.length > 100) return staffReply({ error: "Enter at least two characters." }, 400);
  const staff = await getCurrentStaff();
  if (!staff?.isActive || staff.accountStatus !== "ACTIVE") return staffReply({ error: "Staff access required." }, 403);
  try {
    const client = await getServerSupabase();
    const rpc = client as unknown as { rpc: (name: string, args: Record<string, string>) => PromiseLike<{ data: unknown; error: unknown }> } | null;
    const result = await rpc?.rpc("staff_map_burial_search", { p_query: query, p_plan_sha256: planningDataSha256 });
    if (result && !result.error) return staffReply({ results: result.data });
  } catch { /* Do not substitute public results for a failed staff search. */ }
  return staffReply({ error: "Search is temporarily unavailable." }, 503);
}
