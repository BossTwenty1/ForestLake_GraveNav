# Complete Phase 2 import: final approved policy and execution holds

17 November 2026. Target: existing Supabase project `ddoowghocqyfoxaikifb`.
Preparation only: no hosted import, schema change, publication or deployment.
All existing Milestones 1-3 and unrelated uncommitted work are preserved.

## Approved policy

The user's FINALIZE COMPLETE PHASE 2 DATASET IMPORT POLICY instruction approves
all six synthetic-data decisions. Policy reference: `GRAVENAV-P2S-20261117`.
These decisions are no longer pending policy questions. Hosted execution still
requires final explicit approval and the two operational prerequisites below.

The authoritative workbook remains unchanged:
`C:/Users/Nash/Downloads/GraveNav_Phase2_Demo.xlsx`.
SHA-256: `d513d28922dfce121422916fbb94138e652dcf0080e146d51ad8c540b5bdcc0f`.
Read-only reconciliation again matched every row in the existing extraction.
All 4,470 references are retained in the preview: 90 new synthetic records and
4,380 source-only references. No replacement dataset was generated.

## Owner association check

All 45 workbook owner IDs are unique and linked to exactly 45 of the 90
referenced Source Row Keys. There are no owner entries outside these groups.
Their plot references and source keys match the workbook exactly.

- 35 single-record plots have an owner.
- All ten shared plots have an owner, covering 20 deceased/interments.
- The remaining 45 single-record plots have no owner in Demo_Owners.

The workbook has no additional owner-association column or alternate intended
owner links. Its owner notes say "Demo association only". Leave those 45 new
lot_owner_id values null; do not infer owners from deceased names or adjacent
rows. All 45 supplied owners are included, with the approved labelled fictional
address placeholders. No real contact information is introduced.

## Exact data write plan

| Existing protected operation | Calls | Resulting application rows |
| --- | ---: | --- |
| staff_save_record: lot_owner create | 45 | 45 fictional owners |
| staff_save_record: lot create | 90 | 90 new P2S synthetic lots |
| staff_save_record: burial_record create | 100 | 100 deceased + 100 interments |
| Total | 235 | 335 new application rows |

Protected writers also create their normal mutation receipts, audit/history and
capacity-approval metadata. Those expected system side effects are retained;
they are not direct SQL inserts or permission bypasses.

Each lot code is `P2S-<full 64-character Source Row Key>`; none uses an existing
lot ID. The 46 Butterfly Palm Garden rows use existing area 5 and the 44 Majestic
Palm Garden rows use existing area 6, as administrative containers only.
block_id, length/width, geometry, coordinates and accuracy are not fabricated.
New coordinates remain absent, pending and unverified. No CAD, plot_geometry,
grave-access, mapping-release or navigation association is created.

The new lots use AVAILABLE solely as approved sample admission eligibility.
Eighty single-record groups stay unclassified, with one reservation each. Ten
two-person groups use the existing regular/six-slot configuration with an explicit
SAMPLE ONLY policy reference. This is neither physical grave classification nor
evidence of six actual spaces. No capacity is inferred from source commercial class.

Every deceased/interment pair preserves its fictional IDs, original dates,
Source Row Key and shared relationship. It uses the approved synthetic
PERMANENT / ASH defaults; provenance explicitly identifies those defaults as
policy values rather than source facts. record_status=pending,
public_display=false and interment_confirmed=false for all 100 records.

No existing lot, area, coordinate, verification state or unrelated record is
updated. Existing 4,494 HOLD lots remain unchanged. Expected resulting totals:
45 owners, 100 deceased, 100 interments, 4,584 lot rows of which 90 are synthetic.
The last figure is a database row count, not verified physical cemetery inventory.

## Fresh hosted read-only checks

READ ONLY transaction and rollback confirmed 4,494 HOLD lots, zero owners,
deceased and interments, no P2S namespace collision and no temporary pilot RPC.
The existing lot and area baselines still match the prior preparation:

- Lots: `88d29e467313b2e23301040a45325cd09de9e8db826cd65aefd97a195d0a9973`.
- Areas: `0a1558f5982122367817a79f9172f3babc14ce6e31789482628d511dd12d9f45`.

PUGI is ACTIVE ADMIN and has a corresponding existing auth.users identity.
This does not prove a currently authenticated browser/user session. No RC server
was listening on the previously used local ports 3000, 3217 or 3229 during this
check; no genuine PUGI session was observed or fabricated. Immediately before
execution, the user must use normal Supabase Auth sign-in, then the existing
get_my_account must resolve PUGI's active ADMIN identity in this exact project.
No service-role writes, forged JWT claims, subject overrides or credential
storage in review artifacts are allowed. Account existence is verified; genuine
session readiness remains an execution prerequisite.

## Essential display correction proposed before importing

The current UI does not yet satisfy the requirement that synthetic plots cannot
be mistaken for physical inventory. The latest staff_dashboard_data includes
every live lot; reservations count as occupancy regardless of pending status.
The full local dry run proves it would add 90 to both total and occupied plots.
Partial execution also exposes AVAILABLE synthetic lots before their interments.
Plot Management summaries include these rows, and the edit form describes
AVAILABLE as "Available - confirmed" and regular as a physical grave type.
A P2S prefix and provenance alone do not correct those misleading summaries.

Smallest proposed change, not implemented or applied in this preparation:

1. Recognize the reserved `^P2S-[0-9a-f]{64}$` namespace consistently in existing
   readers/presentation. No new table, CMS, importer framework or lot assignment.
