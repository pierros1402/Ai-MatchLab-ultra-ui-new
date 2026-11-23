import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runFreshRunnerSandboxDAG } from "./daily-resume-fresh-runner-sandbox.mjs";

function fixture() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-fresh-runner-"));
  const storeRoot = path.join(tmp, "store");
  const scratch = path.join(tmp, "scratch");
  fs.mkdirSync(storeRoot); fs.mkdirSync(scratch);
  const stages = Array.from({length: 28}, (_, n) => ({
    id: "stage-" + String(n+1).padStart(2,"0"),
    dependsOn: n ? ["stage-" + String(n).padStart(2,"0")] : [],
    inputs: [n ? "data/part-" + n + ".txt" : "data/seed.txt"],
    outputs: ["data/part-" + (n+1) + ".txt"],
    reuseClass: n === 27 ? "gate" : "frozen"
  }));
  const makeRunner = name => {
    const root = path.join(tmp, name);
    fs.mkdirSync(path.join(root, "data"), {recursive:true});
    fs.writeFileSync(path.join(root, "data/seed.txt"), "initial-seed\n");
    const binding = { root, dayKey: "2026-11-23",
      producerCommit: "a".repeat(40), contractSha256: "b".repeat(64) };
    const execute = async s => {
      const value = fs.readFileSync(path.join(root,s.inputs[0]),"utf8");
      fs.writeFileSync(path.join(root,s.outputs[0]),value+s.id+"\n");
      return {ok:true};
    };
    return {root,binding,execute};
  };
  const load = binding => Object.fromEntries(stages.flatMap(s => {
    const dir = path.join(storeRoot,binding.dayKey,s.id);
    if (!fs.existsSync(dir)) return [];
    const entries=fs.readdirSync(dir).filter(x=>/^[a-f0-9]{64}$/.test(x));
    return entries.length ? [[s.id,JSON.parse(fs.readFileSync(
      path.join(dir,entries.at(-1),"manifest.json"),"utf8"))]] : [];
  }));
  const run = (runner, prior={}, exec=runner.execute, overrides={}) =>
    runFreshRunnerSandboxDAG({ stages,binding:runner.binding,
      previousCheckpoints:prior,storeRoot,sandboxRoot:tmp,
      sandboxAuthorized:true,runStage:exec,...overrides });
  const clean = () => fs.rmSync(tmp,{recursive:true,force:true});
  return {tmp,stages,storeRoot,makeRunner,load,run,clean};
}
test("new runner restores 26 verified archives after stage-27 interruption",async()=>{
  const f=fixture();
  try {
    const first=f.makeRunner("first");
    await assert.rejects(f.run(first,{},async s=>{
      if(s.id==="stage-27")throw Error("injected_crash");
      return first.execute(s);
    }),/injected_crash/);
    const second=f.makeRunner("fresh");
    assert.equal(fs.existsSync(path.join(second.root,"data/part-1.txt")),false);
    const invoked=[];
    const result=await f.run(second,f.load(first.binding),async s=>{
      invoked.push(s.id);return second.execute(s);
    });
    assert.equal(result.restoredStages,26);
    assert.equal(result.executedStages,2);
    assert.deepEqual(invoked,["stage-27","stage-28"]);
    assert.equal(result.productionResumeAuthorized,false);
    const output=fs.readFileSync(path.join(second.root,"data/part-28.txt"));
    const baseline=f.makeRunner("baseline");
    // Separate archives are content-addressed; baseline execution is a fresh no-prior run.
    await f.run(baseline);
    assert.deepEqual(output,fs.readFileSync(path.join(baseline.root,"data/part-28.txt")));
  } finally {f.clean();}
});
test("changed original input forces rebuild on fresh runner",async()=>{
  const f=fixture();
  try {
    const first=f.makeRunner("first");
    await f.run(first);
    const next=f.makeRunner("next");
    fs.writeFileSync(path.join(next.root,"data/seed.txt"),"different-seed\n");
    const result=await f.run(next,f.load(first.binding));
    assert.equal(result.restoredStages,0);
    assert.equal(result.executedStages,28);
    assert.equal(result.resumedFrom,"stage-01");
  } finally {f.clean();}
});
test("corrupted archive is rejected, not silently trusted",async()=>{
  const f=fixture();
  try {
    const first=f.makeRunner("first");
    await f.run(first);
    const cp=f.load(first.binding),bad=cp["stage-07"];
    const target=path.join(f.storeRoot,first.binding.dayKey,"stage-07",
      bad.evidenceSha256,"outputs/data/part-7.txt");
    fs.writeFileSync(target,"untrusted");
    const next=f.makeRunner("next"),calls=[];
    await assert.rejects(f.run(next,cp,async s=>{
      calls.push(s.id);return next.execute(s);
    }),/resume_archive_existing_mismatch/);
    assert.deepEqual(calls,["stage-07"]);
    assert.equal(fs.existsSync(path.join(next.root,"data/part-7.txt")),true);
  } finally {f.clean();}
});
test("volatile stage forces suffix execution even with intact archive",async()=>{
  const f=fixture();
  try {
    const first=f.makeRunner("first"); await f.run(first);
    const next=f.makeRunner("next");
    const stages=f.stages.map((s,i)=>i===4?{...s,reuseClass:"external"}:s);
    const result=await f.run(next,f.load(first.binding),next.execute,{stages});
    assert.equal(result.restoredStages,4);
    assert.equal(result.resumedFrom,"stage-05");
    assert.equal(result.executedStages,24);
  }finally{f.clean();}
});
test("requires explicit sandbox opt-in and denies escaped workspaces",async()=>{
  const f=fixture();
  try {
    const next=f.makeRunner("fresh");
    await assert.rejects(f.run(next,{},next.execute,{sandboxAuthorized:false}),/sandbox_restore_not_authorized/);
    await assert.rejects(f.run(next,{},next.execute,{storeRoot:path.dirname(f.tmp)}),/sandbox_path_outside_boundary/);
  }finally{f.clean();}
});
