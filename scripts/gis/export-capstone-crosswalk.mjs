#!/usr/bin/env node
/**
 * Converts exported GraveNav database rows (`lot_id`, `area_id`, `site_id`,
 * `cad_candidate_id`) into the crosswalk JSON format required by
 * `scripts/gis/build-phase2-package.mjs --crosswalk`.
 *
 * Run `--print-sql` to display the read-only SQL query to export rows from
 * local or hosted Supabase without modifying any database state.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { parseCsv } from "./build-phase2-package.mjs";

export const CROSSWALK_EXPORT_SQL = `select
  l.lot_id,
  l.area_id,
  a.site_id,
  cpl.cad_candidate_id,
  l.lot_code,
  cpl.review_reference
from gis_private.capstone_planning_lot cpl
join public.lot l on l.lot_id = cpl.lot_id
join public.area a on a.area_id = l.area_id
order by l.area_id, l.lot_id;`;

export function buildCrosswalkFromRows(rows, {
  siteId,
  releaseCode = "PHASE2-FULL-V2",
  title = "Forest Lake Phase 2 Full-Coverage GIS Release",
} = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Input contains no crosswalk rows.");
  }

  const seenLotIds = new Set();
  const seenCandidates = new Set();
  const detectedSiteIds = new Set();
  const lots = [];

  for (const row of rows) {
    const lotId = String(row.lotId ?? row.lot_id ?? "").trim();
    const areaId = String(row.areaId ?? row.area_id ?? "").trim();
    const cadCandidateId = String(row.cadCandidateId ?? row.cad_candidate_id ?? "").trim();
    const rowSiteId = String(row.siteId ?? row.site_id ?? "").trim();

    if (!lotId || !areaId || !cadCandidateId) {
      throw new Error(`Row missing required lot_id, area_id, or cad_candidate_id: ${JSON.stringify(row)}`);
    }
    if (!/^(lawn|estates):[1-9][0-9]*$/.test(cadCandidateId)) {
      throw new Error(`Invalid cad_candidate_id "${cadCandidateId}" for lot ${lotId}`);
    }
    if (seenLotIds.has(lotId)) {
      throw new Error(`Duplicate lot_id "${lotId}" in crosswalk input`);
    }
    if (seenCandidates.has(cadCandidateId)) {
      throw new Error(`Duplicate cad_candidate_id "${cadCandidateId}" in crosswalk input`);
    }

    seenLotIds.add(lotId);
    seenCandidates.add(cadCandidateId);
    if (rowSiteId) detectedSiteIds.add(rowSiteId);

    lots.push({ lotId, areaId, cadCandidateId });
  }

  const resolvedSiteId = siteId != null && String(siteId).trim() !== ""
    ? String(siteId).trim()
    : detectedSiteIds.size === 1
      ? [...detectedSiteIds][0]
      : null;

  if (!resolvedSiteId) {
    throw new Error(
      detectedSiteIds.size > 1
        ? `Multiple site_id values found (${[...detectedSiteIds].join(", ")}); specify --site-id explicitly.`
        : "Missing site_id in rows; specify --site-id explicitly.",
    );
  }

  return {
    siteId: resolvedSiteId,
    releaseCode: String(releaseCode).trim(),
    title: String(title).trim(),
    lots,
  };
}

export async function exportCapstoneCrosswalk({
  inputPath,
  outputPath,
  siteId,
  releaseCode = "PHASE2-FULL-V2",
  title = "Forest Lake Phase 2 Full-Coverage GIS Release",
} = {}) {
  const rawText = (await readFile(resolve(inputPath), "utf8")).replace(/^\uFEFF/, "").trim();
  let rows;
  if (rawText.startsWith("[") || rawText.startsWith("{")) {
    const parsed = JSON.parse(rawText);
    rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed.rows) ? parsed.rows : parsed.lots;
  } else {
    rows = parseCsv(rawText);
  }

  const crosswalk = buildCrosswalkFromRows(rows, { siteId, releaseCode, title });
  const target = resolve(outputPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(crosswalk, null, 2)}\n`, "utf8");
  return {
    outputPath: target,
    siteId: crosswalk.siteId,
    releaseCode: crosswalk.releaseCode,
    lotCount: crosswalk.lots.length,
    areaIds: [...new Set(crosswalk.lots.map((l) => l.areaId))],
  };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--print-sql") {
      out.printSql = true;
    } else if (arg.startsWith("--") && argv[i + 1] !== undefined) {
      out[arg.slice(2)] = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = parseArgs(process.argv.slice(2));
  if (args.printSql) {
    console.log(CROSSWALK_EXPORT_SQL);
    process.exit(0);
  }
  if (!args.input || !args.out) {
    console.error(
      "Usage:\n"
      + "  node scripts/gis/export-capstone-crosswalk.mjs --print-sql\n"
      + "  node scripts/gis/export-capstone-crosswalk.mjs --input <rows.json|rows.csv> --out <crosswalk.json> [--site-id 1] [--release-code PHASE2-FULL-V2]",
    );
    process.exit(1);
  }
  exportCapstoneCrosswalk({
    inputPath: args.input,
    outputPath: args.out,
    siteId: args["site-id"],
    releaseCode: args["release-code"] || "PHASE2-FULL-V2",
    title: args.title || "Forest Lake Phase 2 Full-Coverage GIS Release",
  })
    .then((summary) => console.log(JSON.stringify(summary, null, 2)))
    .catch((err) => {
      console.error(err.message || err);
      process.exitCode = 1;
    });
}
