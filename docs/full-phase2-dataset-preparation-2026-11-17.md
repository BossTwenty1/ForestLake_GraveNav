# Complete Phase 2 working-dataset preparation

Historical preapproval preparation report. The user's subsequent six policy
decisions supersede the pending-approval sections and preview hash below.
Use [the final import policy](full-phase2-dataset-import-policy-2026-11-17.md)
for the current approved policy, pinned preview, remaining execution holds and
display-correction proposal. This report retains the original review evidence.

17 November 2026. Existing RC: C:/Users/Nash/.codex/worktrees/gravenav-defense-rc/gravenav.
This replaces the one-record pilot as the preparation scope. The source dataset
was neither regenerated nor replaced. No hosted writes, migration, import,
publication, deployment, commit or push occurred.

## Complete source validation

The existing workbook C:/Users/Nash/Downloads/GraveNav_Phase2_Demo.xlsx retains SHA-256:

`d513d28922dfce121422916fbb94138e652dcf0080e146d51ad8c540b5bdcc0f`

The read-only verifier reconciles every source row against its existing private
JSON extraction, including fictional IDs, names, dates, plot display references,
Source Row Keys, CAD reference tokens and source review flags.

- 45 fictional owners.
- 100 distinct fictional people and 100 interments.
- 4,470 source plot references, with no hosted lot IDs and UNKNOWN source availability.
- 90 referenced plots: 80 single-person groups and ten two-person groups.
- 46 referenced Butterfly Palm Garden plots and 44 Majestic Palm Garden plots.
- All 90 referenced source rows have no outstanding source review flags.
- 4,380 unreferenced source rows remain source-only, including their flags.
  They are not silently converted into additional operational graves.

The preview explicitly lists a disposition for every one of the 4,470 references,
not just the first person or the 90 referenced groups.

## Fresh read-only hosted evidence

Project: `ddoowghocqyfoxaikifb`. Queries used READ ONLY transactions and rollback.

- 30 migration ledger entries, including shared-interment, UNKNOWN availability,
  and public sample-reference support.
- 4,494 existing lots, all HOLD.
- Zero owners, deceased people and interments; zero existing sample source markers.
- Zero P2S-prefixed lot-code collisions, published plot geometries or grave-access
  associations.
- Existing garden containers: area 5 / Butterfly Palm Garden and area 6 /
  Majestic Palm Garden, both site 1. This is not a source-to-physical-lot crosswalk.
- PUGI is ACTIVE ADMIN; genuine PUGI Auth session verification remains outstanding.
- The removed temporary single-pilot RPC remains absent.

Preservation baselines:
- All existing lot rows SHA-256:
  `88d29e467313b2e23301040a45325cd09de9e8db826cd65aefd97a195d0a9973`
- All existing area rows SHA-256:
  `0a1558f5982122367817a79f9172f3babc14ce6e31789482628d511dd12d9f45`

These are time-specific preflight hashes, not authority to write against stale data.

## Recommended representation for review — not yet approved

Do not guess 90 existing lot IDs from internal code suffixes, sequences, CAD order
or proximity. The earlier single synthetic assignment does not authorize the
other 89, and all current inventory lots remain held.

The prepared alternative creates **90 new, explicitly synthetic non-geographic
lot records** inside the existing database, using existing protected operations.
Each uses a collision-resistant `P2S-<full Source Row Key>` internal code.
Database-generated lot IDs are obtained from protected save receipts. No
pre-existing lot ID is assigned to a CAD candidate or source reference.

Source garden, lawn, literal block/lot, commercial class, display reference and
CAD token remain separate provenance. The new rows use only the reviewed existing
garden container, with no block FK, geometry, coordinates, verified flag, route
or published GIS association. Existing lot/area rows are never updated.
The original source references remain unchanged and are shown separately through
the existing sample-reference projection.

This increases the application lot inventory from 4,494 to 4,584. Existing
dashboards/readers include these extra records; approving this representation
must acknowledge that those 90 entries are project samples, not newly discovered
physical cemetery lots.

### Explicit policy decisions still required

1. Approve creating these 90 marked sample-only lots instead of binding existing
   physical inventory. If that representation is unacceptable, supply reviewed
   existing-lot assignments; the tool will not choose them arbitrarily.
2. Admission currently requires AVAILABLE even for pending interments. The
   proposal uses AVAILABLE only on the 90 new marked synthetic rows, meaning
   sample admission permission, not surveyed vacancy or sale availability.
   Existing 4,494 HOLD records remain unchanged. This semantic use needs explicit
   review and approval; it is not inferred from fictional identity approval.
3. Owner addresses are proposed as
   `Fictional project address — DEMO-OWN-xxxx (not a real residence)`.
   Names remain unchanged. No real address/contact is introduced.
   PERMANENT and ASH are proposed sample-only required defaults, not workbook facts.
4. Eighty single-person groups stay unclassified (one reservation). The ten
   shared groups require capacity configuration. The proposal uses the existing
   regular/six-slot rule with an explicit sample-only policy reference. It does
   not derive capacity from STD/PRM/SPR/ESTATE. Treat this as a policy proposal,
   not an approved physical grave classification.

All 90 assignments, 45 dependent owners and 100 interments are held for those
policy decisions. There are zero executable hosted writes in this preparation.

## Important shared-record publication blocker

All 100 records are prepared as pending, public_display=false and
interment_confirmed=false. No fictional interment is certified as an actual burial.

The existing backend forbids activating a classified shared-grave record without
actual-interment confirmation. Local tests reproduce that rejection.
Do not set that flag true merely to enable publication.

