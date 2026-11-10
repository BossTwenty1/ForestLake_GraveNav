# GraveNav GIS schema foundation and pilot import contract

Status: approved architecture reference, originally dated 28 September 2026.
Updated context, 9 November 2026: the GIS foundation and Phase 2 geographic adapter are implemented locally. Inspect the actual migrations and source for current behavior; a hosted target's present state requires separate authorized inspection.

Use the [current operational handoff](../../phase2-local-defense.md) for full Phase 2 map / Section D data coverage and remaining field gates. The implementation plan is [archived](../../archive/2026-09-28/gis-foundation-implementation-plan.md) and must not restart completed work. Development-stage labels such as Phase 1/2 in this design do not define cemetery section coverage.

The original design below preserves its architectural decisions and dated observations. Its rollout boundaries and historical statements describe that earlier task, not the current product's completion state.

## 1. Intent and non-negotiable boundaries

Implement the approved mapping architecture audit using the confirmed field method:

- Target 12–15 fitting GCPs and 3–5 independent validation points.
- Capture five fresh readings per point/session; retain every reading, including poor readings.
- Store latitude, longitude, reported horizontal accuracy, timestamp, and order.
- Derive median latitude/longitude, count, average accuracy, and best accuracy from observations.
- Field CRS is EPSG:4326 / WGS84; QGIS working CRS is EPSG:32651 / WGS84 UTM 51N.
- Plot polygons are digitized georeferenced plan geometry, not smartphone measurements of graves.
- Routes eventually end at explicit access points on reviewed walkable networks.
- Independent validation never contributes to fitting. No survey-grade accuracy claims.

The first deliverable is an additive foundation that can safely receive and review ONE pilot
garden's application package. Importing does not publish it. Publishing makes a new contract
authoritative for its scope, but existing map clients remain on legacy contracts until a later
approved frontend phase explicitly adopts it.

Do not redesign map UIs, add pgRouting, change authentication, create graves from names,
alter production burial/ownership records, fill the three hosted plots with invented coordinates,
delete omitted plots, remove static assets, or replace current coordinate/routing behavior.

## 2. Historical evidence captured before this design

Checkout: `C:\Users\Nash\Documents\gravenav`, branch `feature/frontend-improvements`.
Hosted project: `ddoowghocqyfoxaikifb`. Existing dirty changes belong to earlier phases.

Local migrations and hosted catalog both confirm:

| Existing table | Relevant actual columns | Reuse |
| --- | --- | --- |
| `site` | `site_id`, `boundary_geom geography(Polygon,4326)`, `geo_transform_json` | Cemetery identity; retain legacy boundary/transform |
| `area` | `area_id`, `site_id`, `area_code`, `boundary_geom geography(Polygon,4326)` | Garden identity and existing site relationship |
| `lot` | `lot_id`, `area_id NOT NULL`, optional `block_id`, `location_geom geography(Point,4326)`, `coordinate_status`, `coordinate_verified`, `deleted_at`, `revision` | Sole grave-plot identity; retain coordinate workflow |
| `map_node` | `node_id`, `site_id`, `node_name`, `node_type`, `location_geom geography(Point,4326)` | Existing node entity, extended for release membership |
| `map_edge` | `edge_id`, `from_node_id`, `to_node_id`, `path_geom geography(LineString,4326)`, `distance_m`, `edge_type`, `is_restricted` | Existing edge entity, extended for release membership |
| `account`, `role` | Auth UUID identity, active/status flags, ADMIN/MANAGER role | Existing role helpers and actor references |
| `audit_log` | `actor_account_id`, `action`, `table_name`, `record_id`, `old_values`, `new_values` | Sanitized lifecycle evidence using supported action values |

Hosted inventory: 1 site, 4 areas, 3 current lots, all 3 without legacy coordinates,
41 route nodes, 18 route edges. No new survey/mapping/georeferencing tables exist yet.
Migration history matches for all 17 local versions through `20260928150000`.

Hosted helpers `is_active_admin()` and `is_active_admin_or_manager()` remain SECURITY DEFINER
with pinned paths. `validate_lot_coordinate_in_area()` is SECURITY INVOKER and validates
legacy lot points against `area.boundary_geom`; do not apply it to access points.
Existing route-table RLS allows active ADMIN/MANAGER operations. This is insufficient to
protect published GIS snapshots unless release-aware restrictions are added.

The existing test suite passes 35/35 as a baseline. This is not GIS-foundation verification.

