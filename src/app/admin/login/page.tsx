import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { getCurrentStaff } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const staff = await getCurrentStaff();
  if (staff?.isActive && staff.accountStatus === "ACTIVE") redirect("/admin");

  const params = await searchParams;
  const rawError = Array.isArray(params.error) ? params.error[0] : params.error;
  return <AdminLoginForm initialError={rawError} />;
}