Consequently, all records can be stored privately under the proposed policy, but
the **20 people in the ten shared groups cannot be activated/published honestly
under the present rule**. Full public working-data activation requires a separately
reviewed policy solution. No migration, trigger relaxation or false confirmation
was prepared or executed here. Milestone 3 retains the correct unavailable-
publication explanation. Hidden records are expected to be absent publicly.

## Exact proposed write totals

| Operation | Proposed count |
| --- | ---: |
| Create owners | 45 |
| Create new marked synthetic lots | 90 |
| Create deceased persons | 100 |
| Create interments | 100 |
| Update existing lots / areas / geometry | 0 |
| Set actual interment confirmations true | 0 |
| Publish records / GIS | 0 |

The 100 burial protected saves create the deceased/interment pairs atomically:
**235 existing staff_save_record calls**, not 335 independent raw inserts.
Owner IDs and new lot IDs are substituted from save receipts. The new lot ID is
also written into the existing sample-provenance JSON so the protected reference
reader can verify it. IDs, Source Row Keys and original shared groups are retained.

## Controlled execution design after policy review and final approval

No live batch executor is enabled. The file-only planner has no network client,
credential inputs or hosted apply command. No temporary privileged RPC is needed.

After the unresolved representation/policy decisions:
1. Regenerate and review the exact plan/defaults against the unchanged workbook,
   pin its canonical hash and verify fresh project, scope, namespace, existing-data
   hashes, absence of duplicates and recovery baseline. Do not repeat old mapping
   investigations or reapply migrations.
2. Validate a genuine PUGI session through the existing Supabase Auth flow and
   get_my_account. An SQL-admin query showing an active account is not a user
   session. Do not assign a subject, forge claims or use service-role data writes.
3. Use a short-lived, dataset-specific session runner around the existing
   staff_save_record RPC, ordered by source group: optional owner, new lot, then
   each individual interment. No 145 manual form submissions and no generic CMS.
4. Use the prepared deterministic request UUIDs, same verified actor and identical
   payload on retries. Persist only a restricted progress/receipt manifest, never
   credentials. Stop immediately on an unexpected response, conflict or revision.
5. Existing HTTP RPC calls are individually atomic, **not one cross-request
   transaction**. On interruption, retain pending hidden records, inspect committed
   receipts, and resume the same reviewed plan; do not start a fresh UUID set.
   Changed payloads under the old UUID must fail rather than duplicate data.
6. Reconcile exact inserted IDs, counts, owner links, shared reservations, source
   markers, false verification flags, no coordinates, PUGI attribution and zero
   changes to pre-existing lot/area hashes before declaring integration complete.
7. Inspect paginated Plot Owners, Deceased/Interments and Plot Management,
   owner detail relationships and server-protected previews. Anonymous search,
   profiles, shared rosters and GIS must expose none of the initial hidden batch.
   Publication remains a later explicit approval after eligibility/content review.

Recovery is per confirmed save/group progress. Do not claim a single rollback
for multiple hosted HTTP calls. Local transaction rollback tests verify the
protected database behavior only. If abandoning a partially committed batch,
keep it hidden and review exact IDs before separately approved soft removal or
recovery; reserved slots/audit receipts must not be silently erased.

## Review artifacts

Outside the repository and web root:

`C:/Users/Nash/.codex/visualizations/2026/09/23/01a0cedf-199e-7451-939a-f6477c900657/full-dataset-preparation-20261117/`

- `full-dataset-import-preview.private.json`: all source dispositions, 90 full
  assignments, 45 owner payloads and 100 deceased/interment payloads, deterministic
  request IDs, policy blockers and preservation evidence hash.
- `plot-assignment-review.csv`: all 90 proposed plot records and group sizes.
- `owner-defaults-review.csv`: all 45 names and explicitly fictional addresses.
- `hosted-preconditions.json`: read-only aggregate target evidence.

Canonical preview SHA-256 (compact JSON, as printed by the planner):
`b62796bdfae78425f9897a3421037165123be3fc19d65ab61696ed392a6d1eaf`.

## Local verification

- Read-only workbook verifier: all rows match the existing extraction; original
  workbook hash unchanged before/after.
- Full-dataset disposable PostgreSQL-compatible test: eight checks passed, no
  failures/skips. Exercises all 235 protected saves, all ten shared groups,
  injected failures after owner/lot/first/second interment, transaction rollback
  of data/receipts/audit, partial-run resume, exact replay and payload conflict.
- Existing unrelated verified-coordinate lot and area fixtures remain exactly
  unchanged. All imported sample coordinates remain null/unverified.
- Existing staff directory/reference readers retrieve the complete pending batch;
  public readers return none. Unauthorized writes and unsupported shared-record
  activation are rejected.
- Combined full-dataset, owner, burial-management and visibility suite:
  **22 passed, zero failures/skips**.
- ESLint on the new JavaScript tooling/test and git diff --check: passed.
- No frontend source or package changed, so production build, browser journeys
  and TypeScript were not repeated for this preparation-only change.
- Tests use disposable local fixtures with test role setup, not real hosted Auth.
  No separate Supabase project or persistent demo database was created.

Implementation files:
- scripts/phase2-staging/verify-project-workbook.py
- scripts/phase2-staging/prepare-full-project-samples.mjs
- tests/full-project-samples.test.mjs
- This report.

Preparation is complete for the full dataset. Hosted execution remains blocked
on the explicit policy decisions and final reviewed write approval.

