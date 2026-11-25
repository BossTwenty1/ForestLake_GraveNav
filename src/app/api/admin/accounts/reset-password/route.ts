import { NextResponse } from "next/server";
import { getCurrentStaff } from "@/lib/auth";
import { validateStaffPassword } from "@/lib/staff-password";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServerServiceSupabase } from "@/lib/supabase/server-admin";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const actorClient = await getServerSupabase();
  if (!actorClient) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503, headers: NO_STORE_HEADERS });
  }

  const { data: { user } } = await actorClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const staff = await getCurrentStaff();
  if (!staff) {
    return NextResponse.json({ error: "An active GraveNav account is required" }, { status: 403, headers: NO_STORE_HEADERS });
  }
  if (staff.role !== "ADMIN" || staff.accountStatus !== "ACTIVE" || !staff.isActive) {
    return NextResponse.json(
      { error: "Only active ADMIN accounts may reset staff passwords" },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  }

  const adminClient = getServerServiceSupabase();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Protected Auth Admin management is not configured for this environment" },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  let body: { accountId?: string; password?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "A valid JSON request body is required" }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const accountId = body.accountId?.trim() || "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!UUID_RE.test(accountId)) {
    return NextResponse.json({ error: "A valid staff account identifier is required." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  if (accountId === staff.accountId) {
    return NextResponse.json(
      { error: "Use Change Password in your account menu to update your own password." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const passwordCheck = validateStaffPassword(password);
  if (!passwordCheck.valid) {
    return NextResponse.json(
      { error: passwordCheck.error || "Enter a stronger password." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const { data: targetAccount, error: lookupError } = await actorClient
    .from("account")
    .select("account_id,username,account_status")
    .eq("account_id", accountId)
    .maybeSingle();

  if (lookupError || !targetAccount) {
    return NextResponse.json({ error: "Staff account not found." }, { status: 404, headers: NO_STORE_HEADERS });
  }
  if (targetAccount.account_status === "REVOKED") {
    return NextResponse.json(
      { error: "Passwords cannot be reset for permanently revoked accounts." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const { data: updated, error: updateError } = await adminClient.auth.admin.updateUserById(accountId, {
    password,
    email_confirm: true,
  });

  if (updateError || !updated.user) {
    return NextResponse.json(
      { error: "The staff password could not be updated right now. Try again shortly." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      accountId,
      username: targetAccount.username,
      email: updated.user.email || null,
    },
    { status: 200, headers: NO_STORE_HEADERS },
  );
}
