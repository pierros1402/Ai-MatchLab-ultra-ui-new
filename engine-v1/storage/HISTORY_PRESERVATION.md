# History preservation and recovery contract

## What is protected

The operational GitHub writers checkpoint evidence independently of publication:
Daily deploy, daily maintenance, intraday refresh, odds refresh, Plan C shadow,
and the applied bounded recovery/acquisition workflows. Read-only diagnosis does
not opt into an applied-repair checkpoint.

Value A/A2 output, the first frozen A observation, B/B2 output, verified final
result batches, and the four-plan comparison are checkpointed immediately after
being written, before the caller can reach a later publication gate. A failed
audit write is an error, rather than a successful zero-pick build.

The archive preserves raw bytes for the allowlisted application stores, including
ignored/generated files: selections, audits, rejection/coverage evidence, scores,
conflicts, canonical fixtures/identities, snapshots, assessments in odds memory,
history, indexes, priors, standings, context inputs and health reports. Source
code/policy is bound to the source commit. Every archive commit retains that
source commit as a parent, keeping its unchanged tracked data and code reachable.
Secrets, environment files and arbitrary unapproved paths are excluded.

## Durable evidence is separate from a valid release

`codex/history-archive` is a content-addressed, append-only evidence branch.
Checkpoint identities include day, run, attempt and stage. A repeated identical
checkpoint is idempotent; changed bytes under the same identity are rejected.
Normal fast-forward pushes retry against concurrent writers; no force push is
used. Unique blobs are retained once, with immutable manifests that name each
original path, SHA-256, byte count, chunk Git objects and source commit. Files
are streamed in at most 8 MiB chunks, including large historical indexes; the
new archive payload blobs remain small. Both individual chunks
and reconstructed whole files are hashed and verified.

A checkpoint is acknowledged only after it is fetched from the remote and its
manifest and payload hashes verify. A network/permission failure throws and
blocks the following steps. It never becomes a successful/zero-pick observation.
Partial or invalid JSON is retained as forensic evidence. Preservation does not
classify it as valid, and `publicationApproved` remains false.

At the end of each writer, an `always()` cleanup action also uploads a recovery
bundle of changed, new and ignored evidence (90-day artifact retention), retries permanent archival, then
restores the archived snapshot into a fresh temporary directory. A failure of
this backup/restore step fails the run and must be acted on. Skipped schedules
with no resolved operational day do not invent a completed day.

The fallback bundle names the workflow's initial committed baseline and any
absent paths. Committed, unchanged baseline files remain in Git; the artifact
preserves the bytes that might otherwise be lost with the runner. This avoids
uploading several gigabytes of duplicate baseline data on every hourly tick.
For a standalone complete bundle, CLI `bundle --full=true` captures every
allowlisted file. This bundle is evidence, never an automatic publication.

## Recovery

From a repository clone with the archive branch fetched:

```sh
git fetch origin codex/history-archive
node engine-v1/jobs/preserve-history-checkpoint.js verify \
  --ref=origin/codex/history-archive \
  --manifest=checkpoints/YYYY-MM-DD/RUN_ID/ATTEMPT/STAGE/manifest.json
node engine-v1/jobs/preserve-history-checkpoint.js restore \
  --ref=origin/codex/history-archive \
  --manifest=checkpoints/YYYY-MM-DD/RUN_ID/ATTEMPT/STAGE/manifest.json \
  --destination=/new/empty/recovery-directory
```

Restoration verifies all bytes before creating the destination and never
overwrites an existing directory. The restored set represents the files present
at capture time. `missingBaselineFiles` explicitly records tracked baseline
paths that were absent; old bytes remain accessible via the retained source
commit. Recovery is reviewed before promoting data back into production. An
original observation and a later correction remain distinguishable. No model
rerun may be presented as an original historical observation.

## Activation and remaining operational requirements

This code needs to be merged into the production writer branch and exercised by
a real run. The first successful remote checkpoint plus restore is the activation
proof. Draft code and local tests alone do not prove production preservation.
After merge, manually dispatch `history-preservation-canary.yml` to checkpoint
the existing repository evidence and verify a fresh restore without executing
any plan or calling odds providers. Then verify normal scheduled writers too;
the canary does not prove that a schedule fires or captures its future output.

- Verify the workflow token has contents-write access and permits the archive
  branch. Protect that branch from deletion/force pushes and disable automatic
  branch cleanup for it.
