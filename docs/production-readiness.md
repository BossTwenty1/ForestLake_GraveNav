# GraveNav production-readiness checklist

Scope updated 15 November 2026. Read the [full Phase 2 requirements](phase2-full-coverage.md) and [operational handoff](phase2-local-defense.md) for coverage, access decisions and dated test results. This checklist describes requirements; it does not establish that a hosted target has passed them.

This checklist covers the controls that must be configured in the hosted Supabase project and deployment platform. The repository does not contain, and must not contain, secret or service-role values.

## Hosted Supabase Auth

Configure the hosted project with:

- A strong password policy suitable for staff accounts, preferably at least 12 characters with breached-password protection enabled when available.
- MFA for administrator accounts.
- Email confirmation and password-change reauthentication according to the team’s account policy.
- Auth rate limits and CAPTCHA or equivalent abuse protection for public authentication flows.
- Session expiry and refresh settings appropriate for an administrator workspace.
- The local callback allow-list entry: `http://localhost:3000/auth/callback`.
- The production callback allow-list entry for the configured application origin: `https://<production-host>/auth/callback`.
- No wildcard redirect URLs.

The provisioning route uses the application origin configured by `NEXT_PUBLIC_APP_ORIGIN` in production and the fixed localhost origin during development. It always appends `/auth/callback?type=invite` for invitations.

## Environment boundaries

Public browser configuration may use:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or the documented anonymous-key fallback)
- `NEXT_PUBLIC_APP_ORIGIN`

The Auth Admin credential must remain server-only under `SUPABASE_SECRET_KEY` or the documented `SUPABASE_SERVICE_ROLE_KEY` fallback. Never prefix that variable with `NEXT_PUBLIC_`, commit it, or expose it in browser requests.

## Storage and data protection

- Keep the photo bucket private.
- Allow uploads, metadata writes, signed reads, and deletes only through the intended authenticated policies.
- Keep public views limited to approved public records and permitted fields. Public-display consent and the active/removal filters apply to every individual in a shared-gravesite roster; owner contacts and restricted evidence remain private.
- Confirm backups and point-in-time recovery are enabled before production use.
- Review the audit log after account, plot, burial, photo, and approval changes.

## Phase 2 activation and CAD access

- Cover all Phase 2 operational records and mapping: Butterfly Palm Garden A/B, Majestic Palm Garden A/C/D and Majestic Palm Court C estate lots. Preserve all 4,494 map candidates; the former A/D-only product scope is superseded.
- Confirm every included garden/sector boundary, numbering convention and official lot membership. Retain full garden/section/block/literal-lot identity and reconcile the 24-candidate plan/CAD count difference.
- Check authorized name/plot search, all-gardens and garden filters, pagination, profiles and shared-gravesite identity in every included area, explicitly including Butterfly. Complete CAD display is not proof of complete searchable records.
- Resolve the present one-area geographic selector and one-area/1–50-lot v1 import limits through a reviewed full-coverage implementation/strategy. Do not bypass validation, replacement/omission guards or publication controls to claim full-site readiness.
- Require official plot/marker/burial confirmation, an exact CAD crosswalk, accepted ground control and independent validation before treating a planning candidate as a geographic gravesite.
- Keep walking directions disabled until the published graph, permitted route/access endpoint and real-phone behavior pass field acceptance.
- Include representative gravesites in every Phase 2 garden/sector and estate area, plus permitted cross-garden journeys, in actual-phone acceptance. A passing A/D subset is not full-site acceptance.
- The present CAD installation is authorized only on loopback. A public Next.js deployment containing these static assets would expose the CAD data. Obtain Forest Lake's explicit access decision before packaging them for hosted delivery.
- The locally committed shared-gravesite and M09 forward migrations require separate target authorization and compatibility checks before hosted application.
- Test admission capacity, concurrent additions, privacy, staff authorization, shared-person search and one-destination behavior after an authorized migration. Unavailable checks remain outstanding.

## Deployment and maintenance

- Require the GitHub Actions checks in `.github/workflows/ci.yml` before merging to `main`.
- Do not deploy with `.env.local` or any server-only credential in the repository.
- Run `npm run security:audit` during dependency maintenance.
- Review the generated build routes and security headers after each deployment.
- Configure edge/WAF rate limiting for public search and authentication endpoints; application code cannot reliably absorb a distributed denial-of-service attack.
- Apply Supabase migrations only through the approved migration workflow and verify the hosted migration list afterward.

## Manual release checks

1. Open the public homepage, search, map, and navigation pages while signed out.
2. Confirm an active ADMIN reaches the administrator workspace and can perform only intended ADMIN actions.
3. Confirm a MANAGER reaches the manager workspace but cannot provision, approve, or change accounts.
4. Confirm suspended, revoked, inactive, and unassigned users reach `/admin/unauthorized`.
5. Confirm invitation and password setup use the configured callback before dashboard access.
6. Confirm browser network requests never contain the Auth Admin credential.
7. Confirm a logout followed by a protected-page visit requires authentication again.
