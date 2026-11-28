import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {computeDeploySnapshotManifestHash} from '../engine-v1/core/deploy-snapshot-release-contract.js';
import {publicSnapshotParityDecision as decide,reconcilePublicSnapshot as reconcile,readPublicSnapshot} from './public-snapshot-parity.mjs';
const sample=()=>{const manifest={ok:true,date:'2026-11-01',counts:{fixtures:1,valuePicks:0,details:0},details:[],valueGate:{ok:true}};manifest.hash=computeDeploySnapshotManifestHash(manifest);return {day:manifest.date,ref:'a'.repeat(40),manifest};};
test('an already committed source still synchronizes when runtime hash differs, without a new Git diff',async()=>{const x=sample(),calls=[];const result=await reconcile({...x,publicRelease:{ok:true,date:x.day,manifest:{hash:'b'.repeat(64)}},synchronize:(...args)=>calls.push(args)});assert.equal(result.action,'SYNC_REQUIRED');assert.deepEqual(calls,[[x.day,x.ref]]);});
test('matching runtime is verified idempotently and never invokes synchronization',async()=>{const x=sample(),before=JSON.stringify(x);for(let i=0;i<2;i++){const result=await reconcile({...x,publicRelease:{ok:true,date:x.day,manifest:x.manifest},synchronize:()=>assert.fail('unexpected sync')});assert.equal(result.action,'VERIFIED');}assert.equal(JSON.stringify(x),before);});
test('missing or cross-day runtime cannot certify the requested release',()=>{const x=sample();assert.equal(decide(x).action,'SYNC_REQUIRED');assert.equal(decide({...x,publicRelease:{ok:true,date:'2026-10-31',manifest:x.manifest}}).action,'SYNC_REQUIRED');});
test('invalid, red, hash-drifted and mutable sources fail before synchronization',async()=>{for(const change of [x=>x.ref='main',x=>x.manifest.valueGate.ok=false,x=>x.manifest.counts.fixtures=7,x=>x.day='2026-10-31']){const x=sample();change(x);await assert.rejects(reconcile({...x,synchronize:()=>assert.fail('unexpected sync')}));}});
test('synchronization failure remains actionable and never returns VERIFIED',async()=>{await assert.rejects(reconcile({...sample(),synchronize:()=>{throw Error('transport_failed');}}),/transport_failed/);});
test('intraday promotion does not depend on newly committed changes and failures remain visible',()=>{const w=readFileSync(new URL('../.github/workflows/intraday-deploy-snapshot-refresh.yml',import.meta.url),'utf8');const step=w.slice(w.indexOf('- name: Promote independent LIVE/FT public checkpoint'),w.indexOf('- name: Persist upcoming Value data alarms'));assert.match(step,/public-snapshot-parity.mjs/);assert.doesNotMatch(step,/TRUTH_SNAPSHOT_PUSHED == 'true'/);assert.match(w,/Surface unverified public truth checkpoint/);});

test('transient public read retries with bounded backoff and eventually succeeds',async()=>{
 const x=sample(), waits=[], calls=[];
 const result=await readPublicSnapshot(x.day,{wait:async ms=>waits.push(ms),fetchImpl:async(url,options)=>{
  calls.push(url);assert.ok(options.signal);
  if(calls.length===1)throw Error('transport');
  if(calls.length===2)return {ok:false,status:503};
  return {ok:true,status:200,json:async()=>({ok:true,date:x.day,manifest:x.manifest})};
 }});
 assert.equal(result.manifest.hash,x.manifest.hash);assert.equal(calls.length,3);assert.deepEqual(waits,[1000,2000]);
});
test('permanent HTTP failures and missing snapshot are not retried',async()=>{
 for(const status of [401,403,404]){
  let count=0;const work=readPublicSnapshot(sample().day,{fetchImpl:async()=>{count++;return {ok:false,status};},wait:()=>assert.fail('unexpected retry')});
  if(status===404)assert.equal(await work,null);else await assert.rejects(work,new RegExp('public_parity_read_failed:'+status));
  assert.equal(count,1);
 }
});
test('exhausted read retry budget fails closed and never synchronizes',async()=>{
 let count=0;const waits=[];
 await assert.rejects(readPublicSnapshot(sample().day,{fetchImpl:async()=>{count++;return {ok:false,status:429};},wait:async ms=>waits.push(ms)}),/public_parity_read_failed:429/);
 assert.equal(count,3);assert.deepEqual(waits,[1000,2000]);
 for(const attempts of [0,4,1.5])await assert.rejects(readPublicSnapshot(sample().day,{attempts,fetchImpl:()=>assert.fail('unexpected network')}),/retry_budget_invalid/);
});
