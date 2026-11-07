# Forest Lake Phase 2 local defense candidate

Verified 7 November 2026 for the tentative final defense on 18 November. GraveNav now uses the corrected `phase2-planning-viewer-2026-11-07-redraw-fix` static package.

## Local release and access

The adoption started from clean commit `46fdef1879c23d27e5e70eb63c3265960099b267` on `codex/defense-release-stabilization-20261106` in `C:\Users\Nash\.codex\worktrees\gravenav-defense-rc\gravenav`. Use `git rev-parse HEAD` for the documentation commit recording this adoption. The application source, homepage link, dependency lockfile, private environment settings, proxy configuration and 26 migrations retain their existing bytes.

The six runtime files are Git-ignored under `public/phase2-viewer/`. The homepage displays **Phase 2 Planning Map (CAD only)** when the local installation exists. It opens in the same tab. Browser Back returns to GraveNav.

Access is approved for a local defense demonstration only. Run on `127.0.0.1`. A deployment containing these public files would make the raw CAD directly retrievable. Git ignore controls staging and provides no HTTP access restriction. Future public or authenticated hosting requires Forest Lake management permission.

## Package and installed hashes

The immutable source ZIP is `C:\Users\Nash\Documents\GraveNav-Phase2-CAD\phase2-digital-map\artifacts\phase2-planning-viewer-2026-11-07-redraw-fix.zip`.

| Item | SHA-256 |
| --- | --- |
| ZIP | `687719cd8c0181277702c7075ff68e12b6617d33c133c92bb69881202071ff6a` |
| Packaged manifest | `f10e70c5b26ddba43374840859013ae8f89ce989f05a5861c8138d849d95f396` |
| `index.html` | `55e383855df28bba12725ee623c66653e912e06cf4194dd56c152b6537cfb84a` |
| `assets/index-DwP4JArH.js` | `7ededb145615b2a4002317b5ee5fb4ffafaf27657ae46e98eb79c48b17dc8470` |
| `assets/index-D0PqAa_S.css` | `474c852c549338a66235d75793d56bfc5ce9dd098af21eef2c54a349d9c98e75` |
| `data/phase2.local.json` | `02a4dba490872f9be8cf56280ccf432d31796431c1f808f542fbff86ac28ca77` |
| `materials/lawn-grass.png` | `fe1ab82a8a3041083ffebf7fd7888bd357b4d0db43568553c0522eb4edf4fd0b` |
| `materials/lawn-grass.prompt.txt` | `180d48f80942eb3ed4b975cb79913e9c88615cd33abc7c860cf51953e386618e` |

The archive, manifest, all archived entries, six staged runtime files, active installation and six HTTP payloads were verified. The runtime inventory totals 17,922,148 bytes. The old `assets/index-NqH5vG6W.js` returns 404. Geometry, CSS, grass image and provenance text match November 6.

## Integration checks

| Gate | Actual result |
| --- | --- |
| Original redraw sequence | Twelve complete runs passed through the GraveNav homepage, combining three repetitions, desktop/mobile and reduced/ordinary animation. Each selected a lawn, hid lawns, selected `estates:1`, searched `18F9/AD5/23E`, and selected `18F9/AD6/23E`. Lawns became visible, IDs resolved correctly and the viewer emitted zero uncaught exceptions or external requests. |
| Viewer regressions | 20 of 20 applicable desktop/mobile cases passed against Next.js. They cover rapid repeated estate/lawn transitions, hidden-category search recovery, stable selection canvas, highlight clearing, all layers, nine place anchors, native click/touch selection, touch drag, wheel, zoom/pan/reset, keyboard and missing/invalid asset recovery. |
| Inventory | All 4,494 candidates selected individually through the hosted search form. Both CAD references in each of the 20 overlap-review pairs resolved to distinct candidate IDs. All nine anchors focused. Road, pathway and additional-context canvas pixels appeared and cleared as toggled. |
| Navigation and routes | Homepage entry, same-tab navigation, Back, direct loading and refresh passed at desktop/mobile sizes. Six payload hashes and MIME types passed. Missing JS/CSS/JSON/PNG/HTML, the omitted manifest and obsolete JS returned 404 without redirection. |
| Main gates | Production build, standalone TypeScript and production dependency audit passed. Audit returned zero vulnerabilities. ESLint passed with one existing unused-import warning. |
| Main test suite | 159 passed, 2 failed, 1 skipped, 162 total. M07/M09 concurrency tests failed because Docker's Linux engine was unavailable. |
| Main browser | 32 passed, 2 failed, 34 total. The existing Phase 1 zoom-in button is still obstructed by Reset View at both viewport widths. Public search, map rendering, anonymous staff redirects, private-record handling and unauthenticated API denials passed. |

The source viewer fix gives Leaflet ownership of the selection pane renderer for the map's lifetime. React replaces highlight paths while preserving the canvas. The previous queued redraw after renderer disposal was reproduced before correction. This adoption used only the frozen ZIP.

Leaflet CRS.Simple retains local Cartesian CAD coordinates with unconfirmed units. These candidates have no verified operational grave IDs, occupant links or GPS transformation. Planned-place focus shows CAD design anchors.

## Cold start and rollback

For a fresh local defense setup, obtain the retained ZIP and existing approved private `.env.local` configuration through the project owner. Run `npm ci` using the locked application dependencies. Extract the ZIP to an empty staging folder outside `public/`. Verify the ZIP and manifest digests above, exactly six `site/` files, and each manifest file size/hash. Install only that complete `site/` directory as `public/phase2-viewer/` before building.

Run from this worktree:

```powershell
npm run build
npm start -- --hostname 127.0.0.1 --port 3217
```

Open [GraveNav](http://127.0.0.1:3217/) and choose the Phase 2 link, or load [the local viewer](http://127.0.0.1:3217/phase2-viewer/index.html) directly. Verify the original hidden-layer search and the obsolete asset's 404 response after each fresh installation.

The exact former installation is retained at `C:\Users\Nash\.codex\visualizations\2026\11\07\01a1b45b-514b-7232-85ed-3116e541ac04\adoption\november-6-rollback`. Its original ZIP remains at `C:\Users\Nash\Documents\GraveNav-Phase2-CAD\phase2-digital-map\artifacts\phase2-planning-viewer-2026-11-06.zip`, SHA-256 `7ae04068f27be38e3b00d4ac01340c8b386de5c6aa247e261ff0a8576b2c68ff`. To roll back, stop the loopback server, move the active viewer outside public, restore the complete six-file November 6 directory, verify its manifest, rebuild and restart. That release retains the redraw defect and requires clearing selection and enabling the target layer before searching.

## Defense readiness

Treat the corrected Phase 2 package as frozen. Continue GraveNav functional rehearsal using a separate, approved demonstration database and clearly labelled synthetic records. Rehearse ADMIN/MANAGER sign-in, unused plot assignment, burial entry, public visibility, successful search/profile/map and archive/recovery.

Open items include the Phase 1 control overlap, Docker concurrency gates, authenticated browser workflows and email delivery, a recoverable demo database with useful records, physical-device checks and field/GPS evidence. The adoption did not establish those outcomes. Raw test logs and browser helpers are retained under `C:\Users\Nash\.codex\visualizations\2026\11\07\01a1b45b-514b-7232-85ed-3116e541ac04\adoption`.