## 3. Approach and alternatives

Recommended: normalized field/run evidence, immutable release snapshots, staging validation,
and explicit atomic publication. Extend route entities and add only a small legacy-loader
isolation filter. Keep versioned boundaries separate from legacy `site`/`area` boundaries.

Rejected alternatives:

1. Overwrite legacy geometry on import. Fewer tables, but changes working maps before approval,
   loses rollback evidence, and risks existing lot containment rules.
2. Create an unrelated second graph with no connection to `map_node`/`map_edge`. Easier isolation,
   but creates competing graph contracts and ignores the approved reuse requirement.

Release snapshots reuse the existing graph tables and entity definitions. A source node/edge
gets a separate row in each release; `(release_id, source_feature_id)` is the stable import key.
Historic node/edge IDs are never overwritten to represent a later release's geometry.

## 4. Publication scope and lifecycle

`mapping_release` uses a UUID `release_id`; existing IDs remain bigint. Fields:

- `site_id`, `release_code`, title, description, `scope_kind` (`pilot`/`full`).
- `pilot_area_id` for pilot; relation `mapping_release_area` records all applicable areas.
- `status`: `draft`, `staged`, `validated`, `approved`, `published`, `superseded`, `rejected`.
- Package reference/SHA-256, source-plan reference/version/SHA-256, source coordinate-space
  description, `field_srid=4326`, `working_srid=32651`, `published_srid=4326`, QGIS version.
- Revision, created/staged/validated/reviewed/published timestamps, actor account references,
  selected georeferencing run, validation report reference/hash, private notes.

Enforce `UNIQUE(site_id, release_code)` in the database; release codes cannot identify two
different releases for the same cemetery.

Package/source checksums are 64 lowercase hexadecimal characters. Raster pixel space has a
description, not a fictitious EPSG identifier. QGIS project files remain external artifacts.

Pilot v1 accepts exactly one existing area and a complete package for its explicitly declared
20–50-lot pilot set, not every operational lot physically located inside that garden. Operational
lots outside the declared set remain valid but GIS-unmapped. Later releases for the same area
must protect already published mapped coverage through the omission/acknowledgement rules in
Section 11. `full` is reserved for later multi-area imports, not accepted by this phase's importer.
Nearby entrance/network features may be outside the pilot garden but within the release's
cemetery boundary.

`mapping_publication` has a unique `(site_id, area_id)` scope key, the current `release_id`,
revision, actor, and activation timestamp. It is the authoritative active-release selector.
`mapping_publication_event` is append-only activation/rollback history with prior/new releases,
reason, actor, request UUID, and timestamps. No publication row exists before explicit publish.

Lifecycle:

`draft -> staged -> validated -> approved -> published -> superseded`

The lifecycle is a database-enforced state machine, not an editable status field. Ordinary
direct table writes cannot change status, including writes by authenticated administrators.
Protected lifecycle RPCs/functions are the only application transition path; each checks active
ADMIN authorization, current state, expected revision, and operation-specific prerequisites.
Database constraints/guards enforce the allowed transitions and immutable-content rules;
revoked direct writes and non-callable private helpers prevent bypassing lifecycle entry points.
Illegal skipping and every unlisted transition are rejected.

| Current state | Next state | Allowed operation and prerequisites |
| --- | --- | --- |
| `draft` | `staged` | Complete bounded ingestion is sealed against its manifest/digest; private validation reports may still contain errors |
| `staged` | `staged` | Intentional protected restage; increment revision and invalidate the prior validation/report acceptance |
| `staged` | `validated` | Complete package passes required semantic/PostGIS checks; transactionally materialize the snapshot and record validation |
| `validated` | `staged` | Protected restage for a correction before approval; increment revision and invalidate the old validation and unapproved GIS snapshot |
| `validated` | `approved` | Review the exact revision/digest, evidence, measured validation results, features, warnings and required acknowledgements |
| `approved` | `published` | Protected publish atomically activates the scope selector and records publication/history/audit after rechecking prerequisites |
| `published` | `superseded` | Only as part of an atomic protected replacement or rollback activating another eligible release for the same scope |
| `draft`, `staged`, `validated`, `approved` | `rejected` | Protected rejection with a reason; retain evidence and any immutable approved snapshot, without publication |
| `superseded` | `published` | Protected rollback/reactivation only; require prior approval/publication evidence and recheck eligibility for the same scope |

