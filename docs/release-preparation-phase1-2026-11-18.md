# Release preparation phase 1 — 18 November 2026

This is local preparation only. No files were staged, discarded, committed or pushed;
no deployment, hosted record write, publication, migration application or Supabase
configuration change was performed. The maintained RC remains on
`codex/defense-release-stabilization-20261106`, HEAD
`2c55e0482ad2faba1cc71f11c3b21efc39213ab7`.

## Local changes

Plot Management's garden selector now says:

> Choose the recorded Phase 2 garden / area for this plot.

This replaces the outdated four-Phase-1-gardens instruction. A bounded search of the
admin source found no other Phase 1 garden labels. Garden options, plot admission,
capacity, saves and coordinate checks are unchanged.

The existing owner and deceased browser acceptance scripts were updated for both
themes and current UI wording. They open Internal Record Details before checking
its contents. An opt-in Webpack flag supports the disposable QA export's junctioned
dependencies; normal application builds still use Turbopack. No dependencies were
installed or changed. No additional application UI defect required a fix in this pass.

## Proposed release scope

The initial working tree had exactly 55 changed tracked files and 88 untracked files,
with no staged files. The two new release documents add two untracked files.
The exact per-path scope is in [the release manifest](release-file-manifest-2026-11-18.md).
Its corresponding machine-readable JSON includes status, SHA-256, action, category,
commit group and reason for each changed file.

Proposed disposition: 120 included changes and 25 excluded local files. The 120
include this report and the manifest. Already tracked, unchanged dependencies remain
part of the release base. The intentional favicon deletion is paired with the new
Forest Lake logo and layout metadata; the hero uses all three included video assets.

Include the completed owner/record pages, shared forms, visibility controls, protected
search/profile preview, safe-reference helpers, theme/layout integration, existing map
presentation modules, branding assets, relevant regression tests and current documents.
The following three already-applied migrations must remain in Git history unchanged:

- `20261116010000_unknown_plot_availability.sql`
- `20261117010000_project_sample_plot_reference.sql`
- `20261117020000_separate_synthetic_plot_inventory.sql`

Including migration files does not authorize applying them again. The existing local
type snapshots are included; no new schema change is proposed.

Exclude the complete retired executor dependency island: its two routes, component,
core/storage helpers and private-plan-dependent test. Also exclude the obsolete
pilot/staging scripts and their dependent tests/fixture, plus six superseded utility
reports. Retain them locally as recovery/provenance evidence; never reinstall the
pilot RPC. No included executable source or test references an excluded utility.
Historical paths in retained documentation describe past operations, not deployment
instructions. The harmless existing auth helper's optional request-client parameter
is preserved to avoid an unrelated authentication refactor.

Always exclude `.env.local`, credentials, `.next`, `node_modules`, TypeScript caches,
IDE files, logs, QA screenshots, private CAD directories, the workbook, private source
extracts/plans, progress/receipt journals and completed clearances. They are not release
inputs. The file-name and high-confidence credential-pattern checks found no sensitive
candidate in the proposed include set; this is not a claim of an exhaustive secret audit.

## Suggested commits after separate approval

1. **Schema history:** the three already-applied migration definitions.
2. **Application and regression tests:** completed Milestones 1–5, existing map and
   branding dependencies, shared types/styles and their tests. Keep this group together:
   shared files contain multiple milestones, so splitting by milestone would require
   arbitrary hunk staging and risks missing imports or assets.
3. **Operational handoff:** current/archived project docs, import completion evidence
   and the exact release manifest/readiness report.

The manifest's groups 2-records-visitor and 3-map-branding belong to the same proposed
application commit. Review the allowlist and staged diff explicitly when committing is
authorized; never use blanket staging. Recheck hashes if files change after this review.

## Validation and acceptance boundaries

- 58 focused local regression checks passed for owners, deceased/interments,
  visibility, safe preview projection/links, physical-vs-synthetic inventory,
  visitor behavior, map safeguards and retired importer behavior.
- TypeScript (`tsc --noEmit --incremental false`), lint and the normal production
  Turbopack build passed on the RC. Lint retains only the pre-existing unused `mkdir`
  warning in `tests/gis-package.test.mjs`. Whitespace checks passed.
- Four isolated owner browser journeys passed: desktop ADMIN and 390px MANAGER,
  each in light/dark themes. They cover search/pagination, relationships, registration
  without a plot, redirect, editing, failure recovery, layout and denied access.
- Four isolated deceased browser journeys passed: desktop ADMIN and 390px MANAGER,
  each in light/dark themes. Disposable loopback fixtures cover registration/editing,
  protected publish/hide, private preview, validation, revision conflicts, retries and
  anonymous/inactive access denial. No hosted record was saved.
