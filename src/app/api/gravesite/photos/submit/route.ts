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
    kind: String(formData.get("kind") ?? "tribute"),
    name: String(formData.get("name") ?? ""),
    relation: String(formData.get("relation") ?? ""),
    caption: String(formData.get("caption") ?? ""),
    contact: String(formData.get("contact") ?? ""),
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

  // Enforce dynamic Admin visitor photo submission toggles if site_settings is present.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: settingsRow } = await (supabase as any)
    .from("site_settings")
    .select("allow_visitor_gallery_uploads,allow_visitor_portrait_requests")
    .eq("setting_id", 1)
    .maybeSingle();
  if (settingsRow && typeof settingsRow === "object") {
    if (fields.kind === "portrait" && settingsRow.allow_visitor_portrait_requests === false) {
      return NextResponse.json(
        { error: "Visitor profile portrait requests are currently paused by cemetery administration." },
        { status: 403 },
      );
    }
    if (fields.kind === "tribute" && settingsRow.allow_visitor_gallery_uploads === false) {
      return NextResponse.json(
        { error: "Visitor remembrance gallery submissions are currently paused by cemetery administration." },
        { status: 403 },
      );
    }
  }

  // Confirm the burial record is active and publicly displayed.
  const { data: burialRow, error: burialError } = await supabase
    .from("public_burial_records")
    .select("burial_id")
    .eq("burial_id", burialId)
    .maybeSingle();
  if (burialError) {
    return NextResponse.json(
      { error: "The memorial registry could not be reached. Please try again later." },
      { status: 503 },
    );
  }
  if (!burialRow) {
    return NextResponse.json({ error: "This memorial record could not be found." }, { status: 404 });
  }

  // Load active photo counts for this memorial.
  const { data: existingPhotos, error: countError } = await supabase
    .from("photo")
    .select("photo_kind,approval_status,public_display")
    .eq("burial_id", burialId)
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

  const rows = existingPhotos ?? [];
  const approvedTributes = rows.filter(r => r.photo_kind === "tribute" && r.approval_status === "approved" && r.public_display).length;
  const pendingTributes = rows.filter(r => r.photo_kind === "tribute" && r.approval_status === "pending").length;
  const portraitApproved = rows.filter(r => r.photo_kind === "portrait" && r.approval_status === "approved" && r.public_display).length;
  const portraitPending = rows.filter(r => r.photo_kind === "portrait" && r.approval_status === "pending").length;

  const buildSlots = (nextPendingTributes: number, nextPortraitPending: number) => ({
    approved: approvedTributes,
    pending: nextPendingTributes,
    maxSlots: MAX_TRIBUTE_PHOTOS_PER_MEMORIAL,
    remaining: Math.max(0, MAX_TRIBUTE_PHOTOS_PER_MEMORIAL - (approvedTributes + nextPendingTributes)),
    portraitApproved,
    portraitPending: nextPortraitPending,
    canSubmitPortrait: (portraitApproved + nextPortraitPending) === 0,
  });

  if (fields.kind === "portrait") {
    if (portraitApproved + portraitPending >= 1) {
      return NextResponse.json(
        {
          error: portraitApproved >= 1
            ? "This memorial already has a profile portrait."
            : "A profile portrait for this memorial is already awaiting administrator review.",
          slots: buildSlots(pendingTributes, portraitPending),
        },
        { status: 409 },
      );
    }
  } else if (approvedTributes + pendingTributes >= MAX_TRIBUTE_PHOTOS_PER_MEMORIAL) {
    return NextResponse.json(
      {
        error: approvedTributes >= MAX_TRIBUTE_PHOTOS_PER_MEMORIAL
          ? "This memorial gallery has reached its 5-photo limit."
          : "All 5 gallery slots for this memorial are currently filled or awaiting administrator review.",
        slots: buildSlots(pendingTributes, portraitPending),
      },
      { status: 409 },
    );
  }

  const prefix = fields.kind === "portrait" ? "visitor-portrait" : "tribute";
  const fileName = `${prefix}-${randomUUID()}.${sanitized.extension}`;
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
    photo_kind: fields.kind,
    submitted_by_name: fields.name,
    submitted_by_relation: fields.relation,
    submitted_by_contact: fields.contact,
  });

  if (insertError) {
    await supabase.storage.from(bucket).remove([storagePath]);
    const msg = insertError.message || "";
    const limitReached = msg.includes("5-photo limit") || msg.includes("already has a profile portrait");
    return NextResponse.json(
      {
        error: msg.includes("already has a profile portrait")
          ? "This memorial already has a profile portrait or a portrait awaiting review."
          : msg.includes("5-photo limit")
            ? "This memorial gallery has reached its 5-photo limit."
            : "Your submission could not be recorded. Please try again.",
      },
      { status: limitReached ? 409 : 500 },
    );
  }

  const nextPendingTributes = fields.kind === "tribute" ? pendingTributes + 1 : pendingTributes;
  const nextPortraitPending = fields.kind === "portrait" ? portraitPending + 1 : portraitPending;

  return NextResponse.json(
    {
      ok: true,
      message: fields.kind === "portrait"
        ? "Thank you — your profile portrait request has been submitted for administrator verification and approval."
        : "Thank you — your photo has been submitted for administrator review. It will appear in this gallery once approved.",
      slots: buildSlots(nextPendingTributes, nextPortraitPending),
    },
    { status: 201 },
  );
}
