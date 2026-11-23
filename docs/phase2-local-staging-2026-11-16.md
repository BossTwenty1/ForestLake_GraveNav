# Forest Lake Phase 2 local database staging preparation

> Follow-up: [UNKNOWN availability and import blockers](phase2-unknown-availability-2026-11-16.md) records the subsequent implementation and local validation. The results below describe the earlier staging run; its held preview remains unchanged.

16 November 2026. Main release candidate: `C:/Users/Nash/.codex/worktrees/gravenav-defense-rc/gravenav`, HEAD `2c55e0482ad2faba1cc71f11c3b21efc39213ab7`. Existing unrelated dirty work was preserved.

## Result and current limit

The full Excel register **fits a lossless private staging layer associated with the existing GraveNav hierarchy**. It is **not a safe direct insert into `public.lot` today**. No operational or mapping tables were redesigned or migrated during this task.

All 4,470 source cells have an import-preview row. All 4,494 CAD candidate references are retained separately. The preview does not generate official plot codes, database IDs, owner/deceased associations, capacity, commercial availability or GPS values.

**The real existing-ID comparison is not yet evaluable.** The running `supabase_db_gravenav` Docker container is labelled with workdir `C:/Users/Nash/Documents/PROJECTS/GRAVENAV`. It has the older UUID model (`cemetery_sites`, `cemetery_areas`, `sectors`, `plots`), including four synthetic plots. It does not have the RC's bigint `site`, `area`, `block`, `lot` tables. Those UUIDs were not treated as RC lot IDs, and no data or schema in its original `postgres` database was changed. No hosted database was queried.

A separate disposable local database was created inside the same local PostgreSQL server. Its schema was built from all **28 current RC migrations**, with minimal local auth compatibility setup. All source rows were staged there in temporary tables and rolled back. This proves staging compatibility with the actual RC schema, not a match against operational records that were unavailable.

## Local import-preview counts

| Measure | Result |
| --- | ---: |
| Source rows preserved | 4,470 |
| CAD candidate references preserved | 4,494 |
| Geometric source-to-CAD links retained | 4,451 |
| Unmatched source outlines retained | 19 |
| CAD-only candidates retained | 43 |
| Linked CAD candidates retaining overlap flags | 31 |
| Source-complete garden/lawn/block/lot identities | 4,119 |
| Source identities with missing numbering | 351 |
| Ready operational lot creates | **0** |
| Verified existing operational-ID matches | **0 verified; actual count unknown** |
| Preview rows held for intended target snapshot | **4,470** |
| Existing-record conflicts evaluated | **Not evaluated without the correct target snapshot** |
| Public lot, owner, deceased or interment source records imported | **0** |

The 4,119 source-complete rows are conditional create candidates **only after** checking existing IDs, approving scope/code bindings and solving unknown availability. They are not 4,119 approved new records. Some or all may already exist in the intended target. The 351 incomplete identities are the 348 Court C cells without individual printed lot numbers plus three Lawn A numbering gaps.

The `import-preview.json` and CSV distinguish `REVIEW_TARGET_UNAVAILABLE`, `REVIEW_SCOPE_BINDING`, `REVIEW_APPROVED_LOT_CODE`, reviewed existing matches, specific conflicts and `PROPOSE_CREATE_HELD`. This run's actual preview has 4,470 `REVIEW_TARGET_UNAVAILABLE` rows. Fixture-only matches and conflicts from tests are not included as operational results. Every row has `operational_write_allowed: false`.

The original Lawn A class discrepancy, nineteen outline differences, thirty-one linked overlap flags and two Leg2 class conflicts remain unresolved source evidence. The register's approved-ID fields were blank and remain blank in staging. No original CAD polygon, instance path or source number was altered.

## Exact source-to-database relationships

| Excel/source field | Existing schema relationship | Staging decision |
| --- | --- | --- |
| Garden + lawn | Reviewed existing `site.site_id` and `area.area_id`; `sector.sector_id` where the selected existing hierarchy represents that lawn | Six explicit source-scope bindings. All IDs currently null. Do not infer IDs or create duplicate gardens from matching names. |
| Printed block | `block.block_number`, unique within `sector_id`; then optional `lot.block_id` | Preserve literal text separately. Resolve the existing block only through the selected sector/area. A smallint comparison may find the block; it never rewrites the source literal. 552 distinct supported source blocks are in the scope/block plan. |
| Printed individual lot | `lot.lot_code`, required and unique within `area_id` | A bare repeated token such as 1 is not a safe area-wide code. Require a reviewed exact existing-code alias or approved full official code. Do not invent padded codes or manufacture Court numbers. |
| Existing database identity | `lot.lot_id`, with existing `revision` | Reuse the exact text-exported bigint when the reviewed scoped code finds one correct active record. Do not allocate a replacement ID. Keep the current revision for any later protected workflow. |
| STD / PRM / SPR / ESTATE | Source commercial classification, not `lot.grave_type` or capacity | Keep per-cell class in source provenance. `block.pricing_tier` is commercial but is block-wide and limited to STD/PRM/SPR, so it cannot losslessly represent mixed per-lot classes or ESTATE. Do not use it as a blanket conversion. |
| PDF page, document locator, workbook row and file hashes | No equivalent operational lot columns | Retain exact values in private staging/source provenance. Do not overwrite `legacy_location_code` or `legacy_pa_number` with document references. |
| CAD candidate ID + full instance path | Source identity, later related to an existing operational lot | Keep exact strings in the private crosswalk. CAD IDs such as `lawn:3202` are not database lot IDs or official plot codes. All 43 CAD-only candidates remain a separate review list. |
| Source CAD geometry | Later `plot_geometry.lot_id`, `mapping_release_id`, area/run evidence | Do not load local CAD X/Y into `plot_geometry.plot_geom`, which requires valid SRID 4326 geometry and release/run membership. Geometry and publication remain later work. |
| Missing owners / deceased / interments | Separate `lot_owner`, `deceased`, `burial_record`, photos | No creates or associations. Missing personal data does not imply vacant, available or unowned. Source nulls are not update instructions to clear existing relationships. |
| Occupancy / availability / GPS / capacity | Existing business and geographic review contracts | Remain unknown in source staging. No operational status, policy, coordinates or capacity is inferred. |

