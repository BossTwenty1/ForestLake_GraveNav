# Exact release file manifest — 18 November 2026

Branch: codex/defense-release-stabilization-20261106; HEAD: 2c55e0482ad2faba1cc71f11c3b21efc39213ab7. Nothing staged.

Baseline: 55 tracked changes and 88 untracked files. Current decisions: 120 include, 25 exclude.

Paths are exact repository-relative paths. INCLUDE describes a proposed Git scope, not authorization to stage, commit, apply SQL or deploy.

Shared files (admin-crud-pages, global CSS, admin-data, types) contain changes from multiple milestones. Keep them whole in group 2; avoid arbitrary hunk splitting.

The existing auth.ts optional request-client argument is retained: it is harmless compatibility code and removing it is outside this preparation phase.

All six temporary executor files are excluded together; no included source/test imports them. The current RC keeps its retired 404 control. A release made from this allowlist contains no importer route at all.

Excluded local files are preserved; no deletion or staging is proposed. Historical docs can mention excluded utilities as evidence without making them deployment inputs.

## INCLUDE: Project documentation

| Action | Exact path | Group |
|---|---|---|
| modify | `AGENTS.md` | 4-docs |
| modify | `README.md` | 4-docs |
| modify | `docs/GraveNav_Database_Implementation_Notes.md` | 4-docs |
| modify | `docs/README.md` | 4-docs |
| modify | `docs/archive/2026-09-28/gis-deployment-history.md` | 4-docs |
| modify | `docs/archive/2026-09-28/gis-foundation-implementation-plan.md` | 4-docs |
| modify | `docs/archive/2026-11-06/GraveNav_Final_Defense_Readiness_2026-11-06.md` | 4-docs |
| modify | `docs/archive/2026-11-09/phase2-readiness-history.md` | 4-docs |
| modify | `docs/archive/phase1/README.md` | 4-docs |
| modify | `docs/archive/phase1/forest-lake-phase1-kml-cleanup.md` | 4-docs |
| modify | `docs/archive/schema/README.md` | 4-docs |
| modify | `docs/gis/import-and-publication.md` | 4-docs |
| modify | `docs/gis/pilot-package-v1.md` | 4-docs |
| modify | `docs/phase2-local-defense.md` | 4-docs |
| modify | `docs/production-readiness.md` | 4-docs |
| modify | `docs/search-navigation-safe-edits.md` | 4-docs |
| modify | `docs/superpowers/specs/2026-09-28-gis-foundation-design.md` | 4-docs |
| add | `docs/burial-record-management-2026-11-17.md` | 4-docs |
| add | `docs/full-phase2-dataset-import-policy-2026-11-17.md` | 4-docs |
| add | `docs/full-phase2-import-completed-2026-11-17.md` | 4-docs |
| add | `docs/phase2-full-coverage.md` | 4-docs |
| add | `docs/phase2-map-details-2026-11-13.md` | 4-docs |
| add | `docs/phase2-plot-coordinates-2026-11-15.md` | 4-docs |
| add | `docs/phase2-search-threshold-fix-2026-11-17.md` | 4-docs |
| add | `docs/phase2-unknown-availability-2026-11-16.md` | 4-docs |
| add | `docs/plot-owner-management-2026-11-17.md` | 4-docs |
| add | `docs/professional-visitor-preview-2026-11-17.md` | 4-docs |
| add | `docs/release-file-manifest-2026-11-18.md` | 4-docs |
| add | `docs/release-preparation-phase1-2026-11-18.md` | 4-docs |
| add | `docs/synthetic-inventory-readiness-2026-11-17.md` | 4-docs |
| add | `docs/synthetic-inventory-sql-applied-2026-11-17.md` | 4-docs |
| add | `docs/visitor-map-presentation-2026-11-15.md` | 4-docs |
| add | `docs/visitor-visibility-2026-11-17.md` | 4-docs |

Current scope, operational handoff, approved policy, completion evidence or archived history. Historical utility paths are provenance, not runtime dependencies.

## INCLUDE: Completed Milestones 1–5

