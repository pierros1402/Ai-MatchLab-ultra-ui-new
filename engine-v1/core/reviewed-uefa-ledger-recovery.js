import crypto from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {validateUefaOfficialResult} from '../jobs/collect-uefa-official-history.js';
import {buildVerifiedFinalResult} from '../jobs/export-verified-final-results-day.js';
import {buildVerifiedHistoryDay} from '../jobs/append-finalized-day-to-history.js';
import {planCanonicalVerifiedFinalRepair} from '../jobs/repair-canonical-from-verified-finals-day.js';
import {assertCanonicalStatusCoherence} from './canonical-status-coherence.js';
import {buildCanonicalId} from './canonical-id.js';
import {athensDayFromKickoff} from './daykey.js';

export const UEFA_LEDGER_RECOVERY_POLICY='reviewed-offline-uefa-native-ledger-v1';
export const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

export function proposeReviewedUefaRecovery(row,raw,{ledgerSha256,capturedAt,canonical=null,
    nowMs=Date.now(),sameTeam=(a,b)=>a===b}={}){
  const deny=reason=>({ok:false,reason,productionWrites:0});
  if(!['MISSING_VERIFIED_FINAL_REVIEW','HISTORICAL_CANONICAL_ABSENT_REVIEW'].includes(row?.status))return deny('OUTSIDE_REVIEWED_RECOVERY_SCOPE');
  if(!/^[a-f0-9]{64}$/.test(ledgerSha256||'')||!Buffer.isBuffer(raw)||sha256(raw)!==row.sourceSha256)return deny('REVIEWED_SOURCE_HASH_MISMATCH');
  let payload;try{payload=JSON.parse(raw);}catch{return deny('OFFICIAL_JSON_INVALID');}
  const fact=row.fact;
  if(!fact||row.id!==fact.providerMatchId||fact.leagueSlug!=='uefa.nations')return deny('REVIEWED_FACT_SCOPE_MISMATCH');
  const expected={leagueSlug:fact.leagueSlug,officialMatchId:row.id,officialEdition:fact.officialEdition,
    officialDate:fact.officialDate,homeTeam:fact.homeTeam,awayTeam:fact.awayTeam,
    scoreHome:fact.totalScore?.home,scoreAway:fact.totalScore?.away};
  const source=validateUefaOfficialResult(payload,expected,{nowMs,sameTeam});
  if(!source.ok)return deny(source.reason);
  if(!isDeepStrictEqual(source.fact,fact))return deny('REVIEWED_LEDGER_RAW_FACT_DISAGREEMENT');
  const acquired=Date.parse(capturedAt),finished=Date.parse(fact.fullTimeAt);
  if(!Number.isFinite(acquired)||acquired<finished||acquired>nowMs)return deny('OFFICIAL_CAPTURE_AVAILABILITY_INVALID');
  const day=athensDayFromKickoff(fact.kickoffUtc);
  if(day!==row.day)return deny('REVIEWED_ATHENS_DAY_MISMATCH');
  if(row.status==='MISSING_VERIFIED_FINAL_REVIEW'){
    if(!canonical||canonical.canonicalId!==row.canonicalId||canonical.leagueSlug!==fact.leagueSlug
        ||Date.parse(canonical.kickoffUtc)!==Date.parse(fact.kickoffUtc)
        ||!sameTeam(canonical.homeTeam,fact.homeTeam)||!sameTeam(canonical.awayTeam,fact.awayTeam))return deny('EXISTING_CANONICAL_EXACT_BINDING_REQUIRED');
  }else if(canonical)return deny('HISTORICAL_CANONICAL_ALREADY_EXISTS');
  const status=fact.penaltyScore?'PEN':fact.totalScore.home!==fact.regularScore.home||fact.totalScore.away!==fact.regularScore.away?'AET':'FT';
  const scorePeriods={regular:fact.regularScore,total:fact.totalScore,penalty:fact.penaltyScore,extraTime:fact.extraTimeScore};
  const proof={policy:UEFA_LEDGER_RECOVERY_POLICY,ledgerSha256,sourceSha256:row.sourceSha256,
    sourceUrl:'https://match.uefa.com/v5/matches/'+row.id,capturedAt,providerMatchId:row.id,
    homeProviderTeamId:fact.homeProviderTeamId,awayProviderTeamId:fact.awayProviderTeamId,
    sourceStatus:fact.sourceStatus,officialEdition:fact.officialEdition,scorePeriods,
    scoreBasis:'UEFA_EXPLICIT_REGULAR_90_MINUTES',singleAuthority:true,independentSourceCount:1};
  const generatedAt=new Date(nowMs).toISOString();
  let proposed=canonical?{...canonical}:{canonicalId:buildCanonicalId(fact.leagueSlug,fact.homeTeam,fact.awayTeam,day),
    leagueSlug:fact.leagueSlug,leagueName:'UEFA Nations League',dayKey:day,kickoffUtc:fact.kickoffUtc,
    homeTeam:fact.homeTeam,awayTeam:fact.awayTeam,source:'uefa-official',sourceId:row.id,sourceMatchId:row.id,
    firstSeenAt:capturedAt,lastSeenAt:capturedAt};
  proposed={...proposed,matchId:proposed.canonicalId,providerIds:{...proposed.providerIds,uefa:row.id},
    scoreBasis:proof.scoreBasis,scorePeriods,reviewedUefaRecovery:proof};
  const final=buildVerifiedFinalResult(day,{...proposed,matchId:proposed.canonicalId},
    {scoreHome:fact.regularScore.home,scoreAway:fact.regularScore.away,kickoffUtc:fact.kickoffUtc});
  Object.assign(final,{source:'uefa_official_reviewed_offline_native_result',generatedAt,
    verdict:'manual_official_url_validated',finalTruthVerdict:'manual_official_url_validated',status,
    providerIds:{...proposed.providerIds},scoreBasis:proof.scoreBasis,scorePeriods,reviewedUefaRecovery:proof,
    sources:[{provider:'uefa-official',providerMatchId:row.id,url:proof.sourceUrl,sourceSha256:row.sourceSha256,
      capturedAt,homeProviderTeamId:fact.homeProviderTeamId,awayProviderTeamId:fact.awayProviderTeamId,
      finished:true,playedFinal:true,nonPlayedTerminal:false,scoreBasis:proof.scoreBasis,scorePeriods}],
    verification:{verdict:'manual_official_url_validated',finalTruthVerdict:'manual_official_url_validated',
      state:'manual_official_url_validated',method:UEFA_LEDGER_RECOVERY_POLICY,sourceCount:1,independentSourceCount:1,generatedAt},
    settlement:{state:'manual_official_url_validated',finalTruthVerdict:'manual_official_url_validated'}});
  if(canonical){
    const repair=planCanonicalVerifiedFinalRepair({dayKey:day,canonicalEntries:[{row:proposed,index:0,name:'uefa.nations.json',filePath:row.canonicalPath}],
      finalEntries:[{row:final,filePath:row.finalPath}],repairedAt:generatedAt});
    if(repair.actionCount!==1||repair.blockedCount)return deny('EXISTING_CANONICAL_REPAIR_REJECTED:'+JSON.stringify(repair.blocked));
    proposed=repair.actions[0].after;
  }else proposed={...proposed,status,rawStatus:status==='FT'?'STATUS_FINAL':'STATUS_FINAL_'+status,
    statusType:status==='FT'?'STATUS_FINAL':'STATUS_FINAL_'+status,operationalState:'TERMINAL_CONFIRMED',
    scoreHome:fact.regularScore.home,scoreAway:fact.regularScore.away,minute:'FT',finalized:1};
  assertCanonicalStatusCoherence({fixtures:[proposed]});
  const built=buildVerifiedHistoryDay({dayKey:day,canonicalRows:[proposed],finalResultRows:[final],rebuiltAt:nowMs});
  if(!built.ok||built.rows.length!==1)return deny('VERIFIED_HISTORY_CONSUMER_REJECTED:'+JSON.stringify(built.errors));
  return {ok:true,productionWrites:0,providerMatchId:row.id,kind:row.status,
    canonicalProposal:proposed,finalProposal:final,historyRow:{...built.rows[0],scoreBasis:proof.scoreBasis,scorePeriods,
      reviewedUefaRecovery:proof},season:built.season,consumerValidation:'PASSED'};
}
