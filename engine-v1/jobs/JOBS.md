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
- run-final-result-consensus-smoke-day.js: read-only day-level FT consensus smoke orchestrator; builds watchset -> discover/classify -> search targets -> resolution tasks, optionally validates supplied resolved URLs and runs source snapshot evidence diagnostic; canonicalWrites: 0, fetch only with explicit --allow-fetch, no production FT decision or promotion.
- build-final-result-resolved-url-input-template-file.js: read-only helper that converts resolution tasks into a manual resolved-URL input template with cases and urlResolutions placeholders; canonicalWrites: 0, no fetch, no validation, no production FT decision or promotion.
- build-final-result-consensus-review-summary-file.js: read-only helper that converts a final-result smoke/wrapper report into a manual review summary grouped by verified, conflict, and needs_more_evidence cases; canonicalWrites: 0, no fetch, no validation, no production FT decision or promotion.
- build-final-result-review-queue-file.js: read-only helper that converts a final-result consensus review summary into a manual review queue grouped by ready_for_review, manual_conflict_review_required, and needs_more_independent_evidence; canonicalWrites: 0, no fetch, no validation, no production FT decision or promotion.
- run-final-result-review-queue-day.js: read-only day wrapper that runs final-result consensus smoke, review summary, and review queue artifact generation from a resolved-URLs input; canonicalWrites: 0, fetch only with explicit --allow-fetch, no production FT decision or promotion.
- audit-fixture-coverage-contract-day.js: fixture coverage contract audit; strict locally, warn-only in workflow.
- audit-fixture-provider-capability.js: provider capability/debt audit; strict locally, warn-only in workflow.
- audit-snapshot-mirror-day.js: snapshot parity audit.
- audit-team-news-league-source-map.js: team-news source-map audit.
- build-team-news-source-coverage-report-day.js: team-news coverage report.
- normalize-team-news-source-coverage-report-day.js: normalize team-news coverage reports.
- build-team-geo-coverage-report.js: team geo coverage report.
- validate-leagues-coverage-contract.js: league registry/coverage validation.
- build-fixture-coverage-reality-day.js: read-only fixture universe coverage reality audit; compares declared coverage contract with canonical fixtures and optional market/reference-board input, writes diagnostics/templates only, canonicalWrites: 0, no fetch, no canonical fixture/details/value/final-result writes.
- build-active-league-acquisition-plan-file.js: read-only provider-agnostic active league acquisition planner; starts from LEAGUES_COVERAGE as coverage authority, treats ESPN as supplemental crosscheck only, converts no-adapter leagues to autonomous acquisition required instead of skip, canonicalWrites: 0, no fetch, no fixture/history/value/details/final-result writes.

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

- reconcile-final-scores-from-event-summary-day.js: supplemental event-summary diagnostic only; no supplemental scoreboard feed must be canonical authority.
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






### `run-final-result-review-queue-day.js`

Read-only day wrapper that builds a final-result review queue artifact from a resolved-URLs input.

Pipeline:

```text
run-final-result-consensus-smoke-day.js
-> build-final-result-consensus-review-summary-file.js
-> build-final-result-review-queue-file.js
```

Required input:

```text
--date YYYY-MM-DD
--resolved-urls-file <manual resolved URLs JSON>
--allow-fetch
```

Default output directory:

```text
data/football-truth/_review-queue/YYYY-MM-DD/
```

Outputs:

```text
final-result-consensus-smoke-report.json
final-result-review-summary.json
final-result-review-queue.json
final-result-review-queue-day-report.json
```

The wrapper is review-queue-only: `canonicalWrites: 0`, fetch remains opt-in via explicit `--allow-fetch`, no final truth production decision, no canonical promotion, no production repair, and no fixture/history/value/details writes.

Typical usage:

```powershell
node .\engine-v1\jobs\run-final-result-review-queue-day.js `
  --date=2026-05-18 `
  --resolved-urls-file .\data\football-truth\_diagnostics\...\filled-3-match-resolved-urls.json `
  --output-dir .\data\football-truth\_review-queue\2026-05-18 `
  --allow-fetch `
  --keep-intermediate
```

### `build-final-result-review-queue-file.js`

Read-only helper that converts a final-result consensus review summary into a manual review queue artifact.

Input:

```text
review-summary.json from build-final-result-consensus-review-summary-file.js
```

Output rows:

```text
manual_conflict_review_required
needs_more_independent_evidence
ready_for_read_only_review
```

The queue rows include priority, score groups, evidence sources, manual review status placeholders, and allowed reviewer decisions.

The helper is review-queue-only: `canonicalWrites: 0`, no fetch, no validation, no final truth production decision, no canonical promotion, no production repair, and no fixture/history/value/details writes.

Typical usage:

```powershell
node .\engine-v1\jobs\build-final-result-review-queue-file.js `
  --input .\data\football-truth\_diagnostics\...\filled-3-match-review-summary.json `
  --output .\data\football-truth\_diagnostics\...\filled-3-match-review-queue.json
```

### `build-final-result-consensus-review-summary-file.js`

Read-only helper that converts a final-result smoke/wrapper report into a compact manual review summary.

Input:

```text
run-final-result-consensus-smoke-day.js report
or
run-final-result-source-snapshot-evidence-diagnostic-file.js wrapper report
```

Output groups:

```text
verifiedCases
conflictCases with score groups and sources
needsMoreEvidenceCases with evidence counts and review action
allCases
```

The helper is diagnostic-summary-only: `canonicalWrites: 0`, no fetch, no validation, no final truth production decision, no canonical promotion, no production repair, and no fixture/history/value/details writes.

Typical usage:

```powershell
node .\engine-v1\jobs\build-final-result-consensus-review-summary-file.js `
  --input .\data\football-truth\_diagnostics\...\filled-3-match-consensus-smoke-report.json `
  --output .\data\football-truth\_diagnostics\...\filled-3-match-review-summary.json
```

### `build-final-result-resolved-url-input-template-file.js`

Read-only helper that converts `resolution-tasks.json` into a manual resolved-URL input template.

Input:

```text
resolution-tasks.json from materialize-final-result-source-resolution-tasks-file.js or run-final-result-consensus-smoke-day.js intermediate output
```

Output shape:

```text
cases: copied/normalized match cases and resolutionTasks
urlResolutions: placeholder rows where manual review fills resolvedUrl and sourceName
```

The helper also infers missing home/away teams from quoted search queries when resolution tasks do not carry explicit team fields.

The job is diagnostic-template-only: `canonicalWrites: 0`, no fetch, no validation, no final truth production decision, no canonical promotion, no production repair, and no fixture/history/value/details writes.

Typical usage:

```powershell
node .\engine-v1\jobs\build-final-result-resolved-url-input-template-file.js `
  --input .\data\football-truth\_diagnostics\...\resolution-tasks.json `
  --output .\data\football-truth\_diagnostics\...\resolved-url-input-template.json `
  --limit-cases=5 `
  --max-resolutions-per-match=2
```

### `run-final-result-consensus-smoke-day.js`

Read-only day-level final-result consensus smoke orchestrator.

Pipeline:

```text
build-final-result-watchset.js
-> discover-and-classify-final-result-sources-watchset-day.js
-> materialize-final-result-source-search-targets-file.js
-> materialize-final-result-source-resolution-tasks-file.js
```

Optional URL evidence path:

```text
--resolved-urls-file <file>
-> validate-final-result-source-url-resolutions-file.js
-> run-final-result-source-snapshot-evidence-diagnostic-file.js
```

Fetch is blocked unless `--allow-fetch` is explicitly provided. The job is diagnostic-only: `canonicalWrites: 0`, no final truth production decision, no canonical promotion, no production repair, and no fixture/history/value/details writes.

Typical no-fetch shape smoke:

```powershell
node .\engine-v1\jobs\run-final-result-consensus-smoke-day.js `
  --date=2026-05-18 `
  --limit=5 `
  --min-age-hours=0 `
  --max-search-descriptors=6 `
  --max-targets-per-match=4 `
  --max-tasks-per-match=3