The additional `validated -> staged` transition is necessary to correct an already validated
but not yet approved import without falsely retaining its earlier validation. Restaging from
`approved`, `published`, `superseded`, or `rejected` is forbidden. Rejected is terminal;
corrections require a new release. Initial creation uses `draft` through a protected operation.

Staging validation failure leaves the complete release staged with a report and no operational
GIS rows; it does not fabricate validation or approval. Approved/published GIS content remains
immutable, including after supersession or rejection. Corrections after approval require a new
release. Rollback changes selection/lifecycle metadata only, never historical GIS contents of
either release. It reactivates a previously approved/published snapshot through the protected
rollback operation, moves the current release to superseded, and appends history.

For pilot v1 only one release is active/published per area. Concurrent publications lock the
scope row (including creation of its lockable scope identity), validate expected revision,
and commit publication/history/audit in one transaction. The prior snapshot is retained.

## 5. Field evidence and reproducible position

`survey_point`:

- UUID identity, site, stable `point_code` unique within site.
- Immutable role `GCP` or `VALIDATION`, feature description, private notes, source-plan reference.
- Active/review state and created actor/time. Retirement does not delete captures.
- Changing a point's purpose requires a new point identity with an explicit relationship;
  validation identities cannot be relabeled as GCPs to bypass separation.

`survey_capture`:

- UUID identity, survey point/site, stable session code unique per point.
- Session start/end, device/model description, operator account or controlled external reference.
- Private notes, `remeasures_capture_id`, review state, `remeasure_required`, review reason.
- Remeasure parent must be an older capture of the same point/site; reject cycles.

`survey_observation`:

- UUID identity, capture, observation order, finite latitude/longitude, finite nonnegative
  reported horizontal accuracy, captured timestamp, optional private notes.
- Unique order per capture; every valid raw reading remains part of the representative calculation.
- No statistical pruning or deletion. Incomplete sessions remain visible.
- Updates/deletes are disallowed through application roles. A correction is a new capture.
- Malformed source readings are retained in immutable staging evidence with explicit errors;
  invalid values are not silently coerced into valid geographic observations.

Private `survey_capture_summary` read model derives `percentile_cont(0.5)` independently for
latitude and longitude, `count(*)`, `avg(reported_accuracy_m)`, `min(reported_accuracy_m)`, and
representative Point(4326). Zero readings produces null position, not `(0,0)`.
Five is the expected procedure, not a maximum: all additional raw readings are retained.

Protocol flags identify count other than five, repeated/non-increasing reading timestamps,
observations outside session bounds, required remeasurement, and unrevised review state.
Poor reported accuracy is evidence, not an invented pass/fail threshold. Capture review must
acknowledge deviations; medians never become a survey-grade certification.

Accepted captures referenced by a run are immutable; adding later readings to them is blocked.
This prevents independent validation errors and fitting coordinates changing after approval.

## 6. Georeferencing attempts and independent validation

`georeferencing_run` links a release/site to a reproducible attempt:

- Source raster/plan reference/SHA-256, optional raster width/height, source coordinate space.
- Working/output SRIDs, transformation method and bounded processing parameters.
- Processing timestamp, QGIS version, operator/reviewer, output artifact reference/SHA-256.
- Review state, notes, revision. Multiple attempts may exist; a release explicitly selects one.

`georeferencing_run_point` links run to exact accepted capture/point/site, source pixel x/y,
and role `FITTING` or `VALIDATION`. Constraints/triggers enforce:

- FITTING requires survey role GCP; VALIDATION requires survey role VALIDATION.
- One point appears once per run and cannot participate in both roles.
- Capture/point/run/release site identities agree; source pixels are finite and within known
  dimensions where dimensions exist. No implicit promotion of validation points to fitting.
- Referenced captures and role memberships freeze with run approval.
- Fitting residuals, if retained, use separately named fields and do not enter validation summaries.

`georeferencing_validation` links only a VALIDATION run point to a transformed plan/map
Point(4326), review state, and notes. The observed reference position comes from its frozen
capture summary, never a manually retyped coordinate. Preserve both original EPSG:4326 input
positions in the stored evidence/read output.

Canonical independent validation error is the planar metric distance after actually transforming
both original Point(4326) geometries into that run's validated metric `working_srid`:

```text
observed representative Point(4326) -> ST_Transform(..., georeferencing_run.working_srid)
transformed plan Point(4326)        -> ST_Transform(..., georeferencing_run.working_srid)
                                  -> geometry ST_Distance -> validation_error_m
```

