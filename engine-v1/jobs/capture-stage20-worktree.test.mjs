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
  for (const dayKey of ["today", "2026-02-30", "2026-11-31", "2026-13-01", "0099-02-29", "2025-02-29", "2100-02-29"]) {
    assert.equal(evaluateStage20CapturePaths({dayKey,paths:["data/value/a.json"]}).ok,false,dayKey);
  }
});
test("real leap day and regular day retain Stage20 admission", () => {
  for (const dayKey of ["2000-02-29", "2024-02-29", "2026-11-24"]) {
    const result=evaluateStage20CapturePaths({dayKey,paths:["data/value/a.json"]});
    assert.equal(result.ok,true,dayKey);
    assert.deepEqual(result.approved,["data/value/a.json"]);
  }
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

test("canonical dated Details for previous and current days are admitted and byte-exact", () => fixture(f => {
  for(const day of ["2026-11-22","2026-11-23"]) {
    const dir=path.join(f.repo,"data","details",day);
    fs.mkdirSync(dir,{recursive:true});
    const compact=day.replaceAll("-","");
    fs.writeFileSync(path.join(dir,"cid_eng1_arsenal_chelsea_"+compact+".json"),
      JSON.stringify({matchId:"cid_eng1_arsenal_chelsea_"+compact})+"\n");
  }
  const inspected=inspectStage20Worktree(f.repo,"2026-11-23");
  assert.equal(inspected.ok,true);
  assert.equal(inspected.approved.length,5);
  const archive=captureStage20Worktree(f.repo,"2026-11-23",f.archive);
  assert.equal(archive.files,5);
  const checked=inspectDailyWorktreeDelta(f.archive,{
    dayKey:"2026-11-23",stageId:"daily-cycle",baseCommit:f.baseCommit,
    allowedPrefixes:STAGE20_APPROVED_FAMILIES
  });
  assert.equal(checked.ok,true);
  const restored=replayDailyWorktreeDeltaToIsolatedClone(f.repo,f.archive,{
    dayKey:"2026-11-23",stageId:"daily-cycle",baseCommit:f.baseCommit,
    allowedPrefixes:STAGE20_APPROVED_FAMILIES
  },f.home);
  assert.ok(fs.existsSync(path.join(restored.stagingClone,"data/details/2026-11-22/cid_eng1_arsenal_chelsea_20261122.json")));
  assert.ok(fs.existsSync(path.join(restored.stagingClone,"data/details/2026-11-23/cid_eng1_arsenal_chelsea_20261123.json")));
}));
test("wrong canonical day and noncanonical Details cannot enter capture despite approved prefix",()=>fixture(f=>{
  const dir=path.join(f.repo,"data/details/2026-11-23");
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,"cid_eng1_arsenal_chelsea_20261122.json"),"{}\n");
  const check=inspectStage20Worktree(f.repo,"2026-11-23");
  assert.equal(check.ok,false);
  assert.equal(check.reason,"stage20_capture_unapproved_paths");
  assert.throws(()=>captureStage20Worktree(f.repo,"2026-11-23",f.archive),/stage20_capture_denied/);
  assert.equal(fs.existsSync(f.archive),false);
}));
test("invalid calendar date and secret-like Details filename remain denied",()=>{
  for(const name of [
    "data/details/2026-02-30/cid_eng1_a_b_20260230.json",
    "data/details/2026-11-23/private-key.json",
    "data/details/2026-11-23/cid_eng1_a_b_20261122.json"
  ]) assert.equal(evaluateStage20CapturePaths({dayKey:"2026-11-23",paths:[name]}).ok,false);
});
