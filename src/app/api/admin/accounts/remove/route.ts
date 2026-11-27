import { getServerServiceSupabase } from "@/lib/supabase/server-admin";
import {
  activeSuperAdministrator,
  isStaffJsonRequest,
  staffAccountIdPattern,
  staffReply,
} from "@/lib/supabase/staff-account-server";

function isAuthUserNotFound(error: { status?: number; code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  if (error.status === 404 || error.code === "user_not_found") return true;
  return typeof error.message === "string" && /user not found/i.test(error.message);
}

export async function POST(request: Request) {
  const actor = await activeSuperAdministrator();
  if (!actor) {
    return staffReply({ error: "Sign in as an active Super Administrator to delete a staff account." }, 403);
  }
  if (!isStaffJsonRequest(request)) {
    return staffReply({ error: "Open Account Management and try again." }, 400);
  }

  const client = getServerServiceSupabase();
  if (!client) {
    return staffReply({ error: "Permanent account deletion is unavailable right now." }, 503);
  }

  const body = await request.json().catch(() => null);
  const accountId = typeof body?.accountId === "string" ? body.accountId : "";
  const revision = body?.revision;
  if (!body || typeof body !== "object" || !staffAccountIdPattern.test(accountId) || !Number.isSafeInteger(revision)) {
    return staffReply({ error: "Select a staff account to delete." }, 400);
  }
  if (accountId === actor.accountId) {
    return staffReply({ error: "You cannot delete your own account." }, 400);
  }

  const { data: attempt, error: startError } = await client.rpc("staff_begin_account_deletion", {
    p_actor: actor.accountId,
    p_account_id: accountId,
    p_revision: revision,
  });

  if (startError || !attempt) {
    if (startError?.code === "42501") {
      return staffReply({ error: startError.message || "Only an active Super Administrator may delete staff accounts." }, 403);
    }
    if (startError?.code === "40001" || startError?.code === "P0001") {
      return staffReply({ error: startError.message }, 409);
    }
    return staffReply({ error: "Account deletion could not be started. Try again." }, 503);
  }

  if (attempt.state === "completed") {
    return staffReply({ ok: true, alreadyDeleted: true });
  }
  if (attempt.state === "deleting") {
    return staffReply({ error: "This account deletion is already in progress. Wait a moment and reload." }, 409);
  }

  let authDeleted = !attempt.hasAuthUser;
  if (attempt.hasAuthUser) {
    try {
      const { error: deleteError } = await client.auth.admin.deleteUser(accountId, false);
      authDeleted = !deleteError || isAuthUserNotFound(deleteError);
    } catch {
      authDeleted = false;
    }
  }

  const { data: receipt, error: finishError } = await client.rpc("staff_finish_account_deletion", {
    p_actor: actor.accountId,
    p_account_id: accountId,
    p_attempt_id: attempt.attemptId,
    p_auth_deleted: authDeleted,
  });

  if (finishError) {
    return staffReply(
      {
        error: "Workspace access is blocked, but permanent deletion could not be confirmed. Reload Account Management and retry to finish.",
        retryable: true,
        revision: attempt.revision,
      },
      502,
    );
  }

  if (receipt?.state !== "completed") {
    return staffReply(
      {
        error: "Workspace access is blocked, but permanent sign-in removal failed. Retry Delete account to finish.",
        retryable: true,
        revision: receipt?.revision ?? attempt.revision,
      },
      502,
    );
  }

  return staffReply({ ok: true });
}
