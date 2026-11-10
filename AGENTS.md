<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Current GraveNav context

Read [docs/README.md](docs/README.md) and the [current operational handoff](docs/phase2-local-defense.md) before choosing implementation work. Verify the actual checkout, HEAD and dirty tree. The active release candidate has been maintained at C:/Users/Nash/.codex/worktrees/gravenav-defense-rc/gravenav; do not assume another worktree contains its latest uncommitted changes.

- Preserve full Phase 2 map coverage: all 4,494 CAD candidates. Section D is the initial operational-data scope, not a geometry crop.
- Integrate the map inside GraveNav at /map, preserving memorial search and existing application controls.
- The main /map now includes geographic GPS/routing code gated on approved publication and field-reviewed navigation policy. Real Section D identity matching, accepted geographic/route evidence and actual phone acceptance remain prerequisites; preserve the completed integration.
- Use the current shared-gravesite model: individual deceased/interment identities, approved regular-grave capacity of six, individually approved mausoleum capacity, one geographic destination per physical lot.
- Keep official identity, source CAD references, geographic coordinates and publication evidence distinct. Local CAD X/Y are not latitude/longitude.
- docs/archive contains historical evidence and superseded execution plans. Consult those only for provenance; use current handoff and implemented contracts for present behavior.
- Current CAD hosting permission is local-only. Both public/phase2-viewer and public/phase2-planning are ignored local assets, not access-controlled HTTP storage. Preserve original sources and sealed releases.
- Hosted Supabase changes, real-record imports, migrations, GIS publication, pushes and deployments require explicit authorization.
