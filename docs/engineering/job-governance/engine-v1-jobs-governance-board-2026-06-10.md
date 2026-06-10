# Engine v1 Jobs Governance Board — 2026-06-10

This board exists to stop uncontrolled job sprawl. It is not an execution plan and does not authorize fetches, searches, or canonical writes.

## Summary

| Decision | Count |
|---|---:|
| QUARANTINE_DO_NOT_RUN_DIRECTLY | 144 |
| REVIEW_OR_DEPRECATE | 62 |
| KEEP_WITH_PROVIDER_REGISTRY | 25 |
| KEEP_CORE | 23 |
| DIAGNOSTIC_ONLY | 11 |
| SCHEMA_SPECIFIC_REVIEW_BEFORE_USE | 7 |
| REVIEW_PROVIDER_NORMALIZER | 1 |
| REVIEW_CORE_CANDIDATE | 1 |

## Rules

- Do not create new jobs until the governance board is reviewed.
- Do not run QUARANTINE_DO_NOT_RUN_DIRECTLY jobs manually.
- Do not use schema-specific promotion builders outside their exact input contract.
- Provider normalizers must be registered in Provider Contract Registry before reuse.
- Diagnostic-only jobs may inform decisions but must not drive production writes.
- Canonical writes require a dry-run report with zero blocked rows and explicit production flags.

## KEEP_CORE

- `engine-v1/jobs/validate-coverage-competition-state-evidence-file.js`
- `engine-v1/jobs/validate-final-result-review-decisions-file.js`
- `engine-v1/jobs/validate-final-result-source-url-resolutions-file.js`
- `engine-v1/jobs/validate-final-result-truth-audit-resolution-review-pack-file.js`
- `engine-v1/jobs/validate-final-result-truth-promotion-plan-file.js`
- `engine-v1/jobs/validate-fixture-identity-second-source-confirmation-review-file.js`
- `engine-v1/jobs/validate-fixture-identity-second-source-url-resolutions-file.js`
- `engine-v1/jobs/validate-fixture-league-date-autonomous-search-results-file.js`
- `engine-v1/jobs/validate-football-truth-season-status-evidence-file.js`
- `engine-v1/jobs/validate-leagues-coverage-contract.js`
- `engine-v1/jobs/validate-player-usage-manual-results-day.js`
- `engine-v1/jobs/validate-standings-evidence-candidates-file.js`
- `engine-v1/jobs/validate-team-news-seeds-day.js`
- `engine-v1/jobs/validate-value-settlement-daily-cycle-output-day.js`
- `engine-v1/jobs/validate-verified-fixture-acquisition-promotion-plan-file.js`
- `engine-v1/jobs/validate-verified-fixture-identity-rows-file.js`
- `engine-v1/jobs/write-competition-state-winner-final-canonical-file.js`
- `engine-v1/jobs/write-coverage-competition-state-winner-final-canonical-dry-run-file.js`
- `engine-v1/jobs/write-final-result-truth-from-promotion-plan-file.js`
- `engine-v1/jobs/write-uefa-fixture-api-promotion-plan-file.js`
- `engine-v1/jobs/write-uefa-standings-promotion-plan-file.js`
- `engine-v1/jobs/write-value-settlement-from-final-results-day.js`
- `engine-v1/jobs/write-verified-fixture-acquisition-from-promotion-plan-file.js`

## KEEP_WITH_PROVIDER_REGISTRY

- `engine-v1/jobs/build-official-route-norway-fixture-evidence-file.js`
- `engine-v1/jobs/build-official-route-table-parser-provider-evidence-file.js`
- `engine-v1/jobs/build-spfl-official-html-standings-evidence-file.js`
- `engine-v1/jobs/build-sportomedia-normalized-fixture-evidence-file.js`
- `engine-v1/jobs/build-sportomedia-normalized-standings-evidence-file.js`
- `engine-v1/jobs/build-uefa-acquired-source-dispatch-board-file.js`
- `engine-v1/jobs/build-uefa-acquired-source-normalization-plan-file.js`
- `engine-v1/jobs/build-uefa-fpf-normalized-rows-file.js`
- `engine-v1/jobs/build-uefa-ksi-tournament-normalized-season-state-file.js`
- `engine-v1/jobs/build-uefa-league-coverage-contract-file.js`
- `engine-v1/jobs/build-uefa-loi-ajax-normalized-rows-file.js`
- `engine-v1/jobs/build-uefa-official-provider-acquisition-batches-file.js`
- `engine-v1/jobs/build-uefa-provider-normalized-fixture-evidence-file.js`
- `engine-v1/jobs/build-uefa-rbfa-normalized-rows-file.js`
- `engine-v1/jobs/build-uefa-semafor-normalized-rows-file.js`
- `engine-v1/jobs/build-uefa-spfl-opta-normalized-rows-file.js`
- `engine-v1/jobs/build-uefa-sportomedia-normalized-rows-file.js`
- `engine-v1/jobs/build-uefa-tier1-provider-acquisition-plan-file.js`
- `engine-v1/jobs/build-uefa-tier1-provider-script-fetch-input-file.js`
- `engine-v1/jobs/build-uefa-tier1-provider-source-page-fetch-input-file.js`
- `engine-v1/jobs/build-uefa-tier1-season-status-extractor-input-file.js`
- `engine-v1/jobs/build-uefa-torneopal-normalized-rows-file.js`
- `engine-v1/jobs/discover-uefa-fixture-api-from-source-snapshot-file.js`
- `engine-v1/jobs/extract-uefa-fixture-api-evidence-file.js`
- `engine-v1/jobs/fetch-uefa-fixture-api-candidates-file.js`