2. Adjust existing staff dashboard and Plot Management read-model aggregates to
   exclude P2S rows from physical availability, occupancy and coordinate-review
   totals/queues; report a clearly separate synthetic-sample count. Keep P2S
   records searchable and paginated with explicit labels. Physical availability
   filters must not return sample admission eligibility as physical availability.
   Include the existing staff_dashboard_counts fallback in the same exclusion.
3. Apply a compact shared sample label to existing plot lists/pickers, plot edit,
   owner-related plots and burial detail/form contexts. Display "Synthetic project
   plot - no verified location", "Sample admission eligible" and "Synthetic
   reservation slots" instead of physical vacancy, occupancy or grave-type claims.
   Clearly distinguish source reference from internal P2S code. Before any linked
   interment exists, the P2S code itself must still establish the sample label.
4. Keep all writer permissions, revisions, admission checks, confirmation and GPS
   gates unchanged. No publication or geographic guard is relaxed.

Accurate aggregate totals require a narrowly reviewed forward SQL definition
update of the existing staff read RPCs, plus their existing types/UI consumers;
an isolated frontend badge cannot fix backend totals. No table/schema redesign
or data updates are needed. Review and approve that small correction before its
hosted application. Existing 4,494 inventory rows must remain byte-for-byte stable.

## Shared pending records and publication blocker

All 20 records in the ten shared groups pass the existing protected creation
rules while pending, hidden and interment_confirmed=false. They can therefore be
retained privately without certifying actual burials.

The current backend rejects activating a classified shared-grave record without
actual-interment confirmation. Tests reproduce that rejection. Never set that
flag true for fictional people merely to make publication possible. All 100
initial pending/hidden records remain ineligible publicly; the 20 shared records
also retain this additional activation blocker. Public activation needs separate
review and approval and is not part of the import. This is not a blocker to
private storage under the approved policy.

## Deterministic requests and recovery

The pinned preview contains every payload template and all 235 unique request
UUIDs. They derive deterministically from the unchanged workbook hash, fixed
full-pending-v1 namespace, entity kind and source/sample ID. Rebuilding the same
plan is tested for exact equality; no random request IDs are used for execution.
New database-generated owner/lot IDs are the only receipt-bound substitutions.
The final concrete payload must be journalled and reused unchanged on retries.
Earlier local preapproval previews were never submitted to hosted writers.

After the display correction, final approval and genuine PUGI session check:

1. Recheck exact project, required migrations, source hash, namespace, baseline
   preservation hashes and zero prior batch records. Any drift stops execution.
   Keep the reviewed payload plan pinned; do not silently replace it with another.
2. Use a short-lived dataset-specific runner calling existing staff_save_record
   through genuine PUGI Auth. For each original source group: create its optional
   owner, create its new lot with owner receipt ID or null, then create each
   deceased/interment pair with the new lot receipt ID and matching provenance.
3. Persist a restricted receipt/progress journal after each successful call,
   without tokens. Stop on the first unexpected response or revision conflict.
   Unknown outcomes replay the identical request ID/payload under the same actor;
   the existing protected receipt prevents duplicate creation. Do not allocate
   a new UUID or rerun first-import namespace assertions against a partial batch.
4. Resume only the same pinned plan, reconciling committed receipt IDs first.
   An owner alone, a lot without interments, or one of two shared records is a
   valid interruption boundary; all remain staff-only and explicitly synthetic.
5. Each HTTP RPC is atomic individually. There is no global cross-request
   rollback. Prefer forward recovery. Abandoning a partial import requires a
   separately approved exact-ID recovery/soft-removal plan preserving history;
   do not silently erase audits, receipts or occupied reservation slots.
6. Reconcile 235 successful request receipts, 45 owners, 90 synthetic lots,
   100 deceased/interments, 45 null-owner lots, ten two-record groups and all
   source markers/default provenance. Rehash only the original inventory/areas
   against their captured baseline; no synthetic coordinate may be verified.
7. Verify staff owner relationships, directories and private previews. Anonymous
   search, profiles, plot rosters and GIS must expose none of the initial hidden
   batch. Verify physical totals exclude the 90 samples, with samples separately
   labelled. Publication is a separate later operation, not an import step.

## Review artifacts and validation

Outside the repository/web root:
`C:/Users/Nash/.codex/visualizations/2026/09/23/01a0cedf-199e-7451-939a-f6477c900657/full-dataset-preparation-20261117/`.
Review full-dataset-import-preview.private.json, plot-assignment-review.csv,
owner-defaults-review.csv and the read-only hosted-preconditions.json.

Canonical preview SHA-256 (compact JSON as printed by the planner):
`bf006431c72c844df43336c101caba2df88622df90cb6cf0e9cf3e24df116b93`.

Local validation uses the existing complete dataset and disposable database,
never a hosted Auth impersonation. It exercises every protected save, local
transaction rollback, interruption between individually committed saves,
same-request replay, payload conflicts, private/public readers, unauthorized
writes and shared-record activation rejection. The inventory test reproduces
the display blocker; it does not claim that correction is implemented.

Final results: 24 focused tests passed, zero failures/skips; targeted ESLint,
read-only full-workbook reconciliation and git diff --check passed. File hashes
confirm all 315 unrelated baseline files remained unchanged. The new policy
report and four existing preparation files are the only task changes.
Production build, TypeScript and live browser journeys were not repeated for
this file-only preparation; genuine hosted browser acceptance remains unverified.

No live executor, display patch or forward SQL change is enabled here. Only the
file-only planner, read-only verifier, focused test and preparation reports are
updated. Final execution approval must explicitly cover the full 235-call import;
approval of synthetic policy alone does not authorize hosted writes.
