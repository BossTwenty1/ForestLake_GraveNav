# Archived reference — superseded instructions

> Archived on 9 November 2026. This document preserves a dated assessment or execution plan. Its old scope, constraints, counts and agent instructions are historical; use the [current operational handoff](../../phase2-local-defense.md) for ongoing work.

Original location: docs/GraveNav_Final_Defense_Readiness_2026-11-06.md  
Original content SHA-256: c4b3f0884e76816a9e2b3289efe9fd29520eadd4ddc89c2d1aade6c98723db2a

---

# GraveNav — final defense readiness report

**Assessment date:** 6 November 2026, Asia/Manila. **Defense period begins:** Monday, 9 November 2026.

**What this repo does:** GraveNav provides public burial-record search and a cemetery map, plus protected staff tools for burial, plot, owner, coordinate, photo, account, audit, and recovery workflows. A separate Phase 2 project displays CAD-derived candidate polygons. This assessment assumes a small capstone demonstration with a few simultaneous staff/visitor sessions; it does not certify production scale.

**Verdict: not ready for a complete, live GPS-assisted defense demonstration in its current state.** The application builds and substantial database contracts pass. However, the hosted project has **zero public burial records, zero plot coordinates, zero field observations, and zero published mapping releases**. Successful record search, mapped grave selection, and real-destination navigation cannot currently be demonstrated against that data. A reliable, honestly scoped prototype demonstration is achievable by resolving the P0 items below and preserving Phase 2 as a separate viewer.

This is an assessment, not an implementation or release approval. No application code, original CAD/GIS files, Blender scenes, or production records were changed. No migrations, imports, invitations, emails, commits, pushes, or deployments were performed. Builds and browser checks used isolated source copies; original Phase 2 geometry tests ran with Python cache writes disabled. The only repository addition is this report.

## 1. Exactly what was assessed

| Source | Verified state |
| --- | --- |
| Main application: `C:\Users\Nash\Documents\gravenav` | Branch `feature/frontend-improvements`, HEAD `2f7ce5d1f3f10b6b4a1b3b6f33cb99baff6acfa5`, **including its existing uncommitted/untracked admin changes**. Seventeen tracked files are modified; important new components and five migration files are untracked. These changes were preserved. |
| Supplied worktree: `C:\Users\Nash\.codex\worktrees\418f\gravenav` | Detached at `57289ece1403b198c84cb5bd6ab36bcfb5d52a9f`. This is an older application baseline, not the current main checkout. The report is saved here because this is the authorized output workspace. |
| Phase 2: `C:\Users\Nash\Documents\GraveNav-Phase2-CAD\phase2-digital-map` | Current standalone Vite/React/Leaflet application, current static assets, tests, and retained Blender prototype support. Its existing implementation report and original DXF validation were consulted, rather than repeating CAD extraction or decorative reviews. |
| Hosted database | Linked project `ddoowghocqyfoxaikifb`; existing verifier and additional aggregate catalog/data queries used explicit **`BEGIN READ ONLY`** transactions. No record contents or credentials are included here. |
| Deployment | GitHub branch, deployment, and CI metadata; public application HTTP/browser checks; anonymous checks of the isolated current production build. |
| Requirements | Existing proposal/system overview, data-collection plan, draft MOA, database/runbook documents, and the approved GIS foundation design. |

**Approval boundary:** The available proposal and MOA describe the intended capstone scope, but the MOA contains blank signatory fields and placeholders. No signed final objectives/manuscript or client acceptance record was established from these files. The requirements comparison below is evidence against the available written scope, not certification that an adviser approved every current scope change.

## 2. Implementation and requirements traceability

Status terms: **observed** = exercised in this audit; **implemented/tested** = source traced and relevant automated contracts passed; **unverified** = no corresponding live end-to-end result was obtained.

