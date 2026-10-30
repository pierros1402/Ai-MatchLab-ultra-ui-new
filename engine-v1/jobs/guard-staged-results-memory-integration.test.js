import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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

test("exact staged write set binds bytes but never grants score-change approval", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-write-set-"));
  try {
    invoke("git",["init","-q"],dir);
    invoke("git",["config","user.email","test@example.invalid"],dir);
    invoke("git",["config","user.name","Test"],dir);
    const file = "data/league-memory/results/league.json";
    const target = path.join(dir,file);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    const before=document([fixture("a")]);
    const after=document([fixture("a",3)]);
    fs.writeFileSync(target,before);
    invoke("git",["add","."],dir);
    invoke("git",["commit","-qm","baseline"],dir);
    fs.writeFileSync(target,after);
    invoke("git",["add","."],dir);
    const hash=b=>createHash("sha256").update(b).digest("hex");
    const manifest=path.join(dir,"write-set.json");
    fs.writeFileSync(manifest,JSON.stringify({
      schema:"ai-matchlab.results-write-set.v1",
      entries:[{path:file,status:"M",beforeSha256:hash(before),afterSha256:hash(after)}]
    }));
    const r=spawnSync(process.execPath,[guard,"--enforce-results-preservation",
      "--results-write-set="+manifest],{cwd:dir,encoding:"utf8"});
    assert.equal(r.status,2);
    const report=JSON.parse(r.stdout);
    assert.ok(report.violations.some(v=>v.reason==="existing_score_changed_without_adjudication"));
    assert.ok(!report.violations.some(v=>v.reason==="write_set_content_hash_mismatch"));
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test("tampered hash-bound staged write set is refused without changing HEAD", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),"aiml-write-set-tamper-"));
  try {
    invoke("git",["init","-q"],dir);
    invoke("git",["config","user.email","test@example.invalid"],dir);
    invoke("git",["config","user.name","Test"],dir);
    const relative="data/league-memory/results/league.json";
    const target=path.join(dir,relative);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    const before=document([fixture("a")]);
    const after=document([fixture("a"),fixture("b")]);
    fs.writeFileSync(target,before);
    invoke("git",["add","."],dir);
    invoke("git",["commit","-qm","baseline"],dir);
    const baseline=spawnSync("git",["rev-parse","HEAD"],{cwd:dir,encoding:"utf8"}).stdout.trim();
    fs.writeFileSync(target,after);
    invoke("git",["add","."],dir);
    const hash=b=>createHash("sha256").update(b).digest("hex");
    const manifest=path.join(dir,"write-set.json");
    fs.writeFileSync(manifest,JSON.stringify({
      schema:"ai-matchlab.results-write-set.v1",
      entries:[{path:relative,status:"M",beforeSha256:hash(before),afterSha256:hash("different")}]
    }));
    const run=spawnSync(process.execPath,
      [guard,"--enforce-results-preservation","--results-write-set="+manifest],
      {cwd:dir,encoding:"utf8"});
    assert.equal(run.status,2);
    const report=JSON.parse(run.stdout);
    assert.ok(report.violations.some(v=>v.reason==="write_set_content_hash_mismatch"));
    const finalHead=spawnSync("git",["rev-parse","HEAD"],{cwd:dir,encoding:"utf8"}).stdout.trim();
    assert.equal(finalHead,baseline);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test("write set must cover all staged modified results-memory paths",()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"aiml-write-set-scope-"));
  try {
    invoke("git",["init","-q"],dir);
    invoke("git",["config","user.email","test@example.invalid"],dir);
    invoke("git",["config","user.name","Test"],dir);
    const root=path.join(dir,"data","league-memory","results");
    fs.mkdirSync(root,{recursive:true});
    for(const slug of ["one","two"])fs.writeFileSync(path.join(root,slug+".json"),document([fixture("a")],slug));
    invoke("git",["add","."],dir);
    invoke("git",["commit","-qm","baseline"],dir);
    for(const slug of ["one","two"])fs.writeFileSync(path.join(root,slug+".json"),document([fixture("a"),fixture("b")],slug));
    invoke("git",["add","."],dir);
    const hash=b=>createHash("sha256").update(b).digest("hex");
    const p="data/league-memory/results/one.json";
    const before=document([fixture("a")],"one"),after=document([fixture("a"),fixture("b")],"one");
    const manifest=path.join(dir,"write-set.json");
    fs.writeFileSync(manifest,JSON.stringify({schema:"ai-matchlab.results-write-set.v1",
      entries:[{path:p,status:"M",beforeSha256:hash(before),afterSha256:hash(after)}]}));
    const r=spawnSync(process.execPath,[guard,"--enforce-results-preservation",
      "--results-write-set="+manifest],{cwd:dir,encoding:"utf8"});
    assert.equal(r.status,2);
    const report=JSON.parse(r.stdout);
    assert.ok(report.violations.some(v=>v.reason==="write_set_unapproved_staged_path"&&v.path.endsWith("two.json")));
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test("hash-binding uses exact staged bytes including non-ASCII team names",()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"aiml-unicode-hashes-"));
  try {
    invoke("git",["init","-q"],dir);
    invoke("git",["config","user.email","test@example.invalid"],dir);
    invoke("git",["config","user.name","Test"],dir);
    const relative="data/league-memory/results/league.json";
    const target=path.join(dir,relative);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    const before=JSON.stringify({slug:"league",teams:{"Αθήνα":[fixture("one")]}},null,2);
    const after=JSON.stringify({slug:"league",teams:{"Αθήνα":[fixture("one"),fixture("two")]}},null,2);
    fs.writeFileSync(target,before,"utf8");
    invoke("git",["add","."],dir);
    invoke("git",["commit","-qm","baseline"],dir);
    fs.writeFileSync(target,after,"utf8");
    invoke("git",["add","."],dir);
    const digest=b=>createHash("sha256").update(Buffer.from(b,"utf8")).digest("hex");
    const manifest=path.join(dir,"write-set.json");
    fs.writeFileSync(manifest,JSON.stringify({schema:"ai-matchlab.results-write-set.v1",
      entries:[{path:relative,status:"M",beforeSha256:digest(before),afterSha256:digest(after)}]}));
    const r=spawnSync(process.execPath,[guard,"--enforce-results-preservation",
      "--results-write-set="+manifest],{cwd:dir,encoding:"utf8"});
    assert.equal(r.status,0,r.stdout+" "+r.stderr);
    assert.equal(JSON.parse(r.stdout).ok,true);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test("new staged results-memory file with partial score is denied", () => {
  const r = scenario([], [{...fixture("a"),ga:null}], "A");
  assert.equal(r.code, 2);
  assert.ok(r.output.violations.some(v =>
    v.reason === "results_memory_preservation_unverifiable" &&
    String(v.error).includes("results_memory_partial_score")));
});

function canonicalScenario(before, after) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-canonical-boundary-"));
  try {
    invoke("git", ["init", "-q"], dir);
    invoke("git", ["config", "user.email", "test@example.invalid"], dir);
    invoke("git", ["config", "user.name", "Test"], dir);
    const target = path.join(dir, "data", "canonical-fixtures", "2026-10-30", "league.json");
    fs.mkdirSync(path.dirname(target), {recursive:true});
    fs.writeFileSync(target, JSON.stringify({fixtures:before}));
    invoke("git", ["add", "."], dir);
    invoke("git", ["commit", "-qm", "baseline"], dir);
    fs.writeFileSync(target, JSON.stringify({fixtures:after}));
    invoke("git", ["add", "."], dir);
    const run = spawnSync(process.execPath, [guard, "--enforce-canonical-row-preservation"], {cwd:dir,encoding:"utf8"});
    return {status:run.status,report:JSON.parse(run.stdout)};
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
}
test("staged canonical identity replacement is rejected even with same row count", () => {
  const r = canonicalScenario([{canonicalId:"a",status:"SCHEDULED"}],[{canonicalId:"b",status:"SCHEDULED"}]);
  assert.equal(r.status,2);
  assert.ok(r.report.violations.some(v=>v.reason==="canonical_identity_missing"));
});
test("staged canonical duplicate ids are rejected", () => {
  const r = canonicalScenario([{canonicalId:"a",status:"SCHEDULED"}],
    [{canonicalId:"a",status:"SCHEDULED"},{canonicalId:"a",status:"SCHEDULED"}]);
  assert.equal(r.status,2);
  assert.ok(r.report.violations.some(v=>v.reason==="canonical_identity_unverifiable"));
});
test("staged canonical final score mutation is rejected", () => {
  const r = canonicalScenario([{canonicalId:"a",status:"FT",homeScore:2,awayScore:1}],
    [{canonicalId:"a",status:"FT",homeScore:3,awayScore:1}]);
  assert.equal(r.status,2);
  assert.ok(r.report.violations.some(v=>v.reason==="canonical_verified_terminal_mutation"));
});
test("staged canonical additive fixture update passes", () => {
  const r = canonicalScenario([{canonicalId:"a",status:"SCHEDULED"}],
    [{canonicalId:"a",status:"SCHEDULED"},{canonicalId:"b",status:"SCHEDULED"}]);
  assert.equal(r.status,0);
  assert.equal(r.report.ok,true);
});

function verifiedFinalScenario(before, after) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"aiml-verified-final-"));
  try {
    invoke("git",["init","-q"],dir);
    invoke("git",["config","user.email","test@example.invalid"],dir);
    invoke("git",["config","user.name","Test"],dir);
    const relative="data/final-results/2026-10-30/cid_abc.json";
    const target=path.join(dir,relative);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    if (before) fs.writeFileSync(target,JSON.stringify(before));
    else fs.writeFileSync(path.join(dir,"README.md"),"empty baseline");
    invoke("git",["add","."],dir);
    invoke("git",["commit","-qm","baseline"],dir);
    fs.writeFileSync(target,JSON.stringify(after));
    invoke("git",["add","."],dir);
    const run=spawnSync(process.execPath,[guard,"--enforce-verified-final-preservation"],{cwd:dir,encoding:"utf8"});
    return {status:run.status,report:JSON.parse(run.stdout)};
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
}
const verified = (h=2,a=1) => ({
  schema:"ai-matchlab.verified-final-result.v1",verifiedFinalTruth:true,
  matchId:"cid_abc",dayKey:"2026-10-30",
  homeScore:h,awayScore:a,finalScore:{homeScore:h,awayScore:a}
});
test("staged verified-final score rewrite fails closed",()=>{
  const r=verifiedFinalScenario(verified(),verified(3,1));
  assert.equal(r.status,2);
  assert.ok(r.report.violations.some(v=>v.reason==="verified_final_truth_mutation_requires_adjudication"));
});
test("staged verified-final provenance-only update is allowed",()=>{
  const r=verifiedFinalScenario({...verified(),source:"old"},{...verified(),source:"new"});
  assert.equal(r.status,0);
});
test("staged verified-final filename identity spoof fails closed",()=>{
  const r=verifiedFinalScenario(null,{...verified(),matchId:"cid_wrong"});
  assert.equal(r.status,2);
  assert.ok(r.report.violations.some(v=>v.reason==="verified_final_staged_invalid"));
});
test("staged new valid verified-final is allowed",()=>{
  const r=verifiedFinalScenario(null,verified());
  assert.equal(r.status,0);
});

test("publication guard rejects arbitrary canonical IDs sharing a provider fixture",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"aiml-provider-collision-"));
 try {
  invoke("git",["init","-q"],dir);
  invoke("git",["config","user.email","test@example.invalid"],dir);
  invoke("git",["config","user.name","Test"],dir);
  fs.writeFileSync(path.join(dir,"README.md"),"baseline");
  invoke("git",["add","."],dir);
  invoke("git",["commit","-qm","baseline"],dir);
  const target=path.join(dir,"data","canonical-fixtures","2026-10-29","afc.cup.json");
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,JSON.stringify({fixtures:[
   {canonicalId:"cid_arbitrary_one",source:"espn",sourceId:"9911",status:"FT",scoreHome:1,scoreAway:0},
   {canonicalId:"cid_arbitrary_two",source:"espn",sourceId:"9911",status:"FT",scoreHome:1,scoreAway:0}
  ]}));
  invoke("git",["add","."],dir);
  const run=spawnSync(process.execPath,[guard],{cwd:dir,encoding:"utf8"});
  assert.equal(run.status,2,run.stdout+" "+run.stderr);
  const report=JSON.parse(run.stdout);
  assert.ok(report.violations.some(v=>v.reason==="canonical_provider_identity_collision"));
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
