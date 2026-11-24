import { cache } from "react";
import { redirect } from "next/navigation";
import { getServerSupabase } from "./supabase/server";
import type { AccountStatus, StaffAccount, StaffRole } from "./supabase/types";

type StaffCheckResult =
  | { kind: "unconfigured" }
  | { kind: "unauthenticated" }
  | { kind: "authenticated"; staff: StaffAccount | null };

const getRequestAuthState = cache(() => ({
  promise: null as Promise<StaffCheckResult> | null,
}));

function loadStaffForRequest(
  requestClient?: Awaited<ReturnType<typeof getServerSupabase>>,
): Promise<StaffCheckResult> {
  const state = getRequestAuthState();
  if (!state.promise) {
    state.promise = (async (): Promise<StaffCheckResult> => {
      const supabase = requestClient ?? await getServerSupabase();
      if (!supabase) {
        logAuthDiagnostic("server-client", { configured: false, hasSession: false, hasAccount: false });
        return { kind: "unconfigured" };
      }

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (!user) {
        logAuthDiagnostic("user-check", { hasSession: false, authError: Boolean(userError), authErrorCode: userError?.code || "NONE", hasAccount: false });
        return { kind: "unauthenticated" };
      }

      const staff = await readCurrentStaff(supabase, user);
      return { kind: "authenticated", staff };
    })();
  }
  return state.promise;
}

export async function getCurrentStaff(): Promise<StaffAccount | null> {
  const result = await loadStaffForRequest();
  return result.kind === "authenticated" ? result.staff : null;
}

async function readCurrentStaff(supabase: Awaited<ReturnType<typeof getServerSupabase>>, user: { id: string; email?: string }) {
  if (!supabase) return null;

  const { data, error } = await supabase.rpc("get_my_account");
  const account = Array.isArray(data) ? data[0] : data;
  if (!error && account && typeof account === "object") {
    const accountRow = account as { account_id?: string; username?: string; role_name?: string; account_status?: AccountStatus; is_active?: boolean };
    const roleName = accountRow.role_name?.toUpperCase() || "";
    const staffRole = isStaffRole(roleName) ? roleName : null;
    const accountStatus = accountRow.account_status;
    const isActive = Boolean(accountRow.is_active);
    logAuthDiagnostic("account-check", {
      hasSession: true,
      hasAccount: Boolean(accountRow.account_id),
      roleName,
      accountStatus: accountStatus || "UNKNOWN",
      isActive,
    });
    if (accountRow.account_id && accountRow.username && accountStatus && staffRole) {
      return { accountId: accountRow.account_id, username: accountRow.username, role: staffRole, accountStatus, isActive };
    }
  }

  const [{ data: isAdmin, error: adminError }, { data: isManager, error: managerError }] = await Promise.all([
    supabase.rpc("is_active_admin"),
    supabase.rpc("is_active_manager"),
  ]);
  const role: StaffRole | null = isBooleanTrue(isAdmin) ? "ADMIN" : isBooleanTrue(isManager) ? "MANAGER" : null;
  if (!role) {
    logAuthDiagnostic("account-fallback", {
      hasSession: true,
      hasAccount: false,
      roleName: "NONE",
      roleCheckError: Boolean(adminError || managerError),
    });
    return null;
  }

  const { data: accountRow } = await supabase.from("account").select("account_id,username,account_status,is_active").eq("account_id", user.id).maybeSingle();
  const row = accountRow as { account_id?: string; username?: string; account_status?: AccountStatus; is_active?: boolean } | null;
  const accountStatus = row?.account_status || "ACTIVE";
  const isActive = row?.is_active ?? true;
  const username = row?.username || user.email?.split("@")[0] || "Staff user";
  logAuthDiagnostic("account-fallback", {
    hasSession: true,
    hasAccount: Boolean(row?.account_id),
    roleName: role,
    accountStatus,
    isActive,
    roleCheckError: Boolean(adminError || managerError),
  });
  return { accountId: user.id, username, role, accountStatus, isActive };
}

export async function requireStaff(
  requiredRole?: StaffRole,
  requestClient?: Awaited<ReturnType<typeof getServerSupabase>>,
) {
  const result = await loadStaffForRequest(requestClient);
  if (result.kind !== "authenticated") redirect("/admin/login");
  const staff = result.staff;
  if (!staff) redirect("/admin/unauthorized");
  if (!staff.isActive || staff.accountStatus !== "ACTIVE") redirect("/admin/unauthorized");
  if (requiredRole && staff.role !== requiredRole) redirect("/admin/unauthorized?reason=role");
  return staff;
}

function isStaffRole(role: string): role is StaffRole {
  return role === "ADMIN" || role === "MANAGER";
}

function isBooleanTrue(value: unknown) {
  return value === true || (Array.isArray(value) && value[0] === true);
}

function logAuthDiagnostic(event: string, details: Record<string, boolean | string>) {
  if (process.env.NODE_ENV !== "production") console.info(`[GraveNav auth] ${event}`, details);
}
