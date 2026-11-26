import { NextResponse } from "next/server";
import { getCurrentStaff } from "@/lib/auth";
import { validateStaffPassword } from "@/lib/staff-password";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServerServiceSupabase } from "@/lib/supabase/server-admin";

function reply(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) ||
    !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return reply({ error: "Open the password setup page and try again." }, 400);
  }

  const supabase = await getServerSupabase();
  if (!supabase) return reply({ error: "Password setup is unavailable." }, 503);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return reply({ error: "Reopen a valid setup or recovery email to continue." }, 401);

  const staff = await getCurrentStaff();
  if (!staff || staff.accountId !== user.id || staff.accountStatus === "REVOKED" || !user.email_confirmed_at) {
    return reply({ error: "This sign-in does not have an eligible staff account. Contact your Administrator." }, 403);
  }

  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";
  const strength = validateStaffPassword(password);
  if (!strength.valid) return reply({ error: strength.error || "Choose a stronger password." }, 400);

  const onboarding = staff.accountStatus === "PENDING";
  const service = onboarding ? getServerServiceSupabase() : null;
  if (onboarding && !service) return reply({ error: "Staff setup is temporarily unavailable." }, 503);

  const { data: updated, error } = await supabase.auth.updateUser({ password });
  if (error || updated.user?.id !== user.id || !updated.user.email_confirmed_at) {
    return reply({ error: "The password could not be saved. Try a different password or request a new setup link." }, 400);
  }
  if (onboarding && service) {
    const result = await service.rpc("record_staff_password_setup", { p_account_id: user.id });
    if (result.error) return reply({ error: "Your password was saved, but setup could not be recorded. Retry this step before asking for access." }, 503);
    return reply({
      accountStatus: "PENDING",
      notice: "Your password was saved. An Administrator must grant access before you can enter the workspace.",
    });
  }

  return reply({ destination: staff.accountStatus === "ACTIVE" && staff.isActive ? "/admin" : "/admin/unauthorized" });
}
