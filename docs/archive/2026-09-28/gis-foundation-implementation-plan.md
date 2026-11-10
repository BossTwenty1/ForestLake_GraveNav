# Archived reference — superseded instructions

> Archived on 9 November 2026. This document preserves a dated assessment or execution plan. Its old scope, constraints, counts and agent instructions are historical; use the [current operational handoff](../../phase2-local-defense.md) for ongoing work.

Original location: docs/superpowers/plans/2026-09-28-gis-foundation-implementation-plan.md  
Original content SHA-256: d500954a69efebcff787522d01901c4d07c093693dbf6da2c9a910d364abfa84

---

# GraveNav GIS Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (approved method), strictly sequential, with explicit checkpoint reviews. Steps use checkbox
> (`- [ ]`) syntax for tracking. These amendments do not authorize Task 1 in this turn.

**Goal:** Add the secure GIS evidence, versioned geometry, pilot import, readiness and explicit
publication foundation without changing the current maps or operational records.

**Architecture:** Keep existing grave identities and legacy spatial behavior. Build normalized
private field/run evidence, immutable release snapshots, bounded staged ingestion and shared
SQL read contracts. Publish through one protected, atomic area selector; new read contracts
remain unused by current UI modules.

**Tech Stack:** Existing PostgreSQL/PostGIS, Supabase Auth/RLS/CLI, Node ESM scripts and built-in
crypto/fs, Supabase JS, TypeScript, Next.js 16.3.6, node:test, PGlite 0.5.8/PostGIS.

**Spec:** `docs/superpowers/specs/2026-09-28-gis-foundation-design.md`, approved with amendments.

## Global constraints

- Planning only in this turn: no migrations, application code, deployment or hosted changes.
- Additive transition; preserve authentication/RLS, routes, business rules, Dashboard, Burial
  Records, Plot Management, Coordinate Verification, public search, map assets and routing.
- Target 12–15 GCPs, 3–5 independent validation points, five fresh readings per capture;
  retain every reading; no validation identity may become a fitting identity.
- Field/output EPSG:4326; Forest Lake pilot working SRID 32651; calculate independent error
  using planar geometry distance after transforming BOTH preserved inputs into run.working_srid.
- Pilot: one garden, declared 20–50 existing lot IDs; completeness is for that set, not all lots.
- Pilot v1 protected import begin/seal, validation/finalization, release approval, publication and
  rollback/reactivation reject `scope_kind <> 'pilot'`. Exactly one existing area is declared;
  mapping_release_area contains exactly that pilot_area_id and publication uses that one scope.
  Schema may retain pilot/full metadata; full is reserved, not an implemented multi-area pipeline.
- Total package 8 MiB exact file bytes including manifest; no one-request upload requirement.
- Spec counts: 50 plots/access points, 200 nodes, 400 edges, 200 walkways, 100 display features,
  200 survey points, 1,000 captures, 20,000 observations, 20 runs, 4,000 total memberships/results,
  50,000 geometry vertices. Never truncate to fit limits; no arbitrary accuracy threshold.
- Only active ADMIN imports/reviews/publishes/rolls back; MANAGER receives operational readiness
  only. PUBLIC execution revoked on protected functions. Actors come from auth.uid().
- No operational GIS objects before complete validated transactional finalization; no publication
  before separate approval/publish. No fake release membership for legacy rows.
- No pgRouting, map redesign, field-capture UI, full-cemetery importer, new graves from names,
  production test mutations, reset, destructive downs, history repair, seed push or auto-connectors.
- Do not create migration timestamps now. Allocate each real timestamp at its task after inspecting
  current history; preserve all older migrations and existing dirty changes.
- No added dependency planned. Read relevant installed Next docs before the eventual TS edit.
- Explicit allowlists for future commits/deployments; never stage unrelated earlier-phase changes.

## Review focus

The following implied risks get explicit tests in the named tasks, not just reviewer attention:

1. Anonymous/inactive callers, direct status edits and forged session flags cannot bypass lifecycle
   guards; test matrix and client-set GUC spoofing in Tasks 1/14.
2. New route notes can leak through the OLD audit trigger even if NEW tables are private;
   test authenticated MANAGER audit reads and legacy redaction preservation in Task 6.
3. Two imports/finalizations or publications racing for one area cannot cross-bind revisions or
   partially activate snapshots; real two-connection PostgreSQL tests in Tasks 10/14/15.
4. Equivalent transport chunks, escaped duplicate JSON keys and bigint IDs cannot change digest
   identity, evade duplicate detection or lose precision; tests in Tasks 8/9.
5. Lot removal/area reassignment or supersession between pages and between dry-run/publish cannot
   produce stale readiness, mix release pages or publish invalid identity links; Tasks 10/12/14.

## Evidence and execution method boundary

Local checkout/branch and prior dirty files were rechecked for this plan. Current actual schema
names remain `site`, `area`, `lot`, `map_node`, `map_edge`, `account`, `role`, `audit_log` in local
migrations. The approved spec records the earlier live inventory and aligned history through
20260928150000; those hosted facts are NOT freshly verified in this planning turn.

An ephemeral local capability check confirmed PGlite PostgreSQL 18.3 can transform a synthetic
Point(4326) to 32651 and compute native sha256(bytea). No files or production rows were written.
Hosted PostgreSQL version/capabilities must be checked at Checkpoint E; local WASM success is
not proof of hosted behavior, concurrency or query plans.

There are seven logical phases. Phase 7 is a REPEATED deployment/verification procedure between
local phases, not a demand to create all nine pending migrations and then push them together.
Normal db push applies all pending local migrations. Keep future migration files uncreated
until the current batch is deployed/reviewed; stop if its dry-run contains any other migration.

Architecture, task order, migration strategy, security/testing direction, batching and checkpoints
are approved, subject to these required clarifications. Execution method is approved as
SUBAGENT-DRIVEN DEVELOPMENT WITH EXPLICIT CHECKPOINT REVIEWS, STRICTLY SEQUENTIAL.
Use one bounded implementation subagent/task at a time, followed by its required review before
the next task starts. Do not author dependent migrations or implementation tasks in parallel.
No subagent may start a future batch automatically; future migration files remain uncreated until
their preceding gate clears. Every A/B/C/D/E/F STOP still requires review and continuation authority.
This document is self-reviewed, not independently reviewed or implemented. This turn ends after
amendments/consistency checks; Task 1 must wait for the user's next instruction.

## File structure and ownership

All paths below are relative to `C:\Users\Nash\Documents\gravenav`.
`<allocated-version>` denotes the future timestamp chosen at execution, not a real filename yet.

| Action | Exact likely location | Responsibility |
| --- | --- | --- |
| Create | `supabase/migrations/<allocated-version>_gis_release_foundation.sql` (M01) | Release lifecycle/security/receipts |
| Create | `supabase/migrations/<allocated-version>_gis_field_evidence.sql` (M02) | Field evidence and medians |
| Create | `supabase/migrations/<allocated-version>_gis_georeferencing.sql` (M03) | Runs, role separation, metric validation |
| Create | `supabase/migrations/<allocated-version>_gis_versioned_geometry.sql` (M04) | Boundaries, plot geometry, walkway lineage |
| Create | `supabase/migrations/<allocated-version>_gis_graph_access.sql` (M05) | Existing graph extensions, access/display, audit redaction |
| Create | `supabase/migrations/<allocated-version>_gis_import_transport.sql` (M06) | Bounded private import/file/chunk/report staging |
| Create | `supabase/migrations/<allocated-version>_gis_import_validation.sql` (M07) | Dry-run, full validation and materialization |
| Create | `supabase/migrations/<allocated-version>_gis_read_contracts.sql` (M08) | Shared readiness and safe reads |
| Create | `supabase/migrations/<allocated-version>_gis_publication.sql` (M09) | Review, approve, publish, rollback |
| Create | `scripts/gis/package-contract.mjs` | Constants, property allowlists, report schema |
| Create | `scripts/gis/strict-json.mjs` | Bounded duplicate-aware JSON parser |
| Create | `scripts/gis/package-validator.mjs` | Filesystem, manifest, hash and structural checks |
| Create | `scripts/gis/import-client.mjs` | Existing authenticated Supabase RPC transport |
| Create | `scripts/validate-gis-package.mjs` | Offline validator CLI |
| Create | `scripts/import-gis-package.mjs` | Explicit begin/resume/stage/validate/finalize CLI; no auto-publish |
| Create | `scripts/gis/verify-hosted.mjs` | Read-only expected-catalog/history/ACL verification |
| Create | `src/lib/supabase/gis-types.ts` | Narrow DTOs and runtime decoding, not table-wide exports |
| Create | `src/lib/supabase/gis-data.ts` | New bounded read wrappers accepting an existing SupabaseClient |
| Modify | `src/lib/supabase/database.types.ts` | Additive introspected schema/RPC types; preserve existing edits |
| Modify | `src/lib/phase1-map-data.ts` | ONLY two IS NULL release filters after columns exist |
| Modify if needed | `src/lib/supabase/database-schema.ts` | Nullable/new GIS bigint argument overlays where introspection requires them |
| Modify | `tests/database-helper.mjs` | Optional migration cutoff for intermediate replay; default behavior unchanged |
| Create | `tests/gis-fixtures.mjs` | Disposable fictional garden, 20–50 stable lots, field/run/package fixtures |
| Create | `tests/gis-evidence.test.mjs`, `tests/gis-georeferencing.test.mjs` | Phase 1/2 contracts |
| Create | `tests/gis-geometry.test.mjs`, `tests/gis-graph.test.mjs` | Phase 3 integrity/legacy audit |
| Create | `tests/gis-package.test.mjs`, `tests/gis-import.test.mjs` | Phase 4 parser/transport/finalization |
| Create | `tests/gis-readiness.test.mjs`, `tests/gis-publication.test.mjs` | Phase 5/6 permissions/state/history |
| Create | `tests/gis-legacy.test.mjs` | Real query-spy assertion for both release filters and unchanged routing |
| Create | `tests/gis-concurrency.test.mjs` | Real disposable PostgreSQL two-session races; env-gated, explicit skips |
| Create | `tests/gis-hosted-fixtures.sql` | Bounded BEGIN/role simulation/assertions/ROLLBACK fixture harness |
| Create | `docs/gis/pilot-package-v1.md`, `docs/gis/import-and-publication.md`, `docs/gis/deployment-checklist.md` | Package/operator/security/deployment/retention contract |

Do not modify `package.json`, lockfile, current UI components, existing map rebuild/import scripts,
static data, or broad admin/public data modules. Existing scripts stay documented as LEGACY.
Use direct `node` commands for the new tools. Fixtures are synthetic, not copies of hosted records.

## Schema and security conventions used by every migration

### Keys, checks and indexes

New entities use UUID primary keys generated by PostgreSQL; existing IDs are bigint. Return bigint
IDs in JSON as decimal STRINGS; validate positive decimal IDs against `^[1-9][0-9]{0,18}$`
and <=9223372036854775807 before casting. Do not round through JavaScript Number.
New entity revision starts at 1, positive integer.
Mutation inputs require expected revision except initial creation; every successful state/content
mutation increments once. Exact retries return the original response before stale-revision checks.

Common mutation result: `{schemaVersion:1,id:string,revision:number,state:string,requestId:string}`
plus operation-specific bounded counts/digests, never raw evidence. Import results additionally
identify `importId`, `releaseId`, `rootRequestId`, `operationId` when applicable, `packageDigest`,
`baseRevision`, `targetRevision`, `currentReleaseRevision`, and applicable report digest/counts.
Uploaded state/approval flags are never authoritative result inputs.

Text IDs/codes are case-sensitive, nonblank, max 100 characters; source IDs ASCII `[A-Za-z0-9._:-]`,
no whitespace/path separators. Titles/display labels max 200, references max 1,024, private notes
max 2,000. SHA-256 is 64 lowercase hex. No SQL enums: use named CHECK constraints so additive
states do not require enum maintenance. Null never means approved/ready. JSON objects have exact
allowlists/depth/count bounds, not arbitrary provenance blobs. Non-import mutation RPC arguments
are bounded to 1 MiB encoded total; import RPCs use the stricter 128 KiB envelope below.

All foreign keys use RESTRICT except optional actor references SET NULL following current audit
conventions. Index referencing FKs and `(release_id, source_feature_id)`/scope/page-order keys.
Geometry type/SRID/dimension/nonempty/finite-coordinate checks apply before spatial calculations.
Cross-table/live identity checks use guarded functions/triggers and locks, not invalid SQL CHECK
subqueries. Avoid adding redundant unique constraints to legacy `lot`/`area`; validate joins on
new-table mutation and again on publication/readiness. Legacy area reassignment remains possible
through existing business APIs; affected GIS readiness becomes false rather than blocking the edit.

