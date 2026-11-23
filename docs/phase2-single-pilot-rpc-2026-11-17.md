# Fixed authenticated atomic pilot RPC — local review

17 November 2026. Prepared and tested locally only. No hosted access, SQL installation, application deployment or pilot execution occurred during this task.

## Reviewed files

| File | SHA-256 |
| --- | --- |
| `scripts/phase2-staging/install-single-pilot-rpc.sql` | `06d895de1904663a438b52759a8be8a14adc6d666d6765e5879736dde03c0b96` |
| `scripts/phase2-staging/remove-single-pilot-rpc.sql` | `c4cba6dab54ff2df5ac6d0d599e890fddc6d592139c767276a3237bed990d2ff` |

These are standalone reviewed operation files, outside automatic application migrations. Installation creates only `public.execute_phase2_single_pilot_3721()` and its specific execution ACL/comment, then reloads the PostgREST schema cache. It does not insert sample data or change the migration ledger. `CREATE FUNCTION` deliberately fails if the function already exists.

The four completed application migration files still match their approved hashes. The original corrected review SQL remains unchanged at SHA-256 `f2998f7629c819c0a2bdb91781ac53f5faa00f05d890c8743d86029d1b6cb6c7`. Reuse its approved payload, not its direct-SQL identity-setting execution path: **do not execute that earlier SQL file**.

## Function and authorization

The RPC has no parameters and can perform only the fixed lot 3721 / BPG-A-0001 pilot: Diana Tahanan; Tomas Kuwento / DEMO-INT-0001; synthetic BPG A / Block 1 / Lot 9; CAD candidate lawn:2363. The owner and burial JSON literals match the approved corrected payload byte-for-byte, including the source row key, dates, provenance and false historical/physical verification flags.

Supabase Auth issues the user session; PostgREST verifies the JWT before calling the function. Inside the RPC, `auth.uid()` must equal `9f08a285-a1e2-444f-b07e-b897e43e6c92`, `auth.role()` must be `authenticated`, and the locked application account/role must be exactly PUGI, ACTIVE, active, ADMIN. No JWT or subject is created, reassigned or accepted as a function parameter. The function trusts the established Supabase Auth/PostgREST authentication boundary; it is not a JWT verifier itself.

`SECURITY DEFINER` is necessary: authenticated callers cannot read `staff_mutation`, inspect the migration ledger or take the existing account/role/lot row locks with their current grants. A genuine Auth-backed local INVOKER call reproduces permission denial. The definer function has a pinned `pg_catalog, pg_temp` search path, schema-qualified application objects, no dynamic SQL and no arbitrary input. EXECUTE is revoked from PUBLIC, anon and service_role; only authenticated receives EXECUTE, with exact PUGI authorization enforced inside. No base-table grants, RLS policies, roles or existing protected functions change. Install/remove administration is attributed to the actual database administrator; pilot data/audits derive their actor from PUGI's genuine request.

## Atomicity and preservation

One POST RPC request encloses all three existing `staff_save_record` calls in one database transaction. Per-function settings request repeatable-read isolation, 30-second statement timeout and 5-second lock timeout. The function also checks actual transaction isolation and stops if repeatable read was not established. Native PostgREST v16.2 validation confirms the per-function isolation setting works; no global setting or privilege is changed.

Existing advisory locking, exact revision 2/HOLD/area 5/block 1/code checks, ownership/burial/GIS/legacy association checks and source duplicate checks remain. The lot patch supplies unchanged `area_id` and stored `location_geom` from the locked lot. Only owner attachment, HOLD to AVAILABLE, revision 2 to 3 and the database timestamp may change.

The preservation guard retains exactly the reviewed four-field exclusion, complete remaining target before-image, other-lot digest and owner/deceased/interment count checks. Its before-image is held in a function-local record instead of a temporary table. No failure is caught or converted into success: exceptions abort all three saves, receipts, record history and audit events.

The original request IDs are fixed:

- Owner: `8f450bc1-d70a-5a4c-828d-87f287dcf1ee`
- Lot: `d773dd88-bb5f-5771-8680-e1fb0e2b560a`
- Burial: `a3f272ea-2b62-5977-8113-963e480fd080`

Partial receipts or differing request fingerprints stop execution. A complete exact replay validates receipts, the preserved target against protected history and the precise fictional association, then returns existing receipts without data writes. Changed committed state fails validation instead of being repaired. The source row key remains `f20993b15d71761b056a3c878b29125bfdd1f5cca743604bcea9ed830f4e87b2`.

## Focused local verification

`node --test tests/single-pilot-rpc.test.mjs tests/phase2-project-samples.test.mjs`: **29 passed, zero failures or skips**.

The new integration test uses cached PostgreSQL 17.6, GoTrue v2.196.0 and PostgREST v16.2 images with all 30 application migrations loaded in a disposable local database. Local Auth fixture users are provisioned through the Auth admin API and sign in with generated fixture passwords. Auth `/user` validates the resulting sessions; PostgREST validates their signatures. This verifies the real local Auth flow for the PUGI-ID fixture, **not an actual hosted PUGI login**. Passwords and access tokens are not logged or persisted. Only loopback Auth/API ports are published; the temporary database has no published port. Test containers and network are removed afterward; the existing local Supabase stack is untouched.

Coverage includes anonymous rejection; invalid signatures with an altered subject; another genuine ADMIN; wrong PUGI name, inactive/pending/suspended status and MANAGER role; arbitrary parameter rejection; INVOKER permission failure; stale revision, conflicting source reference and incomplete receipts; forced failure after owner and after lot save with complete row/receipt/history/audit rollback; unchanged preservation-guard rejection of an unrelated width side effect; exact geometry/review-state and unrelated-lot preservation; exactly one owner/deceased/interment; three PUGI mutation receipts and four PUGI audit events; exact replay and fingerprint conflict; and capability removal without loss of committed records or history. Existing synthetic workflow regressions retain visitor search/profile and staff reference checks.

`npx eslint tests/single-pilot-rpc.test.mjs` passed. No TypeScript or frontend source changed, so no production build or broad test suite was repeated.

## Exact separate hosted approval required

Authorize only this sequence on existing project `ddoowghocqyfoxaikifb`:

1. Fresh recovery-baseline, completed-migration/hash, PUGI authorization and lot/source/receipt preflight checks. Keep the existing stop-on-failure rule; do not reapply the four migrations.
2. Install the exact reviewed installation SQL/hash above using the actual authenticated database administrator. No PUGI subject assignment.
3. Have the user sign in as PUGI through the existing RC/Supabase Auth flow, validate the session/account, then make one authenticated POST to `/rest/v1/rpc/execute_phase2_single_pilot_3721` with `{}`. Do not copy credentials or tokens into chat/logs. Do not automatically retry a failure.
4. Verify commit receipts, accurate PUGI attribution, existing-data preservation and exactly one pilot, then verify visitor search/profile, distinct internal/synthetic references and authorized staff details through the existing RC application.
5. After verified success, execute the exact reviewed removal SQL/hash. It revokes and drops only this RPC and reloads the schema cache, preserving all pilot records, receipts and audit history. If execution or verification fails, stop and report actual state; do not assume installation or a committed pilot rolled back.

No authorization is implied for other records, lot changes, migrations, GIS/GPS publication or deployment. The installer, authenticated execution and subsequent removal have **not** been performed on the hosted project.
