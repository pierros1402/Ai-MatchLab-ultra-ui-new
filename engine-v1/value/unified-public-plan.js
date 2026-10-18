import {validateUnifiedShadow,selectionKey,normalizedMarket,signature,specSha256} from './unified-shadow.js';

export const UNIFIED_PUBLIC_START='2026-10-18';
export const isUnifiedPublicDay=day=>/^\d{4}-\d{2}-\d{2}$/.test(day)&&day>=UNIFIED_PUBLIC_START;
export function unavailableUnifiedPlan(day,reason='unified_observation_missing') {
  return {id:'plan-u1',label:'Ενιαίο πλάνο',date:day,status:'NOT_AVAILABLE',availability:'not_available',reason,
    activationDay:UNIFIED_PUBLIC_START,count:0,picks:[],summary:{picks:0,settled:0,wins:0,losses:0,unresolved:0,hitRate:null}};
}
/** Publish only previously frozen selections. Never rerun a model or blend probabilities. */
export function buildUnifiedPublicPlan(day,observation,plans,results=null) {
  if(!isUnifiedPublicDay(day))return null;
  if(!observation)return unavailableUnifiedPlan(day);
  try {
    validateUnifiedShadow(observation);
    if(observation.date!==day)throw Error('unified_observation_day_mismatch');
    let resultObservation=null;
    if(results){
      const {reportSignature,...body}=results;
      if(results.schema!=='ai-matchlab.unified-shadow-results.v1'||results.date!==day||results.candidateId!==observation.candidateId||results.specSha256!==specSha256||signature(body)!==reportSignature)throw Error('unified_results_invalid');
      resultObservation=results.observations?.find(o=>o.date===day&&o.signature===observation.observationSignature);
    }
    const keys=new Set(),sides=new Map();
    const picks=observation.picks.map(p=>{
      const key=selectionKey(p),marketKey=[p.canonicalMatchId,p.market].join('|');
      if(keys.has(key))throw Error('unified_duplicate_selection');keys.add(key);
      if(sides.has(marketKey)&&sides.get(marketKey)!==p.pick)throw Error('unified_conflicting_selections');sides.set(marketKey,p.pick);
      if(Date.parse(observation.generatedAt)>Date.parse(p.kickoffUtc)-60000)throw Error('unified_late_selection');
      const scores=p.sourceScores||{};
      if(![['A','A2'],['B','B2']].some(pair=>pair.every(k=>Number.isFinite(scores[k])&&scores[k]>=.75&&scores[k]<=1)))throw Error('unified_pair_threshold_invalid');
      const sources=Object.values(plans||{}).flatMap(plan=>plan?.picks||[]).filter(row=>{
        const normalized=normalizedMarket(row);
        return String(row.canonicalMatchId||row.matchId||row.canonicalId)===p.canonicalMatchId&&normalized?.[0]===p.market&&normalized?.[1]===p.pick&&Date.parse(row.kickoffUtc||row.kickoff)===Date.parse(p.kickoffUtc);
      });
      if(!sources.length)throw Error('unified_comparison_selection_missing');
      const settled=sources.filter(x=>['WIN','LOSS','VOID'].includes(x.result));
      if(new Set(settled.map(x=>x.result)).size>1)throw Error('unified_settlement_conflict');
      const reference=settled[0]||sources[0];
      const rowKey=[observation.observationSignature,'U1',p.canonicalMatchId,p.market,p.pick].join('|');
      const rows=(results?.rows||[]).filter(r=>r.key===rowKey&&r.group==='U1'&&r.date===day);
      if(rows.length>1||(results?.conflicts||[]).some(c=>c.key===rowKey))throw Error('unified_settlement_conflict');
      const strict=rows[0],timing=resultObservation?.timing;
      const durable=timing?.status==='ORIGINAL_COMMITTED_BYTES_VERIFIED'&&/^[a-f0-9]{40,64}$/.test(timing.commit||'')&&Date.parse(timing.committedAt)<Date.parse(p.kickoffUtc);
      const terminal=durable&&strict?.truth&&['WIN','LOSS','VOID'].includes(strict.result);
      if(terminal&&settled.length&&reference.result!==strict.result)throw Error('unified_settlement_conflict');
      return {...reference,...p,planId:"plan-u1",unified:true,score:null,modelProb:null,marketProb:null,aiFairOdds:null,confidence:null,band:null,
        result:terminal?strict.result:'UNRESOLVED',finalScore:terminal?reference.finalScore:null,
        settlementTruth:terminal?strict.truth:null,sourceScores:{...scores}};
    });
    const wins=picks.filter(x=>x.result==='WIN').length,losses=picks.filter(x=>x.result==='LOSS').length;
    return {id:'plan-u1',label:'Ενιαίο πλάνο',date:day,status:'AVAILABLE',availability:'available',activationDay:UNIFIED_PUBLIC_START,
      publicationMode:'production',productionPublication:true,policyId:'unified-public-u1-v1',
      candidateId:observation.candidateId,observationSignature:observation.observationSignature,
      generatedAt:observation.generatedAt,upstreamCoverage:observation.upstreamCoverage,coverageByPlan:observation.coverageByPlan,
      combinedCalibratedProbability:null,performanceCertified:false,sourcePolicy:'paired_variant_agreement_each_score_at_least_0.75',
      count:picks.length,picks,summary:{picks:picks.length,uniqueMatches:new Set(picks.map(p=>p.canonicalMatchId)).size,
        settled:wins+losses,wins,losses,voids:picks.filter(x=>x.result==='VOID').length,
        unresolved:picks.filter(x=>!['WIN','LOSS','VOID'].includes(x.result)).length,hitRate:wins+losses?wins/(wins+losses):null}};
  }catch(error){return unavailableUnifiedPlan(day,String(error.message||'unified_validation_failed'));}
}
