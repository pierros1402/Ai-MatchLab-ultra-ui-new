# July history parity evidence contract

The 2026-11-16 reviewed checkpoint `AIML_HISTORY_REMAINING_RESULT_20261116-073225.zip`
restored canonical evidence that was absent when the original test was written.
For 2026-07-31, accepted facts increased from 1 to 60 and missing-canonical
errors decreased from 101 to 42. Neither change proves the whole day complete.

`july-2026-parity-evidence.json` freezes the actual canonical read view, all
102 final-result documents, the identity resolver responses used for this day,
and source-file SHA-256 provenance. It includes the exact 60 output facts and
42 rejected IDs with their reasons. `rebuiltAt` is fixed at zero. Its byte hash
is pinned in the test; no test regenerates or updates this snapshot.

The test runs the production `buildVerifiedHistoryDay` implementation against
these inputs. Identity decisions are injected from the reviewed snapshot so
later legitimate changes to local history or identity ledgers cannot alter
this historical test case. The real November read-path assertions remain in
place, including the canonical-ID digest, terminal-state counts and retry.

The July contract requires:

- `ok=false` and `history_truth_parity_failed`, exactly 60 unique accepted facts
  and exactly 42 `verified_final_missing_canonical_fixture` errors.
- Equality of every output fact (identity, ordered teams, kickoff, day, season,
  terminal status, score and truth contract), plus every rejected ID/reason.
- All 60 accepted facts journaled, a quarantine containing the exact errors and
  eligible revisions, stable quarantine on retry, and no local history file.
- A changed score or null canonical score rejects that exact accepted ID,
  preserves the other 59 facts and keeps the day on hold.

This separates immutable regression evidence from the changing recovery
inventory. It does not replace the builder with precomputed output, allow a
range of counts, or mark an incomplete day publishable. Synthetic rejection
and journal-integrity tests elsewhere in the suite remain unchanged.

To intentionally revise the evidence, review the source documents and identity
decisions first, run `node tools/history/capture-july-parity-test-evidence.mjs`,
inspect the input/output diff and provenance, then explicitly review the digest
and exact expectations in the test. Never refresh it merely to make a failure
pass.
