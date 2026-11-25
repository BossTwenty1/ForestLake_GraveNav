import { NextResponse } from "next/server";
import { getCurrentStaff } from "@/lib/auth";
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
      { error: "Only active ADMIN accounts can delete staff accounts." },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  }

  let body: { accountId?: string };
  try {
    body = (await request.json()) as { accountId?: string };
  } catch {
    return NextResponse.json({ error: "A valid JSON request body is required" }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const accountId = body.accountId?.trim() || "";
  if (!UUID_RE.test(accountId)) {
    return NextResponse.json({ error: "A valid staff account identifier is required." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  if (accountId === staff.accountId) {
    return NextResponse.json(
      { error: "You cannot delete your own administrator account." },
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

  // Permanently revoke staff access (preserving referential integrity and audit trail).
  if (targetAccount.account_status !== "REVOKED") {
    const { error: revokeError } = await actorClient.rpc("admin_deactivate_account", {
      p_account_id: accountId,
      p_account_status: "REVOKED",
    });
    if (revokeError) {
      return NextResponse.json(
        { error: revokeError.message || "The staff account could not be removed." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }
  }

  // Also disable the underlying Supabase Auth login if service-role credentials are available.
  const adminClient = getServerServiceSupabase();
  if (adminClient) {
    await adminClient.auth.admin.updateUserById(accountId, {
      ban_duration: "876000h",
    }).catch(() => {
      // Account is already REVOKED in public.account and blocked by GraveNav auth guards.
    });
  }

  return NextResponse.json(
    { ok: true, accountId, username: targetAccount.username, removed: true },
    { status: 200, headers: NO_STORE_HEADERS },
  );
}
