import "server-only";

import { requireStaff } from "@/lib/auth";
import { getServerSupabase } from "./server";
import { toPublicRecord } from "./public-data";
import { visitorPlotDetails } from "@/lib/visitor-presentation";

type PreviewFields = {
  id: number; name: string; birthDate: string | null; deathDate: string | null;
  intermentDate: string | null; recordStatus: "active" | "pending" | "archived";
  plot: string; garden?: string | null; block?: number | null; reference: string | null;
};

function projectPreview(fields: PreviewFields) {
  const record = toPublicRecord({
    burial_id: fields.id, display_name: fields.name,
    birth_date: fields.birthDate, death_date: fields.deathDate,
    interment_date: fields.intermentDate, record_status: fields.recordStatus,
    lot_code: fields.plot, area_name: fields.garden, block_number: fields.block,
    synthetic_plot_reference: fields.reference,
    location_geom: null, px_loc_x: null, px_loc_y: null,
    location_verified: false, coordinate_status: "pending",
  });
  const details = visitorPlotDetails(record);
  // Only the safe projection crosses into presentation; internal codes are also withheld.
  return { ...record, plot: details.lot, plotLabel: `Lot ${details.lot}`,
    section: details.garden, row: `Block ${details.block}`,
    syntheticPlotReference: null, gravesiteReference: details.reference };
}

export async function searchStaffVisitorPreviews(query: string, page: number) {
  await requireStaff();
  const client = await getServerSupabase();
  if (!client) throw new Error("Staff data is unavailable.");
  const { data, error } = await client.rpc("staff_burial_records", {
    p_query: query.slice(0, 160), p_page: page, p_page_size: 20,
    p_sort: "name", p_direction: "asc",
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data) ||
    !Array.isArray(data.items) || typeof data.total !== "number" ||
    !Number.isSafeInteger(data.total) || data.total < 0 || data.items.length > 20) {
    throw new Error("Visitor preview search could not be loaded. Please try again.");
  }
  const rows = data.items;
  if (rows.some((row) => !row || typeof row !== "object" || Array.isArray(row) ||
    !Number.isSafeInteger(row.burialId) || Number(row.burialId) < 1 ||
    !Number.isSafeInteger(row.lotId) || Number(row.lotId) < 1 ||
    typeof row.name !== "string" || typeof row.plot !== "string" ||
    !["active", "pending", "archived"].includes(String(row.recordStatus)))) {
    throw new Error("Visitor preview search returned an unexpected response.");
  }
  const lotIds = rows.map((row) => Number((row as Record<string, unknown>).lotId));
  const { data: references, error: referenceError } = lotIds.length
    ? await client.rpc("staff_sample_plot_references", { p_lot_ids: [...new Set(lotIds)] })
    : { data: [], error: null };
  if (referenceError) throw new Error("Gravesite references could not be loaded.");
  const refs = Array.isArray(references) ? references : [];
  const items = rows.map((raw) => {
    const row = raw as Record<string, unknown>;
    const ref = refs.find((item) => item && typeof item === "object" &&
      !Array.isArray(item) && item.lotId === String(row.lotId));
    return projectPreview({
      id: Number(row.burialId), name: String(row.name),
      birthDate: typeof row.birthDate === "string" ? row.birthDate : null,
      deathDate: typeof row.deathDate === "string" ? row.deathDate : null,
      intermentDate: typeof row.intermentDate === "string" ? row.intermentDate : null,
      recordStatus: row.recordStatus as PreviewFields["recordStatus"],
      plot: String(row.plot), garden: typeof row.section === "string" ? row.section : null,
      reference: ref && typeof ref === "object" && "reference" in ref &&
        typeof ref.reference === "string" ? ref.reference : null,
    });
  });
  return { items, total: data.total, page, pageSize: 20 };
}

export async function getStaffVisitorPreview(id: string) {
  // Authenticate before reading even the public-safe projection of a hidden record.
  await requireStaff();
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) return null;
  const client = await getServerSupabase();
  if (!client) throw new Error("Staff data is unavailable.");
  const { data, error } = await client.from("burial_record").select(
    "burial_id,lot_id,interment_date,record_status,deceased(display_name,birth_date,death_date,public_display),lot(lot_code,deleted_at,area(area_name),block(block_number))",
  ).eq("burial_id", Number(id)).is("deleted_at", null).maybeSingle();
  if (error) throw new Error("The visitor preview could not be loaded.");
  if (!data || !data.deceased || !data.lot) return null;
  const { data: refs, error: refError } = await client.rpc("staff_sample_plot_references", {
    p_lot_ids: [data.lot_id],
  });
  if (refError && refError.code !== "PGRST202") {
    throw new Error("The plot reference could not be loaded.");
  }
  const references = Array.isArray(refs) ? refs : [];
  const reference = references.find((item) => item && typeof item === "object"
    && "lotId" in item && item.lotId === String(data.lot_id));
  const synthetic = reference && typeof reference === "object" && "reference" in reference
    && typeof reference.reference === "string" ? reference.reference : null;
  const { data: publicRow, error: publicError } = await client.from("public_burial_records")
    .select("burial_id").eq("burial_id", Number(id)).maybeSingle();
  if (publicError) throw new Error("Current visitor visibility could not be checked.");
  // Explicit allowlist: never pass the private database row into rendered props.
  const record = projectPreview({
    id: data.burial_id, name: data.deceased.display_name,
    birthDate: data.deceased.birth_date, deathDate: data.deceased.death_date,
    intermentDate: data.interment_date,
    recordStatus: data.record_status as PreviewFields["recordStatus"],
    plot: data.lot.lot_code, garden: data.lot.area?.area_name,
    block: data.lot.block?.block_number, reference: synthetic,
  });
  return { record, visible: Boolean(publicRow) };
}