- Confirm account notification settings expose failed backup/restore runs. The
  code fails them; it does not prove notification delivery or someone acting on
  it. A permanently missing scheduled run requires separate schedule monitoring.
- Mirror the Git archive to independent storage/account with its own restore
  test. Git and Actions artifacts on the same GitHub repository are not an
  independent disaster-recovery copy if that repository/account is lost.
- Audit the live hosting filesystem and all runtime writers. This implementation
  protects opted-in GitHub workflows, not volatile Render memory, external KV
  writes or arbitrary historical/manual scripts. Those need persistent storage
  and their own write/backup acknowledgements before claiming full coverage.
- A runner killed before its next acknowledged checkpoint can lose its latest
  in-flight batch. `always()` is best effort on hard cancellation/timeouts, not
  a substitute for a transactional durable write-ahead store. For zero-loss
  acknowledgement at individual-record level, write the record to durable
  database/object storage before acknowledging it; do not rely on local files.
- Preserve/restore service configuration and credentials separately through
  the existing secret manager. Do not put them into this evidence archive.
- Monitor archive growth and workflow duration. Capture reuses Git blobs and
  batches hashing/verification, but scans all evidence at each checkpoint and
  a final restore checks the full captured set. Recovery delta bundles are uploaded
  separately, so artifact storage and upload duration must be budgeted. Chunking
  avoids large individual Git blobs, not Git repository/account capacity limits.
  Retained source commits are still subject to their own GitHub file limits:
  committing an oversized generated index before archival can prevent that
  source parent from being pushed. Move growing indexes to durable object
  storage before reaching that boundary; a temporary Actions artifact is not
  a substitute for permanent archival.

The operational claim is bounded: bytes in an acknowledged remote checkpoint
are recoverable and subsequent publication failure cannot remove them. Complete
system assurance requires the activation and independent-storage checks above.

## Durable display-odds writer

`Odds refresh` collects D0 and D+1..D+6 on GitHub using the existing provider
credentials, refresh gates and shared 80-request IO budget. It no longer starts
an asynchronous write on Render. The collector never executes value/assessment
models and refuses live collection for a past date. Raw cache updates use atomic
writes; another provider's identifiers/timestamps and frozen opening odds survive
refreshes. Successful batches are checkpointed before the next producer stage.

The acquisition audit in `data/ingest-state/multi-odds/` distinguishes provider
failure, missing keys, fresh cache, no fixtures in the supplied input, no provider
matches, missing markets, request-budget exhaustion and HTTP rate limits. Quota
or coverage-limited data can be published as explicitly incomplete; provider
errors fail the collector after preserving available evidence. Neither an empty
provider response nor missing fixtures establishes no games or zero value picks.
`valueExecution` is null. No historical plan result is reconstructed by this job.

History cleanup also retains the upstream job status in
`data/ingest-state/history-runs/`. Its scope is before cleanup, so a subsequent
backup failure can still fail the job. It does not claim the final run conclusion
or classify plan outcomes. Full textual Actions logs still use GitHub retention.

`latest-checkpoint.json` is a small locator for independent backup readers;
older immutable manifests and blobs remain in the append-only archive. Readers
pin an archive commit, verify the located manifest and every payload hash, and
retain local immutable refs before acknowledging a backup. Render snapshot mode
rejects the authenticated volatile multi-odds writer after deployment; it serves
the GitHub-persisted cache through the existing snapshot synchronizer.
# Completed workflow logs

`history-workflow-logs.yml` captures each completed main-branch writer attempt, including failed runs, through the GitHub Actions API. A manual input captures an already completed run; it never reruns the plan. It checks the repository, branch, exact attempt and known workflow name before retaining evidence. The archiver executes only current trusted main code, never code from the completed run or its log payload.

The original GitHub-provided ZIP is stored as base64 JSON with its SHA-256, exact run conclusion and source commit. Corrupt or unavailable logs are explicit failures and do not establish a zero-pick result. ZIPs are validated without extraction. Archives above 64 MiB, or with more than 512 MiB of expanded entries, are reported incomplete; larger logs need a separate storage path.

Log-only checkpoints use the `workflow-logs` evidence scope and `latest-workflow-logs.json`. They do not replace `latest-checkpoint.json`, declare unrelated sparse application data missing, publish results, or change main. Immutable older manifests remain in the protected archive. Each captured log checkpoint is remotely verified and restored, with a separate 90-day artifact fallback. Stored console logs have GitHub's existing secret masking; this workflow does not query provider secrets.