```

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

### build-final-result-review-decision-template-file.js

Builds a read-only manual review decision template from a final-result review queue file.

Input:
- `--input <final-result-review-queue.json>`

Optional:
- `--output <final-result-review-decisions-template.json>`

Output:
- decision template rows with `queueId`, `matchId`, teams, current verdict, score groups, allowed decisions, empty reviewer fields, `reviewed:false`, and `productionApproved:false`.

Allowed reviewer decisions:
- `approve_verified_read_only`
- `accept_score_group_read_only`
- `add_source_required`
- `reject_all`
- `defer`

Safety guarantees:
- `canonicalWrites:0`
- no promotion
- no production final-truth decision
- no production repair
- no fixture/history/value/details writes

Self-test:
```powershell
node .\engine-v1\jobs\build-final-result-review-decision-template-file.js --self-test
```

### validate-final-result-review-decisions-file.js

Validates a read-only final-result manual review decisions file before any later promotion design exists.

Input:
- `--input <final-result-review-decisions-template.json>`

Optional:
- `--output <final-result-review-decisions-validation.json>`

Validation rules:
- every row must have a non-empty `queueId`
- every row must include `allowedDecisions`
- `reviewerDecision`, when set, must be included in `allowedDecisions`
- `reviewed:true` requires a non-empty `reviewerDecision`
- `accept_score_group_read_only` requires a valid `selectedScoreKey` from the row score groups
- `productionApproved` must remain `false` in this read-only stage

Safety guarantees:
- `canonicalWrites:0`
- no promotion
- no production final-truth decision
- no production repair
- no fixture/history/value/details writes

Self-test:
```powershell
node .\engine-v1\jobs\validate-final-result-review-decisions-file.js --self-test
```

### build-final-result-reviewed-decision-summary-file.js

Builds a read-only summary/report from final-result manual review decisions or validation output.

Input:
- `--input <final-result-review-decisions-validation.json|decisions-template.json>`

Optional:
- `--output <final-result-reviewed-decision-summary.json>`

Summary output includes:
- reviewed rows
- unreviewed rows
- approved verified read-only rows
- accepted score-group read-only rows
- add-source-required rows
- rejected rows
- deferred rows
- invalid rows
- productionApproved violations
- read-only actionable rows

Safety guarantees:
- `canonicalWrites:0`
- no promotion
- no production final-truth decision
- no production repair
- no fixture/history/value/details writes

Self-test:
```powershell
node .\engine-v1\jobs\build-final-result-reviewed-decision-summary-file.js --self-test
```

### build-final-result-missing-ft-inventory-range.js

Builds a read-only inventory report for missing or suspicious final-result coverage across deploy snapshots in a date range.

Input:
- `--from YYYY-MM-DD`
- `--to YYYY-MM-DD`

Optional:
- `--snapshots-dir <data/deploy-snapshots>`
- `--output <final-result-missing-ft-inventory.json>`
- `--stale-live-hours <number>`
- `--pre-after-start-hours <number>`
- `--unknown-after-start-hours <number>`
- `--score-without-final-hours <number>`

Detects:
- stale LIVE fixtures after threshold
- PRE/scheduled fixtures still not final after kickoff threshold
- unknown status after kickoff threshold
- score present without final status
- final status without score
- final fixtures with unsettled value picks

Safety guarantees:
- `canonicalWrites:0`
- no promotion
- no production final-truth decision
- no production repair
- no fixture/history/value/details writes

Self-test:
```powershell
node .\engine-v1\jobs\build-final-result-missing-ft-inventory-range.js --self-test
```

Example:
```powershell
node .\engine-v1\jobs\build-final-result-missing-ft-inventory-range.js --from 2026-05-01 --to 2026-05-19
```

### build-final-result-truth-audit-workset-from-inventory-file.js

Builds a read-only final-result truth audit workset from a missing/suspicious FT inventory report.

Input:
- `--input <final-result-missing-ft-inventory.json>`

Optional:
- `--output <final-result-truth-audit-workset.json>`

Workset audit types:
- `missing_final_truth` for PRE/LIVE/UNKNOWN/stale rows where final truth is missing or suspicious
- `verify_existing_final_truth` for rows that already show FT/final score but still need independent verification
- `verify_value_settlement` for value settlement rows that need final-truth verification

Priority rules:
- high: rows with value settlement impact, stale live rows with score, or score present without final status
- medium: existing FT/final-score verification rows, PRE after kickoff, or UNKNOWN after kickoff
- normal: lower-risk remaining rows

Safety guarantees:
- `canonicalWrites:0`
- no promotion
- no production final-truth decision
- no production repair
- no fixture/history/value/details writes

Self-test:
```powershell
node .\engine-v1\jobs\build-final-result-truth-audit-workset-from-inventory-file.js --self-test
```

Example:
```powershell
node .\engine-v1\jobs\build-final-result-truth-audit-workset-from-inventory-file.js --input .\data\football-truth\_diagnostics\inventory-2026-05-18-with-verification.json
```

### run-final-result-truth-audit-workset-range.js

Runs the read-only final-result truth audit range pipeline in one command.

Pipeline:
- missing/suspicious FT inventory range
- truth audit workset
- source search targets
- source resolution tasks
- wrapper summary report

Input:
- `--from YYYY-MM-DD`
- `--to YYYY-MM-DD`

Optional:
- `--output-dir <directory>`
- `--snapshots-dir <data/deploy-snapshots>`
- `--max-targets-per-match <number>`
- `--missing-only` to disable existing-final verification candidates

Default behavior:
- includes both missing FT rows and existing FT/final-score verification candidates
- produces search targets and resolution tasks only
- does not fetch URLs
- does not resolve URLs with side effects
- does not make final-truth production decisions
- does not promote canonical results

Safety guarantees:
- `canonicalWrites:0`
- `fetch:false`
- `urlResolutionSideEffects:false`
- no production final-truth decision
- no canonical promotion
- no production repair
- no fixture/history/value/details writes

Self-test:
```powershell
node .\engine-v1\jobs\run-final-result-truth-audit-workset-range.js --self-test
```

Example:
```powershell
node .\engine-v1\jobs\run-final-result-truth-audit-workset-range.js --from 2026-05-01 --to 2026-05-19
```

### build-final-result-truth-audit-resolution-batches-file.js

Builds read-only batches from final-result truth audit resolution tasks so large backfill/audit worksets can be processed safely in small chunks.

Input:
- `--input <truth-audit-resolution-tasks.json>`

Optional:
- `--output <truth-audit-resolution-batches.json>`
- `--max-tasks <number>`
- `--batch-size <number>`
- `--intent <comma-separated intents>`
- `--league <comma-separated league slugs>`
- `--day <comma-separated YYYY-MM-DD values>`
- `--match-id <comma-separated match IDs>`
- `--priority <number>`

Default ordering:
- value settlement verification first
- missing final truth
- score crosscheck
- verify existing final truth
- official/trusted final result

Safety guarantees:
- `canonicalWrites:0`
- `fetch:false`
- `urlResolutionSideEffects:false`
- no production final-truth decision
- no canonical promotion
- no production repair
- no fixture/history/value/details writes

Self-test:
```powershell
node .\engine-v1\jobs\build-final-result-truth-audit-resolution-batches-file.js --self-test
```

Example:
```powershell
node .\engine-v1\jobs\build-final-result-truth-audit-resolution-batches-file.js --input .\data\football-truth\_diagnostics\truth-audit-range-2026-05-01_to_2026-05-19\truth-audit-resolution-tasks-2026-05-01_to_2026-05-19.json --max-tasks 100 --batch-size 25
```

### build-final-result-truth-audit-resolution-review-pack-file.js

Builds a read-only manual/external review pack from one final-result truth audit resolution batch.

Input:
- `--input <truth-audit-resolution-batches.json>`

Optional:
- `--batch-id <resolution_batch_0001>`
- `--batch-index <number>`
- `--output <truth-audit-resolution-review-pack.json>`

Review pack fields:
- `reviewTaskId`
- `sourceTaskId`
- `matchId`
- `date`
- `leagueSlug`
- `homeTeam`
- `awayTeam`
- `intent`
- `priority`
- `query`
- `expectedScoreKey`
- `manualResolvedUrl`
- `manualSourceName`
- `manualSourceType`
- `manualObservedHomeScore`
- `manualObservedAwayScore`
- `manualObservedStatus`
- `manualEvidenceText`
- `reviewerNotes`
- `reviewed:false`
- `acceptedForValidation:false`
- `productionApproved:false`

Safety guarantees:
- `canonicalWrites:0`
- `fetch:false`
- `urlResolutionSideEffects:false`
- no production final-truth decision
- no canonical promotion
- no production repair
- no fixture/history/value/details writes

Self-test:
```powershell
node .\engine-v1\jobs\build-final-result-truth-audit-resolution-review-pack-file.js --self-test
```

Example:
```powershell
node .\engine-v1\jobs\build-final-result-truth-audit-resolution-review-pack-file.js --input .\data\football-truth\_diagnostics\truth-audit-range-2026-05-01_to_2026-05-19\truth-audit-resolution-batches-value-first.json --batch-id resolution_batch_0001
```

### validate-final-result-truth-audit-resolution-review-pack-file.js

Validates a read-only filled final-result truth audit resolution review pack before any source validation, final-truth decision, or promotion stage.

Input:
- `--input <truth-audit-resolution-review-pack.json>`

Optional:
- `--output <truth-audit-resolution-review-pack-validation.json>`

Validation rules:
- every row must have `reviewTaskId`, `matchId`, `date`, `intent`, and `query`
- `manualResolvedUrl`, when set, must start with `http://` or `https://`
- `manualSourceName` is required when `manualResolvedUrl` is set
- observed home/away scores must be set together
- `reviewed:true` requires `manualResolvedUrl` or reviewer notes
- `acceptedForValidation:true` requires `reviewed:true`, URL, source name, both observed scores, and observed status
- `productionApproved` must remain `false` in this read-only stage

