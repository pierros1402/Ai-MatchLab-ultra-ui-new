# Historical identity G2 — remaining closure gates (2026-10-31)

## Evidence and scope
This is a **HOLD** record, not approval to patch historical truth. Source-bound
PR #124 historical run 41188312943; manifest integrity artifact
13037538528; reviewed result: 7 of 20 manifest references passed, 13 failed.
Of those 13, one was a stored detail byte-length mismatch on 2026-07-14;
12 had manifest fixture counts inconsistent with the current fixture snapshot:
2026-07-15, 07-16, 07-18, 07-19, 07-21, 07-22, 07-23,
07-24, 07-25, 07-29, 07-30, plus one remaining failure
requiring extraction from the source-bound evidence before closure.
All 13 are HOLD, not evidence of which side is authoritative.
The read-only checker now emits exact expected/actual counts and sizes
(commit 1523f59fdc5b132453318da421aa0ae907bf443b).

## Completed limited scopes
G2 deterministic producer checks were pinned in
`docs/g2-historical-producer-scope-closures-20261031.md`:
20 fixtures, 8 odds, and 66 details. This is **not** historical
final-score or source-truth approval.

## Still required for final completion
1. Resolve 2026-07-13 and 2026-07-20 missing canonical partitions against
   independent provenance; do not promote existing snapshots to canonical truth.
2. Adjudicate all 72 historical identity pairs against independent authoritative
   final scores, provider identity, and status; unresolved rows stay HOLD.
3. Reconcile 13 manifest drifts against the authoritative fixed-day fixture and
   detail sets. Retain both previous blobs, exact differences, and provenance.
4. Obtain PASS evidence for the 17 immutable Value audit checks and independent
   treatment of the four history-index targets. A source hash alone does not
   constitute rebuilding those indexes.
5. Produce complete dependency-aware 159-target derived write-set; review
   protected canonical, verified-final, immutable, Value, settlement, and H2H
   effects. Require source-bound regression and fixed-point proof before approval.
6. Explicit independent application authorization is required before protected
   repository data writes, merge, workflow mutations outside Draft PR, or deploy.

No production deployment, main merge, or protected truth edits were authorized.
No overall PASS or global completion is claimed.
