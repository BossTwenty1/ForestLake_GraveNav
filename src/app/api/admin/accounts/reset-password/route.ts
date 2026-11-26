import { getPublicSupabase } from "@/lib/supabase/config";
import { getServerSupabase } from "@/lib/supabase/server";
import { activeStaffAdministrator, isStaffJsonRequest, staffAccountIdPattern, staffEmailCallback, staffReply } from "@/lib/supabase/staff-account-server";

export async function POST(request: Request) {
  const actor = await activeStaffAdministrator();
  if (!actor) return staffReply({ error: "Sign in as an active Administrator to help with password recovery." }, 403);
  if (!isStaffJsonRequest(request)) return staffReply({ error: "Open Staff Accounts and try again." }, 400);
  const body = await request.json().catch(() => null);
  const accountId = typeof body?.accountId === "string" ? body.accountId : "";
  if (!staffAccountIdPattern.test(accountId) || !Number.isSafeInteger(body?.revision) || "password" in body) {
    return staffReply({ error: "Select a staff account to send a recovery email." }, 400);
  }
  if (accountId === actor.accountId) {
    return staffReply({ error: "Use Change password in your account menu or Forgot password at sign-in." }, 400);
  }

  const client = await getServerSupabase();
  const sender = getPublicSupabase();
  const redirectTo = staffEmailCallback("recovery");
  if (!client || !sender || !redirectTo) return staffReply({ error: "Password recovery email is unavailable." }, 503);

  const { data, error } = await client.rpc("staff_account_details", { p_account_id: accountId });
  const target = data?.account;
  if (error || !target?.canRecover || !target.email || target.revision !== body.revision) {
    return staffReply({ error: "This account changed or cannot receive recovery email. Reload and review it." }, 409);
  }
  const { error: sendError } = await sender.auth.resetPasswordForEmail(target.email, { redirectTo });
  if (sendError) {
    return staffReply({ error: "Recovery email could not be sent. Check the email settings and try again." }, 502);
  }
  return staffReply({ ok: true });
}
