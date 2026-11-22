# Forest Lake Phase 2 — Control Points & Georeferencing Guide

This guide explains how to organize Ground Control Points (GCPs) and independent validation checkpoints for Forest Lake Memorial Park - Legazpi (Phase 2), and how to build a validated `schema_version: 2` multi-area GIS package once real coordinates are collected.

## 1. Organized Control Points Sheet

[phase2-control-points.csv](phase2-control-points.csv) is generated directly from the audited Phase 2 CAD geometry and your two paired DWG drawings (`FOREST_LAKE_PHASE2_LOT-10070_LPCS.dwg` and `FOREST_LAKE_PHASE2_LOT-10070_WGS_ASSUMED-COORDINATES.dwg`).

It contains **20 distributed anchors** across the entire Phase 2 footprint:
- **15 `GCP` fitting points** (`GCP-01` .. `GCP-15`): Guard House, Water Tank, North/East/West/South perimeter corners, Butterfly Palm Garden A & B, Parking 02 & 03, NEW MPH, Standard Gazebo, Broad Walkway, Majestic Palm Garden A & D.
- **5 `VALIDATION` checkpoints** (`VAL-01` .. `VAL-05`): Parking Area 01, Majestic Palm Garden C, Meter Center, Parking Area 02 South, and South Creek Edge. These are **never used for fitting** — they measure independent ground error in meters.

### Columns in `phase2-control-points.csv`
- `cad_x`, `cad_y`, `lpcs_x`, `lpcs_y`, `grid_easting`, `grid_northing`: Exact drawing coordinates from your DWG/CAD files.
- `ref_if_prs92_*_NOT_FOR_NAV` and `ref_if_luzon1911_*_NOT_FOR_NAV`: Conditional reference hints (~8.5 m apart) showing where to look on Google Earth or stand on-site. **Never treat these as verified GPS.**
- `source_method`, `observed_lat`, `observed_lng`, `reported_accuracy_m`, `captured_at`, `device_reference`, `operator_reference`, `notes`: Fill these in with your real observations.
  - Use `source_method = field_survey` **only** for real on-site phone/GNSS measurements taken at Forest Lake (recommended: 5 rows per `point_code` for 5 separate GPS readings).
  - Use `source_method = imagery_reference` if you temporarily record pins from Google Earth Pro for visual datum checking or local pipeline rehearsal.

## 2. Quick Datum Check in Google Earth Pro (Pre-Survey)

1. Open Google Earth Pro and zoom to Forest Lake Memorial Park - Legazpi (~13.13°N, 123.73°E).
2. Compare `ref_if_prs92_*` vs `ref_if_luzon1911_*` for recognizable structures (`GCP-01` Guard House, `GCP-09` NEW MPH, `GCP-10` Standard Gazebo, `VAL-01` Parking Area 01) against the satellite imagery.
3. This helps confirm which Philippine datum the engineering DWG used before your on-site visit. Remember that satellite imagery itself can be shifted by 2–10 m, so final verification still requires on-site `field_survey` readings.

## 3. Building & Validating the Phase 2 GIS Package

Once `phase2-control-points.csv` is filled and you have a lot crosswalk JSON (`[{ lotId, areaId, cadCandidateId }]`):

```bash
# Operational build (requires source_method=field_survey and held-out error <= 3.0 m):
node scripts/gis/build-phase2-package.mjs \
  --gcp-csv docs/gis/phase2-control-points.csv \
  --crosswalk <path-to-crosswalk.json> \
  --out-dir <path-to-output-package-dir>

# Non-operational rehearsal build (for testing with Google Earth imagery_reference pins):
node scripts/gis/build-phase2-package.mjs \
  --gcp-csv docs/gis/phase2-control-points.csv \
  --crosswalk <path-to-crosswalk.json> \
  --out-dir <path-to-output-package-dir> \
  --allow-imagery-rehearsal

# Standalone offline contract check:
node scripts/validate-gis-package.mjs <path-to-output-package-dir>
```

To regenerate the blank control point sheet from the local CAD assets at any time:

```bash
node scripts/gis/generate-phase2-gcp-sheet.mjs
```
