# Plot Owner Registration and Management — Milestone 1

Completed locally on 17 November 2026 in the active RC:
`C:/Users/Nash/.codex/worktrees/gravenav-defense-rc/gravenav`.
Baseline HEAD: `2c55e0482ad2faba1cc71f11c3b21efc39213ab7`.
Existing uncommitted work was retained. No commit, push or deployment was performed.

## Authorized temporary RPC removal

Target: existing Supabase project `ddoowghocqyfoxaikifb`.
The exact no-argument function `public.execute_phase2_single_pilot_3721()`
was present, owned by `postgres`, returning `jsonb`, and SECURITY DEFINER.
Its normalized body (CR removed; surrounding newline/space trimmed) matched
the reviewed installer:

`ebffe4636e9e9437d7b77e06cc3fe92a63f1625f2cb4a7fef6e8dd2787696304`

The reviewed removal file, `scripts/phase2-staging/remove-single-pilot-rpc.sql`,
was checked immediately before execution and remained unchanged afterward.
SHA-256:

`c4cba6dab54ff2df5ac6d0d599e890fddc6d592139c767276a3237bed990d2ff`

The exact file executed successfully: revoke execution, drop only that
function without CASCADE, notify PostgREST to reload its schema, commit.
A subsequent read-only query confirmed
`to_regprocedure('public.execute_phase2_single_pilot_3721()') is null = true`.
The pilot function was never invoked. No record mutation, import or other
schema/object change was performed.

## Owner workflow

- `/admin/owner-data`: Plot Owners directory with name/alias search,
  stable bounded pagination, View/Edit and existing ADMIN-only removal.
- `/admin/owner-data/new`: dedicated registration form using existing fields,
  required first/last name and address, and optional representative details.
- `/admin/owner-data/[id]`: private owner profile with read-only, paginated
  associated plots and related interments; absent associations have empty states.
- `/admin/owner-data/[id]/edit`: dedicated editor retaining the owner revision.
- Successful registration/edit opens the ID returned by the protected save.

Existing tables, `createLotOwner`, `updateLotOwner`, `staff_save_record`,
permissions, validation, retry receipts and audit/recovery are reused.
No plot is created or linked during owner registration/editing.
Related interments mean interments at the owner's current plots, not kinship.
Internal lot codes are labelled explicitly; no synthetic or geographic identity
is inferred. Visitor visibility, GPS and publication rules are unchanged.

## Verification

- `node --test tests/owner-management.test.mjs tests/repository-smoke.test.mjs`:
  16 passed, no failures/skips. Includes disposable PostgreSQL-compatible
  registration without plots, revision checks, idempotency, ADMIN/MANAGER access,
  inactive/anonymous denial, direct-write denial and unchanged related lot data.
- `npm run lint`: passed, with one pre-existing unused `mkdir` warning in
  `tests/gis-package.test.mjs`.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed, including all three new protected routes.
- `git diff --check`: passed.
- Impeccable detector: no findings on the new owner UI.
- `tests/owner-browser.mjs`: actual Next.js desktop ADMIN and mobile MANAGER
  journeys passed with test-only in-memory Auth/API fixtures on loopback.
  Search, pagination, read-only relationships, create/redirect/edit,
  failure/retry, missing owners, page overflow and anonymous/inactive route
  guards passed. No browser page errors were observed.
- Desktop/mobile screenshots were inspected outside the repository.

The browser script accepts an already installed Playwright module through
`GRAVENAV_PLAYWRIGHT_MODULE`, an optional `GRAVENAV_CHROME_PATH`, and optional
`GRAVENAV_QA_DIR` outside the repository. It adds no package dependency.
Its local app and fixture server stop after the run.

No hosted owner registration, real signed-session end-to-end test, full-suite
regression or actual-phone acceptance is claimed. The only hosted mutation
was the explicitly approved temporary RPC removal. No fictional records were
imported. Plot linking and visitor visibility improvements remain deferred.