The RC already supports site -> area -> sector -> block where applicable and direct `lot.area_id` with nullable `block_id`. There is no confirmed need to replace these tables, change their primary keys or rebuild their relationships. Scope bindings can accommodate the actual existing area/sector arrangement. This task does not decide between one area per garden or one area per lawn without examining and approving the real IDs.

## Confirmed incompatibilities and necessary changes

**1. Unknown commercial availability is not representable for a new operational lot.** The inspected RC `lot.status` is NOT NULL, defaults to AVAILABLE and accepts only AVAILABLE, BOOKED or HOLD. An actual disposable SQL test confirmed that UNKNOWN is rejected. Staff plot and GIS read models also use an `else 'available'` branch when no burial relationship exists, and the application status type lists the same three values.

Before promoting unknown source inventory into operational lots, the smallest necessary change is an explicitly reviewed unknown/unassessed availability state (or an approved equivalent nullable policy), covering the SQL constraint/default, protected create behavior, read-model fallback and staff types/labels. Adding UNKNOWN only to a check constraint is insufficient because current readers would still label it available. Do not use HOLD as a substitute for missing evidence. **No such forward migration or reader change was applied here.** Staging is safe without it.

**2. Official lot-code and missing-number decisions are data prerequisites, not reasons to weaken primary keys or uniqueness.** Keep required operational `lot_code` and `(area_id, lot_code)` uniqueness. Review the official code convention and code aliases. Leave Court's 348 individual numbers and the three Lawn A gaps unresolved rather than filling them with CAD order, 1-12 sequences or technical source hashes.

**3. Durable per-cell provenance will need a small private adjunct if the staged catalog is persisted.** No existing operational column losslessly holds literal garden/lawn/block/lot, source page/box, per-cell class and full CAD lineage together. A restricted source/crosswalk table with source digest/key and nullable FK to the existing `lot_id` is sufficient. It is provenance and review staging, not a second cemetery/people model. During this task it is temporary only; no persistent schema was added. Do not repurpose georeferenced `plot_geometry` or force mixed source classes into block-level pricing.

The older UUID Docker database is a **target/provenance mismatch**, not evidence that the RC must be redesigned around its UUID tables. The inspected current RC schema remains the implementation target named by the request.

## ID-preserving matching and conflict rules

1. Consume only the extracted, hash-referenced source file and a separately reviewed binding file. Retain the exact original Excel strings and source row locator. Technical `source_row_key` hashes identify source cells only and never become official plot codes.
2. Require the correct local RC snapshot model and its exact file digest. Bind the source garden/lawn explicitly to existing site/area/sector IDs, with a review reference. Do not search arbitrary databases or infer source hierarchy from display labels.
3. Match a reviewed exact lot-code alias only inside the selected area/site. Validate the existing block/sector ancestry when present. Keep the existing `lot_id`, `revision`, existing block FK and every operational relationship unchanged.
4. Conflicting scope, multiple existing records, removed lots, wrong expected IDs, wrong blocks or repeated assignment of one existing lot to two source cells become named review conflicts. Missing revisions prevent a verified match. Existing IDs use decimal strings and SQL bigint without JavaScript numeric coercion.
5. A reviewed official code absent from the compatible target can produce `PROPOSE_CREATE_HELD` only when source numbering is complete. It still cannot write an operational lot while the unknown-status/promotion prerequisites remain unresolved.
6. ID binding does not resolve source-numbering gaps, outline differences, overlap flags, class disagreements, ownership or occupancy. All those review flags remain independently visible.

JSON is the canonical ID-preserving preview. CSV is a viewing convenience; do not treat spreadsheet numeric conversions as authoritative database IDs. The preview is not a `staff_save_record` mutation payload, and its source unknown/null fields must not clear values on existing lots.

## Local validation performed

