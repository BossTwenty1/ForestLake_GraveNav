# GraveNav Phase 2 operational readiness

Updated 10 November 2026. This is the current main-application handoff. The filename is retained for existing links. Earlier audits and release results are preserved in the [history snapshot](archive/2026-11-09/phase2-readiness-history.md).

## Accepted scope and visitor experience

**Full Phase 2 map coverage, Section D operational-data coverage.** GraveNav is intended to become a real operational cemetery system. Its first verified records and on-site navigation serve Forest Lake Phase 2 -> Majestic Palm Garden -> Section D. Other sections remain visible and can receive approved operational data later.

The entire CAD layout remains: **4,494 selectable candidates**, comprising 4,146 lawn and 348 estate outlines, all 20 overlap-review pairs and nine CAD-backed planned-place anchors. A selectable CAD candidate is planning geometry; it is not an officially identified or occupied grave. Landscape surfaces, trees and protection illustrations do not establish constructed site conditions.

The intended flow is: search an authorized public deceased record; show the correct gravesite and live phone location with reported accuracy on the same GraveNav map; draw a reviewed permitted walking route to its access endpoint; update the remaining distance in metres while the visitor moves. Poor, stale, denied or unavailable fixes pause guidance. Preserve the selected individual's identity when multiple deceased people share one lot.

The final defense target is tentatively 18 November 2026. Passing local software checks does not replace management approval or on-site evidence.

## Actual implementation and checkout

Work in `C:\Users\Nash\.codex\worktrees\gravenav-defense-rc\gravenav`. Check `git rev-parse HEAD` and `git status --short` before changing anything; the chat's default worktree can be different.

The last committed baseline checked for this update is `345fcbf7dd453d1ecd9c857116a1881b9c9da2c2`. It includes shared gravesites and field preparation. M09 lock ordering is separately committed as `dd1723db3bdf1938e3da5d908cae6736956ebf89`. The native November 9 integration, November 10 navigation implementation and documentation remain uncommitted. Preserve that work. No commit, hosted mutation or deployment was performed for this navigation task.

| Capability | Current state |
| --- | --- |
| Main map | `/map` renders the November 9 landscape inside GraveNav's existing header, navigation, memorial search and map controls. The administrator map uses the same component. |
| Native CAD interaction | All candidate geometry, independent overlap selection, categories, highlighting, nine anchor focuses and technical reference search remain available. The map owns persistent canvas renderers. |
| Reference viewer | `/phase2-viewer/index.html` is the installed standalone local reference. The main Map tab stays in `/map`. |
| Geographic adapter | Integrated into /map as the verified geographic mode using existing public_mapping_layer and public_burial_gis. The old /phase2-map URL redirects to /map. Publication, burial, lot, polygon and access identities remain checked. |
| Search and staff records | Individual public deceased search/profiles, protected staff workflows and shared-gravesite contracts exist. No Section D records have been imported by this work. |
| Geographic readiness | No Section D boundary, official plot-to-CAD match or independently validated Section D ground transformation has been established by the available evidence. |
| Phone navigation | Location/accuracy, directed reviewed-edge routing, remaining distance, off-route/arrival and failure handling are implemented and locally tested. Guidance needs a published release and its field-reviewed policy. Actual Section D activation and real-phone acceptance remain blocked. |

Phase 1 is retired from the active map interface. Its historical data, source files and tests remain preserved. Legacy Phase 1 routing thresholds and graph counts are not Phase 2 acceptance evidence.

Set server-side `GRAVENAV_PHASE2_SITE_ID` and `GRAVENAV_PHASE2_AREA_ID` only to management-approved existing identities. Until confirmed, leave them unset and preserve the adapter's unconfigured/unpublished states. Public GIS readers expose an approved publication independently of the UI; restricted hosting needs an approved protected read path. Public search/profile IDs currently use JavaScript safe integers; larger GIS bigint identifiers need compatible text-safe record lookup before use.

## November 10 navigation integration

The existing /map workspace now has **Full Phase 2 layout** and **Verified gravesite & GPS** modes. Both retain the application shell, search and details. All planning geometry remains unchanged/selectable. GPS appears only in geographic space; there is no assumed CAD-to-GPS overlay or invented transformation.

