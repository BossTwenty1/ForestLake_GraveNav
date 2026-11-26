import type { ReactNode } from "react";
import { requireStaff } from "@/lib/auth";
import { activeStaffAdministrator } from "@/lib/supabase/staff-account-server";
import { AdminShellClient } from "./admin-shell-client";

export async function AdminShell({ children, active = "Dashboard" }: { children: ReactNode; active?: string }) {
  const staff = await requireStaff();
  const canManageStaff = Boolean(await activeStaffAdministrator());
  return <AdminShellClient active={active} staff={staff} canManageStaff={canManageStaff}>{children}</AdminShellClient>;
}
