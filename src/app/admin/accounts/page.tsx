import { AdminShell } from "@/components/admin/admin-shell";
import { AdminStaffAccounts } from "@/components/admin/admin-staff-accounts";
import { requireStaff } from "@/lib/auth";

export default async function AdminAccountsRoute({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireStaff("ADMIN");
  const { status } = await searchParams;
  return <AdminShell active="Staff Accounts"><AdminStaffAccounts initialFilter={status === "pending" ? "PENDING" : "ALL"} /></AdminShell>;
}
