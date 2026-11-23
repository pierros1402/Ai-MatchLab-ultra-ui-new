import test from "node:test";
import assert from "node:assert/strict";
import { admitDailyCrossRunArtifact } from "./daily-resume-crossrun-admission.mjs";

const SHA = "a".repeat(40);
const SHA2 = "b".repeat(40);
const REPO = "pierros1402/Ai-MatchLab-ultra-ui-new";
const ID = 45137286904;
const R = 1141938751;
const expected = { runId: ID, runAttempt: 1, repositoryId: R, repository: REPO };
const sourceRun = {
  id: ID, run_attempt: 1,
  repository: { id: R, full_name: REPO },
  head_repository: { id: R }, head_branch: "main",
  path: `${REPO}/.github/workflows/daily-deploy-snapshot.yml@refs/heads/main`,
  event: "schedule", status: "completed", conclusion: "failure",
  head_sha: SHA, created_at: "2026-11-23T09:00:00Z"
};
const artifact = {
  id: 14806013602, name: `aiml-stage20-shadow-${ID}-1`,
  workflow_run: { id: ID, repository_id: R },
  expired: false, size_in_bytes: 1690, digest: "sha256:" + "f".repeat(64),
  created_at: "2026-11-23T09:20:00Z",
  expires_at: "2026-11-25T09:20:00Z"
};
function check(overrides = {}) {
  return admitDailyCrossRunArtifact({ sourceRun, artifact, expected,
    consumerCommit: SHA, nowIso: "2026-11-23T10:00:00Z", ...overrides });
}
test("accepts completed failed Daily solely for verified artifact download", () => {
  const result = check();
  assert.equal(result.admitted, true);
  assert.equal(result.resumeAuthorized, false);
  assert.equal(result.publicationAuthorized, false);
  assert.equal(result.archiveSha256, "f".repeat(64));
});
test("refuses different producer commit even with same artifact", () => {
  assert.equal(check({consumerCommit:SHA2}).reason, "crossrun_code_compatibility_not_proven");
});
test("refuses different run id", () => {
  assert.equal(check({expected:{...expected,runId:ID+1}}).admitted,false);
});
test("refuses different run attempt", () => {
  assert.equal(check({expected:{...expected,runAttempt:2}}).admitted,false);
});
test("refuses PR runs as producer", () => {
  assert.equal(check({sourceRun:{...sourceRun,event:"pull_request"}}).admitted,false);
});
test("refuses fork source repository", () => {
  assert.equal(check({sourceRun:{...sourceRun,head_repository:{id:77}}}).admitted,false);
});
test("refuses wrong workflow path", () => {
  assert.equal(check({sourceRun:{...sourceRun,path:"other.yml@refs/heads/main"}}).admitted,false);
});
test("refuses non-main producer", () => {
  assert.equal(check({sourceRun:{...sourceRun,head_branch:"dev"}}).admitted,false);
});
test("refuses still-running source job", () => {
  assert.equal(check({sourceRun:{...sourceRun,status:"in_progress",conclusion:null}}).admitted,false);
});
test("accepts a timed-out terminal source only for artifact inspection", () => {
  const result = check({sourceRun:{...sourceRun,conclusion:"timed_out"}});
  assert.equal(result.admitted,true);
  assert.equal(result.resumeAuthorized,false);
});
test("refuses artifact under an unexpected name", () => {
  assert.equal(check({artifact:{...artifact,name:"untrusted"}}).admitted,false);
});
test("refuses artifact with wrong source run id", () => {
  assert.equal(check({artifact:{...artifact,workflow_run:{...artifact.workflow_run,id:123}}}).admitted,false);
});
test("refuses artifact with wrong repository id", () => {
  assert.equal(check({artifact:{...artifact,workflow_run:{...artifact.workflow_run,repository_id:4}}}).admitted,false);
});
test("refuses missing or malformed GitHub artifact checksum", () => {
  assert.equal(check({artifact:{...artifact,digest:null}}).admitted,false);
  assert.equal(check({artifact:{...artifact,digest:"sha256:bad"}}).admitted,false);
});
test("refuses expired artifact flag", () => {
  assert.equal(check({artifact:{...artifact,expired:true}}).admitted,false);
});
test("refuses passed expiry timestamp", () => {
  assert.equal(check({nowIso:"2026-11-25T09:20:00Z"}).admitted,false);
});
test("refuses artifact older than 48 hours", () => {
  assert.equal(check({nowIso:"2026-11-25T09:21:00Z",
    artifact:{...artifact,expires_at:"2026-11-30T00:00:00Z"}}).admitted,false);
});
test("refuses artifact produced after current time", () => {
  assert.equal(check({nowIso:"2026-11-23T09:10:00Z"}).admitted,false);
});
test("refuses too large or empty artifact", () => {
  assert.equal(check({artifact:{...artifact,size_in_bytes:0}}).admitted,false);
  assert.equal(check({artifact:{...artifact,size_in_bytes:600*1024*1024}}).admitted,false);
});
test("refuses invalid current time and zero attempt", () => {
  assert.equal(check({nowIso:"invalid"}).admitted,false);
  assert.equal(check({expected:{...expected,runAttempt:0}}).admitted,false);
});
