# Fictional Phase 2 local integration

17 November 2026. Owning release candidate: `C:/Users/Nash/.codex/worktrees/gravenav-defense-rc/gravenav`, HEAD `2c55e0482ad2faba1cc71f11c3b21efc39213ab7` with existing unrelated dirty work preserved.

## Local result

The existing visitor search cards, deceased-profile plot card, main map details and desktop/mobile staff plot list now display **Synthetic plot reference** separately from **Internal lot code** when a valid sample reference is supplied. Existing burial IDs, `plot`, `plotLabel`, internal lot codes and map associations retain their original meanings. No dataset loader, replacement map, alternate profile or fictional-record fallback was introduced. The existing CAD components, candidates and navigation gates are reused unchanged.

The proposed forward migration `20261117010000_project_sample_plot_reference.sql` exposes only a bounded reference from the existing project-sample provenance. It requires the exact sample source/classification, a valid source-row key and the current lot ID. Malformed or moved provenance produces no reference. Public responses never include private notes, owners, source paths or CAD provenance. Public search accepts this reference as well as the existing name/internal-code queries, preserving ranking, garden filters and pagination.

Staff receive the same bounded projection under existing active ADMIN/MANAGER checks. Conflicting shared-lot references are withheld. The frontend accepts older public views without this optional field and retains the staff workflow when the new RPC is absent. The migration contains no operational data changes. It has **not been applied to hosted Supabase**. Display/search by the new field on a hosted database remains dependent on separately authorized application of this migration.

## Read-only workbook verification

Source: `C:/Users/Nash/Downloads/GraveNav_Phase2_Demo.xlsx`.

SHA-256 before and after reading: `d513d28922dfce121422916fbb94138e652dcf0080e146d51ad8c540b5bdcc0f`.

- 4,470 plot-reference rows; 100 fictional people/interments; 45 fictional owners.
- All person, plot-source and display-reference links checked; no broken links or invalid birth/death/interment date sequences.
- All display references fit the bounded projection; maximum observed length 26 characters.
- 90 referenced plots, including ten shared sample groups. No operational lot IDs are populated; availability remains UNKNOWN for all source rows.

This verifies the prepared workbook's internal compatibility, not an accepted operational lot binding or a full-batch admission. The workbook and source geometry were not modified or regenerated. Aggregate evidence is retained in this chat's artifact directory as `demo-workbook-verification.json`; names and owner details are omitted from this report.

## Focused local evidence

**59 tests passed**, with no failures or skips:

```powershell
node --test tests/phase2-project-samples.test.mjs tests/visitor-behavior.test.mjs tests/phase2-only-navigation.test.mjs tests/phase2-geographic.test.mjs tests/unknown-availability.test.mjs
```

The added workflow test reuses the existing sample planner and fixture. It applies the proposed migration only in disposable in-memory PostgreSQL, checks that existing lot rows remain unchanged, executes the generated pilot through protected writers and replays it without duplicates. It then exercises the real public/staff readers, search/profile/map rendering, desktop/mobile staff rendering, garden filtering, malformed/moved provenance, private/pending/archived/removed exclusions, active/inactive/anonymous roles and the older-database fallback. Test role claims and transports are simulated; no hosted request is made.

A second sample on the same unclassified lot is rejected by the existing capacity rule without leaving a deceased row behind. Shared sample groups need reviewed per-lot classification/capacity and interment setup before batch admission. No capacity, confirmation or publication guard was relaxed to make the fixture pass.

TypeScript (`npx tsc --noEmit --incremental false`) and ESLint on the changed application/test files passed. The scoped interface detector reported no findings. No production build, full test suite, actual login/browser session, phone navigation or on-site acceptance was run for this narrow change.

## Still held

The full fictional batch has not been imported. Reviewed exact existing-lot bindings, required RC migrations and shared-gravesite arrangements remain prerequisites. The new display reference cannot establish a physical CAD match, GPS destination, availability or capacity. Backup completion/restoration was not evaluated by this development task. Hosted mutation, publication, push/merge and deployment remain separately gated.