- The proposed release export also passed TypeScript and a production Webpack build
  without the 25 excluded files, private environment settings or local CAD assets.
  This verifies the selected files' build dependencies, not hosted map availability.
- The existing visitor renderer passed eight isolated search/profile cases at
  1440px/390px in light/dark themes, including long/missing fields, horizontal overflow
  and keyboard links. This is presentation testing without the user's session.
- Plot Management's physical/synthetic presentation and reader boundaries passed
  local fixture/render tests; its full signed-in visual interactions remain manual.
- Existing focused tests and source inspection cover native labels, focus indicators,
  validation error focus, confirmation-dialog focus management and private/no-store,
  noindex preview routes. Full keyboard/screen-reader certification was not performed.

Fresh anonymous local HTTP checks: homepage/search return 200, Tomas public search
shows no matching records, public profile ID 5 redirects to record-not-found, protected
preview redirects to login with noindex headers, and the importer returns 404.
No authenticated hosted save was exercised. The previous verified hosted import and
preservation results were not re-investigated in this preparation phase.

## Manual acceptance still required

Use the existing genuine account at `http://127.0.0.1:3237`. Do not submit saves or
change visibility during this read-only acceptance. Repeat at desktop and 390px in
both themes; tab through controls, check visible focus and readable errors, and confirm
that long names/references wrap without page-level horizontal scrolling.

| Surface | Exact path |
| --- | --- |
| Plot Owners directory | `/admin/owner-data` |
| Owner registration | `/admin/owner-data/new` |
| Imported owner profile/editor | `/admin/owner-data/2` and `/admin/owner-data/2/edit` |
| Deceased & Interments directory | `/admin/burial-records` |
| Record registration | `/admin/burial-records/new` |
| Tomas profile/editor and visibility | `/admin/burial-records/5` and `/admin/burial-records/5/edit` |
| Plot list, filters and existing editor | `/admin/plot-management` |
| Protected search | `/admin/burial-records/preview?query=Tomas%20Kuwento` |
| Protected memorial | `/admin/burial-records/5/preview` |

Check directory-to-profile-to-edit/back navigation, form labels/required fields,
disabled Publish Record for pending records, expandable Internal Record Details,
physical totals of 4,494 and the separate synthetic count of 90. The user previously
confirmed genuine Tomas search/profile/return navigation. This task does not claim
fresh authenticated visual inspection; the built-in browser restriction was respected
and personal Chrome windows were not accessed.

Protected preview is an authenticated presentation of otherwise hidden records.
It does not publish them. Normal anonymous public search/profile/roster/GIS eligibility
remains unchanged. The 100 imported records are not made public by this release scope.
The current local importer remains hard-disabled and retired, with no active clearance
and its journal preserved. The proposed release omits the importer entirely.

## Deployment dependencies — no hosted changes authorized

The public production HTTPS origin has not been supplied/verified. The current local
origin is loopback. Before deployment, select the exact authorized `https://<host>` and
verify `NEXT_PUBLIC_APP_ORIGIN`, Supabase Auth Site URL, and exact callback allowlist
entries for `/auth/callback` (including the invitation flow). Keep intended local
callbacks separately; do not use wildcard redirects. Test sign-in/out, refresh,
invitation/password setup and active/inactive role handling on the actual target.

Verify project `ddoowghocqyfoxaikifb`, its public publishable/anon key and the deployed
migration state. Provisioning requires the existing server-only Auth Admin credential
only if account provisioning is enabled; it is not needed for ordinary owner/record
saves. Photo uploads need the approved private Storage bucket and policies. No actual
key values belong in the manifest, repository, build logs or client bundle.

`public/phase2-viewer` and `public/phase2-planning` remain ignored, local-only assets.
A Git-based build of this allowlist has no CAD assets; a filesystem upload of the dirty
RC would risk including them. Obtain Forest Lake's explicit choice between approved
public distribution of a precisely reviewed map package and restricted authenticated
map delivery. Restricted delivery needs an approved protected serving path; the
present static public directories provide no such restriction. Until that decision
and implementation/package review, hosted mapping remains blocked. Do not upload,
bundle or force-add these directories.

Geographic scope and navigation-policy variables are currently unset. Leave GPS
unavailable until approved geographic coverage, publication, access routes and field
evidence exist. Configuring IDs or showing a CAD outline is not verification. Shared
interment confirmation/publication rules must remain intact. These gates do not block
the protected records and presentation-preview workflows.

Private preparation evidence is outside the repository under
`C:/Users/Nash/.codex/visualizations/2026/09/23/01a0cedf-199e-7451-939a-f6477c900657/`.
It includes the before-file snapshot, machine-readable manifest/allowlist and disposable
release-scope validation copy. None of that directory is proposed for Git or deployment.
