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
- result-evidence-builder.js
- source-reliability.js
- canonical-promotion-gate.js

Jobs should call these modules instead of duplicating truth logic.