For the Forest Lake pilot require `georeferencing_run.working_srid = 32651`. The calculation
consumes the validated run field, not a permanently hard-coded SRID; the working CRS must be
a supported projected CRS with meter units. Failed/missing CRS validation or transformation
is an explicit error, not a fallback to degrees or geography distance. The official individual
`validation_error_m` and every run mean/median/maximum error use this same working-CRS metric.
A separately named geography-distance cross-check may be retained/tested, but never substitutes
for the canonical QGIS/working-CRS error or enters its summary aggregates.

`georeferencing_validation_summary` returns measured point count, mean/median/maximum error,
missing-results count, and expected validation-point count. No results means null error values.
Its error aggregates are computed solely from the canonical working-CRS `validation_error_m`.
The target counts (12–15 GCPs, 3–5 validation points) are protocol flags, not fabricated accuracy
thresholds. A run cannot be approved with absent independent results; nonstandard counts or
capture deviations require an explicit review acknowledgement. Publication requires a reviewed
measured summary and a documented suitability decision, without hard-coded meter thresholds.

## 7. Versioned GIS objects and identity integrity

Every GIS object includes release, stable source feature ID, provenance (artifact/layer/version),
review state, imported/created timestamps, and bounded private review notes. Unique source
IDs are scoped to release/layer. Reject unsupported geometry rather than silently repairing it.

New structures:

| Structure | Geometry | Relationships/purpose |
| --- | --- | --- |
| `mapping_boundary` | geometry(Polygon,4326) | Versioned cemetery or area boundary linked to existing site/area; never overwrite legacy boundaries |
| `plot_geometry` | geometry(Polygon,4326) | One polygon per existing `lot_id` per release; no competing grave identity |
| `grave_access_point` | geometry(Point,4326) | One primary destination per lot/release, matching a node of that release/site |
| `mapping_display_feature` | Point or Polygon, SRID 4326 | Landmark/building/entrance display feature; optional same-release node reference |
| `mapping_walkway_source` | geometry(LineString,4326) | Original road/walkway lineage; network edges explicitly reference these digitized features |

Plot identity resolves through `lot_id`, with matching existing `area_id` and `site_id`.
Reject unknown/soft-deleted lots and wrong-section identities; do not match names or proximity.
Plots must be valid, nonempty, two-dimensional and covered by their versioned section boundary.
Positive-area interior intersections are overlap errors, including duplicate/contained polygons;
shared edges/vertices alone are not errors. Use spatial index candidate filtering and an interior
relationship/intersection test, not `ST_Intersects` alone or `ST_Overlaps` alone.

Access points may be beside the garden/plot. Require matching lot/release/site and a reviewed
same-release route node at the same geographic position, but no plot/garden containment rule.
Pilot v1 uses explicit exported nodes at access points. A real approach path is a digitized edge,
not an automatically invented nearest-node connector. Require access within the cemetery's
versioned boundary and entrance reachability through approved walking edges.

New geometry is stored as EPSG:4326. QGIS exports v1 GeoJSON in WGS84 longitude/latitude
order. Import rejects projected GeoJSON and legacy CRS members; it does not guess the CRS.
EPSG:32651 source artifacts are retained as provenance and actually reprojected in QGIS before
export. `ST_SetSRID` only describes correctly identified coordinates; it is not reprojection.

## 8. Extend and protect the existing graph

Add nullable `mapping_release_id`, stable source feature ID, lineage/provenance, review state,
and imported time to `map_node`. Release nodes require geographic position and source identity;
legacy nodes keep null release membership and their existing constraints/behavior.
Use existing `entrance`, `junction`, `landmark` node types for pilot nodes. Access endpoints can
be junctions; visual-only landmarks live in the display table.

Extend `map_edge` with nullable release/site/source membership, walking eligibility, review,
source walkway reference, direction (`both`, `forward`, `reverse`), and forward/reverse metric
costs. Release edges require positive derived distance/cost, nonempty valid lines, distinct nodes,
and required lineage. Disallowed directions have no usable traversal cost. Legacy values remain.

Composite foreign keys/checks enforce node, edge, release, and site agreement; no release edge
may reference a legacy node or another release's node. Versioned edge endpoints must equal
the referenced node positions. Export properly noded QGIS lines; no hidden snapping on import.
Calculate release distance/cost from real geometry in the working metric CRS, never pixels.