### Access profiles (apply in SAME migration as the object)

| Profile | Security/search_path | Authorization and ACL |
| --- | --- | --- |
| D: protected mutation RPC | SECURITY DEFINER; `pg_catalog, extensions, pg_temp`; schema-qualified references | auth.uid() + is_active_admin(); EXECUTE authenticated only; revoke PUBLIC/anon/service_role/default inherited grants; derive actor |
| A: protected admin read RPC | SECURITY DEFINER STABLE; same pinned path | is_active_admin(); EXECUTE authenticated only; no client actor |
| S: operational staff read RPC | SECURITY DEFINER STABLE; same pinned path | is_active_admin_or_manager(); EXECUTE authenticated only; sanitized DTO |
| P: safe public read RPC | SECURITY DEFINER STABLE; same pinned path | No staff helper required; active-selector/public-visibility predicates inside; EXECUTE anon/authenticated only; revoke PUBLIC/service_role defaults |
| H: private helper/query/trigger | SECURITY INVOKER; same pinned path (immutable/stable where valid) | `gis_private` schema; no PUBLIC/anon/authenticated/service_role EXECUTE or schema USAGE; callable only by trusted owner inside D/A/S/P; no exposed REST helper |

New PUBLIC base tables: enable RLS, revoke all inherited PUBLIC/anon/authenticated/service_role
rights, grant authenticated SELECT with `is_active_admin()` policy only; no ordinary application
INSERT/UPDATE/DELETE, sequence privileges or client-executable generic state setter. Internal
views live in `gis_private`, with no caller grants; explicit read RPCs project permitted fields.
FORCE RLS is not used blindly: definer ownership/bypass is intentional and every entry gate is
tested; do not change existing owner/role relationships or grant a new administrator bypass role.

Existing graph SELECT: active staff for NULL-release rows; active ADMIN for release rows.
Graph INSERT/UPDATE/DELETE: legacy NULL membership only under existing active staff rule;
UPDATE checks BOTH old and new membership. BEFORE triggers reject client membership upgrades/
downgrades, approved snapshot edits and invalid links. No user-settable GUC grants permission.

Non-chunk D operations use private `gis_mutation_request(request_id PK, actor_account_id, operation,
input_hash, response, created_at)` receipts. Hash validated canonical inputs in SQL; lookup exact
retry under locks; same UUID with a different actor/operation/input is a conflict. Receipt responses
contain only IDs/revisions/digests/status/counts, not raw evidence. Every import RPC carries the
SAME root import request UUID; begin uses that UUID for its receipt, chunks use
`(import_id,file_name,chunk_index)` natural retry identity. Seal/validate/finalize/abandon also
carry a separate `p_operation_id uuid` for their operation receipt, whose hash binds root import/
request/digest/revision/action. Retry with that same operation UUID; never reuse the begin UUID
for another action. Stage/resume mutations require the original importing ADMIN identity;
other active ADMINs may inspect evidence and review/publish the resulting release.

`gis_private.audit_event(entity text,id text,action text,old_meta jsonb,new_meta jsonb) -> void`
(H) writes ONLY an explicit metadata allowlist to existing audit_log with the real actor; no raw
readings, device/operator/rejection notes, geometry or private artifact paths. Action values are
existing insert/update/approve/status_change; never modify the audit CHECK. New tables do not
blindly attach write_audit_event(). M05 separately handles already-existing route audit triggers.

## Migration inventory (nine files, five deployment batches)

Every entry below includes schema/security/contracts together; nothing is exposed unsecured between
migrations. No migration changes operational records or publishes a GIS release.

### M01 — Release identity, scope and lifecycle skeleton

Classification: schema + security + lifecycle contract. Dependency: current migrations/account helpers.

Tables: `mapping_release`, `mapping_release_area`, `mapping_publication`,
`mapping_publication_event`, `gis_mutation_request` (private schema for receipts).

Release columns: UUID, site FK, code/title/description, scope_kind, pilot_area_id, status/revision,
package reference/hash, source plan reference/version/hash/coordinate-space text, field/working/
published SRIDs, QGIS version, selected run UUID initially nullable, validation report hash/summary,
notes, created/staged/validated/reviewed/published timestamps and account references.
Required package metadata may be null only while draft; later guards require full metadata.

Checks: status/positive revision, scope_kind pilot/full, pilot area required for pilot, CRS fields
4326/32651/4326 for pilot, hash syntax, bounded metadata. UNIQUE(site_id,release_code),
UNIQUE(release_id,site_id). Release-area PK(release_id,area_id), unique(release_id,site_id,area_id),
FK release/site and area; trigger area-site match and exactly one membership for pilot at sealing.
For pilot creation, require exactly the existing pilot_area_id membership already at creation;
H `assert_pilot_scope(p_release_id uuid)->void` verifies scope_kind=pilot, live area/site match,
and exactly one membership equal to pilot_area_id. M06/M07/M09 call it at every v1 pipeline gate
and private materialization/activation entry. Freeze scope identity/membership once import begins;
do not implement multi-area activation for reserved full metadata. Full draft metadata may be
retained/created or rejected, but cannot enter v1 ingestion, approval, publication or reactivation.
Publication PK(site_id,area_id), FK(release_id,site_id,area_id) to membership; no row until publish.
Event UUID PK, previous/new release FKs, request UUID uniqueness per operation, kind publish/rollback;
append-only trigger. Scope/release-status, actor, history(scope,time,id), receipt hashes indexed.

H helpers: `assert_admin()`, `claim_request(uuid,text,jsonb)->jsonb`,
`finish_request(uuid,jsonb)->void`, `audit_event(...)`, `guard_release()->trigger`,
`guard_release_area()->trigger`, `guard_publication_history()->trigger`.
D: `staff_create_mapping_release(p_values jsonb,p_request_id uuid)->jsonb`,
`staff_reject_mapping_release(p_release_id uuid,p_expected_revision int,p_reason text,p_request_id uuid)->jsonb`.
No staged/validated/publish RPC is prematurely granted. Guard stores the FULL matrix below from day 1,
but later operations are introduced only when their prerequisites exist. No generic client transition RPC.
Views: none. New table/profile security as above; no legacy table/behavior change.

### M02 — Field survey evidence and reproducible medians

Classification: schema + security + evidence read/mutation contract. Depends M01.
Tables `survey_point`, `survey_capture`, `survey_observation`.

Point columns: id/site/code/immutable role GCP|VALIDATION, description/source reference/notes,
active bool, review_state draft|accepted|rejected|retired, revision, actor/time, optional predecessor.
UNIQUE(site_id,point_code), UNIQUE(point_id,site_id); retire instead of delete; successor cannot
turn a validation identity into a fitting identity for a run. Capture columns: id/point/site/session
code, started/ended/device/operator references/notes, remeasures_capture_id, remeasure_required,
review_state draft|accepted|rejected, review reason/revision/actor/time. Composite FK(point,site),
UNIQUE(point_id,capture_code), UNIQUE(capture_id,point_id,site_id); parent same point/site and
older created_at; lock parent; no cycles. Observation id/capture/order/lat/lon/reported_accuracy_m/
captured_at/notes; UNIQUE(capture_id,observation_order); finite coordinates within world bounds,
finite accuracy >=0, positive order. Raw poor readings retained; no accuracy pass threshold.

H triggers: immutable point code/role/site, observation append-only, capture freeze and parent guard.
Metadata referenced by accepted runs cannot be rewritten; corrections use retained successor evidence.
H view `gis_private.survey_capture_summary`: left join captures/readings; count, independent
percentile_cont(.5) lat/lon, avg/min accuracy, Point4326, protocol_flags, remeasure/review fields.
Accumulate accuracy averages as numeric to avoid floating-point sum overflow for finite poor readings;
do not impose an arbitrary maximum reported-accuracy threshold or exclude those readings.
Zero readings => count 0, null coordinates/accuracy/point. <5/>5, repeated/nonincreasing timestamp,
out-of-session and remeasure flags are returned without removing any reading. NULL end time
flags incomplete capture. SQL owns calculations; scripts only display/validate raw input.

D RPCs: `staff_save_survey_point(p_point_id uuid,p_expected_revision int,p_values jsonb,p_request_id uuid)`,
`staff_record_survey_capture(p_point_id uuid,p_capture_code text,p_meta jsonb,p_observations jsonb,p_request_id uuid)`,
`staff_review_survey_capture(p_capture_id uuid,p_expected_revision int,p_decision text,p_acknowledgements jsonb,p_notes text,p_request_id uuid)`
all -> jsonb. Null ID/revision only for creation; record accepts 0..100 readings (bounded request,
all retained, >5 warning); remeasurement creates a new capture, not overwrite. Accept requires a
representative point and acknowledgement of deviations, not exactly five. Accepted captures
freeze raw observations/measurement metadata; rejection/remeasure evidence retained.
FK/index/security profiles apply; no legacy table change or public field-data read surface.

### M03 — Georeferencing, capture membership and validation metric

Classification: schema + security + metric read contract. Depends M01/M02.
Tables `georeferencing_run`, `georeferencing_run_point`, `georeferencing_validation`.

Run columns: UUID/release/site/code, source reference/SHA/dimensions/source coordinate space,
working_srid/output_srid, method/processing_params, processing time/QGIS/operator/reviewer,
output artifact ref/hash, review_state draft|accepted|rejected/revision/notes. UNIQUE(release_id,run_code),
UNIQUE(run_id,release_id,site_id); release/site composite FK, selected_run FK added to release
with a same-release/site guard. Validate pilot working_srid=32651/output=4326 against installed
spatial_ref_sys and a metric allowlist; calculation still uses the RUN FIELD, never literal 32651.

Membership columns: UUID/run/release/site/point/capture/role/source_x/y/optional fitting_residual_m;
UNIQUE(run_id,point_id), composite run/site/release and capture/point/site FKs. Trigger enforces
GCP->FITTING, VALIDATION->VALIDATION, accepted frozen capture, finite pixels/in-range dimensions,
exactly one role, immutable accepted run/member data. Validation row PK/FK run_point_id, transformed
plan Point4326, review state/revision/notes; trigger requires VALIDATION membership only.

H views `gis_private.georeferencing_validation_result` (observed frozen-summary Point4326,
stored transformed-plan Point4326, `ST_Distance(ST_Transform(observed,run.working_srid),
ST_Transform(plan,run.working_srid)) AS validation_error_m`), and
`gis_private.georeferencing_validation_summary` (expected/measured/missing counts; avg/median/max
only canonical errors; fitting/validation counts and protocol flags). No observations/results =>
null errors. Optional separately named geography_crosscheck_m never feeds canonical aggregates.

D RPCs `staff_save_georeferencing_run(p_run_id uuid,p_expected_revision int,p_values jsonb,p_memberships jsonb,p_results jsonb,p_request_id uuid)->jsonb`,
`staff_review_georeferencing_run(p_run_id uuid,p_expected_revision int,p_decision text,p_acknowledgements jsonb,p_notes text,p_request_id uuid)->jsonb`.
Save limited to unaccepted run; accepted changes require another run/release as applicable.
Accept requires every independent membership to have a reviewed result, nonzero independent
results, and acknowledged target-count deviations. Index all FKs, run/role, result lookups;
no additional spatial index needed on <=4,000 per-package validation points. Profile D/H security.

### M04 — Core versioned boundaries, plots and source walkways

Classification: schema + security + geometry integrity. Depends M01/M03.
Tables `mapping_boundary`, `plot_geometry`, `mapping_walkway_source`.
Common columns: UUID, mapping_release_id/site_id, source_feature_id, provenance fields
artifact_hash/layer_name/layer_version, review_state pending|approved|rejected, revision,
created/imported timestamps, review actor/time, private notes. Composite release/site FK;
unique(release_id,source_feature_id) within each table; source fields required for release data.

Boundary: kind cemetery|area, area_id only for area, geometry(Polygon,4326); one cemetery boundary
and one boundary per release/area through partial unique indexes. Plot: lot_id/area_id, polygon,
UNIQUE(release_id,lot_id); FK existing lot/area; live site/area/deletion guard, versioned boundary
containment. Walkway: type road|path|entrance, source centerline geometry(LineString,4326),
walking/restriction context. Never replace legacy site/area boundary columns.

Checks/triggers: proper type, SRID, 2D, nonempty/valid/finite coordinates, immutable approved
release children. H `guard_gis_content()->trigger`, `validate_plot_identity()->trigger`,
`validate_geometry_core(p_release_id uuid)->jsonb`; final full validation lives in M07.
Guard permits deletion/replacement only inside the protected M07 writer for a never-frozen
staged parent; feature review=approved does not override that parent's pre-approval status.
Keep direct client writes denied and freeze every child when the parent becomes immutable.
GiST each new geometry; B-tree release/source, release/lot, area/FKs. Positive-interior overlap
checks use GiST candidates, not ST_Intersects alone. No ordinary child-table writes or public views.

