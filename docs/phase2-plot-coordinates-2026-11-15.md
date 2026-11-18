# Phase 2 plot coordinate references

15 November 2026. Local development only; no geographic publication or record import.

Current operational target: [the whole Forest Lake Phase 2 cemetery](phase2-full-coverage.md), including Butterfly A/B, Majestic A/C/D and Court C estate lots. The source assessment and verification results below retain their actual evidence scope; they do not limit development to A/D or establish full-site GPS readiness.

## Implemented

Selecting any of the existing 4,494 CAD candidates now exposes **Plot coordinates** in the existing destination panel. The disclosure shows the centre of that exact source outline in LPCS X/Y and the other engineer drawing's raw grid easting/northing. These remain source drawing units with an unresolved geographic datum. They are not phone latitude/longitude, an official grave identity, a surveyed accuracy claim or a reachable walking endpoint.

The original candidate IDs, instance paths, geometry bytes, overlap flags, details, search and selection remain unchanged. No deceased person is assigned to a CAD outline. Both existing visitor and administrator maps use the shared component. Approved geographic/GPS/routing behavior remains separate and unchanged.

## Reproducible derivation

`scripts/build-phase2-plot-coordinates.py` reuses the existing full nested-block decoder. It pairs each existing outline with the corresponding outline in both engineer drawings and checks every complete polygon, not only its centroid. A planar similarity maps the existing display frame to LPCS. The seven paired drawing controls supply the LPCS-to-grid relation. All 4,494 full outlines agree within 0.001 drawing units; the observed maximum residuals are approximately 4.7e-11 local and 5.2e-10 grid units. These are computational consistency checks between drawings, not independent ground checks.

The builder verifies original DWG and geometry SHA-256 values, exact counts, unique candidate IDs, valid polygons, contained centroids and source paths. `public/phase2-planning/plot-coordinates.json` is a separately hashed, ignored local asset. The runtime verifies its digest, geometry/source identities, all candidate/path associations, finite pairs and the explicit unapproved status. A foreign or incomplete reference file fails closed with the existing restore/retry flow.

The original planning data remains `02a4dba490872f9be8cf56280ccf432d31796431c1f808f542fbff86ac28ca77`.

## Conditional geographic exports

Private review outputs are outside the repository/web root:

`C:/Users/Nash/.codex/visualizations/2026/11/13/01a1d323-71b9-73f2-8758-d9a5f56ea6f4/plot-coordinate-review/`

- `plot-coordinate-review.csv`: 4,494 candidate centres with source paths, LPCS/grid values and explicitly conditional WGS84 values under each datum hypothesis.
- `conditional-prs92-NOT-FOR-NAVIGATION.geojson`: 4,494 outline polygons if the source is EPSG:3124.
- `conditional-luzon1911-NOT-FOR-NAVIGATION.geojson`: the same candidates if the source is EPSG:25394.
- `build-checks.json`: source hashes, installed runtime digest, PROJ pipelines/catalog accuracy, EPSG database version and measured computational discrepancies.

Both conversions target longitude/latitude EPSG:4326 using installed PROJ operations with network access and ballpark operations disabled. The two placements differ by approximately 8.46–8.47 m across the site. Neither source-datum hypothesis is selected or approved. Catalog accuracy is not measured Forest Lake accuracy. Conditional geography is intentionally absent from the browser asset and cannot become GPS guidance through this disclosure.

Rebuild using QGIS Python and explicit `--data`, `--lpcs-import`, `--grid-import`, `--alignment`, `--lpcs-dwg`, `--grid-dwg`, `--output` and `--review-output` paths. The decoded imports and control evidence remain in the existing `forest-lake-cad-review` directory. The builder refuses a review-output path containing a `public` directory. Intentionally update the pinned runtime digest after a reviewed rebuild.

## Newly supplied Forest Lake sector plan

Source: `C:/Users/Nash/Downloads/FL-LGP2_Sch.6.3_2025_10_13_Sector-Maps_final-revision.pdf`.

SHA-256: `2ac0b2107b3cf5d1e3a455e3b5db1eace1bb54c7a95da3901ebb1d500dc50743`.

The seven-page vector PDF supplies a full-site key plan, separate sector sheets, printed block/lot numbering, classification colours and planned access/amenities. Both Majestic Palm A and D are clearly distinguished. Its information can support a source-traceable official-identity-to-CAD crosswalk. It contains no observed datum/EPSG/latitude/longitude/control-coordinate declaration. The filename's date does not replace the printed revisions: the overview reads 6.0 / 3 September 2024; sector sheets read 17 July 2025.

| PDF page | Sector | Stated/revised count |
| --- | --- | ---: |
| 2 | Butterfly Palm Garden, Lawn A | 382 |
| 3 | Butterfly Palm Garden, Lawn B | 322 |
| 4 | Majestic Palm Garden, Lawn A | 1,409 |
| 5 | Majestic Palm Garden, Lawn C | **497, red correction from 389** |
| 6 | Majestic Palm Garden, Lawn D | 1,512 |
| 7 | Majestic Palm Court C | 29 twelve-lot blocks / 348 internal lots |

The revised sheet counts imply 4,122 lawn lots plus 348 estate internal lots = **4,470**. The CAD has **4,494 candidate outlines**, including 4,146 lawn outlines: **24 more candidates** than that revised sheet sum. The overview's original grand total 4,362 remains printed even though red annotations revise Majestic's total to 3,418. Do not silently use the old 4,362 or treat the inferred 4,470 as a reconciled official inventory. No candidate is removed or merged to force agreement.

The plan improves section/numbering evidence; it does not by itself prove that a specific old CAD instance matches a specific printed lot, nor does it associate a deceased person with a lot. Preserve garden + section + block + literal lot number together, including leading zeros. Resolve geometry/revision differences while constructing the crosswalk; text extraction order, source traversal order and nearest section letters are not official identifiers.

## Remaining activation work

1. Reconcile every supplied sector sheet to exact CAD instances: Butterfly A/B, Majestic A/C/D and Court C estate lots. Keep unresolved/excess candidates and the 24-candidate discrepancy explicit; do not stop at the earlier A/D subset.
2. Establish the source datum and validate geographic placement against independently recovered ground checkpoints. This task requires no new GPS observation for every plot.
3. Match authorized individual burial records to reviewed physical lot identities through existing protected workflows.
4. Review entrances, walkable edges and each lot's access endpoint, then test real phone fixes/search-to-arrival behavior before approving geographic release/navigation settings.

No hosted Supabase action, public CAD distribution, real-record import, migration, GIS publication, push or deployment is included.

## Verification performed

- Builder assertions passed for all 4,494 paired full polygons and centres; original geometry bytes and DWG hashes remain unchanged.
- Targeted ESLint, TypeScript during production build, and the production build passed.
- All 51 selected coordinate, CAD-detail, visitor, geographic-adapter and routing tests passed, with no skipped tests. Runtime tests include wrong source/geometry/path, incomplete coverage, nonfinite coordinates and attempts to relabel the references as approved GPS.
- Desktop and 390px mobile browser checks passed for lawn and estate selections, changed values after selecting another candidate, disclosure, selection clearing, all 4,494 retained candidates and no horizontal overflow. The UI detector returned no findings.
- Original changed map sources were backed up in the private review directory before installation. Existing unrelated dirty work was preserved.
