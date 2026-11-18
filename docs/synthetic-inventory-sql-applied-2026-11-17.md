# Hosted synthetic inventory SQL: applied and verified

17 November 2026. Target project: ddoowghocqyfoxaikifb.
This task was authorized for the reviewed inventory migration only.
The authenticated importer remains hard-disabled; no dataset saves occurred.

## Exact authorized migration

supabase/migrations/20261117020000_separate_synthetic_plot_inventory.sql

SHA-256 before execution and unchanged afterward:
`f4a257e463b5c22cb0b728349744beb646a15ef1b647daddf6eac3b9e0d3350e`.

Top-level statement review confirms BEGIN, exactly five CREATE OR REPLACE
FUNCTION definitions, then COMMIT. No table/data/view/writer/grant change.
The five definitions are staff_dashboard_counts, staff_dashboard_data,
staff_plot_management, staff_coordinate_verification and staff_gis_readiness.

The hosted prerequisite bodies match the reviewed local prerequisites after
normalizing Windows/Unix line endings only. Exact function signatures, security,
search paths, ownership and grants were captured before execution.

## Preflight and execution

READ ONLY preflight confirmed:

- Explicit project reference ddoowghocqyfoxaikifb; legitimate administration
  query ran as postgres. This connection was not represented as PUGI's Auth session.
- All 30 existing local prerequisite migrations recorded remotely.
- Only 20261117020000 was pending; no prior record of the target migration.
- All 4,494 original lots remain HOLD; zero P2S, owner, deceased or interment rows.
- Original lot and area preservation hashes match the reviewed baselines.
- The removed temporary pilot RPC remains absent.

The CLI dry run listed only the approved migration, with no seeds/custom roles.
Execution used the authorized administration command:

```text
supabase db push --linked --project-ref ddoowghocqyfoxaikifb --skip-vault --yes
```

Vault updates were explicitly excluded. Seed and custom-role flags were omitted.
The CLI applied only 20261117020000_separate_synthetic_plot_inventory.sql and
reported success. No other migration or import was submitted.

## Hosted definition and ledger verification

- Migration ledger now has 31 entries. The new row is version 20261117020000,
  name separate_synthetic_plot_inventory. All 30 prior entries remain unchanged.
- A second dry run reports up to date, with no pending migrations/seeds/roles.
- All five installed function bodies exactly match the reviewed expected bodies.
- All five remain STABLE, SECURITY DEFINER, owned by postgres; their signatures,
  languages, execution permissions and search paths are unchanged.
- Original search paths remain public/pg_temp for dashboard readers,
  public/extensions/pg_temp for plot/coordinate readers and
  pg_catalog/extensions/pg_temp for GIS readiness.
- Existing authenticated execution grants remain; anonymous execute remains
  denied. Original active-staff and ADMIN-only coordinate guards are retained.
- The complete pg_proc hash for all non-target functions in public/gis_private
  is unchanged, including protected writers, publication and geographic guards.

## Live functional verification through genuine PUGI Auth

The existing temporary readiness check now collects read-only summaries from all
five readers using its same authenticated PUGI client. No new endpoint, credential
handling, writer, write switch or authorization path was introduced. Results are
saved only as a credential-free local verification receipt, without returned
record items, coordinates or tokens.

The user refreshed that control. Its real application receipt verifies PUGI,
Auth/account ID 9f08a285-a1e2-444f-b07e-b897e43e6c92, ACTIVE ADMIN, exact project,
requestBound=true and writesEnabled=false. Reader results were recorded at
2026-11-17T12:46:03.805Z (20:46:03 Manila):

| Reader | Exact hosted result |
| --- | --- |
| staff_dashboard_data | Physical total 4,494; HOLD 4,494; available/occupied/booked/unknown 0; synthetic 0; burial records 0; needs verification 0 |
| staff_dashboard_counts | Plots 4,494; synthetic 0; active/pending/archived burial records 0; unverified/missing/pending coordinates 0 |
| staff_plot_management | total/totalAll/physical summary 4,494; HOLD 4,494; available/occupied/booked/unknown 0; synthetic 0; needs verification 0 |
| staff_coordinate_verification | total/totalAll 4,494; stored verified 4,494; missing/pending/rejected/needs verification 0 |
| staff_gis_readiness | Area 5 Butterfly: 777; area 6 Majestic: 3,717; geometryReady/routingReady/legacyMissing 0 in both; no published release |

Stored coordinate verification fields were already verified in the baseline;
this migration did not verify coordinates, supply geographic evidence, publish
geometry or enable GPS. GIS readiness remains zero.

## Data and behavior preservation

Exact before/after hashes:

- Original lots: `88d29e467313b2e23301040a45325cd09de9e8db826cd65aefd97a195d0a9973`.
- Areas: `0a1558f5982122367817a79f9172f3babc14ce6e31789482628d511dd12d9f45`.

Lot/area rows, status distribution, coordinate states and all captured GIS counts
are unchanged. Plot geometry, grave access, mapping releases and publications
remain zero. Application audit, mutation-receipt and history counts are unchanged.
Owners, deceased people, interments and P2S records remain zero.

No existing plot status, geometry, verification field, record, publication or
protected writer was changed. Nothing was deployed, committed or pushed.

The authoritative workbook and pinned import preview still match their hashes:

- Workbook: d513d28922dfce121422916fbb94138e652dcf0080e146d51ad8c540b5bdcc0f.
- Preview: bf006431c72c844df43336c101caba2df88622df90cb6cf0e9cf3e24df116b93.

HOSTED_WRITES_ENABLED is still false. No execution-clearance.json or progress.json
exists in the restricted executor directory. Import saves: zero of 235.

## Related local verification changes and tests

Only src/app/api/admin/phase2-import/route.ts and its focused test were updated
to collect the five read-only reader summaries. All other 329 baseline files,
including the approved SQL file and executor engine, remain hash-identical.
This report is new. The source change does not enable import execution.

- 12 focused executor/verification checks passed, with no failures/skips.
- Same-client GIS reads and all-five-reader collection are covered.
- TypeScript, targeted ESLint, production build and git diff --check passed.
- Genuine PUGI functional results were verified separately from local fixtures;
  no hosted Auth claims or tokens were fabricated or exported.

Private evidence outside the repository/web root is under the existing
full-dataset-preparation-20261117 directory: inventory-sql-hosted-before.private.json,
inventory-sql-hosted-after.private.json, inventory-sql-reviewed-expected.private.json
and inventory-sql-pugi-reader-checks.private.json.

## Final import readiness

The reviewed inventory SQL prerequisite is complete. The authenticated executor
and genuine PUGI identity are verified. The complete 235-save plan is ready for
the user's separate final execution approval.

Import remains blocked intentionally. Final approval must separately authorize
the reviewed write-enable change and execution clearance, with a fresh read-only
preflight at execution time and renewed live PUGI verification. Do not treat this
SQL-only approval as permission to import, publish or activate any records.
