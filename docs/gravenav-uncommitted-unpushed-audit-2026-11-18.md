# GraveNav — comprehensive uncommitted and unpushed work audit

Date: **18 November 2026**, Asia/Manila. Read-only investigation; this report is the only authorized new file.

## A. Executive summary

GraveNav manages cemetery owners, deceased/interment records, visitor visibility and protected presentation previews, with geographic navigation gated on approved evidence. This audit addresses preservation and release completeness, not a new runtime/load certification.

**The approved RC is intact, but the entire workspace is not fully published.** The 120-path release manifest is only the latest three-commit scope; it is not the whole local development history.

- Official public repository: **BossTwenty1/ForestLake_GraveNav**. The configured origin URL, `https://github.com/BossTwenty1/Github-Final.git`, redirects to that renamed repository.
- Five registered worktrees share `C:/Users/Nash/Documents/gravenav/.git`. A sixth checkout is a genuinely independent, private repository: **BossTwenty1/GRAVENAV**.
- The RC remains `c2a4183e65c05c96da7854f40367124808e9b0a6` on `codex/defense-release-stabilization-20261106`. It has **13 commits absent from every current official origin branch**, and is 29 commits ahead of origin/main. These are different comparisons, not contradictory counts.
- The main checkout has **26 modified tracked + 12 untracked paths**. All **26 application/test/migration paths** among those changes match preservation commit `fb99963` after CRLF normalization. Thirteen also match the current RC directly; the others evolved in later RC commits. The remaining 12 are scope/archive documentation copies. No missing new primary-checkout application feature was established.
- The RC has **25 intentionally excluded untracked files** and no tracked edits. The detached `418f` worktree has one untracked historical readiness report whose complete original text is retained in the expanded RC archive.
- The older private checkout has **one generated tracked change + 26 untracked paths**. More significantly, it has **three unpublished feature commits**, not present or exact-patch-equivalent on the official repository's inspected refs.
- A standalone GPS observation/export utility and the CAD planning workspace are **nongit local work**. They must be preserved privately. They are not authorization to publish geographic data or replace the RC's guarded navigation.
- One professional README commit already on official GitHub is absent from the RC. Its changes are documentation, not an omitted application dependency.
- **No Critical missing-release feature was verified.** High preservation risks and a Medium alternative reporting feature are detailed below. Code completeness in separate implementations must not be confused with compatibility with the RC.

Fresh fetches updated remote-tracking refs only. No application edits, staging, commits, merges, rebases, resets, cleanup, database queries/writes, migrations, deployments or deployment-setting changes were performed.

## B. Git and worktree inventory

### Official repository and its five worktrees

| Worktree | Branch / HEAD | State before this report |
|---|---|---|
| `C:/Users/Nash/Documents/gravenav` | `feature/frontend-improvements`, `2f7ce5d1f3f10b6b4a1b3b6f33cb99baff6acfa5` | 26 modified, 12 untracked, nothing staged |
| `C:/Users/Nash/.codex/worktrees/0ae8/gravenav` | Detached `57289ece1403b198c84cb5bd6ab36bcfb5d52a9f` | Clean; same commit as current origin/main |
| `C:/Users/Nash/.codex/worktrees/418f/gravenav` | Detached `57289ece1403b198c84cb5bd6ab36bcfb5d52a9f` | One untracked report |
| `C:/Users/Nash/.codex/worktrees/ac5d/gravenav` | Detached `57289ece1403b198c84cb5bd6ab36bcfb5d52a9f` | Clean |
| `C:/Users/Nash/.codex/worktrees/gravenav-defense-rc/gravenav` | `codex/defense-release-stabilization-20261106`, `c2a4183e65c05c96da7854f40367124808e9b0a6` | No tracked edits; 25 excluded untracked files |

The report adds one untracked Markdown file to the RC, so its final untracked total becomes **26**, not an unexplained extra product change.

| Local branch | HEAD | Relationship |
|---|---|---|
| `codex/defense-release-stabilization-20261106` | `c2a4183e65c05c96da7854f40367124808e9b0a6` | No same-named remote branch; 13 commits absent from all origin branches |
| `feature/frontend-improvements` | `2f7ce5d1f3f10b6b4a1b3b6f33cb99baff6acfa5` | Equals origin branch; ancestor of RC |
| `main` | `d3c7e1a5cd569d8731019c0cd80e61c69417552b` | 0 ahead / 5 behind origin/main; ancestor of RC |
| `record-management` | `744613f3748808fcf4377bad7c6cce806bf7afcd` | Equals origin branch; ancestor of RC |

Live `git ls-remote --heads origin` and refreshed tracking refs agreed:

| Official remote branch | SHA |
|---|---|
| `main` | `57289ece1403b198c84cb5bd6ab36bcfb5d52a9f` |
| `feature/frontend-improvements` | `2f7ce5d1f3f10b6b4a1b3b6f33cb99baff6acfa5` |
| `record-management` | `744613f3748808fcf4377bad7c6cce806bf7afcd` |
| `practice` | `f072493b6eb1d46ae6213b53ebeccfa50dd12470` |
| `docs/gravenav-professional-readme` | `b2784832b4b02d76f3456716e4ee712870cd1e84` |

