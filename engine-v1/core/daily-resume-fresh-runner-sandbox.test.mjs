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

test("late restore failure rolls back previously materialized output files", async () => {
  const f=fixture();
  try {
    const stages=[{id:"stage-01",dependsOn:[],inputs:["data/seed.txt"],
      outputs:["data/a.txt","data/not-dir/part.txt"],reuseClass:"frozen"}];
    const first=f.makeRunner("first");
    await f.run(first,{},async () => {
      fs.writeFileSync(path.join(first.root,"data/a.txt"),"first-output");
      fs.mkdirSync(path.join(first.root,"data/not-dir"));
      fs.writeFileSync(path.join(first.root,"data/not-dir/part.txt"),"second-output");
      return {ok:true};
    },{stages});
    const next=f.makeRunner("fresh");
    const blocker=path.join(next.root,"data/not-dir");
    fs.writeFileSync(blocker,"block-parent-directory");
    let executed=0;
    await assert.rejects(f.run(next,f.load(first.binding),async () => {
      executed++;return {ok:true};
    },{stages}),/ENOTDIR|EEXIST/);
    assert.equal(executed,0,"a validated archive was selected for restoration");
    assert.equal(fs.existsSync(path.join(next.root,"data/a.txt")),false,
      "no partial restored output may survive");
    assert.equal(fs.readFileSync(blocker,"utf8"),"block-parent-directory");
  } finally {f.clean();}
});

test("opt-in sandbox branch-aware resume preserves independent checkpoint after upstream invalidation",async()=>{
  const f=fixture();
  try {
    const stages=[
      {id:"stage-a",dependsOn:[],inputs:["data/seed-a.txt"],outputs:["data/out-a.txt"],reuseClass:"frozen"},
      {id:"stage-b",dependsOn:["stage-a"],inputs:["data/out-a.txt"],outputs:["data/out-b.txt"],reuseClass:"frozen"},
      {id:"stage-c",dependsOn:[],inputs:["data/seed-c.txt"],outputs:["data/out-c.txt"],reuseClass:"frozen"},
      {id:"stage-d",dependsOn:["stage-b","stage-c"],inputs:["data/out-b.txt","data/out-c.txt"],
        outputs:["data/out-d.txt"],reuseClass:"frozen"}
    ];
    const initialize=(name,a)=>{
      const runner=f.makeRunner(name);
      fs.writeFileSync(path.join(runner.root,"data/seed-a.txt"),a);
      fs.writeFileSync(path.join(runner.root,"data/seed-c.txt"),"unchanged-c");
      runner.execute=async stage=>{
        const inputs=stage.inputs.map(input=>fs.readFileSync(path.join(runner.root,input),"utf8")).join("|");
        fs.writeFileSync(path.join(runner.root,stage.outputs[0]),inputs+"/"+stage.id);
        return {ok:true};
      };
      return runner;
    };
    const first=initialize("first-branches","original-a");
    await f.run(first,{},first.execute,{stages,branchAware:true});
    const prior=Object.fromEntries(stages.map(stage=>{
      const folder=path.join(f.storeRoot,first.binding.dayKey,stage.id);
      const name=fs.readdirSync(folder).find(x=>/^[a-f0-9]{64}$/.test(x));
      return [stage.id,JSON.parse(fs.readFileSync(path.join(folder,name,"manifest.json"),"utf8"))];
    }));
    const next=initialize("next-branches","changed-a");
    const result=await f.run(next,prior,next.execute,{stages,branchAware:true});
    assert.equal(result.branchAwareEvaluation,true);
    assert.deepEqual(result.decisions.map(item=>[item.stageId,item.decision]),[
      ["stage-a","EXECUTED"],["stage-b","EXECUTED"],
      ["stage-c","RESTORED_VERIFIED"],["stage-d","EXECUTED"]
    ]);
    assert.equal(result.restoredStages,1);
    assert.equal(result.executedStages,3);
    assert.equal(result.productionResumeAuthorized,false);
    assert.equal(result.publicationAuthorized,false);
    const baseline=initialize("uninterrupted-branches","changed-a");
    await f.run(baseline,{},baseline.execute,{stages,branchAware:true});
    assert.deepEqual(fs.readFileSync(path.join(next.root,"data/out-d.txt")),
      fs.readFileSync(path.join(baseline.root,"data/out-d.txt")));
    const conservative=initialize("conservative-branches","changed-a");
    const old=await f.run(conservative,prior,conservative.execute,{stages});
    assert.equal(old.branchAwareEvaluation,false);
    assert.equal(old.executedStages,4);
    assert.equal(old.restoredStages,0);
  }finally{f.clean();}
});
test("branch-aware sandbox never restores external or mandatory stages",async()=>{
  const f=fixture();
  try{
    const stages=[
      {id:"frozen-source",dependsOn:[],inputs:["data/seed.txt"],
        outputs:["data/frozen.txt"],reuseClass:"frozen"},
      {id:"live-data",dependsOn:[],inputs:["data/seed.txt"],
        outputs:["data/live.txt"],reuseClass:"external"},
      {id:"prepublish-gate",dependsOn:["frozen-source","live-data"],
        inputs:["data/frozen.txt","data/live.txt"],outputs:["data/gated.txt"],reuseClass:"frozen"}
    ];
    const create=name=>{
      const runner=f.makeRunner(name);
      runner.execute=async stage=>{
        fs.writeFileSync(path.join(runner.root,stage.outputs[0]),stage.id+" output");
        return {ok:true};
      };
      return runner;
    };
    const first=create("volatile-first");
    await f.run(first,{},first.execute,{stages,branchAware:true});
    const prior=Object.fromEntries(stages.map(stage=>{
      const p=path.join(f.storeRoot,first.binding.dayKey,stage.id);
      const id=fs.readdirSync(p).find(n=>/^[a-f0-9]{64}$/.test(n));
      return [stage.id,JSON.parse(fs.readFileSync(path.join(p,id,"manifest.json"),"utf8"))];
    }));
    const next=create("volatile-next");
    const result=await f.run(next,prior,next.execute,{stages,branchAware:true});
    assert.deepEqual(result.decisions.map(d=>d.decision),
      ["RESTORED_VERIFIED","EXECUTED","EXECUTED"]);
    assert.equal(result.productionResumeAuthorized,false);
  }finally{f.clean();}
});