Connectivity validation uses bounded recursive SQL for the pilot, not pgRouting. Follow approved,
walkable, unrestricted edges in permitted directions from approved entrance nodes. Report isolated
and disconnected walkable components, un-noded crossings, endpoint mismatches, orphan access
points, and destinations unreachable from an entrance. Visual landmarks need not be connected.
Geometry-crossing paths through plot interiors are conflicts requiring correction, not shortcuts.

Add indexed release/site/source keys and spatial GiST indexes for new geometry.

Release-aware RLS/triggers restrict authenticated graph writes to existing legacy rows only.
Release graph mutations are controlled administrator RPCs; published snapshots are immutable.
Guard both old and new membership to prevent turning a release row into a writable legacy row.
Base-table SELECT permits legacy rows under existing staff rules and release rows for active
ADMIN only. Managers use the sanitized readiness contract, not staged graph provenance/notes.
Do not weaken current legacy ADMIN/MANAGER permissions.

Necessary minimal compatibility edit, with no UI change: in `src/lib/phase1-map-data.ts`, restrict
both hosted node and edge queries to `mapping_release_id IS NULL`. Add the column to the existing
database types. This is necessary because current queries would otherwise include unpublished
rows; it is not an excuse to change map layout, coordinate eligibility, or routing.

## 9. One shared readiness definition, separate read surfaces

Internal shared read model calculates four independent concepts for current lots:

1. Occupancy: existing rule—any burial relationship reserves a lot, including recoverable
   soft-deleted burial records; otherwise BOOKED/HOLD/AVAILABLE follows stored lot status.
2. Legacy coordinate review: existing missing/pending/verified/rejected logic; no GIS inference.
3. Geometry readiness: approved valid polygon in the currently selected published area release.
4. Routing readiness: geometry-ready lot, approved access/node, and approved directed reachable
   walkable network in that same published release. No legacy-coordinate prerequisite.

`legacy=missing, geometry_ready=true, routing_ready=false` is an explicitly valid result.
Use reason codes such as `no_published_release`, `no_approved_polygon`, `no_access_point`,
`unreviewed_access_point`, `unreachable`, and `lot_removed`. No module invents its own readiness.

Proposed bounded read RPCs:

- `staff_gis_readiness(site_id, area_id, page, page_size)` for active staff; page size 1–50,
  stable lot-ID order, counts independent of page size, no N+1 queries.
- `staff_mapping_release(release_id, layer, page, page_size)` for active ADMIN; includes private
  review/provenance data but does not automatically return raw readings/device/operator notes.
- `public_mapping_layer(site_id, area_id, layer, page, page_size)` allowlisted safe published
  geometry/network/labels only, capped page size 200 and stable source-ID order.
- `public_burial_gis(burial_id)` joins existing active/public-visible, non-deleted burial/lot
  visibility rules to approved GIS polygon/access/readiness. Do not expose occupancy/owner data.

Public contracts contain no unpublished release, raw observations, private source-package paths,
internal review/rejection notes, actor/device data, or inferred hidden burial relationships.
They do not switch the current visitor search/navigation eligibility contract in this phase.

## 10. Pilot application package v1

Developer/admin controlled CLI/package import; no upload or import UI in this phase.
Package is a directory, not an archive processed on the server. Require:

```text
manifest.json
cemetery_boundary.geojson
garden_sections.geojson
roads_walkways.geojson
grave_plots.geojson
grave_access_points.geojson
route_nodes.geojson
route_edges.geojson
landmarks.geojson
survey_points.json
survey_captures.json
survey_observations.json
georeferencing_runs.json
georeferencing_run_points.json
georeferencing_validation.json
```

Empty landmarks is a valid FeatureCollection. One cemetery/section boundary is required.
Field/run files can refer to already stored evidence by stable identity, but a new package must
resolve all references; missing evidence is not replaced with invented measurements.

Manifest fields: `schema_version=1`, site ID, pilot area ID, release code/title/description,
source plan version/reference/SHA-256, package/export identity, export time, QGIS version,
field/working/export CRS, selected run identity, layer versions/counts, file SHA-256 hashes,
pilot included lot IDs, provenance notes, declared review limitations.

GeoJSON features use explicit stable `source_feature_id`, `site_id`, and relevant existing
`area_id`/`lot_id`. Edges reference node source IDs and road/walkway source ID, not staging
database surrogate IDs. Access points reference lot ID and node source ID. Display labels are
allowlisted mapping text; no deceased names, owner information, freeform private notes, or GPS
operator/device data in public GeoJSON properties.

