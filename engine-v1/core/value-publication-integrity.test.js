import test from 'node:test';
import assert from 'node:assert/strict';
import {auditValuePublication,requireValuePublicationIntegrity} from './value-publication-integrity.js';
const signature='a'.repeat(64);
function sample({partial=false,pick=false}={}){
 const row={canonicalId:'cid_one',status:partial?'INSUFFICIENT_DATA':'READY',reasons:partial?['minimum_recent_sample']:[]};
 return {date:'2099-10-22',dataReadiness:{date:'2099-10-22',complete:!partial,fixtureUniverse:{count:1,canonicalIds:['cid_one']},summary:{fixtures:1,applicable:1,ready:partial?0:1,insufficient:partial?1:0,byReason:partial?{minimum_recent_sample:1}:{}},rows:[row]},unifiedPlan:{date:'2099-10-22',status:'AVAILABLE',analysisComplete:!partial,count:pick?1:0,zeroPicksCertified:!partial&&!pick,records:[{signature,generatedAt:'2099-10-22T09:00Z'}],picks:pick?[{matchId:'cid_one',market:'OU25',pick:'over',sourceScores:{A:.75,A2:.8},firstObservedAt:'2099-10-22T09:00Z',kickoffUtc:'2099-10-22T10:00Z',publicationRecord:signature}]:[]}};
}
test('honest incomplete zero and full analyzed zero are distinct valid publications',()=>{
 const partial=auditValuePublication(sample({partial:true}));assert.equal(partial.ok,true);assert.equal(partial.coverageStatus,'INCOMPLETE');assert.equal(partial.zeroPicksCertified,false);
 const complete=auditValuePublication(sample());assert.equal(complete.ok,true);assert.equal(complete.zeroPicksCertified,true);
});
test('a valid publication may retain a pick while other required inputs remain incomplete',()=>{
 const audit=requireValuePublicationIntegrity(sample({partial:true,pick:true}));assert.equal(audit.publishedPicks,1);assert.equal(audit.summary.insufficient,1);
});
for(const [name,mutate,reason] of [
 ['false complete',p=>p.dataReadiness.complete=true,'READINESS_COMPLETENESS_MISMATCH'],
 ['false analyzed',p=>p.unifiedPlan.analysisComplete=true,'ANALYSIS_COMPLETENESS_MISMATCH'],
 ['false certified zero',p=>p.unifiedPlan.zeroPicksCertified=true,'ZERO_PICKS_CERTIFICATION_MISMATCH'],
 ['green aggregate with missing rows',p=>p.dataReadiness.summary.ready=1,'READINESS_SUMMARY_READY'],
 ['omitted reason count',p=>p.dataReadiness.summary.byReason={},'READINESS_REASON_COUNTS_MISMATCH'],
 ['duplicate diagnostic identity',p=>p.dataReadiness.rows.push({...p.dataReadiness.rows[0]}),'READINESS_IDENTITIES_NOT_UNIQUE'],
 ['wrong universe',p=>p.dataReadiness.fixtureUniverse.canonicalIds=['cid_other'],'READINESS_UNIVERSE_MISMATCH'],
 ['hidden row reason',p=>p.dataReadiness.rows[0].status='READY','READINESS_STATUS_REASON_MISMATCH'],
 ['wrong day',p=>p.unifiedPlan.date='2099-10-21','PUBLICATION_DAY_MISMATCH']
])test(name+' fails closed',()=>{const p=sample({partial:true});mutate(p);assert.ok(auditValuePublication(p).errors.includes(reason));assert.throws(()=>requireValuePublicationIntegrity(p),/VALUE_PUBLICATION_INTEGRITY/);});
test('confidence cannot substitute for either paired score, including values just below the floor',()=>{
 for(const scores of [{A:.749,A2:.9},{A:.9,A2:.749},{A:.9,B2:.9},{A:'0.9',A2:.9},{A:NaN,A2:.9}]){
  const p=sample({pick:true});Object.assign(p.unifiedPlan.picks[0],{sourceScores:scores,confidence:.99});assert.ok(auditValuePublication(p).errors.includes('PUBLICATION_U1_SCORE_FLOOR_VIOLATED'));
 }
 const p=sample({pick:true});p.unifiedPlan.picks[0].sourceScores={B:.75,B2:.75};assert.equal(auditValuePublication(p).ok,true);
});
test('missing or post-kickoff evidence and unrelated signed references cannot pass',()=>{
 for(const time of [undefined,'bad','2099-10-22T10:00Z','2099-10-22T09:59:01Z']){
  const p=sample({pick:true});p.unifiedPlan.picks[0].firstObservedAt=time;assert.ok(auditValuePublication(p).errors.includes('PUBLICATION_PREMATCH_EVIDENCE_MISSING'));
 }
 const p=sample({pick:true});p.unifiedPlan.records=[];assert.ok(auditValuePublication(p).errors.includes('PUBLICATION_RECORD_REFERENCE_MISSING'));
});
test('settlement does not erase the original prematch evidence or change the audit inputs',()=>{
 const p=sample({pick:true});p.unifiedPlan.picks[0].result='VOID';const before=JSON.stringify(p);assert.equal(auditValuePublication(p).ok,true);assert.equal(JSON.stringify(p),before);
});
test('a backdated display time cannot replace the signed observation reference time',()=>{
 const p=sample({pick:true});p.unifiedPlan.records[0].generatedAt='2099-10-22T10:01Z';assert.ok(auditValuePublication(p).errors.includes('PUBLICATION_OBSERVATION_TIME_MISMATCH'));
});
test('opposing or repeated published selections cannot slip through aggregate pick counts',()=>{
 for(const side of ['over','under']){
  const p=sample({pick:true});p.unifiedPlan.picks.push({...p.unifiedPlan.picks[0],pick:side});p.unifiedPlan.count=2;
  assert.ok(auditValuePublication(p).errors.includes(side==='over'?'PUBLICATION_PICK_IDENTITY_INVALID':'PUBLICATION_OPPOSING_SELECTIONS'));
 }
});
test('all excluded and empty universes do not certify a fully analyzed zero',()=>{
 const p=sample({partial:true});p.dataReadiness.rows[0]={canonicalId:'cid_one',status:'NOT_APPLICABLE',reasons:[]};Object.assign(p.dataReadiness.summary,{applicable:0,ready:0,insufficient:0,byReason:{}});assert.equal(auditValuePublication(p).ok,true);
 p.dataReadiness.rows=[];p.dataReadiness.fixtureUniverse={count:0,canonicalIds:[]};p.dataReadiness.summary.fixtures=0;assert.equal(auditValuePublication(p).ok,true);
});
