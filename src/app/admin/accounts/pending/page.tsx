import { redirect } from "next/navigation";
import { activeStaffAdministrator } from "@/lib/supabase/staff-account-server";

export default async function AdminPendingAccountsRoute() {
  if (!await activeStaffAdministrator()) redirect("/admin/unauthorized?reason=role");
  redirect("/admin/accounts?status=pending");
}
