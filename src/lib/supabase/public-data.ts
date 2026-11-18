import { getPublicSupabase } from "./config";
import type { PublicBurialRecord } from "./types";

type PublicRow = {
  burial_id: number;
  display_name: string;
  birth_date: string | null;
  death_date: string | null;
  interment_date?: string | null;
  match_type?: "exact" | "matched" | "similar";
  record_status: "active" | "pending" | "archived";
  lot_code: string;
  synthetic_plot_reference?: string | null;
  area_name?: string | null;
  sector_name?: string | null;
  block_number?: number | null;
  location_geom: unknown;
  px_loc_x: number | null;
  px_loc_y: number | null;
  location_verified: boolean;
  coordinate_status?: "pending" | "verified" | "rejected" | null;
};

// The public view is the allowlisted read boundary. Its optional sample projection
// is absent on older databases; never read private burial notes for visitors.
const PUBLIC_COLUMNS = "*";

export class PublicDataUnavailableError extends Error {
  constructor() { super("Search is temporarily unavailable—try again."); }
}
export type PublicSearchFilters = { query?: string; section?: string; year?: string; sort?: "name" | "newest"; page?: number };
export async function searchPublicBurials(filters: PublicSearchFilters = {}) {
  const page = Number.isInteger(filters.page) ? Math.max(1, Math.min(filters.page || 1, 10000)) : 1;
  const pageSize = 20;
  const client = getPublicSupabase();
  if (client) {
    const { data, error } = await client.rpc("search_public_burials", {
      p_query: (filters.query || "").slice(0, 160), p_section: filters.section || "all",
      p_year: filters.year || "any", p_sort: filters.sort || "name", p_page: page, p_page_size: pageSize,
    });
    if (error || !data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.items) || typeof data.total !== "number") throw new PublicDataUnavailableError();
    return { items: (data.items as PublicRow[]).map(toPublicRecord), total: Number(data.total), page, pageSize };
  }
  throw new PublicDataUnavailableError();
}
export async function getPublicBurialRecords() {
  const client = getPublicSupabase();
  if (client) {
    const { data, error } = await client.from("public_burial_records").select(PUBLIC_COLUMNS).order("burial_id").limit(1000);
    if (error) throw new PublicDataUnavailableError();
    return (data || []).map((row) => toPublicRecord(row as PublicRow));
  }
  throw new PublicDataUnavailableError();
}

export async function getPublicGardenNames() {
  const client = getPublicSupabase();
  if (!client) return [];
  const { data, error } = await client.from("public_burial_records").select("area_name").not("area_name", "is", null).order("area_name").limit(100);
  if (error) throw new PublicDataUnavailableError();
  return [...new Set((data || []).map(row => row.area_name).filter((name): name is string => typeof name === "string" && Boolean(name.trim())))];
}

export async function getPublicBurialRecord(id: string) {
  const client = getPublicSupabase();
  if (client) {
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id))) return null;
    const { data, error } = await client.from("public_burial_records").select(PUBLIC_COLUMNS).eq("burial_id", Number(id)).maybeSingle();
    if (error) throw new PublicDataUnavailableError();
    return data ? toPublicRecord(data as PublicRow) : null;
  }
  throw new PublicDataUnavailableError();
}
export type SharedPlotBurials = { state: "ready" | "unavailable"; items: { id: string; name: string }[] };
export async function getPublicSharedPlotBurials(id: string): Promise<SharedPlotBurials> {
  const client = getPublicSupabase();
  if (!client || !/^\d+$/.test(id) || !Number.isSafeInteger(Number(id))) return { state: "unavailable", items: [] };
  try {
    const { data, error } = await client.rpc("public_shared_plot_burials", { p_burial_id: Number(id) });
    if (error || !Array.isArray(data) || data.some(entry => !entry || typeof entry !== "object" || Array.isArray(entry) ||
      typeof entry.id !== "string" || !/^\d+$/.test(entry.id) || typeof entry.name !== "string")) return { state: "unavailable", items: [] };
    return { state: "ready", items: (data as { id: string; name: string }[]).map(({ id, name }) => ({ id, name })) };
  } catch { return { state: "unavailable", items: [] }; }
}

