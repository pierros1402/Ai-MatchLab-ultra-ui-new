# AI MATCHLAB ULTRA — R04 implementation checkpoint

## Latest verified continuation (28/11/2026, Europe/Athens)

- PR #375 MERGED: `4502bd8eec05ca50552ffc573088dec30717a2c0`, full engine 3599/3599 PASS.
- PR #376 MERGED: `50ee43f8c4b4243d0c044cfed9a7a2fa4774d7b1`, 234 native pairs in 80 files, full engine 3604/3604 PASS. Independent real-day audit confirmed issue count 403 → 169.
- PR #377 MERGED: `3c13cad62402b729f01a3657965fc659abb991e6`, 77 original-final fixture bindings + 2 approved native pairs; full engine 3613/3613 PASS. Provider fixture namespaces survive ESPN refreshes, and persisted links retain lineage so they cannot become new original identity seeds.
- PR #378 OPEN. Original source `c603614f6287d61e49ea16480ec8bc6eeb5a332e` passed 3617/3617 and all checks. Merge was stopped by pre-merge canonical SHA drift. Metadata was reapplied to newer main `9acfc981f3d5f86507d1c83ed2eeaa3cde69e1cc`, preserving all newer scores/status, source metadata, row membership/order and prior provider/native IDs. Current rebased source: `161d96220b77fd468269b81f0241fef349b90545`; rerun CI is required before merge.
- Read 823 historical canonical revisions with zero read failures. All 81 missing IDs had earlier explicit provider bindings. Eighty match current canonical + primary ESPN lineage. The last one is the already removed AmaZulu–Milford event and must NOT be recreated.
- PR #378 restores 89 metadata records in 22 files: 80 previous fixture bindings + 9 native pairs. Its static identity evidence artifact retains 90 immutable source commit/path/blob/row records, including AmaZulu only for strict other-day exclusion proof.
- New concurrent French canonical reconciliation removed Biesheim–Racing Besançon (401934504) for authoritative event day 29/11; its independent discovery fixture already belongs to 29/11. Preserve this removal. French metadata also contains a separate identity-rejected event 401934486: wrongDayMatches=2, removed=1, rejected=1. Existing aggregate publication authorization correctly rejects a mixed batch. Any permanent fix must use per-event verified-removal evidence, never relax identity checks.
- Intraday #11476 / run 46180680156 writer now shows CANCELLED. No second Daily was started. Recheck current workflow state before dispatching work.
- Direct kickoff audit run 46188571313 / artifact 15281091060 captured real primary evidence:
  - French AS Etoile Matoury–Fleury (401934501): exact ESPN event/native sides + independent feed agree 18:30Z; canonical is 14:30Z.
  - Bolivia ABB–Real Tomayapo (401930026): exact ESPN event/native sides confirm canonical 02:00Z; Flashscore reports 00:00Z. Keep primary truth and expose the secondary discrepancy.
  - Tunisia PS Sakiet Eddaier–Stade Tunisien (bmLfV26c): exact Flashscore match page, native side IDs, tournament and common_feed.DC agree with the independent feed at 12:00Z; canonical is 13:00Z.
- An exact kickoff parser/validator was implemented and tested locally (3/3 PASS, plus validation of the captured real Flashscore page). Files `engine-v1/core/exact-provider-kickoff-evidence.js` and its test were NOT committed before the execution environment became unavailable. Reconstruct/commit them from the recorded implementation and verify through GitHub CI; do not claim a kickoff correction has already been applied.
- The local execution environment became unavailable; GitHub connector and GitHub Actions remain operational. Continue through those services; no evidence of lost GitHub authorization.
- R04 draft #374 remains OPEN. It has 20 focused identity coverage tests, uses the existing strict authoritative wrong-day collector for legal exclusion, and has a 255-node/805-edge source graph. Last source-only reconciliation verified zero canonical-data differences against its main base. Future reconciliation must overlay only explicitly R04-owned paths, never all historical differences from the original base, so newer main canonical data and merged CLI fixes remain intact.

Next: finish PR #378 against current main with all checks green; capture/apply exact primary-backed kickoff corrections without changing frozen selections/status; keep a reasoned warning for the independently contradicted secondary timetable; handle mixed wrong-day batches with per-event proof; obtain fresh actual identity/readiness/health/publication evidence before closing R04.

---


Date: 28 November 2026. Timezone: Europe/Athens.

## Verified baseline

- Main source/data head at start: `882f45e15591fe00ad98acb4004fb63dbd390627`.
- Intraday #11475 succeeded (run 46179800202); #11476 was active at initial inspection. No Daily or Intraday was started by this work.
- PR #372 already merged wrong-day evidence retention, merge SHA `e93837c63b75c2f236d9a43a57ee72a8c06fa536`. Do not repeat that implementation.
- PR #373 restored the original competition discovery artifact. The existing artifact is a competition/count contract, not the new fixture identity ledger.
- System Health last available in main was generated at 2026-11-28T18:50:03.289Z, with 6 errors, 5 warnings and 9 informational issues. Do not label all historical P0 signals resolved from a successful workflow alone.

## Real source changes

PR #374: https://github.com/pierros1402/Ai-MatchLab-ultra-ui-new/pull/374

Branch: `feat/r04-provider-fixture-identity-20261128`.

Implementation source head: `915e27e4d611602569de826c7b68380dc6d0cd26`.

