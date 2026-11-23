import test from "node:test";
import assert from "node:assert/strict";
import {classifyResearchCacheFreshness,RESEARCH_CACHE_TTL_MINUTES}
  from "./audit-stage20-research-cache-freshness.mjs";
const base=Date.parse("2026-11-23T10:00:00.000Z");
function envelope(ts=base) {
  return {
    meta:{fetchedAt:new Date(ts).toISOString(),fetchedAtTs:ts,version:"research-cache-v2-compact"},
    payload:{competitionContext:null,referee:null,teamNews:null,lineups:null,sources:[],remoteStatus:"unavailable"}
  };
}
const instant=ms=>new Date(ms).toISOString();
test("within 180-minute source-owned TTL is a candidate, not approval to skip stage",()=>{
  assert.equal(RESEARCH_CACHE_TTL_MINUTES,180);
  assert.equal(classifyResearchCacheFreshness(envelope(),instant(base+179*60000)).reusable,true);
});
test("exact TTL boundary is permitted as in original runtime greater-than comparison",()=>{
  assert.equal(classifyResearchCacheFreshness(envelope(),instant(base+180*60000)).reusable,true);
});
test("one millisecond past TTL fails closed",()=>{
  assert.equal(classifyResearchCacheFreshness(envelope(),instant(base+180*60000+1)).reason,"expired_cache");
});
test("future dated cache must not be reused even under clock rollback",()=>{
  assert.equal(classifyResearchCacheFreshness(envelope(base+60000),instant(base)).reason,
    "future_dated_cache");
});
test("invalid timestamp and forged version never qualify for reuse",()=>{
  const x=envelope();x.meta.version="cache-v1";
  assert.equal(classifyResearchCacheFreshness(x,instant(base)).reason,"invalid_cache_envelope");
  assert.equal(classifyResearchCacheFreshness(envelope(),"not-a-time").reusable,false);
});
test("several-hours-later historical recovery cannot reuse an expired research envelope",()=>{
  const r=classifyResearchCacheFreshness(envelope(),"2026-11-23T17:00:00.000Z");
  assert.equal(r.reusable,false);
  assert.equal(r.reason,"expired_cache");
});
