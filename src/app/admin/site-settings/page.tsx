import { AdminShell } from "@/components/admin/admin-shell";
import { VisitorSiteSettingsEditor } from "@/components/admin/visitor-site-settings";
import { redirect } from "next/navigation";
import { activeStaffAdministrator } from "@/lib/supabase/staff-account-server";
import { fetchPublicSiteSettingsUncached } from "@/lib/supabase/site-settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visitor Site Settings | GraveNav", robots: { index: false, follow: false } };

export default async function AdminSiteSettingsRoute() {
  if (!await activeStaffAdministrator()) redirect("/admin/unauthorized?reason=role");
  const { settings, tableReady } = await fetchPublicSiteSettingsUncached();
  return (
    <AdminShell active="Visitor Site Settings">
      <VisitorSiteSettingsEditor initialSettings={settings} tableReady={tableReady} />
    </AdminShell>
  );
}
