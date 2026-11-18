# Visitor map presentation — 15 November 2026

Current product scope is [all of Forest Lake Phase 2](phase2-full-coverage.md): Butterfly Palm Garden A/B, Majestic Palm Garden A/C/D and Majestic Palm Court C estate lots. The visitor search-to-profile-to-gravesite journey must cover authorized records in every included area, rather than only Majestic A/D. These presentation/validation results do not establish complete records, accepted full-site geography or real-phone readiness.

The visitor interface now presents the park, memorial records and wayfinding landmarks. CAD provenance, candidate IDs, raw coordinate references, overlap review and layer controls remain in the existing administrator map through an explicit `staffTools` prop. This is a presentation distinction, not a new access-control boundary; local-only CAD hosting permission is unchanged.

Visitor changes cover the home page, map, search guidance and gravesite/location messages. They remove planning/demo terminology and use practical unavailable-location/directions messages. No geographic verification, publication, route-quality, GPS-freshness or record-identity gate is bypassed or relabelled as successful. No official lot numbers or burial associations are invented.

The retaining-edge review tooltip is removed. Dashed drafting/review lines are confined to staff mode. Visitor pathways remain visible as the existing paved-surface layer. The prominent Show/Hide paths drafting button is removed; visitor pathway and label visibility are available under secondary Map options. Staff retains the original toggle and raw geometry. All 4,494 candidate outlines, exact IDs, selections, coordinate references and source files are retained.

The user identified the broad diagonal strip as a walkway with street lights in its centre. Its six nested `PL` symbol groups are replaced in the site-detail SVG by compact light markers. Each group’s longitudinal position is projected onto the existing paired-edge walkway centreline; the manifest retains original and display positions plus offsets (under five drawing units). These are cartographic markers, not new measured pole locations or construction certification. Original decoded engineering geometry is preserved.

Seven spatial parking-label groups cover all 81 source bay placements without inventing official parking-area IDs or capacities. Labels anchor to actual bay placements. Parking and walkway labels appear at useful detail zoom, with direct focus buttons in Gardens & amenities. Gazebo, guard house, water tank, multipurpose hall and meter centre retain their source-backed anchors with plain visitor names. The two existing Butterfly Palm anchors remain distinct.

The versioned site SVG and detail manifest have new digests; the original plot-coordinate and plot-geometry bytes are unchanged. Prior versioned SVGs remain available for rollback. Source rendering and runtime validation are updated together. There are no database, publication, hosting, environment, push or deployment changes.

The supplied production-quality visitor brief is implemented as a scoped refinement of the current interface. The map uses the viewport width with a compact 300px desktop search/results sidebar. On mobile the map comes first and search/details use a keyboard-accessible native disclosure, expandable from Find a Loved One. Submitted searches, results, errors and selected records open the panel contextually. Map view switches, reset, zoom and secondary display options stay nearby. Existing GPS controls use My Location and View on Map wording; Get Directions links to the existing guidance panel only when target, access point and navigation policy are present. Missing location/directions have plain recovery copy. No GPS subscriptions, routing algorithms or server-side authorization/publication contracts are replaced.

## Verification

- Targeted ESLint, production build and its TypeScript check passed.
- All 56 selected visitor-presentation, coordinate, CAD-detail, public-reader, geographic-adapter and routing tests passed, with no skipped tests. These include separate staff controls, unchanged source identity, shared gravesites, unverified/missing publication rejection, GPS permission/freshness/accuracy handling and direction-policy gating.
- UI detector returned no findings.
- Browser checks covered desktop 1366×900 and mobile 390×844, with no horizontal overflow. The mobile map is approximately 542px high; the desktop map approximately 1004px wide. Native search disclosure, submitted no-match search, open results panel, compact view switches and unavailable-geography recovery worked. Both light and dark themes were checked.
- Pathway visibility under Map options hides/restores the paved layer while retaining all 4,494 candidates. Parking and Walkway focus controls worked. At detail zoom the corrected walkway, six lights, Parking and Gazebo labels were visible without the previous drafting circles/stars or retaining-edge tooltip.
- Actual phone GPS and real cemetery search-to-arrival acceptance were not performed. Published verified geography, exact official plot associations, accepted walking access/navigation policy and field validation remain operational prerequisites.

Evidence and pre-change source backups are in `C:/Users/Nash/.codex/visualizations/2026/11/13/01a1d323-71b9-73f2-8758-d9a5f56ea6f4/visitor-map-refinement/`. Prior unrelated working-tree changes were retained.
