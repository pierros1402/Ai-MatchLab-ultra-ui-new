import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {runSandboxRecoveryDAG} from "./daily-resume-stage-executor-sandbox.mjs";
function make(){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"aiml-stage-dag-"));
 const root=path.join(tmp,"workspace"),store=path.join(tmp,"store");
 fs.mkdirSync(path.join(root,"data"),{recursive:true});
 fs.writeFileSync(path.join(root,"data","seed.txt"),"seed\n");
 const binding={root,dayKey:"2026-11-23",producerCommit:"a".repeat(40),contractSha256:"b".repeat(64)};
 const stages=Array.from({length:28},(_,i)=>({
   id:"stage-"+String(i+1).padStart(2,"0"),
   dependsOn:i===0?[]:["stage-"+String(i).padStart(2,"0")],
   inputs:[i===0?"data/seed.txt":"data/part-"+i+".txt"],
   outputs:["data/part-"+(i+1)+".txt"],
   reuseClass:i===27?"gate":"frozen"
 }));
 const execute=async(stage)=>{
   const input=fs.readFileSync(path.join(root,stage.inputs[0]),"utf8");
   fs.writeFileSync(path.join(root,stage.outputs[0]),input+stage.id+"\n");
   return {ok:true};
 };
 const load=()=>Object.fromEntries(stages.flatMap(s=>{
   const dir=path.join(store,binding.dayKey,s.id);
   if(!fs.existsSync(dir))return [];
   const items=fs.readdirSync(dir).filter(x=>/^[a-f0-9]{64}$/.test(x));
   return items.length?[[s.id,JSON.parse(fs.readFileSync(path.join(dir,items.at(-1),"manifest.json"),"utf8"))]]:[];
 }));
 return {tmp,root,store,binding,stages,execute,load};
}
const cleanup=f=>fs.rmSync(f.tmp,{recursive:true,force:true});
test("stage 27 interruption reuses 26 verified stages; byte exact final parity",async()=>{
 const f=make(),clean=make();
 try{
  let call=0;
  await assert.rejects(runSandboxRecoveryDAG({
   stages:f.stages,binding:f.binding,storeRoot:f.store,sandboxAuthorized:true,
   runStage:async(s)=>{call++;if(s.id==="stage-27")throw Error("injected_stage27_crash");return f.execute(s);}
  }),/injected_stage27_crash/);
  assert.equal(call,27);assert.equal(Object.keys(f.load()).length,26);
  const calls=[];
  const resumed=await runSandboxRecoveryDAG({
   stages:f.stages,binding:f.binding,storeRoot:f.store,previousCheckpoints:f.load(),sandboxAuthorized:true,
   runStage:async(s)=>{calls.push(s.id);return f.execute(s);}
  });
  assert.deepEqual(calls,["stage-27","stage-28"]);
  assert.equal(resumed.reusedStages,26);assert.equal(resumed.executedStages,2);
  assert.equal(resumed.resumedFrom,"stage-27");
  await runSandboxRecoveryDAG({stages:clean.stages,binding:clean.binding,storeRoot:clean.store,sandboxAuthorized:true,runStage:clean.execute});
  for(let i=1;i<=28;i++)assert.deepEqual(
   fs.readFileSync(path.join(f.root,"data","part-"+i+".txt")),
   fs.readFileSync(path.join(clean.root,"data","part-"+i+".txt")));
  assert.equal(resumed.productionResumeAuthorized,false);
  assert.equal(resumed.publicationAuthorized,false);
 }finally{cleanup(f);cleanup(clean);}
});
test("corrupt stage output forces earliest invalid stage and entire suffix",async()=>{
 const f=make();
 try{
  await runSandboxRecoveryDAG({stages:f.stages,binding:f.binding,storeRoot:f.store,sandboxAuthorized:true,runStage:f.execute});
  const previous=f.load();
  fs.writeFileSync(path.join(f.root,"data","part-12.txt"),"TAMPER");
  const calls=[];
  const result=await runSandboxRecoveryDAG({
   stages:f.stages,binding:f.binding,storeRoot:f.store,previousCheckpoints:previous,sandboxAuthorized:true,
   runStage:async(s)=>{calls.push(s.id);return f.execute(s);}
  });
  assert.equal(result.reusedStages,11);
  assert.equal(result.resumedFrom,"stage-12");
  assert.equal(result.executedStages,17);
  assert.equal(calls[0],"stage-12");assert.equal(calls.at(-1),"stage-28");
  assert.match(fs.readFileSync(path.join(f.root,"data","part-28.txt"),"utf8"),/stage-28/);
 }finally{cleanup(f);}
});
test("source code binding drift denies all reuse",async()=>{
 const f=make();
 try{
  await runSandboxRecoveryDAG({stages:f.stages,binding:f.binding,storeRoot:f.store,sandboxAuthorized:true,runStage:f.execute});
  const prior=f.load(),calls=[];
  const result=await runSandboxRecoveryDAG({
    stages:f.stages,binding:{...f.binding,producerCommit:"c".repeat(40)},storeRoot:f.store,
    previousCheckpoints:prior,sandboxAuthorized:true,
    runStage:async(s)=>{calls.push(s.id);return f.execute(s);}
  });
  assert.equal(result.reusedStages,0);assert.equal(calls.length,28);
 }finally{cleanup(f);}
});
test("volatile stage forces refresh, and all descendants rerun",async()=>{
 const f=make();
 try{
  await runSandboxRecoveryDAG({stages:f.stages,binding:f.binding,storeRoot:f.store,sandboxAuthorized:true,runStage:f.execute});
  const previous=f.load();const stages=f.stages.map((s,i)=>i===4?{...s,reuseClass:"external"}:s);
  const result=await runSandboxRecoveryDAG({stages,binding:f.binding,storeRoot:f.store,previousCheckpoints:previous,sandboxAuthorized:true,runStage:f.execute});
  assert.equal(result.reusedStages,4);assert.equal(result.resumedFrom,"stage-05");
 }finally{cleanup(f);}
});
test("damaged archive is never accepted from valid-looking manifest",async()=>{
 const f=make();
 try{
  await runSandboxRecoveryDAG({stages:f.stages,binding:f.binding,storeRoot:f.store,sandboxAuthorized:true,runStage:f.execute});
  const prior=f.load(),stage="stage-07",sha=prior[stage].evidenceSha256;
  const artifact=path.join(f.store,f.binding.dayKey,stage,sha,"outputs","data","part-7.txt");
  fs.writeFileSync(artifact,"UNTRUSTED");
  const calls=[];
  // Existing corrupt archive with identical content-addressed ID must fail
  // closed on attempted replacement rather than silently repairing provenance.
  await assert.rejects(runSandboxRecoveryDAG({stages:f.stages,binding:f.binding,storeRoot:f.store,previousCheckpoints:prior,sandboxAuthorized:true,
    runStage:async(s)=>{calls.push(s.id);return f.execute(s);}
  }),/resume_archive_existing_mismatch/);
  assert.equal(calls[0],"stage-07");
 }finally{cleanup(f);}
});
test("sandbox execution requires explicit opt-in",async()=>{
 const f=make();
 try{await assert.rejects(runSandboxRecoveryDAG({stages:f.stages,binding:f.binding,storeRoot:f.store,runStage:f.execute}),/sandbox_execution_not_authorized/);}
 finally{cleanup(f);}
});
