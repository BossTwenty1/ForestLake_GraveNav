# Admin-controlled visitor visibility — Milestone 3

Completed locally on 17 November 2026 in the existing RC:
`C:/Users/Nash/.codex/worktrees/gravenav-defense-rc/gravenav`,
branch `codex/defense-release-stabilization-20261106`.
No hosted reads/writes, migrations, imports, GIS publication, deployment,
commit or push were performed.

## Workflow

The deceased/interment detail page now has one Visitor visibility section:

- Actual visibility is checked against the existing `public_burial_records`
  backend view; it is not a new persisted state.
- Publish Record and Hide Record use the existing protected burial save and
  retain record status, interment fields, references and expected revision.
- Publishing is unavailable for pending/archived records and removed/unavailable
  plots. It never activates a record. Unavailable visibility reads are reported
  distinctly and do not enable publication.
- Both actions require confirmation and provide loading, success and error
  feedback. ADMIN and MANAGER retain their existing authorized operational
  permissions. Backend role/revision checks remain authoritative.
- The editor no longer presents a separate public-display checkbox. New records
  start hidden; existing display settings are retained during ordinary edits.

Preview as Visitor opens `/admin/burial-records/[id]/preview`.
The server authenticates active staff before reading hidden data. It selects
only deceased name/dates, interment date/status, and public-safe plot identity.
Only an explicit public-safe projection reaches the presentation component;
owner information, notes, source evidence and audit data are not passed through.
There is no public preview API or public URL switch.

The preview is labelled as staff-only with actual publication status and
does not publish anything. It reuses the existing visitor memorial layout.
It previews the selected person's record, omits the shared roster, and
conservatively disables map links and geographic guidance. It does not claim
to preview live GIS readiness. Synthetic and internal references stay separate.
Preview responses are dynamic, private/no-store and marked noindex/nofollow.

## Existing public boundaries verified

The current backend view requires `record_status='active'`,
`deceased.public_display=true`, an undeleted interment and an undeleted lot.
Search, profiles, by-plot and garden/list readers use that view.
Shared-grave names join the same public view for each individual.
`public_burial_gis` independently applies the same eligibility predicates;
the map destination adapter first requires a public record.

These existing contracts were reused without SQL changes.
Extracting `MemorialProfile` preserves the public page layout and map-link
defaults. The preview passes a safe unavailable-navigation mode.

## Files changed in this milestone

Existing files:

- `src/components/admin/burial-record-pages.tsx`
- `src/app/gravesite/page.tsx`
- `src/components/visitor/gravesite-location-card.tsx`
- `src/lib/supabase/admin-data.ts`
- `src/lib/supabase/public-data.ts`
- `src/lib/supabase/types.ts`
- `tests/burial-record-browser.mjs`

New files:

- `src/components/admin/record-visibility.tsx`
- `src/lib/record-visibility.ts`
- `src/lib/supabase/staff-visitor-preview.ts`
- `src/components/visitor/memorial-profile.tsx`
- `src/app/admin/burial-records/[id]/preview/page.tsx`
- `src/app/admin/burial-records/[id]/preview/error.tsx`
- `tests/record-visibility.test.mjs`
- This report.

A SHA-256 comparison of 221 pre-edit source/docs/test/schema/package files
found only the seven intended existing files changed. Other Milestone 1/2,
map, schema, package and unrelated files remain unchanged from the task baseline.

## Verification

- `node --test tests/record-visibility.test.mjs tests/burial-record-management.test.mjs tests/owner-management.test.mjs tests/repository-smoke.test.mjs`:
  **25 passed**, no failures/skips.
- `node --test tests/shared-interments.test.mjs tests/phase2-project-samples.test.mjs tests/visitor-behavior.test.mjs tests/phase2-only-navigation.test.mjs`:
  **39 passed**, no failures/skips.
- New disposable-database coverage verifies authorized publication/hiding,
  inactive/anonymous denial, revision conflicts and exact replay, unchanged
  interment and lot data after hiding, and exclusion from search, direct
  profiles/view, shared roster and GIS responses for hidden, pending, archived,
  removed and removed-plot records. Private fields remain excluded.
- Preview tests verify authentication before reads and allowlisted serialized
  fields, including hidden/pending records and absence of private notes/contact.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed with the existing unrelated unused `mkdir` warning
  in `tests/gis-package.test.mjs`.
- `npm run build`: passed, including the protected preview route.
- `git diff --check`: passed.
- Impeccable detector: no findings.
- Extended `tests/burial-record-browser.mjs`: actual Next.js desktop ADMIN and
  mobile MANAGER journeys passed using isolated in-memory loopback Auth/API
  fixtures. Coverage includes ineligible publication, hidden preview, safe
  HTML/no-store headers, failed save, Publish/Hide, public search/profile
  consistency, ignored public preview parameters, map-response privacy,
  revision conflict/reload, and existing create/detail/edit journeys.
  Anonymous and inactive users cannot access preview or record-management pages.
  No page overflow or browser page errors were observed.
- Desktop/mobile captures were inspected outside the repository. Temporary
  test app and fixture server stopped after the run.

## Limits

No implementation blocker remains. Tests use isolated fixtures/disposable
databases, not actual hosted staff sessions or hosted record changes.
No full-suite run or physical-phone/GPS acceptance is claimed.
Existing geographic verification and publication gates remain unchanged.
Milestone 4 has not started.
