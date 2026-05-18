# Engine Jobs Inventory

Purpose: classify engine-v1/jobs so diagnostics, candidates, production jobs, and unsafe legacy tools do not get mixed.

## Rules

- Production jobs may run from daily/intraday workflows.
- Diagnostic jobs may write reports but must not write canonical truth data.
- Candidate builders may write candidates/review queues but must not promote canonical data.
- Promotion/apply jobs may write canonical data only behind explicit validation/review gates.
- Legacy/unsafe jobs must not be added to workflows without review.
- Generated report/data directories should not be committed unless explicitly requested.

## Production workflow jobs

- run-daily-cycle.js: main daily build orchestrator.
- run-fixture-acquisition-chunk.js: canonical fixture acquisition chunk runner.
- sync-canonical-fixtures-to-json-db-day.js: sync canonical fixtures into JSON DB.
- build-details-day.js: builds per-match details.
- export-deploy-snapshot-day.js: writes deploy snapshot artifacts.
- run-intraday-snapshot-refresh.js: intraday snapshot refresh; Render redeploy is manually gated.
- run-live-status-refresh-day.js: live/open status refresh; must be reviewed for final-result truth loop integration.

## Diagnostic / audit jobs

- audit-finalization-readiness-day.js: checks if a day is safe to finalize.
- audit-finalization-history-range.js: read-only historical FT/value damage audit.
- build-finalization-repair-buckets.js: read-only repair bucket planner.
- verify-final-result-evidence-file.js: read-only final-result evidence verification report; input evidence JSON -> verifier report, canonicalWrites: 0, exit code 2 for conflicts and 1 for insufficient evidence.
- build-final-result-evidence-file.js: read-only final-result evidence package builder; raw evidence JSON -> validated/review/rejected evidence package, canonicalWrites: 0, no fetch, no verification, no promotion.
- build-and-verify-final-result-evidence-file.js: read-only combined final-result evidence diagnostic; raw evidence JSON -> evidence package -> verifier report, canonicalWrites: 0, no fetch, no promotion, exit code 2 for conflicts and 1 for insufficient evidence.
- discover-final-result-sources-file.js: read-only final-result source discovery report; watchRow JSON -> source/search descriptors, canonicalWrites: 0, no fetch, no FT decision, no promotion.
- discover-final-result-sources-watchset-day.js: read-only batch final-result source discovery report; deploy snapshot watchset -> source/search descriptors for selected rows, canonicalWrites: 0, no fetch, no FT decision, no promotion.
- classify-final-result-sources-file.js: read-only final-result source reliability classification report; source descriptors JSON -> official/trusted/provider/aggregator/unknown/rejected tiers, canonicalWrites: 0, no fetch, no FT decision, no promotion.
- discover-and-classify-final-result-sources-watchset-day.js: read-only combined final-result source discovery/reliability diagnostic; deploy snapshot watchset -> source/search descriptors -> source reliability tiers, canonicalWrites: 0, no fetch, no FT decision, no promotion.
- extract-final-result-evidence-file.js: read-only final-result evidence extraction report; prepared/source rows JSON -> rawEvidenceRows, canonicalWrites: 0, no fetch, no verification, no FT decision, no promotion.
- run-final-result-source-snapshot-evidence-diagnostic-file.js: read-only source snapshot evidence orchestrator; fetched source snapshots or validated URL resolutions -> prepare -> extract/build/verify diagnostic, canonicalWrites: 0, fetch only with explicit --allow-fetch, no production FT decision or promotion.
- audit-fixture-coverage-contract-day.js: fixture coverage contract audit; strict locally, warn-only in workflow.
- audit-fixture-provider-capability.js: provider capability/debt audit; strict locally, warn-only in workflow.
- audit-snapshot-mirror-day.js: snapshot parity audit.
- audit-team-news-league-source-map.js: team-news source-map audit.
- build-team-news-source-coverage-report-day.js: team-news coverage report.
- normalize-team-news-source-coverage-report-day.js: normalize team-news coverage reports.
- build-team-geo-coverage-report.js: team geo coverage report.
- validate-leagues-coverage-contract.js: league registry/coverage validation.

## Candidate builders

- Player usage candidate/workset jobs: build-player-usage-workset-day.js, build-player-usage-research-tasks-day.js, build-player-usage-manual-drafts-day.js, build-player-usage-deterministic-candidates-day.js, build-player-usage-ai-candidate-review-day.js, print-player-usage-ai-candidate-review-day.js.
- Team news candidate/workset jobs: build-team-news-workset-day.js, build-team-news-research-tasks-day.js, build-team-news-research-review-day.js, build-team-news-manual-drafts-day.js, build-team-news-registry-patch-candidates.js, build-team-news-source-enrichment-tasks-day.js, acquire-team-news-workset-day.js, bootstrap-team-news-from-details.js.
- Team geo candidate/bootstrap jobs: bootstrap-team-geo-from-wikidata.js, classify-team-geo-bootstrap-output.js.

## Promotion / apply jobs

