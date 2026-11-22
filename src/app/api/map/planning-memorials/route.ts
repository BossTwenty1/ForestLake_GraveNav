import { getCapstonePlanningMemorials } from "@/lib/supabase/phase2-data";

export async function GET(request: Request) {
  const candidateId = new URL(request.url).searchParams.get("candidate") ?? "";
  const headers = { "Cache-Control": "no-store" };
  if (candidateId.length > 24 || !/^(lawn|estates):[1-9]\d*$/.test(candidateId)) {
    return Response.json({ error: "Invalid plot reference." }, { status: 400, headers });
  }
  try {
    return Response.json(await getCapstonePlanningMemorials(candidateId, request.signal), { headers });
  } catch {
    return Response.json({ error: "Memorial details are temporarily unavailable." }, { status: 503, headers });
  }
}