- Full versioned per-fixture discovery ledger, including every observation, native provider team IDs, eligibility, exclusions, and a hash binding the ledger.
- Exact namespaced provider fixture reconciliation across canonical, publication and details; explicit diagnostics for missing/ambiguous bindings, duplicates, wrong day/league, home-away conflicts, unknown team identity, unexpected publication and missing details.
- Count cross-check on the identity ledger; aggregate count equality never grants proof.
- Coverage-readiness and actionable System Health integration.
- Read-only independent provider audit workflow with current Athens-day sparse checkout and source SHA binding.
- Stage20 static source graph rebound to 254 nodes and 803 edges. Source/custody protections remain enabled.
- 38 targeted local tests passed: 17 identity tests, 8 discovery tests, 8 acquisition tests and 5 league classification tests.

PR #375 isolates the safe producer correction:
https://github.com/pierros1402/Ai-MatchLab-ultra-ui-new/pull/375

Branch: `fix/r04-flashscore-native-team-retention-20261128`.
Source SHA: `a93ae61d183e120085ee29d163863c0ffa6b452e`.

The Flashscore adapter dropped native team IDs and the canonical serializer allowed only ESPN IDs. Both paths now retain Flashscore IDs. Conflicting native IDs are quarantined and cannot be resurrected by a later refresh. Missing evidence does not erase prior IDs. This PR does not activate the stricter R04 readiness contract and does not backfill existing canonical rows.

**PR #375 MERGED**, merge SHA `4502bd8eec05ca50552ffc573088dec30717a2c0`. All six checks passed, including full engine regression **3599/3599 PASS** (run 46184122898) and provider team evidence regression.

**PR #376 MERGED**: https://github.com/pierros1402/Ai-MatchLab-ultra-ui-new/pull/376

Merge SHA / new main: `50ee43f8c4b4243d0c044cfed9a7a2fa4774d7b1`.

- Restored native Flashscore home/away IDs for **234 already-bound fixtures in 80 canonical files**.
- Exact fixture ID, unique canonical binding, league, day, kickoff and ordered team-name agreement were required. Existing approved Flashscore fixture links in ESPN-primary rows could be enriched, without inferring a new fixture link.
- Scores, statuses, kickoff, names, prior provider identities and file truth timestamps were preserved.
- **11 excluded rows**: 9 side-name differences and 2 kickoff differences.
- Excluded kickoff differences: bol.1 ABB–Real Tomayapo (02:00Z canonical / 00:00Z discovery); tun.1 PS Sakiet Eddaier–Stade Tunisien (13:00Z canonical / 12:00Z discovery). No kickoff was changed.
- Five focused planner tests passed; all 80 original canonical file blobs were checked for drift again before merge.
- Full engine regression **3604/3604 PASS** (run 46184964303), and all four other required checks passed.
- Reproducible planner: `tools/plan-native-provider-team-identity-backfill.mjs`. Review ledger: `docs/evidence/r04-20261128/native-team-backfill-review.json`.

PR #374 was reconciled with both merged PRs in merge commit `50537b1f8cf7ee384c81a2269f8bf98aa930cd9d`. Its graph retains the R04 dependency expansion while incorporating the exact same merged acquisition source bytes. Fresh audits now use the actual restored canonical data.

## Independent real-data audit

Run: https://github.com/pierros1402/Ai-MatchLab-ultra-ui-new/actions/runs/46183508465

Artifact: `15278960454`.
ZIP SHA256: `75cd452090f49edc4fcc682da2948765acf0b97254d4a0d9b1c63c7257fd6625`.

Audit source checkout: `730c87616c99b6c2953c0ca3c6da8dccd69a2960` (PR merge checkout).

| Measure | Result |
|---|---:|
| Discovery observations | 4,884 |
| Eligible target-day fixtures | 403 |
| Exact canonical fixture bindings | 245 |
| Bound fixtures missing persisted native team IDs | 245 |
| Missing exact canonical bindings | 158 |
| Competitions with missing bindings | 32 |
| Coverage proof | FAIL |

The workflow completed successfully as an audit. Its report has `ok:false` and `proven:false`. These meanings must never be conflated.

The workflow now includes an explicit final proof gate after evidence upload. Subsequent runs must fail when the report is unproven; operational completion alone is not a passing R04 check.

Missing bindings are NOT proof of 158 absent matches. Many competitions have ESPN canonical coverage without an explicit Flashscore ID binding. Do not create duplicate canonical fixtures or infer bindings from team names/counts.

Largest unbound groups: fra.coupe_de_france 31, sco.tennents 18, eng.2 10, eng.5 10. All 403 issue identities and the 245 exact bindings are preserved in `docs/evidence/r04-20261128/identity-audit-ledger.json`.

## Required continuation

1. Read the new independent identity audit on the reconciled PR #374. The original audit above is a before-repair baseline, not the current error count.
2. Read the cross-provider evidence audit, which reuses the existing two-original-verified-final policy and separately checks the nine existing-binding name differences against approved global identity.
3. Resolve the remaining 11 native identity cases only with authoritative side/kickoff evidence. Do not overwrite kickoff or relax identity policy.
4. Resolve the 158 missing exact bindings using authoritative provider/canonical evidence, separating actual missing fixtures from existing fixtures with missing links.
5. Regenerate current-day discovery with the new versioned fixture ledger before activating its readiness contract. Existing main discovery artifacts do not have that schema.
6. Full engine regression, Stage20 contracts, independent real-day audit, then Daily/Intraday and public Engine/UI verification.
7. Close R04 only when the actual coverage report is proven. Continue the remaining Master Plan afterwards.

PR #374 stays DRAFT pending those data proofs. The metadata backfill above is merged; no public deployment, frozen Value modification or gate bypass occurred in this cycle. No second Daily was started.