### M05 — Graph extensions, access/display objects and audit-safe reuse

Classification: schema + security + graph integrity/legacy compatibility. Depends M04.
Tables `grave_access_point`, `mapping_display_feature` with common GIS columns/profile.
Access: lot_id/area_id/node_id/Point4326; UNIQUE(release_id,lot_id), same-release/site node FK,
lot matches plot; no garden/plot containment. Display: kind landmark|building|entrance, geometry
with Point/Polygon-only CHECK at SRID4326, optional same-release/site route node; visual-only
landmarks allowed. GiST plus release/source/lot/node/FK indexes.

Legacy columns added (nullable, no legacy backfill):

- map_node: mapping_release_id, source_feature_id, artifact_hash/layer_name/layer_version,
  review_state, revision, imported_at/reviewed_at/reviewed_by, private review_notes.
- map_edge: same fields plus site_id, source_walkway_id, walking_allowed, direction,
  forward_cost_m/reverse_cost_m. Keep existing path_geom/distance_m/is_restricted.

Release branches CHECK required attributes/positive costs/valid geometry; NULL release branches
retain all existing constraints/defaults. Node unique(node_id,site_id,mapping_release_id), partial
unique(release,source); edge same-release/site composite endpoint FKs, release/site FK, source
walkway composite FK. Require all release/site/link fields together to avoid MATCH SIMPLE null
bypass. H trigger derives metric distance/cost from ST_Length(ST_Transform(path::geometry,
release.working_srid)); both=two costs, forward=forward only, reverse=reverse only; restricted or
nonwalking edges not traversable. No client cost overrides. Require exact endpoint equality;
reject zero-length/non-simple LineStrings, bad source-line coverage/lineage, self nodes.

H `validate_graph(p_release_id uuid)->jsonb`, `reachable_nodes(p_release_id uuid)->setof bigint`,
`guard_release_graph()->trigger`, `guard_access_point()->trigger`; security profiles above.
Keep existing geography GiST indexes; add release/source/site/review/from/to lookup indexes.
Replace permissive ALL graph RLS policies with explicit legacy write and legacy/admin release
read policies; do not add a permissive policy alongside old ALL (which would still allow writes).

Necessary existing FUNCTION modification: `audit_safe_row(text,jsonb)` gains only conditional
map_node/map_edge branches when mapping_release_id is nonnull, returning allowlisted IDs/hash/
revision/review state/times. Preserve every existing legacy/other-table redaction branch. Current
route triggers still know node_id/edge_id, so no blind new-table trigger attachment or trigger drop.
New lifecycle/import/GIS tables use dedicated GIS audit calls instead. No old audit data rewritten.
Views: none public. No graph rows created/backfilled by migration. Loader change is Task 7,
AFTER M05 exists in the database used by that running application.

### M06 — Bounded private transport storage and resumable identity

Classification: schema + security + import protocol. Depends M01–M05 and Task 8 contract constants.
Tables `mapping_import`, `mapping_import_file`, `mapping_import_chunk`, `mapping_import_report`.
Import UUID/unique request UUID, actor/release/site/area/base revision/target revision/package SHA,
state receiving|sealed|invalid|validated|finalized|abandoned, version/timestamps, current report ID,
sealed evidence verification metadata and server-derived failure classification (package vs live
dependency vs execution failure); raw bytes/digest/binding remain immutable. Eligibility for
same-byte revalidation is derived from authoritative checks, never a trusted uploaded flag.
At most one receiving/sealed/validated import per release (partial unique). File PK(import,file_name),
allowlisted names, declared byte/count/SHA/chunk_count metadata. Chunk PK(import,file,index),
bytea/raw SHA/received time; append-only; indexes for assembly and per-import sums. Report UUID,
import/revision/package digest/validator version/baseline publication revision/live-dependency digest, error/warning/count
summary + bounded entries/report hash/time; append-only. All import evidence/admin-only RLS.

D `staff_begin_mapping_import(p_release_id uuid,p_expected_revision int,p_request_id uuid,p_package_digest text,p_manifest_bytes_base64 text)->jsonb`,
`staff_stage_mapping_import_chunk(p_import_id uuid,p_request_id uuid,p_package_digest text,p_expected_revision int,p_file_name text,p_chunk_index int,p_bytes_base64 text)->jsonb`,
`staff_seal_mapping_import(p_import_id uuid,p_expected_revision int,p_request_id uuid,p_operation_id uuid)->jsonb`,
`staff_abandon_mapping_import(p_import_id uuid,p_expected_revision int,p_reason text,p_request_id uuid,p_operation_id uuid)->jsonb`.
A `staff_mapping_import_status(p_import_id uuid,p_report_page int default 1,p_report_page_size int default 100)->jsonb`
returns metadata/missing-chunk indexes/report summary and paged entries (1..200, page1..100000),
never raw bytes/device notes. H `strict_json(bytea)->jsonb` duplicate-aware native JSON checker,
`assemble_import_file(uuid,text)->bytea`, `package_digest(bytea,jsonb)->text`,
`guard_import_state()->trigger` and append-only transport guards. guard_import_state enforces the
complete matrix/binding/evidence invariants from M06; only intended protected M07 operations may
use its later semantic transitions. Ordinary direct status UPDATEs remain revoked/guarded.
Begin/seal both call assert_pilot_scope; all corresponding transitions reject reserved full scope.
Seal verifies every raw file hash/count and transitions draft->staged or protected restage once.
Validated->staged restage invalidates prior current validation/approval acceptance, NOT the
physical unapproved GIS rows. Keep that old snapshot non-authoritative until successful atomic
re-finalization replaces it, as specified below. Retain all input/report/field/run history.
No public generic restage/status setter; seal owns this transition.
Full semantic validation/finalization do not exist until M07. No operational GIS inserts in M06.

### M07 — Deterministic dry-run and atomic materialization

Classification: import/publication-adjacent + security + validation data contract. Depends M06.
No tables/legacy columns. H `validate_import(p_import_id uuid)->jsonb`,
`validate_release(p_release_id uuid)->jsonb`,
`materialize_import(p_import_id uuid,p_acknowledgements jsonb)->void`;
D `staff_validate_mapping_import(p_import_id uuid,p_expected_revision int,p_request_id uuid,p_operation_id uuid)->jsonb`,
`staff_finalize_mapping_import(p_import_id uuid,p_expected_revision int,p_report_digest text,p_acknowledgements jsonb,p_request_id uuid,p_operation_id uuid)->jsonb`.
Full checks/reports/materialization and the import transition matrix are defined below; validation
appends a report, not GIS data. Validate/finalize/private materialization all call assert_pilot_scope.
Only staff_validate_mapping_import may move an eligible same-byte invalid import to validated,
using a new operation UUID, unchanged sealed evidence/binding and current live-dependency checks.
Finalize requires import validated and parent release staged. Use the private writer for initial
materialization or transactional replacement of this release's UNAPPROVED GIS children only;
staged->validated, import->finalized and success receipt/audit commit with the complete snapshot.
Rerun checks on locked inputs/live identities; stale report fails with a refreshed deterministic
report instead of silently publishing. New blocking live conditions move import validated->invalid,
not release staged->validated. Execution failures roll back the entire materialization/replacement
subtransaction, preserving old children; only bounded private failure report/receipt may be recorded
outside it. The import stays validated for a pure execution failure and the release stays staged.
Authorization/stale/conflicting retry errors never partially mutate; no successful receipt is written.
No approval/publish/rollback, new grants beyond D/H, views/indexes/triggers beyond existing guards.

### M08 — Shared readiness and public/admin projections

Classification: security + read data contracts. Depends M07; selector from M01 is initially empty.
No tables/legacy columns. H read model `gis_private.lot_gis_readiness`, H batch reachable-node
query reused from M05; exact definitions/results below. S `staff_gis_readiness(...)`,
A `staff_mapping_release(...)`, P `public_mapping_layer(...)`, P `public_burial_gis(...)`.
Private read models no grants; safe RPCs project explicit columns. Add only new-table lookup
indexes shown necessary by EXPLAIN on disposable data, not speculative production indexes.
No existing public view, search or coordinate-navigation gate is replaced.

### M09 — Approval, atomic publication and protected rollback

Classification: security + lifecycle/publication. Depends M07/M08.
No new tables/columns/views. D `staff_review_mapping_release(p_release_id uuid,p_expected_revision int,p_decision text,p_acknowledgements jsonb,p_notes text,p_request_id uuid)->jsonb`,
`staff_publish_mapping_release(p_release_id uuid,p_expected_revision int,p_expected_scope_revision int,p_request_id uuid)->jsonb`,
`staff_rollback_mapping_release(p_release_id uuid,p_expected_revision int,p_expected_scope_revision int,p_reason text,p_request_id uuid)->jsonb`.
Review decision approve/reject; reject delegates guarded rejection semantics, no arbitrary status.
Approve, publish, rollback and private activation call assert_pilot_scope; reject full scope with
no selector/history/approval effects. Rejection of reserved metadata is not multi-area support.
H `activate_release(p_release_id uuid,p_expected_revision int,p_expected_scope_revision int,p_mode text)->jsonb`
implements same-scope publish/rollback after separate public entry gates; not client executable.
Locks/eligibility/selector/history/audit defined below. No migration inserts a publication selector.

## Exact lifecycle contract (owned by M01/M06/M07/M09)

| From | To | Owning protected operation |
| --- | --- | --- |
| creation | draft | staff_create_mapping_release |
| draft | staged | staff_seal_mapping_import after complete transport |
| staged | staged | staff_seal_mapping_import for intentional new import/revision |
| validated | staged | staff_seal_mapping_import for justified pre-approval correction; retain old unapproved child rows, invalidate authority |
| staged | validated | staff_finalize_mapping_import, atomic initial materialization or same-release unapproved replacement |
| validated | approved | staff_review_mapping_release, exact digest/acknowledgements |
| approved | published | staff_publish_mapping_release only |
| published | superseded | activate_release inside replacement/rollback transaction only |
| draft/staged/validated/approved | rejected | staff_reject_mapping_release or review rejection with reason |
| superseded | published | staff_rollback_mapping_release only, previously published snapshot |

All other transitions forbidden. Restage increments once; validation/approval invalidated, not
retained as if current. Approved snapshots remain frozen even when rejected/superseded. Rejected
is terminal. Rollback changes lifecycle/selector metadata only. Direct authenticated status UPDATEs,
helper execution and spoofed GUCs fail; no client-supplied actor accepted.

### Pilot-only v1 scope gate

The schema's pilot/full CHECK is an evolution allowance, not support for full imports. Before
begin/seal, validate/finalize, approve, publish or rollback/reactivation, assert_pilot_scope requires:
scope_kind=pilot; one live existing pilot_area_id belonging to the release site; and exactly one
mapping_release_area row identifying that same area/site. Check under the documented locks;
reject missing/extra/mismatched memberships and do not acquire multiple publication scopes.
Private writer/activation functions repeat the gate. No ordinary status edit/helper/GUC bypass.
Full metadata can remain draft, but cannot advance through this v1 pipeline; no multi-area
publication semantics, status reconciliation or generalized selector behavior is designed here.

### Validated → staged correction and atomic snapshot replacement

**Seal (M06):** a corrected package always uses a NEW import/root request; recompute its package
digest from the corrected manifest and verified exact file hashes, not from the old failed evidence.
Lock the one scope area, release and new import in the existing order; verify never frozen and
expected revision. Seal the complete corrected evidence, advance validated->staged and increment
the release revision ONCE to the import target. Invalidate current validation/report acceptance
and any current approval acceptance; retain historical reports/receipts and all raw field/run/import
evidence. DO NOT delete/update old materialized GIS children during seal. Parent staged means
the retained snapshot is non-authoritative and ineligible for approval, publication or readiness;
public reads never return it. Admin reads must identify retained old content as non-authoritative,
not silently present it as the new validated package. The prior finalized import remains terminal.

**Successful re-finalization (M07):** use ONE atomic replacement transaction/subtransaction:

1. Authenticate/claim operation receipt; lock scope-area -> release -> import and dependent rows
   in the documented order; check target revision, pilot binding and new import validated.
2. Rerun complete authoritative package/live/PostGIS checks against reconstructed immutable bytes.
3. Verify parent staged, never previously approved/published/superseded/rejected/frozen (retained
   lifecycle evidence cannot be cleared to reopen a release). Child feature review=approved alone
   does NOT mean the parent release was approved; only the unfrozen parent permits replacement.