SHA-256 checks use exact file bytes. Package digest is derived from manifest bytes and sorted
declared file hashes; the manifest does not recursively hash itself. Reject undeclared files,
duplicate JSON keys, duplicate layer/source IDs, path traversal, symlinks, nonfinite values,
unknown public properties, and mismatched checksums/counts. No arbitrary SQL or external fetch.

Initial technical bounds: total package 8 MiB; 50 plots/access points; 200 route nodes;
400 route edges; 200 road/walkway features; 100 display features; 200 survey points;
1,000 captures; 20,000 observations; 20 runs; 4,000 run memberships/results; 50,000 total
geometry vertices. These are payload safety limits, not accuracy thresholds. Export larger
packages only after a separately approved capacity change; never silently truncate evidence.

The 8 MiB limit is a total-package validation/capacity bound, NOT a requirement to serialize
the whole package into one HTTP/PostgREST RPC request. A bounded staged-ingestion protocol
may split manifest/layer/evidence files into smaller payloads as described in Section 11.
The planner must specify strict per-file, per-layer and per-request/chunk byte/count bounds
within the unchanged aggregate limits. The 8 MiB package bound counts exact package file bytes,
including the manifest, not HTTP/JSON/base64 envelopes; per-request bounds account separately
for transport overhead. Splitting transport never expands the package limit or relaxes
validation/privacy/identity requirements.

## 11. Staging, dry-run, and review

`mapping_import` records request UUID, release/revision, package digest, importer, timestamps,
state, immutable bounded raw package evidence and deterministic structured validation report.
All pieces are bound to exactly one import identity, one request UUID, one package digest and
one intended release/revision. Raw files/chunks and any typed staging data remain private,
non-operational evidence. No operational GIS rows are produced until the COMPLETE staged
package passes all required syntactic/semantic/PostGIS validation. Invalid staging attempts
retain bounded source evidence and actionable reports without partial materialization.

Each ingestion operation is idempotent: repeating the same import/file/chunk identity with
identical bytes returns the existing result and does not duplicate data or counts. Different
bytes, digest, scope or intended revision on the same retry identity are a conflict, not an
overwrite. Restaging uses the protected lifecycle operation and new intended revision, retains
earlier import evidence, and invalidates prior validation. After deduplicating identical retries,
reject missing or conflicting/overlapping chunk definitions, undeclared files/layers, mismatched
assembled hashes/counts and capacity violations. Identical retried chunks are not duplicate errors.
Hash reconstructed exact file bytes, not parsed/reserialized JSON or transport envelopes;
package digest semantics in Section 10 remain deterministic and independent of chunk boundaries.

Workflow:

1. Local package validation/checksums/privacy allowlists; print report without DB mutation.
2. Protected begin-import operation creates/obtains the import/request UUID bound to the digest
   and intended release/revision (a new draft or a pending pre-approval restage); stage the
   manifest and bounded layer/evidence payloads.
   Enforce authorization, retry identity, package/file/layer/chunk bounds for every operation.
3. Seal complete ingestion: reconstruct files, verify every declared hash/count and complete
   manifest membership, and transition `draft -> staged` (or intentionally restage with a revision
   increment). Run complete semantic/PostGIS dry-run validation on private staging evidence.
   Failures retain reports/evidence; they do not produce operational GIS rows or publication.
4. Review additions/updates/unchanged against the current published scope (or legacy baseline
   where safely identity-resolved), conflicts, invalid geometry, unresolved lot IDs, missing
   relationships, disconnected elements, count/protocol warnings, and source omissions.
5. Protected finalization rechecks the complete package and expected revision under locks.
   Only when required validation passes, atomically materialize ALL release GIS objects and
   transition `staged -> validated`, with validation evidence/audit in the same transaction.
   Failure rolls back all materialization; recording an invalid-attempt report remains private.
6. Review evidence/feature states, measured results, warnings and acknowledgements; approve
   the exact immutable revision/digest through `validated -> approved`.
7. A separate explicit publish RPC reruns authoritative checks under locks and atomically
   activates the selector/history/audit through `approved -> published`.

This sequence is an allowed transport design, not a mandated RPC signature or one-request
upload. An equivalent implementation must preserve every identity, bound, validation, retry,
transaction and separate-publication guarantee above. Finalization never implies publication.

