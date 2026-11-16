// Audit-only common source comparison. No new upstream inputs or scoring.
import {isDeepStrictEqual} from 'node:util';
import {readBoundaryObject} from './autonomous-boundary-receipts.js';
const keys=['A','A2','B','B2'];
const names={A:'plan-a',A2:'plan-a2',B:'plan-b',B2:'plan-b2'};
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const validTime=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const validRef=r=>r&&hex(r.sha256)&&r.path===`data/value/_execution-evidence/objects/${r.sha256.slice(0,2)}/${r.sha256}.json`&&Number.isSafeInteger(r.bytes)&&r.bytes>0;
export function collectCommonSourceRefs(computed){
 const rows={};
 for(const k of keys){const evidence=computed.get(k)?.audit?.decisionInputEvidence;
  const refs=Array.isArray(evidence?.records)?evidence.records.filter(r=>r?.stage==='shared_inputs'&&r.canonicalMatchId===null):[];
  if(evidence?.planId!==names[k]||typeof evidence.executionId!=='string'||refs.length!==1||!validRef(refs[0].receipt))return null;
  rows[k]={executionId:evidence.executionId,receipt:structuredClone(refs[0].receipt)};
 }
 return rows;
}
export function validateCommonSourceRefs(refs){
 if(!refs||!isDeepStrictEqual(Object.keys(refs).sort(),[...keys].sort())||new Set(keys.map(k=>refs[k]?.executionId)).size!==4)throw Error('common_source_ref_set_invalid');
 for(const k of keys)if(typeof refs[k].executionId!=='string'||!refs[k].executionId||!validRef(refs[k].receipt))throw Error('common_source_ref_invalid');
 return refs;
}
export function auditCommonSources(root,record){
 const refs=record.commonSourceRefs;
 const base={scope:'FOUR_EXISTING_PRODUCER_SHARED_INPUT_RECEIPTS',fullCommonInputsCertified:false,rawSourceLineageCertified:false,policyApproved:false};
 if(refs==null)return {...base,status:'UNAVAILABLE',reason:'NO_FOUR_PRODUCER_RECEIPTS'};
 validateCommonSourceRefs(refs);
 if(!validTime(record.commonDecisionAt)||!validTime(record.generatedAt)||Date.parse(record.commonDecisionAt)>Date.parse(record.generatedAt))throw Error('common_source_clock_invalid');
 const bodies={},fixtureBytes={},inputs={};
 const checkedInputs=new Set();
 for(const k of keys){const rr=refs[k],r=readBoundaryObject(root,rr.receipt);
  if(r.schema!=='ai-matchlab.value-decision-input-evidence.v1'||r.planId!==names[k]||r.stage!=='shared_inputs'||r.canonicalMatchId!==null||r.executionId!==rr.executionId||r.targetDay!==record.date||!validTime(r.capturedAt)||Date.parse(r.capturedAt)>Date.parse(record.commonDecisionAt))throw Error('common_source_receipt_scope_mismatch:'+k);
  const expected=k==='A'||k==='A2'?['canonicalFixtures','indexes','priors']:['canonicalFixtures','assessmentRows','assessmentInputSource'];
  if(!isDeepStrictEqual(Object.keys(r.inputs||{}).sort(),expected.sort()))throw Error('common_source_input_shape_mismatch:'+k);
  for(const n of expected.filter(n=>n!=='canonicalFixtures')){
   const ref=r.inputs[n],key=JSON.stringify(ref);
   if(!checkedInputs.has(key)){readBoundaryObject(root,ref);checkedInputs.add(key);}
  }
  const f=readBoundaryObject(root,r.inputs.canonicalFixtures);if(!Array.isArray(f)||f.some(x=>typeof x?.canonicalId!=='string'||!x.canonicalId)||new Set(f.map(x=>x.canonicalId)).size!==f.length)throw Error('common_source_fixture_invalid:'+k);
  if(!isDeepStrictEqual(f.map(x=>x.canonicalId).sort(),record.ledger.map(x=>x.id).sort()))throw Error('common_source_ledger_mismatch:'+k);
  // All fixture fields, not only IDs; preserve original order/hash as separate evidence.
  bodies[k]=[...f].sort((a,b)=>a.canonicalId.localeCompare(b.canonicalId));fixtureBytes[k]=r.inputs.canonicalFixtures.sha256;inputs[k]=r.inputs;
 }
 const fixtureObjectsEqual=keys.every(k=>isDeepStrictEqual(bodies.A,bodies[k]));
 const fixtureBytesEqual=keys.every(k=>fixtureBytes.A===fixtureBytes[k]);
 const aStatisticalInputsEqual=['indexes','priors'].every(n=>inputs.A[n].sha256===inputs.A2[n].sha256);
 const bAssessmentInputsEqual=['assessmentRows','assessmentInputSource'].every(n=>inputs.B[n].sha256===inputs.B2[n].sha256);
 // These are pairwise checks of legacy mathematical inputs, not proof of a single
 // immutable full upstream envelope or identical raw source cutoff. Do not promote.
 return {...base,status:fixtureObjectsEqual&&aStatisticalInputsEqual&&bAssessmentInputsEqual?'PAIRWISE_INPUT_RECEIPTS_MATCH':'INPUT_DRIFT_DETECTED',fixtureObjectsEqual,fixtureBytesEqual,aStatisticalInputsEqual,bAssessmentInputsEqual,fixtures:record.ledger.length,receiptCount:4,fixtureBytes};
}
