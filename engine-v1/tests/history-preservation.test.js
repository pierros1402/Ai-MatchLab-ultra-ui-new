import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";
import crypto from "node:crypto";
import {
  HISTORY_ARCHIVE_BRANCH, isHistoryEvidencePath, preserveHistoryCheckpoint,
  verifyHistoryCheckpoint, restoreHistoryCheckpoint, prepareHistoryRecoveryBundle,
  checkpointHistoryIfRequired, writeHistoryJsonAtomic
} from "../storage/history-preservation.js";

function git(root, args) { return execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trim(); }
function fixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "matchlab-history-test-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const root = path.join(temp, "working copy"), remote = path.join(temp, "archive.git");
  fs.mkdirSync(root); git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.name", "Test"]); git(root, ["config", "user.email", "test@example.invalid"]);
  fs.writeFileSync(path.join(root, ".gitignore"), "data/value/\n.env\n");
  fs.writeFileSync(path.join(root, "source.txt"), "baseline\n");
  git(root, ["add", "."]); git(root, ["commit", "-m", "baseline"]);
  git(root, ["init", "--bare", remote]); git(root, ["remote", "add", "origin", remote]);
  const write = (name, value) => {
    const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, value); return file;
  };
  return { root, remote, temp, write };
}

test("log-only capture retains full-data locator and does not infer missing sparse data", t => {
  const f = fixture(t);
  f.write("data/value-plans/2026-10-14/plan-a.json", '{"count":1}');
  git(f.root, ["add", "data/value-plans"]); git(f.root, ["commit", "-m", "data baseline"]);
  const full = preserveHistoryCheckpoint({ root: f.root, dayKey: "2026-10-14", stage: "full", runId: "1" });
  fs.rmSync(path.join(f.root, "data/value-plans"), { recursive:true });
  f.write("data/ingest-state/workflow-logs/2/1.json", '{"runConclusion":"failure","logBytesBase64":"UEs="}');
  const logs = preserveHistoryCheckpoint({ root:f.root, dayKey:"2026-10-14", stage:"logs", runId:"2", evidenceScope:"workflow-logs" });
  const manifest = verifyHistoryCheckpoint({root:f.root, ref:logs.archiveCommit, manifestPath:logs.manifestPath});
  assert.equal(manifest.files.length, 1); assert.deepEqual(manifest.missingBaselineFiles, []);
  assert.equal(manifest.evidenceScope, "workflow-logs");
  const dataLocator = JSON.parse(git(f.root, ["show", `${logs.archiveCommit}:latest-checkpoint.json`]));
  assert.equal(dataLocator.manifestPath, full.manifestPath);
  assert.equal(JSON.parse(git(f.root, ["show", `${logs.archiveCommit}:latest-workflow-logs.json`])).manifestPath, logs.manifestPath);
  const destination = path.join(f.temp, "restored logs");
  assert.equal(restoreHistoryCheckpoint({root:f.root,ref:logs.archiveCommit,manifestPath:logs.manifestPath,destination}).fileCount,1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(destination,"data/ingest-state/workflow-logs/2/1.json"))).runConclusion,"failure");
});

test("failed later gate cannot discard original picks, inputs, verified results or malformed evidence", t => {
  const f = fixture(t);
  f.write("data/value/2026-08-19.json", '{"count":2,"picks":[{"id":"one"},{"id":"two"}]}');
  f.write("data/value-plans/2026-08-19/plan-a.json", '{"immutable":true,"observationSignature":"original"}');
  f.write("data/final-results/2026-08-18/match.json", '{"score":"2-1"}');
  f.write("data/history/2026-2027.json", '{"matches":["original input"]}');
  f.write("data/value/_audit/2026-08-19.json", '{"partial":');
  f.write("data/fixtures.json", '{"fixtures":[]}');
  f.write("data/plan-c-shadow/clubelo-snapshots/input.html.gz", gzipSync("binary evidence"));
  f.write(".env", "TOKEN=never_archive"); f.write("data/credentials/secret.json", '{"secret":"never"}');
  const main = git(f.root, ["rev-parse", "HEAD"]), status = git(f.root, ["status", "--porcelain"]);
  const first = preserveHistoryCheckpoint({ root: f.root, dayKey: "2026-08-19", stage: "value-built", runId: "19" });
  assert.equal(git(f.root, ["rev-parse", "HEAD"]), main);
  assert.equal(git(f.root, ["status", "--porcelain"]), status);
  assert.equal(first.fileCount, 7);
  // Simulate a failed publication and a later run overwriting production state.
  f.write("data/value/2026-08-19.json", '{"count":0,"picks":[]}');
  const second = preserveHistoryCheckpoint({ root: f.root, dayKey: "2026-08-19", stage: "failed-final", runId: "20" });
  const locator = JSON.parse(git(f.root, ["show", `${second.archiveCommit}:latest-checkpoint.json`]));
  assert.equal(locator.manifestPath, second.manifestPath);
  assert.notEqual(locator.manifestPath, first.manifestPath);
  const manifest = verifyHistoryCheckpoint({ root: f.root, ref: second.archiveCommit, manifestPath: first.manifestPath });
  assert.equal(manifest.publicationApproved, false);
  assert.equal(manifest.files.some(file => file.path.includes("secret") || file.path === ".env"), false);
  const restored = path.join(f.temp, "restored");
  restoreHistoryCheckpoint({ root: f.root, ref: second.archiveCommit, manifestPath: first.manifestPath, destination: restored });
  assert.equal(JSON.parse(fs.readFileSync(path.join(restored, "data/value/2026-08-19.json"))).count, 2);
  assert.equal(fs.readFileSync(path.join(restored, "data/value/_audit/2026-08-19.json"), "utf8"), '{"partial":');
  assert.deepEqual(fs.readFileSync(path.join(restored, "data/plan-c-shadow/clubelo-snapshots/input.html.gz")), gzipSync("binary evidence"));
  assert.equal(git(f.root, ["show", `${second.archiveCommit}:${first.manifestPath}`]).includes('"count": 0'), false);
  assert.throws(() => restoreHistoryCheckpoint({ root: f.root, ref: second.archiveCommit, manifestPath: first.manifestPath, destination: restored }), /must_be_new/);
});