All official local/remote development branch tips except the professional-README branch are ancestors of the RC. `git log HEAD..origin/main`, `HEAD..origin/practice`, `HEAD..origin/record-management` and `HEAD..origin/feature/frontend-improvements` returned no missing commits. The common ancestor with origin/main is origin/main itself; no merge conflict with an existing same-name RC branch exists because that branch is not published.

### Independent older private repository

Root: `C:/Users/Nash/Documents/PROJECTS/GRAVENAV`. Its own Git directory is `C:/Users/Nash/Documents/PROJECTS/GRAVENAV/.git`; it is not one of the official repository's worktrees. Origin is `https://github.com/BossTwenty1/GRAVENAV`, verified as a **different private GitHub repository**. Its sole live remote branch is main at `36be6857f9f2fed3bea97115d10ed802b2bd0997`.

| Local branch | SHA | Commits absent from that private origin |
|---|---|---:|
| `feature/public-search-profile` (checked out) | `a1e47ed9a9301bd6695976cb7acef57221a97ef2` | 3 |
| `feature/admin-stitch-experience` | `1e40563c0215cb512ffd12f04fdcab29ced55fac` | 2, already within the branch above |
| `feature/public-stitch-experience` | `7ad242eb3d4be796db347ab48bbc5f83416240e9` | 1, already within the branch above |
| `feature/safe-import-pipeline` | `b190a9772ff070f07d907da0c954b87e2f6a3beb` | 0; ancestor of private origin/main |
| `main` | `36be6857f9f2fed3bea97115d10ed802b2bd0997` | 0 |

Do not add 3 + 2 + 1: these branch histories overlap. There are **three unique unpublished legacy feature commits**, plus the **13 unique unpublished official-RC commits**.

Both repositories had empty stash lists and no reflog commit IDs outside their respective reachable local/remote refs. This is not a forensic guarantee about expired reflogs or deleted external backups.

### Other specifically identified GraveNav locations

| Location | Classification / evidence |
|---|---|
| `C:/Users/Nash/Documents/GraveNav-Phase2-CAD/phase2-digital-map` | Nongit Vite/React CAD planning viewer source, scripts, tests, sealed packages and Blender/render tooling; `INTEGRATION_HANDOFF.md` explicitly limits hosting to approved local use |
| `C:/Users/Nash/Documents/GraveNav-QGIS/standalone-gps-field-tester` | Nongit standalone field-observation application; inspected source and local validation report |
| `C:/Users/Nash/Documents/GraveNav-QGIS/original-handoff/Forest_Lake_Handoff_Package` | Private source handoff |
| `C:/Users/Nash/Documents/GraveNav-QGIS/working-copy` | Private `custom-map-drafts`, `gps-drafts`, `gps-input` and handoff copy |
| `C:/Users/Nash/Documents/GraveNav_Backups` | Three pre-migration directories dated 17 November; 1, 26 and 20 files respectively; content deliberately not opened |
| `C:/Users/Nash/Documents/FOREST LAKE REQS` | Academic/client agreements, proposal and privacy/data-collection documents; not application dependencies; bodies not inspected |
| `C:/Users/Nash/Downloads/GraveNav_Phase2_Demo.xlsx` | Known authoritative private source workbook; not imported, regenerated or opened for this audit |
| `C:/Users/Nash/Downloads/gravenav_homepage` | HTML/design/screenshot reference, not another complete GraveNav checkout |
| `C:/Users/Nash/Downloads/stitch_gravenav_responsive_design_system (1)/PUBLIC SCREENS` and `(2)/ADMIN SCREENS` | Downloaded design references, not active application repositories |
| `C:/Users/Nash/Downloads/cemetery-mapping-DLMP-main` | Separate Divine Life PHP/MySQL source and `cemetery-mapping-v2` prototype/rebuild. README identifies another system; no evidence that it is a missing GraveNav RC module. Config/database contents were not opened |

Search was bounded to registered worktrees, known historical GraveNav paths, and GraveNav/cemetery-named directories in Documents/Downloads. Unrelated projects were not searched. Unknown differently named copies elsewhere on disk are outside this verified inventory.

## C. Uncommitted changes — exact paths and classification

Paths in each table are relative to its explicitly named worktree root. `M` means modified tracked file; `??` means untracked. Nothing was staged in any of the six inspected checkouts.

### C1. Main checkout — C:/Users/Nash/Documents/gravenav

**38 paths:** 26 tracked modifications and 12 untracked paths. Content comparisons used CRLF-to-LF normalization, not assumptions based on filenames.

