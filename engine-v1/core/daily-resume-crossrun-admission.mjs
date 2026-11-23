// Fail-closed admission of an artifact published by a different GitHub Actions run.
// Pure read-only decision; does not download, restore, execute or publish anything.
export const CROSSRUN_SCHEMA = "ai-matchlab.daily-crossrun-admission.v1";
const SHA40 = /^[a-f0-9]{40}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const ID = /^[1-9][0-9]{0,18}$/;
const WORKFLOW = /(?:^|\/)\.github\/workflows\/daily-deploy-snapshot\.yml@refs\/heads\/main$/;
function invalid(reason) { return { schema: CROSSRUN_SCHEMA, admitted: false,
  reason, resumeAuthorized: false, publicationAuthorized: false }; }
function parseTime(value) {
  if (typeof value !== "string" || !/\d{4}-\d{2}-\d{2}T/.test(value)) return NaN;
  return Date.parse(value);
}
export function admitDailyCrossRunArtifact({
  sourceRun, artifact, expected, consumerCommit, nowIso
}) {
  if (!expected || !ID.test(String(expected.runId)) ||
      !Number.isSafeInteger(Number(expected.runId)) ||
      !Number.isSafeInteger(expected.runAttempt) || expected.runAttempt < 1 ||
      !Number.isSafeInteger(expected.repositoryId) || expected.repositoryId < 1 ||
      typeof expected.repository !== "string" ||
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(expected.repository) ||
      !SHA40.test(consumerCommit)) return invalid("crossrun_expected_identity_invalid");
  if (!sourceRun || String(sourceRun.id) !== String(expected.runId) ||
      sourceRun.run_attempt !== expected.runAttempt ||
      sourceRun.repository?.id !== expected.repositoryId ||
      sourceRun.repository?.full_name !== expected.repository ||
      sourceRun.head_repository?.id !== expected.repositoryId ||
      sourceRun.head_branch !== "main" ||
      !WORKFLOW.test(sourceRun.path || "") ||
      !["schedule", "workflow_dispatch"].includes(sourceRun.event)) {
    return invalid("crossrun_producer_untrusted");
  }
  if (sourceRun.status !== "completed" ||
      !["success", "failure", "timed_out"].includes(sourceRun.conclusion))
    return invalid("crossrun_producer_not_terminal");
  if (!SHA40.test(sourceRun.head_sha)) return invalid("crossrun_producer_sha_invalid");
  // A hotfix cannot silently re-authorize a checkpoint produced by different code.
  // Reviewed, transitive stage-code compatibility is a separate unsatisfied gate.
  if (sourceRun.head_sha !== consumerCommit) return invalid("crossrun_code_compatibility_not_proven");
  const exactName = `aiml-stage20-shadow-${expected.runId}-${expected.runAttempt}`;
  if (!artifact || artifact.name !== exactName || artifact.expired !== false ||
      !ID.test(String(artifact.id)) || !Number.isSafeInteger(Number(artifact.id)) ||
      artifact.workflow_run?.id !== Number(expected.runId) ||
      artifact.workflow_run?.repository_id !== expected.repositoryId ||
      !SHA256.test(artifact.digest || "") ||
      !Number.isSafeInteger(artifact.size_in_bytes) ||
      artifact.size_in_bytes <= 0 || artifact.size_in_bytes > 512 * 1024 * 1024)
    return invalid("crossrun_artifact_identity_or_integrity_invalid");
  const now = parseTime(nowIso);
  const created = parseTime(artifact.created_at);
  const expires = parseTime(artifact.expires_at);
  const runCreated = parseTime(sourceRun.created_at);
  if (![now, created, expires, runCreated].every(Number.isFinite) ||
      created < runCreated || created > now || runCreated > now ||
      expires <= now || now - created > 48 * 3600 * 1000)
    return invalid("crossrun_artifact_expired_or_stale");
  return {
    schema: CROSSRUN_SCHEMA, admitted: true,
    reason: null,
    runId: String(expected.runId), runAttempt: expected.runAttempt,
    producerCommit: sourceRun.head_sha, artifactId: Number(artifact.id),
    archiveSha256: artifact.digest.slice("sha256:".length),
    // Admission to *download* is not admission to reuse outputs.
    // A separate full worktree delta, inputs, frozen truth and stage-DAG
    // verification is mandatory before any stage can be skipped.
    resumeAuthorized: false, publicationAuthorized: false
  };
}
