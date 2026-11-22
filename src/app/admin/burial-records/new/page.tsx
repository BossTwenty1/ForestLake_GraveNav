import { AdminShell } from "@/components/admin/admin-shell";
import { BurialRecordEditor } from "@/components/admin/burial-record-pages";

export default async function NewBurialRecordRoute({
  searchParams,
}: { searchParams: Promise<{ returnTo?: string }> }) {
  const { returnTo } = await searchParams;
  return <AdminShell active="Deceased & Interments">
    <BurialRecordEditor returnTo={typeof returnTo === "string" ? returnTo : undefined} />
  </AdminShell>;
}
