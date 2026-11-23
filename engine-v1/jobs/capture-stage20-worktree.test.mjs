import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { evaluateStage20CapturePaths, STAGE20_APPROVED_FAMILIES } from "../core/daily-resume-stage20-admission.mjs";
import { inspectStage20Worktree, captureStage20Worktree } from "./capture-stage20-worktree.mjs";
import { inspectDailyWorktreeDelta, replayDailyWorktreeDeltaToIsolatedClone } from "../core/daily-resume-worktree-delta.mjs";
function cmd(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}
function fixture(fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-stage20-admission-"));
  const repo = path.join(home, "repo"); fs.mkdirSync(repo);
  try {
    cmd(repo, "init", "-q", "--initial-branch=main");
    cmd(repo, "config", "user.name", "CI Fixture");
    cmd(repo, "config", "user.email", "ci@example.invalid");
    fs.mkdirSync(path.join(repo, "data", "canonical-fixtures"), { recursive: true });
    fs.mkdirSync(path.join(repo, "data", "value"), { recursive: true });
    fs.writeFileSync(path.join(repo, "data", "canonical-fixtures", "old.json"), "{}\n");
    fs.writeFileSync(path.join(repo, "data", "canonical-fixtures", "remove.json"), "{}\n");
    cmd(repo, "add", ".");
    cmd(repo, "commit", "-qm", "fixture baseline");
    const baseCommit = cmd(repo, "rev-parse", "HEAD");
    fs.writeFileSync(path.join(repo, "data", "canonical-fixtures", "old.json"), "{\"score\":2}\n");
    fs.rmSync(path.join(repo, "data", "canonical-fixtures", "remove.json"));
    fs.writeFileSync(path.join(repo, "data", "value", "new.json"), "{\"count\":1}\n");
    fn({ repo, home, baseCommit, archive: path.join(home, "archive") });
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
}
test("source scan identifies exact three safe worktree mutations", () => fixture(f => {
  const r = inspectStage20Worktree(f.repo, "2026-11-23");
  assert.equal(r.ok, true);
  assert.equal(r.baseCommit, f.baseCommit);
  assert.equal(r.approved.length, 3);
  assert.equal(r.resumeAuthorized, false);
}));
test("writes, deletion and byte parity reconstruct only in temporary clone", () => fixture(f => {
  const r = captureStage20Worktree(f.repo, "2026-11-23", f.archive);
  assert.equal(r.files, 3); assert.equal(r.writes, 2); assert.equal(r.deletions, 1);
  const checked = inspectDailyWorktreeDelta(f.archive, {
    dayKey: r.dayKey, stageId: r.stageId, baseCommit: r.baseCommit,
    allowedPrefixes: (STAGE20_APPROVED_FAMILIES)
  });
  assert.equal(checked.ok, true);
  const restored = replayDailyWorktreeDeltaToIsolatedClone(f.repo, f.archive, {
    dayKey: r.dayKey, stageId: r.stageId, baseCommit: r.baseCommit,
    allowedPrefixes: (STAGE20_APPROVED_FAMILIES)
  }, f.home);
  assert.equal(fs.readFileSync(path.join(restored.stagingClone, "data", "canonical-fixtures", "old.json"), "utf8"), "{\"score\":2}\n");
  assert.equal(fs.existsSync(path.join(restored.stagingClone, "data", "canonical-fixtures", "remove.json")), false);
  assert.equal(fs.readFileSync(path.join(restored.stagingClone, "data", "value", "new.json"), "utf8"), "{\"count\":1}\n");
}));
test("unknown changed path stops capture before archive creation", () => fixture(f => {
  fs.writeFileSync(path.join(f.repo, "unexpected.txt"), "not approved");
  const p = inspectStage20Worktree(f.repo, "2026-11-23");
  assert.equal(p.ok, false);
  assert.throws(() => captureStage20Worktree(f.repo, "2026-11-23", f.archive), /stage20_capture_denied/);
  assert.equal(fs.existsSync(f.archive), false);
}));
test("unknown data family fails closed", () => {
  const r = evaluateStage20CapturePaths({ dayKey: "2026-11-23",
    paths: ["data/secrets/sensitive.json"] });
  assert.equal(r.ok, false);
});
test("secret-like filenames are not archived", () => {
  const r = evaluateStage20CapturePaths({ dayKey: "2026-11-23",
    paths: ["data/value/private-key.json"] });
  assert.equal(r.ok, false);
});
test("symlink-like traversal filenames are denied", () => {
  assert.equal(evaluateStage20CapturePaths({dayKey:"2026-11-23",
    paths:["data/value/../other.json"]}).ok,false);
});
test("unknown output extension denied", () => {
  assert.equal(evaluateStage20CapturePaths({dayKey:"2026-11-23",
    paths:["data/value/database.sqlite"]}).ok,false);
});
test("duplicate changed path is denied", () => {
  assert.equal(evaluateStage20CapturePaths({dayKey:"2026-11-23",
    paths:["data/value/day.json","data/value/day.json"]}).ok,false);
});
test("invalid date rejected", () => {
  assert.equal(evaluateStage20CapturePaths({dayKey:"today",paths:["data/value/a.json"]}).ok,false);
});
test("empty stage delta cannot be reused", () => {
  assert.equal(evaluateStage20CapturePaths({dayKey:"2026-11-23",paths:[]}).ok,false);
});
test("archive cannot be overwritten by repeat capture", () => fixture(f => {
  captureStage20Worktree(f.repo,"2026-11-23",f.archive);
  assert.throws(() => captureStage20Worktree(f.repo,"2026-11-23",f.archive), /stage20_capture_archive_exists/);
}));

test("ignored Stage20 data output denies capture rather than creating incomplete checkpoint", () => fixture(f => {
  fs.writeFileSync(path.join(f.repo, ".gitignore"), "data/value/ignored.json\n");
  fs.writeFileSync(path.join(f.repo, "data", "value", "ignored.json"), "{\"critical\":true}\n");
  const observed = inspectStage20Worktree(f.repo, "2026-11-23");
  assert.equal(observed.ok, false);
  assert.equal(observed.reason, "stage20_ignored_outputs_unaccounted");
  assert.equal(observed.ignoredDataFileCount, 1);
  assert.equal(observed.resumeAuthorized, false);
  assert.throws(
    () => captureStage20Worktree(f.repo, "2026-11-23", f.archive),
    /stage20_capture_denied:stage20_ignored_outputs_unaccounted/
  );
  assert.equal(fs.existsSync(f.archive), false);
}));
test("ignored files outside data scope do not change Stage20 data admission", () => fixture(f => {
  fs.writeFileSync(path.join(f.repo, ".gitignore"), "scratch.log\n");
  fs.writeFileSync(path.join(f.repo, "scratch.log"), "log\n");
  // Remove the untracked .gitignore itself from the in-scope change inventory.
  cmd(f.repo, "add", ".gitignore");
  cmd(f.repo, "commit", "-qm", "add ignore policy");
  const observed = inspectStage20Worktree(f.repo, "2026-11-23");
  assert.equal(observed.ok, true);
  assert.equal(observed.ignoredDataFileCount, 0);
}));
