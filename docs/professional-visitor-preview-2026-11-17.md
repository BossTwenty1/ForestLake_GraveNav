# Professional visitor presentation and protected search preview

Implemented locally on 17 November 2026 in the maintained release candidate.

## Completed flow

Open `/admin/burial-records/preview`, or select **Preview Visitor Search** in
Deceased & Interments. An active ADMIN or MANAGER can search the existing staff
records, open a Memorial Profile, and return to the same query and results page.
Profile links remain under `/admin/burial-records/[id]/preview`.

Both routes authenticate on the server through the existing staff guard. Search uses
the existing `staff_burial_records` and `staff_sample_plot_references` readers.
There is no new API, dataset, database object, authentication mechanism or publication
bypass. Search includes pending/hidden records only within the authenticated preview.

The reader constructs an explicit public-safe projection before rendering. Owner
details, staff notes, source metadata, audit fields and internal P2S codes are withheld.
Locations are null and location verification is false in every preview. Preview map
and direction links remain disabled. A discreet staff notice sits outside the memorial
content. Published record previews retain truthful publication wording.

Preview routes are dynamic and noindex. Production HTTP checks returned
`Cache-Control: private, no-store, max-age=0` and
`X-Robots-Tag: noindex, nofollow, noarchive`. Anonymous requests redirect to the
normal sign-in page. Return navigation accepts only the protected search path and
its bounded query/page parameters.

## Presentation changes

- Visitor cards, memorial profiles and map labels use readable Gravesite References,
  Garden, Block, Lot and Interment Date. Missing details show **Not recorded**.
- Internal P2S identifiers and synthetic-reference labels are removed from visitor
  memorial content. Source references remain recorded references, without a new claim
  of physical location or actual burial confirmation.
- Memorial content uses **Memorial Profile**, **Deceased Information** and
  **Gravesite Details**. Pending previews no longer imply confirmed interment or
  cemetery-approved publication.
- Long names wrap. Decorative artwork is hidden behind unusually long profile names,
  and the memorial heading remains available to screen readers.
- Visible admin navigation and breadcrumbs say **Deceased & Interments**, with all
  existing burial-record routes preserved.
- Record details retain one concise explanation beside the plot association.
  IDs, internal lot codes, source references, revision and quality notes are grouped
  inside native expandable **Internal Record Details**.
- Inventory totals, plot selectors, availability/capacity explanations and coordinate
  verification retain their existing synthetic distinctions. Map selection IDs,
  geographic readers, routing logic and GPS eligibility are unchanged.

## Verification

- 38 focused tests passed across visitor preview, record visibility, visitor behavior,
  record management, synthetic inventory, Phase 2 navigation and visitor map presentation.
- Tests cover safe projection, authorized/denied access, protected profile and return
  links, missing fields, long names, publication guards and public reader exclusions.
- TypeScript, lint, production build and whitespace checks passed. Lint retains one
  pre-existing unused `mkdir` warning in `tests/gis-package.test.mjs`.
- Eight isolated headless Chrome renders passed: search and profile at 1440px/390px,
  in light/dark themes. Horizontal overflow, missing-detail presentation and keyboard
  focus/navigation were checked. The scope was the reused presentation components
  and search-page markup, with an empty browser profile and no signed-in cookies.
- The user confirmed that the genuine signed-in preview page and Tomas Kuwento search
  result work without error. Full authenticated mobile/profile/back journeys were not
  automated against the user's browser; those remain manual visual acceptance checks.
- The scoped design detector returned no findings.

Fresh hosted read-only reconciliation passed: 235 original protected receipts,
45 owners, 90 synthetic plots, 100 deceased and 100 interments; 45 unowned plots and
ten shared groups remain correct. All 100 records remain pending, hidden and
unconfirmed. Original lot/area hashes match, including all 4,494 original lots.
Anonymous checks excluded every imported record from the public view, all 100 name
searches, all 100 shared rosters and all 100 GIS responses. Three anonymous profile
and private-preview HTTP checks also passed.

Evidence outside the repository:
`C:/Users/Nash/.codex/visualizations/2026/09/23/01a0cedf-199e-7451-939a-f6477c900657/`:

- `milestone5-before-files.json` and `milestone5-changed-files.json`.
- `milestone5-visual/results.json` and the eight rendered PNGs.
- `full-dataset-preparation-20261117/milestone5-hosted-preservation-summary.json`.
- `full-dataset-preparation-20261117/anonymous-import-verification.json`.

## Files

New: `src/lib/visitor-presentation.ts`,
`src/app/admin/burial-records/preview/page.tsx`, `tests/visitor-preview.test.mjs`,
and this report.

Updated: existing preview reader/page, public burial types, visitor result/profile/location
components, map display labels, admin sidebar/header/directory/detail components and
their existing route active labels, global styles, preview response headers in
`next.config.ts` and `src/proxy.ts`, and three existing regression-test loaders.
The exact source/test paths are recorded in `milestone5-changed-files.json`.

The 333-file pre-task preservation snapshot identifies only intended changes. No
existing migration, dependency, environment file, routing algorithm or geographic data
file was changed. No hosted records were written, published, activated or confirmed.
The retired importer was left retired. No deployment, commit or push was performed.

## Local review

- Search: `http://127.0.0.1:3237/admin/burial-records/preview?query=Tomas%20Kuwento`.
- Profile: `http://127.0.0.1:3237/admin/burial-records/5/preview`.
- Staff detail: `http://127.0.0.1:3237/admin/burial-records/5`.

For manual acceptance, open a result, return to the preserved query, check the notice
and unavailable directions, inspect Internal Record Details, and repeat at 390px in
both themes. Anonymous public search must continue returning zero imported records.