Safety guarantees:
- `canonicalWrites:0`
- `fetch:false`
- `urlResolutionSideEffects:false`
- no production final-truth decision
- no canonical promotion
- no production repair
- no fixture/history/value/details writes

Self-test:
```powershell
node .\engine-v1\jobs\validate-final-result-truth-audit-resolution-review-pack-file.js --self-test
```

Example:
```powershell
node .\engine-v1\jobs\validate-final-result-truth-audit-resolution-review-pack-file.js --input .\data\football-truth\_diagnostics\truth-audit-range-2026-05-01_to_2026-05-19\truth-audit-resolution-review-pack-batch-0001.json
```

### build-final-result-source-url-resolutions-from-review-pack-file.js

Builds read-only source URL resolution validator input from an accepted filled final-result truth audit review pack.

Input:
- `--input <truth-audit-resolution-review-pack.json>`

Optional:
- `--output <final-result-source-url-resolutions-input.json>`

Behavior:
- reads review pack tasks
- keeps only rows with `reviewed:true`, `acceptedForValidation:true`, and `productionApproved` not true
- creates `cases[].resolutionTasks[]`
- creates `urlResolutions[]` keyed by `taskId`
- outputs the shape expected by `validate-final-result-source-url-resolutions-file.js`

Safety guarantees:
- `canonicalWrites:0`
- `fetch:false`
- `urlResolutionSideEffects:false`
- no production final-truth decision
- no canonical promotion
- no production repair
- no fixture/history/value/details writes

Self-test:
```powershell
node .\engine-v1\jobs\build-final-result-source-url-resolutions-from-review-pack-file.js --self-test
```

Example:
```powershell
node .\engine-v1\jobs\build-final-result-source-url-resolutions-from-review-pack-file.js --input .\data\football-truth\_diagnostics\truth-audit-resolution-review-pack-batch-0001.json
```

### run-final-result-review-pack-url-validation-file.js

Runs the read-only validation chain for a filled final-result truth audit review pack.

Pipeline:
- validate filled review pack
- build source URL resolutions input from accepted review rows
- validate source URL resolutions with the existing URL resolution validator

Input:
- `--input <filled-review-pack.json>`

Optional:
- `--output-dir <directory>`
- `--allow-invalid-review-pack` to continue after review-pack validation errors for diagnostics

Default behavior:
- blocks if review-pack validation fails
- keeps only `reviewed:true` + `acceptedForValidation:true` + `productionApproved` not true rows for URL validation input
- does not fetch URLs
- does not make final-truth decisions
- does not promote canonical results

Safety guarantees:
- `canonicalWrites:0`
- `fetch:false`
- `urlResolutionSideEffects:false`
- no production final-truth decision
- no canonical promotion
- no production repair
- no fixture/history/value/details writes

Self-test:
```powershell
node .\engine-v1\jobs\run-final-result-review-pack-url-validation-file.js --self-test
```

Example:
```powershell
node .\engine-v1\jobs\run-final-result-review-pack-url-validation-file.js --input .\data\football-truth\_diagnostics\truth-audit-resolution-review-pack-batch-0001.json
```

### build-league-context-completeness-inventory-range.js

Builds a read-only league context completeness inventory across a date range by combining deploy snapshot fixtures, canonical fixtures, value picks, and standings.

Input:
- `--from <YYYY-MM-DD>`

Optional:
- `--to <YYYY-MM-DD>`
- `--root <project-root>`
- `--output <league-context-completeness.json>`

Output per date + league:
- `snapshotFixtureCount`
- `canonicalFixtureCount`
- `valuePickCount`
- `standingsAvailable`
- `standingsTeamCount`
- `standingsConfidence`
- `standingsCompleteness`
- `snapshotTeamsMatchedInStandings`
- `motivationContextPossible`
- `fixtureCoverageRisk` and reasons
- `contextDataWarning` and reasons
- `finalTruthRisk` and reasons

Risk separation:
- `fixtureCoverageRisk` is reserved for true snapshot/canonical fixture mismatch when canonical reference exists
- `contextDataWarning` is used for missing canonical reference, missing standings, or unavailable motivation context inputs
- `finalTruthRisk` is used for live-like or score-present-without-final-status rows

Safety guarantees:
- `canonicalWrites:0`
- `fetch:false`
- no production final-truth decision
- no canonical promotion
- no fixture/history/value/details writes

Self-test:
```powershell
node .\engine-v1\jobs\build-league-context-completeness-inventory-range.js --self-test
```

Example:
```powershell
node .\engine-v1\jobs\build-league-context-completeness-inventory-range.js --from 2026-05-01 --to 2026-05-19
```

### build-team-motivation-context-from-standings-file.js

Builds a read-only team motivation context file from one standings JSON file.

Input:
- `--input <standings.json>`

Optional:
- `--output <motivation.json>`
- `--league <leagueSlug>`
- `--season-phase <early|middle|late|run_in>`
- `--title-race-places <number>`
- `--title-race-points-window <number>`
- `--continental-places <number>`
- `--continental-points-window <number>`
- `--relegation-places <number>`
- `--relegation-points-window <number>`
- `--no-relegation`
- `--enable-continental-pressure`
- `--enable-playoff-pressure`

Output:
- one row per team with position, played, points, goal difference, season phase, motivation tags, primary motivation, motivation score, pressure components, and gaps

League profile behavior:
- generic European-style leagues keep relegation and continental pressure enabled
- `usa.*` leagues disable relegation and generic continental pressure by default
- playoff/promotion pressure is disabled by default unless explicitly enabled

Safety guarantees:
- `canonicalWrites:0`
- `fetch:false`
- no production final-truth decision
- no canonical promotion
- no fixture/history/value/details writes

Self-test:
```powershell
node .\engine-v1\jobs\build-team-motivation-context-from-standings-file.js --self-test
```

Example:
```powershell
node .\engine-v1\jobs\build-team-motivation-context-from-standings-file.js --input .\data\standings\eng.1.json
```

### build-team-motivation-context-range.js

Builds read-only team motivation context files for all eligible leagues in a date range.

Pipeline:
- optionally builds league context completeness inventory for the range
- selects leagues where `standingsAvailable:true` and `motivationContextPossible:true`
- runs `build-team-motivation-context-from-standings-file.js` for each selected league
- writes one motivation context file per league plus a range summary

Input:
- `--from <YYYY-MM-DD>`

Optional:
- `--to <YYYY-MM-DD>`
- `--root <project-root>`
- `--inventory <league-context-completeness.json>`
- `--output-dir <directory>`
- `--max-leagues <number>` for smoke runs

Output:
- `<leagueSlug>.motivation.json` files
- `team-motivation-context-range-summary.json`

Safety guarantees:
- `canonicalWrites:0`
- `fetch:false`
- no production final-truth decision
- no canonical promotion
- no fixture/history/value/details writes

Self-test:
```powershell
node .\engine-v1\jobs\build-team-motivation-context-range.js --self-test
```

Example smoke:
```powershell
node .\engine-v1\jobs\build-team-motivation-context-range.js --from 2026-05-01 --to 2026-05-19 --max-leagues 20
```

