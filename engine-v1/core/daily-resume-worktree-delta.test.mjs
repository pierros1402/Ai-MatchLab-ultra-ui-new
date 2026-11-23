import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { captureDailyWorktreeDelta, inspectDailyWorktreeDelta, replayDailyWorktreeDeltaToIsolatedClone } from "./daily-resume-worktree-delta.mjs";

function cmd(root, ...args) { return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim(); }
function setup(mutated = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-delta-test-"));
  const repo = path.join(root, "git");
  fs.mkdirSync(repo);
  cmd(repo, "init", "-q", "--initial-branch=main");
  cmd(repo, "config", "user.name", "Fixture Bot");
  cmd(repo, "config", "user.email", "fixture@example.invalid");
  fs.mkdirSync(path.join(repo, "output"));
  fs.mkdirSync(path.join(repo, "baseline"));
  fs.writeFileSync(path.join(repo, "output", "one.txt"), "old");
  fs.writeFileSync(path.join(repo, "output", "gone.txt"), "to delete");
  fs.writeFileSync(path.join(repo, "baseline", "keep.txt"), "untouched");
  cmd(repo, "add", ".");
  cmd(repo, "commit", "-qm", "base");
  const baseCommit = cmd(repo, "rev-parse", "HEAD");
  const archive = path.join(root, "archive");
  const options = { dayKey: "2026-11-23", stageId: "daily-cycle",
    baseCommit, allowedPrefixes: ["output/"] };
  if (mutated) {
    fs.writeFileSync(path.join(repo, "output", "one.txt"), "modified");
    fs.rmSync(path.join(repo, "output", "gone.txt"));
    fs.writeFileSync(path.join(repo, "output", "new.txt"), "untracked");
    cmd(repo, "add", "output/one.txt");
  }
  return { root, repo, archive, options };
}
function use(fn, mutated = true) {
  const f = setup(mutated);
  try { fn(f); } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
}
test("modified tracked, deleted tracked and untracked files are archived and replayed", () => use(f => {
  const a = captureDailyWorktreeDelta(f.repo, f.archive, f.options);
  assert.equal(a.files, 3);
  assert.equal(a.writes, 2);
  assert.equal(a.deletions, 1);
  assert.equal(inspectDailyWorktreeDelta(f.archive, f.options).ok, true);
  const restored = replayDailyWorktreeDeltaToIsolatedClone(f.repo, f.archive, f.options, f.root);
  assert.equal(fs.readFileSync(path.join(restored.stagingClone, "output", "one.txt"), "utf8"), "modified");
  assert.equal(fs.readFileSync(path.join(restored.stagingClone, "output", "new.txt"), "utf8"), "untracked");
  assert.equal(fs.existsSync(path.join(restored.stagingClone, "output", "gone.txt")), false);
  assert.equal(fs.readFileSync(path.join(restored.stagingClone, "baseline", "keep.txt"), "utf8"), "untouched");
  assert.equal(fs.readFileSync(path.join(f.repo, "output", "one.txt"), "utf8"), "modified");
}));
test("unchanged worktree cannot become phantom checkpoint", () => use(f => {
  assert.throws(() => captureDailyWorktreeDelta(f.repo, f.archive, f.options),
    /resume_delta_path_count_invalid/);
}, false));
test("source HEAD mismatch is fatal", () => use(f => {
  assert.throws(() => captureDailyWorktreeDelta(f.repo, f.archive,
    { ...f.options, baseCommit: "a".repeat(40) }), /resume_delta_base_mismatch/);
}));
test("unapproved data path is fatal", () => use(f => {
  fs.writeFileSync(path.join(f.repo, "baseline", "keep.txt"), "unauthorized");
  assert.throws(() => captureDailyWorktreeDelta(f.repo, f.archive, f.options),
    /resume_delta_unapproved_path/);
}));
test("corrupt artifact bytes fail before restore", () => use(f => {
  captureDailyWorktreeDelta(f.repo, f.archive, f.options);
  fs.writeFileSync(path.join(f.archive, "files", "output", "one.txt"), "corrupt");
  assert.equal(inspectDailyWorktreeDelta(f.archive, f.options).ok, false);
  assert.throws(() => replayDailyWorktreeDeltaToIsolatedClone(f.repo, f.archive, f.options, f.root),
    /resume_delta_archive_bytes_invalid/);
}));
test("deleted archived output rejected", () => use(f => {
  captureDailyWorktreeDelta(f.repo, f.archive, f.options);
  fs.rmSync(path.join(f.archive, "files", "output", "new.txt"));
  assert.equal(inspectDailyWorktreeDelta(f.archive, f.options).ok, false);
}));
test("extra undeclared archived output rejected", () => use(f => {
  captureDailyWorktreeDelta(f.repo, f.archive, f.options);
  fs.writeFileSync(path.join(f.archive, "files", "output", "extra.txt"), "extra");
  assert.equal(inspectDailyWorktreeDelta(f.archive, f.options).ok, false);
}));
test("tampered deletion tombstone rejected", () => use(f => {
  captureDailyWorktreeDelta(f.repo, f.archive, f.options);
  const m = path.join(f.archive, "manifest.json");
  const doc = JSON.parse(fs.readFileSync(m, "utf8"));
  doc.entries.find(x => x.op === "DELETE").op = "WRITE";
  fs.writeFileSync(m, JSON.stringify(doc));
  assert.equal(inspectDailyWorktreeDelta(f.archive, f.options).ok, false);
}));
test("changed allowlist is incompatible", () => use(f => {
  captureDailyWorktreeDelta(f.repo, f.archive, f.options);
  assert.equal(inspectDailyWorktreeDelta(f.archive,
    { ...f.options, allowedPrefixes: ["baseline/"] }).ok, false);
}));
test("archive overwrites are forbidden", () => use(f => {
  captureDailyWorktreeDelta(f.repo, f.archive, f.options);
  assert.throws(() => captureDailyWorktreeDelta(f.repo, f.archive, f.options),
    /resume_delta_archive_exists/);
}));
test("stale or different day is incompatible", () => use(f => {
  captureDailyWorktreeDelta(f.repo, f.archive, f.options);
  assert.equal(inspectDailyWorktreeDelta(f.archive,
    { ...f.options, dayKey: "2026-11-24" }).ok, false);
}));
test("symlink worktree output rejected", () => use(f => {
  fs.symlinkSync(path.join(f.repo, "baseline", "keep.txt"),
    path.join(f.repo, "output", "link.txt"));
  assert.throws(() => captureDailyWorktreeDelta(f.repo, f.archive, f.options),
    /resume_delta_symlink_forbidden/);
}));
test("symlink archive injection rejected", () => use(f => {
  captureDailyWorktreeDelta(f.repo, f.archive, f.options);
  const p = path.join(f.archive, "files", "output", "new.txt");
  fs.unlinkSync(p);
  fs.symlinkSync(path.join(f.repo, "baseline", "keep.txt"), p);
  assert.equal(inspectDailyWorktreeDelta(f.archive, f.options).ok, false);
}));

test("delta writer accepts explicitly approved canonical Details path",()=>use(f=>{
  const dir=path.join(f.repo,"data/details/2026-11-23");
  fs.mkdirSync(dir,{recursive:true});
  const name="cid_eng1_arsenal_chelsea_20261123.json";
  fs.writeFileSync(path.join(dir,name),"{\"matchId\":\"cid_eng1_arsenal_chelsea_20261123\"}\n");
  const options={...f.options,allowedPrefixes:["data/details/"]};
  const result=captureDailyWorktreeDelta(f.repo,f.archive,options);
  assert.equal(result.writes,1);
  assert.equal(inspectDailyWorktreeDelta(f.archive,options).ok,true);
},false));
test("delta writer rejects malicious Details path even when prefix itself is allowlisted",()=>use(f=>{
  const dir=path.join(f.repo,"data/details/2026-11-23");
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,"private-key.json"),"{}");
  assert.throws(()=>captureDailyWorktreeDelta(f.repo,f.archive,{
    ...f.options,allowedPrefixes:["data/details/"]
  }),/resume_delta_unapproved_details_path/);
  assert.equal(fs.existsSync(f.archive),false);
},false));
