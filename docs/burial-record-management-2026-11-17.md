# Deceased and Interment Records — Milestone 2

Completed locally on 17 November 2026 in the existing RC:
`C:/Users/Nash/.codex/worktrees/gravenav-defense-rc/gravenav`,
branch `codex/defense-release-stabilization-20261106`.
No hosted access or record modifications, migrations, imports, GIS publication,
commit, push or deployment occurred.

## Completed workflow

- Existing `/admin/burial-records` retains its search, filters, sorting,
  pagination, export, batch status, removal/recovery and role-specific actions.
  The primary action reads **Add Deceased / Interment Record**.
- `/admin/burial-records/new` provides the existing combined registration
  workflow in a dedicated, sectioned form.
- `/admin/burial-records/[id]` displays personal details, interment information,
  plot, status/public-display setting, references and staff-only notes.
- `/admin/burial-records/[id]/edit` uses the same form and opens the saved record
  on success. The existing plot and order locks remain for confirmed interments.
- Existing `?record=ID` and `?add=1` links redirect to the dedicated routes.
  Returning to the directory retains its search/filter/page context.
- Current plots remain selectable when editing even when they no longer appear
  in new-admission options. With no eligible plots, registration is unavailable
  with an explanation; the UI never creates a plot automatically.
- Internal Lot Code and Synthetic Plot Reference remain separate. The synthetic
  label comes only from the existing protected reference reader.

## Reused implementation and safety

The existing `createBurialRecord`, `updateBurialRecord`, `staff_save_record`,
`staff_interment_plot_options`, directory RPC, staff authentication, role checks,
revisions, idempotent retries, audit/recovery and capacity/publication rules remain.
The former inline form was removed rather than duplicated. Form/detail styling
uses the same existing layout module and UI components as Milestone 1.

Exact-record lookup reuses the existing staff record projection, filtered by
burial ID and excluding removed records. It loads interment confirmation/order
fields so editing does not lose established restrictions. Three type entries
were added for the already-existing nullable `interment_confirmed` column;
this is a local type-snapshot correction, not a database migration.
Public display retains the existing checkbox and backend eligibility rules;
no new visitor visibility or preview workflow was added.

The real-concurrency test fixture needed one correction: its isolated regular
grave now explicitly declares `AVAILABLE`. Relying on the old default failed
after the existing UNKNOWN-availability migration. No application rule changed.

## Files changed by this milestone

- `src/app/admin/burial-records/page.tsx`
- `src/app/admin/burial-records/new/page.tsx` (new)
- `src/app/admin/burial-records/[id]/page.tsx` (new)
- `src/app/admin/burial-records/[id]/edit/page.tsx` (new)
- `src/components/admin/admin-crud-pages.tsx`
- `src/components/admin/burial-record-list.tsx`
- `src/components/admin/burial-record-pages.tsx` (new)
- `src/lib/burial-records.ts` (new)
- `src/lib/supabase/admin-data.ts`
- `src/lib/supabase/types.ts`
- `src/lib/supabase/database.types.ts`
- `tests/burial-record-management.test.mjs` (new)
- `tests/burial-record-browser.mjs` (new)
- `tests/gis-concurrency.test.mjs` (one isolated fixture correction)
- This report (new)

## Verification

- `node --test tests/burial-record-management.test.mjs tests/owner-management.test.mjs tests/repository-smoke.test.mjs tests/shared-interments.test.mjs`:
  **28 passed**, no failures/skips.
- `node --test --test-name-pattern='shared regular grave' tests/gis-concurrency.test.mjs`:
  **1 passed**, using two genuine PostgreSQL sessions competing for the sixth
  slot in a disposable Docker database. Overbooking was prevented.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed; one existing unused `mkdir` warning remains in
  `tests/gis-package.test.mjs`.
- `npm run build`: passed, including the three new protected routes.
- `git diff --check`: passed.
- Impeccable detector: no findings on the new record UI.
- `tests/burial-record-browser.mjs`: desktop ADMIN and mobile MANAGER actual
  Next.js journeys passed with isolated local Auth/API fixtures. Coverage
  includes directory search/pagination, exact detail loading, synthetic/internal
  references, create and save redirect, edit, confirmation locks, date validation,
  save failure with retained input, stale-revision rejection, no eligible plots,
  missing records, retry, legacy URLs, restored directory filters, no page
  overflow and no browser page errors. Anonymous and inactive users were denied
  access to all three new routes.
- Desktop/mobile captures were inspected outside the repository. The temporary
  app and fixture server stopped after the browser run.
- SHA-256 comparison against 213 pre-edit source/docs/test/schema/package files
  found only the seven intended existing files changed. Milestone 1 and unrelated
  baseline files remained byte-for-byte unchanged.

The browser script uses already installed Playwright via
`GRAVENAV_PLAYWRIGHT_MODULE`, optional `GRAVENAV_CHROME_PATH`, and optional
`GRAVENAV_QA_DIR`; it adds no dependency. Browser fixtures are test-only,
in-memory and restricted to loopback, with external browser requests blocked.
They are not a hosted Auth or record-write acceptance test.

## Remaining limits

No implementation blocker remains for this milestone. Actual registration
requires an existing eligible plot and compliance with current order/capacity
requirements. Eligibility does not establish CAD identity, physical placement
or GPS readiness. Hosted end-to-end acceptance and a full-suite regression
were outside this focused local pass. Milestone 3 has not started.