Search -> eligible profile -> **View gravesite on map** resolves the public burial ID to its exact approved lot polygon/access point. Main-map record results open that individual in the same workspace. Shared deceased identities lead to the same destination. Missing/private/unmapped/unverified records never select an arbitrary CAD outline. Legacy /navigation and /phase2-map entries converge on /map.

Routes begin at a bounded projection onto a published reviewed directed edge and end at the exact access node. Published metric costs and one-way restrictions apply. No straight GPS-to-node or access-to-grave connector is added. Outside coverage, plot-interior positions, off-route, unreachable, stale or inaccurate fixes pause guidance. Arrival requires short remaining network distance and reported position/accuracy within the reviewed endpoint arrival radius.

The visitor requests GPS explicitly; positions remain on-device and are not uploaded to Supabase. The read-only /api/map/phase2?id=<burial-id> endpoint rechecks the public record/publication before guidance and returns a no-store response. Checks repeat every 15 seconds while moving; requests time out at 10 seconds and guidance expires 30 seconds after the last successful verification. A changed/withdrawn release, revision, target, access point or policy pauses directions. These technical refresh limits are separate from field navigation tolerances.

A failed/malformed shared-roster RPC is now distinct from a successful empty roster. Profiles show an unavailable message and retry link; only eligible IDs/names are returned. Unconfigured public readers no longer substitute fictional records.

### Field-reviewed navigation configuration

The existing GRAVENAV_PHASE2_SITE_ID and GRAVENAV_PHASE2_AREA_ID remain unset until management approves the real scope. No private environment values were invented or changed.

GRAVENAV_PHASE2_NAVIGATION_POLICY is optional server-only JSON. Without a valid policy, an approved geographic map can display a grave/current position, but walking guidance is unavailable. No operational accuracy, corridor or arrival defaults are supplied.

| Field | Required value |
| --- | --- |
| releaseId | Exact approved published release UUID |
| scopeRevision | Exact current publication scope revision |
| reviewReference | Restricted field/navigation approval reference, nonempty, at most 250 characters; stripped from public responses |
| maxAccuracyM | Field-approved maximum reported horizontal accuracy, positive finite metres |
| maxOffRouteM | Field-approved maximum distance to the reviewed walking corridor, positive finite metres |
| arrivalDistanceM | Field-approved access-endpoint arrival radius, positive finite metres |
| maxFixAgeMs | Approved maximum fix age, positive finite milliseconds, at most the existing 30,000 ms freshness ceiling |

Set this configuration only after accepting device/map/route evidence, then restart the authorized application. A different release or publication revision needs corresponding reviewed settings; rollback does not bypass the policy gate. No new database migration or package dependency was introduced.

### Exact field information required for activation

1. Official Section D boundary/register, literal lot identifier, numbering convention and resolution of repeated orders/leading zeros.
2. Authorized individual burial/order -> physical marker -> exact CAD candidate/source revision/instance-path correspondence.
3. Confirmed CAD units/ground dimensions; matched controls with method, datum, timestamps and accuracy; independent held-out checkpoints and reviewed transformation errors.
4. Accepted geographic lot polygon; permitted entrances, paths, directions and barriers; exact reachable gravesite access endpoint.
5. Actual phone observations supporting accuracy/corridor/arrival/freshness settings, then real Forest Lake search-to-arrival tests over an approved secure origin.
6. Explicit audience, record visibility and target-specific migration/import/publication/CAD-distribution permission.

The 9 November 65-item checklist remains a historical audit snapshot. MAP08, SHARED08 and navigation implementation items have progressed under the local tests below; field and hosted activation gates remain outstanding.

## Existing Section D evidence

Reuse the completed audit and restricted queue. Do not repeat the workbook extraction or infer membership from ordering.

- The original interment workbook's `Leg2` sheet contains **109 interment orders with MPG/D-prefixed locations**, grouped into **98 distinct composite location keys**, including product class and preserving leading zeros.
- These are review leads. Management has not independently verified their official Section D membership. Neither 109 orders nor 98 keys is a physical-grave count.
- Ten keys contain multiple orders: 21 rows. Nine groups contain distinct normalized name strings; one repeats a normalized name. Shared PA references, different dates and alternate names across worksheets do not resolve duplicate orders, people, events or current occupancy.
- Converting source number tokens to integers would collapse one leading-zero distinction. Preserve literal identifiers until management resolves it. Eleven repeated PA identifiers affect twelve queue entries.
- The CAD contains text D at handle `18BC`, Majestic Palm Garden at `18BE` and the separate Majestic Palm Court C at `18C1`. The full-site outline is `1924`. No official Section D boundary or plot correspondence follows from those labels.
- Candidates retain reproducible full CAD instance paths, but no authoritative official plot IDs have been populated. Current confirmed Section D-to-CAD matches: **zero**.
- A regular outline measures 1 by 2.5 drawing units and has a metric-style block name, while the drawing header reports inches. Confirm actual units and constructed dimensions before using CAD measurements as ground distances. Local CAD X/Y are not latitude/longitude.
- Earlier Royal Palm/Yellow Palm readings and layout-derived field-tester references do not independently validate Section D. Original workbook review does not establish public-display permission.

