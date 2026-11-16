import {createHash} from 'node:crypto';
import {athensDayKey} from '../core/daykey.js';
import {validateBoundaryEvidence} from '../core/autonomous-value-boundary-evidence.js';
import {validateCommonSourceRefs} from './autonomous-common-source-audit.js';
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const valid=p=>typeof p==='number'&&Number.isFinite(p)&&p>=0&&p<=1;
// Legacy B HIGH cutoff is a reference hypothesis, not a fitted or approved policy.
export const POLICY=Object.freeze({id:'autonomous-preview-reference-v1',threshold:0.72,variant:'combined',approved:false});
export function eligibleResearchMarkets(q){
 if(!q||!['home','draw','away','over25','btts'].every(k=>valid(q[k]))||Math.abs(q.home+q.draw+q.away-1)>1e-8)throw Error('invalid_probabilities');
 return [['OU25','over',q.over25],['BTTS','yes',q.btts],['1X2','home',q.home],['1X2','away',q.away]].filter(([, ,v])=>v>=POLICY.threshold);
}
export function buildAutonomousPreview({day,fixtures,research,universe,commonDecisionAt=null,commonSourceRefs=null},now){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(now)))throw Error('invalid_preview_clock');
 if(commonDecisionAt!==null&&(!Number.isFinite(Date.parse(commonDecisionAt))||Date.parse(commonDecisionAt)>Date.parse(now)))throw Error('invalid_combined_decision_reference');
 if(!Array.isArray(fixtures)||!Array.isArray(universe?.canonicalIds)||research?.status!=='RESEARCH_ONLY_NOT_POLICY_APPROVED'||!Array.isArray(research.rows))throw Error('missing_shared_evaluation');
 const byId=new Map(fixtures.map(f=>[f.canonicalId,f]));
 if(byId.size!==fixtures.length||byId.has(undefined)||new Set(universe.canonicalIds).size!==universe.canonicalIds.length||universe.canonicalIds.length!==byId.size||universe.canonicalIds.some(id=>!byId.has(id)))throw Error('universe_mismatch');
 const rows=new Map();for(const row of research.rows){if(!byId.has(row.canonicalMatchId)||rows.has(row.canonicalMatchId))throw Error('research_identity_mismatch');rows.set(row.canonicalMatchId,row.research);}
 const picks=[],ledger=[];
 for(const id of universe.canonicalIds){
  const f=byId.get(id),r=rows.get(id),kickoff=Date.parse(f.kickoffUtc);
  const reject=reason=>ledger.push({id,status:'HOLD',reason});
  if(!Number.isFinite(kickoff)||kickoff<=Date.parse(now)+60000){reject('WINDOW_CLOSED_OR_UNKNOWN');continue;}
  if(!['NS','PRE','PRE_KICKOFF','SCHEDULED','NOT_STARTED','STATUS_SCHEDULED','STATUS_NOT_STARTED','STATUS_PRE'].includes(String(f.status||'').toUpperCase())||athensDayKey(new Date(kickoff))!==day){reject('CANONICAL_STATUS_OR_DAY_NOT_PROSPECTIVE');continue;}
  if(r?.status!=='RESEARCH_ONLY'||!r.variants?.combined||!/^([a-f0-9]{64})$/.test(r.inputDigest||'')){reject(r?.reason||'SHARED_EVALUATION_UNAVAILABLE');continue;}
  const q=r.variants.combined.probabilities;
  // Frozen reference hypothesis; no new Under, Draw or DC policy.
  const accepted=eligibleResearchMarkets(q);
  for(const [market,pick,modelProb] of accepted)picks.push({matchId:id,canonicalMatchId:id,kickoffUtc:f.kickoffUtc,leagueSlug:f.leagueSlug,homeTeam:f.homeTeam,awayTeam:f.awayTeam,market,pick,modelProb,band:'HIGH',result:'PENDING',researchOnly:true,inputDigest:r.inputDigest});
  // Shadow evidence is explicitly NOT part of the frozen v1 selection policy.
  const evidence=r.boundaryEvidence;
  if(evidence){validateBoundaryEvidence(evidence,{id,inputDigest:r.inputDigest,probabilities:q,recordGeneratedAt:now});if(Date.parse(evidence.kickoffUtc)!==kickoff)throw Error('boundary_fixture_kickoff_mismatch');}
  ledger.push({id,status:'EVALUATED',inputDigest:r.inputDigest,probabilities:q,accepted:accepted.length,...(evidence?{boundaryEvidence:evidence}:{})});
 }
 if(commonSourceRefs!==null){validateCommonSourceRefs(commonSourceRefs);if(commonDecisionAt===null)throw Error('common_source_clock_missing');}
 const body={...(commonSourceRefs!==null?{commonSourceRefs}:{}),id:'plan-autonomous-preview',date:day,status:'RESEARCH_ONLY',publicationAuthorized:false,policy:POLICY,generatedAt:now,...(commonDecisionAt!==null?{commonDecisionAt,decisionSkewMs:Date.parse(now)-Date.parse(commonDecisionAt)}:{}),count:picks.length,picks,ledger,analysisComplete:false,zeroPicksCertified:false,summary:{picks:picks.length,settled:0,wins:0,losses:0,hitRate:null}};
 return {...body,recordSha256:sha(body)};
}
export function verifyAutonomousPreview(record){const {recordSha256,...body}=record||{};if(body.status!=='RESEARCH_ONLY'||body.publicationAuthorized!==false||body.zeroPicksCertified!==false||sha(body)!==recordSha256)throw Error('invalid_preview');return record;}
