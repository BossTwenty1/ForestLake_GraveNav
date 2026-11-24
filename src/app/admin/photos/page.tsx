import { AdminShell } from "@/components/admin/admin-shell";
import { AdminPhotosPage } from "@/components/admin/admin-page-content";

export const dynamic = "force-dynamic";
export const metadata = { title: "Photo Moderation | GraveNav", robots: { index: false, follow: false } };

export default function AdminPhotosRoute() {
  return <AdminShell active="Photos"><AdminPhotosPage /></AdminShell>;
}
