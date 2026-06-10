# Football Truth Intelligence Engine Manifest — 2026-06-10

This manifest resets the direction of the work. The goal is not to add more ad-hoc jobs. The goal is to build an intelligence layer that controls acquisition, provider contracts, missing data, and promotion readiness.

## Problem

- The project needs an intelligent football truth layer, not a collection of ad-hoc jobs.
- The engine must know competition state, provider capability, missing data, blocked contracts, and allowed next actions.
- No search/fetch/promotion runner should be used unless the intelligence engine or registry permits it.

## Engine Responsibilities

### Competition State Resolver

Classify each competition as active, completed, upcoming, off-season, blocked, or unknown.


### Provider Capability Resolver

Know which providers can supply fixtures, results, standings, cup winners, and season state.


### Missing Data Board

For every competition, determine what is missing and whether the missing piece is actionable, blocked, or unknown.


### Next Batch Action Planner

Create large batch actions by provider/contract, not league-by-league.


### Promotion Readiness Gate

Allow canonical writes only after verified normalized rows and dry-run success.



## Immediate State From Provider Registry

- Provider count: 11
- Proven/promoted providers: sportomedia_sweden_official, spfl_opta_official, loi_ajax_official, palloliitto_torneopal_official, rbfa_official, hns_semafor_official, norway_ntf_official, bundesliga_official, laliga_official, spfl_challenge_cup_official
- Blocked providers: spfl_opta_official, fpf_portugal_official
- Promotion blocked until generic contract: norway_ntf_official

## Next Build Step

Create a read-only source job only after this manifest is committed:

`engine-v1/jobs/build-football-truth-intelligence-board-file.js`

It must produce:

- competitionStateBoard
- missingDataBoard
- providerContractBoard
- blockedProviderBoard
- nextBatchActionPlan
- promotionReadinessBoard

## Hard Stops

- Do not continue Norway promotion until generic official-route fixture promotion contract exists.
- Do not run DBU/CPL/ANFP probes manually.
- Do not add provider normalizers until provider registry says the contract is actionable.
- Do not create new jobs except the read-only intelligence board builder after this manifest.
