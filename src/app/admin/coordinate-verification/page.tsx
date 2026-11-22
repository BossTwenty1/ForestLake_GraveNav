import { AdminShell } from "@/components/admin/admin-shell";
import { CoordinateReview } from "@/components/admin/coordinate-review";
import { requireStaff } from "@/lib/auth";
import type { CoordinateVerificationQuery } from "@/lib/supabase/admin-data";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminCoordinateVerificationRoute({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff("ADMIN");
  const params = await searchParams;
  return <AdminShell active="Coordinate Verification"><CoordinateReview initialQueryState={getInitialQueryState(params)} selectedPlot={getParam(params?.plot)} /></AdminShell>;
}

function getParam(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] || "" : value || ""; }

function getInitialQueryState(params: Record<string, string | string[] | undefined>): CoordinateVerificationQuery {
  const state = getParam(params.state);
  const sort = getParam(params.sort);
  const direction = getParam(params.direction);
  const page = Number(getParam(params.page));
  const pageSize = Number(getParam(params.pageSize));
  const area = getParam(params.area);
  return {
    query: getParam(params.query).slice(0, 160),
    area: /^\d{1,10}$/.test(area) ? area : "all",
    state: ["all", "missing", "pending", "rejected", "verified"].includes(state) ? state as CoordinateVerificationQuery["state"] : "actionable",
    sort: ["updated", "plot", "area", "status", "accuracy"].includes(sort) ? sort as CoordinateVerificationQuery["sort"] : "priority",
    direction: direction === "desc" ? "desc" : "asc",
    page: Number.isInteger(page) && page > 0 ? page - 1 : 0,
    pageSize: [10, 20, 25, 50].includes(pageSize) ? pageSize : 20,
  };
}
