import "server-only";

import { redirect } from "next/navigation";
import { getCurrentStaff, requireStaff } from "@/lib/auth";
import type { ReportArea, ReportInterment, ReportLot, ReportSource } from "@/lib/admin-reports";
import { isSyntheticPlot } from "@/lib/synthetic-plots";
import { getServerSupabase } from "./server";

const pageSize = 500;
type Page<T> = { data: T[] | null; count: number | null; error: unknown };

async function readPages<T>(
  load: (from: number, to: number) => PromiseLike<Page<T>>,
  idOf: (row: T) => number,
) {
  const rows: T[] = [];
  const seen = new Set<number>();
  let from = 0;
  for (let page = 0; page < 100; page++) {
    const { data, error } = await load(from, from + pageSize - 1);
    if (error || !data) {
      throw new Error("A complete report could not be read.");
    }
    for (const row of data) {
      const id = idOf(row);
      if (Number.isSafeInteger(id) && !seen.has(id)) {
        seen.add(id);
        rows.push(row);
      }
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

export async function requireReportClient() {
  const client = await getServerSupabase();
  if (!client) redirect("/admin/login");
  await requireStaff(undefined, client);
  return client;
}

export async function getAuthorizedReportClient() {
  const staff = await getCurrentStaff();
  if (!staff || !staff.isActive || staff.accountStatus !== "ACTIVE") return null;
  const client = await getServerSupabase();
  if (!client) return null;
  return { client, staff };
}

export async function readStaffReport(
  client: NonNullable<Awaited<ReturnType<typeof getServerSupabase>>>,
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
      .select("burial_id,lot_id,record_status,interment_date,interment_confirmed,remains_type,deceased(display_name,public_display)",
        { count: "exact" })
      .is("deleted_at", null).order("burial_id").range(from, to), (record) => record.burial_id),
  ]);

  const normalizedInterments: ReportInterment[] = interments.map((row) => {
    const deceased = row.deceased as ({ display_name?: string; public_display?: boolean | null } | null);
    return {
      ...row,
      public_display: deceased?.public_display ?? null,
      deceased: deceased ? { display_name: deceased.display_name || "Unnamed record" } : null,
    };
  });

  const phase2LotIds = lots
    .filter((lot) => lot.deleted_at === null && isSyntheticPlot(lot.lot_code))
    .map((lot) => lot.lot_id);

  const plotReferences: Record<number, string> = {};
  if (phase2LotIds.length) {
    const { data, error } = await client.rpc("staff_sample_plot_references", { p_lot_ids: phase2LotIds });
    if (!error && Array.isArray(data)) {
      for (const item of data) {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          const lotId = Number((item as { lotId?: unknown }).lotId);
          const ref = (item as { reference?: unknown }).reference;
          if (Number.isSafeInteger(lotId) && typeof ref === "string" && ref.trim()) {
            plotReferences[lotId] = ref.trim();
          }
        }
      }
    }
  }

  return { areas, lots, interments: normalizedInterments, plotReferences };
}