| Status | Exact relative path | Classification |
|---|---|---|
| `M` | `AGENTS.md` | Legacy scope/archive notice or documentation copy; superseded by current RC docs |
| `M` | `README.md` | Legacy scope/archive notice or documentation copy; superseded by current RC docs |
| `M` | `docs/GraveNav_Database_Implementation_Notes.md` | Legacy scope/archive notice or documentation copy; superseded by current RC docs |
| `M` | `docs/forest-lake-phase1-kml-cleanup.md` | Legacy scope/archive notice or documentation copy; superseded by current RC docs |
| `M` | `docs/gis/deployment-checklist.md` | Legacy scope/archive notice or documentation copy; superseded by current RC docs |
| `M` | `docs/gis/import-and-publication.md` | Legacy scope/archive notice or documentation copy; superseded by current RC docs |
| `M` | `docs/gis/pilot-package-v1.md` | Legacy scope/archive notice or documentation copy; superseded by current RC docs |
| `M` | `docs/production-readiness.md` | Legacy scope/archive notice or documentation copy; superseded by current RC docs |
| `M` | `docs/search-navigation-safe-edits.md` | Legacy scope/archive notice or documentation copy; superseded by current RC docs |
| `M` | `src/app/admin/burial-records/page.tsx` | Preserved in fb99963; subsequently evolved in RC |
| `M` | `src/app/admin/coordinate-verification/page.tsx` | Preserved in fb99963; current RC identical after CRLF normalization |
| `M` | `src/app/admin/plot-management/page.tsx` | Preserved in fb99963; subsequently evolved in RC |
| `M` | `src/app/globals.css` | Preserved in fb99963; subsequently evolved in RC |
| `M` | `src/components/admin/admin-crud-pages.tsx` | Preserved in fb99963; subsequently evolved in RC |
| `M` | `src/components/admin/admin-foundation.tsx` | Preserved in fb99963; subsequently evolved in RC |
| `M` | `src/components/admin/admin-page-content.tsx` | Preserved in fb99963; subsequently evolved in RC |
| `M` | `src/components/admin/admin-shell-client.tsx` | Preserved in fb99963; subsequently evolved in RC |
| `M` | `src/components/admin/admin-sidebar.tsx` | Preserved in fb99963; subsequently evolved in RC |
| `M` | `src/components/admin/burial-record-list.tsx` | Preserved in fb99963; subsequently evolved in RC |
| `M` | `src/components/admin/coordinate-review.tsx` | Preserved in fb99963; current RC identical after CRLF normalization |
| `M` | `src/components/ui/icons.tsx` | Preserved in fb99963; current RC identical after CRLF normalization |
| `M` | `src/components/ui/page-heading.tsx` | Preserved in fb99963; current RC identical after CRLF normalization |
| `M` | `src/lib/supabase/admin-data.ts` | Preserved in fb99963; subsequently evolved in RC |
| `M` | `src/lib/supabase/database.types.ts` | Preserved in fb99963; subsequently evolved in RC |
| `M` | `src/lib/supabase/types.ts` | Preserved in fb99963; subsequently evolved in RC |
| `M` | `tests/database-contracts.test.mjs` | Preserved in fb99963; current RC identical after CRLF normalization |
| `??` | `docs/phase2-full-coverage.md` | Legacy scope/archive notice or documentation copy; superseded by current RC docs |
| `??` | `docs/superpowers/plans/2026-09-28-gis-foundation-implementation-plan.md` | Legacy scope/archive notice or documentation copy; superseded by current RC docs |
| `??` | `docs/superpowers/specs/2026-09-28-gis-foundation-design.md` | Legacy scope/archive notice or documentation copy; superseded by current RC docs |
| `??` | `src/components/admin/admin-account-menu.tsx` | Preserved in fb99963; current RC identical after CRLF normalization |
| `??` | `src/components/admin/plot-management-list.tsx` | Preserved in fb99963; subsequently evolved in RC |
| `??` | `src/components/ui/skeleton.tsx` | Preserved in fb99963; current RC identical after CRLF normalization |
| `??` | `src/components/ui/tooltip.tsx` | Preserved in fb99963; current RC identical after CRLF normalization |
| `??` | `supabase/migrations/20260908090000_add_visitor_analytics.sql` | Preserved in fb99963; current RC identical after CRLF normalization |
| `??` | `supabase/migrations/20260926170000_staff_dashboard_data.sql` | Preserved in fb99963; current RC identical after CRLF normalization |
| `??` | `supabase/migrations/20260927090000_staff_burial_records.sql` | Preserved in fb99963; current RC identical after CRLF normalization |
| `??` | `supabase/migrations/20260928090000_staff_plot_management.sql` | Preserved in fb99963; current RC identical after CRLF normalization |
| `??` | `supabase/migrations/20260928150000_staff_coordinate_verification.sql` | Preserved in fb99963; current RC identical after CRLF normalization |

The original admin dashboard, shell/account menu, skeleton/tooltip components, staff readers, coordinate-review UI, plot directory and database-contract tests therefore are not missing from the RC. All five untracked migration sources are already committed there. “Untracked here” does not mean “uncommitted everywhere.”

The documentation deltas add “current all-Phase-2 scope / legacy checkout” notices or point to the owning RC document. The current RC owns the substantive scope and archived history. Restaging old files wholesale would overwrite later work; do not do that.

### C2. RC — C:/Users/Nash/.codex/worktrees/gravenav-defense-rc/gravenav

These are the **25 previously reviewed exclusions**, preserved locally and absent from the approved committed release:

