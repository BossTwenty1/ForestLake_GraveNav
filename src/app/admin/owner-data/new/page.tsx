import { AdminShell } from "@/components/admin/admin-shell";
import { OwnerEditor } from "@/components/admin/owner-pages";

export default function NewPlotOwnerRoute() {
  return <AdminShell active="Plot Owners"><OwnerEditor /></AdminShell>;
}
