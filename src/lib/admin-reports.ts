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
  remains_type?: string | null;
  public_display?: boolean | null;
  deceased: { display_name: string } | null;
};
export type ReportSource = {
  areas: ReportArea[];
  lots: ReportLot[];
  interments: ReportInterment[];
  plotReferences?: Record<number, string>;
};

const monthFormat = new Intl.DateTimeFormat("en-PH", { month: "short", timeZone: "UTC" });
const yearFormat = new Intl.DateTimeFormat("en-PH", { year: "numeric", timeZone: "Asia/Manila" });
const yearOf = (date: string | null) => date?.match(/^(\d{4})-(0[1-9]|1[0-2])-\d{2}$/)?.[1];

export function buildReport(
  { areas, lots, interments, plotReferences = {} }: ReportSource,
  params: { year?: unknown; area?: unknown },
  now = new Date(),
) {
  const currentYear = yearFormat.format(now);
  const years = new Set(Array.from({ length: 5 }, (_, offset) => String(Number(currentYear) - offset)));
  for (const record of interments) {
    const recordYear = yearOf(record.interment_date);
    if (recordYear) years.add(recordYear);
  }
  const year = params.year === "all" || params.year === undefined || params.year === ""
    ? "all"
    : typeof params.year === "string" && years.has(params.year)
      ? params.year
      : "all";

  const area = areas.find((item) => String(item.area_id) === params.area);
  const areaOptions = [...areas].sort((a, b) => a.area_name.localeCompare(b.area_name, "en-PH"));
  const plotById = new Map(lots.map((lot) => [lot.lot_id, lot]));
  const gardenById = new Map(areas.map((garden) => [garden.area_id, garden.area_name]));
  const inScope = (lot: ReportLot | undefined) => !area || lot?.area_id === area.area_id;

  const intermentCountByLot = new Map<number, number>();
  for (const record of interments) {
    intermentCountByLot.set(record.lot_id, (intermentCountByLot.get(record.lot_id) ?? 0) + 1);
  }

  const months = Array.from({ length: 12 }, (_, index) => ({
    label: monthFormat.format(Date.UTC(2000, index, 1)),
    active: 0,
    pending: 0,
  }));

  const plots = { total: 0, occupied: 0, shared: 0 };
  const plotStatuses = { occupied: 0, available: 0, booked: 0, hold: 0, unknown: 0, other: 0 };
  const activity = {
    records: 0,
    active: 0,
    confirmed: 0,
    pending: 0,
    archived: 0,
    publicVisible: 0,
    hiddenStaffOnly: 0,
    undated: 0,
  };

  const gardens = new Map<number | null, {
    id: number | null;
    label: string;
    totalPlots: number;
    occupiedPlots: number;
    availablePlots: number;
    activeRecords: number;
    pendingRecords: number;
    publicRecords: number;
  }>();

  function gardenFor(id: number | undefined) {
    const key = id !== undefined && gardenById.has(id) ? id : null;
    const existing = gardens.get(key);
    if (existing) return existing;
    const garden = {
      id: key,
      label: key === null ? "Area not recorded" : gardenById.get(key)!,
      totalPlots: 0,
      occupiedPlots: 0,
      availablePlots: 0,
      activeRecords: 0,
      pendingRecords: 0,
      publicRecords: 0,
    };
    gardens.set(key, garden);
    return garden;
  }

  for (const option of area ? [area] : areaOptions) gardenFor(option.area_id);

  for (const lot of lots) {
    if (lot.deleted_at !== null || !inScope(lot)) continue;
    const garden = gardenFor(lot.area_id);
    const assignedCount = intermentCountByLot.get(lot.lot_id) ?? 0;
    plots.total++;
    garden.totalPlots++;
    if (assignedCount > 0) {
      plots.occupied++;
      plotStatuses.occupied++;
      garden.occupiedPlots++;
      if (assignedCount >= 2) plots.shared++;
    } else {
      switch (lot.status) {
        case "AVAILABLE":
          plotStatuses.available++;
          garden.availablePlots++;
          break;
        case "BOOKED":
          plotStatuses.booked++;
          break;
        case "HOLD":
          plotStatuses.hold++;
          break;
        case "UNKNOWN":
          plotStatuses.unknown++;
          break;
        default:
          plotStatuses.other++;
      }
    }
  }

  const exportRows: (string | number | boolean | null)[] [] = [];
  for (const record of interments) {
    const lot = plotById.get(record.lot_id);
    if (!inScope(lot)) continue;
    const recordYear = yearOf(record.interment_date);
    if (!recordYear) activity.undated++;

    const inPeriod = year === "all" || recordYear === year;
    if (!inPeriod) continue;

    const friendlyRef = lot
      ? plotReferences[lot.lot_id] || (isSyntheticPlot(lot.lot_code) ? `Plot #${lot.lot_id}` : lot.lot_code)
      : "Unassigned";
    const gardenLabel = gardenById.get(lot?.area_id ?? -1) || "Unassigned";

    exportRows.push([
      record.burial_id,
      record.deceased?.display_name || "Unnamed record",
      friendlyRef,
      gardenLabel,
      record.interment_date || "",
      record.record_status,
      record.interment_confirmed === true ? "Yes" : "No",
      record.remains_type || "",
      record.public_display === true ? "Public" : "Staff only",
    ]);

    activity.records++;
    const garden = gardenFor(lot?.area_id);
    const month = recordYear ? months[Number(record.interment_date?.slice(5, 7)) - 1] : null;

    if (record.record_status === "active") {
      activity.active++;
      garden.activeRecords++;
      if (month) month.active++;
      if (record.interment_confirmed === true && lot?.deleted_at === null) {
        activity.confirmed++;
      }
    } else if (record.record_status === "pending") {
      activity.pending++;
      garden.pendingRecords++;
      if (month) month.pending++;
    } else if (record.record_status === "archived") {
      activity.archived++;
    }

    if (record.public_display === true && record.record_status !== "archived") {
      activity.publicVisible++;
      garden.publicRecords++;
    } else {
      activity.hiddenStaffOnly++;
    }
  }

  return {
    year,
    years: [...years].sort().reverse(),
    area,
    areaOptions,
    plots,
    plotStatuses,
    activity,
    months,
    gardens: [...gardens.values()].sort((a, b) => a.label.localeCompare(b.label, "en-PH")),
    exportRows,
  };
}
