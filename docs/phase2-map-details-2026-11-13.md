# Phase 2 map detail update — 13 November 2026

Current scope, 15 November 2026: [all Forest Lake Phase 2 gardens/sectors](phase2-full-coverage.md), including Butterfly and the estate lots, for operational records/search as well as map display. This dated visual-detail report preserves what was implemented and tested on its date; it does not establish full-site record/GPS readiness.

Scope: detail refinement inside the existing `/map` planning canvas. The shared administrator map receives the same refinement. Geographic coordinates, per-plot GPS, identity matching, routing policy, hosted data and deployment are outside this step.

The engineer's `FOREST_LAKE_PHASE2_LOT-10070_LPCS.dwg` supplies the additional geometry; `FL LGP PH2_Sch 6.2_ for Pama.pdf` supplies the visual plan reference. The DWG SHA-256 is `c34847dff62d973d276883c2d683a94453a274924e6379deab7531af9d8fb22c`. Both originals remain unchanged.

## Result

- Buildings/floors/roof linework, 81 parking-bay placements, site fixtures, road edges, pedestrian paths, fences and creek/protection edges have separate crisp vector detail overlays.
- The CAD's five section-letter anchors and creek anchor accompany the existing garden and landmark labels. A letter anchor is not an inferred section boundary or plot membership.
- Existing lawn/estate selection, all 4,494 candidate IDs/outlines, all overlap flags, nine existing place anchors, search, zoom/reset and geographic-mode gates are preserved.
- “CAD buildings, parking & site details” controls the new overlays. Roads, paths, protection and label switches continue controlling the corresponding details. Decorative image panes do not intercept plot clicks.
- Materials and shadows add visual depth but do not claim observed construction or measured building heights.

## Alignment and runtime assets

The new DWG was decoded to a diagnostic GeoPackage locally. Nested block definitions, insertion base points, scales, rotations and extrusion normals are explicitly reconstructed rather than trusting the importer's expanded mirrored shapes. Only the site-development subtree shared by all regular lot instances is used; off-site cadastral parcels and survey-control labels are excluded from the detail layers.

One planar similarity relates all 4,494 corresponding lot centroids to the original planning data. The maximum computational residual is below `0.001` drawing units (approximately `5.3e-11` in this extraction). This verifies congruence between the drawings, not ground accuracy. The existing planning data file is not rewritten.

The four versioned SVGs total approximately 191 KB uncompressed. Their coordinates remain in the original local Cartesian map frame. `public/phase2-planning/cad-details/manifest.json` records source hashes, alignment, extents, layer hashes and source-backed labels; its digest is pinned alongside the existing frozen planning bundle. Runtime validation rejects a foreign source/geometry digest, geographic coordinate frame, mismatched extents, excessive alignment residual, unsafe asset paths and invalid labels.

CAD assets remain in the existing ignored local asset area. Do not publish, commit or deploy the CAD data without the separate distribution authorization.

## Rebuild and verification

Run `scripts/build-phase2-cad-details.py` with QGIS's Python and explicit `--cad-import`, `--dwg`, `--pdf`, `--data`, `--landscape` and `--output` paths. The script checks all candidate correspondences and preserves original data bytes. The original decoded import and engineer files stay outside the repository. A rebuild that changes the manifest must update its pinned digest intentionally.

`tests/phase2-cad-details.test.mjs` checks the local-frame contract, source identity, alignment limits, asset names, label validity and the original planning-data hash. When the local CAD assets are absent, only the installed-asset integration check is skipped; synthetic contract tests still run.

This is a local visual-detail change. It does not assign geographic coordinates to individual plots or activate walking directions.

Verified locally: targeted ESLint, TypeScript, the production build and all 47 selected CAD/navigation/routing/geographic/visitor tests passed. The UI detector reported no findings. Desktop and 390px mobile checks confirmed loaded vector layers, no horizontal overflow, retained candidate selection during detail toggles, and shared pathway visibility. Garden labels move above their CAD anchors and appear after zooming on narrow maps to avoid section-letter collisions. The original 4,494-candidate data hash remains unchanged.
