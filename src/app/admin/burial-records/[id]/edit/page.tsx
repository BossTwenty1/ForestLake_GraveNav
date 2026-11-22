import { AdminShell } from "@/components/admin/admin-shell";
import { BurialRecordEditor } from "@/components/admin/burial-record-pages";

export default async function EditBurialRecordRoute({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <AdminShell active="Deceased & Interments">
    <BurialRecordEditor
      key={id}
      recordId={id}
      returnTo={typeof query.returnTo === "string" ? query.returnTo : undefined}
    />
  </AdminShell>;
}