## QUARANTINE_DO_NOT_RUN_DIRECTLY — first 60

- `engine-v1/jobs/apply-coverage-competition-state-validation-overlay-file.js`
- `engine-v1/jobs/apply-football-truth-season-status-calendar-evidence-to-board-file.js`
- `engine-v1/jobs/apply-football-truth-season-status-validation-overlay-file.js`
- `engine-v1/jobs/apply-uefa-tier1-official-route-validation-overlay-file.js`
- `engine-v1/jobs/audit-football-truth-season-calendar-official-route-registry-file.js`
- `engine-v1/jobs/audit-leagues-coverage-contract-file.js`
- `engine-v1/jobs/audit-snapshot-mirror-day.js`
- `engine-v1/jobs/audit-team-news-league-source-map.js`
- `engine-v1/jobs/bootstrap-team-geo-from-wikidata.js`
- `engine-v1/jobs/build-active-league-acquisition-plan-file.js`
- `engine-v1/jobs/build-coverage-competition-state-inventory-file.js`
- `engine-v1/jobs/build-domestic-missing-standings-triage-file.js`
- `engine-v1/jobs/build-final-result-resolved-url-input-template-file.js`
- `engine-v1/jobs/build-final-result-source-url-candidates-from-resolution-batch-file.js`
- `engine-v1/jobs/build-final-result-source-url-resolutions-from-review-pack-file.js`
- `engine-v1/jobs/build-final-result-truth-audit-resolution-batches-file.js`
- `engine-v1/jobs/build-final-result-truth-audit-resolution-review-pack-file.js`
- `engine-v1/jobs/build-final-result-truth-audit-workset-from-inventory-file.js`
- `engine-v1/jobs/build-fixture-acquisition-stability-workset.js`
- `engine-v1/jobs/build-fixture-acquisition-v2-readiness.js`
- `engine-v1/jobs/build-fixture-active-gap-acquisition-priority-file.js`
- `engine-v1/jobs/build-fixture-active-league-map-gap-workset.js`
- `engine-v1/jobs/build-fixture-coverage-reality-day.js`
- `engine-v1/jobs/build-fixture-identity-second-source-confirmation-tasks-file.js`
- `engine-v1/jobs/build-fixture-identity-second-source-controlled-fetch-plan-file.js`
- `engine-v1/jobs/build-fixture-identity-second-source-remediation-confirmation-tasks-file.js`
- `engine-v1/jobs/build-fixture-identity-second-source-remediation-summary-file.js`
- `engine-v1/jobs/build-fixture-league-date-autonomous-source-candidate-targets-file.js`
- `engine-v1/jobs/build-fixture-league-date-autonomous-source-discovery-workset-file.js`
- `engine-v1/jobs/build-fixture-provider-capability-priority-workset.js`
- `engine-v1/jobs/build-fixture-source-discovery-quality-report-file.js`
- `engine-v1/jobs/build-football-truth-finished-offseason-action-split-file.js`
- `engine-v1/jobs/build-football-truth-ft-repair-lane-buckets-file.js`
- `engine-v1/jobs/build-football-truth-ft-repair-with-history-plan-file.js`
- `engine-v1/jobs/build-football-truth-official-route-registry-expansion-plan-file.js`
- `engine-v1/jobs/build-football-truth-operational-readiness-board-file.js`
- `engine-v1/jobs/build-football-truth-season-calendar-official-route-probe-candidates-file.js`
- `engine-v1/jobs/build-football-truth-season-state-easy-first-workset-file.js`
- `engine-v1/jobs/build-football-truth-season-status-authority-map-file.js`
- `engine-v1/jobs/build-football-truth-season-status-bulk-registry-validation-candidates-file.js`
- `engine-v1/jobs/build-football-truth-season-status-league-coverage-summary-file.js`
- `engine-v1/jobs/build-football-truth-season-status-official-registry-coverage-gap-report-file.js`
- `engine-v1/jobs/build-football-truth-season-status-registry-patch-candidates-file.js`
- `engine-v1/jobs/build-football-truth-season-status-search-targets-file.js`
- `engine-v1/jobs/build-football-truth-state-inventory-file.js`
- `engine-v1/jobs/build-football-truth-state-worksets-file.js`
- `engine-v1/jobs/build-global-season-state-fixture-fetch-input-file.js`
- `engine-v1/jobs/build-global-season-state-fixture-search-targets-file.js`
- `engine-v1/jobs/build-global-season-state-inventory-file.js`
- `engine-v1/jobs/build-global-season-state-worksets-file.js`
- `engine-v1/jobs/build-league-season-status-from-standings-file.js`
- `engine-v1/jobs/build-officiating-candidate-template-day.js`
- `engine-v1/jobs/build-player-usage-research-tasks-day.js`
- `engine-v1/jobs/build-same-prefix-missing-standings-materialization-plan-file.js`
- `engine-v1/jobs/build-same-prefix-missing-standings-source-discovery-tasks-file.js`
- `engine-v1/jobs/build-season-aware-routing-coverage-gap-report-file.js`
- `engine-v1/jobs/build-season-final-truth-settlement-readiness-range.js`
- `engine-v1/jobs/build-standings-materialization-plan-from-validated-evidence-file.js`
- `engine-v1/jobs/build-standings-second-source-confirmation-tasks-file.js`
- `engine-v1/jobs/build-team-news-manual-drafts-day.js`

## Next architectural step

Create a Provider Contract Registry and Intelligence Board before running any further acquisition or promotion path.
