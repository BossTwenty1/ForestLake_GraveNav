# Pilot preservation guard diagnosis and local correction

17 November 2026. No hosted writes, pilot retries, migrations, policy changes or deployments were performed. One read-only query retrieved lot 3721's existing review flags and presence booleans; it did not retrieve its coordinates.

## Exact cause

The failed execution package's `$pilot_integrity$` block compares `to_jsonb(current_row)` with the locked before-image after excluding only `lot_owner_id`, `status`, `revision` and `updated_at`. It raises `Unapproved target fields changed` on any other difference. This guard is correct and remains unchanged.

The protected `staff_save_record` implementation, defined in the already-applied `20261107010000_shared_gravesite_interments.sql`, treats an omitted `area_id` or `location_geom` key as distinct from the stored JSON value. It then resets `coordinate_verified=false`, `coordinate_status=pending`, and `coordinate_rejection_reason=null`. The pilot supplied only lot code, owner attachment and availability. Because its area and geometry were omitted, this existing path ran despite no requested geographic edit.

The read-only lot baseline confirms revision 2, HOLD, non-null geometry, `coordinate_status=verified`, `coordinate_verified=true`, no rejection reason and no coordinate-accuracy value. A matching verified local fixture reproduces the failure and identifies the complete changed-field set:

| Field | Before | Original save result | Classification |
| --- | --- | --- | --- |
| lot_owner_id | NULL | New fictional owner ID | Approved |
| status | HOLD | AVAILABLE | Approved |
| revision | 2 | 3 | Expected revision trigger |
| updated_at | Previous timestamp | Save timestamp | Expected timestamp trigger |
| coordinate_status | verified | pending | **Unapproved; causes rejection** |
| coordinate_verified | true | false | **Unapproved; causes rejection** |

`coordinate_rejection_reason` is also assigned NULL by the writer but was already NULL, so it is not a changed field. Revisions and timestamps were already exempted by the guard and did not cause the failure. No other fields changed in the reproduction.

This is a genuine unapproved side effect of the pilot caller's incomplete patch, not an overly restrictive validation. Allowing coordinate-review changes in the guard would conceal the issue and was not done.

## Minimal correction for review

Only `scripts/phase2-staging/prepare-project-samples.mjs` changes executable application tooling. Its generated lot-save patch now additionally sends:

```sql
'area_id', target.area_id,
'location_geom', to_jsonb(target)->'location_geom'
```

Both values come from the already locked/revision-checked lot. Stored geometry is passed through in its existing PostGIS representation; no coordinate is invented, transformed, verified or republished. This satisfies the existing protected-writer contract without triggering its coordinate invalidation path. The intended changes remain only owner attachment and HOLD -> AVAILABLE, plus the ordinary revision/timestamp updates.

The failed SQL package is preserved unchanged. A separate `LOCAL_REVIEW_CORRECTED_SINGLE_PILOT.sql` artifact contains only the two additional unchanged-before-image fields and a review-only header. Its preservation comparison, allowed-field list, role checks, row lock/revision, association checks, atomic transaction, source markers, duplicate receipts and other-lot fingerprint checks are unchanged. All fictional identities, dates, source row/PDF references and CAD candidate `lawn:2363` are retained. Historical and physical mapping verification remain false.

Review SQL SHA-256: `f2998f7629c819c0a2bdb91781ac53f5faa00f05d890c8743d86029d1b6cb6c7`.

## Regression evidence

`node --test tests/phase2-project-samples.test.mjs`: **19 tests passed**, including the new verified-coordinate pilot regression.

- The original patch reproduces the exact two forbidden coordinate-review changes, and the unchanged guard rejects it.
- The corrected generated pilot passes that same guard. Only the four approved/managed fields differ afterward; geometry, review state, scope, codes and other lot fields remain equal.
- Replaying the same generated pilot leaves one interment and does not advance the lot revision again.
- A stale revision and unauthorized manager review remain rejected.
- An unrelated width change is still rejected by the unchanged preservation comparison and rolls back.
- Existing tests cover association/owner conflicts, synthetic source identity, public/staff readers and visibility, and unsupported source/GIS references.

`npx eslint scripts/phase2-staging/prepare-project-samples.mjs tests/phase2-project-samples.test.mjs` passed. These were disposable local PGlite SQL/application tests, not a hosted pilot or a browser test. The four completed migration files still match their approved hashes; none was changed or reapplied to Supabase.

## Retry boundary

The same business pilot and approved field expectations can be retained. The corrected generated payload and review SQL must be reviewed/authorized before a hosted retry, followed by the normal fresh administrator, lot, association, duplicate and integrity preconditions. Do not retry the original incomplete payload and do not expand the guard's exemptions. No new schema migration or broader coordinate-change approval is proposed.