4. Remove ONLY this same release's previous unapproved materialized GIS children in reverse FK
   dependency order: grave_access_point and mapping_display_feature; map_edge; map_node;
   plot_geometry; mapping_walkway_source; mapping_boundary. Every delete is qualified by the
   exact nonnull mapping_release_id, never by lot ID/name/proximity or NULL legacy membership.
   Do not delete release scope, old imports/files/chunks/reports/receipts, survey points/captures/
   observations, accepted georeferencing runs/memberships/results, or another release's snapshot.
5. Materialize corrected boundaries/plots/walkways, nodes, edges, access/display children in FK
   dependency order (and required NEW evidence by its existing append-only contracts). Resolve
   graph source IDs to new same-release node IDs; no stale access/display/edge FK survives.
6. Advance staged->validated once, record current validation/package/report/selected-run metadata,
   finalize the corrected import, and update success receipt/sanitized audit/report state.
7. Commit all replacement/state/success metadata atomically. No approval/publication is implied.

Release-scoped UNIQUE(release_id,lot_id), UNIQUE(release_id,source_feature_id), access uniqueness,
graph source keys, boundary partial uniques, display/walkway source identities remain intact:
old children are removed BEFORE new insertion in the same transaction. Do not drop constraints,
use unsafe upserts that mutate frozen rows, disable triggers, or add content-revision tables.
Existing map_edge node FKs use ON DELETE RESTRICT; remove all child references first. Unexpected
outside references block replacement and require review, never broad deletion/cascade/guard bypass.
Accepted field/run evidence with changed content requires new capture/run identity, not rewriting
the old evidence to avoid its uniqueness constraints.

**Failure:** roll back EVERY deletion/insertion/current-validation/state/success-audit/receipt
change in the replacement transaction. The previous child IDs/geometries/counts remain identical,
the release remains staged/non-authoritative, and no partial corrected snapshot exists. A bounded
private failure report/failed-attempt receipt may be appended only outside that rolled-back unit;
it is not successful finalization. A new live blocking condition can leave the new import invalid;
a pure execution failure leaves it validated and does not overwrite its current successful
validation/report acceptance with the failure report. A repeat of the failed operation UUID returns its
failure receipt; a genuine retry uses a new operation UUID on the same immutable import.
Initial finalization uses the same atomic writer with no old children to delete. Approved,
published, superseded and rejected/frozen releases cannot be replaced; corrections need NEW releases.

## Geometry, topology and validation algorithms

### Plot/access rules

Apply world bounds/finite coordinates/type/SRID4326/2D/valid/nonempty before casting to geography
or calculating relationships. Polygon duplicates and containment are conflicts, not just partial
overlaps. Join same-release polygons with `a.geom && b.geom` GiST candidates, ordered IDs to
avoid duplicate pairs, then `ST_Relate(a.geom,b.geom,'2********')` for positive-area interior
intersection. Adjacent edges or vertices alone are allowed. Return conflict IDs; no ST_MakeValid,
buffer, snapping, label/proximity matching or automatic lot creation.

Match plot to current non-deleted lot -> area -> site -> release membership, then ST_Covers on
the VERSIONED area boundary. Check area/cemetery relationship and intended pilot membership.
Access must reference that plot/lot and release/site node, exact Point equality, same site boundary
containment; do NOT test inside plot/garden. Entrance reachability and approved states required.

### Directed walking graph

Edges reference same-release/site nodes and same-release/site source walkway. Require endpoints
equal node points; verify edge segment lies on its named source centerline, no inferred connectors.
Detect pairwise un-noded line crossings with bbox candidates and intersection points that are not
shared node endpoints; reject positive-length interior overlap of distinct edges. Correctly split
segments share only endpoints, not duplicate traversable interiors. Paths through plot interiors
are errors. Restricted/nonwalking edges are nontraversable, not silently made walkable.

Recursive SQL reachability seeds approved entrance nodes and UNION-deduplicates node IDs while
following approved walking, unrestricted directions with valid positive costs. At most 200 nodes/
400 edges in one pilot graph; no enumeration of exponentially many path permutations. Report
isolated walkable nodes/components, unreviewed graph/access references, missing entrances,
orphan access and unreachable destinations. Unconnected visual display features are allowed.
Distance/cost is metric geometry length using release working SRID; legacy distance untouched.
This is reachability validation, NOT a new routing solver or current route replacement.

### Deterministic report contract

`ImportReport = {schemaVersion:1, validatorVersion:'gis-pilot-v1', importId, releaseId,
revision, packageDigest, baselineScopeRevision, baselineDependencyDigest, reportDigest, summary, entries}`.
Entries `{severity,code,layer,sourceFeatureId?,lotId?,relatedIds?,message}` sorted by severity
ERROR/WARNING/INFO, layer/file, source ID/lot decimal string, code, related IDs. No unstable timestamp
in reportDigest; hash fixed-field serialization, stable arrays and measured values. Summary counts:
additions/updates/unchanged/omissions/unresolvedLotIds/invalidGeometries/duplicateIds/overlaps/
disconnectedGraphElements/orphanAccessPoints/unreachableDestinations/privacyViolations/protocolWarnings.
Repeated validation of the same import/revision/digest produces the same report hash for the same
live baseline. A different import ID is an explicit report input, not hidden nondeterminism.
baselineDependencyDigest hashes a canonical sorted set of validation-relevant live site/area/lot
identities, relationship/revision/deletion/eligibility fields (including prior mapped coverage),
not private notes/owner fields or wall-clock time. Record it with every report and recompute under
locks during finalization/publication. A relationship correction can change this live baseline
without changing package bytes, root import identity or baseline publication selector revision.

ERROR: missing files/layers, wrong CRS/type/invalid geometry, duplicate/unknown/removed/wrong-site
IDs, hash/count/byte mismatch, polygon interior overlaps, cross-release references, endpoint/lineage
errors, un-noded crossings, walkable graph disconnection, orphan/unreachable required access,
missing independent results, unknown public properties/privacy violations, stale baseline/identity.
WARNING: field reading/GCP/validation count deviations, reading freshness/session/remeasure flags,
acknowledgeable prior mapped omissions and declared field limitations. INFO: additions/updates/
unchanged and unmapped out-of-set operational plots. ERROR blocks finalization/approval/publication;
WARNING requires exact code/source-ID acknowledgements for finalization/approval when relevant.
Never manufacture a measured-error pass threshold; reviewer supplies documented suitability.

Diff by `(layer,source_feature_id)` AND resolved lot identity against prior active release; do not
compare solely by names or proximity. Compare all already published lot coverage for the area,
not just the new pilot set. Omission warnings require explicit per-lot reason; otherwise blocking
acknowledgement error. Never DELETE/UPDATE omitted production lots or prior published snapshots.

## Pilot package and transport protocol (owned by Tasks 8–10)

Required 15 files are the spec's manifest + eight GeoJSON layers + six survey/run JSON files.
GeoJSON properties: common `source_feature_id`, `site_id`, provenance artifact hash/layer version;
boundary `kind,area_id`; plot `lot_id,area_id`; access `lot_id,area_id,node_source_feature_id`;
walkway `edge_type,walking_allowed,is_restricted`; node `node_name,node_type`; edge
`from_source_feature_id,to_source_feature_id,walkway_source_feature_id,edge_type,walking_allowed,
is_restricted,direction`; display `kind,label,node_source_feature_id?`. Geometry is the GeoJSON
geometry member, not a text property. Internal review/approval is not trusted from feature properties.

Manifest schema: version=1; site_id/area_id decimal strings, release_code/title/description,
source_plan {reference,version,sha256,coordinate_space}, crs {field:4326,working:32651,export:4326},
exported_at/QGIS_version, selected_run_code, pilot_lot_ids, provenance_notes/limitations,
files [{name,sha256,bytes,feature_count,layer_version}]. File count means raw array rows/features;
field/run reference entries explicitly identify existing immutable evidence and exact capture/run
IDs/codes. Verify source existence/role/site/unchanged hash server-side, never trust client claims.

Allowlisted survey/run metadata matches M02/M03 typed fields, with code-based references and
all raw readings. No deceased/owner names, freeform notes, raw GPS device/operator data in public
layers. Freeform notes remain private metadata; schema rejection cannot detect every disguised
name in an otherwise legitimate display label, so ADMIN privacy review is also required.

Digest format locked for interoperable CLI/SQL:
SHA256 of UTF8(`GraveNavGISPackage/v1\n`) || exact manifest bytes || UTF8(`\n`) ||
UTF8(lines sorted by file NAME: `name + '\t' + sha256 + '\n'`). Manifest does not list itself.
Verify each declared file hash from actual bytes before trusting those digest inputs. No JSON
reserialization, normalized line endings, archive reordering or chunk size affects this definition.

New safety transport bounds (not accuracy thresholds): manifest <=64 KiB; each other file <=4 MiB;
decoded chunk <=64 KiB, raw RPC JSON envelope <=128 KiB, depth <=32, max JSON string 8,192
characters with stricter field lengths above, <=64 chunks per data file (manifest one); exactly
15 allowlisted files, total exact bytes <=8 MiB. Strict parser traversal is capped at 500,000 JSON
nodes per file and 1,000,000 per package. Enforce aggregate count limits across all files,
not per chunk; 4,000 membership/result rows combined. Max error entries 2,000 plus deterministic
total/truncated-report indicator; never truncate underlying evidence, hide an ERROR or approve
an incomplete report. Smaller technical per-file/request limits are deliberate v1 capacity limits.

`parseStrictJson(bytes:Uint8Array,limits)->unknown`: Node built-ins, recursive tokenizer parses
JSON grammar and tracks DECODED keys per object; rejects `"x"` and `"\u0078"` duplicates, invalid
UTF8/BOM, unpaired surrogate strings, overflowed numeric literals/nonfinite numbers, excess depth.
Represent database IDs as strings; reject unsafe integer IDs. SQL `strict_json` parses native
PostgreSQL `json` (NOT jsonb), traverses `json_each`/`json_array_elements` with bounded depth/node
counts, and rejects repeated decoded keys per object using byte-sensitive `COLLATE "C"` grouping.
Validate strings/numeric finiteness/ranges before final jsonb conversion. Thus SQL uses the native
grammar parser, not a second handwritten lexer that could discard duplicates. Shared adversarial
corpus proves equivalence before deployment; verify json duplicate preservation on the target.
JSON.parse alone, regex-only duplicate matching or jsonb-before-check are insufficient.

`validatePackageDirectory(root:string)->Promise<PackageValidation>`:
Node fs lstat/realpath + no-follow open where supported; reject symlink/junction/reparse aliases,
external paths, separators/.., undeclared files, nonregular files; enforce allowlist and exact
byte budgets before reading; verify inode/stat/size/hash stability across reads to detect substitution.
Only open enumerated known basenames. Checksums use node:crypto; GeoJSON structural validation
explicit type/ring closure/coordinates/IDs/counts/allowlists; PostGIS owns full validity/topology.
No new parsing dependency unless tests demonstrate an audited blocker and user approves it.

### Complete import transition matrix (M06 transport; M07 validation/finalization)

Import states are distinct from release states: an import validated by dry-run has NO new
operational GIS rows. Its parent stays staged until successful finalization. Every mutation
requires the original importing active ADMIN, pilot gate, exact binding/revision and receipt rules.