Original sources remain unchanged:

| Source | Location / SHA-256 |
| --- | --- |
| Interment workbook | `C:/Users/Nash/Downloads/GRAVE NAV/GRAVE NAV.xlsx` — `aee550df7a00bd5a923be1dfc5f7fcb9519c7c7222cb8dc4fd4305beaf51492e` |
| Audited engineering DXF | `C:/Users/Nash/Documents/GraveNav-Phase2-CAD/FL LGP PH2_Sch 6.2_ for Pama.dxf` — `c8c4c922d3293da6490c30ffcce79c6ac810d32e0cdf6907ee448537eba3844c` |

Use the existing [semantic audit](<C:/Users/Nash/Documents/GraveNav-Phase2-CAD/phase2-digital-map/qa/dxf-semantic-audit.json>) and accepted source-workspace reports for extraction provenance. Source audits document their audited revision and do not authorize operational mapping.

## Restricted management and field review

Review artifacts stay outside Git and the web root, in:

`C:/Users/Nash/.codex/visualizations/2026/11/07/01a1b45b-514b-7232-85ed-3116e541ac04/restricted-section-d-review/`

- [Management review queue](<C:/Users/Nash/.codex/visualizations/2026/11/07/01a1b45b-514b-7232-85ed-3116e541ac04/restricted-section-d-review/section-d-management-review.xlsx>): one entry per composite key, preserving all 109 source order/row links. Initial SHA-256 `53fad96a25a6677632ae137a7a06b8c29c5030985180721b5a2fefdcdf5549a2`; reviewer changes will change the hash.
- [First field-verification record](<C:/Users/Nash/.codex/visualizations/2026/11/07/01a1b45b-514b-7232-85ed-3116e541ac04/restricted-section-d-review/section-d-first-field-verification.md>): one source-checked lead, selected for review only. Management may choose another. Membership, marker, burial authorization, CAD match, survey and walking approach remain unresolved.

The existing Windows ACL restricts this directory to the current user, SYSTEM and local administrators. Share with Forest Lake through its approved restricted channel. Keep names, order identifiers, client details, marker photos and review evidence out of public pages, logs and general summaries.

Forest Lake management must supply or confirm:

1. The meaning of LEG2 and MPG/D, the current official Section D boundary/register, numbering direction, product classes and leading-zero distinctions.
2. One full official plot identity and its physical marker, the authoritative individual burial/order association, visibility permission and resolution of corrected or repeated orders.
3. A dated approved plan or signed markup linking the boundary and lot numbering to the audited CAD revision. Record exact candidate ID, full instance path, layer and source handles; independently reopen the same candidate for second-reviewer approval. Proximity to the D label, row order and matching counts cannot establish a crosswalk.
4. Approved access for survey and phone testing, permitted entrance/path/endpoints, barriers and restrictions, reviewer identity/date and restricted evidence provenance.
5. Specific permission for any later public or authenticated release of records or derivative mapping. Review and survey permission do not grant publication authority.

## Shared-gravesite rules and compatibility

Use one existing operational `lot` for each verified physical grave, individual `deceased` and `burial_record` identities, and one geographic polygon/access destination per lot. Do not join names into a single person or split a grave into artificial lots.

The local forward migration `20261107010000_shared_gravesite_interments.sql` replaces the global one-burial-per-lot restriction with reserved `(lot_id, interment_slot)` positions:

