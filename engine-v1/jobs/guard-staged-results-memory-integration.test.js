import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const guard = fileURLToPath(new URL("./guard-staged-data-boundary.js", import.meta.url));
const invoke = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `${command} ${args.join(" ")}: ${result.stderr}`);
};
const fixture = (id, home = 2) => ({matchId:id,ha:"H",gf:home,ga:1,date:"2026-08-20T19:00:00Z"});
const document = (rows, slug = "league") => JSON.stringify({slug,teams:{Home:rows}},null,2);
function scenario(before, after, mode="M") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-staged-preservation-"));
  try {
    invoke("git", ["init", "-q"], dir);
    invoke("git", ["config", "user.email", "test@example.invalid"], dir);
    invoke("git", ["config", "user.name", "Test"], dir);
    fs.writeFileSync(path.join(dir,"README.md"),"baseline");
    const target=path.join(dir,"data","league-memory","results","league.json");
    fs.mkdirSync(path.dirname(target),{recursive:true});
    if(mode==="M") fs.writeFileSync(target,document(before));
    invoke("git",["add","."],dir);
    invoke("git",["commit","-qm","baseline"],dir);
    fs.writeFileSync(target,document(after));
    invoke("git",["add","."],dir);
    const run=spawnSync(process.execPath,[guard,"--enforce-results-preservation"],{cwd:dir,encoding:"utf8"});
    return {code:run.status,output:JSON.parse(run.stdout)};
  } finally {
    fs.rmSync(dir,{recursive:true,force:true});
  }
}
test("real staged modification preserves existing records and permits additions",()=>{
  const r=scenario([fixture("a")],[fixture("a"),fixture("b")]);
  assert.equal(r.code,0);assert.equal(r.output.ok,true);
});
test("real staged shrink is blocked before commit",()=>{
  const r=scenario([fixture("a"),fixture("b")],[fixture("a")]);
  assert.equal(r.code,2);assert.ok(r.output.violations.some(v=>v.reason==="missing_existing_record"));
});
test("real staged score overwrite is blocked before commit",()=>{
  const r=scenario([fixture("a")],[fixture("a",3)]);
  assert.equal(r.code,2);assert.ok(r.output.violations.some(v=>v.reason==="existing_score_changed_without_adjudication"));
});
test("real staged added results-memory file is validated",()=>{
  const r=scenario([], [fixture("a")],"A");
  assert.equal(r.code,0);assert.equal(r.output.ok,true);
});
test("real staged malformed added results-memory fails closed",()=>{
  const r=scenario([], [{matchId:"",ha:"H",gf:2,ga:1}],"A");
  assert.equal(r.code,2);assert.ok(r.output.violations.some(v=>v.reason==="results_memory_preservation_unverifiable"));
});

test("real staged rename of results memory cannot silently bypass preservation", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-results-rename-"));
  try {
    invoke("git", ["init", "-q"], dir);
    invoke("git", ["config", "user.email", "test@example.invalid"], dir);
    invoke("git", ["config", "user.name", "Test"], dir);
    const root = path.join(dir, "data", "league-memory", "results");
    fs.mkdirSync(root, {recursive:true});
    fs.writeFileSync(path.join(root, "old.json"), document([fixture("a")], "old"));
    invoke("git", ["add", "."], dir);
    invoke("git", ["commit", "-qm", "baseline"], dir);
    invoke("git", ["mv", "data/league-memory/results/old.json",
      "data/league-memory/results/new.json"], dir);
    const run = spawnSync(process.execPath,
      [guard, "--enforce-results-preservation"], {cwd:dir,encoding:"utf8"});
    assert.equal(run.status, 2);
    const report = JSON.parse(run.stdout);
    assert.ok(report.violations.some(v =>
      v.reason === "results_memory_path_mutation_requires_adjudication"));
  } finally { fs.rmSync(dir, {recursive:true,force:true}); }
});

test("a single violated result file rejects the entire staged multi-file set", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-results-atomic-"));
  try {
    invoke("git", ["init", "-q"], dir);
    invoke("git", ["config", "user.email", "test@example.invalid"], dir);
    invoke("git", ["config", "user.name", "Test"], dir);
    const root = path.join(dir, "data", "league-memory", "results");
    fs.mkdirSync(root, {recursive:true});
    fs.writeFileSync(path.join(root, "one.json"), document([fixture("a")], "one"));
    fs.writeFileSync(path.join(root, "two.json"), document([fixture("x"), fixture("y")], "two"));
    invoke("git", ["add", "."], dir);
    invoke("git", ["commit", "-qm", "baseline"], dir);
    fs.writeFileSync(path.join(root, "one.json"), document([fixture("a"), fixture("b")], "one"));
    fs.writeFileSync(path.join(root, "two.json"), document([fixture("x")], "two"));
    invoke("git", ["add", "."], dir);
    const run = spawnSync(process.execPath,
      [guard, "--enforce-results-preservation"], {cwd:dir,encoding:"utf8"});
    assert.equal(run.status, 2);
    const report = JSON.parse(run.stdout);
    assert.equal(report.stagedCount, 2);
    assert.ok(report.violations.some(v => v.path.endsWith("/two.json") &&
      v.reason === "missing_existing_record"));
    assert.ok(!report.violations.some(v => v.path.endsWith("/one.json")));
    // Failure of admission must not mutate the actual committed repository HEAD.
    const committed = spawnSync("git", ["show", "HEAD:data/league-memory/results/two.json"],
      {cwd:dir, encoding:"utf8"});
    assert.equal(committed.status, 0);
    assert.equal(JSON.parse(committed.stdout).teams.Home.length, 2);
  } finally { fs.rmSync(dir, {recursive:true,force:true}); }
});

test("copied results payload with mismatching slug is blocked even if Git reports it as A", () => {
  const r = scenario([], [fixture("a")], "A");
  assert.equal(r.code, 0);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-results-copy-"));
  try {
    invoke("git", ["init", "-q"], dir);
    invoke("git", ["config", "user.email", "test@example.invalid"], dir);
    invoke("git", ["config", "user.name", "Test"], dir);
    fs.writeFileSync(path.join(dir,"README.md"),"baseline");
    invoke("git", ["add", "."], dir);
    invoke("git", ["commit", "-qm", "baseline"], dir);
    const root = path.join(dir,"data","league-memory","results");
    fs.mkdirSync(root,{recursive:true});
    fs.writeFileSync(path.join(root,"other.json"), document([fixture("a")],"league"));
    invoke("git",["add","."],dir);
    const run = spawnSync(process.execPath,[guard,"--enforce-results-preservation"],
      {cwd:dir,encoding:"utf8"});
    assert.equal(run.status,2);
    const report=JSON.parse(run.stdout);
    assert.ok(report.violations.some(v=>v.reason==="results_memory_slug_path_mismatch"));
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