| Exact relative path | Classification |
|---|---|
| `docs/authenticated-phase2-import-executor-2026-11-17.md` | Retired authenticated executor / dependent test |
| `docs/full-phase2-dataset-preparation-2026-11-17.md` | One-off pilot/import preparation or historical evidence |
| `docs/phase2-local-staging-2026-11-16.md` | One-off pilot/import preparation or historical evidence |
| `docs/phase2-pilot-preservation-guard-2026-11-17.md` | One-off pilot/import preparation or historical evidence |
| `docs/phase2-sample-integration-2026-11-17.md` | One-off pilot/import preparation or historical evidence |
| `docs/phase2-single-pilot-rpc-2026-11-17.md` | One-off pilot/import preparation or historical evidence |
| `scripts/phase2-staging/export-target-snapshot.sql` | One-off pilot/import preparation or historical evidence |
| `scripts/phase2-staging/extract-register.py` | One-off pilot/import preparation or historical evidence |
| `scripts/phase2-staging/install-single-pilot-rpc.sql` | One-off pilot/import preparation or historical evidence |
| `scripts/phase2-staging/prepare-full-project-samples.mjs` | One-off pilot/import preparation or historical evidence |
| `scripts/phase2-staging/prepare-project-samples.mjs` | One-off pilot/import preparation or historical evidence |
| `scripts/phase2-staging/prepare.mjs` | One-off pilot/import preparation or historical evidence |
| `scripts/phase2-staging/remove-single-pilot-rpc.sql` | One-off pilot/import preparation or historical evidence |
| `scripts/phase2-staging/verify-project-workbook.py` | One-off pilot/import preparation or historical evidence |
| `src/app/admin/phase2-import/page.tsx` | Retired authenticated executor / dependent test |
| `src/app/api/admin/phase2-import/route.ts` | Retired authenticated executor / dependent test |
| `src/components/admin/phase2-import-control.tsx` | Retired authenticated executor / dependent test |
| `src/lib/phase2-import-storage.ts` | Retired authenticated executor / dependent test |
| `src/lib/phase2-import.ts` | Retired authenticated executor / dependent test |
| `tests/authenticated-phase2-import.test.mjs` | Retired authenticated executor / dependent test |
| `tests/fixtures/phase2-staging-safeguards.sql` | One-off pilot/import preparation or historical evidence |
| `tests/full-project-samples.test.mjs` | One-off pilot/import preparation or historical evidence |
| `tests/phase2-project-samples.test.mjs` | One-off pilot/import preparation or historical evidence |
| `tests/phase2-staging.test.mjs` | One-off pilot/import preparation or historical evidence |
| `tests/single-pilot-rpc.test.mjs` | One-off pilot/import preparation or historical evidence |

The retired executor has no approved production role. Its omission from the release is intentional and was previously validated with an index-only build. Keep recovery evidence privately; do not reinstall the removed pilot RPC or reactivate these controls.

### C3. Detached 418f checkout

Root: `C:/Users/Nash/.codex/worktrees/418f/gravenav`.

- `docs/GraveNav_Final_Defense_Readiness_2026-11-06.md` — untracked dated audit.
- Its entire original text, after CRLF normalization, is contained in RC `docs/archive/2026-11-06/GraveNav_Final_Defense_Readiness_2026-11-06.md`. The RC adds archive notices and later stabilization evidence. No unique application feature was found here.
- Detached `0ae8` and `ac5d` had no tracked or untracked changes.

### C4. Older private checkout — C:/Users/Nash/Documents/PROJECTS/GRAVENAV

**27 paths:** one tracked generated-file change and 26 untracked paths.