- Approved regular graves permit six actual-interment slots.
- Mausoleums require an individually approved arrangement and numeric capacity before admission.
- Unclassified lots retain one-assignment behavior pending review.
- Pending, archived, removed and restored records retain reservations. Capacity release and exhumation/correction policy remain unresolved.
- Lot locking and protected writes prevent concurrent overbooking. New admissions require actual reviewed interments and order/date evidence; ambiguous repeated orders stay in reconciliation.
- Existing IDs, relationships, audit history and private visibility remain protected. Public shared-plot rosters apply each individual's eligibility filters.

This migration is locally committed; this document does not establish that it has been applied to any hosted target. See [database notes](GraveNav_Database_Implementation_Notes.md) and [safe editing](search-navigation-safe-edits.md).

## Geographic evidence and activation sequence

The intended survey derives lot positions from CAD using matched controls, avoiding a GPS capture at every lot. Section corners may be useful controls when unambiguously matched, but corners alone do not establish accuracy.

1. **Confirm identity first.** Have management approve one Section D location, source order/person, physical marker, exact CAD outline and intended audience. Retain unresolved fields explicitly. Create no live records during review.
2. **Establish the transformation.** Confirm units and ground dimensions. Identify well-distributed common CAD/ground controls. The existing protocol targets 12–15 fitting controls, 3–5 independent held-out checkpoints and five fresh observations per point/session. A surveyor must confirm the method and suitability for this section. Keep independent checks out of fitting.
3. **Retain evidence.** Record datum, device/method, timestamps, every raw observation including poor readings, reported accuracy, source point identity, reviewer and transformation residuals. Establish tolerances before accepting results. Work in EPSG:32651 and export accepted longitude/latitude geometry in EPSG:4326.
4. **Verify lots and access.** Confirm representative markers/numbering, the selected geographic polygon, permitted walking approach and exact reachable access node. Record barriers, entrances, crossing permissions and edge direction. A plot location and walking endpoint can differ.
5. **Review hosted prerequisites separately.** Obtain explicit authorization for the target and forward migrations, backups and compatibility checks. Operational lot/burial creation or import needs its own authorization and must use existing protected workflows. No hosted mutation is authorized by this runbook.
6. **Use the existing GIS pipeline.** Link approved official identity -> operational lot -> authorized burial -> reviewed CAD reference -> accepted polygon -> reviewed access endpoint. Pin the approved site/area and explicit pilot lot IDs. The existing package supports 1–50 lots; start with one. If the administrative area is broader than Section D, resolve that scope before configuring the selector; the adapter has no independent subsection filter.
7. **Validate, review, publish.** Follow the [15-file contract](gis/pilot-package-v1.md) and [protected import/publication runbook](gis/import-and-publication.md). Offline validation precedes database stage/resume/validate/finalize. Finalization produces an unapproved release. ADMIN review, approval and publication are separate authorized operations with revision checks and rollback.
8. **Field acceptance of integrated navigation.** Validate the implemented routing against the real published graph, geographic containment, eligible origin and exact access node. Test real phones at Forest Lake over an approved secure origin: accuracy, stale/poor/denied fixes, route restrictions, off-route conditions, connectivity and physical arrival. Measure route/device errors before choosing thresholds. Enable directions only after these gates pass.

For database import, export walkways as LineString and grave-access graph nodes using a supported database node type such as junction. The offline contract also accepts MultiLineString and an access node type, which are broader than current database storage constraints.

The next field task is management review of the existing first-gravesite record and survey preparation. Integrated navigation can be tested further with approved contracts and test-only fixtures; real activation remains gated on the evidence above.

## Current map package, installation and rollback

Selected package: `phase2-full-landscape-2026-11-09`, in:

`C:/Users/Nash/Documents/GraveNav-Phase2-CAD/phase2-digital-map/artifacts/`

| Item | SHA-256 |
| --- | --- |
| Sibling ZIP | `e67b623d89ae599f715e034a5f0339efa9e9e5fa7f64878b66a3459f7bacc6fe` |
| Package manifest | `97ee08ee48f8d0a6d762141b67d5a9c877caa0628b6bc9dfa0777326197036a2` |
| Geometry data | `02a4dba490872f9be8cf56280ccf432d31796431c1f808f542fbff86ac28ca77` |
| Landscape manifest | `7231314fc2aa5ad72df98a050bea717a069591a08dca82700d7e62e96b1c9ebc` |
| Native place labels | `ccb2ef4624573ff918e789ec9035efccf847880c5908ea91c9e9111ce03c381b` |

