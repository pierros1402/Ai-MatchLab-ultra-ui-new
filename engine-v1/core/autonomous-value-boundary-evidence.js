// Pure Value-boundary diagnostics; consumes an already-loaded Details block only.
// No file I/O, new reader, odds, A selections, policy approval or historical reconstruction.
import {createHash} from 'node:crypto';
import {adjustMarketProbabilities,describeProbabilityAdjustment} from './opponent-strength-adjusted-form.js';
import {evaluateAutonomousResearch} from './autonomous-value-research.js';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const unit=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1;
const finiteRange=(x,min,max)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
const instant=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const sameInstant=(a,b)=>instant(a)&&instant(b)&&Date.parse(a)===Date.parse(b);
const validProb=q=>q&&['home','draw','away','over25','btts'].every(k=>unit(q[k]))&&Math.abs(q.home+q.draw+q.away-1)<1e-8;
const ordered=x=>Array.isArray(x)?x.map(ordered):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,ordered(x[k])])):x;
const same=(a,b)=>JSON.stringify(ordered(a))===JSON.stringify(ordered(b));
function receipt(r){return r&&hex(r.sha256)&&r.path===`data/value/_execution-evidence/objects/${r.sha256.slice(0,2)}/${r.sha256}.json`&&Number.isSafeInteger(r.bytes)&&r.bytes>0?{path:r.path,sha256:r.sha256,bytes:r.bytes}:null;}
function profile(p){
 if(p?.schema!=='ai-matchlab.opponent-adjusted-form.v1'||!Number.isSafeInteger(p.sample)||p.sample<3||!unit(p.sampleReliability)||p.sampleReliability===0||!finiteRange(p.impact?.ppg,-3,3)||!finiteRange(p.impact?.over25Rate,-1,1)||!finiteRange(p.impact?.bttsRate,-1,1))return null;
 return {sample:p.sample,sampleReliability:p.sampleReliability,impact:{ppg:p.impact.ppg,over25Rate:p.impact.over25Rate,bttsRate:p.impact.bttsRate}};
}
export function opponentShadowProbabilities(q,home,away){
 if(!validProb(q)||!home||!away)throw Error('invalid_opponent_shadow_input');
 const markets={'1X2':{probs:{home:q.home,draw:q.draw,away:q.away}},OU25:{probs:{over:q.over25,under:1-q.over25}},BTTS:{probs:{yes:q.btts,no:1-q.btts}}};
 const adj=adjustMarketProbabilities(markets,home,away),one=adj.markets['1X2'].probs,total=one.home+one.draw+one.away;
 const probabilities={home:one.home/total,draw:one.draw/total,away:one.away/total,over25:adj.markets.OU25.probs.over,btts:adj.markets.BTTS.probs.yes};
 if(!validProb(probabilities))throw Error('invalid_opponent_shadow_output');
 return {probabilities,reliability:adj.reliability,adjustmentScale:adj.adjustmentScale};
}
const HOLD_REASONS=new Set(['DETAIL_MISSING','DETAIL_IDENTITY_MISMATCH','DETAIL_TIME_UNVERIFIED','OPPONENT_BLOCK_MISSING','PROFILE_INSUFFICIENT_OR_INVALID','DESCRIPTOR_MISMATCH']);
export function inspectOpponentDetail({fixture,details,observedAt,probabilities}){
 const hold=reason=>({status:'HOLD',reason,policyApplied:false,cutoffCertified:false});
 if(!details||typeof details!=='object')return hold('DETAIL_MISSING');
 const b=details.basic;
 if(!b||details.matchId!==fixture?.canonicalId||b.canonicalId!==fixture.canonicalId||b.leagueSlug!==fixture.leagueSlug||b.homeTeam!==fixture.homeTeam||b.awayTeam!==fixture.awayTeam||!sameInstant(b.kickoffUtc,fixture.kickoffUtc))return hold('DETAIL_IDENTITY_MISMATCH');
 // This proves only the outer detail's timestamp, never the rows/standings that produced the block.
 if(!instant(details.generatedAt)||!instant(observedAt)||!instant(fixture.kickoffUtc)||Date.parse(details.generatedAt)>Date.parse(observedAt)||Date.parse(observedAt)>=Date.parse(fixture.kickoffUtc))return hold('DETAIL_TIME_UNVERIFIED');
 const block=details.opponentAdjustedForm;
 if(!block||block.schema!=='ai-matchlab.detail-opponent-adjusted-form.v1'||block.leagueSlug!==fixture.leagueSlug)return hold('OPPONENT_BLOCK_MISSING');
 const home=profile(block.home),away=profile(block.away);
 if(block.status!=='ready'||!home||!away||!Number.isSafeInteger(block.standingsCoverage)||block.standingsCoverage<2||block.sampleReliability!==Math.round(Math.min(home.sampleReliability,away.sampleReliability)*1000)/1000)return hold('PROFILE_INSUFFICIENT_OR_INVALID');
 if(!same(block.probabilityImpact,describeProbabilityAdjustment(home,away)))return hold('DESCRIPTOR_MISMATCH');
 return {status:'SHADOW_ONLY_UNVERIFIED_SOURCE_CUTOFF',policyApplied:false,cutoffCertified:false,detailGeneratedAt:details.generatedAt,blockSha256:hash(block),home,away,standingsCoverage:block.standingsCoverage,...opponentShadowProbabilities(probabilities,home,away)};
}
export function captureAutonomousBoundary({fixture,details,observedAt,research,fixtureContextReceipt,engineArgumentsReceipt,statisticalBoundaryReceipt=null}){
 if(research?.status!=='RESEARCH_ONLY'||!validProb(research.variants?.combined?.probabilities)||!hex(research.inputDigest)||!research.metrics||hash(research.metrics)!==research.inputDigest)return null;
 if(typeof fixture?.canonicalId!=='string'||!fixture.canonicalId||!instant(observedAt)||!instant(fixture.kickoffUtc)||Date.parse(observedAt)>=Date.parse(fixture.kickoffUtc))return null;
 const q=research.variants.combined.probabilities;
 const fReceipt=receipt(fixtureContextReceipt),aReceipt=receipt(engineArgumentsReceipt);
 const body={schema:'aiml.autonomous-primary-boundary-evidence.v1',canonicalMatchId:fixture.canonicalId,kickoffUtc:fixture.kickoffUtc,observedAt,statisticalInputSha256:research.inputDigest,statisticalInputs:structuredClone(research.metrics),scope:'PRIMARY_A_SHARED_STATISTICAL_SUBSET',fixtureContextReceipt:fReceipt&&aReceipt?fReceipt:null,engineArgumentsReceipt:fReceipt&&aReceipt?aReceipt:null,...(receipt(statisticalBoundaryReceipt)&&fReceipt&&aReceipt?{statisticalBoundaryReceipt:receipt(statisticalBoundaryReceipt)}:{}),fullCommonInputsCertified:false,rawSourceLineageCertified:false,opponentShadow:inspectOpponentDetail({fixture,details,observedAt,probabilities:q})};
 return {...body,evidenceSha256:hash(body)};
}
export function validateBoundaryEvidence(e,{id,inputDigest,probabilities,recordGeneratedAt}){
 const {evidenceSha256,...b}=e||{};
 if(b.schema!=='aiml.autonomous-primary-boundary-evidence.v1'||hash(b)!==evidenceSha256||b.canonicalMatchId!==id||b.statisticalInputSha256!==inputDigest||!hex(inputDigest)||b.scope!=='PRIMARY_A_SHARED_STATISTICAL_SUBSET'||b.fullCommonInputsCertified!==false||b.rawSourceLineageCertified!==false||!instant(b.kickoffUtc)||!instant(b.observedAt)||!instant(recordGeneratedAt)||Date.parse(b.observedAt)>Date.parse(recordGeneratedAt)||Date.parse(b.observedAt)>=Date.parse(b.kickoffUtc)||!validProb(probabilities))throw Error('invalid_primary_boundary_evidence');
 const m=b.statisticalInputs;
 if(!m||hash(m)!==inputDigest)throw Error('invalid_primary_statistical_inputs');
 const replay=evaluateAutonomousResearch({homeMetrics:m.home,awayMetrics:m.away,homeSideMetrics:m.homeSide,awaySideMetrics:m.awaySide,rawHomeMetrics:{sample:m.rawHomeSample},rawAwayMetrics:{sample:m.rawAwaySample},leagueBaseline:{sample:m.leagueSample,goalsAvg:m.leagueGoals}});
 if(replay.status!=='RESEARCH_ONLY'||replay.inputDigest!==inputDigest||!same(m,replay.metrics)||!same(replay.variants?.combined?.probabilities,probabilities))throw Error('primary_boundary_math_replay_mismatch');
 for(const r of [b.fixtureContextReceipt,b.engineArgumentsReceipt])if(r!==null&&!same(r,receipt(r)))throw Error('invalid_primary_boundary_receipt');
 if(Object.hasOwn(b,'statisticalBoundaryReceipt')&&(!b.fixtureContextReceipt||!b.engineArgumentsReceipt||!b.statisticalBoundaryReceipt||!same(b.statisticalBoundaryReceipt,receipt(b.statisticalBoundaryReceipt))))throw Error('invalid_statistical_boundary_receipt');
 const s=b.opponentShadow;
 if(!s||s.policyApplied!==false||s.cutoffCertified!==false)throw Error('invalid_opponent_shadow_authority');
 if(s.status==='HOLD'){if(!HOLD_REASONS.has(s.reason)||Object.hasOwn(s,'probabilities'))throw Error('invalid_opponent_shadow_hold');}
 else{
  if(s.status!=='SHADOW_ONLY_UNVERIFIED_SOURCE_CUTOFF'||!hex(s.blockSha256)||!instant(s.detailGeneratedAt)||Date.parse(s.detailGeneratedAt)>Date.parse(b.observedAt)||!Number.isSafeInteger(s.standingsCoverage)||s.standingsCoverage<2)throw Error('invalid_opponent_shadow_metadata');
  for(const p of [s.home,s.away])if(!same(p,profile({...p,schema:'ai-matchlab.opponent-adjusted-form.v1'})))throw Error('invalid_opponent_shadow_profile');
  const expected=opponentShadowProbabilities(probabilities,s.home,s.away);
  if(!same(expected.probabilities,s.probabilities)||expected.reliability!==s.reliability||expected.adjustmentScale!==s.adjustmentScale)throw Error('invalid_opponent_shadow_math');
 }
 return e;
}