Errors block approval/publication: missing required files, wrong CRS/type/invalid geometry,
duplicate IDs, unknown/wrong-site/removed lots, section mismatch, unintended overlaps,
cross-release graph references, wrong edge endpoints, un-noded intersections, missing lineage,
orphan/unreachable required access points, absent independent validation, and privacy violations.
Walking topology requires reviewed eligibility, directions, barriers/restrictions; no auto-connect.
Warnings report procedural count deviations and omissions with explicit reviewer acknowledgement.
Omitted production lots are never deleted, reassigned, soft-deleted, or changed. A release is an
explicitly declared pilot-set snapshot within an area, not a requirement to map every operational
lot in that garden. Compare prior mapped lot coverage for the same area and block accidental
loss of prior coverage until acknowledged as an intentional GIS omission with a reason. Operational lots
outside the declared pilot IDs remain valid but GIS-unmapped, not falsely ready. These omission
protections also apply when a later pilot release declares a different lot set for the same area.

Report entries include code/severity/layer/source ID/lot ID and actionable explanation. Report
summary includes additions, updates, unchanged, omissions, conflicts, invalid geometry,
unresolved IDs, disconnected graph objects, warnings, revision, and package digest.

Changes to staged geometry/evidence or validation-relevant review inputs before approval use
protected restaging, increment revision and invalidate prior validation; validated snapshots
return to staged under the exact transition in Section 4. Approved snapshots cannot mutate or
restage; corrections require a new release. At publish, recheck live lot/site/area relationships
and deletion state to prevent stale staging results. Publication does not write `lot`, `burial_record`, legacy boundaries,
legacy nodes/edges, or raw field measurements.

## 12. Authorization, privacy, and audit

All new base tables have RLS; PUBLIC/anon table access is revoked. Application direct writes
are revoked even for authenticated admins; controlled mutation functions do the authorized work.
Evidence/import/georeferencing details are ADMIN-only. Managers may use the shared operational
readiness read contract and legacy permissions, but cannot import, approve, publish, or roll back.
Inactive staff/anonymous requests fail authorization before protected data access.

Mutation RPCs require `is_active_admin()`, never a supplied actor ID. Use pinned paths,
schema-qualified references, input allowlists, bounded payloads, expected revision, request UUID
idempotency, and no dynamic SQL. PUBLIC function execution is revoked, authenticated execution
granted only on intended protected entry points; private helpers remain non-callable by clients.
Lifecycle status changes must pass the Section 4 database state machine through these protected
entry points; ordinary direct status UPDATEs are forbidden, not merely discouraged by the UI.
Public safe read functions are explicitly granted to anon/authenticated and return minimal DTOs.

Use SECURITY INVOKER for private queries where RLS suffices. Use SECURITY DEFINER only for
controlled write/read boundaries that must access restricted tables; authorize inside functions.
New definer functions pin `search_path` to `pg_catalog, extensions, pg_temp` and fully qualify
public relations/helpers. Do not refactor old authentication helpers solely for stylistic symmetry.

Current `write_audit_event()` only recognizes old primary-key names; attaching it blindly to new
tables would produce missing record IDs. Add a dedicated GIS audit routine/events with explicit
release/import/capture identities and supported audit actions. Do not copy raw GPS readings,
device/operator notes, or internal rejection notes into the general staff-readable `audit_log`.
Log sanitized IDs, hashes, state transitions, revision, actor, and counts. Immutable private
evidence stores retain details. Existing audit functions/roles and historical rows remain intact.

## 13. Additive migrations and deployment acceptance

Dependency order (filenames chosen only after checking fresh local/remote history):

1. Release scope/lifecycle identity, normalized field capture/observations, georeferencing
   attempts/memberships/results and private derived summaries/security.
2. Versioned boundaries/plot/access/display/walkway objects; existing graph extensions,
   relational/spatial integrity, indexes, release immutability and legacy RLS compatibility.
3. Bounded staging/dry-run/review/publication/rollback/readiness/public-safe read contracts.

No migration changes existing production geometry/occupancy or publishes a release. Nullable
graph membership preserves legacy rows; do not assign them to a pretend approved GIS release.
No unrelated migration modifications, database resets, new routing extensions, or dependencies.

Update generated database types additively; the one loader filter is the only permitted runtime
compatibility edit. Existing Dashboard/Burial Records/Plot Management/Coordinate Verification
queries, routes, current visitor gating and static routing remain intact.