The package contains exactly **12 runtime files, 20,945,916 bytes**, under `site/`. Preserve the sealed source package and its manifest. Its static JS is `assets/index-CKaF1Nmu.js`; GraveNav's native map uses its data/landscape assets within the existing application.

For a fresh local setup:

1. Obtain the approved private environment configuration, install locked dependencies with `npm ci`, and use the current compatible native map code.
2. Verify the ZIP and manifest hashes. Extract and stage the complete `site/` outside `public/`; verify exactly 12 runtime entries with each manifest size/hash.
3. Stop the existing local server. Preserve the previous complete viewer outside `public/`, then install the staged directory as `public/phase2-viewer/`. Do not merge old JS assets into the new directory.
4. Copy the matching `src/landmarks.json` from the separate Phase 2 source workspace to `public/phase2-planning/places.json`, verifying the native-place-label digest above. Both asset directories are Git-ignored; a fresh checkout will not contain them.
5. Build and start on loopback:

~~~powershell
npm run build
npm start -- --hostname 127.0.0.1 --port 3217
~~~

Open [GraveNav](http://127.0.0.1:3217/) and the [integrated map](http://127.0.0.1:3217/map). Verify candidate inventory, labels, hidden-layer selection, refresh, Back and missing-asset recovery after installation.

The November 7 rollback assets remain outside the web root at:

`C:/Users/Nash/.codex/visualizations/2026/11/07/01a1b45b-514b-7232-85ed-3116e541ac04/landscape-adoption-2026-11-09/november-7-rollback/`

Rollback requires compatible application code **and** complete assets before rebuilding; the native November 9 loader cannot use only the earlier six-file package. Original November 6/7 archives and hashes remain in the [historical handoff](archive/2026-11-09/phase2-readiness-history.md). The November 6 viewer retains the old redraw defect.

## Access boundary

The product goal is operational use. The **current CAD hosting authorization remains local-only**. Keep the present installation on loopback until Forest Lake approves an access policy. Git ignore is not HTTP protection: deploying these Next.js public assets unchanged makes the geometry and images publicly retrievable, even when staff pages require login.

Do not modify hosted Supabase, import real records, apply hosted migrations, publish GIS data, push, merge or deploy without explicit authorization. Preserve original CAD/GIS workbooks, accepted Blender studies and sealed packages.

## Latest validation and remaining blockers — 10 November 2026

| Check | Actual local result |
| --- | --- |
| Focused navigation/adapter/visitor tests | 43 passed, 0 failed, 0 skipped |
| Full Node suite | 204 total: 200 passed, 3 failed, 1 skipped |
| Three failures | Genuine M07, M09 and shared-slot PostgreSQL concurrency checks cannot reach Docker's Linux engine; not passes |
| Native CAD browser scenarios | Desktop, touch-emulated mobile and missing-image retry passed: 4,494 candidates, all 40 overlap members, nine anchors, hidden-layer recovery and controls |
| Actual Next.js navigation acceptance | 28 desktop/mobile checks passed with isolated test-only RPC fixtures: search/profile/main-map, shared destination, GPS progress/arrival, denial/staleness/accuracy/off-route, missing data, changed publication/service failure, stalled-request timeout, roster recovery and legacy links |
| HTTP/asset/access checks | 38 passed, 0 failed, including all 12 runtime HTTP hashes, old asset 404s, anonymous staff denials, no-store responses and stripped private policy evidence |
| TypeScript / production build | Passed |
| ESLint | 0 errors, 1 existing unused-import warning |
| Real field / hosted acceptance | Not performed; no record import, hosted mutation/publication or actual phone GPS test is claimed |

Browser fixtures live only in automated tests, under an explicit transport that blocks hosted access. Normal product code has no fixture loader or fictional-record fallback. The temporary fixture server is stopped after testing.

Evidence: C:/Users/Nash/.codex/visualizations/2026/11/07/01a1b45b-514b-7232-85ed-3116e541ac04/navigation-2026-11-10/.

Remaining blockers: official Section D identity/CAD crosswalk, accepted ground control/checkpoints, permitted route/access evidence, reviewed navigation settings, real-phone acceptance, target-specific migration/import/publication/hosting authorization and genuine PostgreSQL race gates. The local Auth callback-origin/preview-port mismatch and optional photo activation remain separate audit items, unchanged by this task.

The historical Phase 1 Reset/zoom overlap was not claimed fixed. See the [documentation index](README.md) for current contracts.