| Requirement / feature | Actual implementation and evidence | Defense status |
| --- | --- | --- |
| Staff authentication and roles | Supabase password login, server session checks, active-account lookup, ADMIN/MANAGER checks, session-refresh proxy, invitation callback, and password setup are implemented. Anonymous `/admin` and coordinate-review visits redirect to login. Hosted data contains four active ADMINs, two active MANAGERs, and one suspended MANAGER, all linked to Auth users. | **Partially observed.** Real staff login, logout, session expiry, suspended-user access, and email delivery were not exercised. Database claim tests are not actual Auth JWT login evidence. |
| Cemetery management | One site and four Phase 1 gardens are stored; staff can view their boundaries and recorded network. Operational records are manageable. No site/garden create-edit interface or general multi-cemetery workflow was found. | Demonstrate the fixed Forest Lake Phase 1 scope. Do not describe full cemetery/section administration as complete. |
| Plot management | Current workspace has bounded server search/filter/sort/pagination, derived occupancy, owner assignment, plot codes, dimensions, manual longitude/latitude and optional reported accuracy. Safe save, revision conflicts, retries, uniqueness/assignment rules, and coordinate containment have database coverage. ADMIN removal is recoverable and rejects assigned plots. | **Implemented/tested; live browser writes unverified.** An unused plot is needed before creating another burial. Raw `AVAILABLE` status alone does not mean an assigned plot is available. |
| Burial and owner records | Create/edit, archive/status changes, protected owner information, public-display controls, atomic burial/deceased operations, one burial per plot, soft deletion, history, and recovery are implemented. Current listing and dashboard changes include uncommitted work. | **Implemented/tested; live workflow unverified.** Rehearse using synthetic records in a separate demo database. |
| Public grave searching | Ranked name/plot-code search, section filtering, year-of-passing ranges, sorting, and pagination are implemented. Public view requires an active, public-display-enabled, non-deleted burial and non-deleted plot. Actual hosted search and both local/live browser checks return zero records. | Empty/error states can be shown now; successful search/profile/marker flows need approved demo data. Exact burial-date filtering and dedicated row/block search are not implemented. The current date filter is correctly labelled **year of passing**, not burial date. |
| Burial details | Public profile displays name, life dates, actual interment date, garden, plot and available legacy block information; unknown fields stay missing. New location hierarchy is `site → garden/area → plot`, with legacy sector/block compatibility. | Source and date/visibility contracts checked; populated live profile not observed. There is no complete row-level data model/workflow in the current UI. |
| Map interaction | Public Phase 1 map loads and supports native Leaflet interactions, garden selection, layers, and coordinate-based record markers. Map loaded without browser errors at desktop and mobile widths. Missing coordinates are not invented. | **Map loading observed.** Grave markers cannot appear with current hosted data. Staff map and public map use different graph sources; see finding 5. |
| GPS coordinate capture | Staff plot form accepts pasted numeric coordinates and optional accuracy. Browser `watchPosition` exists in visitor navigation. GIS backend supports multi-reading field evidence and review. No staff GPS-capture interface wired to those field-evidence functions was found; hosted survey tables are empty. | **Partial.** Manual coordinate entry and visitor location watching are not the promised administrator GPS-capture workflow. |
| Coordinate verification | ADMIN-only queue, verify/reject, required rejection reason, audit history, stale-revision protection, reset to pending after location/area changes, and garden-boundary validation are implemented/tested. MANAGER cannot approve coordinates. | Logical review workflow exists; **no real coordinate is verified**. An ADMIN flag does not establish measured positional accuracy. |
| GPS-assisted navigation | Browser location subscription/cleanup, fresh-reading checks, accuracy warnings, Dijkstra graph routing, permission-denied/entrance fallback, and near-destination wording exist. Eligibility requires an existing explicitly verified plot coordinate. The route stops on the recorded network, leaving final physical-marker confirmation to the visitor. | **Code capability, not field-verified operation.** No real destination or physical walk was tested. Section/row/block navigation modes from the proposal are absent. Do not claim exact-grave navigation. |
| Optional grave photographs | MIME/10 MB checks, private-upload path, pending metadata, ADMIN review, and staff signed preview code exist. Hosted Storage has **no buckets, no Storage policies, no objects**, and there are no photo rows. Public search/profile components always show a photo-unavailable placeholder and do not fetch approved images. | **Incomplete end to end.** Optional feature: explain as unavailable or finish a tightly scoped staging workflow if time permits. |
| Audit, reports, recovery | Redacted audit reads/export, CSV formula escaping, ADMIN-only full history, undo/restore with revision checks, and manual GIS release rollback are implemented. Relevant database contracts pass. Settings/support are informational screens. | Demonstrate only after rehearsal. Audit export records an event, so it was not invoked on the hosted project during this read-only audit. Recovery history is not a database backup. |

Requirement sources: [proposal and objectives](<C:/Users/Nash/Documents/FOREST LAKE REQS/Project_Proposal_and_System_Overview_GraveNav.docx>) paragraphs 18, 22–29, 47–61 and 70–81; [data collection plan](<C:/Users/Nash/Documents/FOREST LAKE REQS/06_Data_Collection_Plan_GraveNav.docx>) paragraphs 184–205; [draft MOA](<C:/Users/Nash/Documents/FOREST LAKE REQS/MEMORANDUM OF AGREEMENT.docx>) paragraphs 15–25 and 104–122. These explicitly permit staged section-level assistance and require confirmation before exact plot guidance. None requires Blender realism.

## 3. Verified hosted schema, permissions, and data

| Read-only check | Result on 6 November |
| --- | --- |
| Migration history | All **26 local versions** are present through `20260929000000` (GIS M09), including the five files currently untracked locally. Presence of migration versions does not independently prove every historical file byte is identical. |
| Core data | 1 site; 4 areas; 3 lots; 3 deceased; 3 burial records, **all pending**; 0 public-visible burials and search total 0. |
| Coordinates/evidence | 0 plot geometries; 0 verified plot coordinates; 0 survey points, captures, observations, or georeferencing runs. The three plot rows retain a pending review status but have no coordinates. |
| GIS state | 0 releases, imports, publication selectors, or publication events; 0 release-owned graph rows. M01–M09 are a deployed foundation, not a populated map integration. |
| Legacy graph | 41 NULL-release nodes and 18 NULL-release edges. Both hashes match the existing approved verifier's baseline; audit sequence remains 893. |
| Core table access | Every public-schema base table checked has row-level security enabled. Anonymous role has SELECT on **no base tables**. Public view exposes only its allowlisted fields/eligible records. |
| Staff functions | Six relevant account/read/save functions are authenticated-executable, anonymous-denied, SECURITY DEFINER, with pinned search paths. Active-role checks are covered by operational database tests. |
| GIS publication protection | Existing verifier reports all ownership, function privilege, private-schema/helper denial, table-write denial, constraint, trigger, and baseline checks true. |
| Photos | 0 buckets, Storage policies, objects, and photo rows. A configured bucket name in an environment variable does not create storage or permissions. |

Existing operational constraints are useful protections: coordinates must be inside the selected garden; a plot cannot receive another burial; edits use revisions and request receipts; removed records retain recoverable relationships; public output excludes owner contact information. Do not bypass these rules to make a demonstration appear populated.

For a useful demo, prepare a **separate, clearly labelled demo database** with synthetic burial/plot data: at least one active public record, one pending/hidden record, one record without coordinates, and enough unused plots for the planned CRUD exercise. Add rejected/verified-coordinate cases only with truthful provenance. A simulated coordinate may prove rendering or logic, but must never be presented as a surveyed grave position. No existing pending production record was approved or changed here.

