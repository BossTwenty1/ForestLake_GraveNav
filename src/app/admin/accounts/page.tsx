import { AdminShell } from "@/components/admin/admin-shell";
import { AdminStaffAccounts } from "@/components/admin/admin-staff-accounts";
import { redirect } from "next/navigation";
import { activeStaffAdministrator } from "@/lib/supabase/staff-account-server";

export default async function AdminAccountsRoute({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  if (!await activeStaffAdministrator()) redirect("/admin/unauthorized?reason=role");
  const { status } = await searchParams;
  return <AdminShell active="Account Management"><AdminStaffAccounts initialFilter={status === "pending" ? "PENDING" : "ALL"} /></AdminShell>;
}
