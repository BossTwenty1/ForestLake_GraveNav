import { NextResponse } from "next/server";
import { getPhaseTwoDestination } from "@/lib/supabase/phase2-data";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") || "";
  const result = await getPhaseTwoDestination(id);
  return NextResponse.json(result.geography, {
    status: result.geography.data ? 200 : 503,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
