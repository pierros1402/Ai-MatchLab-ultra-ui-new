# G2 historical producer scope — evidence-bound closures (2026-10-31)

This record permanently pins successful **read-only deterministic producer checks** from
GitHub Actions run **41187666600** of PR #124. It does not authorize canonical edits,
historical identity adjudication, deployment, merge, or production writes.

| Scope | Decision | Exact evidence artifact ID | Report SHA-256 |
| --- | --- | --- | --- |
| 20 deploy fixture snapshots | CLOSED_SCOPE_ONLY (20/20) | 13037612221 | `91d8a870c180d72df44488e0ac1775ec3334811d221259773d0634f610885a66` |
| 8 deploy odds snapshots | CLOSED_SCOPE_ONLY (8/8) | 13037497528 | `4a756cb64e06d3d08240faab54e2ccd7a270513dbf5930b82ad7cd01ee5f3896` |
| 66 deploy detail targets | CLOSED_SCOPE_ONLY (66/66) | 13037791884 | `968fad211cfd5fcdb98b2e60bd64593d8099770e7c7274eab6f1a3bc9da26352` |
| 24 fixtures-all targets | HOLD (22/24) | 13038086414 | Missing canonical partitions for 2026-07-13 and 2026-07-20 |

Verification means deterministic producer output in the specified sandbox context,
not an independent validation of source truth. In particular, the odds test reuses
existing stored odds; the details test reuses existing deployed details; and none of
these reports resolves the 72 pending historical identity pairs.

The fixtures-all report also incorrectly flagged its own generated untracked payloads
as a worktree change. The tracked-file guard was corrected separately in commit
`ec1d5d3f3a177766d37bc45116e70edda37774fd`; two missing canonical days
remain unresolved.

These successful scopes need not be re-executed solely for lack of a status label.
Reopen only upon a relevant source change, failed integrity recheck, or a newly
identified truth conflict. The CI closure ledger independently computes statuses
from current-run evidence; it may legitimately return HOLD for a different run.

Overall project status: **NOT CLOSED**. Protected truth, 72 identity pairs, two
canonical missing days, remaining derived families, and deployment gate remain open.
