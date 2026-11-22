import "server-only";

import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import type { ReportArea, ReportInterment, ReportLot, ReportSource } from "@/lib/admin-reports";
import { getServerSupabase } from "./server";

const pageSize = 500;
type Page<T> = { data: T[] | null; count: number | null; error: unknown };

async function readPages<T>(
  load: (from: number, to: number) => PromiseLike<Page<T>>,
  idOf: (row: T) => number,
) {
  const rows: T[] = [];
  let expected: number | null = null;
  let lastId = -Infinity;
  do {
    const { data, count, error } = await load(rows.length, rows.length + pageSize - 1);
    if (error || !data || count === null || (expected !== null && count !== expected) ||
        data.length !== Math.min(pageSize, count - rows.length)) {
      throw new Error("A complete report could not be read.");
    }
    for (const row of data) {
      const id = idOf(row);
      if (!Number.isSafeInteger(id) || id <= lastId) {
        throw new Error("Report records changed while loading.");
      }
      lastId = id;
      rows.push(row);
    }
    expected = count;
  } while (rows.length < expected);
  return rows;
}

export async function requireReportClient() {
  const client = await getServerSupabase();
  if (!client) redirect("/admin/login");
  await requireStaff(undefined, client);
  return client;
}

export async function readStaffReport(
  client: Awaited<ReturnType<typeof requireReportClient>>,
): Promise<ReportSource> {
  const [areas, lots, interments] = await Promise.all([
    readPages<ReportArea>((from, to) => client.from("area")
      .select("area_id,area_name", { count: "exact" })
      .order("area_id").range(from, to), (area) => area.area_id),
    readPages<ReportLot>((from, to) => client.from("lot")
      .select("lot_id,area_id,lot_code,status,deleted_at,location_geom,coordinate_status,coordinate_verified",
        { count: "exact" })
      .order("lot_id").range(from, to), (lot) => lot.lot_id),
    readPages<ReportInterment>((from, to) => client.from("burial_record")
      .select("burial_id,lot_id,record_status,interment_date,interment_confirmed,deceased(display_name)",
        { count: "exact" })
      .is("deleted_at", null).order("burial_id").range(from, to), (record) => record.burial_id),
  ]);
  return { areas, lots, interments };
}
