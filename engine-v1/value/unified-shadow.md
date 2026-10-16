# Unified U1: fixed prospective shadow candidate

U1 is a hypothesis, not a certified optimum or replacement for A, A2, B or B2.
Its immutable specification is `unified-u1-spec.json`; changing its rules requires
a new candidate ID and a new prospective period. No historical model is rerun.
The specification pins SHA256 of the selector and capture/settlement modules
(UTF-8 with LF line endings). A code change fails closed until a separately
versioned candidate is declared; it cannot quietly alter this candidate's rules.

## Decision rule

* Statistical family: the same canonical match/market/selection must appear in
  both A and A2, each with a numeric `score >= 0.75`.
* Assessment family: the same selection must appear in B and B2, each with a
  numeric `modelProb >= 0.75`. Their categorical confidence is retained as-is.
* Take the union of eligible families, deduplicating identical selections.
  Opposing selections on the same match and market are all excluded.
* Keep scores separately. U1 does not invent an averaged or calibrated probability.
* Limit markets to OU 2.5, BTTS and 1X2. A missing counterpart is missing evidence
  of a common **selected** market, not an opposite unselected forecast.

The 0.75 floor and paired agreement form one declared prospective hypothesis.
They are not the outcome of a retrospectively optimized composite search. The
threshold, pairing rule and conflicts must stay fixed while results accumulate.

## Capture and retention

Only Athens today or tomorrow is admissible, with target dates starting
2026-10-17. Every selected forecast must have an explicit source time before
capture and kickoff, match the exact canonical fixture and kickoff, and still
be scheduled with at least 60 seconds to kickoff. Late/unknown inputs are rejected
explicitly. Duplicate source selections are all rejected, never cherry-picked.

`data/value-plans/<day>/unified-u1.json` freezes the first structurally successful
capture. It includes the exact UTF-8 bytes/SHA256 of all four forecast files,
companion audits, Plan A producer audit and canonical files, the spec hash,
selector-code hash, eligible baseline rows, decisions and coverage diagnostics.
These paths already participate in allowed data publication and independent
history checkpoints. Exclusive atomic creation prevents replacement. Subsequent
calls verify and retain the first artifact even if upstream forecasts change.

The capture is a new U1 observation of the four available files. It does not
certify that a mutable producer audit belongs to the original Plan A freeze or
recover all unselected forecasts. Full upstream runtime lineage remains explicitly
uncertified. Exact runtime selector evidence is retained separately by PR 80.

Selection status and input coverage are independent. `ZERO_AFTER_DECLARED_FILTERS`
does not certify upstream successful zero picks. Missing canonical files are not
"no matches". Assessment gaps, foundation blocks, unknown accounting and different
canonical universes remain visible. Missing or corrupt sources produce immutable
incident records and no frozen zero-result forecast. Credential fields/query
strings fail capture without printing their values.

The Daily and Intraday workflows call U1 after their normal gates and before
allowed staging. The shadow step is non-blocking for the four active plans;
errors are annotated and its incident files survive final history preservation.
No additional schedule, provider calls, model runs, Render service or UI is added.

## Settlement and review

The same job refreshes versioned aggregate results in the current target day's
`unified-u1-results.json`. Old forecasts are never rewritten. Settlement reads
existing verified final-result files through the established strict guard, and
requires the exact ID, day and kickoff. Duplicate/conflicting finals remain
pending. Canonical non-played states are VOID and excluded from hit rates.

Before counting a forecast, the original Git-addition commit must contain the
same bytes and predate kickoff. A freshly uncommitted capture remains pending
until a later normal job can verify its published bytes. Terminal settlements
are retained; changed/missing truth becomes a reported conflict, not a silent
rewrite. Changed/disappearing forecast artifacts block a shrinking result set.

The aggregate retains U1 and all four captured baselines, different denominators,
partial-input strata and match/day counts. Review requires at least 100 distinct
settled candidate matches and 30 distinct target days; this is a review gate,
not a statistical power guarantee or automatic promotion. There is no automatic
winner certification, model replacement, profitability claim or probability fusion.

Run only inside the durable production workflow:

    HISTORY_PRESERVATION_REQUIRED=1 node engine-v1/jobs/capture-unified-shadow-day.js --date=YYYY-MM-DD

Tests use synthetic 2099 fixtures in temporary directories, including an actual
Git publication check and independent archive/restore. They never run historic
football models or contact a provider.
