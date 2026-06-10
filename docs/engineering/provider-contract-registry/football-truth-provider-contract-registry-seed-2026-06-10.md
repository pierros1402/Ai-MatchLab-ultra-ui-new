# Football Truth Provider Contract Registry Seed — 2026-06-10

This is a governance/design manifest. It does not authorize fetches, searches, or canonical writes.

## Rules

- No provider acquisition/search/fetch runner may run unless a provider contract row allows it.
- No promotion adapter may be used outside its exact schema contract.
- Provider normalizers are reusable only when registered here with capability, source job, and promotion path.
- Blocked providers must remain blocked until a contract repair proves normalized rows.
- Canonical writes require known provider contract, dry-run, zero blocked rows, zero plan errors, and explicit production flags.

## Provider Contracts

| Provider | Competitions | Capability status | Promotion status |
|---|---|---|---|
| sportomedia_sweden_official | swe.1, swe.2 | proven_promoted | canonical_written |
| spfl_opta_official | sco.1, sco.2 | partial_promoted_blocked_fixture_identity | standings_written_fixture_blocked |
| loi_ajax_official | irl.1, irl.2 | partial_promoted | canonical_written_partial |
| palloliitto_torneopal_official | fin.1, fin.2, fin.cup | proven_promoted_partial_standings | fixtures_and_cup_winner_written |
| rbfa_official | bel.cup | proven_promoted | canonical_written |
| hns_semafor_official | cro.cup | proven_promoted | canonical_written |
| fpf_portugal_official | por.taca.portugal | blocked | blocked |
| norway_ntf_official | nor.1, nor.2 | normalized_rows_proven_promotion_contract_missing | not_promoted_waiting_generic_official_route_fixture_promotion_contract |
| bundesliga_official | ger.1, ger.2 | normalized_partial_not_promoted | not_promoted |
| laliga_official | esp.1, esp.2 | partial_evidence_not_promoted | not_promoted |
| spfl_challenge_cup_official | sco.challenge | partial_evidence_not_promoted | not_promoted |

## Next Architecture

The next source work must be an intelligence/orchestration layer that consumes this registry. It must produce competition state, missing data, blocked provider, next batch, and promotion readiness boards.

## Hard Stop

Do not run provider acquisition or promotion paths manually outside registry policy.

<!-- norway_ntf_official_2026_06_10_update:start -->
### Norway NTF official-route promotion update — 2026-06-10

Provider: `norway_ntf_official`

Current registry status:
- `capabilityStatus: canonical_written`
- `promotionStatus: canonical_written`
- fixtures/results: `canonical_written_official_route`
- standings: `unknown`
- allowed runner policy: `official_route_fixture_evidence_promoted_guarded_writer_apply_only_after_dry_run`

Promotion result:
- `nor.1`: 240 official-route rows, 89 finished, 151 scheduled.
- `nor.2`: 240 official-route rows, 80 finished, 160 scheduled.
- 130 canonical fixture files written.
- Existing 27 ESPN `nor.1` rows remain as local legacy coverage alongside official rows.
- Promotion used:
  - `engine-v1/jobs/build-official-route-norway-fixture-evidence-file.js`
  - `engine-v1/jobs/build-official-route-fixture-evidence-promotion-plan-file.js`
  - `engine-v1/jobs/write-official-route-fixture-evidence-promotion-plan-file.js`
- The writer was validated with dry-run first, then applied only with explicit `--apply --allow-production-writes`.
<!-- norway_ntf_official_2026_06_10_update:end -->