- Player usage apply/import/validate/promote jobs require explicit review and production-grade validation.
- Team news apply/import/validate/promote jobs require contamination validation and explicit promotion.
- Team geo apply/import/seed jobs require controlled canonical write review.
- Manual seed jobs are local/manual only.

## History / standings / value jobs

- finalize-day.js and append-finalized-day-to-history.js must be guarded by finalization readiness.
- rebuild-current-season-history.js, backfill-history.js, build-current-season-indexes.js, rebuild-indexes-for-season.js, build-standings-day.js, collect-standings.js, build-model-priors.js depend on clean FT truth.
- Old values before the FT truth rebuild should be treated as quarantined/degraded for official performance statistics.

## Legacy / unsafe local-only jobs

- reconcile-final-scores-from-event-summary-day.js: ESPN event-summary diagnostic only; ESPN must not be canonical authority.
- run-player-usage-ai-requests-day.js: API-dependent path; avoid for dependency-free production direction.
- run-player-usage-research-day.js and run-player-usage-research-tasks-day.js: older research runners; review before use.
- run-team-news-research-tasks-day.js: candidate/review only.
- discover-window.js, monitor-active-leagues.js, discover-active-leagues.js: legacy discovery helpers.
- ingest-day.js: older ingest path; current direction is canonical acquisition store plus truth layer.
- prune-canonical-fixture-store.js: cleanup/destructive potential; run only with explicit intent.

## Generated output directories

- data/finalization-history-audits/
- data/finalization-repair-buckets/
- data/fixture-coverage-contract-reports/
- data/fixture-provider-capability-reports/
- data/team-news/_source-map-audits/
- data/team-news/_coverage-reports/
- data/team-geo/_reports/
- data/team-geo/_imports/
- data/player-usage/_worksets/
- data/player-usage/_research-tasks/

## Next architecture direction

Do not keep adding unrelated scripts. New FT autonomy work should be implemented as shared modules under:

engine-v1/football-truth/
- result-watchset-builder.js
- result-evidence-validator.js
- final-result-verifier.js
- source-discovery.js
- result-evidence-extractor.js
- result-evidence-builder.js
- source-reliability.js
- canonical-promotion-gate.js

Jobs should call these modules instead of duplicating truth logic.


### `extract-build-and-verify-final-result-evidence-file.js`

Read-only end-to-end FT evidence diagnostic.

Pipeline:

```text
prepared rows
-> result-evidence-extractor rawEvidenceRows
-> result-evidence-builder package / validator path
-> final-result-verifier
-> diagnostic report
```

Usage:

```powershell
node .\engine-v1\jobs\extract-build-and-verify-final-result-evidence-file.js --input .\path\to\prepared-evidence.json --output .\data\football-truth\_diagnostics\extract-build-and-verify-final-result-evidence-file.json
```

Supported input shapes:

```json
{ "watchRow": {}, "preparedRows": [] }
```

or:

```json
{ "cases": [{ "watchRow": {}, "preparedRows": [] }] }
```

Guarantees:

- read-only diagnostic only
- no fetch
- `canonicalWrites: 0`
- no canonical promotion
- no production repair
- no writes to fixtures/history/value/details

Exit codes:

- `0`: verified_final_result
- `1`: needs_more_evidence
- `2`: conflict


### `materialize-final-result-source-search-targets-file.js`

Read-only final-result source search target materializer.

Pipeline:

```text
discover/classify report
-> results[].discovery.searchDescriptors
-> flattened diagnostic searchTargets
```

Usage:

```powershell
node .\engine-v1\jobs\materialize-final-result-source-search-targets-file.js --input .\path\to\discover-classify-report.json --output .\data\football-truth\_diagnostics\final-result-source-search-targets.json
```

Guarantees:

- read-only diagnostic only
- no fetch
- no final truth decision
- `canonicalWrites: 0`
- no canonical promotion
- no production repair
- no writes to fixtures/history/value/details

This job does not resolve URLs and does not download pages. It only materializes search query targets for a later explicit fetch diagnostic.


### `materialize-final-result-source-resolution-tasks-file.js`

Read-only final-result source resolution task materializer.

Pipeline:

```text
searchTargets
-> resolutionTasks
-> manual/external search needed
```

Usage:

```powershell
node .\engine-v1\jobs\materialize-final-result-source-resolution-tasks-file.js --input .\path\to\final-result-source-search-targets.json --output .\data\football-truth\_diagnostics\final-result-source-resolution-tasks.json
```

Guarantees:

- read-only diagnostic only
- no fetch
- no URL resolution side effects
- no final truth decision
- `canonicalWrites: 0`
- no canonical promotion
- no production repair
- no writes to fixtures/history/value/details

This job does not resolve URLs and does not download pages. It converts search targets into explicit resolution tasks for a later external/manual URL resolution or controlled fetch diagnostic layer.


### `validate-final-result-source-url-resolutions-file.js`

Read-only final-result source URL resolution validator.

Pipeline:

```text
resolutionTasks
+ manually/externally resolved URLs
-> validatedResolvedSourceUrls / rejectedUrlResolutions
```

Usage:

```powershell
node .\engine-v1\jobs\validate-final-result-source-url-resolutions-file.js --input .\path\to\url-resolutions.json --output .\data\football-truth\_diagnostics\final-result-source-url-resolutions.json
```

Input shape:

```json
{
  "cases": [{ "resolutionTasks": [] }],
  "urlResolutions": [
    {
      "taskId": "...",
      "resolvedUrl": "https://...",
      "sourceName": "...",
      "sourceType": "official|provider|trusted|other",
      "resolvedBy": "manual|external_search|operator|diagnostic",
      "notes": "..."
    }
  ]
}
```

Guarantees:

- read-only diagnostic only
- no fetch
- no URL fetch
- no final truth decision
- `canonicalWrites: 0`
- no canonical promotion
- no production repair
- no writes to fixtures/history/value/details

This job only validates submitted URL resolutions against existing resolution tasks. It does not download pages or inspect page content.


### `fetch-final-result-source-url-snapshots-file.js`

Controlled final-result source URL fetch diagnostic.

Pipeline:

```text
validatedResolvedSourceUrls
-> fetchedSourceSnapshots / rejectedFetches
```

Usage:

```powershell
node .\engine-v1\jobs\fetch-final-result-source-url-snapshots-file.js --input .\path\to\final-result-source-url-resolutions.json --output .\data\football-truth\_diagnostics\final-result-source-url-snapshots.json
```

Fetch is blocked by default. Real downloads require explicit opt-in:

```powershell
node .\engine-v1\jobs\fetch-final-result-source-url-snapshots-file.js --input .\path\to\final-result-source-url-resolutions.json --output .\tmp-ft-url-snapshots.json --allow-fetch --limit=1 --timeout-ms=5000 --max-bytes=50000
```

Guarantees:

- diagnostic output only
- fetch requires explicit `--allow-fetch`
- `canonicalWrites: 0`
- no final truth decision
- no canonical promotion
- no production repair
- no writes to fixtures/history/value/details

This job downloads only validated resolved URLs when explicitly allowed. It does not extract final scores and does not update canonical data.


### `prepare-final-result-evidence-rows-from-source-snapshots-file.js`

Read-only final-result evidence row preparer from fetched source snapshots.

Pipeline:

```text
fetchedSourceSnapshots
-> preparedRows
-> extract-build-and-verify-final-result-evidence-file.js
```

Usage:

```powershell
node .\engine-v1\jobs\prepare-final-result-evidence-rows-from-source-snapshots-file.js --input .\path\to\final-result-source-url-snapshots.json --output .\data\football-truth\_diagnostics\final-result-prepared-evidence-rows.json
```

Guarantees:

- read-only diagnostic only
- no fetch
- no evidence extraction
- no final truth decision
- `canonicalWrites: 0`
- no canonical promotion
- no production repair
- no writes to fixtures/history/value/details

This job only converts diagnostic source snapshots into prepared evidence rows. Use the separate extract/build/verify job for evidence extraction and verification.

### `run-final-result-source-snapshot-evidence-diagnostic-file.js`

Read-only source snapshot FT evidence orchestrator.

Pipeline:

```text
validatedResolvedSourceUrls --allow-fetch
-> fetch-final-result-source-url-snapshots-file.js
-> fetchedSourceSnapshots
-> prepare-final-result-evidence-rows-from-source-snapshots-file.js
-> preparedRows
-> extract-build-and-verify-final-result-evidence-file.js
-> diagnostic report
```

It can also start directly from already fetched source snapshots:

```text
fetchedSourceSnapshots
-> prepare-final-result-evidence-rows-from-source-snapshots-file.js
-> preparedRows
-> extract-build-and-verify-final-result-evidence-file.js
-> diagnostic report
```

Usage without fetch:

```powershell
node .\engine-v1\jobs\run-final-result-source-snapshot-evidence-diagnostic-file.js --input .\data\football-truth\_diagnostics\final-result-source-url-snapshots.json --output .\data\football-truth\_diagnostics\final-result-source-snapshot-evidence-diagnostic.json
```

Usage with controlled fetch:

```powershell
node .\engine-v1\jobs\run-final-result-source-snapshot-evidence-diagnostic-file.js --input .\data\football-truth\_diagnostics\final-result-source-url-resolutions.json --output .\data\football-truth\_diagnostics\final-result-source-snapshot-evidence-diagnostic.json --allow-fetch --limit=1 --timeout-ms=5000 --max-bytes=50000
```

Supported input shapes:

- `{ fetchedSourceSnapshots }`
- `{ sourceSnapshots }`
- `{ snapshots }`
- output from `validate-final-result-source-url-resolutions-file.js`

Guarantees:

- read-only diagnostic wrapper
- `canonicalWrites: 0`
- no final truth production decision
- no canonical promotion
- no production repair
- no writes to fixtures/history/value/details
- fetch is blocked unless `--allow-fetch` is explicitly passed