export async function getPublicBurialRecordByPlot(plot: string) {
  if (!plot.trim()) return null;
  const client = getPublicSupabase();
  if (client) {
    const { data, error } = await client.from("public_burial_records").select(PUBLIC_COLUMNS).eq("lot_code", plot).limit(2);
    if (error) throw new PublicDataUnavailableError();
    return data?.length === 1 ? toPublicRecord(data[0] as PublicRow) : null;
  }
  throw new PublicDataUnavailableError();
}

export function toPublicRecord(row: PublicRow): PublicBurialRecord {
  const dates = [row.birth_date?.slice(0, 4), row.death_date?.slice(0, 4)].filter(Boolean).join(" – ") || "Dates not recorded";
  const section = row.area_name || row.sector_name || "Section not recorded";
  const rowLabel = row.block_number ? `Block ${row.block_number}` : "Location details not recorded";
  const location = parsePoint(row.location_geom);
  const coordinateStatus = getCoordinateStatus(row.coordinate_status, location, row.location_verified);
  return {
    id: String(row.burial_id),
    name: row.display_name,
    birthDate: row.birth_date,
    deathDate: row.death_date,
    dates,
    plot: row.lot_code,
    plotLabel: `Plot ${row.lot_code}`,
    syntheticPlotReference: typeof row.synthetic_plot_reference === "string" && row.synthetic_plot_reference.trim() && row.synthetic_plot_reference.length <= 200 ? row.synthetic_plot_reference : null,
    section,
    row: rowLabel,
    matchType: row.match_type,
    burialDate: row.interment_date ? formatDate(row.interment_date) : "Not recorded",
    status: row.record_status === "active" ? "Active" :
      row.record_status === "pending" ? "Pending" : "Archived",
    location,
    pixelLocation: row.px_loc_x !== null && row.px_loc_y !== null ? { x: row.px_loc_x, y: row.px_loc_y } : null,
    coordinateStatus,
    locationVerified: coordinateStatus === "verified" && Boolean(location),
    tone: "result-media--lawn",
  };
}

function parsePoint(value: unknown) {
  const coordinates = getPointCoordinates(value);
  return coordinates ? { longitude: coordinates[0], latitude: coordinates[1] } : null;
}

function getPointCoordinates(value: unknown): [number, number] | null {
  if (value && typeof value === "object" && "coordinates" in value) {
    const coordinates = (value as { coordinates?: unknown }).coordinates;
    if (Array.isArray(coordinates) && coordinates.length >= 2 && typeof coordinates[0] === "number" && typeof coordinates[1] === "number") return [coordinates[0], coordinates[1]];
  }
  if (typeof value !== "string") return null;
  const normalized = value.replace(/^\s*SRID=\d+\s*;\s*/i, "");
  try {
    const parsed = JSON.parse(normalized) as { coordinates?: unknown };
    const coordinates = parsed.coordinates;
    if (Array.isArray(coordinates) && coordinates.length >= 2 && typeof coordinates[0] === "number" && typeof coordinates[1] === "number") return [coordinates[0], coordinates[1]];
  } catch {
    // PostgREST may return geography as WKT text.
  }
  const match = normalized.match(/^\s*POINT\s*\(\s*([^\s,]+)\s+([^\s,)]+)\s*\)\s*$/i);
  if (!match) return null;
  const longitude = Number(match[1]);
  const latitude = Number(match[2]);
  return Number.isFinite(longitude) && Number.isFinite(latitude) ? [longitude, latitude] : null;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function getCoordinateStatus(status: PublicRow["coordinate_status"], location: PublicBurialRecord["location"], verified: boolean) {
  if (!location) return "missing" as const;
  if (status === "verified" && verified) return "verified" as const;
  if (status === "rejected") return "rejected" as const;
  return "pending" as const;
}
