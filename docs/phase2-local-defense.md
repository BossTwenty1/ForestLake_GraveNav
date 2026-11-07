# Forest Lake Phase 2 local defense candidate

Local assessment, 7 November 2026. The GraveNav integration is installed and usable. The frozen viewer has one reproducible desktop redraw failure. Keep its error-free release gate open.

## Run the demonstration

Use the `gravenav-defense-rc/gravenav` worktree on branch `codex/defense-release-stabilization-20261106`. Its security baseline is `ea0bcfd6f79e611eb85b69bc81ec929583378b47`. Run `git rev-parse HEAD` for the local integration commit, which contains this handoff. The six runtime files are an independent, Git-ignored local installation.

From this worktree, run `npm run build` and `npm start -- --hostname 127.0.0.1 --port 3217`. At [GraveNav on localhost](http://127.0.0.1:3217/), choose **Phase 2 Planning Map (CAD only)** under **Explore Memorial Park**. The viewer opens in the same tab. Browser Back returns to GraveNav. A direct refresh also works. [Direct local viewer](http://127.0.0.1:3217/phase2-viewer/index.html)

**Access decision.** The owner approved a local defense demonstration only. Bind the server to loopback. Next.js serves the installed public files directly, including the raw geometry, without checking an application session. Deploying this populated directory or its build unchanged would expose them. Git ignore prevents ordinary staging and has no effect on HTTP access or deployment tools that upload a local directory. Future public or staff access requires explicit Forest Lake management permission. Staff-only hosting would need to enforce authorization on every asset request.

The visitor homepage displays the planning link when the local HTML file exists. With the package absent, it displays the original map link. The Phase 1 grounds map, GPS workflow, staff routes, security dependencies and 26 migrations are preserved. Next.js 16.4.5 uses the root URL with no base path, rewrite or catch-all route. Its proxy matches admin, admin API and auth routes. The common security headers apply to public assets.

## Frozen files

Use `artifacts/phase2-planning-viewer-2026-11-06.zip` from the separate Phase 2 project. Check the archive against its release record, read the archive manifest, and extract only the six files under its `site/` directory into `public/phase2-viewer/`, preserving all bytes and relative paths. Install before building and starting Next.js. The installed files sum to 17,922,211 bytes.

- ZIP SHA-256 `7ae04068f27be38e3b00d4ac01340c8b386de5c6aa247e261ff0a8576b2c68ff`
- Manifest SHA-256 `8381864aedc7cd463a210701715c8c20645e7dcfb75b0da859e5483c572ec7e6`

| Relative path in the local viewer | SHA-256 verified in the archive, installation and HTTP response |
| --- | --- |
| `index.html` | `d240948efca2f63994fa92418b5c3ff2c8ed6b2f062d26236569753731be8209` |
| `assets/index-NqH5vG6W.js` | `495fa77d39a3c6ade35cecf06e1d1fe97152c33acfb621649ab87623cc4b947f` |
| `assets/index-D0PqAa_S.css` | `474c852c549338a66235d75793d56bfc5ce9dd098af21eef2c54a349d9c98e75` |
| `data/phase2.local.json` | `02a4dba490872f9be8cf56280ccf432d31796431c1f808f542fbff86ac28ca77` |
| `materials/lawn-grass.png` | `fe1ab82a8a3041083ffebf7fd7888bd357b4d0db43568553c0522eb4edf4fd0b` |
| `materials/lawn-grass.prompt.txt` | `180d48f80942eb3ed4b975cb79913e9c88615cd33abc7c860cf51953e386618e` |

## Validation

| Gate | Observed in this candidate |
| --- | --- |
| Release integrity | ZIP, manifest, packaged handoff and all six site files passed. All six served files returned 200 with expected MIME types and matching hashes. Five missing file types and the deliberately omitted manifest returned 404 without redirection. |
| Entry and return | Desktop click and mobile tap from the actual homepage, direct reload, full CAD extent and browser Back passed. A separate production build without the viewer restored the original map link and returned 404 for the HTML and raw CAD. |
| Selection | Selected every candidate through the hosted viewer's search form and checked the resulting ID for each. All 4,146 lawn plus 348 estate outlines passed. Both internal CAD references in each of the 20 recorded overlap pairs selected distinct IDs. |
| Layers and interaction | Nine place anchors focused at their expected CAD coordinates. All released geometry and label toggles, desktop native hit testing, touch selection and drag, wheel, keyboard zoom and pan, reset and hidden-layer search passed. Road, pathway and additional-context canvas pixels appeared and cleared as toggled. No external viewer requests or unexpected runtime asset responses were observed in the desktop and mobile diagnostic. |
| Fault recovery | Missing and invalid geometry produced a retry screen and recovered. Missing and stalled grass imagery allowed the map to load. All 18 applicable desktop and touch-emulated mobile interaction regressions passed against Next.js. |
| Main application | ESLint passed with one pre-existing unused import warning. Standalone TypeScript and production build passed. Production dependency audit reported zero vulnerabilities. Main suite had 159 passes, 2 failures and 1 skip. The M07 and M09 database concurrency tests require the unavailable Docker Linux engine. |
| Main browser regressions | 32 of 34 passed, including anonymous staff redirects, API denials, record privacy, visitor search and map behavior. The existing Phase 1 Reset View overlap still blocks the zoom-in button at both 1440 and 390 pixels. Real staff sessions, hosted writes and physical phones were outside this run. |

**Viewer blocker.** On desktop, hide lawn plots after selecting a lawn, select `estates:1`, then search `18F9/AD5/23E`. The search resolves, but Leaflet can raise a `clearRect` error in its canvas redraw. The strict smoke failed in five consecutive Next.js runs. The supplied standalone smoke also reproduced the exception against the same bytes. Rapid overlap switching can reproduce it with selections still resolving. The frozen package was preserved.

**Rehearsed sequence.** After inspecting the estate, use **Clear selection**, enable **Lawn plots**, then search the overlap reference. This passed the complete desktop and emulated-mobile smoke in four consecutive paired runs. The sequence is a defense workaround. The underlying redraw defect remains open.

**Interpretation.** Leaflet CRS.Simple displays local Cartesian CAD coordinates with unconfirmed units. Candidate outlines and CAD references have no official grave ID, occupant or deceased-person crosswalk. The nine names locate planned features. The viewer supplies no geographic transformation or walking directions. Blender terrain and wall studies remain separate illustrative evidence.

## Rollback and next action

Stop the local server, move the entire `public/phase2-viewer/` directory outside `public/`, rebuild, and restart on loopback. Verify the original homepage map link and 404 responses for both the viewer HTML and geometry. To remove the integration code as well, revert only its local commit. Rollback requires no database or migration changes.

The tracked change comprises `.gitignore`, `eslint.config.mjs`, `src/app/page.tsx` and this handoff. The viewer is excluded from lint because the minified release must stay byte-identical.

For the defense, prioritize the redraw reproducer in the separate viewer source. Validate a newly frozen, separately versioned replacement with the same desktop/mobile gates before substituting it. The existing frozen ZIP remains the rollback reference.
