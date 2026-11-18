# Local fix for the search migration permission failure

17 November 2026. Active RC HEAD: `2c55e0482ad2faba1cc71f11c3b21efc39213ab7`. No hosted connection or mutation was used for this fix. The synthetic pilot remains unexecuted.

## Cause and exact change

The fourth migration replaces `public.search_public_burials`. Its function definition included `SET pg_trgm.similarity_threshold = '0.3'`, forcing the threshold used by `operator(extensions.%)` for each call. PostgreSQL rejected that parameter-setting clause for the hosted migration role. This is independent of PUGI's application ADMIN authorization.

The local fix removes only that extension-setting clause and replaces the name-similarity predicate with:

```sql
extensions.similarity(public.search_normalize(v.display_name), q) >= 0.3::real
```

The cutoff is inclusive, matching PostgreSQL 17's similarity operator implementation. The explicit real value matches `similarity()`'s return type. Search no longer depends on the caller's session threshold. The score expression, exact/token/plot/reference matching, ranking, garden/year filters, sort order, pagination bounds, public eligibility, security-definer boundary, search path, function signature and existing grants are unchanged. One explanatory comment was added. No privileges or global settings were changed by the application migration.

Reversing just these edits reconstructs the previously reviewed file's SHA-256 exactly. The first three migration hashes also match their reviewed values.

| Fourth migration | SHA-256 |
| --- | --- |
| Previous, blocked | `1462ee48b94114b2e5bda0d9b4bc31b7d7291573046eb10e00535edd1243ba3b` |
| Revised | `2fca92c1417b9767d6640f2c97e6202d03c0797152018c250d53b186a3161832` |

## Focused verification

- **35 tests passed:** `node --test tests/public-search-threshold.test.mjs tests/database-contracts.test.mjs tests/phase2-project-samples.test.mjs`.
- The new test and reusable SQL fixture compare complete old/new results in 192 cases under caller thresholds 0.01 and 0.99. They cover exact, reordered, partial and fuzzy names; values immediately below, at and above 0.3; internal codes and synthetic references; garden/year filters; both sorts; page boundaries/defaults; anonymous access and private/pending/archived/removed exclusions. Temporary oracle code exists only inside the local test session.
- The same fixture passed on the cached `public.ecr.aws/supabase/postgres:17.6.1.167` image after all 30 RC migration files loaded. The revised fourth migration then succeeded in a fresh connection as a non-superuser migration owner. The isolated test container had no networking, published ports, hosted credentials or backup mounts, and was removed afterward.
- `npx tsc --noEmit --incremental false` and `npx eslint tests/public-search-threshold.test.mjs` passed.

## Performance check

A scalar `similarity() >= threshold` condition does not directly use the trigram GIN/GiST similarity-operator strategy. The current full query also contains token/sub-string OR branches and a public security-barrier view. On 4,494 entirely fictional local records, EXPLAIN ANALYZE of the actual old/new inner query showed scans with no index scans for either version. Three-run median execution times were **59.57 ms before** and **58.399 ms after**. No material regression was observed at this test scale. This is local query-plan evidence, not a production latency guarantee or a scalability benchmark. Existing indexes were preserved; no index, query architecture or schema redesign was added.

## Rollout status

The local fix is ready for renewed review/approval. Previous approval covered different fourth-migration bytes. Do not reuse the previous execution SQL or bypass its old hash guard. A renewed operation must pin the revised hash, regenerate its execution package, and repeat the original backup/account/lot/integrity preconditions before any hosted migration or pilot. The first three reviewed migration files remain unchanged. No hosted retry, pilot, publication, deployment or new backup occurred in this task.

Primary references: [PostgreSQL 17 pg_trgm functions and index support](https://www.postgresql.org/docs/17/pgtrgm.html), [PostgreSQL 17 similarity operator source](https://github.com/postgres/postgres/blob/REL_17_STABLE/contrib/pg_trgm/trgm_op.c).