### build-league-context-motivation-readiness-report-range.js

Builds a read-only league context and motivation readiness report across a date range.

Pipeline:
- builds or reads league context completeness inventory
- builds or reads team motivation context range outputs
- groups inventory rows by league
- classifies each league as ready, ready with warnings, or blocked

Input:
- `--from <YYYY-MM-DD>`

Optional:
- `--to <YYYY-MM-DD>`
- `--root <project-root>`
- `--inventory <league-context-completeness.json>`
- `--motivation-dir <directory>`
- `--output-dir <directory>`
- `--output <readiness-report.json>`
- `--max-leagues <number>` for smoke runs

Readiness statuses:
- `ready_for_context_integration`
- `ready_with_context_warnings`
- `blocked_final_truth_risk`
- `blocked_fixture_coverage_risk`
- `blocked_missing_standings`
- `blocked_motivation_context_unavailable`
- `blocked_motivation_output_missing`

Output:
- league-level readiness summary
- status counts
- fixture coverage risk reasons
- context warning reasons
- final truth risk reasons
- motivation output availability and motivation summary per league

Safety guarantees:
- `canonicalWrites:0`
- `fetch:false`
- no production final-truth decision
- no canonical promotion
- no fixture/history/value/details writes

Self-test:
```powershell
node .\engine-v1\jobs\build-league-context-motivation-readiness-report-range.js --self-test
```

Example smoke:
```powershell
node .\engine-v1\jobs\build-league-context-motivation-readiness-report-range.js --from 2026-05-01 --to 2026-05-19 --max-leagues 40
```

### build-league-context-readiness-priority-workset-file.js

Builds a read-only priority workset from a league context motivation readiness report.

Input:
- `--input <league-context-motivation-readiness-report.json>`

Optional:
- `--output <league-context-readiness-priority-workset.json>`

Priority order:
- final-truth risk first, especially where value picks are impacted
- missing or rebuild-needed standings
- fixture coverage repair
- context data warnings
- later context integration candidates

Output rows:
- `priorityRank`
- `priorityScore`
- `priorityBand`
- `actionType`
- `leagueSlug`
- `readinessStatus`
- `reason`
- `recommendedNextJob`
- fixture/value/standings/final-truth/motivation counters
- risk reasons copied from readiness report

Action types:
- `resolve_final_truth_risk`
- `add_or_rebuild_standings`
- `repair_fixture_coverage`
- `review_context_data_warning`
- `candidate_for_context_integration`
- `manual_inspection`

Safety guarantees:
- `canonicalWrites:0`
- `fetch:false`
- no production final-truth decision
- no canonical promotion
- no fixture/history/value/details writes

Self-test:
```powershell
node .\engine-v1\jobs\build-league-context-readiness-priority-workset-file.js --self-test
```

Example:
```powershell
node .\engine-v1\jobs\build-league-context-readiness-priority-workset-file.js --input .\data\league-context\_diagnostics\readiness-2026-05-01_to_2026-05-19\league-context-motivation-readiness-report.json
```

### build-final-result-truth-promotion-plan-file.js

Builds a dry-run final-result truth promotion plan from reviewed final-result decision rows.

Input:
- `--input <reviewed-decisions.json>`

Optional:
- `--value <value.json>` to estimate affected value-pick settlement impact
- `--output <promotion-plan.json>`

Output:
- `matchId`
- `date`
- `leagueSlug`
- `homeTeam`
- `awayTeam`
- `approvedFinalScore`
- `sourceCount`
- `independentSourceCount`
- `sourceUrls`
- `evidenceVerdict`
- `affectedValuePicks`
- `proposedSettlement`
- `writeTarget`
- `blockedReason`

Safety guarantees:
- `canonicalWrites:0`
- `productionWrite:false`
- `dryRun:true`
- `fetch:false`
- no production final-truth decision
- no canonical promotion
- no production repair
- no fixture/history/value/details writes

Self-test:
```powershell
node .\engine-v1\jobs\build-final-result-truth-promotion-plan-file.js --self-test
```

Example:
```powershell
node .\engine-v1\jobs\build-final-result-truth-promotion-plan-file.js --input .\data\football-truth\_review-decisions\reviewed-decisions.json --value .\data\deploy-snapshots\2026-05-18\value.json --output .\data\football-truth\_promotion-plans\final-result-truth-promotion-plan-2026-05-18.json
```

### validate-final-result-truth-promotion-plan-file.js

Validates a dry-run final-result truth promotion plan before any production writer exists.

Input:
- `--input <promotion-plan.json>`

Optional:
- `--output <validation-report.json>`

Validation checks:
- top-level dry-run guarantees
- no write/apply intent
- summary counts match `planRows`
- promotion-ready rows include match/date/league/teams/write target
- promotion-ready rows include numeric approved final score
- promotion-ready rows include enough source support
- blocked rows include `blockedReason`
- affected value-pick dry-run settlements are structurally valid

Safety guarantees:
- `canonicalWrites:0`
- `productionWrite:false`
- `dryRunValidation:true`
- no fixture/history/value/details writes

Self-test:
```powershell
node .\engine-v1\jobs\validate-final-result-truth-promotion-plan-file.js --self-test
```

Example:
```powershell
node .\engine-v1\jobs\validate-final-result-truth-promotion-plan-file.js --input .\data\football-truth\_promotion-plans\final-result-truth-promotion-plan-2026-05-18.json --output .\data\football-truth\_promotion-plans\final-result-truth-promotion-plan-2026-05-18.validation.json
```

### write-final-result-truth-from-promotion-plan-file.js

Consumes a validated final-result truth promotion plan and produces a guarded final-result truth write report.

Default mode is dry-run only. The job writes no canonical final-result files unless both explicit flags are present:

- --apply
- --allow-production-writes

Allowed production write target is restricted to:

- data/final-results/YYYY-MM-DD/<matchId>.json

The writer does not fetch URLs, does not repair production data, and does not write fixtures, history, value, or details. Value settlement remains a later guarded step.
Sandbox smoke mode is supported with:

- --sandbox-output-root data/football-truth/_sandbox-final-results

When this flag is present, even --apply --allow-production-writes writes to the sandbox tree instead of data/final-results/, while preserving the final-results date/matchId layout for verification.
Overwrite guard:

- Existing final-result target files are blocked by default during --apply.
- To intentionally overwrite an existing target, the caller must provide --allow-overwrite-final-result.
- This applies to sandbox writes and production writes, so repeated apply smoke runs expose accidental overwrite risk instead of silently replacing files.
### build-value-settlement-from-final-results-day.js

Builds a dry-run value settlement report from verified canonical final-result truth files under:

- data/final-results/YYYY-MM-DD/<matchId>.json

The job reads value picks from data/value/YYYY-MM-DD.json or deploy snapshot fallback and evaluates supported markets only when erifiedFinalTruth:true exists. It writes only the requested report and does not write canonical value/history/fixtures/details files.
### write-value-settlement-from-final-results-day.js

Consumes a dry-run report from uild-value-settlement-from-final-results-day.js and writes the settled value file only when explicitly requested.

Default mode is dry-run. Production write requires explicit flags:

- --apply
- --allow-value-writes
- --allow-overwrite-value when the target value file already exists

Sandbox smoke mode is supported with:

- --sandbox-output-root data/football-truth/_sandbox-value-settlement

The writer only writes the value target/draft from the settlement report. It does not write fixtures, history, final-result truth, or details.
### export-value-settlement-summary-file.js

Exports a tracked settlement summary artifact from a value-settlement report.

Default output:

- data/football-truth/_settlement-summaries/YYYY-MM-DD.value-settlement-summary.json

The summary records WIN/LOSS rows backed by verified final-result truth without writing ignored data/value/, fixtures, history, or details.
### build-value-settlement-statistics-range.js

Builds read-only value settlement statistics from tracked settlement summary artifacts.

Input source:

- data/football-truth/_settlement-summaries/*.value-settlement-summary.json

Default output:

- data/football-truth/_settlement-statistics/value-settlement-statistics-YYYY-MM-DD_to_YYYY-MM-DD.json

The range report aggregates total WIN/LOSS/VOID/unknown rows, win rate, by-date, by-market, and by-league buckets. It does not read or write ignored data/value/, fixtures, history, details, or final-result truth files.
### validate-value-settlement-daily-cycle-output-day.js

Validates daily-cycle value-settlement summary/statistics output for a single day.

Default inputs:

- data/football-truth/_settlement-summaries/YYYY-MM-DD.value-settlement-summary.json
- data/football-truth/_settlement-statistics/value-settlement-statistics-YYYY-MM-DD_to_YYYY-MM-DD.json

Default output:

- data/football-truth/_diagnostics/value-settlement-daily-cycle/YYYY-MM-DD.value-settlement-output-validation.json

The validator checks that summary/statistics artifacts exist, are schema-compatible, match counts, and remain read-only for data/value/, fixtures, history, details, and final-result truth files.
### build-officiating-candidate-template-day.js

Builds a read-only officiating/discipline candidate template for one day from fixture rows and optional verified final-result truth context.

Default input:

- data/deploy-snapshots/YYYY-MM-DD/fixtures.json
- data/final-results/YYYY-MM-DD/*.json

Default output:

- data/football-truth/_diagnostics/officiating-candidates/YYYY-MM-DD.officiating-candidates.json

This job does not fetch sources and does not write production data/officiating/. It keeps referee and discipline candidates independent from final-result truth sources, so final-result verification can proceed even when referee/cards/penalties are missing.
### build-season-final-truth-settlement-readiness-range.js

Builds a read-only range audit for fixture ingest, verified final-result truth, value-settlement readiness, backtest eligibility, and officiating candidate coverage.

Default output:

- data/football-truth/_diagnostics/season-readiness/final-truth-settlement-readiness-START_to_END.json

Inputs read where present:

- data/deploy-snapshots/YYYY-MM-DD/fixtures.json
- data/canonical-fixtures/YYYY-MM-DD/*.json
- data/value/YYYY-MM-DD.json
- data/final-results/YYYY-MM-DD/*.json
- data/football-truth/_settlement-summaries/YYYY-MM-DD.value-settlement-summary.json
- data/football-truth/_settlement-statistics/value-settlement-statistics-YYYY-MM-DD_to_YYYY-MM-DD.json
- data/football-truth/_diagnostics/officiating-candidates/YYYY-MM-DD.officiating-candidates.json

The job performs no source fetch, no backtest replay, and no production writes. It is intended to decide which dates/leagues/rows are safe for verified FT promotion, settlement, and later virtual value backtesting.

Use `--value-baseline-date YYYY-MM-DD` to keep fixture/final-truth coverage across an older range while counting value settlement/backtest scope only from the accepted clean baseline onward. Historical value rows before the baseline are reported as `ignoredHistoricalValuePicksBeforeBaseline` and excluded from value/backtest readiness counts.
#### Canonical fixture fallback

uild-season-final-truth-settlement-readiness-range.js supports canonical fixture fallback. When deploy snapshot fixtures are missing for a day, the job reads data/canonical-fixtures/YYYY-MM-DD/*.json and records ixtureSource: canonical_fixtures. Missing deploy snapshots with canonical fixture rows are recorded as warnings, not fixture coverage risks. This keeps baseline readiness useful for current dates where canonical ingest exists but a deploy snapshot has not been exported.
### build-fixture-acquisition-v2-readiness.js

Read-only Fixture Acquisition V2 readiness/workset builder. It compares the declared league coverage contract with canonical fixtures for a day and marks leagues as unsafe for value when they are supplemental-only, missing verified provider support, or missing canonical fixtures. It performs no source fetches and writes no production data.

Example:

```powershell
node .\engine-v1\jobs\build-fixture-acquisition-v2-readiness.js --date 2026-05-21
```


### fixture-provider-capabilities.js

Fixture Acquisition V2 provider capability policy module. It separates declared coverage from actual acquisition coverage and value-ready coverage.

Current policy:

- Supplemental scoreboard feeds are unsafe as a sole value substrate.
- Value-ready fixture acquisition requires an explicit verified fixture provider capability.
- Official league sources and manual verified imports are provider slots only; they do not create league coverage until explicitly configured and validated.
- Unknown configured providers are diagnostic-only and not value-ready.

This module performs no fetches and no production writes.

### build-fixture-identity-second-source-controlled-fetch-plan-file.js

Read-only controlled fetch plan builder for fixture identity second-source URL validation reports.

Purpose:
- Consume validated second-source URL resolution reports.
- Convert acceptedResolvedUrls into controlled fetch plan rows.
- Keep pending URL resolutions blocked from fetch.
- Keep rejected URL resolutions blocked from fetch.
- Prepare the next explicit fetch stage without fetching anything.

Rules:
- Input validation report must have ok=true.
- Input validation report must have errorCount=0.
- acceptedResolvedUrls become fetchPlanRows.
- pending_resolved_url warnings become blockedPendingRows.
- rejectedResolutions become blockedRejectedRows.
- Fetch remains blocked until a later fetch job is called with explicit --allow-fetch.

Guarantees:
- sourceFetch: false
- noFetch: true
- noUrlFetch: true
- noUrlResolutionSideEffects: true
- fetchRequiresAllowFetchInLaterStage: true
- noReviewDecisionApplied: true
- noCanonicalPromotion: true
- canonicalWrites: 0
- deploySnapshotWrites: false
- valueWrites: false
- detailsWrites: false
- productionWrite: false
- dryRun: true

Example:
node .\engine-v1\jobs\build-fixture-identity-second-source-controlled-fetch-plan-file.js --date 2026-05-22 --input <validated-url-resolutions.json> --output <controlled-fetch-plan.json>
### fetch-fixture-identity-second-source-controlled-fetch-plan-snapshots-file.js

Read-only controlled fetch diagnostic for fixture identity second-source fetch plans.

Purpose:
- Consume controlled fetch plans produced from validated second-source URL resolution reports.
- Keep URL fetch blocked by default.
- Require explicit `--allow-fetch` before downloading any accepted second-source URL.
- Fetch only controlled fetch plan rows, respecting `--limit`, timeout, and max-byte guards.
- Emit fetchedSecondSourceSnapshots for later confirmation/evidence review stages.

Rules:
- Without `--allow-fetch`, every planned fetch is rejected with `blocked_fetch_requires_allow_fetch`.
- With `--allow-fetch`, the job fetches only the requested diagnostic rows and writes only the requested output file.
- This job does not apply review decisions.
- This job does not write canonical fixtures.
- This job does not promote fixture truth.
- This job does not create deploy snapshots, value output, details, history, or production fixture data.

Guarantees:
- diagnosticOnly: true
- fetchRequiresAllowFetch: true
- noReviewDecisionApplied: true
- noCanonicalPromotion: true
- canonicalWrites: 0
- productionWrite: false
- dryRun: true

Example:
node .\engine-v1\jobs\fetch-fixture-identity-second-source-controlled-fetch-plan-snapshots-file.js --input <controlled-fetch-plan.json> --output <fetched-second-source-snapshots.json> --limit 1 --allow-fetch

Important:
- This job is an explicit opt-in fetch boundary.
- Fetched snapshots are diagnostic evidence only.
- Fetched snapshots must still pass confirmation review / fixture identity validation before readiness or promotion planning.

### validate-fixture-identity-second-source-url-resolutions-file.js

Read-only validator for fixture identity second-source URL resolution rows.

Purpose:
- Validate URL resolution rows before any fetch/evidence extraction stage.
- Allow pending/null resolvedUrl rows in draft mode with warnings.
- Enforce strict resolved URL/source metadata when rows are completed.
- Reject resolved URLs that use excluded hosts as the supposed independent source.
- Keep canonical promotion blocked until validated evidence and review decisions exist.

Allowed sourceType values:
- official_league
- official_federation
- official_competition
- official_club
- trusted_provider
- other

Allowed resolvedBy values:
- manual
- external_search
- operator
- diagnostic

Rules:
- resolvedUrl must be valid http(s) when supplied.
- resolvedUrl cannot use an excluded host from the matched resolution task.
- sourceType and resolvedBy are required when resolvedUrl is supplied.
- taskId/searchTargetId/leagueSlug/targetDate must match the resolution task.
- pending/null resolvedUrl is a warning by default and an error with --require-complete.

Guarantees:
- sourceFetch: false
- noFetch: true
- noUrlFetch: true
- noUrlResolutionSideEffects: true
- noReviewDecisionApplied: true
- noCanonicalPromotion: true
- canonicalWrites: 0
- deploySnapshotWrites: false
- valueWrites: false
- detailsWrites: false
- productionWrite: false
- dryRun: true

Example:
node .\engine-v1\jobs\validate-fixture-identity-second-source-url-resolutions-file.js --date 2026-05-22 --input <second-source-url-resolution-tasks.json> --output <validated-url-resolutions.json>
### materialize-fixture-identity-second-source-url-resolution-tasks-file.js

Read-only URL resolution task materializer for fixture identity second-source search targets.

Purpose:
- Consume second-source search target packs.
- Convert flatSearchTargets into structured URL resolution tasks.
- Produce a URL resolution template for a later manual/external-search resolution step.
- Preserve excluded hosts and date-specific evidence policy.
- Keep canonical promotion blocked until validated evidence exists.

Guarantees:
- sourceFetch: false
- noFetch: true
- noUrlFetch: true
- noUrlResolutionSideEffects: true
- noReviewDecisionApplied: true
- noCanonicalPromotion: true
- canonicalWrites: 0
- deploySnapshotWrites: false
- valueWrites: false
- detailsWrites: false
- productionWrite: false
- dryRun: true

Example:
node .\engine-v1\jobs\materialize-fixture-identity-second-source-url-resolution-tasks-file.js --date 2026-05-22 --input <second-source-search-targets.json> --output <second-source-url-resolution-tasks.json>

Important:
- This job does not search the web.
- This job does not resolve or fetch URLs.
- Resolved URLs must come from a later explicit/manual/external-search resolution step.
- Absence of search results is not a valid no-fixture confirmation.
### materialize-fixture-identity-second-source-search-targets-file.js

Read-only search target materializer for fixture identity second-source/calendar confirmation tasks.

Purpose:
- Consume second-source/calendar confirmation tasks.
- Produce one search target task per league.
- Flatten suggested queries into search target rows.
- Preserve checked-source host exclusion so the same source cannot be the only confirmation.
- Prepare the next diagnostic stage for URL resolution/search automation.

Guarantees:
- sourceFetch: false
- noFetch: true
- noUrlFetch: true
- noReviewDecisionApplied: true
- noCanonicalPromotion: true
- canonicalWrites: 0
- deploySnapshotWrites: false
- valueWrites: false
- detailsWrites: false
- productionWrite: false
- dryRun: true

Example:
node .\engine-v1\jobs\materialize-fixture-identity-second-source-search-targets-file.js --date 2026-05-22 --input <second-source-confirmation-tasks.json> --output <second-source-search-targets.json>

Important:
- This job does not search the web.
- This job does not resolve or fetch URLs.
- Absence of search results is not a valid no-fixture confirmation.
- Same checked-source host is excluded as the only confirmation source.
### validate-fixture-identity-second-source-confirmation-review-file.js

Read-only validator for manual second-source/calendar confirmation review drafts.

Purpose:
- Validate manual review rows produced from fixture identity second-source confirmation tasks.
- Allow pending/null decisions during draft mode with warnings.
- Enforce strict requirements for completed decisions.
- Prevent unsafe promotion from ambiguous or incomplete evidence.

Allowed decisions:
- confirmed_no_fixture_on_target_date
- found_target_date_fixture
- insufficient_evidence

Decision rules:
- confirmed_no_fixture_on_target_date requires at least one confirmationSourceUrl, reviewerNotes, targetDateFixtureCount = 0, and no targetDateFixtureRows.
- found_target_date_fixture requires at least one confirmationSourceUrl, targetDateFixtureCount > 0, and targetDateFixtureRows with date/homeTeam/awayTeam/sourceUrl.
- insufficient_evidence requires reviewerNotes and must not include targetDate fixture rows.
- empty/null decisions are warnings by default and errors with --require-complete.

Guarantees:
- sourceFetch: false
- noFetch: true
- noUrlFetch: true
- noReviewDecisionApplied: true
- noCanonicalPromotion: true
- canonicalWrites: 0
- deploySnapshotWrites: false
- valueWrites: false
- detailsWrites: false
- productionWrite: false
- dryRun: true

Example:
node .\engine-v1\jobs\validate-fixture-identity-second-source-confirmation-review-file.js --date 2026-05-22 --input <manual-review-draft.json> --output <validation.json>
### build-fixture-identity-second-source-confirmation-tasks-file.js

Read-only second-source/calendar confirmation task materializer for fixture identity rows where a checked source had no target-date fixture rows.

Purpose:
- Consume a checked_source_no_target_date fixture identity pack.
- Optionally join prepared source evidence rows for the checked source.
- Build one confirmation task per league.
- Produce suggested queries and a manual review decision template.
- Keep canonical fixture promotion blocked until independent date-specific confirmation exists.

Guarantees:
- sourceFetch: false
- noFetch: true
- noUrlFetch: true
- noReviewDecisionApplied: true
- noCanonicalPromotion: true
- canonicalWrites: 0
- deploySnapshotWrites: false
- valueWrites: false
- detailsWrites: false
- productionWrite: false
- dryRun: true

Example:
node .\engine-v1\jobs\build-fixture-identity-second-source-confirmation-tasks-file.js --date 2026-05-22 --input <checked-source-no-target-date-pack.json> --evidence <source-evidence.json> --output <second-source-confirmation-tasks.json>

Important:
- This job does not fetch URLs.
- This job does not confirm no-fixture by absence alone.
- confirmed_no_fixture_on_target_date requires independent date-specific second-source/calendar evidence.
- found_target_date_fixture must flow into match-level fixture identity extraction and validation before any guarded writer.
### prepare-verified-fixture-identity-rows-from-second-source-confirmation-review-file.js

Read-only adapter from validated second-source confirmation review rows into fixture identity rows consumed by the verified fixture identity validator.

Purpose:
- Consume validated/manual second-source confirmation review drafts where the decision is `found_target_date_fixture`.
- Convert targetDateFixtureRows into validator-compatible preparedFixtureIdentityRows.
- Preserve fixture identity fields: leagueSlug, teams, localDate, localTime, sourceUrl, source type, venue, source snapshot id, and review notes.
- Set validator-compatible `evidenceState: fixture_identity_candidate_prepared`.
- Prepare rows for `validate-verified-fixture-identity-rows-file.js`, then promotion readiness diagnostics and dry-run promotion planning.

Rules:
- Only `found_target_date_fixture` review rows can produce prepared fixture identity rows.
- Incomplete fixture identity rows are rejected into rejectedReviewRows.
- This job does not fetch URLs.
- This job does not apply review decisions.
- This job does not write canonical fixtures.
- This job does not promote fixture truth.
- This job does not create deploy snapshots, value output, details, history, or production fixture data.

Guarantees:
- sourceFetch: false
- noFetch: true
- noUrlFetch: true
- noReviewDecisionApplied: true
- noCanonicalPromotion: true
- canonicalWrites: 0
- productionWrite: false
- dryRun: true

Example:
node .\engine-v1\jobs\prepare-verified-fixture-identity-rows-from-second-source-confirmation-review-file.js --date 2026-05-31 --input <validated-confirmation-review.json> --output <prepared-fixture-identity-rows.json>

Important:
- Prepared rows must still pass `validate-verified-fixture-identity-rows-file.js`.
- Promotion readiness must still be evaluated separately.
- A dry-run promotion plan is still not a canonical writer.
- Any canonical writer remains a separate guarded layer and is not enabled by this adapter.

### build-verified-fixture-acquisition-promotion-plan-file.js

Read-only dry-run promotion planner for verified fixture acquisition rows. Promotion plan rows must be present in the separate fixture identity promotion readiness diagnostic as `promotionReadyFixtureIdentityRows`; validated fixture identity rows alone are not sufficient for canonical promotion planning.

Purpose:
- Consume validFixtureIdentityRows from the fixture identity validator.
- Optionally consume verified fixture acquisition proposal rows.
- Build proposedCanonicalFixtureRows with dry-run writeTarget paths.
- Preserve source evidence: provider, sourceUrl, sourceSnapshotId, sourceMatchId, validation input, and proposal input.
- Keep blocked proposal rows separate when fixture identity is still missing or deploy snapshot already has fixtures.

Guarantees:
- sourceFetch: false
- noFetch: true
- noUrlFetch: true
- noReviewDecisionApplied: true
- noCanonicalPromotion: true
- canonicalWrites: 0
- deploySnapshotWrites: false
- valueWrites: false
- detailsWrites: false
- productionWrite: false
- dryRun: true

Example:
node .\engine-v1\jobs\build-verified-fixture-acquisition-promotion-plan-file.js --date 2026-05-22 --input <fixture-identity-validation.json> --readiness <fixture-identity-promotion-readiness.json> --proposals <verified-fixture-acquisition-proposals.json> --output <verified-fixture-acquisition-promotion-plan.dry-run.json>
- validate-verified-fixture-acquisition-promotion-plan-file.js: read-only validator for verified fixture acquisition promotion plans; checks dry-run guarantees, expected counts, proposed fixture identity shape, write targets, source evidence, duplicate fixture keys, and blocked/proposed separation; canonicalWrites: 0, no fetch, no production write.
- write-verified-fixture-acquisition-from-promotion-plan-file.js: guarded writer for verified fixture acquisition promotion plans; dry-run by default, validates promotion-plan guarantees, blocks --apply without --allow-production-writes, supports sandbox-output-root smoke writes, and writes only data/canonical-fixtures/YYYY-MM-DD/<league>.json when explicitly allowed; no fetch, no deploy snapshot write, no value/details/final-result writes.
- verify-canonical-fixture-snapshot-source-readiness-file.js: read-only verifier that checks canonical fixture date files, expected promoted leagues/fixture counts, fixtures.json day count, and whether snapshot export would choose canonical_fixtures; no fetch, no canonical/deploy/value/details/final-result writes.

Important:
- This job does not write canonical fixtures.
- This job does not promote fixture truth.
- This job only creates a dry-run plan.
- A later writer must require explicit apply flags and consume only reviewed proposedCanonicalFixtureRows.

### validate-verified-fixture-identity-rows-file.js

Read-only validator for prepared match-level fixture identity rows.

Purpose:
- Consume preparedFixtureIdentityRows from the fixture identity extractor diagnostic.
- Validate leagueSlug, teams, target localDate, localTime, provider, sourceUrl, sourceSnapshotId, sourceMatchId, and duplicate keys.
- Optionally check that leagueSlug belongs to proposal rows blocked by missing_match_level_fixture_identity_rows.
- Split rows into validFixtureIdentityRows and rejectedFixtureIdentityRows.

Guarantees:
- sourceFetch: false
- noFetch: true
- noUrlFetch: true
- noReviewDecisionApplied: true
- noCanonicalPromotion: true
- canonicalWrites: 0
- deploySnapshotWrites: false
- valueWrites: false
- detailsWrites: false
- productionWrite: false

Example:
node .\engine-v1\jobs\validate-verified-fixture-identity-rows-file.js --date 2026-05-22 --input <fixture-identity-candidates.json> --proposals <verified-fixture-acquisition-proposals.json> --output <fixture-identity-validation.json>

Important:
- This job does not write canonical fixtures.
- This job does not promote fixture truth.
- This job only validates candidate identity rows.
- A later guarded writer must require explicit apply flags and consume only validFixtureIdentityRows.

### prepare-verified-fixture-identity-rows-from-source-snapshots-file.js

Read-only match-level fixture identity extractor from fetched source snapshots.

Purpose:
- Consume fetched fixture external-active source snapshots.
- Optionally filter to proposal rows blocked by missing_match_level_fixture_identity_rows.
- Extract candidate match-level identity rows: leagueSlug, teams, source match id, local date/time, source URL, provider, and extraction method.
- Keep only exact target-date prepared rows as ready candidates.
- Move outside-target-date or ambiguous rows to review state.

Guarantees:
- sourceFetch: false
- noFetch: true
- noUrlFetch: true
- noReviewDecisionApplied: true
- noCanonicalPromotion: true
- canonicalWrites: 0
- deploySnapshotWrites: false
- valueWrites: false
- detailsWrites: false
- productionWrite: false

Example:
node .\engine-v1\jobs\prepare-verified-fixture-identity-rows-from-source-snapshots-file.js --date 2026-05-22 --proposals <verified-fixture-acquisition-proposals.json> --inputs "<snapshot-a.json>;<snapshot-b.json>" --output <fixture-identity-candidates.json>

Important:
- This job does not write canonical fixtures.
- This job does not promote fixture truth.
- This job does not create deploy snapshots.
- Prepared rows must pass a separate identity validator before any guarded canonical acquisition writer is considered.

### build-verified-fixture-acquisition-proposals-file.js

Read-only proposal builder for verified fixture acquisition gaps.

Purpose:
- Consume a fixture active-gap acquisition priority report.
- Produce guarded fixture acquisition proposals for canonical acquisition gaps.
- Keep canonical fixture writes blocked until match-level fixture identity rows exist.

Guarantees:
- sourceFetch: false
- canonicalWrites: 0
- deploySnapshotWrites: false
- valueWrites: false
- detailsWrites: false
- productionWrite: false

Example:

node .\engine-v1\jobs\build-verified-fixture-acquisition-proposals-file.js --date 2026-05-22 --input .\data\football-truth\_diagnostics\fixture-acquisition-stability\2026-05-22.fixture-active-gap-acquisition-priority.json --output .\data\football-truth\_diagnostics\fixture-acquisition-stability\2026-05-22.verified-fixture-acquisition-proposals.json

Important:
- This job does not create canonical fixture rows by assumption.
- League-level verified activity is not enough for production writes.
- Concrete canonical rows require match-level identity evidence: home team, away team, kickoff time, and source URLs.
- A later guarded writer must require explicit --apply --allow-production-writes.

### build-uefa-league-coverage-contract-file.js

Read-only UEFA league coverage contract diagnostic for Fixture Acquisition V2.

Purpose:
- Check the UEFA 55-country coverage contract against workers/_shared/leagues-coverage.js.
- Verify that every UEFA country has a declared first division and second division coverage slug.
- Separate season/watch coverage from date-active acquisition gaps.
- Report verified active first-division leagues missing from the day snapshot.
- Report first divisions still unreviewed for the given date.
- Report first divisions covered in the registry but not represented in the given review pack.

Typical usage:


Output highlights:
- uefaCountryCountExpected
- coveredFirstDivisionCount
- missingFirstDivisionCountries
- coveredSecondDivisionCount
- todayFirstDivisionSnapshotGaps
- todayFirstDivisionUnreviewed
- todayFirstDivisionNotInReviewPack
- reviewRowsWithoutCoverage
- duplicateCoverageSlugs

Guarantees:
- sourceFetch: false
- canonicalWrites: 0
- valueWrites: false
- detailsWrites: false
- productionWrite: false

Important:
- This job does not prove fixture activity by fetching sources.
- verified_active still requires separately reviewed date-specific evidence.
- A league not in the review pack is not missing from coverage; it is treated as season-watch-only for that date.
- The job writes only the requested diagnostic output file.

### build-fixture-active-gap-acquisition-priority-file.js

Read-only priority diagnostic for verified active fixture acquisition gaps.

Purpose:
- Analyze verified active leagues that are marked missing from the day snapshot.
- Check whether each gap is present in coverage, canonical fixtures, and deploy snapshot fixtures.
- Classify the likely failure stage for each gap.
- Prioritize acquisition repair work without writing production data.

Typical usage:


Output highlights:
- inputGapCount
- inCoverageCount
- canonicalPresentCount
- canonicalMissingCount
- snapshotPresentCount
- snapshotMissingCount
- byStage
- byPriority
- priorityRows

Failure stages:
- coverage_registry_missing
- canonical_acquisition_missing
- deploy_snapshot_missing_for_date
- snapshot_export_or_filter_missing
- partial_snapshot_fixture_gap
- no_gap_detected_in_available_local_or_ref_data

Guarantees:
- sourceFetch: false
- canonicalWrites: 0
- deploySnapshotWrites: false
- valueWrites: false
- detailsWrites: false
- productionWrite: false

Important:
- This job does not fetch external sources.
- This job does not write canonical fixtures or deploy snapshots.
- verified_active must come from separately reviewed source evidence.
- canonical_acquisition_missing means the league is covered and externally verified active, but no local canonical fixture rows were found for that date.

### build-fixture-identity-second-source-remediation-summary-file.js

Read-only diagnostic summarizer for fixture identity second-source remediation. It consumes controlled fetched source snapshots, prepared external-active source evidence, and prepared/needs-review fixture identity rows, then emits a league-level remediation action list.

It does not fetch URLs, apply review decisions, promote canonical fixture identity, or write deploy/value/details outputs.

Guarantees: canonicalWrites=0, productionWrite=false, deploySnapshotWrites=false, valueWrites=false, detailsWrites=false, dryRun=true.

Example command:


### build-fixture-identity-second-source-remediation-confirmation-tasks-file.js

Read-only adapter from fixture identity second-source remediation summary rows into confirmation task rows consumed by the existing second-source search-target materializer.

It consumes a remediation summary with remediationRows and emits confirmationTasks with pending_second_source_or_calendar_confirmation state, canonicalPromotionState blocked, checkedSource/sourceEvidence metadata, and excluded source hosts.

It does not fetch URLs, apply review decisions, promote canonical fixture identity, or write deploy/value/details outputs.

Guarantees: canonicalWrites=0, productionWrite=false, deploySnapshotWrites=false, valueWrites=false, detailsWrites=false, dryRun=true.

Example command:

node .\engine-v1\jobs\build-fixture-identity-second-source-remediation-confirmation-tasks-file.js --date 2026-05-22 --input <second-source-remediation-summary.json> --output <second-source-remediation-confirmation-tasks.json>

### Current fixture acquisition direction

Current direction is provider-agnostic autonomous fixture acquisition.

Use this chain as the active fixture acquisition discovery path:

1. build-fixture-league-date-autonomous-source-discovery-workset-file.js
2. build-fixture-league-date-autonomous-source-candidate-targets-file.js
3. collect-fixture-league-date-autonomous-search-results-file.js
4. validate-fixture-league-date-autonomous-search-results-file.js
5. rank-fixture-league-date-autonomous-search-results-file.js

Rules:

- Search is fail-closed by default.
- Web search requires explicit --allow-search.
- No manual candidate URL sheets as the main solution.
- No BetExplorer-specific or single-provider acquisition path as the main solution.
- No canonical writes.
- No production fixture writes.
- No source URL fetch inside the search collector.
- Controlled fetch/evidence/identity comes only after relevant ranked autonomous candidates.

Legacy fixture acquisition detours removed from this file and from jobs:

- fixture league-date source discovery review-sheet jobs
- acquisition analyst manual review/promotion jobs
- manual candidate URL seed application jobs

If historical diagnostics are needed, use git history. Do not reintroduce these as the active direction.

## Autonomous fixture acquisition and identity diagnostics

Read-only provider-agnostic fixture acquisition path. This chain is diagnostic only until a separate guarded promotion layer exists.

Pipeline:

    build-fixture-league-date-autonomous-source-discovery-workset-file.js
    -> build-fixture-league-date-autonomous-source-candidate-targets-file.js
    -> collect-fixture-league-date-autonomous-search-results-file.js
    -> validate-fixture-league-date-autonomous-search-results-file.js
    -> rank-fixture-league-date-autonomous-search-results-file.js
    -> fetch-fixture-league-date-autonomous-ranked-candidate-snapshots-file.js
    -> classify-fixture-league-date-source-candidate-snapshots-file.js
    -> extract-fixture-league-date-source-candidate-evidence-file.js
    -> prepare-verified-fixture-identity-rows-from-source-snapshots-file.js
    -> verify-fixture-identity-candidates-file.js
    -> evaluate-fixture-identity-promotion-readiness-file.js

### build-fixture-league-date-autonomous-source-discovery-workset-file.js

Builds league/date autonomous fixture source discovery worksets from inventory rows.

Guarantees:
- no search
- no fetch
- canonicalWrites: 0
- no canonical promotion
- no fixture/history/value/details writes

### build-fixture-league-date-autonomous-source-candidate-targets-file.js

Materializes autonomous search targets for official league, federation, club, and trusted listing candidates.

Guarantees:
- no fetch
- no invented source URLs
- canonicalWrites: 0
- no canonical promotion
- no fixture/history/value/details writes

### collect-fixture-league-date-autonomous-search-results-file.js

Collects autonomous web search results only when explicitly allowed.

Guarantees:
- search is blocked unless --allow-search is explicitly passed
- no source URL fetch
- canonicalWrites: 0
- no canonical promotion
- no fixture/history/value/details writes

### validate-fixture-league-date-autonomous-search-results-file.js

Validates autonomous search results. Rejects generic country, encyclopedia, tourism, government, and off-target competition pages. Supports competition aliases and multilingual fixture/calendar signals.

Guarantees:
- no fetch
- no canonical promotion
- canonicalWrites: 0
- no fixture/history/value/details writes

### rank-fixture-league-date-autonomous-search-results-file.js

Ranks validated autonomous fixture source candidates into rankedCandidateUrlRows.

Guarantees:
- no fetch
- no canonical promotion
- canonicalWrites: 0
- no fixture/history/value/details writes

### fetch-fixture-league-date-autonomous-ranked-candidate-snapshots-file.js

Controlled ranked-candidate source snapshot fetch diagnostic.

Input:
- rankedCandidateUrlRows

Output:
- fetchedSourceSnapshots

Guarantees:
- fetch is blocked unless --allow-fetch is explicitly passed
- fetches only supplied ranked candidate URLs
- no manual candidate URLs
- no invented URLs
- no review decision applied
- no canonical promotion
- canonicalWrites: 0
- productionWrite: false
- no fixture/history/value/details writes

### classify-fixture-league-date-source-candidate-snapshots-file.js

Classifies fetched fixture source candidate snapshots. Supports embedded __NEXT_DATA__ fixture evidence from official pages such as Pro League/Jupiler Pro League.

Output includes diagnostic candidate classifications only.

Guarantees:
- no fetch
- no canonical promotion
- canonicalWrites: 0
- productionWrite: false
- no fixture/history/value/details writes

### extract-fixture-league-date-source-candidate-evidence-file.js

Extracts fixture evidence rows from fetched source snapshots, including embedded __NEXT_DATA__ match arrays with homeTeam, awayTeam, date, time, and competition.

Output remains candidate evidence and needs downstream identity verification.

Guarantees:
- no fetch
- no canonical promotion
- canonicalWrites: 0
- productionWrite: false
- no fixture/history/value/details writes

### prepare-verified-fixture-identity-rows-from-source-snapshots-file.js

Prepares fixture identity candidate rows from fetched source snapshots. Supports official embedded __NEXT_DATA__ match rows and keeps date guards active.

Behavior:
- target-date complete rows become preparedFixtureIdentityRows
- outside-date or incomplete rows become needsReviewFixtureIdentityRows
- rejected snapshots are diagnostic only

Guarantees:
- no fetch
- no verified production decision
- no canonical promotion
- canonicalWrites: 0
- productionWrite: false
- no fixture/history/value/details writes

### verify-fixture-identity-candidates-file.js

Read-only fixture identity verification diagnostic.

Input:
- preparedFixtureIdentityRows
- needsReviewFixtureIdentityRows

Output:
- verifiedFixtureIdentityRows
- needsSecondSourceFixtureIdentityRows
- needsReviewFixtureIdentityRows

Current diagnostic policy:
- target-date candidate from known official league host can become verified_fixture_identity_diagnostic
- target-date candidate from one non-official host requires independent second source
- outside-date or incomplete candidates remain review rows
- this is not canonical promotion

Guarantees:
- no canonical promotion
- canonicalWrites: 0
- productionWrite: false
- no fixture/history/value/details writes

### evaluate-fixture-identity-promotion-readiness-file.js

Read-only fixture identity promotion readiness diagnostic.

Input:
- verifiedFixtureIdentityRows
- needsSecondSourceFixtureIdentityRows
- needsReviewFixtureIdentityRows

Output:
- promotionReadyFixtureIdentityRows
- promotionBlockedFixtureIdentityRows
- needsSecondSourceFixtureIdentityRows
- needsReviewFixtureIdentityRows

Current diagnostic policy:
- verified diagnostic identity is not automatically promotion-ready
- single official league source is blocked until independent second-source confirmation exists
- non-official sources require official confirmation or a stronger explicit policy
- promotion-ready rows still do not write canonical fixtures
- any future canonical writer must be a separate guarded promotion layer

Guarantees:
- no canonical promotion
- no writer
- writerAllowedCount: 0
- canonicalWrites: 0
- productionWrite: false
- no fixture/history/value/details writes
Do not replace this path with manual URL sheets, single-provider fixture dependency, or legacy feed detours. The next stage after promotion readiness diagnostics is a separately guarded canonical promotion plan, not a direct writer.
