import { AdminShell } from "@/components/admin/admin-shell";
import { OwnerDirectory } from "@/components/admin/owner-pages";

export default async function AdminOwnerDataRoute({
  searchParams,
}: {
  searchParams: Promise<{ query?: string; page?: string }>;
}) {
  const params = await searchParams;
  const search = typeof params.query === "string" ? params.query.slice(0, 80) : "";
  const requestedPage = Number(params.page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage - 1 : 0;
  return (
    <AdminShell active="Plot Owners">
      <OwnerDirectory key={search + ":" + page} search={search} page={page} />
    </AdminShell>
  );
}
