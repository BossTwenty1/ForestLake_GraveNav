# Temporary authenticated Phase 2 import executor

17 November 2026. Existing RC, policy GRAVENAV-P2S-20261117.
Implementation and verification only. No hosted SQL, dataset saves, publication,
deployment, commit or push occurred.

## Live identity result

The user opened the local readiness page through normal GraveNav authentication.
The actual server-side request validated Supabase Auth getUser, get_my_account
and the existing requireStaff ADMIN guard. Its credential-free receipt records:

- VERIFIED PUGI, ACTIVE ADMIN.
- Exact Auth/account ID: 9f08a285-a1e2-444f-b07e-b897e43e6c92.
- Exact project: ddoowghocqyfoxaikifb.
- Checked at 2026-11-17T11:27:40.918Z (19:27:40 Manila).
- requestBound=true; writesEnabled=false.
- Same-origin application request from http://127.0.0.1:3237.

The user's screenshot independently shows Identity VERIFIED and Hosted execution
BLOCKED, with 0/235 import receipts. That blocked execution result is intentional.
Identity verification does not grant import approval. Each future batch repeats
the live identity/account checks, rather than trusting this historical receipt.

No browser automation, credential inspection, cookie/token export, forged hosted
claims or service-role impersonation was used. The CLI's database identity is
not used as PUGI's execution identity.

## Minimal application changes

- New /admin/phase2-import page and small existing-design-system control.
- New POST /api/admin/phase2-import, accepting only readiness or continue.
- New fixed-plan server engine and private checkpoint/receipt storage.
- Existing requireStaff accepts an optional request-bound client; all existing
  callers retain their previous behavior. The API creates one client through
  getServerSupabase, verifies it, passes that same object to requireStaff, and
  uses that exact object for all subsequent reads and protected saves.

Only src/lib/auth.ts was modified among the 324 pre-existing baseline files.
All other 323 existing files are hash-identical to the pre-task snapshot.
No dependency, database schema, migration, authentication architecture or
existing Milestones 1-3 workflow was changed.

## Local-only and disabled-write gates

The temporary control requires all of:

- NODE_ENV=development, no CI/VERCEL environment, and a future expiry no more
  than two hours away in GRAVENAV_LOCAL_PHASE2_IMPORT_UNTIL.
- HTTP loopback localhost/127.0.0.1 on fixed port 3237, with validated Host and
  same-origin POST Origin. Inconsistent forwarding headers are rejected.
- Existing cookie-bound Supabase authentication. Caller-supplied bearer headers
  and additional JSON properties, dataset contents, identities and payloads are
  rejected. The exact PUGI user, username, account ID, ACTIVE status, ADMIN role
  and project are required. Ordinary staff, other users and anonymous callers
  cannot use the control. Production/expired control requests fail closed.
- HOSTED_WRITES_ENABLED=false is a literal server-side switch. There is no
  environment or HTTP option that can turn it on. The continue action currently
  returns 423 before any protected mutation or import checkpoint write.

Readiness calls only Auth/staff readers and local hash/journal readers. It writes
only a sanitized local identity-verification receipt, containing no credentials.
It never calls staff_save_record and never creates execution approval.

The control is running at http://127.0.0.1:3237/admin/phase2-import. Existing
servers were left untouched. The local enable deadline expires automatically;
normal GraveNav login remains the only credential-entry interface.

## Fixed dataset and execution behavior

Private workbook and preview inputs are resolved at request time under the local
Windows profile, outside the repository/web root. They are not build-time data
assets, not browser inputs and not embedded in production deployment traces or
client chunks. All three reviewed hashes are enforced:

- Workbook: d513d28922dfce121422916fbb94138e652dcf0080e146d51ad8c540b5bdcc0f.
- Canonical preview: bf006431c72c844df43336c101caba2df88622df90cb6cf0e9cf3e24df116b93.
- Inventory SQL: f4a257e463b5c22cb0b728349744beb646a15ef1b647daddf6eac3b9e0d3350e.

The engine validates 235 unique unchanged request UUIDs, 45 owners, 90 synthetic
plots, 100 deceased/interment pairs, 45 intentionally unowned plots and ten
two-record groups. All interments must remain pending, hidden and unconfirmed.
There is no arbitrary CSV/file/entity/record-ID import interface.

Once separately approved and enabled, each continue request processes at most
five new saves in original source-group order:

1. Optional fictional owner, using its original request UUID and payload.
2. New P2S lot, substituting its owner receipt ID or preserving null.
3. Individual deceased/interment pairs, substituting the new lot receipt ID and
   matching provenance. Existing table/permission/capacity/publication safeguards
   remain authoritative; p_id and p_revision are null because these are creates.

No separate client or database login is created by the engine. staff_save_record
uses PUGI's genuine request identity; actor attribution is not supplied as a
payload override. The 235 UUIDs identify 235 unique protected mutations. Recovery
and dependency checks may replay those same UUIDs; these are additional HTTP
calls, not additional unique mutations or imported rows.

## Durable recovery and concurrency

