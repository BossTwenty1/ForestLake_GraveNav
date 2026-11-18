# Complete Phase 2 fictional dataset import

Completed 17 November 2026 in Supabase project `ddoowghocqyfoxaikifb`, under
the user's explicit execution approval and policy `GRAVENAV-P2S-20261117`.

## Hosted results

| Result | Verified count |
| --- | ---: |
| Successful unique protected save receipts | 235 |
| Fictional owners | 45 |
| New P2S synthetic plots | 90 |
| Deceased records | 100 |
| Interment records | 100 |
| Intentionally unowned synthetic plots | 45 |
| Shared groups, with two interments each | 10 |
| Pending, hidden and unconfirmed records | 100 |
| Original lots, unchanged | 4,494 |
| New audit events attributed to PUGI | 335 |

All saves used the actual request-bound application Supabase client, verified through
`auth.getUser()`, `get_my_account()` and the existing ADMIN guard. The actor was
PUGI, `9f08a285-a1e2-444f-b07e-b897e43e6c92`, ACTIVE ADMIN. The administrative
database connection was used for read-only reconciliation, not for record writes.

The interrupted prefix of 47 saves was reconciled before continuing the same ordered
plan with the same request UUIDs. Each request admitted at most five new saves.
Every final hosted request payload and receipt matches the journal. There is no pending
operation or active batch lock. Individual protected saves committed separately; this
was not a globally atomic import and cannot be described as globally rolled back.

Names, dates, source identifiers, Source Row Keys, owner relationships and shared
relationships were reconciled against the unchanged pinned plan. Receipt-generated IDs
were used for dependencies. The 4,470 workbook plot references remain authoritative
source references; only the approved 90 referenced synthetic assignments were inserted.

## Preservation and visibility

The original lot hash remains
`88d29e467313b2e23301040a45325cd09de9e8db826cd65aefd97a195d0a9973`.
The area hash remains
`0a1558f5982122367817a79f9172f3babc14ce6e31789482628d511dd12d9f45`.
These include the original lot fields, geometry and coordinate-verification states.
All 4,494 original lots remain HOLD. Their existing stored coordinate statuses were
preserved; this import establishes no new geographic or field-verification evidence.

All 90 synthetic lots have no location or geometry and remain coordinate-unverified.
AVAILABLE is the approved synthetic admission rule only. Staff readers exclude these
plots from physical inventory, occupancy and coordinate-verification totals. The live
PUGI dashboard showed 4,494 physical lots on HOLD, zero physical availability or
occupancy, and a separately labeled synthetic count of 90. Plot Management retrieves
4,584 rows, including the 90 searchable synthetic plots. GIS readiness retains the
original 777/3,717 area totals, with no releases, publications, plot geometry or access.

All 31 migrations remain synchronized. The five reviewed staff reader definitions,
their security metadata, and the hash of other public functions (including protected
writers) match the pre-import snapshot. The removed pilot RPC remains absent.
The 235 new mutation receipts and 335 new audit events match the approved scope.
Before-values record history remains unchanged: the existing writer creates those
entries for updates, while this import performed inserts only.

Through the genuine signed-in PUGI request, the existing owner reader retrieved all
45 owners, both deceased-directory pages retrieved all 100 records, and both synthetic
plot pages retrieved all 90 plots. Existing staff visitor-preview logic loaded an owned
single plot, an unowned plot and a shared plot, with hidden visibility and no verified
location. No owner details or internal notes were passed to visitor presentation.

An anonymous Supabase client with no Auth session verified that all 100 records were
absent from the public view. All 100 name searches returned zero results, all 100 shared
rosters were empty and all 100 public GIS responses were null. Three local anonymous
profile requests showed the missing-record page; three private-preview requests
redirected to login. These are live data/HTTP checks, not visual browser acceptance.
Browser control was not used and credentials, cookies and tokens were not exported.

Publication and actual-interment confirmation rules remain unchanged. Pending,
unconfirmed records, including the shared groups, remain ineligible for public display.
No record was published or activated and no GPS destination was enabled.

## Sources and recovery evidence

- Workbook SHA-256:
  `d513d28922dfce121422916fbb94138e652dcf0080e146d51ad8c540b5bdcc0f`.
- Canonical pinned-plan SHA-256:
  `bf006431c72c844df43336c101caba2df88622df90cb6cf0e9cf3e24df116b93`.
- Applied inventory SQL SHA-256:
  `f4a257e463b5c22cb0b728349744beb646a15ef1b647daddf6eac3b9e0d3350e`.

Credential-free private evidence is outside the application/web root, under
`C:/Users/Nash/.codex/visualizations/2026/09/23/01a0cedf-199e-7451-939a-f6477c900657/full-dataset-preparation-20261117`:

- `full-import-reconciliation.private.json` and `full-import-reconciliation-summary.json`.
- `full-import-postflight.private.json` and `full-import-postflight-summary.json`.
- `anonymous-import-verification.json`.
- Restricted `authenticated-executor/progress.json`, `identity-verification.json`,
  `execution-clearance.completed.json` and `retirement.json`.

Retain the journal, hosted mutation receipts and audit events for recovery. Future
corrections require separately authorized protected operations; do not delete receipts,
regenerate UUIDs, or undo unrelated rows.

## Retirement and local validation

`HOSTED_WRITES_ENABLED` is false and `IMPORT_CONTROL_RETIRED` is true. The API
returns 404 before authentication or database access, even with a renewed local TTL.
The page is likewise guarded, and production access remains disabled. The active
`execution-clearance.json` was renamed to a completed archive in the restricted
journal directory. No active clearance remains; the 235-receipt journal is preserved.

Changed execution/cleanup files: `src/lib/phase2-import.ts`,
`src/components/admin/phase2-import-control.tsx`,
`src/app/api/admin/phase2-import/route.ts`,
`tests/authenticated-phase2-import.test.mjs`, and this completion report.
The 332-file pre-execution preservation snapshot identifies only those four existing
source/test changes; unrelated uncommitted work is preserved.

- Focused executor/integration tests: 15 passed, including recovery, receipt identity,
  authorization failures, no-write readiness, bounded execution and retired control.
- TypeScript: passed (`tsc --noEmit --incremental false`).
- Lint: no errors; one pre-existing unused `mkdir` warning in `tests/gis-package.test.mjs`.
- Production build: passed, Next.js 16.4.5.
- Whitespace: `git diff --check` passed.

No deployment, commit or push was performed. No approved import operation remains
incomplete. Visual desktop/mobile browser review was not performed under the existing
browser-control restriction; the genuine application request and live HTTP/data checks
above are the verified acceptance evidence.