| Status | Exact relative path | Classification |
|---|---|---|
| `M` | `next-env.d.ts` | Generated Next.js dev-type paths; not a missing feature |
| `??` | `IT124_M02-SystemConstructionAndDevelopment_D3_FINAL_Nash.docx` | Academic document; private review, not an application dependency |
| `??` | `docs/design reference/ADMIN/add burial record/code.html` | Older Stitch design reference; not runtime application code |
| `??` | `docs/design reference/ADMIN/add burial record/screen.png` | Older Stitch design reference; not runtime application code |
| `??` | `docs/design reference/ADMIN/admin dashboard/code.html` | Older Stitch design reference; not runtime application code |
| `??` | `docs/design reference/ADMIN/admin dashboard/screen.png` | Older Stitch design reference; not runtime application code |
| `??` | `docs/design reference/ADMIN/admin settings/code.html` | Older Stitch design reference; not runtime application code |
| `??` | `docs/design reference/ADMIN/admin settings/screen.png` | Older Stitch design reference; not runtime application code |
| `??` | `docs/design reference/ADMIN/audit log/code.html` | Older Stitch design reference; not runtime application code |
| `??` | `docs/design reference/ADMIN/audit log/screen.png` | Older Stitch design reference; not runtime application code |
| `??` | `docs/design reference/ADMIN/burial record details/code.html` | Older Stitch design reference; not runtime application code |
| `??` | `docs/design reference/ADMIN/burial record details/screen.png` | Older Stitch design reference; not runtime application code |
| `??` | `docs/design reference/ADMIN/burial record list/code.html` | Older Stitch design reference; not runtime application code |
| `??` | `docs/design reference/ADMIN/burial record list/screen.png` | Older Stitch design reference; not runtime application code |
| `??` | `docs/design reference/ADMIN/coordinate verification/code.html` | Older Stitch design reference; not runtime application code |
| `??` | `docs/design reference/ADMIN/coordinate verification/screen.png` | Older Stitch design reference; not runtime application code |
| `??` | `docs/design reference/ADMIN/map management/code.html` | Older Stitch design reference; not runtime application code |
| `??` | `docs/design reference/ADMIN/map management/screen.png` | Older Stitch design reference; not runtime application code |
| `??` | `docs/design reference/ADMIN/photo management/code.html` | Older Stitch design reference; not runtime application code |
| `??` | `docs/design reference/ADMIN/photo management/screen.png` | Older Stitch design reference; not runtime application code |
| `??` | `docs/design reference/ADMIN/plot management/code.html` | Older Stitch design reference; not runtime application code |
| `??` | `docs/design reference/ADMIN/plot management/screen.png` | Older Stitch design reference; not runtime application code |
| `??` | `docs/design reference/ADMIN/reports analytics/code.html` | Older Stitch design reference; not runtime application code |
| `??` | `docs/design reference/ADMIN/reports analytics/screen.png` | Older Stitch design reference; not runtime application code |
| `??` | `docs/design reference/ADMIN/serene_guidance/DESIGN.md` | Older Stitch design reference; not runtime application code |
| `??` | `docs/design reference/PUBLIC/gps navigation/screen.png` | Older Stitch design reference; not runtime application code |
| `??` | `supabase/snippets/Untitled query 177.sql` | Private SQL scratch containing INSERT; not a migration or approved writer |

The `next-env.d.ts` diff only changes generated route-type imports from `.next/types/` to `.next/dev/types/`. The SQL scratch file is 206 bytes, contains INSERT and defines no new function/table/view/policy. Its values were not output or used; it is not a pending schema migration. The academic document and images were not interpreted as product source.

### C5. Ignored code/assets and configuration

| Root / exact paths | Significance and disposition |
|---|---|
| Main: `.env.local`, `supabase/.temp/`; legacy: `.env.local`, `supabase/.branches/`, `supabase/.temp/`; RC: `.env.local`, `supabase/.temp/` | Private credentials/CLI state; names only inventoried, values not opened. Not release candidates |
| Main/legacy/RC: `.next/`, `node_modules/`, `tsconfig.tsbuildinfo`; main/RC `next-env.d.ts` | Generated builds, dependencies and type caches; not missing product functionality |
| Main: `.superpowers/sdd/2026-09-28-gis-foundation-implementation-plan/` | Historical task briefs, review reports, baseline types/hashes and round-0/round-1 source/test copies. The report explicitly describes review supersession and fixture/helper corrections. The draft copies differ from final code; they are not automatically newer or missing fixes |
| Same folder: `task-2-round0/supabase__migrations__20260928170000_gis_field_evidence.sql`, `tests__gis-evidence.test.mjs`, `tests__gis-publication.test.mjs`; `task-2-round1/tests__gis-publication.test.mjs` | Inspected as scratch versions. Corresponding implemented migration/tests exist in RC history. Exact historical patch equality was not established; retain as private review evidence, not production replacements |
| Main: `tmp/full-phase2-docs/`, `tmp/phase2-map-refresh/`, `tmp/phase2-plot-coordinates/`, `tmp/visitor-map-polish/`, `tmp/phase2-unknown/` | Temporary change packages and copied source/docs. Their associated product modules and tests are committed in the RC; this is not evidence of an extra completed application feature |
| Main: `tmp/phase2-hosted-provenance/`, `tmp/phase2-project-samples/`, `tmp/phase2-staging/`, `tmp/phase2-sector-register/` | Private preparation, source matching/extraction and research helpers. Preserve privately; not a generic importer or approved geographic crosswalk |
| Main: `tmp/inspect-first-grave.py`, `inspect-sector-pdf.py`, `match-first-grave.py`, `render-first-grave-map.py`, `render-first-grave-plan.py`, `render-sector-pdf.py` | One-off private inspection/render tools. No runtime import from these paths was established; not approved app dependencies |
| Legacy: `tmp/` | Local scratch output, not an app input; no secrets/data bodies inspected |
| RC: `public/phase2-viewer/`, `public/phase2-planning/` | Required for the current local CAD landscape but deliberately ignored and absent from GitHub. Hosting requires a separate access policy; an app login does not protect static public assets |
| Visualization evidence outside Git | Source extraction plans, workbook-derived private plans, credential-free save journals, completed clearances and QA evidence remain outside the release. Known root: `C:/Users/Nash/.codex/visualizations/2026/09/23/01a0cedf-199e-7451-939a-f6477c900657/` |

No environment-value or hosted migration-state audit was attempted. Untracked migration files in a checkout do not prove that hosted Supabase is missing those migrations. Hosted application of the three latest migration definitions is documented by the prior approved work, not freshly queried here.

## D. Committed but unpushed work

### D1. Official RC — 13 unique commits not on any current origin branch