test("retry is idempotent and a changed payload cannot overwrite the same checkpoint identity", t => {
  const f = fixture(t); f.write("data/value/2026-10-13.json", '{"count":0,"picks":[]}');
  const args = { root: f.root, dayKey: "2026-10-13", stage: "complete", runId: "13", attempt: "2" };
  const first = preserveHistoryCheckpoint(args), again = preserveHistoryCheckpoint(args);
  assert.equal(again.reused, true); assert.equal(first.archiveCommit, again.archiveCommit);
  f.write("data/value/2026-10-13.json", '{"count":1}');
  assert.throws(() => preserveHistoryCheckpoint(args), /identity_conflict/);
  assert.equal(git(f.root, ["ls-remote", "--heads", "origin", HISTORY_ARCHIVE_BRANCH]).split(/\s/u)[0], first.archiveCommit);
});

test("missing remote blocks durability and an independent recovery bundle still preserves bytes", t => {
  const f = fixture(t); f.write("data/value/2026-10-13.json", '{"count":3}');
  git(f.root, ["remote", "set-url", "origin", path.join(f.temp, "unavailable.git")]);
  assert.throws(() => preserveHistoryCheckpoint({ root: f.root, dayKey: "2026-10-13", stage: "built", runId: "13" }), /git_failed/);
  const dest = path.join(f.temp, "bundle");
  const result = prepareHistoryRecoveryBundle({ root: f.root, destination: dest, dayKey: "2026-10-13" });
  assert.equal(result.fileCount, 1); assert.equal(result.publicationApproved, false);
  assert.equal(fs.readFileSync(path.join(dest, "data/value/2026-10-13.json"), "utf8"), '{"count":3}');
});

test("fallback bundle retains committed workflow changes, ignored evidence and deletion records without duplicating baseline", t => {
  const f = fixture(t);
  f.write("data/history/unchanged.json", '{"old":true}');
  f.write("data/history/modified.json", '{"old":true}');
  f.write("data/history/deleted.json", '{"old":true}');
  git(f.root, ["add", "data/history"]); git(f.root, ["commit", "-m", "durable baseline"]);
  const baseline = git(f.root, ["rev-parse", "HEAD"]);
  f.write("data/history/modified.json", '{"new":true}');
  fs.unlinkSync(path.join(f.root, "data/history/deleted.json"));
  git(f.root, ["add", "data/history"]); git(f.root, ["commit", "-m", "committed within workflow"]);
  f.write("data/value/ignored.json", '{"picks":["original"]}');
  f.write("data/final-results/new.json", '{"verified":true}');
  const destination = path.join(f.temp, "delta-bundle");
  const result = prepareHistoryRecoveryBundle({ root: f.root, destination, dayKey: "2026-10-13", baseline });
  assert.equal(result.fileCount, 3);
  const manifest = JSON.parse(fs.readFileSync(path.join(destination, "manifest.json")));
  assert.deepEqual(manifest.absentPaths, ["data/history/deleted.json"]);
  assert.equal(manifest.baselineCommit, baseline);
  assert.equal(fs.existsSync(path.join(destination, "data/history/unchanged.json")), false);
  assert.equal(fs.readFileSync(path.join(destination, "data/value/ignored.json"), "utf8"), '{"picks":["original"]}');
});

