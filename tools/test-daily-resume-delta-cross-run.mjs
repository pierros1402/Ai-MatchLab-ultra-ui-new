import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  captureDailyWorktreeDelta, inspectDailyWorktreeDelta, replayDailyWorktreeDeltaToIsolatedClone
} from "../engine-v1/core/daily-resume-worktree-delta.mjs";

function git(root, ...args) {
  return execFileSync("git", args, {
    cwd: root, encoding: "utf8",
    env: { ...process.env, GIT_AUTHOR_DATE: "2001-01-01T00:00:00Z",
      GIT_COMMITTER_DATE: "2001-01-01T00:00:00Z", GIT_CONFIG_NOSYSTEM: "1" }
  }).trim();
}
function hash(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
const mode = process.argv[2], bundleRoot = process.argv[3];
assert.ok(["produce", "consume"].includes(mode), "mode_invalid");
assert.ok(bundleRoot && path.isAbsolute(bundleRoot), "bundle_root_required");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-delta-cross-run-"));
try {
  const source = path.join(root, "source");
  fs.mkdirSync(source);
  git(source, "init", "-q", "--initial-branch=main");
  git(source, "config", "user.name", "Deterministic Fixture Bot");
  git(source, "config", "user.email", "deterministic@example.invalid");
  fs.mkdirSync(path.join(source, "output"));
  fs.mkdirSync(path.join(source, "baseline"));
  fs.writeFileSync(path.join(source, "output", "modified.txt"), "original\n");
  fs.writeFileSync(path.join(source, "output", "deleted.txt"), "obsolete\n");
  fs.writeFileSync(path.join(source, "baseline", "preserved.txt"), "immutable original\n");
  git(source, "add", ".");
  git(source, "-c", "commit.gpgsign=false", "commit", "-qm", "pinned base state");
  const baseCommit = git(source, "rev-parse", "HEAD");
  const options = { baseCommit, dayKey: "2026-11-23", stageId: "synthetic-cycle",
    allowedPrefixes: ["output/"] };
  const custody = {
    repository: process.env.GITHUB_REPOSITORY,
    runId: process.env.GITHUB_RUN_ID,
    attempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    workflowCommit: process.env.GITHUB_SHA,
    baseCommit,
    dayKey: options.dayKey,
    stageId: options.stageId
  };
  assert.match(custody.workflowCommit, /^[0-9a-f]{40}$/);
  assert.match(String(custody.runId), /^[0-9]+$/);
  const archive = path.join(bundleRoot, "delta");
  const provenanceFile = path.join(bundleRoot, "provenance.json");
  if (mode === "produce") {
    fs.writeFileSync(path.join(source, "output", "modified.txt"), "new calculated result\n");
    fs.rmSync(path.join(source, "output", "deleted.txt"));
    fs.writeFileSync(path.join(source, "output", "added.txt"), "new derived output\n");
    git(source, "add", "output/modified.txt");
    const snapshot = captureDailyWorktreeDelta(source, archive, options);
    assert.equal(snapshot.writes, 2);
    assert.equal(snapshot.deletions, 1);
    const envelope = {
      schema: "ai-matchlab.daily-resume-delta-transfer-ci.v1", custody,
      checkpointSha256: snapshot.checkpointSha256,
      manifestSha256: hash(fs.readFileSync(path.join(archive, "manifest.json")))
    };
    fs.writeFileSync(provenanceFile, JSON.stringify(envelope, null, 2) + "\n", { flag: "wx" });
    console.log("DELTA_PRODUCER_PASS=" + JSON.stringify({ evidence: snapshot.checkpointSha256,
      baseCommit, runId: custody.runId, writes: snapshot.writes, deletions: snapshot.deletions }));
  } else {
    assert.deepEqual(fs.readdirSync(bundleRoot).sort(), ["delta", "provenance.json"]);
    const envelope = JSON.parse(fs.readFileSync(provenanceFile, "utf8"));
    assert.equal(envelope.schema, "ai-matchlab.daily-resume-delta-transfer-ci.v1");
    assert.deepEqual(envelope.custody, custody);
    assert.equal(envelope.manifestSha256, hash(fs.readFileSync(path.join(archive, "manifest.json"))));
    const checked = inspectDailyWorktreeDelta(archive, options);
    assert.equal(checked.ok, true, checked.reason);
    assert.equal(checked.checkpointSha256, envelope.checkpointSha256);
    const recovered = replayDailyWorktreeDeltaToIsolatedClone(source, archive, options, root);
    assert.equal(fs.readFileSync(path.join(recovered.stagingClone, "output", "modified.txt"), "utf8"),
      "new calculated result\n");
    assert.equal(fs.readFileSync(path.join(recovered.stagingClone, "output", "added.txt"), "utf8"),
      "new derived output\n");
    assert.equal(fs.existsSync(path.join(recovered.stagingClone, "output", "deleted.txt")), false);
    assert.equal(fs.readFileSync(path.join(recovered.stagingClone, "baseline", "preserved.txt"), "utf8"),
      "immutable original\n");
    assert.equal(fs.readFileSync(path.join(source, "output", "modified.txt"), "utf8"), "original\n");
    console.log("DELTA_CONSUMER_PASS=" + JSON.stringify({ evidence: envelope.checkpointSha256,
      baseCommit, runId: custody.runId, restoredInIsolatedClone: true }));
  }
} finally { fs.rmSync(root, { recursive: true, force: true }); }
