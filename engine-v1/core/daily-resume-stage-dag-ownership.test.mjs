import test from "node:test";
import assert from "node:assert/strict";
import {validateStage20DAGOutputOwnership as validate} from "./daily-resume-stage-dag-ownership.mjs";
const stages=[
  {id:"acquire",dependsOn:[],inputs:["data/seed.json"],outputs:["data/first.json"]},
  {id:"model",dependsOn:["acquire"],inputs:["data/first.json"],outputs:["data/model.json"]},
  {id:"publish",dependsOn:["model"],inputs:["data/model.json"],outputs:["data/result.json"]}
];
const check=p=>validate(p);
test("explicit unique output producer/consumer chain passes shape only",()=>{
  const r=check(stages);
  assert.equal(r.stageCount,3);
  assert.equal(r.pathOwnershipShapeVerified,true);
  assert.equal(r.outputBytesVerified,false);
  assert.equal(r.resumeAuthorized,false);
});
test("two stages cannot own the same output path",()=>{
  const a=[stages[0],{id:"independent",dependsOn:[],inputs:["data/other.json"],
    outputs:["data/first.json"]}];
  assert.throws(()=>check(a),/stage20_output_owned_by_multiple_stages/);
});
test("undeclared source-stage dependency denies even when stage order is correct",()=>{
  const a=stages.map(x=>({...x}));
  a[1]={...a[1],dependsOn:[]};
  assert.throws(()=>check(a),/stage20_unbound_input_producer_dependency/);
});
test("an unrelated dependency without declared input cannot masquerade as bound",()=>{
  const a=stages.map(x=>({...x}));
  a[2]={...a[2],dependsOn:["acquire","model"]};
  assert.throws(()=>check(a),/stage20_dependency_without_declared_input/);
});
test("in-place output mutation cannot be classified as frozen checkpoint",()=>{
  const a=[{id:"step",dependsOn:[],inputs:["data/a.json"],outputs:["data/a.json"]}];
  assert.throws(()=>check(a),/stage20_inplace_output_forbidden/);
});
test("duplicate input declaration denies",()=>{
  const a=[{...stages[0],inputs:["data/seed.json","data/seed.json"]}];
  assert.throws(()=>check(a),/stage20_duplicate_input/);
});
test("independent disjoint DAG branches are permitted",()=>{
  const a=[stages[0],
    {id:"other",dependsOn:[],inputs:["data/other-seed.json"],outputs:["data/other.json"]},
    {...stages[1]},
    {...stages[2]}];
  const r=check(a);
  assert.equal(r.stageCount,4);
  assert.equal(r.resumeAuthorized,false);
});
test("future dependency still fails underlying graph validation",()=>{
  const a=[{id:"bad",dependsOn:["later"],inputs:["data/a.json"],outputs:["data/b.json"]}];
  assert.throws(()=>check(a),/resume_dependency_order_invalid/);
});