| Action | Exact path | Group |
|---|---|---|
| modify | `next.config.ts` | 2-records-visitor |
| modify | `src/app/admin/burial-records/page.tsx` | 2-records-visitor |
| modify | `src/app/admin/owner-data/page.tsx` | 2-records-visitor |
| modify | `src/app/admin/plot-management/page.tsx` | 2-records-visitor |
| modify | `src/app/globals.css` | 2-records-visitor |
| modify | `src/app/gravesite/page.tsx` | 2-records-visitor |
| modify | `src/components/admin/admin-crud-pages.tsx` | 2-records-visitor |
| modify | `src/components/admin/admin-foundation.tsx` | 2-records-visitor |
| modify | `src/components/admin/admin-shell-client.tsx` | 2-records-visitor |
| modify | `src/components/admin/admin-sidebar.tsx` | 2-records-visitor |
| modify | `src/components/admin/burial-record-list.tsx` | 2-records-visitor |
| modify | `src/components/admin/plot-management-list.tsx` | 2-records-visitor |
| modify | `src/components/visitor/gravesite-location-card.tsx` | 2-records-visitor |
| modify | `src/components/visitor/public-search-result-card.tsx` | 2-records-visitor |
| modify | `src/lib/auth.ts` | 2-records-visitor |
| modify | `src/lib/supabase/admin-data.ts` | 2-records-visitor |
| modify | `src/lib/supabase/database.types.ts` | 2-records-visitor |
| modify | `src/lib/supabase/gis-types.ts` | 2-records-visitor |
| modify | `src/lib/supabase/public-data.ts` | 2-records-visitor |
| modify | `src/lib/supabase/types.ts` | 2-records-visitor |
| modify | `src/proxy.ts` | 2-records-visitor |
| add | `src/app/admin/burial-records/[id]/edit/page.tsx` | 2-records-visitor |
| add | `src/app/admin/burial-records/[id]/page.tsx` | 2-records-visitor |
| add | `src/app/admin/burial-records/[id]/preview/error.tsx` | 2-records-visitor |
| add | `src/app/admin/burial-records/[id]/preview/page.tsx` | 2-records-visitor |
| add | `src/app/admin/burial-records/new/page.tsx` | 2-records-visitor |
| add | `src/app/admin/burial-records/preview/page.tsx` | 2-records-visitor |
| add | `src/app/admin/owner-data/[id]/edit/page.tsx` | 2-records-visitor |
| add | `src/app/admin/owner-data/[id]/page.tsx` | 2-records-visitor |
| add | `src/app/admin/owner-data/new/page.tsx` | 2-records-visitor |
| add | `src/components/admin/burial-record-pages.tsx` | 2-records-visitor |
| add | `src/components/admin/owner-pages.module.css` | 2-records-visitor |
| add | `src/components/admin/owner-pages.tsx` | 2-records-visitor |
| add | `src/components/admin/record-visibility.tsx` | 2-records-visitor |
| add | `src/components/visitor/memorial-profile.tsx` | 2-records-visitor |
| add | `src/lib/burial-records.ts` | 2-records-visitor |
| add | `src/lib/record-visibility.ts` | 2-records-visitor |
| add | `src/lib/supabase/staff-visitor-preview.ts` | 2-records-visitor |
| add | `src/lib/synthetic-plots.ts` | 2-records-visitor |
| add | `src/lib/visitor-presentation.ts` | 2-records-visitor |

Protected records, safe references, visibility, preview and shared presentation dependencies.

## INCLUDE: Branding and visitor introduction

| Action | Exact path | Group |
|---|---|---|
| delete | `src/app/favicon.ico` | 3-map-branding |
| modify | `src/app/layout.tsx` | 3-map-branding |
| modify | `src/app/page.tsx` | 3-map-branding |
| modify | `src/components/brand-lockup.tsx` | 3-map-branding |
| add | `public/forest-lake-logo.png` | 3-map-branding |
| add | `public/videos/visitor-journey-poster.jpg` | 3-map-branding |
| add | `public/videos/visitor-journey.mp4` | 3-map-branding |
| add | `public/videos/visitor-journey.webm` | 3-map-branding |
| add | `src/components/visitor/hero-visitor-video.module.css` | 3-map-branding |
| add | `src/components/visitor/hero-visitor-video.tsx` | 3-map-branding |

Required logo/video imports and intentional favicon replacement. No private CAD files are included.

## INCLUDE: Existing map/navigation presentation

| Action | Exact path | Group |
|---|---|---|
| modify | `src/app/map/page.tsx` | 3-map-branding |
| modify | `src/app/search/page.tsx` | 3-map-branding |
| modify | `src/components/admin/admin-cemetery-map.tsx` | 3-map-branding |
| modify | `src/components/visitor/cemetery-leaflet-map.tsx` | 3-map-branding |
| modify | `src/components/visitor/map-explorer.tsx` | 3-map-branding |
| modify | `src/components/visitor/navigation-route-map.tsx` | 3-map-branding |
| modify | `src/components/visitor/phase2-geographic-canvas.tsx` | 3-map-branding |
| modify | `src/components/visitor/phase2-geographic-map.tsx` | 3-map-branding |
| modify | `src/components/visitor/phase2-planning-canvas.tsx` | 3-map-branding |
| modify | `src/lib/phase2-planning.ts` | 3-map-branding |
| modify | `tests/phase2-only-navigation.test.mjs` | 3-map-branding |
| add | `scripts/build-phase2-cad-details.py` | 3-map-branding |
| add | `scripts/build-phase2-plot-coordinates.py` | 3-map-branding |
| add | `src/components/visitor/map-explorer.module.css` | 3-map-branding |
| add | `src/components/visitor/phase2-planning-canvas.module.css` | 3-map-branding |
| add | `src/components/visitor/plot-coordinate-details.module.css` | 3-map-branding |
| add | `src/components/visitor/plot-coordinate-details.tsx` | 3-map-branding |
| add | `src/lib/phase2-cad-details.ts` | 3-map-branding |
| add | `src/lib/phase2-plot-coordinates.ts` | 3-map-branding |
| add | `tests/phase2-cad-details.test.mjs` | 3-map-branding |
| add | `tests/phase2-plot-coordinates.test.mjs` | 3-map-branding |
| add | `tests/visitor-map-presentation.test.mjs` | 3-map-branding |