| SHA | Implemented work |
|---|---|
| `fb9996317de8f0d19e77297f2d06e51436d765ee` | Preservation checkpoint of existing admin dashboard/records, styles, staff readers, components, tests and five migration sources |
| `48703a9` | Next.js and vulnerable transitive dependency security patches |
| `ea0bcfd` | Defense stabilization audit/handoff |
| `46fdef1` | Frozen Phase 2 planning-viewer integration with local-only asset boundary |
| `b420693` | Corrected Phase 2 viewer adoption/provenance |
| `60669df` | Publication-aware geographic Phase 2 map |
| `dd1723d` | GIS begin-import/finalization deadlock prevention |
| `345fcbf` | Shared-gravesite model and field-verification preparation |
| `a9522f5` | Native integrated Phase 2 map and guarded GPS navigation |
| `2c55e0482ad2faba1cc71f11c3b21efc39213ab7` | Full-Phase-2 operational handoff and superseded-doc archives |
| `efed5b1a935b60952243d9418829aae0dfeba78b` | Three already-applied migration definitions |
| `c56aade2a27a2b9f0cc946776bad4c3e7a4c82b2` | Owner/record management, protected visibility/preview, map/branding and regression tests |
| `c2a4183e65c05c96da7854f40367124808e9b0a6` | Documentation, import completion evidence and release readiness |

A new-branch push publishes this full reachable history, not just the last three commits. Sixteen other RC commits beyond origin/main are already reachable through other official GitHub branches; they are not another 16 unpublished changes. Local main's five-behind state likewise is not five missing RC commits.

### D2. Private legacy repository — three unique unpublished feature commits

| SHA | Work / compatibility |
|---|---|
| `7ad242eb3d4be796db347ab48bbc5f83416240e9` | 52-file alternate public Stitch experience: search cards/forms, memorial pages, map/distance-direction UI, public projection RPC migration `20260921120000_public_memorial_experience.sql`, SQL tests and public UI tests |
| `1e40563c0215cb512ffd12f04fdcab29ced55fac` | 24-file alternate admin experience: dashboard, protected reports/analytics, print action, coordinate/photo/audit/settings surfaces and shared theme/navigation |
| `a1e47ed9a9301bd6695976cb7acef57221a97ef2` | Search-result action always opens the memorial profile instead of bypassing it for verified destinations; adds public SQL regression checks |

Stable Git patch IDs of these three changes did **not** match any inspected official local/remote-ref history. This proves no exact patch duplication; it does not imply the RC lacks equivalent behavior.

Important source distinctions:
- Legacy data readers use `deceased_persons`, `interments`, `plots`, `gravesite_coordinates` and RPCs such as `get_public_memorial`.
- RC workflows use `deceased`, `burial_record`, `lot`, `staff_save_record`, active ADMIN/MANAGER permissions, revision receipts and current shared-interment/publication guards.
- Legacy `src/components/public-navigation-experience.tsx` computes straight-line distance/bearing. It is not an equivalent implementation of the RC's reviewed-network routing or its navigation-policy gates.
- The last legacy search fix has a behavioral counterpart in RC memorial-first result actions and protected query-preserving preview links. It is not evidence that the RC requires that commit.
- The misleadingly named `feature/safe-import-pipeline` tip is an older authorization commit already reachable from the private main branch. It is not another unpublished importer.

Do not merge/cherry-pick this implementation or its SQL into the RC wholesale. Preserve its unique history in its existing private repository after separate review/authorization.

### D3. Already-published official work missing from RC

`b2784832b4b02d76f3456716e4ee712870cd1e84`, branch `origin/docs/gravenav-professional-readme`, changes only README.md: 138 additions, 39 removals compared with its merge base. It documents setup, roles, local/hosted configuration, tests and contributors. RC README has different current full-Phase-2/map safeguards. Reconcile useful documentation deliberately; do not replace RC README wholesale or report this as an unpublished commit.

## E. Important work missing from the release — ranked findings

### Critical

**None verified.** No additional source or migration required by the approved Milestones 1–5 was demonstrated to be missing from the RC. This does not certify hosted runtime configuration or geographic readiness.

### High — preservation risks

1. **Independent private repository has three unique unpublished feature commits.**
   - Location: `C:/Users/Nash/Documents/PROJECTS/GRAVENAV`; branches and SHAs in D2.
   - Status: implemented source and tests, committed locally; runtime/hosted acceptance not rerun. Private GitHub origin has only main.
   - Dependencies/risk: its own schema, auth helper, plural table names, route structure and database RPCs. Wholesale import could duplicate routes and weaken current publication/GIS guarantees.
   - Recommendation: preserve the three commits through an explicitly approved push of its existing feature branch to **its private origin**, or an approved private backup. Treat any RC port as a separate bounded task. Not a prerequisite to staging the already complete 120-path scope.

