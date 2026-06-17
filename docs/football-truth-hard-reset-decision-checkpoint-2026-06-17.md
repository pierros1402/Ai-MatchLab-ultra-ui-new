# Football Truth hard reset decision checkpoint — 2026-06-17

## Repo checkpoint

- Branch: `local-ai-foundation-work`
- Synced commit before this note: `4ae09f0a`
- Last commit: `Add source-agnostic standings discovery v2`
- Canonical writes executed: `0`
- Production writes executed: `0`

## Result of the final Node-only source-agnostic attempt

The old jobs/boards/resolvers were bypassed and a standalone source-agnostic discovery lane was tested.

### v1

- Targets: 67
- Searches: 268
- Fetches: 492
- Raw extracted candidates: 24 competitions / 577 rows
- Quality gate:
  - verified: `esp.1`
  - provisional: `cro.1`
  - review: `eng.3`
  - rejected extracted: 21
  - unresolved: 43

### v2

- Targets: 67
- Searches: 670
- Fetches: 1150
- Canonical writes: 0
- Production writes: 0
- Accepted candidates:
  - verified: `esp.1`, `esp.2`
  - provisional: `cro.1`
  - review: `fin.1`
  - unresolved: 63

## Conclusion

Simple Node search/fetch source-agnostic scraping is insufficient for broad 600+ league Football Truth coverage.

This is not a small tuning issue. The next viable implementation path must use at least one of:

1. Browser-rendered acquisition, such as Playwright, for JavaScript-driven pages.
2. Real search API with stable result extraction and domain controls.
3. Dedicated football data provider contracts/API coverage.
4. Hybrid strategy: provider API for bulk coverage, official/browser-rendered sources for verification, AI for validation/reconciliation/source memory.

## What should stop

- No more diagnostics-only board chains.
- No more tiny single-league probes.
- No more claiming raw extracted candidates as coverage before quality gate.
- No more Node-only source-agnostic scraping as the primary coverage strategy.

## Minimum useful next deliverable

A production-readable standings table:

`competitionSlug, provider, season, teamName, position, played, won, drawn, lost, goalsFor, goalsAgainst, goalDifference, points, sourceUrl, sourceHost, sourceUpdatedAt, qualityGateStatus, validationStatus`

The metric must be coverage, not plans:

- competitions with verified/provisional standings rows
- row count
- source/provider
- validation status
- unresolved reason

## Recommended next lane

Build one of these directly:

- `browser-rendered-standings-acquisition-runner`
- `search-api-backed-source-discovery-runner`
- `provider-contract-standings-ingestion-runner`

This note is intended as handoff context for the next assistant, Claude, or a human developer.
