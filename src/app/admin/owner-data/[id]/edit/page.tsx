import { AdminShell } from "@/components/admin/admin-shell";
import { OwnerEditor } from "@/components/admin/owner-pages";

export default async function EditPlotOwnerRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminShell active="Plot Owners"><OwnerEditor key={id} ownerId={id} /></AdminShell>;
}
