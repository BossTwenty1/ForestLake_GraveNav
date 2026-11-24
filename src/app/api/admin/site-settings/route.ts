import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { getCurrentStaff } from "@/lib/auth";
import { normalizeSiteSettings, type SiteSettingsRow } from "@/lib/site-settings";
import { fetchPublicSiteSettingsUncached } from "@/lib/supabase/site-settings";
import { getServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, noarchive",
};

export async function GET() {
  const staff = await getCurrentStaff();
  if (!staff || !staff.isActive || staff.accountStatus !== "ACTIVE" || staff.role !== "ADMIN") {
    return NextResponse.json({ error: "Active ADMIN access is required." }, { status: 403, headers: privateHeaders });
  }
  const { settings, tableReady } = await fetchPublicSiteSettingsUncached();
  return NextResponse.json({ settings, tableReady }, { headers: privateHeaders });
}

export async function POST(request: Request) {
  const staff = await getCurrentStaff();
  if (!staff || !staff.isActive || staff.accountStatus !== "ACTIVE" || staff.role !== "ADMIN") {
    return NextResponse.json({ error: "Only active ADMIN accounts may update visitor site settings." }, { status: 403, headers: privateHeaders });
  }
  const client = await getServerSupabase();
  if (!client) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503, headers: privateHeaders });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400, headers: privateHeaders });
  }

  const parkName = String(body.parkName ?? "").trim();
  const parkAddress = String(body.parkAddress ?? "").trim();
  if (!parkName || !parkAddress) {
    return NextResponse.json({ error: "Park name and park address are required." }, { status: 400, headers: privateHeaders });
  }

  const expectedRevision = typeof body.revision === "number" && Number.isInteger(body.revision)
    ? body.revision
    : null;
  const tone = body.announcementTone === "warning" || body.announcementTone === "success"
    ? body.announcementTone
    : "info";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any).rpc("admin_update_site_settings", {
    p_expected_revision: expectedRevision,
    p_park_name: parkName,
    p_park_address: parkAddress,
    p_operating_hours: String(body.operatingHours ?? "").trim(),
    p_office_phone: String(body.officePhone ?? "").trim(),
    p_office_email: String(body.officeEmail ?? "").trim(),
    p_announcement_enabled: Boolean(body.announcementEnabled),
    p_announcement_title: String(body.announcementTitle ?? "").trim(),
    p_announcement_body: String(body.announcementBody ?? "").trim(),
    p_announcement_tone: tone,
    p_visitor_guidelines: String(body.visitorGuidelines ?? "").trim(),
    p_allow_visitor_gallery_uploads: body.allowVisitorGalleryUploads !== false,
    p_allow_visitor_portrait_requests: body.allowVisitorPortraitRequests !== false,
  });

  if (error) {
    const missingFn = error.code === "PGRST202" || /admin_update_site_settings/i.test(error.message || "");
    return NextResponse.json(
      {
        error: missingFn
          ? "The site_settings database migration has not been applied to this Supabase project yet."
          : error.message || "Site settings could not be saved.",
      },
      { status: missingFn ? 503 : 400, headers: privateHeaders },
    );
  }

  revalidateTag("site-settings", "max");
  revalidatePath("/", "layout");
  revalidatePath("/gravesite");
  revalidatePath("/search");
  revalidatePath("/results");
  revalidatePath("/map");

  const row = (Array.isArray(data) ? data[0] : data) as SiteSettingsRow | null;
  return NextResponse.json({ ok: true, settings: normalizeSiteSettings(row) }, { headers: privateHeaders });
}
