# Value decision input evidence

Subsequent normal A/A2/B/B2 builds persist the JSON arguments and derived context
used by that particular Value selector execution. This adds evidence, not a new
scoring rule or a historical replay.

The audit's `decisionInputEvidence.records` lists SHA256-addressed receipts under
`data/value/_execution-evidence/objects/`. Each receipt references immutable input
objects in the same store. They are included by the existing `value` history
archive allowlist and verified by the usual checkpoint/restore process. Identical
input objects are shared across builds; an existing object with the wrong hash
is retained and causes the build to fail.

For A/A2 the shared receipt retains the actual cached index/prior objects and
canonical universe, including foundation-block reasons. Fixture receipts retain
the resolved details, intelligence, engine argument before and after its internal
AI load, the returned value, and any opponent profiles and expanded markets.
`modelInputLoadStatus` distinguishes a blocked foundation from a legitimately
small current-form sample. These flags do not change model decisions.

For B/B2 the shared receipt retains the actual assessment rows, their selected
source, and canonical universe. Fixture receipts retain the joined selector
argument, including B2's adjusted assessment and profiles. Missing or ambiguous
assessments remain explicit; capturing an input does not make it complete.

Capture timestamps, target day, execution UUID, workflow identity and source-file
hashes are recorded separately. File hashes describe source visible at module
load. The records do not certify every upstream provider/assessment-generation
input or retroactively prove the original historical execution. Undefined and
non-finite numeric values have explicit tags so they cannot silently become a
genuine null or zero. Environment variables are never dumped; only validated
workflow ID, attempt and head SHA are included. Credential fields and credential
query parameters fail capture rather than being published.

An evidence I/O or integrity failure aborts the build, instead of being converted
to a per-match rejection or a successful zero-pick day. Already frozen B/B2 and
A2 observations continue to return before model-input reads; no new evidence is
invented for those existing observations.
