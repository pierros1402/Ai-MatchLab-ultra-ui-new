import test from "node:test";
import assert from "node:assert/strict";
import {ensureDerivedPublicationFoundations as ensure} from "./ensure-derived-publication-foundations.js";

function fixture(initial = false) {
  const calls = [];
  const state = {index:initial,h2h:initial,priors:initial};
  const deps = {
    resolveSeason:()=> "2026-2027",
    ensureIndex:async()=>{calls.push("index");const rebuilt=!state.index;state.index=true;return {ok:true,rebuilt};},
    validateIndex:()=>({ok:state.index}),
    validateH2H:()=>({ok:state.h2h}),
    rebuildH2H:()=>{calls.push("h2h");state.h2h=true;return {ok:true};},
    validatePriors:()=>({ok:state.priors}),
    rebuildPriors:async({targetSeason})=>{assert.equal(targetSeason,"2026-2027");calls.push("priors");state.priors=true;return {ok:true};}
  };
  return {calls,state,deps};
}
test("stale foundations rebuild in order and converge on second pass",async()=>{
  const {calls,deps}=fixture();
  const first=await ensure("2026-11-27",deps);
  assert.deepEqual(first.rebuilt,{index:true,h2h:true,priors:true});
  assert.deepEqual(calls,["index","h2h","priors"]);
  calls.length=0;
  assert.deepEqual((await ensure("2026-11-27",deps)).rebuilt,{index:false,h2h:false,priors:false});
  assert.deepEqual(calls,["index"]);
});
test("failed index prevents downstream writes",async()=>{
  const {calls,deps}=fixture();
  deps.ensureIndex=async()=>({ok:false});
  await assert.rejects(ensure("2026-11-27",deps),/history_index_foundation_not_ready/);
  assert.deepEqual(calls,[]);
});
test("successful H2H builder without valid fingerprint fails closed",async()=>{
  const {calls,deps}=fixture();
  deps.rebuildH2H=()=>({ok:true});
  await assert.rejects(ensure("2026-11-27",deps),/h2h_foundation_not_ready/);
  assert.deepEqual(calls,["index"]);
});
test("failed priors validation prevents success",async()=>{
  const {deps}=fixture();
  deps.rebuildPriors=async()=>({ok:true});
  await assert.rejects(ensure("2026-11-27",deps),/derived_foundation_final_validation_failed/);
});
test("invalid calendar date never invokes builders",async()=>{
  const {calls,deps}=fixture();
  await assert.rejects(ensure("2026-02-30",deps),/invalid_foundation_recovery_day/);
  assert.deepEqual(calls,[]);
});
