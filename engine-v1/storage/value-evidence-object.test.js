import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createHash} from 'node:crypto';
import {storeEncodedValueEvidence,readEncodedValueEvidence,VALUE_EVIDENCE_CHUNK_BYTES as CHUNK,VALUE_EVIDENCE_INLINE_BYTES as INLINE} from './value-evidence-object.js';
import {createValueDecisionEvidence} from './value-decision-evidence.js';
import {readBoundaryObject} from '../value/autonomous-boundary-receipts.js';
import {auditCommonSources,collectCommonSourceRefs} from '../value/autonomous-common-source-audit.js';
import {isHistoryEvidencePath} from './history-preservation.js';
const sha=b=>createHash('sha256').update(b).digest('hex');
function fixture(fn){const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'aiml-chunked-test-')));try{return fn(root,path.join(root,'data'));}finally{fs.rmSync(root,{recursive:true,force:true});}}
test('legacy evidence references remain exact and corrupted raw content fails closed',()=>fixture((root,data)=>{
 const raw=Buffer.from('{"v":"é"}\n'),ref=storeEncodedValueEvidence(data,raw);
 assert.deepEqual(Object.keys(ref),['path','sha256','bytes']);assert.equal(ref.sha256,sha(raw));assert.deepEqual(readBoundaryObject(root,ref),{v:'é'});
 assert.throws(()=>readBoundaryObject(root,{...ref,bytes:128*1024*1024+1}),/invalid_boundary_object_ref/);
 assert.throws(()=>readBoundaryObject(root,{...ref,path:'../escape'}),/invalid_boundary_object_ref/);
 fs.writeFileSync(path.join(root,ref.path),Buffer.alloc(raw.length,0));assert.throws(()=>readBoundaryObject(root,ref),/boundary_object_bytes_mismatch/);assert.throws(()=>storeEncodedValueEvidence(data,raw),/immutable_value_input_evidence_conflict/);
}));
test('real observed oversized payload length: deterministic chunks, logical hash, archive membership and corruption rejection',()=>fixture((root,data)=>{
 const raw=Buffer.alloc(138862022,97);for(let n=0;n<raw.length;n+=CHUNK)raw.fill(97+n/CHUNK,n,Math.min(n+CHUNK,raw.length));raw[0]=34;raw[raw.length-2]=34;raw[raw.length-1]=10;
 const ref=storeEncodedValueEvidence(data,raw),file=path.join(root,ref.path),manifestBytes=fs.readFileSync(file),manifest=JSON.parse(manifestBytes);
 assert.equal(ref.storage,'chunked-json-v1');assert.equal(ref.sha256,sha(raw));assert.equal(ref.bytes,138862022);assert.equal(ref.manifestSha256,sha(manifestBytes));assert.equal(manifest.chunks.length,9);
 assert.ok(isHistoryEvidencePath(ref.path));for(const c of manifest.chunks){assert.ok(isHistoryEvidencePath(c.path));assert.ok(c.bytes<24*1024*1024);assert.equal(fs.statSync(path.join(root,c.path)).size,c.bytes);}
 assert.deepEqual(storeEncodedValueEvidence(data,raw),ref);assert.equal(Buffer.compare(readEncodedValueEvidence(root,ref),raw),0);assert.equal(readBoundaryObject(root,ref).length,raw.length-3);
 const first=manifest.chunks[0],firstPath=path.join(root,first.path),firstBytes=fs.readFileSync(firstPath);fs.unlinkSync(firstPath);assert.throws(()=>readEncodedValueEvidence(root,ref),/ENOENT/);fs.writeFileSync(firstPath,firstBytes);
 const corrupted=Buffer.from(firstBytes);corrupted[12]^=1;fs.writeFileSync(firstPath,corrupted);assert.throws(()=>readEncodedValueEvidence(root,ref),/bytes_mismatch/);assert.throws(()=>storeEncodedValueEvidence(data,raw),/immutable_value_input_evidence_conflict/);fs.writeFileSync(firstPath,firstBytes);
 assert.throws(()=>readEncodedValueEvidence(root,{...ref,manifestSha256:'0'.repeat(64)}),/bytes_mismatch/);
 const swapped={...manifest,chunks:[manifest.chunks[1],manifest.chunks[0],...manifest.chunks.slice(2)]};const swappedRaw=Buffer.from(JSON.stringify(swapped));fs.writeFileSync(file,swappedRaw);
 assert.throws(()=>readEncodedValueEvidence(root,{...ref,manifestSha256:sha(swappedRaw),manifestBytes:swappedRaw.length}),/boundary_object_bytes_mismatch/);
 fs.writeFileSync(file,manifestBytes);assert.throws(()=>storeEncodedValueEvidence(data,raw,{allowChunking:false}),/receipt_size_limit/);
}));
test('four real decision evidence writers: oversized shared input remains pairwise audited; drift still rejected',()=>fixture((root,data)=>{
 const fixture={canonicalId:'cid_chunked',status:'PRE'},day='2026-11-16',indexes={rows:'x'.repeat(INLINE+128),prospectiveVerifiedForm:{asOf:'2026-11-16T07:00:00.000Z'}};
 const computed=new Map();for(const k of ['A','A2','B','B2']){const shared=k.startsWith('A')?{canonicalFixtures:[fixture],indexes,priors:{}}:{canonicalFixtures:[fixture],assessmentRows:[],assessmentInputSource:'test'};const w=createValueDecisionEvidence(day,'plan-'+k.toLowerCase(),shared,{dataRoot:data});computed.set(k,{audit:{decisionInputEvidence:w.summary()}});}
 const refs=collectCommonSourceRefs(computed),now=new Date().toISOString(),record={date:day,generatedAt:now,commonDecisionAt:now,ledger:[{id:fixture.canonicalId}],commonSourceRefs:refs};
 const a=readBoundaryObject(root,refs.A.receipt),a2=readBoundaryObject(root,refs.A2.receipt);assert.equal(a.inputs.indexes.storage,'chunked-json-v1');assert.deepEqual(a.inputs.indexes,a2.inputs.indexes);
 const same=auditCommonSources(root,record);assert.equal(same.status,'PAIRWISE_INPUT_RECEIPTS_MATCH');assert.equal(same.fullCommonInputsCertified,false);assert.equal(same.rawSourceLineageCertified,false);assert.equal(same.policyApproved,false);
 // New A2 receipt is from a separate execution and genuine changed input, not a hash forgery.
 const changed=createValueDecisionEvidence(day,'plan-a2',{canonicalFixtures:[fixture],indexes:{...indexes,prospectiveVerifiedForm:{asOf:'2026-11-16T07:01:00.000Z'}},priors:{}},{dataRoot:data});const evidence=changed.summary();record.commonSourceRefs={...refs,A2:{executionId:evidence.executionId,receipt:evidence.records[0].receipt}};record.generatedAt=record.commonDecisionAt=new Date().toISOString();assert.equal(auditCommonSources(root,record).status,'INPUT_DRIFT_DETECTED');
}));
