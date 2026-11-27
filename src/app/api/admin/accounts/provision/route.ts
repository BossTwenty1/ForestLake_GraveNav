import { getServerServiceSupabase } from "@/lib/supabase/server-admin";
import { activeStaffAdministrator, isStaffJsonRequest, staffAccountIdPattern, staffEmailCallback, staffReply } from "@/lib/supabase/staff-account-server";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const actor = await activeStaffAdministrator();
  if (!actor) return staffReply({ error: "Sign in as an active Administrator to send an invitation." }, 403);
  if (!isStaffJsonRequest(request)) return staffReply({ error: "Open Account Management and try again." }, 400);

  const client = getServerServiceSupabase();
  const redirectTo = staffEmailCallback("invite");
  if (!client || !redirectTo || process.env.GRAVENAV_PAUSE_STAFF_INVITATIONS === "1") {
    return staffReply({ error: "Staff invitations are unavailable. Check the email settings and try again." }, 503);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || "password" in body || "activateImmediately" in body) {
    return staffReply({ error: "Use the invitation form to add staff." }, 400);
  }

  const resend = "accountId" in body;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const role = body.role;
  const accountId = typeof body.accountId === "string" ? body.accountId : "";
  const revision = body.revision;
  if (resend ? !staffAccountIdPattern.test(accountId) || !Number.isSafeInteger(revision) :
    !emailPattern.test(email) || email.length > 254 || username.length < 2 || username.length > 80 ||
      (role !== "SUPER_ADMIN" && role !== "ADMIN" && role !== "MANAGER")) {
    return staffReply({ error: "Check the staff name, work email, and role." }, 400);
  }

  const { data: attempt, error: startError } = await client.rpc("staff_begin_invitation", {
    p_actor: actor.accountId,
    ...(resend ? { p_account_id: accountId, p_revision: revision } : {
      p_email: email, p_username: username, p_role: role,
    }),
  });
  if (startError || !attempt) {
    return staffReply({ error: startError?.code === "P0001"
      ? startError.message : "The invitation could not be started. Try again." }, startError?.code === "P0001" ? 409 : 503);
  }
  if (attempt.state === "sent") return staffReply({ ok: true, alreadySent: true });
  if (attempt.state === "sending") {
    return staffReply({ error: "This invitation is being processed. Wait a moment before trying again." }, 409);
  }

  let invitedId: string | undefined;
  try {
    const { data, error } = await client.auth.admin.inviteUserByEmail(attempt.email, {
      redirectTo,
      // Used only to reconcile an interrupted provider response. Roles come from the database.
      data: { gravenav_invitation_id: attempt.id },
    });
    if (!error && data.user) invitedId = data.user.id;
  } catch {
    // Finalize a failed or ambiguous attempt without exposing provider response details.
  }

  const { data: receipt, error: finishError } = await client.rpc("staff_finish_invitation", {
    p_actor: actor.accountId,
    p_invitation_id: attempt.id,
    p_attempt_id: attempt.attemptId,
    p_sent: Boolean(invitedId),
    ...(invitedId ? { p_user_id: invitedId } : {}),
  });
  if (finishError || receipt?.state !== "sent") {
    return staffReply({ error: finishError
      ? "Delivery could not be confirmed. Wait two minutes, then retry with the same email and role."
      : "The invitation email could not be sent. Check the email settings and try again." }, 502);
  }
  return staffReply({ ok: true });
}
