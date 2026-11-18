import { AdminShell } from "@/components/admin/admin-shell";
import { OwnerProfile } from "@/components/admin/owner-pages";

export default async function PlotOwnerRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminShell active="Plot Owners"><OwnerProfile key={id} ownerId={id} /></AdminShell>;
}
