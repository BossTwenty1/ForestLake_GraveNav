// Dataset-specific, file-only preparation. No network client, credentials or hosted execution.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { SAMPLE_SOURCE } from "./prepare-project-samples.mjs";

export const PROJECT = "ddoowghocqyfoxaikifb";
export const WORKBOOK_HASH = "d513d28922dfce121422916fbb94138e652dcf0080e146d51ad8c540b5bdcc0f";
const POLICY_REFERENCE = "GRAVENAV-P2S-20261117";
const digest = (value) => createHash("sha256").update(value).digest("hex");
function requestId(kind, key) {
  const h = digest(WORKBOOK_HASH + ":full-pending-v1:" + kind + ":" + key);
  return h.slice(0, 8) + "-" + h.slice(8, 12) + "-5" + h.slice(13, 16) +
    "-8" + h.slice(17, 20) + "-" + h.slice(20, 32);
}
function unique(rows, key) {
  const map = new Map(rows.map((row) => [row[key], row]));
  assert.equal(map.size, rows.length, "Duplicate " + key);
  return map;
}

export function prepareFullSamples(dataset, snapshot) {
  assert.equal(dataset.workbook_sha256, WORKBOOK_HASH, "Unexpected workbook");
  assert.equal(dataset.format, "gravenav-phase2-project-samples-v1");
  assert.deepEqual([dataset.plots.length, dataset.owners.length,
    dataset.people.length, dataset.interments.length], [4470, 45, 100, 100]);
  assert.equal(snapshot.project_ref, PROJECT);
  assert.equal(snapshot.transaction_read_only, "on");
  assert.equal(snapshot.synthetic_namespace_conflicts, 0, "Existing P2S namespace requires reconciliation");
  assert.equal(snapshot.existing_sample_interments, 0, "Existing sample records require receipt review");
  assert.equal(snapshot.existing_sample_owners, 0, "Existing sample owners require receipt review");
  assert.ok(snapshot.migrations.includes("20261107010000"));
  assert.ok(snapshot.migrations.includes("20261116010000"));
  assert.ok(snapshot.migrations.includes("20261117010000"));
  const plots = unique(dataset.plots, "source_key");
  const people = unique(dataset.people, "sample_id");
  unique(dataset.interments, "sample_id");
  unique(dataset.owners, "sample_id");
  unique(dataset.owners, "source_key");
  const ownersByPlot = new Map(dataset.owners.map((owner) => [owner.source_key, owner]));
  const groups = new Map();
  for (const plot of plots.values()) {
    assert.match(plot.source_key, /^[0-9a-f]{64}$/);
    assert.equal(plot.hosted_lot_id, null);
    assert.equal(plot.availability, "UNKNOWN");
  }
  for (const owner of dataset.owners) {
    assert.ok(plots.has(owner.source_key));
    assert.ok(owner.classification.startsWith("SYNTHETIC"));
    assert.equal(owner.name.trim().split(/\s+/).length, 2, "Review owner name splitting");
  }
  for (const interment of dataset.interments) {
    const person = people.get(interment.person_id);
    assert.ok(person && plots.has(interment.source_key), "Broken workbook link");
    assert.ok(person.classification.startsWith("SYNTHETIC"));
    assert.equal(interment.classification, "SYNTHETIC");
    assert.ok(person.birth_date <= person.death_date && person.death_date <= interment.interment_date);
    const entries = groups.get(interment.source_key) || [];
    entries.push(interment);
    groups.set(interment.source_key, entries);
  }
  assert.equal(groups.size, 90);
  assert.equal(new Set(dataset.interments.map((i) => i.person_id)).size, 100);
  const assignments = [...groups].map(([key, interments]) => {
    const plot = plots.get(key);
    assert.equal(plot.review_flags.length, 0, "Referenced plot has source review flags");
    assert.ok(plot.display_reference.length <= 200);
    const area = snapshot.areas.filter((a) => a.name === plot.garden);
    assert.equal(area.length, 1, "Garden container requires review");
    const owner = ownersByPlot.get(key);
    const ownerNames = owner?.name.split(/\s+/);
    const shared = interments.length > 1;
    assert.ok(interments.length <= 6, "Shared group exceeds approved synthetic policy");
    return {
      source_row_key: key,
      source_reference: plot.display_reference,
      source_garden: plot.garden,
      source_lawn: plot.lawn,
      source_block: plot.block,
      source_lot: plot.lot,
      source_commercial_class: plot.commercial_class,
      source_cad_candidate: plot.cad_candidate_id,
      binding_kind: "NEW_NON_GEOGRAPHIC_SAMPLE_RECORD",
      existing_lot_id: null,
      historical_cad_identity_verified: false,
      forest_lake_physical_assignment_verified: false,
      review_state: "POLICY_APPROVED_AWAITING_EXECUTION_APPROVAL",
      owner: owner ? {
        sample_id: owner.sample_id,
        request_id: requestId("owner", owner.sample_id),
        values: {
          first_name: ownerNames[0], last_name: ownerNames[1],
          address: "Fictional project address — " + owner.sample_id + " (not a real residence)",
          aliases: SAMPLE_SOURCE + ":" + owner.sample_id + ":" + key,
        },
      } : null,
      lot: {
        request_id: requestId("lot", key),
        values: {
          lot_code: "P2S-" + key, area_id: area[0].area_id, block_id: null,
          lot_owner_id: null,
          status: "AVAILABLE",
          location_geom: null, coordinate_accuracy_m: null,
          ...(shared ? {
            grave_type: "regular",
            grave_policy_reference: POLICY_REFERENCE + ": SAMPLE ONLY; six reservation slots; not physical capacity: " + key,
          } : {}),
        },
        owner_id_from_receipt: owner?.sample_id ?? null,
        synthetic_capacity_configuration: shared ? 6 : 1,
        physical_capacity_claimed: false,
      },
      interments: interments.map((interment) => {
        const person = people.get(interment.person_id);
        return {
          sample_id: interment.sample_id,
          person_id: person.sample_id,
          request_id: requestId("burial", interment.sample_id),
          values: {
            display_name: person.name, birth_date: person.birth_date, death_date: person.death_date,
            interment_date: interment.interment_date,
            record_status: "pending", public_display: false, interment_confirmed: false,
            interment_status: "PERMANENT", remains_type: "ASH",
            reference_no: interment.sample_id, interment_order_number: interment.sample_id,
            record_source: SAMPLE_SOURCE,
            // The new lot receipt ID is substituted before the existing writer is called.
            lot_id: null,
            quality_notes: JSON.stringify({
              data_classification: "PROJECT_SAMPLE_FICTIONAL",
              person_id: person.sample_id, interment_id: interment.sample_id,
              source_row_key: key, display_reference: plot.display_reference,
              source_workbook_sha256: WORKBOOK_HASH,
              cad_candidate_id: plot.cad_candidate_id,
              binding_kind: "NEW_NON_GEOGRAPHIC_PROJECT_SAMPLE",
              historical_cad_identity_verified: false,
              forest_lake_physical_assignment_verified: false,
              synthetic_defaults_policy: POLICY_REFERENCE,
              synthetic_defaults: { interment_status: "PERMANENT", remains_type: "ASH" },
            }),
          },
        };
      }),
    };
  });
  assert.equal(assignments.filter((group) => group.owner).length, 45);
  const shared = assignments.filter((group) => group.interments.length > 1);
  assert.equal(shared.length, 10);
  assert.equal(assignments.filter((group) => !group.owner).length, 45);
  assert.ok(assignments.filter((group) => !group.owner).every((group) =>
    group.interments.length === 1));
  const requestIds = assignments.flatMap((group) => [
    ...(group.owner ? [group.owner.request_id] : []), group.lot.request_id,
    ...group.interments.map((entry) => entry.request_id),
  ]);
  assert.equal(requestIds.length, 235);
  assert.equal(new Set(requestIds).size, 235, "Duplicate protected request ID");
  return {
    format: "gravenav-full-project-sample-preview-v1",
    project_ref: PROJECT, workbook_sha256: WORKBOOK_HASH,
    dataset_extraction_sha256: digest(JSON.stringify(dataset)),
    target_evidence_sha256: digest(JSON.stringify(snapshot)),
    execution_authorized: false,
    ready_for_hosted_execution: false,
    counts: {
      source_plot_references: 4470, source_only_unreferenced_plots: 4380,
      owners_to_create: 45, lots_to_create: 90, deceased_to_create: 100,
      interments_to_create: 100, protected_save_calls: 235,
      existing_lots_to_update: 0, shared_groups: 10, shared_interments: 20,
      owned_referenced_plots: 45, unowned_referenced_plots: 45,
      policy_blocked_assignments: 0,
    },
    policy_reference: POLICY_REFERENCE,
    policies_approved: [
      "Create 90 explicitly synthetic, non-geographic lot records; do not bind existing inventory IDs",
      "AVAILABLE means sample admission eligibility only, not physical vacancy or commercial availability",
      "Use 45 labelled fictional addresses and PERMANENT/ASH sample-only defaults",
      "Use regular/six-slot configuration for ten synthetic groups, not physical classification",
      "Keep all 100 interments pending, hidden and not confirmed as actual burials",
      "Preserve all source identifiers, Source Row Keys and privacy/geographic guards",
    ],
    execution_holds: [
      "Separate P2S sample records from physical inventory totals and clearly label staff displays",
      "Verify a genuine authenticated PUGI ADMIN session immediately before execution",
      "Obtain final explicit approval of the pinned complete write plan",
    ],
    limitations: [
      "No source reference is evidence of historical database identity or physical/GPS placement",
      "Shared classified records cannot become active without actual-interment confirmation under current rules",
      "Do not set actual-interment confirmation true for fictional persons to bypass that rule",
      "Full public activation of shared fictional groups needs a separately reviewed policy solution",
      "No global HTTP transaction exists; existing protected saves are individually atomic",
    ],
    source_reference_disposition: dataset.plots.map((plot) => ({
      source_row_key: plot.source_key,
      display_reference: plot.display_reference,
      action: groups.has(plot.source_key) ? "CREATE_NEW_SAMPLE_LOT_AFTER_EXECUTION_APPROVAL" : "RETAIN_SOURCE_ONLY",
      review_flags: plot.review_flags,
      physical_database_binding: null,
    })),
    assignments,
  };
}

