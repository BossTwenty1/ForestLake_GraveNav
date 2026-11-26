import { getCurrentStaff } from "@/lib/auth";
import { planningDataSha256 } from "@/lib/phase2-planning";
import { getPublicSupabase } from "@/lib/supabase/config";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const headers = { "Cache-Control": "private, no-store" };
  const release = params.get("release") ?? undefined;
  const staff = params.get("staff") === "1";
  if (release !== undefined && !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(release)) {
    return Response.json({ error: "Invalid map release." }, { status: 400, headers });
  }
  if (staff) {
    const account = await getCurrentStaff();
    if (!account?.isActive || account.accountStatus !== "ACTIVE") {
      return Response.json({ error: "Active staff access is required." }, { status: 403, headers });
    }
  }

  try {
    const client = staff ? await getServerSupabase() : getPublicSupabase();
    const rpc = client as unknown as {
      rpc: (name: string, args: { p_plan_sha256: string; p_release_id?: string; p_staff: boolean }) => {
        abortSignal: (signal: AbortSignal) => PromiseLike<{ data: { memorials: string[]; occupied: string[] } | null; error: unknown }>;
      };
    } | null;
    const result = await rpc?.rpc("map_plot_highlights", {
      p_plan_sha256: planningDataSha256,
      ...(release ? { p_release_id: release } : {}),
      p_staff: staff,
    }).abortSignal(request.signal);
    if (result?.data && !result.error) {
      return Response.json(result.data, { headers });
    }
  } catch {
    // The underlying map and its controls are still usable.
  }
  return Response.json({ error: "Plot highlights are temporarily unavailable." }, { status: 503, headers });
}
