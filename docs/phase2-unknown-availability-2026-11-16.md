# Phase 2 database import blockers — 16 November 2026

UNKNOWN availability is implemented and validated locally. No compatible existing operational RC database was verified, so no operational ID snapshot was exported and the existing held import preview was preserved.

## Implementation

Active checkout: `C:/Users/Nash/.codex/worktrees/gravenav-defense-rc/gravenav`.

Forward migration: `supabase/migrations/20261116010000_unknown_plot_availability.sql`.

- Extends `lot_status_check` with `UNKNOWN` and changes the creation default to `UNKNOWN`. There is no UPDATE of existing rows, statuses, IDs or revisions.
- The existing protected `staff_save_record` remains the writer. Omitted availability uses the database default on creation; omission on update retains the stored value. Its existing requirement to supply `lot_code` on a save is retained. Explicit UNKNOWN is accepted; null and unsupported statuses are rejected.
- The plot list and GIS readiness view require explicit `AVAILABLE` before reporting availability. An existing burial relationship still takes precedence for their assignment/occupancy display, including recoverable relationships.
- Dashboard and plot summaries expose an independent unknown count. Staff types, strict response decoders, verification reads, filter URLs, status filters, create/edit forms, badges and the dashboard legend support UNKNOWN.
- New staff forms select **Unknown — not assessed**. The form explains that this does not mean vacant, unsold or available for booking. Confirmed availability remains an explicit staff choice.
- Existing burial eligibility continues to require AVAILABLE. UNKNOWN is excluded from interment options and rejected on new burial admission. Public burial search does not expose an unassigned unknown plot as a burial or as available inventory. Existing public GIS projections do not publish commercial availability.
- Shared-gravesite reservations, regular capacity of six, mausoleum approval, identities, privacy, revision checks and authorization are retained.

The migration was applied **only to disposable test databases**. It has not been applied to an operational or hosted database. Applying the application changes against an older schema is not an activation step; coordinate migration and application versions when an approved target becomes available.

## Validation

| Check | Result |
|---|---|
| Focused tests | **58 passed, 0 failed** |
| TypeScript | `npx tsc --noEmit` passed |
| Scoped ESLint | Passed |
| Native Docker PostgreSQL | **15.8 / PostGIS 3.3.7**, all 29 RC migrations applied to an empty disposable database |
| Native protected workflow safeguards | Passed: default UNKNOWN, explicit UNKNOWN updates, omitted-status updates, bigint ID/retry preservation, staff/dashboard/GIS reads, burial-option exclusion, anonymous-write denial, shared-slot uniqueness and capacity |
| Migration preservation | Tested pre-existing AVAILABLE / BOOKED / HOLD rows and reader permissions; unchanged by the forward migration |
| Shared-grave regressions | Existing shared-interment suite also applies the UNKNOWN migration before testing its workflows |
| Native rollback | Zero sites, lots, deceased and burials remained after rollback |
| Cleanup | Exact disposable test database removed; original UUID database retains its four existing plots |
| Staff rendering | Actual React components rendered in an isolated fixture with database/config dependencies replaced; UNKNOWN selected and explanation present |
| Browser visual check | Incomplete: the in-app browser timed out reaching the Windows loopback preview; no authenticated browser E2E result claimed |

The scoped UI detector reported six existing style warnings (font choices, gradient text and layout transitions), outside the availability change. Those styles were preserved.

The test databases contain only isolated fixtures. No actual Leg2 burial records or source inventory were inserted into operational tables. The native fixture creates no deceased records. Existing in-memory regression tests use disposable fictional test data only.

Evidence in the private artifact directory includes `focused-tests.log`, `native-safeguards.log`, `native-database-verification.json`, `cleanup-receipt.json`, `protected-artifact-verification.json` and the isolated `staff-unknown-ui.html`.

## Existing RC target investigation

The current RC `.env.local` selects hosted Supabase. No hosted request was made. The checked-in local example/config uses API port 54321 and database port 54322, with configured PostgreSQL major version 17.

The local GraveNav database container on that port is `supabase_db_gravenav`. Its workdir label points to the older `C:/Users/Nash/Documents/PROJECTS/GRAVENAV` checkout, and it actually runs PostgreSQL 15.8. Read-only schema inspection shows UUID identifiers in `cemetery_sites`, `cemetery_areas`, `sectors` and `plots`, with four existing plot rows. It lacks the RC `public.site` and `public.lot` tables. Its connectable database names were `postgres`, `_supabase` and `storage_vectors`; no separate RC database was identified. The unrelated S.A.F.E. containers were not inspected for cemetery records.

**No compatible, approved existing local RC target was found in this configuration.** This is not a claim that no RC copy exists elsewhere. No environment configuration was changed, database reset performed, replacement operational database created or hosted system accessed.

The temporary `gravenav_phase2_stage_20261116_unknown_7be521` database was a disposable migration/workflow test, not an existing operational target. Its empty fixture hierarchy cannot supply official IDs and was never exported as an operational snapshot.

## Snapshot and held preview

No verified operational ID snapshot was obtained. No scope/code binding was approved and no target-match evaluation was performed. Existing preview files were not regenerated; SHA-256 checks confirm that the preview JSON/CSV, source-register JSON, CAD preservation index and original map geometry are unchanged.

| Preserved preview result | Count |
|---|---:|
| Source plots held as `REVIEW_TARGET_UNAVAILABLE` | **4,470** |
| CAD candidates preserved | **4,494** |
| Source-complete identities, conditional only | **4,119** |
| Numbering-review cases | **351** |
| Ready operational creates | **0** |
| Verified existing-record matches | **0** |

The 19 unmatched PDF cells, 43 CAD-only candidates, 31 matched overlap-review candidates, Court C unprinted lot numbers, Lawn A gaps and classification conflicts remain unresolved. The 24-count inventory difference remains the net result of 43 CAD-only candidates minus 19 unmatched source cells; it does not authorize deleting or assigning polygons.

For future preview runs, the tooling now labels a hypothetical held create `TARGET_UNKNOWN_AVAILABILITY_NOT_VERIFIED`, replacing the obsolete global statement that UNKNOWN is unsupported. This does not verify a target migration, permit creation or change the currently held preview. Target migration/default/reader compatibility must still be checked before promotion.

## Smallest next steps before actual plot creation

1. Identify an approved **existing** local RC connection with bigint `site → area → sector/block → lot`, or obtain its restricted physical-location snapshot through the existing read-only exporter. Include exact IDs, codes, ancestry and lot revisions. Do not use the older UUID database or disposable fixture IDs.
2. Confirm the UNKNOWN migration and reader/application version on that approved target under a separately authorized target-change process. Recheck existing statuses and relationships without reclassifying old records automatically.
3. Review the six source-scope bindings and exact official/existing lot-code aliases against the snapshot digest. Regenerate the held preview with the existing tooling. Keep duplicate, removed, stale or ambiguous matches unapproved.
4. Resolve or explicitly hold numbering, CAD/overlap and classification exceptions. Review a concrete create/match plan before authorizing any actual record creation. Owner, deceased, occupancy and GPS facts can remain unknown; none should be manufactured to populate physical plots.

The current 1–50-lot GIS package and geographic publication system are unchanged. Full-site compatibility remains a separate prerequisite before site-wide GIS integration/publication; it does not block preparation of the physical plot preview. No CAD rebuild, map geometry edit, operational import, publication, push or deployment occurred.
