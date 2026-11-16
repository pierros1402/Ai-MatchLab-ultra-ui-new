// Additive, read-only diagnostics for the Value A/B experiment and Plan C Shadow.
// Preserve the existing legacy System Health block and severity policy; these facts
// do not authorize publication, rerun any producer or certify prediction quality.
import {validateProductionProjection} from '../value/unified-production-journal.js';
import {summarizePairedResearchDay,validResearchDay} from '../value/autonomous-comparison-stats.js';
import {validatePlanCShadowExportPayload,planCPredictionSetHash} from '../value/plan-c-shadow-export.js';
import {isUnifiedPublicDay} from '../value/unified-public-plan.js';
import {attachShadowExportDay,summarizeValueRows} from '../core/value-export-report.js';
import {athensDayFromKickoff} from '../core/daykey.js';

const terminal=new Set(['WIN','LOSS','VOID']);
const n=x=>Number.isSafeInteger(x)&&x>=0;
const validScore=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1;
const state=(mode,status,reason=null,publication='NOT_ESTABLISHED')=>({mode,status,reason,publication,counts:null,coverage:null,settlement:null});
function rowsFacts(rows,{research=false}={}){
 const seen=new Set(),counts={picks:rows.length,wins:0,losses:0,voids:0,pending:0,settled:0,hitRate:null};
 let originalValuesMissing=0,terminalScoreGaps=0,timingCertified=0;
 for(const p of rows){
  const k=[p?.canonicalMatchId,p?.market,p?.pick];
  if(!k.every(s=>typeof s==='string'&&s.length>0)||seen.has(JSON.stringify(k))||!['WIN','LOSS','VOID','PENDING','UNRESOLVED'].includes(p.result))throw Error('invalid_selection_rows');
  seen.add(JSON.stringify(k));
  if(research?p.researchOnly!==true: p.unified!==true)throw Error('invalid_plan_mode');
  if(research? !validScore(p.modelProb) : !Object.values(p.sourceScores||{}).some(validScore))originalValuesMissing++;
  if(p.timingCertified===true)timingCertified++;
  if(terminal.has(p.result)&&(!p.settlementTruth||research&&p.timingCertified!==true))throw Error('terminal_without_truth');
  if(['WIN','LOSS'].includes(p.result)){
   const {scoreHome,scoreAway}=p.settlementTruth;
   if(!n(scoreHome)||!n(scoreAway)||p.finalScore!=null&&p.finalScore?.scoreKey!==`${scoreHome}-${scoreAway}`)terminalScoreGaps++;
  }
  if(p.result==='WIN')counts.wins++;else if(p.result==='LOSS')counts.losses++;else if(p.result==='VOID')counts.voids++;else counts.pending++;
 }
 counts.settled=counts.wins+counts.losses;counts.hitRate=counts.settled?counts.wins/counts.settled:null;
 return {counts,originalValuesMissing,terminalScoreGaps,...(research?{timingCertified}:{}),settlement:terminalScoreGaps?'HOLD_SCORE_TRUTH_GAPS':counts.picks===0?'NO_RECORDED_PICKS':counts.pending===0?'ALL_RECORDED_PICKS_RESOLVED':counts.pending===counts.picks?'PENDING':'PARTIAL'};
}
function checkSummary(plan,facts,research=false){
 const c=facts.counts,s=plan.summary;
 if(!s||['picks','wins','losses','voids','settled','hitRate'].some(k=>s[k]!==c[k])||s[research?'pending':'unresolved']!==c.pending)throw Error('summary_accounting_mismatch');
}
function aCoverage(p){
 const x=p.dataReadiness;
 if(!x||![x.fixtures,x.applicable,x.ready,x.insufficient].every(n)||x.applicable>x.fixtures||x.ready+x.insufficient!==x.applicable||typeof x.complete!=='boolean'||x.complete!==p.analysisComplete||x.complete&&x.insufficient!==0)return {status:'NOT_VERIFIED',complete:false,counts:null};
 return {status:x.complete?'COMPLETE':'PARTIAL',complete:x.complete,counts:{fixtures:x.fixtures,applicable:x.applicable,ready:x.ready,insufficient:x.insufficient},byReason:Object.fromEntries(Object.entries(x.byReason||{}).filter(([k,v])=>typeof k==='string'&&n(v)&&v<=x.insufficient)),basis:'RECORDED_COMBINED_READINESS'};
}
function bCoverage(p){
 const x=p.evaluationCoverage;
 if(!x||x.basis!=='UNION_OF_ACTUAL_OBSERVATION_LEDGERS'||![x.uniqueFixtures,x.evaluated,x.neverEvaluated].every(n)||x.evaluated+x.neverEvaluated!==x.uniqueFixtures||x.completeCertified!==false)return {status:'NOT_VERIFIED',complete:false,counts:null};
 return {status:'OBSERVED_LEDGER_ONLY',complete:false,counts:{fixtures:x.uniqueFixtures,evaluated:x.evaluated,neverEvaluated:x.neverEvaluated},basis:x.basis};
}
function aFacts(payload,day,mode){
 if(!isUnifiedPublicDay(day))return state('COMBINED','NOT_APPLICABLE','legacy_day');
 const p=payload?.unifiedPlan;
 if(!p||p.status==='NOT_AVAILABLE')return state('COMBINED','NOT_AVAILABLE','combined_projection_missing');
 try{
  validateProductionProjection(p,day);const facts=rowsFacts(p.picks);checkSummary(p,facts);
  const gaps=facts.originalValuesMissing+facts.terminalScoreGaps;
  return {...state('COMBINED',gaps?'HOLD':'RECORDED',gaps?'original_value_or_ft_evidence_gap':null,mode==='PINNED'?'PINNED_LOCAL_ARTIFACT':'LEGACY_LOCAL_ARTIFACT'),...facts,coverage:aCoverage(p),zeroPicksCertified:p.zeroPicksCertified===true&&p.count===0&&p.analysisComplete===true&&aCoverage(p).complete===true,performanceCertified:false};
 }catch{return state('COMBINED','HOLD','combined_projection_invalid');}
}
function bFacts(payload,day,mode,enabled){
 if(!isUnifiedPublicDay(day))return state('AUTONOMOUS_RESEARCH','NOT_APPLICABLE','legacy_day');
 if(!enabled)return state('AUTONOMOUS_RESEARCH','PREVIEW_DISABLED','research_preview_read_flag_off');
 if(mode!=='PINNED')return state('AUTONOMOUS_RESEARCH','HOLD','verified_generation_required');
 if(payload?.autonomousResearchHold)return state('AUTONOMOUS_RESEARCH','HOLD','research_envelope_rejected');
 if(!payload?.autonomousPreviewMode||!payload.autonomousPreview||payload.autonomousPreview.status==='NOT_AVAILABLE')return state('AUTONOMOUS_RESEARCH','NOT_AVAILABLE','no_exposed_research_record');
 try{
  const paired=summarizePairedResearchDay({...payload,publicationAuthorized:false});
  const p=payload.autonomousPreview,facts=rowsFacts(p.picks,{research:true});checkSummary(p,facts,true);
  const gaps=facts.originalValuesMissing+facts.terminalScoreGaps;
  return {...state('AUTONOMOUS_RESEARCH',gaps?'HOLD':'RESEARCH_ONLY',gaps?'original_value_or_ft_evidence_gap':null,'PINNED_RESEARCH_ARTIFACT'),...facts,coverage:bCoverage(p),pairedObserved:paired.pairedObserved,commonStartBound:paired.commonStartBound,fullCommonInputsCertified:false,zeroPicksCertified:false,performanceCertified:false,publicationAuthorized:false};
 }catch{return state('AUTONOMOUS_RESEARCH','HOLD','research_projection_invalid');}
}
function cFacts(loaded,day){
 if(!loaded?.payload)return state('SHADOW','NOT_AVAILABLE_OR_INVALID','no_validated_shadow_artifact');
 const p=loaded.payload,source=String(loaded.source||'unknown');
 try{
  if(!validatePlanCShadowExportPayload(p,day).ok)throw Error('invalid_shadow_artifact');
  if(!p.available)return state('SHADOW','NOT_AVAILABLE','shadow_artifact_declares_missing');
  if(planCPredictionSetHash(p.entries)!==p.sourcePredictionSetHash||p.entries.some(e=>athensDayFromKickoff(e.prediction.kickoffUtc)!==day))throw Error('shadow_inventory_or_day_mismatch');
  const result=attachShadowExportDay({date:day,plans:{}},loaded).plans.C_SHADOW;
  if(!result.available||result.picks.length!==p.pickCount||result.picks.some(row=>!validScore(row.originalPickValue)||['WIN','LOSS'].includes(row.result)&&!row.finalScore))throw Error('shadow_export_accounting_mismatch');
  const s=summarizeValueRows(result.picks),counts={picks:s.picks,wins:s.wins,losses:s.losses,voids:s.voids,pending:s.unresolved+s.unsupported,settled:s.wins+s.losses,hitRate:s.wins+s.losses?s.wins/(s.wins+s.losses):null};
  return {...state('SHADOW','SHADOW_ONLY',null,'VALIDATED_LOCAL_SHADOW_ARTIFACT'),source,counts,coverage:{status:'SHADOW_COHORT_ONLY',complete:false,counts:{shadowPredictions:p.count}},settlement:counts.picks===0?'NO_RECORDED_PICKS':counts.pending===0?'ALL_RECORDED_PICKS_RESOLVED':counts.pending===counts.picks?'PENDING':'PARTIAL',zeroPicksCertified:false,productionEligible:false,performanceCertified:false};
 }catch{return state('SHADOW','HOLD','shadow_inventory_invalid');}
}
export async function collectValueABCHealth({day,generationReads,previewReads,readPinned,readComparison,readShadow}){
 if(!validResearchDay(day))return {schema:'aiml.value-abc-health.v1',date:day,status:'HOLD',reason:'invalid_day',plans:null};
 let artifact=null,mode='LEGACY',reason=null;
 try{
  if(generationReads){const pin=await readPinned(day);if(!['PINNED','LEGACY'].includes(pin?.mode)||pin.mode==='PINNED'&&typeof pin.file!=='string')throw Error('invalid_generation_result');mode=pin.mode;artifact=mode==='PINNED'?await readComparison(day,pin.file):await readComparison(day);}
  else artifact=await readComparison(day);
  if(!artifact?.ok){reason=artifact?.reason==='value_comparison_not_found'?'comparison_not_found':'comparison_invalid';artifact=null;}
  else if(artifact.payload?.date!==day||artifact.payload?.ok!==true){reason='comparison_invalid';artifact=null;}
 }catch{mode='HOLD';reason='comparison_generation_or_read_invalid';artifact=null;}
 let C;try{C=cFacts(await readShadow(day),day);}catch{C=state('SHADOW','HOLD','shadow_read_failed');}
 let A=aFacts(artifact?.payload,day,mode),B=bFacts(artifact?.payload,day,mode,previewReads);
 if(reason&&reason!=='comparison_not_found'&&isUnifiedPublicDay(day)){A=state('COMBINED','HOLD',reason);if(previewReads)B=state('AUTONOMOUS_RESEARCH','HOLD',reason);}
 return {schema:'aiml.value-abc-health.v1',date:day,comparison:{mode,reason},previewReads:previewReads===true,plans:{A,B,C},diagnosticOnly:true,productionReleaseAuthorized:false,fullCommonInputsCertified:false,performanceCertified:false};
}
