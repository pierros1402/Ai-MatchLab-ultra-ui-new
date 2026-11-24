import test from "node:test";
import assert from "node:assert/strict";
import {validateVersionedArtifacts as validate} from "./daily-resume-versioned-artifacts.mjs";
const v=(artifact,version)=>({artifact,version});
const stage=(id,inputs,outputs,dependsOn=[])=>({id,inputs,outputs,dependsOn,conditional:false});
const fixture=()=>({initial:[v("details",0)],stages:[
 stage("build",[v("details",0)],[v("details",1)]),
 stage("refresh",[v("details",1)],[v("details",2)],["build"]),
 stage("export",[v("details",2)],[v("snapshot",1)],["refresh"])
]});
test("versioned repeated writers remain advisory",()=>{const x=validate(fixture());assert.equal(x.artifactVersionCount,4);assert.equal(x.stageCount,3);for(const k of ["sourceClosureVerified","outputBytesVerified","resumeAuthorized","publicationAuthorized"])assert.equal(x[k],false);});
for(const [name,mutate,code] of [
 ["stale read",x=>x.stages[2].inputs=[v("details",1)],"stale_or_missing_input"],
 ["missing edge",x=>x.stages[1].dependsOn=[],"missing_producer_dependency"],
 ["skipped version",x=>x.stages[1].outputs=[v("details",3)],"output_sequence_invalid"],
 ["overwrite without input",x=>{x.stages[1].inputs=[];x.stages[1].dependsOn=[];},"previous_version_unbound"],
 ["conditional branch",x=>x.stages[1].conditional=true,"conditional_unresolved"],
 ["duplicate output",x=>x.stages[1].outputs.push(v("details",2)),"duplicate_output"],
 ["future dependency",x=>x.stages[0].dependsOn=["export"],"dependency_invalid"],
 ["unbound edge",x=>x.stages[2].dependsOn.push("build"),"unbound_dependency"],
 ["duplicate input",x=>x.stages[0].inputs.push(v("details",0)),"duplicate_input"],
 ["invalid initial",x=>x.initial=[v("details",1)],"initial_invalid"],
 ["invalid reference",x=>x.stages[0].outputs=[v("../escape",1)],"ref_invalid"]
])test(name,()=>{const x=fixture();mutate(x);assert.throws(()=>validate(x),new RegExp("versioned_"+code));});
