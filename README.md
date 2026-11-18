# GraveNav

GraveNav is a cemetery-record and navigation system for Forest Lake. The accepted operational scope is the **whole of Phase 2**: Butterfly Palm Garden A/B, Majestic Palm Garden A/C/D and Majestic Palm Court C estate lots. Visitor search and staff records must cover every included garden; geographic navigation requires accepted evidence for the exact destination. This replaces the earlier A/D-only rollout scope as of 15 November 2026. See the [full Phase 2 coverage requirements](docs/phase2-full-coverage.md).

Start with the [current Phase 2 operational handoff](docs/phase2-local-defense.md). The [documentation index](docs/README.md) identifies current contracts and archived reports.

## Current application

- The visitor Map tab opens the integrated landscape at /map within the GraveNav interface.
- Memorial search uses approved public records, with full Phase 2 coverage as the target, including Butterfly. Technical outline lookup and coordinate references remain in the staff map.
- The layout contains 4,494 selectable candidates. Official plot-to-record associations require management verification.
- Shared graves use individual deceased and burial records under one lot. Approved regular graves permit up to six interments, with individually reserved slots. Mausoleums require an approved arrangement and capacity.
- The main map includes geographic gravesite selection, live location and reviewed-network guidance with updating distance. These require approved publication and field-reviewed settings. Full-site official matching, ground validation and real-phone acceptance remain outstanding. The one-area geographic adapter and bounded v1 import contract also require a reviewed full-coverage solution; this scope update does not activate them for all gardens.

## Run locally

Use the project root. Obtain the approved private environment configuration and install the verified map assets using the current handoff.

~~~powershell
npm ci
npm run build
npm start -- --hostname 127.0.0.1 --port 3217
~~~

Open [GraveNav](http://127.0.0.1:3217/) or the [integrated map](http://127.0.0.1:3217/map).

For loopback-only development, use npm run dev -- --hostname 127.0.0.1 --port 3000. The authentication callback currently uses that fixed origin during development. Production-mode builds use NEXT_PUBLIC_APP_ORIGIN. Match the configured origin and approved callback URLs when testing authentication.

## Environment and access

Keep .env.local private. Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY for the authorized target. NEXT_PUBLIC_SUPABASE_ANON_KEY is the compatibility fallback. Auth Admin provisioning additionally requires an authorized server-only SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.

Configure GRAVENAV_PHASE2_SITE_ID and GRAVENAV_PHASE2_AREA_ID only after management approves the operational site and area. The geographic adapter requires an approved publication.

The current CAD-distribution permission covers local review. Any public or restricted hosted rollout requires the corresponding authorization. Files under public are directly retrievable when deployed. Runtime CAD assets and private review records stay outside Git.

## Validation

~~~powershell
npm run lint
npx tsc --noEmit
npm test
npm run build
npm run security:audit
~~~

The full test suite needs a running Docker engine for genuine PostgreSQL concurrency tests. The remaining database contract tests use disposable PGlite instances. Check actual results and skips against the current handoff.

The retained map:rebuild command generates historical Phase 1 routing assets. Consult the archive before explicitly revisiting that retired tooling.

## Working rules

Read AGENTS.md and the current handoff before changing the system. Preserve source CAD geometry, official identities, privacy, staff authorization, audit history and recovery behavior. Record publication, hosted migrations, push, merge and deployment need explicit authorization.

Use the [production checklist](docs/production-readiness.md), [database contracts](docs/GraveNav_Database_Implementation_Notes.md), and [GIS import and publication runbook](docs/gis/import-and-publication.md) for the relevant workflow.
