import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerServiceSupabase } from "@/lib/supabase/server-admin";
import {
  checkVisitorUploadRateLimit,
  inspectAndSanitizeImage,
  MAX_TRIBUTE_PHOTOS_PER_MEMORIAL,
  MAX_VISITOR_PHOTO_BYTES,
  sanitizeVisitorSubmissionFields,
} from "@/lib/visitor-photo-security";

export const dynamic = "force-dynamic";

function positiveId(value: string) {
  return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
}

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(request: Request) {
  const bucket = process.env.NEXT_PUBLIC_SUPABASE_PHOTOS_BUCKET;
  const supabase = getServerServiceSupabase();
  if (!bucket || !supabase) {
    return NextResponse.json(
      { error: "Visitor photo submissions are temporarily unavailable. Please ask cemetery staff for assistance." },
      { status: 503 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload payload." }, { status: 400 });
  }

  // Silent honeypot trap for automated bots.
  const honeypot = String(formData.get("website") ?? "").trim();
  if (honeypot) {
    return NextResponse.json(
      { ok: true, message: "Thank you — your photo has been submitted for administrator review." },
      { status: 202 },
    );
  }

  const burialIdRaw = String(formData.get("burialId") ?? "").trim();
  if (!positiveId(burialIdRaw)) {
    return NextResponse.json({ error: "Invalid memorial record." }, { status: 400 });
  }
  const burialId = Number(burialIdRaw);

  const consent = String(formData.get("consent") ?? "").trim();
  if (consent !== "true") {
    return NextResponse.json(
      { error: "Please confirm that you have permission to share this photo respectfully." },
      { status: 400 },
    );
  }

  const fields = sanitizeVisitorSubmissionFields({
    name: String(formData.get("name") ?? ""),
    relation: String(formData.get("relation") ?? ""),
    caption: String(formData.get("caption") ?? ""),
  });
  if (!fields.ok) {
    return NextResponse.json({ error: fields.error }, { status: 400 });
  }

  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof File)) {
    return NextResponse.json({ error: "Choose a JPG, PNG, or WebP photo to upload." }, { status: 400 });
  }
  if (fileEntry.size <= 0 || fileEntry.size > MAX_VISITOR_PHOTO_BYTES) {
    return NextResponse.json({ error: "Photos must be 3 MB or smaller." }, { status: 400 });
  }

  const rate = checkVisitorUploadRateLimit(`${clientIp(request)}`);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "You have reached the hourly upload limit. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const rawBytes = new Uint8Array(await fileEntry.arrayBuffer());
  const sanitized = inspectAndSanitizeImage(rawBytes);
  if (!sanitized.ok) {
    return NextResponse.json({ error: sanitized.error }, { status: 400 });
  }

  // Confirm the burial record is active and publicly displayed.
  const { data: burialRow, error: burialError } = await supabase
    .from("public_burial_records")
    .select("burial_id")
    .eq("burial_id", burialId)
    .maybeSingle();
  if (burialError || !burialRow) {
    return NextResponse.json({ error: "This memorial record could not be found." }, { status: 404 });
  }

  // Enforce max 5 active (approved + pending) visitor gallery slots per memorial.
  const { data: existingTributes, error: countError } = await supabase
    .from("photo")
    .select("approval_status,public_display")
    .eq("burial_id", burialId)
    .eq("photo_kind", "tribute")
    .in("approval_status", ["pending", "approved"]);

  if (countError) {
    const missingColumn = countError.message?.toLowerCase().includes("photo_kind");
    return NextResponse.json(
      {
        error: missingColumn
          ? "Visitor photo submissions are not enabled on this database yet."
          : "Gallery availability could not be checked. Please try again.",
      },
      { status: 503 },
    );
  }

  const approvedCount = (existingTributes ?? []).filter(row => row.approval_status === "approved" && row.public_display).length;
  const pendingCount = (existingTributes ?? []).filter(row => row.approval_status === "pending").length;
  if (approvedCount + pendingCount >= MAX_TRIBUTE_PHOTOS_PER_MEMORIAL) {
    return NextResponse.json(
      {
        error: approvedCount >= MAX_TRIBUTE_PHOTOS_PER_MEMORIAL
          ? "This memorial gallery has reached its 5-photo limit."
          : "All 5 gallery slots for this memorial are currently filled or awaiting administrator review.",
        slots: {
          approved: approvedCount,
          pending: pendingCount,
          maxSlots: MAX_TRIBUTE_PHOTOS_PER_MEMORIAL,
          remaining: 0,
        },
      },
      { status: 409 },
    );
  }

  const fileName = `tribute-${randomUUID()}.${sanitized.extension}`;
  const storagePath = `burial/${burialId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(storagePath, sanitized.bytes, {
      contentType: sanitized.mimeType,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: "The photo could not be saved right now. Please try again." },
      { status: 502 },
    );
  }

  const { error: insertError } = await supabase.from("photo").insert({
    burial_id: burialId,
    uploaded_by: null,
    storage_path: storagePath,
    file_name: fileName,
    caption: fields.caption,
    captured_at: null,
    approval_status: "pending",
    public_display: false,
    photo_kind: "tribute",
    submitted_by_name: fields.name,
    submitted_by_relation: fields.relation,
  });

  if (insertError) {
    await supabase.storage.from(bucket).remove([storagePath]);
    const limitReached = insertError.message?.includes("5-photo limit");
    return NextResponse.json(
      {
        error: limitReached
          ? "This memorial gallery has reached its 5-photo limit."
          : "Your submission could not be recorded. Please try again.",
      },
      { status: limitReached ? 409 : 500 },
    );
  }

  const nextPending = pendingCount + 1;
  return NextResponse.json(
    {
      ok: true,
      message: "Thank you — your photo has been submitted for administrator review. It will appear in this gallery once approved.",
      slots: {
        approved: approvedCount,
        pending: nextPending,
        maxSlots: MAX_TRIBUTE_PHOTOS_PER_MEMORIAL,
        remaining: Math.max(0, MAX_TRIBUTE_PHOTOS_PER_MEMORIAL - (approvedCount + nextPending)),
      },
    },
    { status: 201 },
  );
}
