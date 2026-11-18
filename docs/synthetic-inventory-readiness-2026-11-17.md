# Phase 2 synthetic inventory correction and final prerequisites

17 November 2026. RC: C:/Users/Nash/.codex/worktrees/gravenav-defense-rc/gravenav.
Policy: GRAVENAV-P2S-20261117. Preparation and local implementation only.
No hosted import, SQL application, publication, deployment, commit or push.

## Implemented display correction

The reserved namespace is exactly `^P2S-[0-9a-f]{64}$`, shared by SQL predicates
and the small src/lib/synthetic-plots.ts presentation helper. Source references
and internal codes remain distinct. A record is visibly synthetic even before
its first interment/provenance projection exists.

- Dashboard and Plot Management show a separate synthetic project plot count.
- Physical inventory, availability, occupancy and coordinate-review totals
  exclude P2S records. Plot Management retains samples in normal all-state
  searches/pagination; physical availability/occupancy and coordinate filters
  exclude them. Existing physical filters and individual data fields are retained.
- Plot rows/cards describe sample admission eligibility, sample reservations
  and absent verified physical location, rather than physical vacancy or occupancy.
- Existing plot editing labels AVAILABLE as sample admission eligibility and
  regular as synthetic six-slot configuration for sample plots. All original
  form values, protected saves and role permissions remain intact.
- Owner relationships, related interments and deceased/interment forms/details
  identify synthetic project plots explicitly. Imported PERMANENT / ASH values
  are described as synthetic policy defaults rather than verified facts.
- New count fields are optional during rollout so the current hosted readers
  still work before their update. Missing counts say that the read-model update
  is required; they are never silently shown as zero. Applying the reviewed SQL
  is a prerequisite to any sample import.

No writer, admission, revision, confirmation, publication, authentication,
authorization, coordinate verification or public GIS guard was changed.

## Proposed SQL: local only, not applied to hosted

File: supabase/migrations/20261117020000_separate_synthetic_plot_inventory.sql.
SHA-256: `f4a257e463b5c22cb0b728349744beb646a15ef1b647daddf6eac3b9e0d3350e`.

The transaction replaces five existing staff read definitions while retaining
their signatures, security-definer behavior, search paths and grants:

1. staff_dashboard_data: physical lot CTE excludes P2S; reports syntheticPlots
   separately. Physical section counts and coordinate queue use that same scope.
2. staff_dashboard_counts: excludes P2S from plot/coordinate counts and adds
   a separate syntheticPlots count.
3. staff_plot_management: keeps searchable sample rows and pagination, separates
   syntheticPlots from physical summary totals, and prevents physical state and
   coordinate filters from treating samples as inventory.
4. staff_coordinate_verification: excludes synthetic records from the physical
   review source, totals and queue. Verification writers are unchanged.
5. staff_gis_readiness: excludes synthetic records from staff geographic readiness
   rows/counts. Published geometry, routing logic, private readiness view and
   public GIS functions are unchanged.

No new table, column, helper RPC, grant, trigger, data update or schema redesign.
The file wraps CREATE OR REPLACE definitions in BEGIN/COMMIT; it is only applied
to disposable local test databases in this task. Hosted ledger check confirms
20261117020000 remains absent.

## Local verification

- 37 focused tests passed, no failures or skips, including the complete dataset.
- Every one of the 235 protected saves passes locally. Interruption between
  individually committed calls, deterministic replay, payload conflict rejection,
  private/public reader separation and shared-record activation rejection pass.
- New tests compare lot/area rows, protected writer definitions and read grants
  before/after applying the SQL: unchanged. Manager reads remain allowed;
  anonymous and inactive access remains denied.
- Three additional sample plots remain searchable while physical dashboard,
  coordinate-review and GIS readiness results remain unchanged. Physical state
  and coordinate filters do not return those sample plots.
- Actual desktop/mobile plot components render the synthetic labels and separate
  count in a server-rendering test, without any Auth transport or browser tokens.
  This is component validation, not a live browser acceptance claim.
- TypeScript with no emit and incremental output disabled: passed.
- Production build: passed, including the dedicated milestone routes.
- ESLint: zero errors; existing unused mkdir warning in tests/gis-package.test.mjs.
- git diff --check and the Impeccable scoped detector: passed (no findings).
- Preservation hashes show all 312 unrelated baseline files unchanged.

An older RC process on port 3000 returned 404 for the dedicated milestone routes.
It was left running and untouched. The newly built production RC is running on
loopback port 3217. GET /admin/login returns 200; unauthenticated GET /admin,
/admin/owner-data/new, /admin/burial-records/new and
/admin/burial-records/1/preview each redirect to /admin/login (307).

