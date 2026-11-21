import { isSyntheticPlot } from "./synthetic-plots";

export type ReportArea = { area_id: number; area_name: string };
export type ReportLot = {
  lot_id: number;
  area_id: number;
  lot_code: string;
  status: string;
  deleted_at: string | null;
  location_geom: unknown;
  coordinate_status: string;
  coordinate_verified: boolean;
};
export type ReportInterment = {
  burial_id: number;
  lot_id: number;
  record_status: string;
  interment_date: string | null;
  interment_confirmed: boolean | null;
  deceased: { display_name: string } | null;
};
export type ReportSource = { areas: ReportArea[]; lots: ReportLot[]; interments: ReportInterment[] };

const monthFormat = new Intl.DateTimeFormat("en-PH", { month: "short", timeZone: "UTC" });
const yearFormat = new Intl.DateTimeFormat("en-PH", { year: "numeric", timeZone: "Asia/Manila" });
const yearOf = (date: string | null) => date?.match(/^(\d{4})-(0[1-9]|1[0-2])-\d{2}$/)?.[1];

export function buildReport(
  { areas, lots, interments }: ReportSource,
  params: { year?: unknown; area?: unknown },
  now = new Date(),
) {
  const currentYear = yearFormat.format(now);
  const years = new Set(Array.from({ length: 5 }, (_, offset) => String(Number(currentYear) - offset)));
  for (const record of interments) {
    const year = yearOf(record.interment_date);
    if (year) years.add(year);
  }
  const year = typeof params.year === "string" && years.has(params.year) ? params.year : currentYear;
  const area = areas.find((item) => String(item.area_id) === params.area);
  const areaOptions = [...areas].sort((a, b) => a.area_name.localeCompare(b.area_name, "en-PH"));
  const plotById = new Map(lots.map((lot) => [lot.lot_id, lot]));
  const gardenById = new Map(areas.map((garden) => [garden.area_id, garden.area_name]));
  const inScope = (lot: ReportLot | undefined) => !area || lot?.area_id === area.area_id;
  const months = Array.from({ length: 12 }, (_, index) => ({
    label: monthFormat.format(Date.UTC(2000, index, 1)),
    confirmed: 0,
    pending: 0,
  }));
  const plots = { physical: 0, synthetic: 0 };
  const plotStatuses = { hold: 0, booked: 0, available: 0, unknown: 0, other: 0 };
  const coordinates = { verified: 0, pending: 0, rejected: 0, missing: 0 };
  const activity = { records: 0, confirmed: 0, pending: 0, synthetic: 0, undated: 0 };
  const gardens = new Map<number | null, {
    id: number | null;
    label: string;
    physical: number;
    synthetic: number;
    verified: number;
    confirmed: number;
    pending: number;
  }>();
  function gardenFor(id: number | undefined) {
    const key = id !== undefined && gardenById.has(id) ? id : null;
    const existing = gardens.get(key);
    if (existing) return existing;
    const garden = {
      id: key, label: key === null ? "Area not recorded" : gardenById.get(key)!,
      physical: 0, synthetic: 0, verified: 0, confirmed: 0, pending: 0,
    };
    gardens.set(key, garden);
    return garden;
  }
  for (const option of area ? [area] : areaOptions) gardenFor(option.area_id);

  for (const lot of lots) {
    if (lot.deleted_at !== null || !inScope(lot)) continue;
    const garden = gardenFor(lot.area_id);
    if (isSyntheticPlot(lot.lot_code)) {
      plots.synthetic++;
      garden.synthetic++;
      continue;
    }
    plots.physical++;
    garden.physical++;
    switch (lot.status) {
      case "HOLD": plotStatuses.hold++; break;
      case "BOOKED": plotStatuses.booked++; break;
      case "AVAILABLE": plotStatuses.available++; break;
      case "UNKNOWN": plotStatuses.unknown++; break;
      default: plotStatuses.other++;
    }
    if (lot.location_geom == null) coordinates.missing++;
    else if (lot.coordinate_status === "rejected") coordinates.rejected++;
    else if (lot.coordinate_status === "verified" && lot.coordinate_verified === true) {
      coordinates.verified++;
      garden.verified++;
    } else coordinates.pending++;
  }

  const exportRows = [];
  for (const record of interments) {
    const lot = plotById.get(record.lot_id);
    if (!inScope(lot)) continue;
    const recordYear = yearOf(record.interment_date);
    const synthetic = isSyntheticPlot(lot?.lot_code);
    if (recordYear === year || params.year === "all") {
      exportRows.push([
        record.burial_id,
        record.deceased?.display_name || "Unnamed record",
        lot?.lot_code || "Unassigned",
        gardenById.get(lot?.area_id ?? -1) || "Unassigned",
        record.record_status,
      ]);
    }
    if (!recordYear) activity.undated++;
    if (recordYear !== year) continue;
    activity.records++;
    if (synthetic) activity.synthetic++;
    const month = months[Number(record.interment_date?.slice(5, 7)) - 1];
    const garden = gardenFor(lot?.area_id);
    if (record.record_status === "pending") {
      activity.pending++;
      month.pending++;
      garden.pending++;
    }
    if (record.record_status === "active" && record.interment_confirmed === true &&
        lot?.deleted_at === null && !synthetic) {
      activity.confirmed++;
      month.confirmed++;
      garden.confirmed++;
    }
  }

  return {
    year, years: [...years].sort().reverse(), area, areaOptions,
    plots, plotStatuses, coordinates, activity, months,
    gardens: [...gardens.values()].sort((a, b) => a.label.localeCompare(b.label, "en-PH")),
    exportRows,
  };
}