Deployment requires tests first, linked `db push --dry-run`, an exact allowlist of pending GIS
migrations, then the normal authenticated push only if the dry-run contains that allowlist.
If unrelated pending migrations appear, stop deployment and report them; do not repair history
or apply unrelated SQL speculatively. Verify migration-history parity and hosted objects/grants.

## 14. Test and verification acceptance criteria

Extend disposable PGlite/PostGIS database tests and independent package-validator tests:

- Raw reading preservation, >5/<5 reading flags, median even/odd/outlier calculations,
  accuracy summaries, zero readings, fresh-order flags, append-only remeasurement.
- Reject validation-as-fitting, duplicate dual-role membership, wrong-site capture/run,
  frozen-capture mutations; verify independent errors by transforming both preserved Point(4326)
  inputs into the validated run working SRID before planar distance. Pilot requires 32651;
  reject invalid/nonmetric working CRS and transformation failures. Verify every run aggregate
  uses that canonical metric, not fitting residuals or optional geography cross-checks.
- Unique site/release code; every allowed lifecycle transition and rejection path; direct status
  UPDATE denial, illegal skipping, stale revisions and idempotency. Restaging increments revision
  and invalidates validation; approved content cannot restage/mutate. Concurrent scope publication
  stays atomic; only protected rollback reactivates superseded snapshots and preserves both
  releases' GIS contents, selector/history/audit. Rejected releases are retained and terminal.
- Stable lot identity; unknown/removed/wrong-area lot rejection; access beside plot accepted;
  access-to-graph mismatch rejected; no legacy coordinate requirement for geometry readiness.
- Cross-site/release edge rejection; endpoint/direction/eligibility checks; isolated components;
  unreachable access points; visual-only landmarks do not require graph attachment.
- Invalid/self-crossing/empty/wrong-CRS geometries; positive interior overlap vs boundary touching;
  package size/hash/duplicate/ID/privacy rejection; no auto-created or deleted plots on omission.
- Chunked ingestion retry/conflict/aggregate and per-piece bounds; same reconstructed bytes
  produce identical file/package digests across chunk sizes. Missing/mismatched chunks or hashes
  retain private error evidence and produce no operational GIS rows. Complete validation precedes
  transactional finalization; forced finalization failure leaves no partial GIS rows/publication.
  Finalization does not publish. Pilot-set completeness does not require unrelated garden lots;
  later releases cannot accidentally omit already published coverage without acknowledgement.
- ADMIN/MANAGER/inactive/anonymous permissions, base-table direct-write denial, membership
  downgrade bypass prevention, public unpublished/private evidence denial, sanitized audit.
- Legacy loader excludes every release row including published ones until a later client phase;
  old operational tests/static map/routing/auth/coordinate containment remain unchanged.

After implementation run lint, `tsc --noEmit`, `npm test`, production build, `npm run validate`,
and `git diff --check`. Record exact commands/results, not inferred success. Hosted verification
uses catalog/grant/read checks and disposable transactional fixtures with rollback; never
mutate meaningful existing production records for QA. Local tests do not prove hosted behavior.

## 15. Completion boundary and deferred work

This foundation is complete only when intended migrations are deployed/history-aligned,
contracts/security/tests are verified, import documentation includes real executable examples,
and the first-pilot package can be checked/staged without publishing or touching legacy data.
No real pilot package, survey readings, or polygons are currently supplied; do not invent them.

Deferred: Admin/Visitor Map design, routing UI, pgRouting/route calculation service, public-client
adoption of GIS navigation gating, field capture UI, full-cemetery imports, generalized archive
uploads, survey-grade accuracy policy, and actual approval/publication of a real pilot.

Current status: GraveNav is NOT yet ready to receive the first pilot package through implemented
GIS contracts. This document is the reviewable specification, not a completed migration or import.

## 16. Design references

- QGIS Georeferencer: https://docs.qgis.org/3.44/en/docs/user_manual/managing_data_source/georeferencer.html
- PostGIS actual reprojection: https://postgis.net/docs/ST_Transform.html
- PostGIS geometry planar distance versus geography geodesic distance: https://postgis.net/docs/ST_Distance.html
- PostGIS interior relationships and spatial-index candidate filtering: https://postgis.net/docs/ST_Relate.html
- Supabase database function security: https://supabase.com/docs/guides/database/functions
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security

These references inform implementation mechanics; the user's field method and approved audit
remain the authority for scope, evidence preservation, independent validation, and publication.
