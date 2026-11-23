# P0 Daily real-stage source map — 2026-11-23

**Status: SOURCE-ORDER INVENTORY ONLY — NOT PRODUCTION RESUME AUTHORIZATION.**

Pinned baseline: `main` commit `d069fab53dcd7da1c8cd55aaeda467c8b50485a7`; `engine-v1/jobs/run-daily-cycle.js` Git blob `8f539391cc7ad81d45f6f2b69450e4d7bbc608a8` (2,531 lines). This is a read-only source audit. A log marker is **not** a durable completed-stage receipt.

## Observed pipeline boundaries (source line numbers)

| Stage group | Source markers (start–done) | Risk / invalidation observation |
|---|---|---|
| Competition discovery | 640–649 | External discovery; rerun when provider view/time window changes |
| Canonical fixture synchronization | 692–698 | Canonical truth may mutate; no skip without exact identity and input digest proof |
| Active leagues | 710–712 | Derived from canonical fixtures, must bind the fixture universe |
| Standings | 780–787 | Standings refresh at 800–803; freshness and source provenance required |
| History index for Details | 905–912 | Depends on selected historical index and fixture/season semantics |
| H2H foundation for Details | 937–944 | Can be rebuilt; historical truth changes invalidate downstream consumers |
| Details | 956–965 | Requires full fixture, history/H2H, model/input and output manifests |
| Player usage and news | 978–1336 | Multiple external/manual/conditional enrichment paths; not proven reusable |
| Acquisition readiness gate | 1350–1379 | Must run; must not be inferred from prior log |
| Plan A Value | 1398–1409 | Derived statistical Value; bind canonical fixtures and statistical foundations, never odds-based authorization |
| Four-plan settlement bundle | 1415–1493 | May mutate verified-final / settlement state; revalidate on replay |
| Authoritative terminal promotion | 1584–1615 | Mutable terminal truth |
| Final Details synchronization | 1636–1642 | Must reflect promoted terminal truth |
| Deploy snapshot export | 1663–1674 | Cannot authorize publication without full freshness and truth gates |
| Finalization / historical work | 1733–2246 | Mutates prior-day truth/history and can invalidate earlier foundations |
| H2H rebuild | 2273–2279 | Occurs after history changes |
| Final standings foundation | 2301–2313 | Revalidate after history/catch-up |
| Final model priors | 2338–2347 | Revalidate after final standings |

**Important non-paired markers:** broken-league recovery (683), invariant check (1685), league-gap report (1700), history append (1941), history report (1950), history catch-up (2201) and CLI done (2479) cannot be counted as start/done checkpoint stages.

## Provisional dependency and invalidation chain

`competition discovery → canonical fixture sync → active leagues → standings / history index / H2H → details → acquisition readiness → statistical Value → settlement + terminal promotion → final details → deploy snapshot`.

A second downstream sequence is `live status refresh → truth sweep → final terminal promotion → canonical sync → finalization readiness → previous-day value/finalization → history append + catch-up → index rebuild → H2H rebuild → final standings → model priors`.

These arrows describe **observed source ordering and potential invalidation**, not a complete formal DAG. The workflow itself has additional independent steps after `run-daily-cycle.js`: artifact freshness, Value publication gate, Day Truth Ledger, consistency/publication checks, commit and public verification. None is optional on resume.

## Missing per-stage evidence before production reuse

For every stage: exact program/source SHA and configuration; day key and fixture universe; upstream input paths **and byte SHA-256**; output set including deletions and empty states; output hashes; provider timestamp, TTL and capture provenance where applicable; branch/condition decisions; validated stage completion receipt; idempotency and side-effect replay policy; upstream invalidation propagation; runner-independent archive and signature/trust policy. An input set not exhaustively captured is **NOT_REUSABLE**.

External, mutable, conditional, gate and publication stages default to **EXECUTE / REVALIDATE**, not `RESTORED_VERIFIED`. No historical result is inferred from a log marker. A failed or partial stage is never a valid checkpoint.

## Rollout gates

1. Audit **all** source branches, file read/write paths, and additional workflow steps; produce a complete typed stage DAG (not just this map).
2. Build exact per-stage manifests and recursive invalidation/freshness checks; enforce fail-closed archive restoration and no unsafe overwrite.
3. Verify interrupted executions on separate clean runners with current production-equivalent inputs; compare byte-level output and publication equivalence against uninterrupted runs.
4. Require all existing publish/truth/identity/freshness gates to pass, including replay after mutation of older history.
5. Enable through an explicitly gated, reversible production PR only after documented independent evidence. Do not start a second Daily or claim today's live run can retroactively use this mechanism.

**No runtime behavior, fixture data, odds, Value calculations, identity decisions, workflow dispatch, publication, or production resume flag is changed by this document.** Issue #178 remains OPEN.
