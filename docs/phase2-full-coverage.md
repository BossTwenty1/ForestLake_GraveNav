# Forest Lake Memorial Park - Legazpi Phase 2 operational scope

Accepted scope: **15 November 2026**. This is the current product scope for development, data reconciliation, visitor search, staff management, geographic coverage and field acceptance. It supersedes the earlier Majestic Palm Section D-only and Sections A-and-D rollout boundaries.

## Coverage

GraveNav targets **all of Phase 2** at [Forest Lake Memorial Park - Legazpi](README.md#park-name-and-address), including Butterfly Palm Garden. A visitor searching for an authorized memorial in any Phase 2 garden must be able to find that individual, open their record and view the recorded gravesite. Walking directions depend on accepted geographic placement and reviewed access for that exact lot.

| Garden / area | Included sectors in the supplied plan | Operational target |
| --- | --- | --- |
| Butterfly Palm Garden | Lawn A and Lawn B | Memorial search, official plot matching, staff records, accepted geography and walking access |
| Majestic Palm Garden | Lawn A, Lawn C and Lawn D | The same full operational coverage; no A/D-only restriction |
| Majestic Palm Court C | Estate blocks and their internal lots | Individual official lot identities and shared-gravesite rules with accepted geography/access |

These are source-plan names, not newly created database areas or assumed mappings of those areas. Reconcile Forest Lake's literal garden/sector/block/lot codes with the actual approved site and area identities. Keep Majestic Palm Garden Lawn C distinct from Majestic Palm Court C. The repeated letter A in different gardens is not one shared section.

Phase 1 and other cemeteries are outside this scope change. No part of Phase 2 is excluded merely because it is outside Majestic A or D. Work may be validated in manageable batches, but completing a batch or a single garden does not establish completion of the full product scope.

## What this decision changes

- Data preparation, official numbering reconciliation and record-to-plot matching must cover every listed garden/sector and the estate lots.
- Visitor search by name or plot number must work across all authorized Phase 2 records, including Butterfly. All-gardens search, garden filtering, pagination and selected-person identity must retain that coverage.
- Staff workflows must manage the same full Phase 2 population under existing roles, privacy, capacity and audit rules.
- Geographic alignment, independent checks, permitted paths/access endpoints, publication selection and real-phone acceptance must cover the full Phase 2 footprint and its supported journeys.
- Keep all 4,494 CAD candidates, 20 independently selectable overlap pairs, nine original place anchors and source provenance. Plot labels, drawing counts and visual proximity do not create official identities or burial associations.

## Current implementation and evidence

| Item | Actual status |
| --- | --- |
| Phase 2 map | All 4,494 candidates are present in `/map`; visitor wording, responsive search/details, parking/amenity labels and walkway/light presentation are implemented locally. Technical references and coordinate disclosure remain in the staff view. |
| Candidate coordinates | LPCS/grid centre references exist for every candidate. The conditional PRS92/Luzon WGS84 copies remain private review outputs; source datum and ground alignment are unresolved. |
| Public search | Existing readers support name/plot lookup, garden filtering, public eligibility and individual profiles. This documentation update imports no additional real records and does not prove that every Phase 2 garden currently has complete searchable records. |
| Official identities | Complete full-site garden/section/block/lot-to-CAD and person-to-lot crosswalks remain to be established. The historical Section D queue contains 109 orders / 98 composite review keys only; those are not full-site counts or verified graves. |
| Geographic adapter | `getPhaseTwoScope()` supports both single-area (`GRAVENAV_PHASE2_AREA_ID`) and multi-area (`GRAVENAV_PHASE2_AREA_IDS`) Phase 2 configuration, dynamically resolving a burial record's approved area while preserving release/revision fencing and area isolation. |
| Import/publication | The existing v1 SQL pilot contract (one existing area, 1–50 declared lots) remains protected and in force. The offline package validator (`scripts/gis/package-validator.mjs`) now supports both `schema_version: 1` (v1 pilot) and `schema_version: 2` (full multi-area Phase 2 coverage up to 10,000 plots), while database-side full-scope import/publication remains gated behind explicit authorization and field verification. |
| GPS/routes | Existing location, accuracy, freshness, reviewed directed routing, remaining-distance, shared-destination and recovery behavior remains. Real full-site field acceptance and authorized geographic publication remain outstanding. |

The [coordinate assessment](phase2-plot-coordinates-2026-11-15.md) records a revised sector-sheet sum of 4,470 versus 4,494 CAD candidates, a 24-candidate difference. These are unreconciled source counts, not interchangeable official inventory totals. Preserve excess/unresolved candidates explicitly; do not delete outlines to force agreement. The supplied sector plan supports numbering review but contains no established GPS datum declaration or burial occupancy roster.

## Full-site implementation requirements

1. **Inventory and identity:** reconcile authorized records and literal plot numbering for Butterfly A/B, Majestic A/C/D and Court C estate lots. Track source revision, exact candidate instance, physical marker and review status. Preserve leading zeros and distinguish duplicate codes in different gardens. Keep unresolved identities separate from accepted associations.
2. **Search coverage:** ensure eligible Phase 2 records from every garden appear in all-gardens search and the correct filter. Preserve ranking, pagination, similar-name handling, each individual's profile and public consent. Do not silently restrict results to an A/D list, the old Section D queue or a single selected geographic release. A missing map association must not erase an otherwise eligible memorial search result.
3. **Geographic scope design:** review the actual site/area model and public GIS contracts before implementing full-site release selection or multi-area composition. Preserve release/revision consistency, area/site isolation, exact burial-to-lot identity and private-data exclusions. Do not relabel all gardens as one area just to satisfy the current selector.
4. **Import scale and publication:** define and test a reviewed full-coverage contract or compatible rollout strategy before claiming all-site publication. Keep the existing 1–50-lot v1 validation, replacement/omission protections and explicit approval gates intact until an authorized implementation changes them. Serial pilot packages are not automatically an additive, cross-garden publication strategy; a later release must not silently drop prior accepted coverage.
5. **Ground placement:** validate the source datum, units and control correspondence. Spread fitting controls and independent held-out checks across the whole site; establish acceptance tolerances before measuring errors. A surveyor must review whether the retained collection protocol supplies adequate full-site coverage. Drawing-to-drawing residuals and imagery alignment are not field accuracy.
6. **Walkable access:** review entrances, paths, barriers, permitted direction and exact lot approach points across all included areas. Validate any connections between gardens; display-only walkway/street-light symbols are not approved routing edges. Preserve a single physical destination for people sharing a grave.
7. **Real-phone acceptance:** test representative source-confirmed gravesites in every listed garden/sector, ordinary and shared graves, estate lots, permitted cross-garden journeys, reported GPS accuracy, poor/stale/denied fixes, off-route behavior, connectivity loss and physical arrival. Passing A/D-only checks does not establish full Phase 2 readiness.

## Acceptance checklist

- [ ] Authorized record and official-plot coverage is reconciled for every garden/sector in the coverage table, with outstanding gaps and source-count differences recorded.
- [ ] Searching an accepted Butterfly record by name and its literal plot identity returns the correct individual, profile and recorded garden/section/plot; repeat for Majestic A/C/D and Court C estate lots.
- [ ] All-gardens and per-garden searches, result pages and shared-grave individual selection include the intended full-site records without exposing private records or fields.
- [ ] Exact geographic destinations resolve to the selected record's reviewed physical lot across the accepted site/area model. Unmapped records remain searchable with a natural unavailable-location/directions message.
- [ ] Publication selection, import capacity/replacement behavior and reviewed route/access coverage support the intended full Phase 2 journeys under tested contracts.
- [ ] Accepted full-site control/checkpoint evidence and actual-phone tests support the release-specific navigation policy; no fictional or inferred destinations unlock guidance.
- [ ] Existing privacy, staff roles, capacity reservations, audit/recovery behavior, all 4,494 candidates, overlap members and nine original anchors remain intact.
- [ ] Target-specific import/migration/publication and CAD-distribution permissions are established before any hosted activation.

This is a **documentation-only scope decision**, not evidence that these acceptance checks passed. It changes no application code, data, environment variables, GIS publication or deployment. Current CAD access remains local-only. Hosted Supabase changes, real-record imports, migrations, pushes, merges and deployment require their existing explicit authorization.

Use the [operational handoff](phase2-local-defense.md), [search contract](search-navigation-safe-edits.md), [production checklist](production-readiness.md), [database notes](GraveNav_Database_Implementation_Notes.md) and [GIS runbook](gis/import-and-publication.md) for implementation and evidence. Archived reports retain their original dated findings; they do not define today's geographic scope.
