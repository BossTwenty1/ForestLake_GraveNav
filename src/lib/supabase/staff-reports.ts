import "server-only";

import { redirect } from "next/navigation";
import { getCurrentStaff, requireStaff } from "@/lib/auth";
import type { ReportArea, ReportInterment, ReportLot, ReportSource } from "@/lib/admin-reports";
import { isSyntheticPlot } from "@/lib/synthetic-plots";
import { getServerSupabase } from "./server";

const pageSize = 1000;
type Page<T> = { data: T[] | null; count?: number | null; error: unknown };

async function readPages<T>(
  load: (from: number, to: number, withCount: boolean) => PromiseLike<Page<T>>,
  idOf: (row: T) => number,
) {
  const rows: T[] = [];
  const seen = new Set<number>();
  const append = (batch: T[]) => {
    for (const row of batch) {
      const id = idOf(row);
      if (Number.isSafeInteger(id) && !seen.has(id)) {
        seen.add(id);
        rows.push(row);
      }
    }
  };

  const first = await load(0, pageSize - 1, true);
  if (first.error || !first.data) {
    throw new Error("A complete report could not be read.");
  }
  append(first.data);
  if (first.data.length < pageSize) return rows;

  const totalCount = typeof first.count === "number" && Number.isFinite(first.count) ? first.count : null;
  if (totalCount !== null && totalCount > pageSize) {
    const totalPages = Math.min(100, Math.ceil(totalCount / pageSize));
    const offsets = Array.from({ length: totalPages - 1 }, (_, index) => (index + 1) * pageSize);
    // Fetch remaining pages in small concurrent waves to avoid a 10-step sequential waterfall.
    const concurrency = 6;
    for (let i = 0; i < offsets.length; i += concurrency) {
      const wave = offsets.slice(i, i + concurrency);
      const results = await Promise.all(
        wave.map((from) => load(from, from + pageSize - 1, false)),
      );
      for (const page of results) {
        if (page.error || !page.data) {
          throw new Error("A complete report could not be read.");
        }
        append(page.data);
      }
    }
    return rows;
  }

  let from = pageSize;
  for (let page = 1; page < 100; page++) {
    const { data, error } = await load(from, from + pageSize - 1, false);
    if (error || !data) {
      throw new Error("A complete report could not be read.");
    }
    append(data);
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
    readPages<ReportArea>((from, to, withCount) => client.from("area")
      .select("area_id,area_name", withCount ? { count: "exact" } : undefined)
      .order("area_id").range(from, to), (area) => area.area_id),
    readPages<ReportLot>((from, to, withCount) => client.from("lot")
      .select("lot_id,area_id,lot_code,status,deleted_at,location_geom,coordinate_status,coordinate_verified",
        withCount ? { count: "exact" } : undefined)
      .order("lot_id").range(from, to), (lot) => lot.lot_id),
    readPages<ReportInterment>((from, to, withCount) => client.from("burial_record")
      .select("burial_id,lot_id,record_status,interment_date,interment_confirmed,remains_type,deceased(display_name,public_display)",
        withCount ? { count: "exact" } : undefined)
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
