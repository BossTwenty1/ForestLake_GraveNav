# GraveNav regression suites

Use Node.js 22 and `npm ci` from the repository root.

- `npm test` runs the application tests and disposable PGlite authorization and database contracts.
- `npm run test:integration` runs PostgreSQL concurrency tests using Docker. Run `docker pull postgis/postgis:17-3.5` first. It includes the last-Administrator race.
- `npm run test:private-gis` runs the four existing tests that require approved local CAD. The exact asset roots are `public/phase2-viewer` and `public/phase2-planning`. Install these only in an authorized local test environment. Missing assets fail that command.

Both required GitHub Actions jobs use a clean source checkout and disposable fixtures. The real-dataset import replay and retired pilot tooling stay in the restricted local RC. Never submit production credentials, workbooks, import data, journals or private geographic assets to CI or Vercel. The public review branch suppresses its Vercel Git deployment.