- Created only `gravenav_phase2_stage_20261116_677bafa5` as a disposable database within local Docker PostgreSQL **15.8**. Applied the 28 existing RC migration files to that empty isolated database, with no hosted connection and no original-database migration.
- Loaded 4,494 candidate references and 4,470 source rows into temporary tables, including all numbering blanks and review flags. Loaded the same source payload twice and verified exact idempotent row counts and unchanged payloads. All 4,470 preview rows and 4,451 distinct CAD links passed count/lineage validation.
- Revalidated nullable existing-ID references through temporary ID registries copied from the real physical tables. PostgreSQL temporary FKs cannot point to permanent tables, so no persistent FK or operational schema alteration was introduced. Area/lot hierarchy is also checked against the existing tables.
- The source-staging transaction rolled back with **zero operational lots or personal records written**.
- Separate rollback-only physical/staff fixtures verified an existing ID above JavaScript's safe-integer range (`9007199254740997`), exact retry receipts, unchanged existing fixture row, direct-write restrictions, anonymous mutation rejection, UNKNOWN-status rejection, regular capacity six and retained `(lot_id, interment_slot)` uniqueness. These are explicitly test IDs, not operational matches. No deceased, owner or interment fixture was required or created.
- After fixture rollback, site, area, lot, owner, deceased and interment counts in the disposable RC database were all zero. Fourteen focused unit tests cover target-model rejection, local-only snapshot guards, source/snapshot digest mismatch, missing approvals, hierarchy conflicts, stale/deleted/ambiguous IDs, identity reuse, held creates and source preservation.
- The task-created disposable database was removed after these checks. The original local database remains present with its four synthetic UUID plots. No original local database reset or migration was performed.
- The validated RC schema snapshot and machine-readable dry-run results are retained with the preview. Full application E2E, concurrent interment admissions, real target-ID matching and operational promotion were not tested by this preparation task.

## Full-site GIS compatibility, kept separate

The existing v1 package still limits one pilot area to 1-50 declared plots/access points, with SQL transport/publication checks as well as JavaScript limits. The geographic adapter still selects one site/area. This staging task changes neither. Source-catalog preparation can proceed independently of geographic publication. A later reviewed full-scope contract/selection extension must preserve existing release identities, area membership, graph/access evidence, authorization, shared destinations, validation and separate approval/publication. Repeated pilot replacements or increasing one constant do not implement full-site coverage.

## Smallest safe next step

**Identify or provide the intended main-RC database's physical-location snapshot before proposing real creates.** Use the supplied read-only snapshot query only through a verified local connection whose schema is `site/area/sector/block/lot`. Preserve and review the actual IDs; do not migrate or reset the unrelated Docker `postgres` database.

Then fill only reviewed source-scope and exact lot-code/ID bindings, pin them to the snapshot digest and regenerate the preview. That will distinguish existing records from genuine create proposals without touching the CAD map or importing Leg2 people. Review the minimal unknown-availability/provenance change before any operational promotion. Source-only incomplete cells stay in private staging until their identifiers are supported. No hosted import, publication or deployment is authorized or performed by this package.

## Artifacts and rerun

- `import-preview.json` / `import-preview.csv`: all 4,470 rows, exact source literals/locators/lineage, nullable target IDs and explicit actions.
- `scope-and-block-plan.json`: six source scope bindings and 552 supported source block groups, with unassigned existing IDs.
- `cad-candidate-preservation.json`: all 4,494 original candidate references. `cad-only-review.csv`: all 43 unmatched candidates, without invented garden/plot assignments.
- `temporary-staging-dry-run.sql`: guarded disposable-only temporary staging with rollback. It is not an operational importer.
- `staging-manifest.json`, `validated-rc-schema.json`, `docker-staging-result.json` and `safeguard-verification.json`: source/schema fingerprints and evidence.
- The source extraction JSON and blank reviewed-bindings template remain in the private parent artifact directory. Keep them outside web roots and Git public assets.

Repository tooling: `scripts/phase2-staging/extract-register.py`, `scripts/phase2-staging/prepare.mjs`, `scripts/phase2-staging/export-target-snapshot.sql`, `tests/phase2-staging.test.mjs` and the guarded SQL fixture under `tests/fixtures/`.

Example offline preview command:

```powershell
node scripts/phase2-staging/prepare.mjs --source <private-source-register.json> --bindings <reviewed-bindings.json> --out <private-output-directory>
```

Add `--snapshot <verified-local-RC-snapshot.json>` only after scope/code review and matching snapshot digest. The tool reads files and emits preview/temporary SQL. It has no database URL, credential, hosted-client or operational-write mode. A missing compatible snapshot produces a held preview, not guessed IDs.

Authoritative input SHA-256:

- Consolidated Excel: `677bafa53a77c91ea9cd8ca957b432fdec909037131f390e73340bfbf62b67fd`
- Consolidated crosswalk report: `03d243813558b37e6d9b5c823577803a8d160ed594d519574e810c0b0ff8fb19`

The original Excel, crosswalk report, source drawings and all CAD polygon geometry remain unchanged. No original operational IDs, relationships, authorization rules or shared-gravesite policies were changed.