Primary implementation evidence: [public queries](<C:/Users/Nash/Documents/gravenav/src/lib/supabase/public-data.ts:31>), [public view contract](<C:/Users/Nash/Documents/gravenav/supabase/migrations/20260924090000_expose_public_coordinate_status.sql:5>), [safe mutation API](<C:/Users/Nash/Documents/gravenav/supabase/migrations/20260905130000_safe_staff_edits.sql:52>), [operational tests](<C:/Users/Nash/Documents/gravenav/tests/database-contracts.test.mjs:6>), and [hosted verifier](<C:/Users/Nash/Documents/gravenav/scripts/gis/verify-hosted.mjs:58>).

## 4. Phase 2 integration decision

**Safe before defense:** demonstrate the existing Phase 2 application separately, opened from a prepared bookmark. Label it **“Phase 2 CAD planning viewer — local coordinates; GPS and official plot identification unavailable.”** This requires no main-app changes or database import.

**Smallest optional connection:** after P0 checks pass, add a simple link to an independently served frozen Phase 2 production build. If a single origin is necessary, serve a copy of its existing `dist/` under an isolated static path and verify assets, relative URLs, return navigation, and the same desktop/mobile interactions. The project already uses a relative Vite base. This is a companion viewer, not cemetery-record or GPS integration. Do not merge its React/Vite dependency tree into Next.js or replace the working Phase 1 map for the defense.

**Not safe to promise before defense:** import all Phase 2 polygons as operational plots, attach names/occupancy by guessing, place CAD X/Y in latitude/longitude fields, or enable GPS against the local layout.

Current evidence:

