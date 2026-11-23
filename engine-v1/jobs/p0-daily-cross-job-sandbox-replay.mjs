// GitHub Actions sandbox cross-job transport proof; not a production entrypoint.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import {runFreshRunnerSandboxDAG} from "../core/daily-resume-fresh-runner-sandbox.mjs";
const mode=process.argv[2],base=path.resolve(process.argv[3]||path.join(os.tmpdir(),"aiml-cross-job"));
const storeRoot=path.join(base,"store"),workspace=path.join(base,"workspace");
const hash=x=>crypto.createHash("sha256").update(x).digest("hex");
const dayKey="2026-11-23",producerCommit="a".repeat(40),contractSha256="b".repeat(64);
const stages=Array.from({length:28},(_,i)=>({
  id:"stage-"+String(i+1).padStart(2,"0"),
  dependsOn:i?["stage-"+String(i).padStart(2,"0")]:[],
  inputs:[i?"data/part-"+i+".txt":"data/seed.txt"],
  outputs:["data/part-"+(i+1)+".txt"],
  reuseClass:i===27?"gate":"frozen"
}));
const binding={root:workspace,dayKey,producerCommit,contractSha256};
function setup(){
  fs.mkdirSync(path.join(workspace,"data"),{recursive:true});
  fs.mkdirSync(storeRoot,{recursive:true});
  fs.mkdirSync(path.join(base,"scratch"),{recursive:true});
  fs.writeFileSync(path.join(workspace,"data/seed.txt"),"source-bound-seed\n");
}
function execute(s){
  fs.writeFileSync(path.join(workspace,s.outputs[0]),
    fs.readFileSync(path.join(workspace,s.inputs[0]),"utf8")+s.id+"\n");
  return {ok:true};
}
function expected(){return "source-bound-seed\n"+stages.map(s=>s.id+"\n").join("");}
function load(){
  return Object.fromEntries(stages.flatMap(s=>{
    const dir=path.join(storeRoot,dayKey,s.id);
    if(!fs.existsSync(dir))return [];
    const names=fs.readdirSync(dir).filter(n=>/^[a-f0-9]{64}$/.test(n));
    assert.ok(names.length<=1,"archive_ambiguity");
    return names.length?[[s.id,JSON.parse(fs.readFileSync(
      path.join(dir,names[0],"manifest.json"),"utf8"))]]:[];
  }));
}
const run=(prior,callback)=>runFreshRunnerSandboxDAG({stages,binding,previousCheckpoints:prior,
  storeRoot,sandboxRoot:base,runStage:callback,sandboxAuthorized:true});
assert.ok(mode==="produce"||mode==="consume","explicit_ci_mode_required");
if(mode==="produce"){
  assert.equal(fs.existsSync(base),false,"producer_root_must_be_fresh");
  setup();
  await assert.rejects(run({},async s=>{
    if(s.id==="stage-27")throw Error("injected_stage27_crash");
    return execute(s);
  }),/injected_stage27_crash/);
  const checkpoints=load();
  assert.equal(Object.keys(checkpoints).length,26);
  const transport={schema:"ai-matchlab.sandbox-cross-job-transport.v1",dayKey,
    producerCommit,contractSha256,checkpointCount:26,
    expectedSha256:hash(expected()),checkpoints};
  fs.writeFileSync(path.join(storeRoot,"transport.json"),JSON.stringify(transport,null,2)+"\n",
    {flag:"wx"});
  console.log(JSON.stringify({mode,checkpointCount:26,sandboxOnly:true}));
}else{
  assert.ok(fs.existsSync(path.join(storeRoot,"transport.json")),"download_required");
  assert.equal(fs.existsSync(workspace),false,"consumer_workspace_must_be_fresh");
  const transport=JSON.parse(fs.readFileSync(path.join(storeRoot,"transport.json"),"utf8"));
  assert.equal(transport.schema,"ai-matchlab.sandbox-cross-job-transport.v1");
  assert.equal(transport.dayKey,dayKey);
  assert.equal(transport.producerCommit,producerCommit);
  assert.equal(transport.contractSha256,contractSha256);
  assert.equal(transport.checkpointCount,26);
  assert.equal(Object.keys(transport.checkpoints).length,26);
  setup();
  const invoked=[];
  const result=await run(transport.checkpoints,async s=>{invoked.push(s.id);return execute(s);});
  assert.equal(result.restoredStages,26);
  assert.equal(result.executedStages,2);
  assert.deepEqual(invoked,["stage-27","stage-28"]);
  assert.equal(result.resumedFrom,"stage-27");
  assert.equal(result.productionResumeAuthorized,false);
  assert.equal(result.publicationAuthorized,false);
  assert.equal(hash(fs.readFileSync(path.join(workspace,"data/part-28.txt"))),transport.expectedSha256);
  assert.equal(transport.expectedSha256,hash(expected()));
  console.log(JSON.stringify({mode,restoredStages:26,executedStages:2,
    sha256:transport.expectedSha256,sandboxOnly:true,productionResumeAuthorized:false}));
}
