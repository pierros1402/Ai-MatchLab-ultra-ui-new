import test from "node:test";
import assert from "node:assert/strict";
import {inspectResearchCacheEnvelope} from "./audit-stage20-research-cache-writer-envelopes.mjs";
const time="2026-11-23T12:00:00.000Z";
function valid(){return {
  meta:{fetchedAt:time,fetchedAtTs:Date.parse(time),version:"research-cache-v2-compact"},
  payload:{competitionContext:null,referee:null,teamNews:null,lineups:null,sources:[],remoteStatus:"unavailable"}
};}
test("exact source-owned v2 compact payload accepted without reuse authorization",()=>{
  const v=inspectResearchCacheEnvelope(valid());
  assert.equal(v.ok,true);
  assert.equal(v.version,"research-cache-v2-compact");
});
test("forged metadata timestamp denied",()=>{
  const x=valid();x.meta.fetchedAtTs+=3000;
  assert.equal(inspectResearchCacheEnvelope(x).reason,"research_cache_time_inconsistent");
});
test("wrong source version denied",()=>{
  const x=valid();x.meta.version="legacy-v1";
  assert.equal(inspectResearchCacheEnvelope(x).reason,"research_cache_version_mismatch");
});
test("absent required payload field denied",()=>{
  const x=valid();delete x.payload.sources;
  assert.equal(inspectResearchCacheEnvelope(x).reason,"research_cache_payload_shape");
});
test("extra arbitrary raw payload key denied",()=>{
  const x=valid();x.payload.raw={private:"synthetic"};
  assert.equal(inspectResearchCacheEnvelope(x).reason,"research_cache_payload_shape");
});
test("malformed payload or source data type denied",()=>{
  const x=valid();x.payload.sources="not-array";
  assert.equal(inspectResearchCacheEnvelope(x).reason,"research_cache_payload_fields_invalid");
  assert.equal(inspectResearchCacheEnvelope(null).reason,"research_cache_not_object");
});
test("invalid ISO instant and invalid epoch rejected",()=>{
  const x=valid();x.meta.fetchedAt="2026-11-23";
  assert.equal(inspectResearchCacheEnvelope(x).reason,"research_cache_time_invalid");
  x.meta.fetchedAt=time;x.meta.fetchedAtTs=0;
  assert.equal(inspectResearchCacheEnvelope(x).reason,"research_cache_time_invalid");
});
