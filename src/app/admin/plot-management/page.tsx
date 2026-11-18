import { AdminShell } from "@/components/admin/admin-shell";
import { PlotManagementCrud } from "@/components/admin/admin-crud-pages";
import type { PlotManagementQuery } from "@/lib/supabase/admin-data";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminPlotManagementRoute({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  return <AdminShell active="Plot Management"><PlotManagementCrud initialQueryState={getInitialQueryState(params)} /></AdminShell>;
}

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function getInitialQueryState(params: Record<string, string | string[] | undefined>): PlotManagementQuery {
  const state = getParam(params.state);
  const verification = getParam(params.verification);
  const sort = getParam(params.sort);
  const direction = getParam(params.direction);
  const page = Number(getParam(params.page));
  const pageSize = Number(getParam(params.pageSize));
  const area = getParam(params.area);
  return {
    query: getParam(params.query).slice(0, 160),
    area: /^\d{1,10}$/.test(area) ? area : "all",
    state: ["unknown", "available", "occupied", "booked", "hold"].includes(state) ? state as PlotManagementQuery["state"] : "all",
    verification: ["missing", "pending", "verified", "rejected"].includes(verification) ? verification as PlotManagementQuery["verification"] : "all",
    sort: ["plot", "area", "state", "coordinate"].includes(sort) ? sort as PlotManagementQuery["sort"] : "updated",
    direction: direction === "asc" ? "asc" : "desc",
    page: Number.isInteger(page) && page > 0 ? page - 1 : 0,
    pageSize: [10, 20, 25, 50].includes(pageSize) ? pageSize : 20,
  };
}
