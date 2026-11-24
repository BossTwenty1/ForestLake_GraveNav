import { AdminShell } from "@/components/admin/admin-shell";
import { VisitorSiteSettingsEditor } from "@/components/admin/visitor-site-settings";
import { requireStaff } from "@/lib/auth";
import { fetchPublicSiteSettingsUncached } from "@/lib/supabase/site-settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visitor Site Settings | GraveNav", robots: { index: false, follow: false } };

export default async function AdminSiteSettingsRoute() {
  await requireStaff("ADMIN");
  const { settings, tableReady } = await fetchPublicSiteSettingsUncached();
  return (
    <AdminShell active="Visitor Site Settings">
      <VisitorSiteSettingsEditor initialSettings={settings} tableReady={tableReady} />
    </AdminShell>
  );
}
