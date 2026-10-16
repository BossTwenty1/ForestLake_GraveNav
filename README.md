# GraveNav

GraveNav is an ongoing BS Information Technology academic capstone project for GPS-assisted gravesite location and cemetery management at Forest Lake Memorial Park in Legazpi City, Philippines. It combines public gravesite search and mapping with a protected workspace for cemetery staff.

This is the official capstone repository. This README describes the implementation on `main`; development branches may contain changes that have not been merged.

[Public preview](https://github-final-five.vercel.app/) · [Database implementation notes](docs/GraveNav_Database_Implementation_Notes.md) · [Production-readiness checklist](docs/production-readiness.md)

The preview homepage was reachable on October 16, 2026. This confirms homepage availability only, not deployed search results, staff access, database configuration, or field navigation accuracy.

## Project overview

Finding a gravesite can be difficult when visitors have a name but no clear plot location or route through the cemetery. Staff also need a consistent way to maintain burial records, plot assignments, and location information.

GraveNav aims to:

- Help visitors find approved public burial records and understand their location.
- Provide map context and walking guidance using recorded cemetery paths.
- Give authorized staff tools to maintain records, review coordinates and photos, and track changes.
- Keep private owner information and staff operations separate from public search.

## Implemented features

These flows are present in the codebase. Database-backed operations require the matching Supabase schema, policies, and configuration; their presence in source does not establish production readiness.

| Area | Current implementation |
| --- | --- |
| Public search | Name and plot-code search, garden/year filters, sorting, similar-name matches, pagination, gravesite profiles, and unavailable/not-found states. Visitors do not need accounts. |
| Cemetery map | Leaflet/React Leaflet plan map with Phase 1 garden, road, walkway, node, and edge geometry; selectable records and paginated map search. |
| Walking navigation | Browser location updates, recenter/stop controls, approximate accuracy display, and shortest-path routing over the recorded network, with a main-entrance fallback. |
| Staff workspace | Supabase-backed dashboard totals, burial records, plots, owners, coordinate review, optional photo upload/review, CSV summaries, and audit history. Permissions vary by role. |
| Account access | Supabase Auth, server-side session/account checks, active `ADMIN`/`MANAGER` roles, and ADMIN-only invitation, approval, activation, suspension, and role controls. |
| Safe editing and recovery | Transactional save functions, revision checks for conflicting edits, request receipts for retries, and ADMIN-only record recovery. Recovery history is not an independent backup. |

## Development status and limitations

GraveNav remains in development. The following work needs further implementation or operational verification:

- **Field validation:** Map geometry and stored coordinates are references, not a claim of complete survey accuracy. The supplied Phase 1 geometry covers four gardens and does not supply individual gravesite coordinates. Confirm actual plot positions, landmarks, and walkable paths with cemetery staff.
- **Navigation verification:** The map's navigation action checks for a verified coordinate, but gravesite-profile links and the navigation route do not consistently enforce that check. A route being displayed must not be treated as proof that its destination has been verified.
- **GPS limits:** Routing from a visitor's position requires a fresh reading inside the mapped area with reported accuracy of 30 m or better; otherwise the entrance is used. The nearby-plot message is approximate. Routes end on recorded paths, and the final approach to the grave is explicitly unverified. These thresholds do not guarantee physical accuracy or accessibility.
- **Data boundaries:** Development mock records are illustrative, not verified cemetery records. The local SQL seed is intentionally empty. Without Supabase configuration, public mock fallback is available only outside production; configured backend failures produce an unavailable state rather than invented results.
- **Operational testing:** Hosted Auth, RLS, Storage policies, concurrent staff edits, invitations, recovery, and physical walking routes still require staging/field checks. Browser geolocation requires permission and a secure context, such as HTTPS or localhost; the app is not a full offline navigation system.
- **Deployment readiness:** Source code, database migration state, and the deployed frontend may differ. Backups, restore drills, access policies, retention rules, and performance with representative data require confirmation before operational use.

See [search, navigation, and safe editing](docs/search-navigation-safe-edits.md) for implementation detail and remaining validation work. Older notes may describe earlier behavior; check the current source when details differ.

## Technology stack

- **Application:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4.
- **Mapping:** Leaflet, React Leaflet, GeoJSON/KML-derived geometry, browser Geolocation API, and Dijkstra shortest-path routing. The current map uses a plan coordinate space (`CRS.Simple`) with geographic positions projected into it.
- **Backend services:** Supabase PostgreSQL with PostGIS and `pg_trgm`, Auth, private Storage, SQL functions, and row-level security (RLS).
- **Validation:** ESLint, TypeScript, Node.js tests, and isolated PGlite database tests with PostGIS and `pg_trgm`; GitHub Actions runs the repository checks.

## Architecture and repository structure

Public pages read the limited public burial view and search function through Supabase. Staff pages use authenticated clients and protected database operations. Account invitation uses a server-only Next.js API route for Supabase Auth Admin access; private credentials must never reach the browser.

```text
src/
  app/                 Public pages, staff routes, auth callbacks, API routes
  components/          Visitor, staff, authentication, and shared UI components
  lib/                 Auth, map/routing, geolocation, and Supabase data helpers
  proxy.ts             Supabase session refresh for staff/auth requests
public/maps/           Runtime cemetery geometry and map assets
supabase/
  migrations/          Versioned database schema, functions, and access policies
  seed.sql             Intentionally empty development seed
scripts/               Map cleanup, import generation, and routing rebuild tools
tests/                 Repository, visitor behavior, and database contract tests
docs/                  Database notes, mapping provenance, and release guidance
design-reference/      Design references, not proof of deployed behavior
```

Main entry points are `/`, `/search`, `/results`, `/gravesite`, `/map`, `/navigation`, and `/admin/login`. The `/admin` workspace requires an approved active staff account.

## Local development

Use Node.js 22, as configured in CI, and npm. Hosted development requires access to the team's approved Supabase project; the optional local fallback requires Docker and the Supabase CLI available through the project dependency.

### Hosted Supabase development

Run these commands from the directory where you keep project checkouts:

```powershell
git clone https://github.com/BossTwenty1/Github-Final.git
cd Github-Final
npm ci
Copy-Item .env.hosted.example .env.local
notepad .env.local
```

Obtain the project URL and publishable/anonymous key privately from the authorized project owner, replace the placeholders, then start the app:

```powershell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Restart the development server after changing environment variables. The protected staff UI shows `LOCAL` or `HOSTED DEVELOPMENT` to identify the configured Supabase target.

### Environment configuration

Keep all actual values in the uncommitted `.env.local`. Both committed example files contain configuration templates only.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Approved hosted project URL, or the local Supabase URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable/anonymous key for that project. The client also accepts `NEXT_PUBLIC_SUPABASE_ANON_KEY` as a legacy fallback. RLS and grants must protect the data. |
| `NEXT_PUBLIC_APP_ORIGIN` | Application origin used for production auth redirects. During `npm run dev`, the application deliberately uses `http://localhost:3000`. |
| `NEXT_PUBLIC_SUPABASE_PHOTOS_BUCKET` | Optional private Storage bucket name for staff photo uploads. This is a bucket name, not a credential. |
| `SUPABASE_SECRET_KEY` | Server-only Auth Admin key, required for protected account provisioning. Supply it only in an authorized developer's uncommitted environment. |
| `SUPABASE_SERVICE_ROLE_KEY` | Legacy server-only fallback when `SUPABASE_SECRET_KEY` is not supplied. |

Never commit `.env.local`, share private key values, or put Auth Admin credentials in client code. Never prefix a secret/service-role key with `NEXT_PUBLIC_`. Most development work needs only the public variables; account provisioning additionally needs an authorized server-only credential. Use the key belonging to the same Supabase environment as the public URL.

### Staff access and invitation redirects

Visitors do not need accounts. Each administrator or manager needs an individual Supabase Auth account linked to an approved active GraveNav `account` record. There is no public staff self-registration; an authorized owner must perform the controlled first-ADMIN bootstrap. Do not use a shared password. See the [database implementation notes](docs/GraveNav_Database_Implementation_Notes.md) for the account model.

For local hosted invitation testing, add this exact URL to the Supabase Auth redirect allow list:

```text
http://localhost:3000/auth/callback
```

The protected invitation endpoint appends an internal invitation marker to `/auth/callback`. The callback exchanges the code for a session and routes invited users to `/auth/set-password`. After the password is saved, the server checks the linked account before routing to the role-aware staff workspace. Pending, suspended, revoked, inactive, or unassigned accounts cannot access the protected workspace.

For a deployed production build, set `NEXT_PUBLIC_APP_ORIGIN` to the approved production application origin and separately allow its `/auth/callback` URL in hosted Supabase. Do not use the production origin for local invitation tests or configure wildcard redirect URLs.

### Optional local Docker fallback

For an isolated local Supabase stack, with Docker running:

```powershell
npx supabase start
npx supabase status
Copy-Item .env.example .env.local
```

Use this template instead of the hosted template; copying it replaces the current local configuration. Fill in the local URL and publishable/anonymous key from `npx supabase status`, then run `npm run dev`. Keep the local stack running while using the app.

The local seed provides no cemetery records or staff login. Arrange controlled staff bootstrap and approved test data separately. Local database tests use synthetic fixtures and do not establish real cemetery data accuracy.

Do not push schema changes to a hosted project as part of frontend setup. Database migrations and map-data imports require the project's separately approved workflow. Never run a destructive reset against a shared environment.

### Storage and public data boundaries

Public visitor surfaces use the approved public burial view and search function, excluding private owner fields. Staff surfaces rely on authenticated RLS policies and protected SQL functions. Account provisioning remains server-only.

Photo uploads require a configured private bucket and policies permitting only intended active staff operations. Uploads are validated, stored as pending/non-public, and use short-lived signed previews; an authorized review workflow handles approval. Bucket naming alone does not configure those policies.

## Development and testing commands

Run these from the repository root after `npm ci`:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local Next.js development server. |
| `npm run lint` | Run ESLint. |
| `npx tsc --noEmit` | Check TypeScript without emitting application files. |
| `npm test` | Run repository, visitor behavior, and isolated database contract tests. |
| `npm run build` | Create a production build. |
| `npm start` | Serve an existing production build. |
| `npm run validate` | Run lint, TypeScript, tests, and the production build. |
| `npm run security:audit` | Audit production dependencies with npm. |
| `npm run map:rebuild` | Regenerate the routing network; changes map artifacts and requires a separate mapping task/review. |

Database tests apply migrations to isolated PGlite with PostGIS and `pg_trgm`, using synthetic fixtures and stand-ins for Supabase Auth roles. They do not connect to the hosted database and do not replace live Auth, PostgREST, Storage, concurrency, or field tests. The test-only PGlite PostGIS package is experimental.

CI checks pull requests targeting `main` and pushes to `main`, including dependency installation, lint, TypeScript, tests, dependency audit, and build. For changes, use a focused branch and pull request; follow the [production-readiness checklist](docs/production-readiness.md) before release.

## Contributors

GraveNav is a collaborative academic capstone. GitHub's contribution history lists [Rygz-00](https://github.com/Rygz-00), [Nash Mapula / BossTwenty1](https://github.com/BossTwenty1), and [prodigal94](https://github.com/prodigal94). See the [contributor history](https://github.com/BossTwenty1/Github-Final/graphs/contributors) for recorded contributions.