| From | To | Protected operation / prerequisites | Parent/snapshot effect |
| --- | --- | --- | --- |
| creation | receiving | staff_begin_mapping_import; new root UUID/digest/binding, one-area pilot | Capture base/target revision; parent unchanged, no GIS writes |
| receiving | receiving | staff_stage_mapping_import_chunk; new bounded chunk or identical retry; incomplete upload remains resumable | No release revision advance; immutable accepted chunks |
| receiving | sealed | staff_seal_mapping_import; complete immutable files/manifest, exact hashes/counts/digest/transport checks | Parent draft->staged or protected staged/validated->staged; increment once; retain old unapproved children |
| receiving | invalid | staff_seal_mapping_import records an irreparable package/manifest/hash/syntax failure | Justified extra transition for retained failed-seal evidence; no successful seal or parent advance; never same-byte revalidation eligible |
| receiving | abandoned | staff_abandon_mapping_import; expected revision/reason | Retain evidence; parent unchanged |
| sealed | validated | staff_validate_mapping_import; full current validation has zero blocking ERRORs | New deterministic report; parent staged, no GIS materialization |
| sealed | invalid | staff_validate_mapping_import; one or more blocking ERRORs | Retain sealed evidence/report; parent staged |
| sealed | abandoned | staff_abandon_mapping_import; safe pre-finalization cancellation | Retain evidence; parent stays staged/non-authoritative |
| invalid | validated | ONLY staff_validate_mapping_import; eligible unchanged sealed package, corrected LIVE dependency, NEW operation UUID, complete rerun now has zero ERRORs | New baseline/report recorded; parent stays staged; no GIS writes |
| invalid | invalid | staff_validate_mapping_import; eligible same-byte live recheck still has ERRORs | Justified self-transition records new report without fabricating validation; no parent change |
| invalid | abandoned | staff_abandon_mapping_import; reason/expected revision | Retain immutable evidence/history; no snapshot mutation |
| validated | validated | staff_validate_mapping_import reruns unchanged package at current baseline with zero ERRORs | Justified self-transition refreshes report/digest; new operation UUID, parent stays staged |
| validated | invalid | staff_validate_mapping_import OR staff_finalize_mapping_import authoritative recheck discovers a new blocking live condition | Record report, no replacement; parent staged, old snapshot retained |
| validated | finalized | staff_finalize_mapping_import; current report/review/complete authoritative checks and atomic materialization/replacement succeed | Parent staged->validated, full snapshot + success receipt/audit commit |
| validated | abandoned | staff_abandon_mapping_import only before materialization/finalization; no approval/publication effects | Retain evidence and any old non-authoritative children; parent stays staged |
| finalized | terminal | No transition or editing bytes; exact completed-operation retry returns existing receipt | No duplicate materialization/revision increment; corrections require new import/release as appropriate |
| abandoned | terminal | No transition or editing bytes; exact abandonment retry returns receipt | No reopening; new request/import required |

All unlisted transitions are denied, including invalid->finalized, abandoned->receiving and
finalized->abandoned. No ordinary state UPDATE/private-helper/GUC bypass. Identical operation
replays are receipt reads, not new state transitions; authentication/expected-binding checks remain.
No receiving->invalid merely for a missing NETWORK chunk, temporary error or expired JWT:
incomplete declared transport stays receiving and can resume. Missing/undeclared package files
or an irreparable contract error cannot be "fixed" by editing accepted bytes in place.
Pure execution failures (including injected halfway replacement/audit failure) leave import
validated and parent staged; only a private failed-attempt report/receipt may persist, not GIS writes.

**Same-byte invalid revalidation eligibility:** complete successfully sealed raw evidence still
exists; reconstruct exact files and verify unchanged bytes/hashes/package digest and release/import/
root UUID/target-revision binding; parent remains staged/unfrozen and no newer competing active
import owns that revision; every prior blocker was a live-dependency condition rather than a
package-content defect. Rerun ALL checks against current live dependencies, require every ERROR
resolved, and record a new operation UUID and deterministic report for that live baseline. Clients
cannot force eligibility with a flag or reuse an earlier failed validation operation's receipt.
Example: ordinary authorized business workflow corrects an existing lot/area relationship to
the unchanged package's otherwise correct declared identity. This task does not authorize that
business mutation or creation of invented lots to make a package pass.

**Requires completely NEW import/root request and recomputed verified-package digest:**
malformed JSON; duplicate JSON keys; hash mismatch; undeclared/missing package files; wrong CRS
declaration; encoded invalid geometry; incorrect lot/source IDs; privacy violations in properties;
different source geometry; or ANY corrected content. Preserve old evidence/reports, abandon the
failed identity if appropriate, rerun offline preflight, then begin a new import/protected restage.
Never edit invalid import bytes/chunks/files; even a live fix cannot cure a package-content defect.
Corrected valid manifest/file declarations change the digest. A new attempt fixing corrupted
transport bytes may legitimately retain the originally intended digest, but MUST use a new import/
root UUID; it is not same-byte revalidation or permission to overwrite the failed identity.
One request/digest cannot be reused for different content or scope.

Import revision is distinct from release revision;
RPC `p_expected_revision` always means release base/current revision, specified per response.
Begin captures base revision and target revision; seal advances release once to target, then
validate/finalize use that target. Each response includes both revisions and import state.
Abandon uses the CURRENT expected release revision while retaining the historical import binding;
it may retire obsolete invalid evidence without mutating the parent/snapshot. It cannot abandon
a finalized import. Validate/finalize on an obsolete target fail, never silently rebind that import.

Every import piece retains the SAME root request UUID/digest/release binding. Operation UUIDs
for seal/validate/finalize/abandon are additional retry receipts, not another import identity; CLI
resume state records these opaque IDs. Conflicting operation UUID inputs fail, and a later genuine
validation attempt after a live dependency change uses a new operation UUID on the SAME raw import.

Concurrent mutations share scope-area -> release -> import lock order after receipt checks;
chunk identity is deduped before counters. Decode strict base64 and size, assemble ordered raw bytea, native sha256(bytes),
then verify manifest bytes/counts/digest. Denied auth requests store nothing. Accepted invalid
payloads get bounded reports/evidence, not unlimited attacker logs. Expired JWT pauses CLI without
losing received chunks; resume uses the same request/file identities after normal session refresh.
Never log/persist JWT/password/service-role keys; no new Auth flow or browser-session bypass.

Cleanup: no automatic evidence deletion in v1; interrupted imports can be marked abandoned with
ADMIN reason. Preserve bytes/reports/receipts for rejected/failed/abandoned imports and approved
history. Query age/size through admin status for operator review; a later retention policy may
archive under explicit approval. No cron cleanup or database-delete-by-omission behavior.

## Shared readiness and read DTOs (owned by Task 12)

All four states come from ONE SQL definition:

- occupancy: any burial relationship (including soft-deleted) => occupied; otherwise BOOKED/HOLD/
  AVAILABLE. This reproduces staff_plot_management; do not move that existing RPC yet.
- legacyCoordinate: no point=>missing; rejected=>rejected; status verified AND flag=>verified;
  else pending. No new GIS data writes legacy flags/accuracy.
- geometryReady: current nondeleted lot/site/area relation + active published area release +
  approved valid matching polygon. Mismatched/removed identity is never ready.
- routingReady: geometryReady + approved same-release access/node + approved permitted directed
  reachable graph. Missing legacy coordinate does not block GIS readiness.

Reason priority: lot_removed; no_published_release; no_approved_polygon; no_access_point;
unreviewed_access_point; unreachable; ready (represented by null reason). For area/site mismatch
after legacy edit, no_approved_polygon; keep richer private validation error out of public DTO.
Readiness view may include removed lots for diagnostics; staff/public endpoints exclude removed
  rows as appropriate. Compute reachable set once per release in a materialized CTE, not one query
per lot. Counts use full filtered source; page slices then JSON aggregation. Stable ID tie-breaker.

Exact public SQL names/signatures (parameter defaults documented in DTO module):

- S `staff_gis_readiness(p_site_id bigint,p_area_id bigint,p_page int default 1,p_page_size int default 20)->jsonb`;
  page 1..100000, size 1..50; invalid values reject, no silent truncation. Response
  `{schemaVersion:1,siteId,areaId,releaseId,scopeRevision,page,pageSize,total,totalPages,
  counts:{geometryReady,routingReady,legacyMissing},rows:[{lotId,lotCode,areaId,occupancy,
  legacyCoordinate,geometryReady,routingReady,reason}]}`. No owner/name/private provenance.
- A `staff_mapping_release(p_release_id uuid,p_layer text,p_page int default 1,p_page_size int default 50)->jsonb`;
  size 1..200, same page bound; allowlist metadata/boundaries/plots/access_points/walkways/nodes/
  edges/landmarks. Metadata includes bounded private review/provenance; layers explicit columns.
  `{schemaVersion,release:{id,status,revision,...},contentAuthority,layer,page,pageSize,total,totalPages,rows}`.
  contentAuthority is `none|retained_unapproved|current_validated|frozen`; derive from parent state
  and the retained finalized-import binding, with no new content-revision table. Staged old rows
  are retained_unapproved; this flag never substitutes for approval or public selector eligibility.
- P `public_mapping_layer(p_site_id bigint,p_area_id bigint,p_layer text,p_page int default 1,p_page_size int default 100,p_expected_release_id uuid default null)->jsonb`;
  size 1..200/page bound; allowlist boundaries/plots/access_points/walkways/nodes/edges/landmarks;
  approved active release ONLY. `{schemaVersion,releaseId,scopeRevision,layer,page,pageSize,total,
  totalPages,features:Feature[]}`. Optional expected_release_id prevents mixing pages after switch;
  mismatch gives safe release_changed error, no old/unpublished release lookup. Null selector =>
  successful empty features with releaseId null. Public geometry labels use only approved mapping
  identifiers; never owner/occupancy/hidden burial metadata. Output costs/directions for approved
  walkable network only; nonwalking/restricted internals are not public route instructions.
- P `public_burial_gis(p_burial_id bigint)->jsonb`: same existing ACTIVE/public_display/current
  lot/burial rules. No visible record=>null. Visible but unmapped=>safe readiness false with reason;
  mapped=>`{schemaVersion,burialId,lotId,lotCode,areaId,releaseId,geometryReady,routingReady,reason,
  plotGeometry,accessPoint}`. Geometry/access emitted only when approved/live identity matches.

Wrappers in gis-data.ts accept an EXISTING SupabaseClient<Database> and typed arguments, return
decoded matching DTO; no new session/global service-role client or UI imports. DTO module owns
runtime shape checks and safe bigint strings. Where generated SQL-bigint Args are numbers, overlay
only the new GIS arguments in database-schema.ts as decimal strings; test PostgREST coercion using
an ID above 2^53, with no lossy Number cast and no changes to existing business RPC argument types.
Functions do not fetch public data with ADMIN
client then serialize private table rows. Modules later adopt contracts by separately approved
phase: Dashboard aggregates, Plot Management adds independent readiness, Coordinate Verification
keeps legacy queue with later GIS review mode, Admin Map layers, Visitor Map safe profile/access.

## Publication and rollback algorithm (owned by Task 14)

Request gate + receipt precede locks; never accept trusted actor input. Require assert_pilot_scope
for approval/publication/rollback and activation; one existing area only, no full/multi-area path.
Lock the existing area row FOR NO KEY UPDATE for that ONE scope BEFORE release/import/selector
locks; sort dependent row IDs within that scope. This serializes first publication even when no selector row exists, with no placeholder
publication row. Lock target/current releases, accepted evidence and relevant lot/site/area
relationships in deterministic order; scope operations share this ordering with finalization.
NO KEY UPDATE serializes competing scope activations while remaining compatible with FK KEY
SHARE checks from unchanged legacy record edits. Use bounded safe retries for SQLSTATE40001/
40P01 on the same request UUID; do not retry authorization, stale-revision or validation conflicts.

Review validates exact package/report/current revision, field/run acceptance, ALL required GIS
feature review and suitability/omission/privacy acknowledgements. It records approver/date/hash,
freezes content and advances validated->approved. Reject retains contents/evidence.

Publish requires approved (not draft/validated/superseded), expected release revision and expected
scope revision (0 for first publish), selected run/working-CRS results, complete current validation,
no unresolved errors, explicit warnings acknowledged. Rerun live identities/topology/coverage;
recompute report against CURRENT selector while scope locked. Stale acknowledgement/digest fails.
Atomically supersede prior published release, update/insert mapping_publication, increment scope
revision, advance target published, append publication_event and sanitized audit, finish receipt.
Failure anywhere rolls back ALL selector/status/history/audit changes. Initial NULL selector
stays absent on failure. Previous snapshots remain byte-identical.

Rollback requires superseded target, same area/site, historical approval AND publication event,
expected current scope/release revisions, nonblank reason and revalidated live constraints.
Only staff_rollback... allows superseded->published; do not use ordinary publish for reactivation.
No copy/rewrite of old geometry, observations, boundaries or graph. If live lot deletion/area change
or coverage loss makes old release ineligible, reject rollback; propose a new correction release.
No transaction may revoke an old release's contents just because a replacement omits a lot.

## Tasks in execution order

Each task includes an independently testable deliverable. Proposed commit is OPTIONAL until
the user authorizes commits; any commit allowlist includes only that task's intended files.
After each RED->GREEN cycle run `npm test`; do not proceed through a failing baseline.

### Task 1 — Phase 1: release lifecycle skeleton and protected security primitives

Goal/files: M01, `tests/gis-fixtures.mjs`, `tests/gis-publication.test.mjs`, optional cutoff in
`tests/database-helper.mjs`, additive database types, deployment checklist first entry.
Consumes existing auth/account/RLS helpers; produces all M01 signatures and protected matrix.
Dependencies: approved plan, fresh checkout/history check and baseline suite. Hosted: NO.

- [ ] Snapshot dirty changes, agree in-place vs isolated worktree with full current baseline;
  do not create a worktree that omits earlier uncommitted applied migrations. Run npm test.