test("archive corruption is detected before a restore writes any data", t => {
  const f = fixture(t); f.write("data/value/2026-10-13.json", '{"count":0}');
  const archived = preserveHistoryCheckpoint({ root: f.root, dayKey: "2026-10-13", stage: "built", runId: "13" });
  git(f.root, ["checkout", archived.archiveCommit]);
  const manifestFile = path.join(f.root, archived.manifestPath);
  const manifest = JSON.parse(fs.readFileSync(manifestFile)); manifest.files[0].sha256 = "0".repeat(64);
  fs.writeFileSync(manifestFile, JSON.stringify(manifest)); git(f.root, ["add", manifestFile]); git(f.root, ["commit", "-m", "simulate corruption"]);
  const corrupt = git(f.root, ["rev-parse", "HEAD"]), dest = path.join(f.temp, "restore-blocked");
  assert.throws(() => restoreHistoryCheckpoint({ root: f.root, ref: corrupt, manifestPath: archived.manifestPath, destination: dest }), /hash_mismatch/);
  assert.equal(fs.existsSync(dest), false);
});

test("atomic JSON replaces complete payloads and cleans temporary files on failed serialization", t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "history-atomic-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "result.json"); writeHistoryJsonAtomic(file, { count: 2 });
  const cycle = {}; cycle.self = cycle;
  assert.throws(() => writeHistoryJsonAtomic(file, cycle));
  assert.deepEqual(JSON.parse(fs.readFileSync(file)), { count: 2 });
  assert.deepEqual(fs.readdirSync(dir), ["result.json"]);
});

test("large historical evidence is chunked, recovered exactly, and reused across checkpoints", t => {
  const f = fixture(t), payload = crypto.randomBytes(9 * 1024 * 1024 + 17);
  f.write("data/history-index/matchups/2025-2026.json", payload);
  f.write("data/value/empty.json", Buffer.alloc(0));
  const archived = preserveHistoryCheckpoint({ root: f.root, dayKey: "2026-10-13", stage: "large", runId: "large" });
  const manifest = verifyHistoryCheckpoint({ root: f.root, ref: archived.archiveCommit, manifestPath: archived.manifestPath });
  assert.equal(manifest.files.find(file => file.path.includes("matchups")).chunks.length, 2);
  const destination = path.join(f.temp, "large-restored");
  restoreHistoryCheckpoint({ root: f.root, ref: archived.archiveCommit, manifestPath: archived.manifestPath, destination });
  assert.deepEqual(fs.readFileSync(path.join(destination, "data/history-index/matchups/2025-2026.json")), payload);
  assert.equal(fs.statSync(path.join(destination, "data/value/empty.json")).size, 0);
  const next = preserveHistoryCheckpoint({ root: f.root, dayKey: "2026-10-13", stage: "later", runId: "large" });
  assert.equal(git(f.root, ["ls-tree", "-r", "--name-only", next.archiveCommit, "--", "blobs"]).split("\n").length, 3);
});

test("concurrent writers retain both checkpoints without forcing or losing the accepted archive", async t => {
  const f = fixture(t), other = path.join(f.temp, "other-writer");
  git(f.root, ["clone", "--quiet", f.root, other]);
  git(other, ["remote", "set-url", "origin", f.remote]);
  f.write("data/value/2026-10-13.json", '{"writer":"first"}');
  fs.mkdirSync(path.join(other, "data/value"), { recursive: true });
  fs.writeFileSync(path.join(other, "data/value/2026-10-13.json"), '{"writer":"second"}');
  fs.writeFileSync(path.join(f.remote, "hooks/pre-receive"), "#!/bin/sh\nsleep 1\nexit 0\n", { mode: 0o755 });
  const moduleUrl = new URL("../storage/history-preservation.js", import.meta.url).href;
  const run = promisify(execFile);
  const results = await Promise.all([f.root, other].map((root, index) => run(process.execPath,
    ["--input-type=module", "-e", `import {preserveHistoryCheckpoint} from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(preserveHistoryCheckpoint(${JSON.stringify({root,dayKey:"2026-10-13",stage:"concurrent",runId:String(index+1),retries:5})})));`],
    { encoding: "utf8", windowsHide: true })));
  const archived = results.map(result => JSON.parse(result.stdout));
  git(f.root, ["fetch", "--quiet", "origin", HISTORY_ARCHIVE_BRANCH]);
  for (const checkpoint of archived) {
    const manifest = verifyHistoryCheckpoint({ root: f.root, ref: "FETCH_HEAD", manifestPath: checkpoint.manifestPath });
    assert.equal(manifest.files.length, 1);
  }
  const final = git(f.root, ["rev-parse", "FETCH_HEAD"]);
  for (const checkpoint of archived) assert.equal(git(f.root, ["merge-base", "--is-ancestor", checkpoint.archiveCommit, final]), "");
});

test("evidence boundaries reject traversal, secrets and arbitrary stores; hooks default to no mutation", () => {
  for (const value of ["data/value/../../.env", "data/value/a\\b.json", "data/secrets/tokens.json", "data/value/tokens.json", "data/unapproved/file.json", ".env"]) {
    assert.equal(isHistoryEvidencePath(value), false);
  }
  assert.equal(isHistoryEvidencePath("data/value-plans/2026-10-13/plan-a.json"), true);
  assert.equal(isHistoryEvidencePath("data/fixtures.json"), true);
  assert.deepEqual(checkpointHistoryIfRequired("2026-10-13", "test"), { enabled: false });
});
