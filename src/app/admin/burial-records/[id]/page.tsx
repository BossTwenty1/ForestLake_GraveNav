import { AdminShell } from "@/components/admin/admin-shell";
import { BurialRecordDetail } from "@/components/admin/burial-record-pages";

export default async function BurialRecordRoute({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string; saved?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <AdminShell active="Deceased & Interments">
    <BurialRecordDetail
      key={id}
      recordId={id}
      returnTo={typeof query.returnTo === "string" ? query.returnTo : undefined}
      saved={query.saved === "1"}
    />
  </AdminShell>;
}
