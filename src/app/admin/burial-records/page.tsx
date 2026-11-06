import { AdminShell } from "@/components/admin/admin-shell";
import { BurialRecordsCrud } from "@/components/admin/admin-crud-pages";
import type { BurialRecordQuery } from "@/lib/supabase/admin-data";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminBurialRecordsRoute({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const initialQueryState = getInitialQueryState(params);
  return (
    <AdminShell active="Burial Records">
      <BurialRecordsCrud
        initialQueryState={initialQueryState}
        selectedRecordId={getParam(params?.record)}
        showAdd={getParam(params?.add) === "1"}
      />
    </AdminShell>
  );
}

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function getInitialQueryState(params: Record<string, string | string[] | undefined>): BurialRecordQuery {
  const status = getParam(params.status);
  const verification = getParam(params.verification);
  const dateFilter = getParam(params.date);
  const sort = getParam(params.sort);
  const direction = getParam(params.direction);
  const page = Number(getParam(params.page));
  const pageSize = Number(getParam(params.pageSize));
  return {
    query: getParam(params.query).slice(0, 160),
    section: getParam(params.section).slice(0, 160) || "all",
    status: ["active", "pending", "archived"].includes(status)
      ? status as BurialRecordQuery["status"]
      : "all",
    verification: ["verified", "pending", "rejected"].includes(verification)
      ? verification as BurialRecordQuery["verification"]
      : "all",
    dateFilter: ["this-year", "last-five-years", "undated"].includes(dateFilter)
      ? dateFilter as BurialRecordQuery["dateFilter"]
      : "all",
    sort: ["name", "plot", "interment-date", "status"].includes(sort)
      ? sort as BurialRecordQuery["sort"]
      : "updated",
    direction: direction === "asc" ? "asc" : "desc",
    page: Number.isInteger(page) && page > 0 ? page - 1 : 0,
    pageSize: [10, 20, 25, 50].includes(pageSize) ? pageSize : 20,
  };
}