Preserve existing Phase 2 presentation and dependent modules/tests. Map assets remain separately excluded and local-only.

## INCLUDE: Required regression / browser tests

| Action | Exact path | Group |
|---|---|---|
| modify | `tests/gis-concurrency.test.mjs` | 2-records-visitor |
| modify | `tests/shared-interments.test.mjs` | 2-records-visitor |
| add | `tests/burial-record-browser.mjs` | 2-records-visitor |
| add | `tests/burial-record-management.test.mjs` | 2-records-visitor |
| add | `tests/fixtures/public-search-threshold.sql` | 2-records-visitor |
| add | `tests/owner-browser.mjs` | 2-records-visitor |
| add | `tests/owner-management.test.mjs` | 2-records-visitor |
| add | `tests/public-search-threshold.test.mjs` | 2-records-visitor |
| add | `tests/record-visibility.test.mjs` | 2-records-visitor |
| add | `tests/synthetic-inventory.test.mjs` | 2-records-visitor |
| add | `tests/unknown-availability.test.mjs` | 2-records-visitor |
| add | `tests/visitor-preview.test.mjs` | 2-records-visitor |

Product safety, local fixture or presentation regression coverage; no private workbook dependency.

## INCLUDE: Required schema history / synthetic inventory

| Action | Exact path | Group |
|---|---|---|
| add | `supabase/migrations/20261116010000_unknown_plot_availability.sql` | 1-schema |
| add | `supabase/migrations/20261117010000_project_sample_plot_reference.sql` | 1-schema |
| add | `supabase/migrations/20261117020000_separate_synthetic_plot_inventory.sql` | 1-schema |

Already-applied forward migration belongs in version history; inclusion does not authorize execution. Preserve exact bytes.

## EXCLUDE: Obsolete pilot/import preparation and evidence

| Action | Exact path | Group |
|---|---|---|
| add | `docs/authenticated-phase2-import-executor-2026-11-17.md` | local-evidence |
| add | `docs/full-phase2-dataset-preparation-2026-11-17.md` | local-evidence |
| add | `docs/phase2-local-staging-2026-11-16.md` | local-evidence |
| add | `docs/phase2-pilot-preservation-guard-2026-11-17.md` | local-evidence |
| add | `docs/phase2-sample-integration-2026-11-17.md` | local-evidence |
| add | `docs/phase2-single-pilot-rpc-2026-11-17.md` | local-evidence |
| add | `scripts/phase2-staging/export-target-snapshot.sql` | local-evidence |
| add | `scripts/phase2-staging/extract-register.py` | local-evidence |
| add | `scripts/phase2-staging/install-single-pilot-rpc.sql` | local-evidence |
| add | `scripts/phase2-staging/prepare-full-project-samples.mjs` | local-evidence |
| add | `scripts/phase2-staging/prepare-project-samples.mjs` | local-evidence |
| add | `scripts/phase2-staging/prepare.mjs` | local-evidence |
| add | `scripts/phase2-staging/remove-single-pilot-rpc.sql` | local-evidence |
| add | `scripts/phase2-staging/verify-project-workbook.py` | local-evidence |
| add | `tests/fixtures/phase2-staging-safeguards.sql` | local-evidence |
| add | `tests/full-project-samples.test.mjs` | local-evidence |
| add | `tests/phase2-project-samples.test.mjs` | local-evidence |
| add | `tests/phase2-staging.test.mjs` | local-evidence |
| add | `tests/single-pilot-rpc.test.mjs` | local-evidence |

Completed one-off staging/pilot preparation; not needed by product routes or release tests. Keep locally, never reinstall pilot RPC.

## EXCLUDE: Temporary import executor

| Action | Exact path | Group |
|---|---|---|
| add | `src/app/admin/phase2-import/page.tsx` | local-evidence |
| add | `src/app/api/admin/phase2-import/route.ts` | local-evidence |
| add | `src/components/admin/phase2-import-control.tsx` | local-evidence |
| add | `src/lib/phase2-import-storage.ts` | local-evidence |
| add | `src/lib/phase2-import.ts` | local-evidence |
| add | `tests/authenticated-phase2-import.test.mjs` | local-evidence |

Retired temporary control; omit the complete six-file dependency island, including its private-plan-dependent test. Keep local recovery evidence.

## Always excluded private/local artifacts

- `.env.local`
- `node_modules/`
- `.next/`
- `*.tsbuildinfo`
- `public/phase2-viewer/`
- `public/phase2-planning/`
- `C:/Users/Nash/Downloads/GraveNav_Phase2_Demo.xlsx`
- `Private pinned plans, source extracts, credential-free receipt journals, clearances and browser QA outside the repository`

All already tracked, unchanged dependencies remain part of the release base. This is the exact change manifest, not a replacement for the repository.