2. **Standalone field tester and CAD source are nongit and outside the RC release.**
   - GPS utility root: `C:/Users/Nash/Documents/GraveNav-QGIS/standalone-gps-field-tester`.
   - Exact implementation: `index.html`, `styles.css`, `app.js`, `core.js`, `gps.js`, `server.mjs`, `data/points.json`, `scripts/build-data.py`, `scripts/verify-integrity.py`, `tests/app.test.mjs`, `tests/core.test.mjs`, `README.md`, `qa/VALIDATION.md`.
   - Inspected behavior: actual geolocation watch lifecycle, stale-fix/validity handling, localStorage session retention, CSV/JSON export, distance/statistical summaries and six-asset allowlisted server. No production Supabase/Auth connection. Source metadata describes 36 unverified experimental targets.
   - Status: implemented, with a dated **13 October 2026** local validation report. No fresh tests, smartphone checks or field acceptance were performed here. It is not verified public navigation.
   - Dependencies/risk: target/provenance JSON and physical observations remain private; app storage is device-local; phone access requires separately approved HTTPS. No Git remote/commit protects this directory.
   - CAD source root: `C:/Users/Nash/Documents/GraveNav-Phase2-CAD/phase2-digital-map`; Vite/React source, Blender scripts/scenes and sealed runtime package also lack Git history. The sealed and RC-installed `data/phase2.local.json` both hash to `02a4dba490872f9be8cf56280ccf432d31796431c1f808f542fbff86ac28ca77`. Thus native geometry is preserved locally in two locations, not silently missing from local RC use.
   - Recommendation: approved private backup/versioning of code and sealed evidence; preserve originals. Do not place target coordinates, CAD or collected observations in the public application release.

### Medium — useful alternative functionality / release exposure

3. **Legacy reports offer monthly analytics and printing not present in the current RC Reports page.**
   - Legacy: `src/app/admin/(protected)/reports/page.tsx`, `src/lib/admin/overview.ts`, `src/components/admin-print-button.tsx`, committed in `1e40563`.
   - Functionality: current-year monthly active-interment chart, occupancy/verification charts, sector breakdown and browser print action.
   - RC: `src/components/admin/admin-page-content.tsx:AdminReportsPage` currently supplies protected record-summary CSV and summary counts; `admin-foundation.tsx` already has operational dashboard panels.
   - Status: a distinct implemented legacy UI exists, but compatibility and complete-data correctness are not validated for the RC. Its reader uses bounded row counts and the older schema; it has no knowledge of the approved P2S physical-inventory exclusion rules.
   - Recommendation: optional follow-up scope to adapt only approved report requirements through existing RC protected readers and correct physical/synthetic aggregation. Do not merge the legacy analytics readers or add old migrations as a quick fix.

4. **A push still triggers a protected Vercel Preview with absent private map assets.**
   - Earlier live inspection in this chat verified Vercel project `github-final`, team `bosstwenty1s-projects`, Production tracking `main`, Preview tracking all unassigned branches, Automatic ignored-build behavior, no custom environments and no deploy hooks.
   - The configuration was **not re-read in this audit** and no toggle was changed. No push was performed.
   - That prior result means deployment must not be assumed disabled. The excluded runtime map payload is absent from a Git build; CAD landscape functionality will be unavailable. Exact current Supabase target values remain unverified because Vercel stores the variables write-only.
   - Recommendation: separately approve and verify the intended deployment-suppression action before the branch push. Git readiness is not deployment authorization.

### Low

5. **Professional README improvements exist on GitHub but are not reconciled into the RC.** See D3. Handle through a small separate documentation review; they do not block application compilation.

6. **Dirty legacy checkouts and duplicate reports can be mistaken for unsaved new features.** The 38-path main checkout and the single 418f report are accounted for by preservation/supersession. Preserve them until an approved cleanup; no cleanup is proposed or performed.

### Intentionally excluded

- The RC's 25 temporary executor/pilot/preparation files.
- Private CAD/GIS payloads, source/field coordinates and client documents.
- Real cemetery records, backups, workbook-derived extracts and the authoritative workbook.
- Credentials and Supabase CLI state.
- Private receipt/recovery evidence, complete clearances and QA artifacts.
- Old alternate-design screenshots/HTML and academic DOCX, unless a future documentation/archive task explicitly selects them.
- Generated dependencies/builds/types and superseded draft copies.

## F. Previously approved release verification

The committed tree still equals the approved, validated staged release tree:

`ca1e4a519d272c12514ee8c3276c439e644d44e0`.

| Commit | Files | Verification |
|---|---:|---|
| `efed5b1a935b60952243d9418829aae0dfeba78b` | 3 migrations | Exact approved group |
| `c56aade2a27a2b9f0cc946776bad4c3e7a4c82b2` | 84 app/map/branding/tests | Exact approved group |
| `c2a4183e65c05c96da7854f40367124808e9b0a6` | 33 documents | Exact approved group |

The changed-path union is **120**, with **120 unique paths**, each committed exactly once; the manifest comparison is exact. No release commit was amended or rewritten. The intentional favicon deletion, replacement logo, poster and two video formats remain within the reviewed scope.

