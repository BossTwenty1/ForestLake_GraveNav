import { isSyntheticPlot } from "./synthetic-plots";
import type { PublicBurialRecord } from "./supabase/types";

const missing = "Not recorded";

function readable(value: string | null | undefined) {
  const text = value?.trim();
  if (!text || /P2S-|[0-9a-f]{64}|source[_ -]?row[_ -]?key/i.test(text)) return null;
  if (/^(?:(?:Section|Garden|Location details|Dates) )?not recorded$/i.test(text)) return null;
  return text;
}

export function visitorPlotDetails(record: PublicBurialRecord) {
  const reference = readable(record.gravesiteReference || record.syntheticPlotReference);
  // These are recorded display references, not a match to physical geometry.
  const parts = reference?.match(/^(.+?)\s*(?:·|\/)\s*Block\s+(\d+)\s*(?:·|\/)\s*Lot\s+([\w-]+)$/i);
  const garden = parts?.[1].trim() || readable(record.section) || missing;
  const block = parts?.[2] || (record.row?.startsWith("Block ")
    ? readable(record.row.slice(6)) : null) || missing;
  const lot = parts?.[3] || (!isSyntheticPlot(record.plot) ? readable(record.plot) : null) || missing;
  const fallback = lot === missing ? missing : `${garden} · Lot ${lot}`;
  return { garden, block, lot, reference: reference || fallback };
}

export const visitorPreviewPath = "/admin/burial-records/preview";

export function previewSearchHref(query = "", page = 1) {
  const params = new URLSearchParams();
  if (query) params.set("query", query.slice(0, 160));
  if (page > 1) params.set("page", String(page));
  return visitorPreviewPath + (params.size ? "?" + params : "");
}

export function safePreviewReturnTo(value: string | string[] | undefined) {
  if (typeof value !== "string") return visitorPreviewPath;
  let url;
  try { url = new URL(value, "http://preview.invalid"); }
  catch { return visitorPreviewPath; }
  if (url.origin !== "http://preview.invalid" || url.pathname !== visitorPreviewPath) {
    return visitorPreviewPath;
  }
  const page = Number(url.searchParams.get("page"));
  return previewSearchHref(url.searchParams.get("query") || "",
    Number.isSafeInteger(page) && page > 0 && page <= 10000 ? page : 1);
}
