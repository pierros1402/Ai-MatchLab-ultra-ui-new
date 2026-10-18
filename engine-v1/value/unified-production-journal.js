import {buildUnifiedPublicPlan} from './unified-public-plan.js';
import {signature,validateUnifiedShadow,selectionKey} from './unified-shadow.js';
export function validateProductionRecord(record,day){
 const {recordSignature,...body}=record;
 if(record.schema!=='ai-matchlab.unified-production-record.v1'||record.date!==day||signature(body)!==recordSignature)throw Error('production_record_invalid');
 validateUnifiedShadow(record.observation);
 if(record.observation.date!==day||record.readiness?.date!==day)throw Error('production_record_day_mismatch');
 return record;
}
export function projectUnifiedProduction(day,records,{now=new Date().toISOString(),readiness,resultsByRecord={}}={}){
 const selected=new Map(),sides=new Map(),conflicts=[];
 const sorted=[...records].map(r=>validateProductionRecord(r,day)).sort((a,b)=>a.observation.generatedAt.localeCompare(b.observation.generatedAt)||a.recordSignature.localeCompare(b.recordSignature));
 for(const record of sorted){
  if(Date.parse(record.observation.generatedAt)>Date.parse(now))throw Error('production_record_in_future');
  const plan=buildUnifiedPublicPlan(day,record.observation,record.plans,resultsByRecord[record.recordSignature]||null);
  if(plan?.status!=='AVAILABLE')throw Error('production_record_selection_invalid:'+plan?.reason);
  const inputs=new Map(record.readiness.rows.map(row=>[row.canonicalId,row]));
  for(const pick of plan.picks){
   const input=inputs.get(pick.canonicalMatchId);
   const aPair=Number.isFinite(pick.sourceScores?.A)&&Number.isFinite(pick.sourceScores?.A2);
   const bPair=Number.isFinite(pick.sourceScores?.B)&&Number.isFinite(pick.sourceScores?.B2);
   const aReady=input?.reasons.every(r=>['missing_model_assessment','ambiguous_model_assessment'].includes(r));
   if(!(aPair&&aReady||bPair&&input?.modelAssessmentAvailable))throw Error('production_selection_required_inputs_missing');
   const key=selectionKey(pick),market=[pick.canonicalMatchId,pick.market].join('|');
   if(sides.has(market)&&sides.get(market)!==pick.pick){conflicts.push({key,reason:'later_opposing_selection_ignored'});continue;}
   sides.set(market,pick.pick);
   if(!selected.has(key))selected.set(key,{...pick,publicationRecord:record.recordSignature,firstObservedAt:record.observation.generatedAt});
  }
 }
 const picks=[...selected.values()],wins=picks.filter(p=>p.result==='WIN').length,losses=picks.filter(p=>p.result==='LOSS').length;
 const complete=readiness?.complete===true;
 return {id:'plan-u1',label:'Ενιαίο πλάνο',date:day,status:sorted.length?'AVAILABLE':'NOT_AVAILABLE',availability:sorted.length?'available':'not_available',
  publicationMode:'production',productionPublication:true,policyId:'unified-public-u1-incremental-v1',generatedAt:now,count:picks.length,picks,
  analysisComplete:complete,upstreamCoverage:complete?'COMPLETE':'INCOMPLETE',zeroPicksCertified:sorted.length>0&&picks.length===0&&complete,
  dataReadiness:readiness?{status:readiness.status,complete,...readiness.summary}:null,
  records:sorted.map(r=>({signature:r.recordSignature,generatedAt:r.observation.generatedAt})),conflicts,
  combinedCalibratedProbability:null,performanceCertified:false,sourcePolicy:'paired_variant_agreement_each_score_at_least_0.75',
  summary:{picks:picks.length,uniqueMatches:new Set(picks.map(p=>p.canonicalMatchId)).size,settled:wins+losses,wins,losses,
   voids:picks.filter(p=>p.result==='VOID').length,unresolved:picks.filter(p=>!['WIN','LOSS','VOID'].includes(p.result)).length,hitRate:wins+losses?wins/(wins+losses):null}};
}

export function validateProductionProjection(plan,day){
 const {projectionSignature,...body}=plan||{};
 if(plan?.policyId!=='unified-public-u1-incremental-v1'||plan?.date!==day||plan?.status!=='AVAILABLE'||!Array.isArray(plan.picks)||plan.count!==plan.picks.length||signature(body)!==projectionSignature)throw Error('production_projection_invalid');
 return plan;
}