The authorized EOF fix is retained. All three migration definitions are logically unchanged. The approved CRLF/LF distinction remains:
- `20261117010000_project_sample_plot_reference.sql`: reviewed working-file SHA-256 `2fca92c1417b9767d6640f2c97e6202d03c0797152018c250d53b186a3161832`; committed LF SHA-256 `9bd78de162bbbd6462c42549f699d8d6c2d2403b217ed87628c605d52041d38f`.
- Inventory correction retains `f4a257e463b5c22cb0b728349744beb646a15ef1b647daddf6eac3b9e0d3350e`.
- No hosted SQL was executed by this audit.

Current source inspection confirms the M1–5 routes/components, safe staff preview readers, visibility controls, plot lists, dashboard readers, coordinate-review modules and navigation-policy boundaries are present. File/commit correspondence and the unchanged tree support dependency preservation; they do not establish new browser/hosted test results.

The earlier final staged-export validation reported 63 focused tests passed, three private-CAD checks skipped, TypeScript/lint/production Webpack build passed, with one existing lint warning. Those are **earlier results for the identical tree**, not tests rerun during this audit. No repeated tests/builds or broad database investigations were needed.

## G. Private and local-only dependencies

Do not equate “absent from GitHub” with “should be committed.”

- **CAD runtime:** the ignored RC directories are local dependencies with intentionally withheld publishing rights. Their absence prevents a complete hosted landscape; it does not justify publishing original geometry, inferred GPS or private assets.
- **Geographic evidence:** QGIS handoffs/drafts, the field tester's unverified target data, observations and source provenance are not verified public destinations. Preserve all uncertainty and source identities.
- **Records:** the Phase 2 workbook, imported-data preparation and database backups remain private inputs/evidence. This audit did not read real records, query hosted data or change any visibility/publication state.
- **Recovery:** keep completed import receipts/journals privately. Recovery usefulness does not make the executor a permanent application feature.
- **Credentials:** environment files, CLI runtime state, auth tokens, cookies, keys and backup contents were not opened. No secret values belong in this report or a Git push.
- **GitHub visibility:** the official repository is public; the older repository is private. Do not transfer private legacy assets/data into the public repo merely to consolidate history.
- **Other systems:** the Divine Life PHP/MySQL downloads and its v2 prototype are separate reference/development material; do not incorporate their config, database dumps or demo identities into GraveNav.

## H. Recommended actions — smallest safe sequence

1. Preserve both repositories and all nongit CAD/GPS workspaces. No cleanup, reset or bulk staging is needed. Keep the 25 RC exclusions and all private inputs outside the public release.
2. Review the three unique legacy commits for a private backup/push to their **existing private repository**. Do not combine overlapping branch counts, migrate schemas or merge that implementation into the RC.
3. Keep optional legacy analytics/print porting and professional README reconciliation as separate explicitly approved follow-ups. Neither requires reopening M1–5 implementation now.
4. Resolve the automatic Vercel Preview trigger under separate approval. The previously reviewed minimal option is temporarily disabling this project's Preview Branch Tracking; it affects all non-production branches. Do not change it as part of this audit.
5. Once deployment effects and the complete **13-commit** official history are approved, perform only the intended normal RC branch push. Do not push main or use a mirror/all/force push. Recheck refs immediately before any future push.
6. Review this newly created audit document separately before deciding whether to add a fourth documentation commit. It is **not** silently added to the 120-file release or the three existing commits.
7. Plan geographic hosting/access and actual-phone acceptance separately. Keep the 100 imported records' pending/hidden/unconfirmed policy unchanged.

## I. Final assessment

1. **Are there important uncommitted changes?** Yes: nongit CAD/GPS application/tooling and private recovery/research evidence need preservation. The main checkout's application changes are already preserved in RC history. The older checkout's tracked change is generated; its untracked references/academic document/SQL scratch are not additional completed RC features.
2. **Are there important commits not yet pushed?** Yes: 13 unique official-RC commits, plus three unique commits in the separate private repository. Each repository was compared with freshly verified remote refs.
3. **Is a completed feature missing from the RC?** The independent standalone observation/export utility and alternate legacy reporting/print UI are absent. They are implemented local work, but not proven compatible, field-accepted production features that should be merged wholesale. No additional mandatory completed M1–5 dependency was found missing.
4. **Could anything be accidentally lost?** Yes: unpublished private-repository history, nongit CAD/GPS source and private receipts/backups can be lost through directory deletion or unapproved cleanup. Main-checkout dirtiness is not permission to discard it. No stash-only/reflog-only commit was identified.
5. **Is the RC safe to push as-is?** Its normal non-force Git history is ready and the 120-path release is internally consistent. **Do not push yet under the current no-deployment instruction**: the last verified Vercel settings automatically create a Preview. Obtain approval for the deployment-suppression or explicitly accepted preview outcome first. No newly discovered application merge is required merely to preserve this approved release.

**Verdict:** preserve the distinct private/nongit work, keep the approved RC intact, and resolve automatic Preview deployment before publication.

**Not checked:** fresh runtime acceptance of the old implementation or standalone GPS tester; actual-phone/site behavior; credential values; private record/backup bodies; current hosted schema/data; inaccessible or differently named copies outside the identified roots; arbitrary unreachable objects whose reflogs expired. Prior Vercel findings are identified as prior evidence. No additional app-wide vulnerability, load or performance certification is claimed.