- [ ] Write failing tests: same site/code second release rejected; same code another site allowed;
  ADMIN create returns revision 1/draft; MANAGER/inactive/anon/direct status/GUC spoof rejected;
  every skipped transition rejected; private helpers/receipt reads denied; reject terminal retains data.
- [ ] Test `pilot_scope_requires_exact_single_existing_area`: pilot creation/gate rejects missing,
  extra, wrong-site or mismatched membership; full metadata can remain draft but assert_pilot_scope
  rejects it. Keep the helper private. Later tasks test rejection at each actual pipeline RPC.
- [ ] Run `node --test tests/gis-publication.test.mjs`; expect missing M01 objects/permission assertions RED.
- [ ] Allocate timestamp ONLY now; implement M01 catalog/security/guards/receipts/audit.
- [ ] Run targeted tests then npm test; GREEN with old contracts unchanged. Inspect ACL/proconfig
  in disposable db; refresh only new type entries. Record M01 migration/hash in checklist.
- [ ] If authorized, narrow commit `feat(gis): add protected mapping release foundation`.

Recovery: discard only undeployed task changes after preserving user's baseline; deployed schema
later stays additive, disable new entrypoints through reviewed forward migration rather than DROP.
No STOP checkpoint yet; Task 2 depends on this skeleton.

### Task 2 — Phase 1: immutable field evidence and SQL summaries

Goal/files: M02, `tests/gis-evidence.test.mjs`, shared fictional fixtures, additive types.
Consumes M01 auth/receipts/audit; produces M02 tables/view/RPCs. Hosted: NO. Depends Task 1.

- [ ] Write failing tests with independent sorted-value expectations, for example five readings
  latitude `[13,13.1,13.2,13.3,14]`, longitude `[123,123.1,123.2,123.3,124]`, accuracy `[9,7,5,3,1]`:
  `medianLat===13.2`, `medianLon===123.2`, `count===5`, `avg===5`, `best===1`;
  four readings => medians 13.15/123.15 and warning; six includes ALL readings; zero => null point.
- [ ] Also test repeated/out-of-session timestamps, every raw row retained, same capture retry
  no duplicates, remeasure creates a parent-linked new capture, cross-point/cyclic parent fails;
  role changes/raw UPDATE/DELETE denied and accepted capture append denied.
- [ ] Run `node --test tests/gis-evidence.test.mjs`; RED before M02.
- [ ] Implement M02 with set-based SQL aggregation, immutable raw data and controlled writes.
- [ ] Run targeted/npm test; verify role-denial SQLSTATE and exact field summaries; update types.
- [ ] If authorized, narrow commit `feat(gis): preserve survey evidence and derived positions`.