- The runtime explicitly uses **Leaflet `CRS.Simple`** and the custom `gravenav-local-cartesian-v1` format. Its coordinate adapter only exchanges X/Y for the display. It does not georeference the drawing. Leaflet documents this as a [non-geographical map configuration](https://leafletjs.com/examples/crs-simple/).
- **4,494 candidate plot polygons** = 4,146 lawn candidates + 348 estate-internal candidates. The additional 29 estate envelopes are not another set of graves. Official plot identifiers remain NULL; occupancy and deceased associations are unavailable.
- Current source-equality tests preserve 1,448 mirrored instances, 500 documented native-QGIS mismatch flags, all 20 overlap pairs, and two approximately 98.13% overlaps. Do not use an unchecked native-QGIS expansion or silently delete overlaps.
- Units remain unconfirmed; no authoritative CRS, geographic control fit, independent validation, measured terrain surface, or as-built access network was established. DXF fidelity does not establish a lossless original-DWG conversion.
- Blender images/scenes are illustrative studies. Ground texture, shadows, slopes, protection studies, or render alignment are not geographic measurements. Preserve these assets; further decorative work does not resolve a defense blocker.

True integration dependencies, in order: confirmed units and source provenance → identifiable field control points with retained readings → reviewed transformation and independent validation → official garden/plot crosswalk → client-approved record links → reviewed walkable graph/access points → valid pilot package → protected validation/finalization → explicit ADMIN approval/publication → frontend adoption of the published read contract → on-site acceptance.

The existing importer accepts **one pilot garden with 1–50 declared lot IDs**, not an unrestricted 4,494-plot import. Its 15-file package requires existing operational identities, field/georeferencing evidence and geographic geometry. The current Phase 2 JSON is not such a package. Existing map components do not call `gis-data.ts`; publishing a release alone will not switch them.

Sources: [Phase 2 runtime contract](<C:/Users/Nash/Documents/GraveNav-Phase2-CAD/phase2-digital-map/src/types.ts:19>), [viewer README](<C:/Users/Nash/Documents/GraveNav-Phase2-CAD/phase2-digital-map/README.md>), [existing DXF validation](<C:/Users/Nash/Documents/GraveNav-Phase2-CAD/phase2-dxf-validation-2026-10-16/Forest_Lake_Phase2_DXF_Validation_Report.md>), [pilot package contract](<C:/Users/Nash/Documents/gravenav/docs/gis/pilot-package-v1.md:1>), and [approved GIS design](<C:/Users/Nash/Documents/gravenav/docs/superpowers/specs/2026-09-28-gis-foundation-design.md:7>).

## 5. Prioritized findings and smallest fixes

### P0 — must resolve before claiming defense readiness

**1. The main visitor demonstration has no usable public records.**

- **What / problem:** Search, profiles and grave selection depend on eligible records. The actual hosted public view and RPC both return zero; local and deployed browser checks confirm empty results.
- **Smallest fix:** Prepare approved synthetic fixtures in a separate demo environment and prove one successful search → profile → map sequence. Keep pending/private examples for the visibility test.
- **If skipped:** The central visitor task cannot be demonstrated. **Exit evidence:** a clean-browser successful search plus a hidden-record negative test on the frozen demo target.

**2. Real GPS navigation remains an unfulfilled core objective.**

- **What / problem:** No destinations or field evidence exist, and the current gate only supports verified plot coordinates. It does not implement the proposal's section-first navigation. Coordinate verification can accept a coordinate without stored accuracy; near-plot logic allows a reported accuracy of 15 m, which is not proof of identifying one grave.
- **Smallest fix:** Freeze the promised navigation level now. If field access and reliable data are available, implement/test only section-level guidance to a confirmed entrance/section access point and label its precision. Otherwise demonstrate location/route logic as an explicitly simulated or unverified prototype and record GPS assistance as incomplete. Do not mark a section center as a verified grave to unlock the existing UI.
- **If skipped:** A GPS-themed capstone is presented without evidence for its central location claim. **Exit evidence:** adviser-aligned limitation statement, or a permitted real-device field walk with target identity, readings, reported accuracy, timestamps, independent position checks, and physical-marker confirmation. Browser emulation cannot supply this evidence.

Evidence: [navigation gate](<C:/Users/Nash/Documents/gravenav/src/lib/public-navigation.ts:8>), [15 m proximity rule](<C:/Users/Nash/Documents/gravenav/src/lib/navigation-geo.ts:24>), [review operation](<C:/Users/Nash/Documents/gravenav/supabase/migrations/20260905130000_safe_staff_edits.sql:170>), [manual plot entry](<C:/Users/Nash/Documents/gravenav/src/components/admin/admin-crud-pages.tsx:336>).

**3. Production dependencies fail the security release gate.**

- **What / problem:** Fresh `npm audit --omit=dev` reports **three affected production packages: Next.js critical, sharp high, source-map-js high**. The latest hosted CI run also fails its dependency-audit step, so its production-build step was skipped. This is not evidence that an exploit occurred.
- **Smallest fix:** In an isolated stabilization branch, make reviewed targeted dependency updates and regenerate the lockfile. The current audit recommends Next.js `16.4.5`; verify the patched version and its bundled migration guides when implementing, and ensure the transitive packages are fixed. Rerun build/auth/map tests. Do not use a blind forced upgrade.
- **If skipped:** The release remains knowingly affected and CI stays red. **Exit evidence:** a clean production dependency audit and passing checks on the exact release commit. The inspected UI has no `next/image` or `use cache` call site, but exploitability was not exhaustively established and this does not close the gate. [Upstream image advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw), [upstream cache advisory](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr).

**4. There is no single frozen, reproducible demo release.**

- **What / problem:** The current local admin experience includes required untracked files. Remote `main` is still `57289ec`; the frontend branch is `2f7ce5d`. Latest recorded GitHub Production deployment metadata references `6a4f77d`; the later README preview is `b278483`. Preview URLs redirect anonymous visitors to Vercel login. The public alias is reachable, but its exact current SHA was not independently obtained.
- **Smallest fix:** Preserve the dirty work, review and capture all required code/migrations into a dedicated release candidate, validate it, and choose one accessible demo URL plus one prepared local build. Verify production environment variables and exact Supabase Auth callback/origin configuration. Local `NEXT_PUBLIC_APP_ORIGIN` is currently localhost; deployed settings were not inspected.
- **If skipped:** A fresh checkout or panelist's browser can show a different system or a Vercel login screen. **Exit evidence:** recorded commit, database target, URL, build results and clean-browser rehearsal of that exact release. [Current failed CI run](https://github.com/BossTwenty1/ForestLake_GraveNav/actions/runs/38911178151).

**5. Navigation can treat an outside-site location as inside, and the maps use different graphs.**

- **What / problem:** `projectPhaseOneLocation` checks a rectangle, not the cemetery polygon; navigation uses its result as the inside-site check and snaps to the nearest routing vertex without a distance limit. An in-memory probe at **123.73974429921785 E, 13.127730410156559 N**, outside the source site polygon but inside its rectangle, was accepted and produced a route. The public static graph has **104 nodes/115 edges**, while the hosted staff graph has **41/18**. Both are legacy sources, not published GIS releases.
- **Smallest fix:** Before enabling live routing, check actual site containment and reject origins/destinations too far from reviewed walkable graph locations; use the entrance fallback with honest wording. Select and document the single graph used in the defense, and compare its relevant paths with the staff view. Avoid rebuilding/importing networks just to equalize counts.
- **If skipped:** Visitors can receive guidance starting at an unsuitable snapped location, and panels can see inconsistent paths between screens. **Exit evidence:** an outside-polygon regression test, a far-from-network case, a known valid route, and a real walk of the demonstrated path. Otherwise keep routing explicitly outside the verified demo scope.

Evidence: [rectangle check](<C:/Users/Nash/Documents/gravenav/src/lib/phase1-map-data.ts:81>), [inside-site use](<C:/Users/Nash/Documents/gravenav/src/components/visitor/navigation-route-map.tsx:123>), [vertex selection](<C:/Users/Nash/Documents/gravenav/src/lib/phase1-routing.ts:44>), [legacy hosted reads](<C:/Users/Nash/Documents/gravenav/src/lib/phase1-map-data.ts:97>).

**6. Staff workflows and outage recovery have not been rehearsed end to end.**

- **What / problem:** Role/CRUD/recovery SQL tests pass, but this audit did not sign in or change records. Docker is stopped, so the documented local Supabase fallback is not ready. Production disables mock fallback. Also, `/map` returns only an error panel when its search RPC fails, despite saying the static layout is still available.
- **Smallest fix:** Rehearse ADMIN/MANAGER/suspended access, save/conflict/delete/recovery and logout using the demo database. Prepare and actually start a local database fallback if it is part of the plan. Keep the static map renderable independently of record-query failure, or explicitly prepare a separate static-map fallback and label the lost capabilities.
- **If skipped:** Login, a save, or a connection failure can stop the demonstration. **Exit evidence:** one timed complete rehearsal, a successful cold start, a tested loss-of-network plan, and no reliance on email delivery during the live presentation. [Map error path](<C:/Users/Nash/Documents/gravenav/src/app/map/page.tsx:29>).

**7. Backup and restore readiness is unproven.**

- **What / problem:** Record undo and GIS selector rollback exist, but neither recovers a lost database, Auth configuration, or Storage file. No current backup inventory, plan/PITR setting, or tested full restore was established. The empty seed cannot reconstruct a useful demo.
- **Smallest fix:** Have the authorized owner verify a recent backup/export and its restore path; retain an encrypted off-site copy and separately preserve Storage objects/configuration if used. Restore into an isolated environment and test a login, search and record relationship. Preserve the release candidate and the Phase 2 production assets as well.
- **If skipped:** A data or environment failure has no demonstrated recovery path. **Exit evidence:** backup timestamp/location, recovery owner, and a successful isolated restore/cold-start record. Supabase [database backups do not include Storage object bytes](https://supabase.com/docs/guides/platform/backups); plan-specific backup availability must be checked on this project.

### P1 — important if time permits

**8. Optional photo support is incomplete.** Storage configuration alone will not make photos appear: the public profile also needs a safe approved-photo retrieval/display path. Finish and test this only in staging if committed scope requires it; otherwise disclose it and omit live upload from the demo. Skipping it leaves an optional visual-identification requirement unmet, but need not block record/map presentation.

**9. Automated release evidence is incomplete.** Current main-suite result is 159 pass / 2 fail / 1 skip; the two failures require a running Docker engine. Rerun those specific genuine PostgreSQL race tests once Docker is available, then the release gate after actual fixes. The Windows symlink test is explicitly skipped for unavailable privileges. Do not relabel these results as a fully passing suite. CI is configured for pushes/PRs to `main`; a feature-branch push alone does not establish a green CI result.

**10. Requirements and reproduction documents need a narrow correction pass.** Confirm signed/adviser-approved scope and align Chapters 4–5 with the feature table. Existing database notes incorrectly describe MANAGER coordinate/photo approval permissions; current enforcement is ADMIN-only. The proposal's burial-date/row/block search, staff coordinate capture, and staged navigation are incomplete. `map:rebuild` is not portable: its script hard-codes `C:/Users/Michael/gravenav/web`, which does not exist here. Preserve the working checked-in map and repair reproduction instructions only if needed. Skipping these corrections weakens defense explanations and handoff reliability.

### P2 — defer until after defense

- Full Phase 2 operational/GPS integration, bulk plot creation and multi-area publication.
- Survey control collection at full coverage, georeferencing and independent accuracy validation beyond any permitted small defense pilot; official plot/occupancy crosswalk and overlap resolution.
- Frontend adoption of the versioned GIS contracts, reviewed access-point routing, segment-based map matching, and pgRouting if later justified. Current routing is TypeScript Dijkstra; pgRouting is not installed.
- Blender terrain, textures, retaining walls, protection rendering, landscaping and other appearance refinements. Keep completed Leaflet and Blender prototypes intact.
- Expanded cemetery configuration, full row/block administration, analytics expansion, broad refactors and unsupported scale claims.

## 6. Build, tests, and deployment evidence

| Check executed in this assessment | Actual result / limit |
| --- | --- |
| Main `npm run lint` | Pass: 0 errors; one existing unused `mkdir` warning in `tests/gis-package.test.mjs`. |
| Main TypeScript, incremental output disabled | Pass. |
| Main `npm test` | **162 tests: 159 passed, 2 failed, 1 skipped.** Both failures are the genuine PostgreSQL concurrency tests because the Docker Linux engine is unavailable. Do not call them logic failures or passes. |
| Main `npm run build` with public hosted settings | **Pass**, including type checking and production routes. No server secret was copied into the audit build. An initial audit-only dependency junction was rejected by Turbopack; copying dependencies inside the audit root resolved it without application changes. |
| Main production dependency audit | **Fail:** 1 critical and 2 high affected packages; see finding 3. No package changes were made. |
| Current main anonymous browser smoke | 16 route cases across 1440 px and 390 px widths. Home/search/map render; search is empty; protected routes reach login; pending burial profile/navigation reach record-not-found. No page errors or horizontal overflow observed. No authenticated success case was exercised. |
| Public live alias | [GraveNav](https://github-final-five.vercel.app) returns 200; live empty search, Leaflet map, and anonymous admin redirect observed. Frame denial and geolocation permissions headers present on the homepage. A reachable page is not proof of the current local version being deployed. |
| GitHub CI | Latest recorded run fails at dependency audit; lint, TypeScript and repository tests succeeded on that run, and production build was skipped. It is a different code state from the current dirty checkout. |
| Phase 2 `npm run build` | **Pass.** Production JS 397.95 kB / 121.69 kB gzip; source geometry asset remains approximately 12.75 MB uncompressed. For remote serving, compression and a cold network load must be checked. |
| Phase 2 geometry/source tests | **6/6 pass**, including every source coordinate/property, original protected hashes, winding/holes/Z, mirrored flags, overlap evidence, and rejection of a geographic SRS masquerading as local data. Conversion was not rerun. |
| Phase 2 existing browser interactions | **22/22 pass** across desktop and emulated mobile, including native selection, toggles, hidden-layer recovery, pan/zoom/reset, overlaps, missing-asset handling, Blender alignment and fallback. Overview screenshot tests were excluded to avoid a duplicate screenshot collection. |
| Phase 2 production smoke and dependency audit | Both pass; 4,494 candidates load, mirrored-candidate selection works, development review UI is absent, Blender fallback works, and no page errors occur. Production dependency audit reports zero vulnerabilities. |

These results do not establish real-phone GPS quality, navigation precision, survey accuracy, cross-browser coverage, user acceptance, concurrent production load capacity, or actual backup restoration. PGlite tests validate database behavior in isolation; they are not a substitute for all genuine PostgreSQL/session tests or hosted Auth tests.

## 7. Safest implementation order before Monday

| When / sequence | Action and owner | Stop / acceptance rule |
| --- | --- | --- |
| **Friday 6 Nov — 1** | Team lead + adviser: freeze the defense scope using this report. Preserve current dirty work and completed prototypes. Select the current frontend source as the release candidate; record its exact files and database target. | Resolve whether GPS is an evidenced section-level pilot or an explicitly incomplete prototype capability. Do not silently change objectives. |
| **Friday — 2** | Developer + QA: patch the affected dependencies in isolation; validate the candidate. Authorized data owner prepares a separate synthetic demo dataset and known staff accounts. These tasks can proceed independently. | Green security/build gates; no production-data shortcut. Do not spend this time on Phase 2 rendering. |
| **Saturday 7 Nov — 3** | QA with staff account holders: rehearse plot creation → burial entry → public visibility → search/profile/map; check role denial, duplicate submit, stale edit, archive/remove and recovery. Confirm backup/restore and local cold-start plan. | Record failures against the same release. Fix only issues that affect the planned demonstration. |
| **Saturday — 4** | Field/data lead, only if access and reliable targets are available: collect and independently check the small navigation pilot. Developer resolves finding 5 and implements an honest section-level mode if that is the selected scope. | If evidence or implementation cannot be completed safely, retain GPS as a declared limitation. No invented grave coordinates, exact-accuracy claim or rushed full Phase 2 import. |
| **Saturday evening — 5** | Team lead: cut the tested release candidate. Optional Phase 2 link/static companion only after P0 items pass. | Record exact SHA, environment, known limitations and accessible URL. Do not use a login-protected preview as the panel's only route. |
| **Sunday 8 Nov — 6** | Whole team: one timed rehearsal on the actual laptop/projector and a real phone; test venue connectivity/fallback; preserve one short recording and minimal evidence. | Freeze the demonstrated build and data. Any unavoidable late fix triggers only its affected regression checks plus a smoke run. |
| **Monday 9 Nov — 7** | Presenter: cold-start/check the frozen system before the session. | If a gate fails, use the rehearsed fallback and state the limitation instead of improvising a production fix. |

A successful partial prototype demo is possible without Phase 2 integration. A claim that all GPS and mapping objectives are complete is not supported by the present evidence.

## 8. Concise technical demo checklist

Use this as a pass/fail list against the selected release, not as a statement that these steps have already passed.

- [ ] Record exact release SHA, frontend URL, database target, synthetic-data label and limitations. Open the panel URL in a fresh browser without Vercel credentials.
- [ ] Cold-start the production build; confirm database connectivity and the prepared fallback. Have known staff accounts ready; do not depend on sending invitations during the presentation.
- [ ] Show a successful visitor name/plot search, section filter, profile and actual burial date. Show a no-match case and prove a pending/private record stays hidden.
- [ ] Show the Phase 1 map: zoom/pan/reset, garden selection and a record marker only where a legitimate coordinate exists. State its source and navigation level.
- [ ] In the demo environment, sign in as ADMIN; create an unused plot, add/edit a burial, show validation, and show the public result. Use the predefined data so the sequence remains short.
- [ ] Show MANAGER restrictions and logout protection. Verify suspended access separately during rehearsal rather than consuming the live demo with repeated logins.
- [ ] Show missing/pending/rejected coordinate behavior. If demonstrating review, use the documented evidence and make the review role explicit.
- [ ] Demonstrate live GPS only after field acceptance; show reported accuracy, deny-permission/low-accuracy handling and physical-marker confirmation. Label any emulation or recorded walkthrough. Do not claim that a 15 m proximity condition identifies one grave.
- [ ] Optional Phase 2: open the frozen viewer, select/search an internal CAD reference, toggle a layer, and state “candidate outline; not an official grave ID; no GPS.” The normal viewer should be the default; keep Blender studies available separately.
- [ ] Demonstrate audit/recovery only on synthetic demo records after rehearsal. Export or recovery actions are data operations and were deliberately not performed on production in this audit.
- [ ] State photo support as unavailable unless its complete private-upload → review → approved-display flow has actually passed.

**Presentation language supported now:** “We implemented protected cemetery-record workflows and database safety rules. The Phase 1 map is operational as a digital reference. Browser-location and routing logic are implemented but real destination accuracy remains unverified. Phase 2 is a separate, source-preserving local CAD viewer.”

## 9. Evidence needed for Chapters 4–5

Keep a single requirements-to-test matrix and a small evidence folder; reuse existing tests and Phase 2 QA rather than creating another audit document.

| Evidence | Chapter 4: implementation/results | Chapter 5: conclusion/limitations |
| --- | --- | --- |
| Final approved scope | Signed/adviser-confirmed objectives mapped to the feature table and test IDs. Distinguish scope changes such as garden/plot hierarchy from missing work. | State which objectives were met, partially met, or deferred. |
| Frozen release evidence | SHA, environment/target, migration list, dated build/lint/type/security results and honest test totals. Include the failed/unavailable checks until rerun successfully. | Conclude about the tested version only. |
| Functional and role tests | Expected vs actual result for login/logout, ADMIN/MANAGER/suspended access, plot/burial CRUD, public visibility, no-match/error state, stale edits, duplicate requests and recovery. Use synthetic/anonymized data. | State the observed functional coverage; do not equate source presence with end-to-end completion. |
| GPS field record, if performed | Device/browser, permission, target identity, multiple readings with timestamps and reported accuracy, independent check method, observed errors and route walk. Report device-reported uncertainty separately from measured positional error. | Bound claims to observed section/route performance. Without those measurements, explicitly state that real navigation accuracy is unverified. |
| Phase 2 provenance | Existing DXF report, protected source hashes, six source-equality results, candidate counts, unresolved unit/CRS/overlap issues, and the absence of official ID/occupancy links. One useful overview is enough. | Treat the viewer as CAD visualization; no geographic/survey or grave-inventory conclusion. |
| Usability/performance | A small, documented task exercise with actual participants, devices, task success, observed task times and feedback, if conducted. Existing Phase 2 emulation results are not a real-phone or user study. | Do not claim reduced search time, staff workload or improved GPS precision without measurements. |
| Recovery/release rehearsal | Backup timestamp and isolated restore result, startup instructions, demo script and one short fallback recording. Keep private data/keys out of manuscript evidence. | State operational dependencies and untested hosting settings. |

**Not checked / unresolved:** authenticated browser success paths, invitation/recovery email delivery and hosted Auth policies; production environment variables and exact live alias SHA; a successful full backup restore/PITR configuration; real-phone/site GPS and route accessibility; official plot-ID crosswalk and original-DWG conversion completeness; complete Blender renderer internals, physical terrain accuracy, broad load testing and non-Chromium browsers. No destructive security testing or production mutations were attempted. These limits remain open until evidence closes them.


## 10. Release stabilization — 6 November 2026

### Preserved baseline

Authoritative source: `C:\Users\Nash\Documents\gravenav`, branch `feature/frontend-improvements`, HEAD `2f7ce5d1f3f10b6b4a1b3b6f33cb99baff6acfa5`. The original branch, index, tracked modifications, untracked files, secrets and ignored local artifacts remain in place. An isolated worktree at `C:\Users\Nash\.codex\worktrees\gravenav-defense-rc\gravenav` uses branch `codex/defense-release-stabilization-20261106`. All 227 tracked/unignored source files were copied byte-for-byte and SHA-256 checked before dependency changes. The older detached checkout supplied only this report.

Exact pre-existing development changes included in the preservation checkpoint:

```text
 M src/app/admin/burial-records/page.tsx
 M src/app/admin/coordinate-verification/page.tsx
 M src/app/admin/plot-management/page.tsx
 M src/app/globals.css
 M src/components/admin/admin-crud-pages.tsx
 M src/components/admin/admin-foundation.tsx
 M src/components/admin/admin-page-content.tsx
 M src/components/admin/admin-shell-client.tsx
 M src/components/admin/admin-sidebar.tsx
 M src/components/admin/burial-record-list.tsx
 M src/components/admin/coordinate-review.tsx
 M src/components/ui/icons.tsx
 M src/components/ui/page-heading.tsx
 M src/lib/supabase/admin-data.ts
 M src/lib/supabase/database.types.ts
 M src/lib/supabase/types.ts
 M tests/database-contracts.test.mjs
?? docs/superpowers/plans/2026-09-28-gis-foundation-implementation-plan.md
?? docs/superpowers/specs/2026-09-28-gis-foundation-design.md
?? src/components/admin/admin-account-menu.tsx
?? src/components/admin/plot-management-list.tsx
?? src/components/ui/skeleton.tsx
?? src/components/ui/tooltip.tsx
?? supabase/migrations/20260908090000_add_visitor_analytics.sql
?? supabase/migrations/20260926170000_staff_dashboard_data.sql
?? supabase/migrations/20260927090000_staff_burial_records.sql
?? supabase/migrations/20260928090000_staff_plot_management.sql
?? supabase/migrations/20260928150000_staff_coordinate_verification.sql
```

The five untracked migration files are preserved as source; no migration is applied by this stabilization task. Credentials, `.env.local`, `node_modules`, `.next`, temporary evidence and other ignored build artifacts are excluded from commits. The source manifest and raw validation logs are kept outside Git in the task evidence directory. The security changes and verification results are recorded below. The historical assessment above remains unchanged.


### Security candidate and verification

**Security stabilization is complete; full release clearance is still conditional.** No dependency-introduced application failure was found in the executed checks. The two unavailable Docker tests, two pre-existing browser failures, and untested signed-in/field workflows remain open; they are not passes.

- Preservation commit: `fb9996317de8f0d19e77297f2d06e51436d765ee`.
- Tested application/security commit: **`48703a96706f23ddbea81e9118f9ebf20a35b9bd`**.
- Branch: `codex/defense-release-stabilization-20261106`.
- Source workspace: `C:\Users\Nash\.codex\worktrees\gravenav-defense-rc\gravenav`.
- The subsequent documentation-only commit records these results. Use `git rev-parse HEAD` in that worktree for its final handoff SHA; it contains the same tested application and lockfile as the security commit above.
- At the security commit, the isolated working tree was clean. The authoritative main checkout's branch, HEAD, status and all 227 inventoried file hashes were rechecked and are unchanged. Its pending work remains available there as well as in the preservation checkpoint.

| Dependency | Original | Candidate | Review decision |
| --- | --- | --- | --- |
| Next.js | 16.3.6 | **16.4.5**, exact pin | 16.4.1 fixes the initial critical advisories, but 16.4.5 includes the later 3 November security fixes. Stay on Next.js 16; no major migration or codemod. |
| sharp | 0.35.4 | **0.35.5** | Resolved through Next.js's supported optional dependency range, without adding a direct application dependency or override. |
| source-map-js | 1.2.1 | **1.2.2** | Targeted transitive lock refresh within the existing PostCSS/Tailwind ranges. |
| React / React DOM | 19.2.8 / 19.2.8 | Unchanged | Compatible with Next.js's published peer range. |
| Supabase SSR / JS | 0.12.5 / 2.112.4 | Unchanged | No auth client, cookie, RPC or schema migration. |

The security commit changes only `package.json` and `package-lock.json`. Native Next/SWC, sharp and libvips lock entries follow their package updates. npm also completed six optional existing Tailwind WASM dependency entries; no other direct dependency was added or upgraded. The clean `npm ci` result confirms package/lock agreement. Bundled Next.js 16.4.5 upgrade and proxy documentation was reviewed; the existing async request APIs, `src/proxy.ts`, Turbopack configuration, and route structure required no edits.

Upstream references: [Next.js 16.4.5 security release](https://github.com/vercel/next.js/releases/tag/v16.4.5), [initial critical cache advisory](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr), [initial critical image advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw), [sharp patch](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w), and [source-map-js finding returned by npm audit](https://github.com/advisories/GHSA-68fv-2mgg-jv7q). The choice of 16.4.5 addresses the current patch line instead of stopping at the first historical critical fix.

Executed on Windows, Node **24.14.0**, npm **11.9.0**:

| Gate | Result on the security candidate |
| --- | --- |
| Clean dependency install, `npm ci --no-audit --no-fund` | **Passed**. No dependency junction or reused application `node_modules`. |
| `npm audit --omit=dev --json` | **Passed: 0 vulnerabilities**. Original audit reproduced 1 critical + 2 high affected packages. This is the production dependency scope, not a claim about all development tooling. |
| `npm run lint` | **Passed:** 0 errors; existing unused `mkdir` warning remains. |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | **Passed**. |
| `npm run build` | **Passed**, Next.js 16.4.5 production build with current public hosted settings; protected staff routes remain dynamic. Server secret was excluded from the local candidate configuration. |
| `npm test` | **159 passed / 2 failed / 1 skipped**, 162 total; exit 1. The failures are M07 and M09 PostgreSQL race tests because Docker's Linux engine is unavailable. The skipped Windows symlink test remains explicitly skipped. |
| Authorization and account regression coverage within that suite | **Passed**: ADMIN/MANAGER mutation boundaries, account lifecycle/stale-session protection, public/private record visibility, protected-route and server-secret contracts. These use isolated SQL claims/source contracts, not real staff login credentials. |
| Public search/map/navigation coverage within that suite | **Passed**: synthetic positive/negative searches, filtering/pagination, dates, safe errors, graph connectivity, verified-coordinate gate, watch cleanup, accuracy/freshness rules, and route behavior. |
| Production browser smoke, Chromium at 1440 px and 390 px | **32 passed / 2 failed**, 34 assertions; exit 1. Search submission and its current empty state, map geometry, wheel zoom, reset/path toggles, anonymous redirects across seven protected paths, pending-record privacy, security headers, no page exceptions/overflow, and both unauthenticated API denials passed. |
| Browser failure classification | **Both failures are pre-existing:** Reset view overlaps the zoom-in button. Old 16.3.6 and new 16.4.5 builds have identical overlapping hit boxes at both widths. No forced clicks or CSS workaround was used to mark this passed. |
| Application/migration preservation | **Passed:** no source or migration bytes changed outside the two dependency files; all 26 migration sources remain present. No SQL, hosted record, migration history, production environment or deployment setting was changed. |

The browser helper and raw results are retained outside Git in [stabilization evidence](<C:/Users/Nash/.codex/visualizations/2026/11/06/01a1af17-20fa-7da3-88bb-6a971b22313f/stabilization-evidence>): `baseline.json`, `production-audit.json`, `lint.log`, `typecheck.log`, `build.log`, `main-tests.log`, `browser-smoke.mjs`, `browser-smoke.json`, `browser-smoke.log`, and `zoom-baseline-comparison.json`. No new screenshots were needed. The browser tool is Playwright 1.64.1 using installed Chrome; it is test tooling outside application dependencies. `GRAVENAV_PLAYWRIGHT_MODULE`, `PLAYWRIGHT_EXECUTABLE_PATH` and `GRAVENAV_SMOKE_ORIGIN` allow its existing script to target another tool installation/local server.

### Reproduction, deployment checks and rollback

Use a **new empty worktree**, not a branch switch/reset in the dirty authoritative checkout. A fresh checkout of the candidate now contains the previously untracked components and five migration sources.

```text
git worktree add --detach <new-empty-worktree> 48703a96706f23ddbea81e9118f9ebf20a35b9bd
cd <new-empty-worktree>
npm ci
npm audit --omit=dev
npm run lint
npx tsc --noEmit
npm test
npm run build
```

Privately configure only the intended environment before building; `.env.local` is ignored. The Node minimum remains 20.9.0; existing CI uses Node 22, while this local run used Node 24. A Node 22/Linux CI result for this candidate is still required; none was triggered because nothing was pushed. Once Docker is running, rerun `node --test tests/gis-concurrency.test.mjs` to close the two environment-blocked race checks. The full `npm run validate` command remains available and will return nonzero while those required tests are unavailable.

For the retained browser helper, start the candidate with `npm start -- --hostname 127.0.0.1 --port 3109`, then run `node <stabilization-evidence>/browser-smoke.mjs`. It currently returns exit 1 for the two documented map-control failures. Positive public-record browser flows cannot yet run against the existing hosted dataset; real staff login/logout, invitation/password email delivery, and real-device GPS were not exercised. No authenticated record mutations were submitted. The two API POST checks used no session and returned 401 before any mutation.

**Proposed future target:** an explicitly approved Vercel Preview built from this candidate, then the selected panel-accessible production URL, currently referenced as `https://github-final-five.vercel.app`. This is a proposal only. No push, merge, deployment or alias/configuration change was made.

Before any future deployment, verify the exact candidate SHA; Node/build settings; Supabase URL and publishable key; server-only provisioning credential only if that feature is needed; the real HTTPS `NEXT_PUBLIC_APP_ORIGIN`; exact Supabase `/auth/callback` redirect allow-list entries; preview access protection; staff session cookies and logout; and a current recoverable backup. Public environment variables are baked into the client build, so build under the actual approved target configuration. The local smoke build uses localhost-origin settings and is not itself an approved production artifact. Do not assume a successful build fills the empty public dataset or repairs the known navigation limitations.

**Rollback:** keep the original checkout untouched. To inspect the pre-security state, create another empty worktree at preservation commit `fb9996317de8f0d19e77297f2d06e51436d765ee`; it retains the admin improvements but also the known vulnerable dependency tree, so it is a preservation point, not a recommended public deployment. A future production rollback should select the previously approved deployment artifact through the hosting platform only after authorization. If a code rollback is necessary, prepare and validate a separate rollback branch; do not reset or clean the original workspace. No database rollback or migration operation is required for this dependency-only change.

**Remaining blockers / next task:** prepare a separate, clearly labelled synthetic demo database and rehearse real ADMIN/MANAGER login → unused plot → burial entry → public visibility → successful search/profile/map → archive/recovery. That is the next highest-priority defense milestone. Resolve the small pre-existing map-control overlap before relying on those buttons; keep the Docker race tests, backup restoration, deployment configuration, navigation containment/graph consistency, field evidence, and optional photos open exactly as described above. This stabilization milestone does not complete the GPS or demo-data objectives.
