import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";

export default async function AdminPendingAccountsRoute() {
  await requireStaff("ADMIN");
  redirect("/admin/accounts");
}