Private state lives outside the repository/web root in:
C:/Users/Nash/.codex/visualizations/2026/09/23/01a0cedf-199e-7451-939a-f6477c900657/full-dataset-preparation-20261117/authenticated-executor/.

Its Windows ACL grants access only to Nash, SYSTEM and Administrators. No Auth
token, password, cookie or refresh credential is journalled. Current contents
are only identity-verification.json: no import progress or execution clearance.

The engine durably syncs a pending checkpoint before the protected save, then
atomically replaces progress.json with its successful receipt. The journal pins
actor, project, plan, ordered UUIDs, exact concrete payloads and payload hashes.
Unexpected results, payload/revision conflicts or count drift stop processing.

An uncertain committed outcome retains the same pending request for exact replay;
never allocate another UUID. Resume reconciles prerequisite owner/lot receipt
IDs through the existing protected receipt mechanism before dependent saves.
The current counts must match the completed prefix or its single pending
operation's committed outcome. This admits an owner-only, lot-only or partial
shared group without pretending the whole import rolled back.

An exclusive process lock rejects concurrent batches/tabs. A lock from a dead
process may be reclaimed; a live process's lock is never stolen. Individual RPC
transactions are atomic. The complete dataset is not one HTTP transaction.
Continue is foreground, bounded and explicit; there is no daemon/background job.

## Execution clearance still absent

Even after the write switch is separately reviewed and enabled, execution also
requires a private execution-clearance.json with the exact project/plan/SQL pins,
inventory migration 20261117020000, explicit SQL-application and import approvals,
and a matching read-only preservation preflight checked within 15 minutes.
No endpoint can create this file. No approved clearance was created in this task.
The engine also requires the updated staff inventory read-model response.

Expected original baselines:

- Lots: 88d29e467313b2e23301040a45325cd09de9e8db826cd65aefd97a195d0a9973.
- Areas: 0a1558f5982122367817a79f9172f3babc14ce6e31789482628d511dd12d9f45.

Fresh hosted READ ONLY/rollback checks after readiness confirm 4,494 HOLD lots,
zero P2S/owner/deceased/interment rows, matching baselines, the removed pilot RPC
absent and the inventory migration still unapplied. These administrative
read-only checks do not supply execution credentials to the authenticated API.

## Validation

- 11 executor checks passed, covering the actual compiled route/guard chain,
  exact same-client reuse, wrong/inactive/unauthorized users, unsigned/unrelated
  requests, project/plan restrictions, hard-disabled writes, missing/stale approval,
  durable checkpoints, concurrent lock rejection, save conflicts/bad receipts,
  uncertain commits, exact replay and all 235 protected operations locally.
- 37 existing focused dataset/inventory/owner/burial/visibility checks passed.
  Total: 48 distinct focused checks passed, no failures or skips in final runs.
- The disposable database run produces exactly 235 protected receipts attributed
  to the expected test actor, 45 owners, 90 samples, 100 private pending pairs,
  45 unowned plots and ten shared groups. Audit attribution is preserved and
  all 4,494 unrelated local fixture rows remain unchanged. Duplicate replay
  adds no records. Local role fixtures do not substitute for real Auth evidence.
- Live positive path: the user's genuine application request and sanitized
  verification receipt, corroborated by the supplied screenshot.
- Actual Next HTTP negative paths: anonymous page redirects to login (307),
  unsigned readiness returns 401, cross-origin returns 403, extra enable/payload
  fields return 400. No tokens were supplied to those probes.
- TypeScript, production build, whitespace checks and scoped design detector pass.
  ESLint has zero errors and one existing unused mkdir warning in gis-package.test.mjs.
- No private workbook/preview/journal/clearance file appears in the production
  file trace, and no private executor input is in browser chunks.
- Automated live browser control was not used. The user's actual session supplies
  live verification; runtime route checks and local rendering/regression tests
  supply the remaining bounded coverage.

## Remaining steps before hosted execution

1. Review this implementation and separately approve/apply the pinned inventory
   SQL. Do not use a browser sign-in as permission for an unrelated SQL login.
2. Refresh read-only preservation/source/plan/migration checks immediately before
   execution; reconcile any partial prefix with the existing journal if needed.
3. Obtain explicit final approval for the complete 235-save run, then review the
   narrow enable change and record the approved, fresh execution clearance.
4. Use the live PUGI page/client for bounded saves and receipt reconciliation.
   Recheck exact counts, owner/shared links, original lot/area hashes, privacy and
   absent verified geography after completion. Public pages must show none of
   the initial hidden batch.

Publication is excluded. Actual-interment confirmation rules for the 20 shared
records remain unchanged. No fictional record is certified as an actual burial.

## Files changed

New:
- src/lib/phase2-import.ts
- src/lib/phase2-import-storage.ts
- src/app/api/admin/phase2-import/route.ts
- src/app/admin/phase2-import/page.tsx
- src/components/admin/phase2-import-control.tsx
- tests/authenticated-phase2-import.test.mjs
- This report.

Modified: src/lib/auth.ts, only to reuse an explicitly supplied request client.