export function bindIntermentValues(entry, lotId) {
  assert.match(String(lotId), /^[1-9]\d*$/);
  const notes = JSON.parse(entry.values.quality_notes);
  return {
    ...entry.values, lot_id: String(lotId),
    quality_notes: JSON.stringify({ ...notes, existing_lot_id: String(lotId) }),
  };
}

async function main() {
  const [datasetPath, snapshotPath, output] = process.argv.slice(2);
  assert.ok(datasetPath && snapshotPath && output, "Usage: dataset.json snapshot.json output-directory");
  const dataset = JSON.parse(await readFile(datasetPath, "utf8"));
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  const preview = prepareFullSamples(dataset, snapshot);
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, "full-dataset-import-preview.private.json"),
    JSON.stringify(preview, null, 2));
  const csv = (rows) => rows.map((row) => row.map((value) =>
    '"' + String(value ?? "").replaceAll('"', '""') + '"').join(",")).join("\n") + "\n";
  await writeFile(resolve(output, "plot-assignment-review.csv"), csv([
    ["Source Row Key", "Source reference", "Garden", "Approved synthetic lot code", "Area container",
      "Existing lot ID", "Owner sample ID", "Interment count", "Sample reservation slots",
      "Geographic claim", "Review state"],
    ...preview.assignments.map((group) => [
      group.source_row_key, group.source_reference, group.source_garden, group.lot.values.lot_code,
      group.lot.values.area_id, "", group.owner?.sample_id, group.interments.length,
      group.lot.synthetic_capacity_configuration, "NONE", group.review_state,
    ]),
  ]));
  await writeFile(resolve(output, "owner-defaults-review.csv"), csv([
    ["Owner sample ID", "First name", "Last name", "Fictional address", "Source Row Key"],
    ...preview.assignments.filter((group) => group.owner).map((group) => [
      group.owner.sample_id, group.owner.values.first_name, group.owner.values.last_name,
      group.owner.values.address, group.source_row_key,
    ]),
  ]));
  console.log(JSON.stringify({
    counts: preview.counts, execution_holds: preview.execution_holds,
    preview_sha256: digest(JSON.stringify(preview)),
    ready_for_hosted_execution: false, hosted_writes: 0,
  }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
