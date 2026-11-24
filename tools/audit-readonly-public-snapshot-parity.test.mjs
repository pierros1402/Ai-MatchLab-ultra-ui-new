import test from "node:test";
import assert from "node:assert/strict";
import {inspectReadOnlyPublicSnapshot as inspect,probeReadOnlyPublicSnapshot as probe}
  from "./audit-readonly-public-snapshot-parity.mjs";
const DAY="2026-11-24", A="a".repeat(64),B="b".repeat(64);
const source={ok:true,date:DAY,hash:A};
const published=hash=>({ok:true,date:DAY,manifest:{hash}});
test("matching public hash is read-only VERIFIED",()=>{
  const x=inspect(DAY,source,published(A),200);
  assert.equal(x.verdict,"VERIFIED");
  assert.equal(x.publicHash,A);
  assert.equal(x.syncInvoked,false);
  assert.equal(x.publicationAuthorized,false);
  assert.equal(x.resumeAuthorized,false);
});
test("mismatch does not silently sync",()=>{
  const x=inspect(DAY,source,published(B),200);
  assert.equal(x.verdict,"SYNC_REQUIRED");
  assert.equal(x.expectedHash,A);
  assert.equal(x.publicHash,B);
  assert.equal(x.syncInvoked,false);
});
test("not found is distinct from network outage",()=>{
  assert.equal(inspect(DAY,source,null,404).verdict,"SYNC_REQUIRED");
  assert.equal(inspect(DAY,source,null,503).verdict,"UNAVAILABLE");
});
test("invalid public status/data is never VERIFIED",()=>{
  for(const bad of [{ok:false,date:DAY,manifest:{hash:A}},
    {ok:true,date:"2026-11-23",manifest:{hash:A}},
    {ok:true,date:DAY,manifest:{hash:"invalid"}}])
    assert.equal(inspect(DAY,source,bad,200).verdict,"SYNC_REQUIRED");
});
test("source day or SHA mismatch is always denied",()=>{
  assert.throws(()=>inspect(DAY,{...source,date:"2026-11-23"},published(A),200),
    /readonly_public_source_manifest_invalid/);
  assert.throws(()=>inspect(DAY,{...source,hash:"bad"},published(A),200),
    /readonly_public_source_manifest_invalid/);
});
test("network error is reported as unavailable without attempting sync",async()=>{
  let calls=0;
  const x=await probe(DAY,source,async()=>{calls++;throw Error("timeout")});
  assert.equal(calls,1);
  assert.equal(x.verdict,"UNAVAILABLE");
  assert.equal(x.syncInvoked,false);
});
test("read-only request uses exact day and returns public verdict",async()=>{
  let url,opts;
  const x=await probe(DAY,source,async(u,o)=>{
    url=u;opts=o;
    return {status:200,json:async()=>published(A)};
  });
  assert.equal(url,"https://ai-matchlab-engine.onrender.com/deploy-snapshot?date=2026-11-24");
  assert.ok(opts.signal);
  assert.equal(x.verdict,"VERIFIED");
});
test("unparseable public response is UNAVAILABLE not a false mismatch",async()=>{
  const x=await probe(DAY,source,async()=>({status:200,json:async()=>{throw Error("bad json")}}));
  assert.equal(x.verdict,"UNAVAILABLE");
});
