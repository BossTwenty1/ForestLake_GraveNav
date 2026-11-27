import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    { error: "Visitor photo submissions are no longer available. Please contact cemetery staff for assistance." },
    { status: 410 },
  );
}