## Genuine PUGI authentication: not verified

Computer/browser inventory reports:
"Local browser access is unavailable for this chat".
No browser credential entry, credential inspection, token extraction, forged
claims, hosted impersonation or service-role writes were attempted.

The normal sign-in interface for the validated current build is
http://127.0.0.1:3217/admin/login. The user must enter credentials personally.
The existing server flow validates Supabase Auth getUser and get_my_account,
then checks active ADMIN access. Without safe browser access this task cannot
independently observe a genuine PUGI session. HTTP redirects without cookies
prove unauthenticated protection, not PUGI authentication.

## Pinned import and hosted preservation

The authoritative workbook remains unchanged:
C:/Users/Nash/Downloads/GraveNav_Phase2_Demo.xlsx.
SHA-256: `d513d28922dfce121422916fbb94138e652dcf0080e146d51ad8c540b5bdcc0f`.
All rows again match the original extraction; nothing was regenerated.

Canonical reviewed preview SHA-256 remains
`bf006431c72c844df43336c101caba2df88622df90cb6cf0e9cf3e24df116b93`.
All 235 request UUIDs are unique and unchanged. The plan still contains:
45 owners, 90 new P2S plots, 100 deceased/interment pairs; 45 intentionally
unowned single-record plots; ten two-record shared groups. All 100 interments
remain pending, hidden and unconfirmed in the planned payloads.

Read-only hosted recheck of ddoowghocqyfoxaikifb confirms 4,494 existing lots,
zero owners/deceased/interments, zero P2S records and the temporary pilot RPC
absent. Preservation baselines match:

- Lots: `88d29e467313b2e23301040a45325cd09de9e8db826cd65aefd97a195d0a9973`.
- Areas: `0a1558f5982122367817a79f9172f3babc14ce6e31789482628d511dd12d9f45`.

The 20 shared records remain valid for private pending storage. The existing
actual-interment confirmation rule still prevents honest activation of these
classified fictional records. Publication is excluded from this import; that
blocker must not be bypassed by setting confirmation true.

## Exact future execution sequence: requires separate approval

The local correction is implemented and tested. Hosted execution is NOT READY:
genuine PUGI session verification is outstanding, and the SQL is intentionally
unapplied. In-principle approval does not authorize either hosted step.

1. Verify the genuine PUGI active ADMIN session through the existing application
   and exact hosted project; do not substitute the CLI database login.
2. Obtain separate approval for the pinned SQL definition update and the exact
   full import sequence. Apply only the reviewed SQL transaction; check the five
   authenticated staff readers and separate sample count of zero before import.
3. Recheck the unchanged workbook/plan hashes, all request IDs, zero sample
   collisions, required migrations and original lot/area baselines. Stop on drift.
4. Through genuine PUGI Auth and existing staff_save_record, process original
   source groups: optional owner (45 total), new lot with receipt-bound owner ID
   or null (90), then deceased/interment pairs with receipt-bound lot IDs (100).
   Normal audit/history and capacity approval side effects remain truthful.
5. Journal exact payloads and successful receipts without credentials. Stop at
   the first conflict/error. Unknown outcomes retry the identical request ID and
   concrete payload under the same actor. Never assign replacement UUIDs or
   rerun first-import namespace checks against a partially committed batch.
6. Resume from reconciled receipts. Individual HTTP saves are atomic; the entire
   batch is not one transaction. Prefer forward recovery. Abandonment requires
   separately approved exact-ID recovery that retains audit/receipt history.
7. Reconcile 235 protected receipts, 335 new application rows, all source and
   owner/group links, hidden/unconfirmed status and absent verified geography.
   Rehash the ORIGINAL lot/area set (excluding the 90 new rows) against baseline.
8. Verify staff directories, owner relationships and protected previews. Physical
   totals remain unchanged; synthetic count becomes 90. Anonymous search,
   profiles, rosters and GIS expose none of the initial hidden batch.

No publication, GIS activation, hosted record modification outside this plan,
deployment, commit or push is included in that future approval.

## Task files

- src/lib/synthetic-plots.ts (new).
- src/lib/supabase/types.ts; src/lib/supabase/admin-data.ts.
- src/components/admin/admin-foundation.tsx; plot-management-list.tsx;
  admin-crud-pages.tsx; owner-pages.tsx; burial-record-pages.tsx.
- supabase/migrations/20261117020000_separate_synthetic_plot_inventory.sql (new).
- tests/synthetic-inventory.test.mjs (new); tests/full-project-samples.test.mjs.
- This readiness report (new).