Core assertion contract for the five-reading fixture (Node's existing strict assert):

```js
assert.equal(summary.observationCount, 5);
assert.ok(Math.abs(summary.medianLatitude - 13.2) < 1e-12);
assert.ok(Math.abs(summary.medianLongitude - 123.2) < 1e-12);
assert.equal(summary.averageReportedAccuracyM, 5);
assert.equal(summary.bestReportedAccuracyM, 1);
```

Recovery: accepted evidence never overwritten/deleted; remeasurement/correction is a new capture.
SQL views/functions can be corrected by forward migration without changing raw observations.

### Task 3 — Phase 2: run evidence, separation and working-CRS validation

Goal/files: M03, `tests/gis-georeferencing.test.mjs`, evidence fixtures/types.
Consumes frozen M02 summary + M01 release; produces M03 run contracts. Hosted: NO.

- [ ] Write RED tests: VALIDATION->FITTING fails; one point/two roles fails; wrong-site capture,
  unaccepted capture, bad pixel and accepted-run edits fail. Missing results prevent acceptance.
- [ ] Use synthetic working-CRS points `(500000,1437000)` and `(500003,1437004)`, transform to
  stored4326; assert canonical error within `1e-6` of 5 m; errors `[3,5,10]` => mean6/median5/max10.
  Verify preserved originals and working_srid FIELD used; reject4326/invalid metric CRS, no geography
  or fitting-residual substitution; zero independent points returns null metrics and cannot approve.
- [ ] Run `node --test tests/gis-georeferencing.test.mjs`; RED.
- [ ] Implement M03 and both summary views; no GIS publication or threshold logic.
- [ ] Run target/npm test; compare canonical SQL with independently projected fixture values.
- [ ] If authorized, narrow commit `feat(gis): add independent georeferencing evidence`.

STOP A: review field/run schema, immutable captures, roles/ACLs and canonical summaries. Expected:
M01–M03 replay clean; no GIS geometry/import/publication. Legacy modules/hosted records untouched.
Recovery: keep raw evidence, disable new RPCs with a forward ACL patch if already deployed.

### Task 4 — Phase 7 deployment pass 1: batch B1 (M01–M03)

Goal/files: `docs/gis/deployment-checklist.md`, hosted fixture SQL/verification tool as needed;
no additional migration. Consumes Checkpoint A GREEN; produces verified hosted field/run schema.
Hosted: YES only after explicit Checkpoint E release approval. Depends Tasks 1–3.

- [ ] Run the full deployment procedure below; dry-run allowlist MUST be exactly M01/M02/M03.
- [ ] Verify catalog/ACL/helpers/median/working-CRS capabilities; disposable fixture tests rollback.
- [ ] Record applied history/hash/count/capability evidence; STOP F1 before creating M04.

Recovery: no reset/down; stop further batches, revoke new writes by approved forward patch if needed.
At this point legacy map/table schema remains unchanged; no operational GIS import can execute.

### Task 5 — Phase 3: versioned boundaries, plots and original walkway lineage

Goal/files: M04, `tests/gis-geometry.test.mjs`, fixtures/types.
Consumes M01/M03 release/run metadata; produces protected M04 GIS objects/validation core.
Dependencies: Task 4 reviewed (or explicitly selected all-local development mode with no deployment).
Hosted: NO during implementation.

- [ ] Write RED tests: invalid/empty/Z/wrong-SRID polygons; unknown/removed/wrong-area/site lot;
  duplicate/contained/partial-overlap conflicts; touching edge/vertex accepted; versioned boundary
  containment; legacy point missing still compatible; no lot creation/deletion by omitted feature.
- [ ] Run `node --test tests/gis-geometry.test.mjs`; RED.
- [ ] Implement M04 typed checks/guards/indexed candidate validation and provenance constraints.
- [ ] Run target/npm test; inspect EXPLAIN with fictional 20–50 plots; old lot/site/area hashes stable.
- [ ] If authorized, narrow commit `feat(gis): add versioned plot geometry foundation`.

Recovery: new unapproved release correction only; never rewrite legacy boundaries or older polygons.

### Task 6 — Phase 3: release graph integrity, access and legacy audit containment

Goal/files: M05, `tests/gis-graph.test.mjs`, audit/geometry fixtures/types.
Consumes M04 plot/walkway/release; produces M05 graph/access/display and private reachability.
Hosted: NO. Do NOT edit the running legacy loader before Task 7 schema deployment.

- [ ] Write RED tests for cross-site/release/NULL-FK bypass, exact endpoints, wrong lineage,
  zero/invalid line, one-way reachability, restricted/nonwalking routes, isolated components,
  orphan/unreachable access, access beside garden but inside cemetery accepted, visual-only landmark.
- [ ] Test legacy graph permissions unchanged, no membership upgrade/downgrade, ADMIN direct
  release writes denied, MANAGER cannot SELECT release provenance. Audit trace containing private
  route notes/geometry yields sanitized metadata only; all earlier redaction cases unchanged.
- [ ] Test graph/access/display and boundary/walkway/plot guards distinguish never-frozen staged
  replacement by the private writer from client DELETEs or frozen-parent replacement; retained
  unapproved child feature review flags cannot authorize a client or prevent the scoped writer.
- [ ] Run `node --test tests/gis-graph.test.mjs tests/gis-geometry.test.mjs`; RED.
- [ ] Implement M05 without backfilling release/site values on legacy rows; implement recursive
  set reachability and narrow audit_safe_row branch. Bound graph recursion by distinct node set.
- [ ] Run target/npm test; confirm old map/routing tests and legacy row hashes. Refresh types.
- [ ] If authorized, narrow commit `feat(gis): add release-safe graph and grave access points`.

STOP B: M04/M05 schema/integrity/redaction approved; legacy rows still NULL-release. No import
materialization or new map UI. Recovery: leave nullable columns; do not drop used constraints or
remove audit protection. No real release data should exist yet.

### Task 7 — Phase 7 deployment pass 2: B2 (M04/M05), then legacy-loader isolation

Goal/files: deployment checklist, ONLY `src/lib/phase1-map-data.ts` two query filters,
`tests/gis-legacy.test.mjs`, additive types. Consumes M05 schema. Hosted: YES gated by E/B.

- [ ] Full validation BEFORE schema deployment; normal dry-run contains exactly M04/M05.
- [ ] Deploy/verify columns/catalog/RLS/audit and rollback fixtures. Only after columns exist in
  the database used by the running app, write query-spy RED tests for node AND edge `.is('mapping_release_id',null)`.
- [ ] Add the two filters, nothing else; prove query chain still keeps order/select/static fallback.
- [ ] Run `node --test tests/gis-legacy.test.mjs tests/repository-smoke.test.mjs tests/visitor-behavior.test.mjs`,
  tsc/npm test/full validate; minimal Admin/Visitor map smoke with legacy rows/static routing.
- [ ] Confirm this compatibility code is effective in every runtime using hosted graph tables.
  If an application deployment is needed, obtain its scoped approval/release through the existing
  workflow; never assume schema approval authorizes an unrelated frontend release.
- [ ] STOP F2: no hosted M07 finalization/materialization until legacy filter is deployed and verified.
  If authorized, commit only loader/tests/types `fix(gis): isolate legacy hosted map data`.

Recovery: keep filter once columns exist; reverting it would expose future release rows. Legacy
runtime can stay pinned to previous version only while no release GIS rows can materialize.

### Task 8 — Phase 4: strict offline package validator and documented contract

Goal/files: the three `scripts/gis` contract/parser/validator modules (not import-client),
`scripts/validate-gis-package.mjs`, `tests/gis-package.test.mjs`, `docs/gis/pilot-package-v1.md`.
Consumes M02/M03/M04/M05 schemas and transport contract above; produces parser/validator signatures.
Dependencies Task 7 F2. Hosted: NO; offline command must not create a Supabase client.

- [ ] Write RED tests: 15-file fixture, exact SHA/digest golden vector; escaped/nested duplicate
  keys vs identical keys in separate objects; malformed/invalid UTF8/nonfinite/deep/unsafe IDs;
  path traversal/symlink/junction/changed-file rejection; unknown properties/private names fields;
  CRS4326/types/counts; >8MiB or >4MiB file, >64KiB manifest, aggregate memberships+results limit.
- [ ] Run `node --test tests/gis-package.test.mjs`; RED for missing parser/validator.
- [ ] Implement parseStrictJson/validatePackageDirectory and constants/allowlists without new package.
  CLI `node scripts/validate-gis-package.mjs <directory>` emits redacted deterministic JSON and
  exit0 structural valid/exit1 invalid; valid includes `requiresDatabaseValidation:true`.
- [ ] Run target/npm test and CLI against temporary synthetic fixture; valid structure does not
  claim valid hosted topology/identity. Document byte limits, exact digest and field schemas.
- [ ] If authorized, narrow commit `feat(gis): validate reproducible pilot packages offline`.

Parser regression assertion (duplicate decoded keys must fail BEFORE JSONB/ordinary JSON collapse):

```js
assert.throws(
  () => parseStrictJson(Buffer.from('{"a":1,"\\u0061":2}')),
  (error) => error.code === 'duplicate_json_key',
);
```

Recovery: retain input unchanged; parser/digest contract changes require new schema_version, not
silent acceptance of formerly hashed packages. No real package or dependency added for testing.

### Task 9 — Phase 4: bounded import storage and resumable RPC transport

Goal/files: M06, `tests/gis-import.test.mjs`, parser conformance corpus in fixtures, types.
Consumes Task8 digest/limits/parser; produces M06 transport RPCs, state and receipt metadata.
Hosted: NO. Depends Task8.

- [ ] Write RED tests: same request/chunk returns same result/counters; conflicting bytes/actor/
  digest/revision denied; 64KiB decoded vs128KiB envelope limits, total8MiB/no count reset per chunk;
  missing/overlapping chunks, base64/hash/declared count mismatch; out-of-order arrival allowed;
  identical chunk replay not a duplicate error. SQL duplicate parser runs the JS adversarial corpus.
- [ ] Test `full_scope_begin_and_seal_denied` and exact one-area checks independently at both
  gates; no import/revision/selector effects on rejection. Disposable trusted fixtures may exercise
  later gates with reserved metadata; never add a production bypass or weaker client privileges.
- [ ] Test `restage_keeps_old_snapshot`: initial M07 fixture snapshot (when available) survives
  corrected seal byte-for-byte, release increments ONCE to staged, prior validation acceptance
  clears but old report/receipt/evidence history remains. At M06-only cutoff test seal metadata/
  revision contract, then exercise the complete existing-snapshot case with M07 in Task10.
- [ ] Test receiving->sealed/abandoned/irreparable-invalid, invalid->abandoned and all unlisted
  transport transitions denied. Missing transport chunks remain receiving/resumable; package
  content errors cannot be corrected by changing accepted bytes. Never restage a frozen parent.
- [ ] Run `node --test tests/gis-import.test.mjs tests/gis-package.test.mjs`; RED.
- [ ] Implement M06 private byte storage/seal/admin status and all bounds; every incomplete/error
  path has zero new operational GIS rows. No finalizer/publisher exists yet.
- [ ] Run target/npm test; inspect ACL and append-only file/chunk/report evidence; update types.
- [ ] If authorized, narrow commit `feat(gis): stage bounded resumable GIS imports`.

Recovery: abandoned/failed source retained privately; fix transport via forward migration, do not
reuse request UUID for changed content or delete historical readings/reports.

### Task 10 — Phase 4: complete SQL dry-run, transactional finalization and import CLI

Goal/files: M07, `scripts/gis/import-client.mjs`, `scripts/import-gis-package.mjs`,
`tests/gis-import.test.mjs`, `tests/gis-concurrency.test.mjs`, `docs/gis/import-and-publication.md`, types.
Consumes Task8 validator + M06 staging + M02–M05 integrity/reachability. Produces M07 signatures/report.
Hosted: NO; concurrency tests use real DISPOSABLE PostgreSQL, not hosted meaningful records.

- [ ] RED tests for every report category/severity, stable digest/order on repeated dry-run, all
  identity/geometry/privacy/topology violations; staged file parsing not partial GIS inserts.
  <5/>5 deviations preserved/warned; absent validation results block finalization; existing evidence
  reference hash/role/site checked; out-of-pilot garden lots untouched; old coverage omission needs reason.
- [ ] Test `full_scope_validate_finalize_denied`: both RPCs and private writer require pilot;
  extra/missing/mismatched area membership fails without materialization. Do not design multi-area
  behavior or let correct-looking bytes bypass the parent scope gate.
- [ ] Parameterize `import_transition_matrix` over EVERY documented row and deny every other
  state pair, including direct UPDATE/private-helper/GUC and unauthorized role attempts. Verify
  parent state, counts, report history, revision and receipt behavior, not just returned import state.
- [ ] Test `same_bytes_live_dependency_revalidation`: sealed->invalid, authorized disposable
  business-fixture relationship correction, NEW validation operation UUID, invalid->validated;
  exact raw bytes/chunk hashes/package digest/root UUID/release/import target binding unchanged,
  new baseline report recorded, no GIS writes until explicit finalization. Old operation replay
  returns its old failure; same new-operation replay is idempotent. Still-blocked recheck stays invalid.
- [ ] Test every listed package-content defect requires NEW import/root request; no invalid chunk/
  file overwrite; bad seal, missing evidence, changed binding/digest, obsolete target, competing
  active import or unresolved ERROR denies same-byte revalidation. Test validated->invalid on new
  blocking live condition, validated->validated report refresh, safe abandonment and terminal states.
- [ ] Test the seven replacement cases: initial finalization; validated->staged correction with
  old children retained; successful replacement; injected halfway replacement failure; old child
  IDs/geometries/counts surviving failure; no duplicate children/source/lot/access/boundary/graph
  identities after success; and attempted replacement of approved/published/superseded/rejected
  snapshots denied. Verify another release, NULL legacy graph rows, raw/import/report/accepted-run
  evidence and old successful receipts unchanged. FK/audit failure must not leave partial deletes.
- [ ] Inject a last-object FK/audit failure: ALL materialized evidence/GIS roll back, private failure
  report remains. Stale report/live lot removal or reassignment fails; same successful finalization
  retry returns receipt without duplicate data. No finalization ever creates a publication row.
- [ ] Run `node --test tests/gis-import.test.mjs`; RED, then real two-session finalizer race RED
  under disposable PG runner, if provisioned; never mislabel a skipped test as passing.
- [ ] Implement M07 set-based validator and materializer; accepted referenced evidence is reused
  only if unchanged/frozen; new captures become accepted only through explicit ADMIN review/
  per-capture deviation acknowledgements, never uploaded review_state. Run membership freeze
  follows exact captures. Finalization requires explicit ADMIN review acknowledgements bound to
  exact layer hashes; server materializes approved feature states from that review, NEVER from
  GeoJSON approval flags. New run acceptance similarly uses explicit measured-results review;
  unknown/unacknowledged review inputs block finalization. Release itself remains only validated.
- [ ] Implement exact import-state guards and scoped reverse-FK deletion + forward-FK insertion
  in the replacement atomic unit; never delete old children at seal, disable constraints/triggers,
  reuse finalized identity for corrected bytes or introduce content-revision tables.
- [ ] Build CLI modes `stage`, `resume`, `validate`, `finalize` (explicit command/report digest/acks),
  plus `status`; offline preflight first. JWT comes from existing normal authenticated session
  via `GRAVENAV_GIS_ACCESS_TOKEN` env, publishable URL/key env; never command-line JWT, service
  key, stored raw session, new login route or Management-API impersonation. Resume file only UUID/
  digest/chunk receipts in operator-chosen ignored location, no JWT/raw data. CLI has NO publish flag.
- [ ] Run target/npm test, mock-RPC CLI tests with transient failures, redacted logs and exact
  resume identities; full validate. Document safe authenticated usage without requesting secrets.
- [ ] If authorized, narrow commit `feat(gis): finalize validated pilot imports atomically`.

Replacement regression assertion contract (fictional snapshots loaded by the test fixture):

```js
assert.equal(afterSeal.release.status, 'staged');
assert.equal(afterSeal.release.revision, beforeCorrection.release.revision + 1);
assert.deepEqual(afterSeal.children, beforeCorrection.children);
assert.equal(afterFailedReplacement.release.status, 'staged');
assert.deepEqual(afterFailedReplacement.children, beforeCorrection.children);
assert.deepEqual(afterSuccessfulReplacement.sourceKeys, correctedExpectedSourceKeys);
assert.equal(new Set(afterSuccessfulReplacement.sourceKeys).size,
  afterSuccessfulReplacement.sourceKeys.length);
```

The sourceKeys array uses `(layer, source_feature_id)` composite keys; separately assert each
release/lot/access/boundary uniqueness and node/edge/access FK integrity. For live revalidation,
assert `after.packageDigest === before.packageDigest`, raw file/chunk hashes and binding deep
equality, import state validated, parent staged, changed baselineDependencyDigest and a NEW
operation UUID. These are planned assertions, not tests created or executed in this amendment turn.

STOP C: offline+SQL conformance, deterministic private reports, all-or-nothing finalization and
pilot-only/state-matrix/revalidation/replacement/no-publication tests GREEN; no meaningful hosted
records imported. Recovery: abandon import;
unapproved corrections restage/new revision, approved corrections new release; preserve evidence.

### Task 11 — Phase 7 deployment pass 3: B3 (M06/M07)

Goal/files: deployment checklist + hosted fixture/verification tool updates. Depends C and F2;
produces protected hosted staging/finalization. Hosted: YES after E. No real package publication.

- [ ] Full procedure below, exact pending M06/M07; confirm legacy loader filter runtime again.
- [ ] Hosted disposable fixture validates hashes/raw retention/parser/geometry/topology/finalizer
  and rollback-on-last-object failure with auth roles; always ROLLBACK, record zero leaked fixtures.
- [ ] STOP F3: verify normal history/capabilities/permission predicates; create no real pilot data.

Recovery: disable staging/finalize entrypoint grants by reviewed forward patch if needed; keep
private evidence and NULL legacy data. Do not delete production/import history to regain green tests.

### Task 12 — Phase 5: shared readiness and narrow public/admin reads

Goal/files: M08, `src/lib/supabase/gis-types.ts`, `src/lib/supabase/gis-data.ts`, additive types/
nullable/bigint argument overlay only if needed, `tests/gis-readiness.test.mjs`.
Consumes M05 reachability + M07 validated/frozen snapshots + empty M01 selector. Hosted: NO.

- [ ] Write RED: legacy missing/geometry true/routing false valid; any burial incl soft-deleted
  occupancy equals old rule; removed/reassigned lots lose readiness without snapshot edits.
  S MANAGER gets only readiness; A/provenance denied; anon/inactive denied protected reads.
- [ ] Test approved-but-unpublished and superseded releases never public; safe DTO no raw fields;
  hidden/inactive/deleted burials return null; mapped visible record approved geometry/access only;
  counts equal independent SQL across multiple pages and sizes; release_changed prevents mixed pages.
- [ ] Test staged retained old snapshot produces no geometry/routing readiness or public layer;
  ADMIN release read explicitly marks it non-authoritative, not current corrected validated data.
- [ ] Test wrapper/RPC argument and response preservation of decimal ID `"9007199254740993"`;
  reject invalid/out-of-range IDs and verify no Number conversion along the new read path.
- [ ] Run `node --test tests/gis-readiness.test.mjs`; RED.
- [ ] Implement M08 set-based view/RPCs/explicit projection; implement wrappers and runtime DTO
  decoder accepting existing clients, not importing private evidence into public render paths.
- [ ] Run target/npm test/tsc, EXPLAIN synthetic maximum pilot and page/count queries (no per-row
  subrequest loop), static secret-boundary checks/full validate; no current page consumes new module.
- [ ] If authorized, narrow commit `feat(gis): add consistent readiness and safe map reads`.

Recovery: new contracts remain unused by old pages; restrict new grants by forward patch if needed.
No legacy Dashboard/Plot/Coordinate queries or public-navigation eligibility changes.

### Task 13 — Phase 7 deployment pass 4: B4 (M08)

Goal/files: deployment checklist/fixtures/tool. Consumes Task12 GREEN/F3; produces safe hosted
read contracts with no active pilot. Hosted: YES after E; exact pending M08.

- [ ] Full deployment procedure, including direct role/anon read probes and private-data denial.
- [ ] Empty selector returns safe unmapped/empty payloads; disposable fixture tests visibility/counts
  then ROLLBACK. Existing public search/coordinate review and map runtime still unchanged.
- [ ] STOP F4; readiness/public contracts stay unused by current UI. No real publication yet.

Recovery: old reads unaffected; disable faulty new contract grants, correct via forward migration.

### Task 14 — Phase 6: protected approval, publication and rollback

Goal/files: M09, `tests/gis-publication.test.mjs`, `tests/gis-concurrency.test.mjs`, runbook/types.
Consumes M07 exact validation/digest + M08 selector-safe reads. Hosted: NO. Depends Tasks12/13.

- [ ] RED matrix tests all legal/illegal transitions; direct UPDATE/GUC/helper denies; uniqueness,
  stale revision/ack/hash, rejection terminal, immutable approved and superseded data.
  Exact request retry checked before revision; changing actor/input same UUID fails.
- [ ] Test `full_scope_approve_publish_rollback_denied` at EACH gate/private activation, plus
  pilot extra/missing/wrong-area memberships; no approval/selector/history/audit success effects.
  Test one-area publish/rollback still succeeds, and never-frozen checks prevent correction of
  approved/published/superseded/rejected releases even after attempted metadata clearing.
- [ ] RED publish/rollback tests: first selector revision0->1, replacement supersedes correctly,
  previous bytes unchanged; failed audit/history write rolls back selector/status; rollback requires
  prior approval/publication/same scope, not arbitrary old draft. Recheck live removals/reassignment/
  omissions and warnings. Sanitized audit never contains reason/reading/device/geometry.
- [ ] Real two-session tests: first publication race (no existing selector), replacement race,
  publish vs legacy lot edit, finalization vs restage; deterministic lock order/expected revision
  yields one winner, one controlled conflict, no partial history. PGlite alone is insufficient.
- [ ] Run targeted RED tests; implement M09 with shared activate_release, area-row scope locking,
  exact receipts and live revalidation, frozen contents. Run targeted/npm test + full validate.
- [ ] Document manual explicit approval/publish/rollback examples, reasons, receipts, no CLI auto-publish.
- [ ] If authorized, narrow commit `feat(gis): publish and roll back approved mapping releases`.

Atomicity assertion after the test deliberately fails the final audit/history step:

```js
assert.deepEqual(await readPublicationScope(), beforeFailure.scope);
assert.deepEqual(await readReleaseStates(), beforeFailure.states);
assert.equal(await countPublicationEvents(), beforeFailure.eventCount);
```

STOP D: M01–M09/readiness/publication/rollback reviewed locally with genuine concurrency results;
new UIs still deferred. Recovery: retain previous release and use protected rollback only if eligible;
schema bug requires forward patch. No test publishes meaningful production geometry.

### Task 15 — Phase 7 deployment pass 5: B5 (M09) and final acceptance

Goal/files: deployment checklist, `scripts/gis/verify-hosted.mjs`, `tests/gis-hosted-fixtures.sql`,
operator docs final evidence. Consumes D/F4, produces verified foundation, not a published pilot.
Hosted: YES after E; exact pending M09 only.

- [ ] Full deployment procedure, published-state ACL/matrix/catalog checks, disposable transactional
  ADMIN/MANAGER/inactive/anon tests with frozen snapshots and public-safety assertions.
- [ ] Verify all local/remote migration rows align, object signatures/indexes/RLS/search_path/ACLs,
  unchanged legacy counts/geometry hashes and zero meaningful lot/record writes.
- [ ] Run final full local validation plus required real PG concurrency and read-only hosted probes;
  rollback every fixture. If real concurrency infrastructure is unavailable, report a blocker,
  not readiness for production publication.
- [ ] STOP F: report implemented/deployed/verified facts and deferred gaps. First real QGIS package
  can be received/staged only if all foundation gates are complete; publication still needs package
  field/GIS review and explicit approval. Do not automatically publish sample or real pilot.

Recovery: no reset/history repair; previous snapshots stay retained. Stop traffic to new protected
entrypoints with a reviewed forward ACL change for security failures; keep old maps operational.

## Checkpoint gates and rollback boundaries

| Gate | Required tests / expected state | Untouched / recovery |
| --- | --- | --- |
| A after Task3 | Evidence/role/metric tests + npm test; M01–M03 local replay, no geometry/import/publish | All legacy UI/data; preserve evidence, forward fix/restrict new writes |
| B after Task6 | Polygon/graph/RLS/audit tests; M04/M05 local, no release backfill | Old geometry/maps; preserve NULL legacy rows and new audit protection |
| C after Task10 | Parser conformance, pilot gates, complete import matrix, same-byte live revalidation, retained-snapshot replacement/failure/retry/races; M06/M07 local atomic | Hosted real records; failed imports remain private, no publish |
| D after Task14 | Read/count/permission + full-scope rejection/publication/rollback/concurrency; M08/M09 local | Existing public gates/UI; eligible one-area pointer rollback, forward schema fix |
| E before EVERY batch | Full validation, exact pending allowlist, target/history/catalog review and approved release authority | No actual push before gate; stop on drift, never repair history blindly |
| F1/F2/F3/F4/F after batch | Hosted catalog/grant/RLS/history + rollback fixtures + unchanged operational evidence | No pilot authority until explicit publish; no DROP/reset/destructive downs |

Do not continue automatically past STOP/REVIEW checkpoints. User chooses continuation after results.
Local-only development instead of staggered deployment is possible only if explicitly selected:
it does NOT authorize one all-pending hosted push later; review/re-plan batch selection before release.

## Phase 7 procedure used for EVERY deployment batch

Files: checklist/verification script/fixtures. Scripts initially use existing authenticated Supabase
Management API/CLI for read-only catalog queries; mutation fixtures run only through a reviewed
transactional SQL harness. Credentials never written to reports, source or command line.

1. Verify exact checkout/branch/dirty allowlist, current target project `ddoowghocqyfoxaikifb`,
   known last deployed versions and owner/extension capability. Identify mismatches; no edits yet.
2. Run local targeted tests, `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`,
   `npm run validate`, `git diff --check`. Record commands/exit codes; every migration replays
   from empty disposable DB AND from prior batch cutoff. Failures block deployment.
3. Verify real PostgreSQL concurrency tests where required. Requires an explicitly configured
   DISPOSABLE PostgreSQL target and two physical connections; existing PGlite is not substituted.
   Prefer installed psql/driver; if neither exists, obtain approved dev-only driver/tooling, do
   not casually add a runtime npm dependency. Tests skip explicitly when unavailable and block D/E.
4. Use established authenticated CLI: `npx supabase migration list --linked`, catalog SELECTs,
   `npx supabase db push --linked --dry-run`. Compare pending versions AND file SHA-256 hashes
   to the batch allowlist recorded at task creation. No --include-all/--include-seed/--include-roles.
5. STOP E for review/approval. Never request passwords/OTP/service keys in chat. Narrow sandbox
   escalation only for established CLI access; no fallback manual SQL deployment/history repair.
6. Deploy `npx supabase db push --linked` only after the exact dry-run matches; future batch
   files must NOT yet exist locally. If CLI fails partway, check applied history/catalog first;
   each migration has explicit transaction boundaries, batch is NOT claimed all-or-nothing.
7. `npx supabase migration list --linked`; verify intended entries in
   supabase_migrations.schema_migrations, signatures/proconfig/proacl, RLS policies, indexes,
   constraints/triggers, absence of pgRouting, unchanged legacy behavior. Version parity is not
   sufficient by itself; inspect objects and content hashes where practical.
8. Read probes with real public key/normal ADMIN session where available; negative MANAGER/
   inactive/anonymous checks in disposable Auth identities or reviewed transaction role simulation.
   Label simulated roles separately from actual hosted Auth JWT tests. Do not treat owner SQL
   execution of an RPC as proof of authentication enforcement.
9. Hosted SQL fixture harness: BEGIN, isolated fictional site/area/lot graph IDs, controlled
   account/JWT claims using existing test identity or transactional disposable auth/account rows,
   SET LOCAL ROLE authenticated/anon; assert, RESET ROLE, ALWAYS ROLLBACK. Names/coordinates
   unmistakably synthetic. Inspect external DB hooks first; if disposable auth inserts would
   trigger external effects, use an existing authorized test identity or disposable preproduction
   project, never assume transaction rollback reverses external hooks. No existing account,
   lot, burial or GIS snapshot changes. Identity
   sequence advances may survive rollback; never reset sequences or claim zero database effects
   beyond zero persisted fixture rows. Compare fixture namespace counts before/after.
10. Record F evidence/failures/limitations; STOP before next batch/migration creation. No automatic
    schema DROP/down/reset. Recovery prefers disabling only new endpoints and forward patches.

### Batch allowlists and exact interleaving

| Batch | Migration symbols | Earliest deployment task | Entry gate |
| --- | --- | --- | --- |
| B1 | M01, M02, M03 | 4 | A then E1 |
| B2 | M04, M05 | 7 | B then E2; compatibility smoke after columns exist |
| B3 | M06, M07 | 11 | C + verified effective legacy isolation F2, then E3 |
| B4 | M08 | 13 | Task12 GREEN then E4 |
| B5 | M09 | 15 | D then E5 |

Do not create M04 before F1, M06 before F2, M08 before F3 or M09 before F4 in the recommended
incremental execution. After each batch no unrelated pending migrations remain. This avoids
inventing a CLI --only flag, moving/deleting migrations, or editing history to force selective push.

## Spec coverage/self-review map

| Approved specification sections | Tasks/contracts implementing them |
| --- | --- |
| 1–3 intent/current compatibility/approach | Globals, file manifest, Tasks1/7/15 |
| 4 lifecycle/scope | M01/M06/M07/M09, Tasks1/9/10/14 |
| 5 field evidence | M02/Task2 |
| 6 georeferencing/working metric | M03/Task3 |
| 7 versioned identities/geometries | M04/M05, Tasks5/6 |
| 8 graph/legacy isolation | M05, Tasks6/7 |
| 9 shared readiness and safe reads | M08/Task12 |
| 10 package/transport safety | Tasks8/9 and fixed limits/digest/allowlists |
| 11 staging/dry-run/materialization | M06/M07, Tasks9/10 |
| 12 authorization/privacy/audit | Access profiles + every same-migration security clause; Tasks1/6/14 |
| 13 additive deployment | Nine migration catalog entries + five batches + Tasks4/7/11/13/15 |
| 14 test acceptance | Every task RED/GREEN tests + genuine concurrency + hosted role probes |
| 15 completion/deferred | Task15/F + summary below |
| 16 references | Technical references below; no source replaces field methodology |

Self-review checks: all public/private symbols have an owner task/migration; lifecycle and import
states are distinct; parameter p_expected_revision means release revision for import calls, not
chunk sequence; batch ordering leaves no future pending files; no legacy runtime uses absent
columns; full validation precedes GIS materialization; publication is separately authorized;
public pages cannot mix releases; approved snapshot corrections never reuse old geometry rows.
Required clarifications are traced through M01/M06/M07/M09 and Tasks1/9/10/14 for pilot-only
scope; M04/M05/M06/M07, Tasks6/9/10/12 and C for retained-snapshot atomic replacement; and
M06/M07, Task10/C for the complete import matrix, immutable bytes and live-only revalidation.
No migration/task/batch/table count changed. Sequential execution method and STOP gates match
the user's approval; no dependent implementation or deployment batch runs concurrently.

## Execution summary and handoff

1. **Seven logical phases:** release/field; georeferencing; geometry/graph; package/import;
   readiness/reads; publication/rollback; repeated deployment/hosted verification.
2. **Five proposed deployment batches, nine small additive migrations.** No timestamps chosen.
3. **Twenty new tables:** mapping_release, mapping_release_area, mapping_publication,
   mapping_publication_event; private gis_mutation_request; survey_point/capture/observation;
   georeferencing_run/run_point/validation; mapping_boundary, plot_geometry, mapping_walkway_source,
   grave_access_point, mapping_display_feature; mapping_import/file/chunk/report.
4. **Two modified legacy tables:** map_node and map_edge. Existing audit_safe_row gains narrowly
   scoped release-row redaction. No lot/site/area/business-record columns or contents changed.
5. **Expected read/RPC contracts:** M01 release creation/rejection; M02 point/capture/review;
   M03 run save/review; M06 begin/chunk/seal/abandon/status; M07 validate/finalize; M08 four
   staff/public reads; M09 review/publish/rollback. Private medians, validation summaries, graph
   reachability, request receipts, guards and audit routines are not public RPCs.
6. **Tools:** offline validator, bounded resumable authenticated import CLI, read-only hosted
   verifier, disposable fixtures/concurrency runner, package and operator/deployment documentation.
7. **Major risks:** direct-write bypasses/permissive old RLS; legacy audit leakage; JS/SQL duplicate
   parser and exact-byte digest divergence; stale live lot links; graph noding/direction errors;
   runtime loader deploy order; real-PG lock races vs WASM tests; imported freeform label privacy;
   accidental all-pending db push; absence of genuine pilot evidence/capacity beyond v1 limits.
   A valid first pilot must resolve 20–50 existing operational lot IDs: the spec's earlier three
   hosted lots are not sufficient by themselves. Any genuine inventory onboarding uses ordinary
   separately authorized business workflows, not invented GIS-migration seed records.
8. **Exact implementation order:** Tasks1–3 -> A -> Task4(B1/E/F1) -> Tasks5–6 -> B ->
   Task7(B2/E/F2 + runtime compatibility) -> Tasks8–10 -> C -> Task11(B3/E/F3) ->
   Task12 -> Task13(B4/E/F4) -> Task14 -> D -> Task15(B5/E/F).
9. **First executable task on the user's next continuation:** Task1 baseline/isolation check, then
   failing lifecycle/security tests BEFORE allocating or writing M01.
10. **Admin Map, Visitor Map, routing UI, pgRouting, field UI and full-cemetery imports remain
    deferred.** Only required legacy query isolation is in scope; no UI redesign or route change.

Current status: required amendments incorporated and self-consistency checked; the plan is ready
for Task1 on the user's next instruction. Approved method: strictly sequential subagent-driven
development with explicit checkpoint reviews. No code/migrations/hosted schema/production data
changed by these amendments; Task1 has NOT begun and no first-pilot reception readiness is claimed.

## Technical references checked for planning

- Normal Supabase push/dry-run/history semantics: https://supabase.com/docs/reference/cli/supabase-db-push
- Interior intersection and spatial-index candidate filter: https://postgis.net/docs/ST_Relate.html
- PostgreSQL native byte hashing: https://www.postgresql.org/docs/current/functions-binarystring.html
- Recursive UNION reachability: https://www.postgresql.org/docs/current/queries-with.html

The approved spec and user's field plan remain the authority. No hosted inspection was performed
for this planning turn; the deployment gates refresh all environment-sensitive evidence.
