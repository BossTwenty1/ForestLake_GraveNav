<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Current GraveNav context

Read [docs/README.md](docs/README.md) and the [current operational handoff](docs/phase2-local-defense.md) before choosing implementation work. Verify the actual checkout, HEAD and dirty tree. The active release candidate has been maintained at C:/Users/Nash/.codex/worktrees/gravenav-defense-rc/gravenav; do not assume another worktree contains its latest uncommitted changes.

- Current operational scope (15 November 2026): all of Forest Lake Phase 2, including Butterfly Palm Garden A/B, Majestic Palm Garden A/C/D and Majestic Palm Court C estate lots. Read [docs/phase2-full-coverage.md](docs/phase2-full-coverage.md). Earlier Section D-only or A/D-only scope is superseded. Preserve all 4,494 CAD candidates and full map geometry.
- Integrate the map inside GraveNav at /map, preserving memorial search and existing application controls.
- The main /map includes geographic GPS/routing code gated on approved publication and field-reviewed navigation policy. Full Phase 2 identity matching, accepted geographic/route evidence and actual phone acceptance remain prerequisites. The present one-area adapter and 1–50-lot v1 importer are implementation limits, not the product scope; preserve existing guards until a reviewed full-coverage implementation replaces them.
- Use the current shared-gravesite model: individual deceased/interment identities, approved regular-grave capacity of six, individually approved mausoleum capacity, one geographic destination per physical lot.
- Keep official identity, source CAD references, geographic coordinates and publication evidence distinct. Local CAD X/Y are not latitude/longitude.
- docs/archive contains historical evidence and superseded execution plans. Consult those only for provenance; use current handoff and implemented contracts for present behavior.
- Current CAD hosting permission is local-only. Both public/phase2-viewer and public/phase2-planning are ignored local assets, not access-controlled HTTP storage. Preserve original sources and sealed releases.
- Hosted Supabase changes, real-record imports, migrations, GIS publication, pushes and deployments require explicit authorization.

## Current project-wide rules

Read the [GraveNav project-wide development rules](<C:/Users/Nash/Documents/gravenav/AGENTS.md>) before working in this checkout. The 20 November 2026 project rules govern current capstone scope and override older product-direction notes in this worktree. Apply this checkout's technical and preservation instructions as well. Coordinate changes through reviewed Git work and keep existing hosted, CAD and deployment approval boundaries in force.
