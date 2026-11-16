import { LEAGUES_COVERAGE } from '../../workers/_shared/leagues-coverage.js';
import { isPlayedFinal } from './non-played-state.js';
import {canonicalTeamName} from '../storage/team-aliases-db.js';
import {historyCompetitionDecision} from './history-competition-provenance.js';

export const COVERAGE_GAP = Object.freeze({
  providerBaseline:'EXTERNAL_EXPECTED_HISTORY_BASELINE_UNAVAILABLE',
  missingArchive:'NO_ARCHIVE_OBSERVED',
  emptyArchive:'EMPTY_ARCHIVE_OBSERVED',
  acquiredNotStored:'VERIFIED_CANONICAL_RESULT_NOT_IN_HISTORY',
  storedNotIndexed:'STORED_ID_NOT_IN_INDEX_REQUIRES_LINEAGE_REVIEW',
  indexConflict:'CROSS_INDEX_RESULT_CONFLICT',
  invalidResult:'INVALID_STORED_RESULT',
  duplicate:'DUPLICATE_STABLE_ID',
});

export const historyRowId = row => String(row?.canonicalId || row?.matchId || row?.id || '');
export function validCoverageResult(row) {
  return isPlayedFinal(row) && [row.scoreHome,row.scoreAway].every(v =>
    v !== null && v !== undefined && String(v).trim() !== '' && Number.isInteger(Number(v)) && Number(v)>=0)
    && Boolean(row.leagueSlug && row.homeTeam && row.awayTeam && row.homeTeam !== row.awayTeam && historyRowId(row))
    && Number.isFinite(Number(row.kickoff_ms) || Date.parse(row.kickoff || row.kickoffUtc));
}

// An inventory is not an external expected-fixture baseline. No quantity of
// existing rows can prove that a provider fixture was never acquired.
export function censusHistoryCoverage({registry=LEAGUES_COVERAGE, seasons=[], archive=[], history=[],
  verifiedCanonical=[], indexes={}, fixtures=[], consumerDiagnostics=[], readErrors=[],resolveTeamIdentity=null}={}) {
  const gaps=[], competitions=[], teamMap=new Map();
  const lineageResolutions=[],canonicalResolutions=[],identityCache=new Map(),factCache=new WeakMap();
  const team=(slug,name)=>{const key=slug+'\0'+name;if(!identityCache.has(key))identityCache.set(key,resolveTeamIdentity?.(slug,name)||String(canonicalTeamName(slug,name)||name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim());return identityCache.get(key);};
  const fact=row=>{if(!factCache.has(row))factCache.set(row,JSON.stringify([row.leagueSlug,team(row.leagueSlug,row.homeTeam),team(row.leagueSlug,row.awayTeam),Number(row.kickoff_ms)||Date.parse(row.kickoff||row.kickoffUtc),Number(row.scoreHome),Number(row.scoreAway)]));return factCache.get(row);};
  const gap=(reason,detail)=>gaps.push({reason,...detail});
  const indexedBySeason=new Map(),lineageBySeason=new Map(),indexedFactsBySeason=new Map();
  for(const season of seasons){
    const index=indexes[season]||{}, observed=new Map();
    for(const [team,entry] of Object.entries(index.teamForm||{})){
      const seen=new Set();
      for(const row of entry.matches||[]){
        const id=historyRowId(row);
        if(!validCoverageResult(row))gap(COVERAGE_GAP.invalidResult,{season,team,id,store:'team-form'});
        if(seen.has(id))gap(COVERAGE_GAP.duplicate,{season,team,id,store:'team-form'});
        seen.add(id);
        const prior=observed.get(id);
        if(prior&&fact(prior)!==fact(row))gap(COVERAGE_GAP.indexConflict,{season,id,store:'team-form'});
        observed.set(id,row);
        const key=JSON.stringify([row.leagueSlug,season,team]);
        const record=teamMap.get(key)||{slug:row.leagueSlug,season,team,indexIds:new Set(),fixtureIds:new Set()};
        record.indexIds.add(id);teamMap.set(key,record);
      }
    }
    const matchupRows=new Map();
    for(const entry of Object.values(index.matchups||{}))for(const row of entry.matches||entry.lastMatches||[]){
      const id=historyRowId(row), previous=matchupRows.get(id);
      if(previous&&fact(previous)!==fact(row))gap(COVERAGE_GAP.indexConflict,{season,id,store:'matchups'});
      matchupRows.set(id,row);
    }
    for(const [id,row] of observed){
      const match=matchupRows.get(id);
      if(!match)gap('TEAM_FORM_ID_NOT_IN_MATCHUPS',{season,id,slug:row.leagueSlug});
      else if(fact(row)!==fact(match))gap(COVERAGE_GAP.indexConflict,{season,id,store:'team-form/matchups'});
    }
    for(const [id,row] of matchupRows)if(!observed.has(id))gap('MATCHUP_ID_NOT_IN_TEAM_FORM',{season,id,slug:row.leagueSlug});
    for(const meta of registry){
      const rows=[...observed.values()].filter(row=>row.leagueSlug===meta.slug);
      const leagueCount=index.leagueForm?.[meta.slug]?.matches||0;
      if(rows.length!==leagueCount)gap('LEAGUE_FORM_COUNT_CONFLICT',{season,slug:meta.slug,teamFormRows:rows.length,leagueFormRows:leagueCount});
    }
    indexedBySeason.set(season,observed);
    const references=new Map(),facts=new Map();
    for(const row of [...observed.values(),...matchupRows.values()]){
      for(const id of [historyRowId(row),...(row.sourceMatchIds||[]),...(row.legacyMatchIds||[])]){
        if(!references.has(id))references.set(id,new Map());references.get(id).set(historyRowId(row),row);
      }
      const f=fact(row);if(!facts.has(f))facts.set(f,[]);if(!facts.get(f).some(r=>historyRowId(r)===historyRowId(row)))facts.get(f).push(row);
    }
    lineageBySeason.set(season,references);indexedFactsBySeason.set(season,facts);
  }
  for(const doc of history){
    const seen=new Set();
    for(const row of doc.rows){
      const id=historyRowId(row);
      if(seen.has(id))gap(COVERAGE_GAP.duplicate,{season:doc.season,id,store:'history'});
      seen.add(id);
      if(!validCoverageResult(row))gap(COVERAGE_GAP.invalidResult,{season:doc.season,id,store:'history'});
      if(!indexedBySeason.get(doc.season)?.has(id)){
        const decision=historyCompetitionDecision(row);
        const references=[...(lineageBySeason.get(doc.season)?.get(id)||new Map()).values()].filter(r=>fact(r)===fact(row));
        const equivalent=indexedFactsBySeason.get(doc.season)?.get(fact(row))||[];
        if(!decision.accepted)lineageResolutions.push({season:doc.season,id,slug:row.leagueSlug,status:'EXPLICIT_COMPETITION_EXCLUSION',decision});
        else if(references.length===1)lineageResolutions.push({season:doc.season,id,slug:row.leagueSlug,status:'EXPLICIT_INDEX_LINEAGE_SAME_FACT',indexedId:historyRowId(references[0])});
        else if(equivalent.length===1)lineageResolutions.push({season:doc.season,id,slug:row.leagueSlug,status:'EXACT_EVENT_INDEXED_OTHER_ID',indexedId:historyRowId(equivalent[0])});
        else gap(COVERAGE_GAP.storedNotIndexed,{season:doc.season,id,slug:row.leagueSlug});
      }
    }
  }
  for(const doc of verifiedCanonical){
    const stored=new Map(history.filter(d=>d.season===doc.season).flatMap(d=>d.rows).map(row=>[historyRowId(row),row]));
    const byFact=new Map();for(const row of stored.values()){const f=fact(row);if(!byFact.has(f))byFact.set(f,[]);byFact.get(f).push(row);}
    for(const row of doc.rows){
      const id=historyRowId(row), old=stored.get(id);
      if(!old){
        const decision=historyCompetitionDecision(row),equivalent=byFact.get(fact(row))||[];
        if(!decision.accepted)canonicalResolutions.push({season:doc.season,id,slug:row.leagueSlug,status:'EXPLICIT_COMPETITION_EXCLUSION',decision});
        else if(equivalent.length===1)canonicalResolutions.push({season:doc.season,id,slug:row.leagueSlug,status:'EXACT_EVENT_ALREADY_STORED_OTHER_ID',storedId:historyRowId(equivalent[0])});
        else gap(COVERAGE_GAP.acquiredNotStored,{season:doc.season,id,slug:row.leagueSlug,dayKey:doc.dayKey});
      }
      else if(fact(old)!==fact(row))gap('CANONICAL_HISTORY_RESULT_CONFLICT',{season:doc.season,id,slug:row.leagueSlug,dayKey:doc.dayKey});
    }
  }
  for(const meta of registry){
    const docs=archive.filter(doc=>doc.slug===meta.slug);
    if(!docs.length)gap(COVERAGE_GAP.missingArchive,{slug:meta.slug});
    for(const doc of docs){
      if(!doc.rows.length)gap(COVERAGE_GAP.emptyArchive,{slug:meta.slug,season:doc.season});
      const seen=new Set();
      for(const row of doc.rows){
        const id=historyRowId(row);
        if(seen.has(id))gap(COVERAGE_GAP.duplicate,{slug:meta.slug,season:doc.season,id,store:'archive'});
        seen.add(id);
        if(!validCoverageResult(row))gap(COVERAGE_GAP.invalidResult,{slug:meta.slug,season:doc.season,id,store:'archive'});
        for(const team of [row.homeTeam,row.awayTeam].filter(Boolean)){
          const key=JSON.stringify([meta.slug,doc.season,team]);
          const record=teamMap.get(key)||{slug:meta.slug,season:doc.season,team,indexIds:new Set(),fixtureIds:new Set()};
          record.archiveObservedRows=(record.archiveObservedRows||0)+1;
          teamMap.set(key,record);
        }
      }
    }
    competitions.push({slug:meta.slug,type:meta.type,archiveSeasons:docs.map(doc=>({season:doc.season,rows:doc.rows.length})),
      currentAndPrevious:seasons.map(season=>({season,
        historyRows:history.filter(doc=>doc.season===season).flatMap(doc=>doc.rows).filter(row=>row.leagueSlug===meta.slug).length,
        indexedRows:[...(indexedBySeason.get(season)||new Map()).values()].filter(row=>row.leagueSlug===meta.slug).length})),
      expectedProviderHistory:null,expectedCoverageStatus:COVERAGE_GAP.providerBaseline});
  }
  for(const fixture of fixtures)for(const team of [fixture.homeTeam,fixture.awayTeam]){
    const key=JSON.stringify([fixture.leagueSlug,fixture.season||seasons[0],team]);
    const record=teamMap.get(key)||{slug:fixture.leagueSlug,season:fixture.season||seasons[0],team,indexIds:new Set(),fixtureIds:new Set()};
    record.fixtureIds.add(historyRowId(fixture));teamMap.set(key,record);
  }
  for(const diagnostic of consumerDiagnostics)if(!diagnostic.ok)gap('CONSUMER_MINIMUM_SAMPLE_NOT_MET',{
    slug:diagnostic.leagueSlug,id:diagnostic.id,homeTeam:diagnostic.homeTeam,awayTeam:diagnostic.awayTeam,
    homeSample:diagnostic.homeRawSample,awaySample:diagnostic.awayRawSample,formMaxAgeDays:diagnostic.formMaxAgeDays});
  return {schema:'ai-matchlab.global-history-coverage.v1',fullCoverageCertified:false,
    status:readErrors.length?'READ_ERROR':'UNRESOLVED',
    expectedBaseline:{source:'approved_competition_registry_and_observed_canonical_truth',
      competitionCount:registry.length,externalProviderCompleteness:'NOT_VERIFIED'},
    metrics:{competitions:registry.length,archiveFiles:archive.length,archiveRows:archive.reduce((n,d)=>n+d.rows.length,0),
      historyRows:history.reduce((n,d)=>n+d.rows.length,0),verifiedCanonicalRows:verifiedCanonical.reduce((n,d)=>n+d.rows.length,0),
      teams:teamMap.size,consumerFixtures:consumerDiagnostics.length,consumerReady:consumerDiagnostics.filter(d=>d.ok).length,
      gaps:gaps.length,readErrors:readErrors.length},
    competitions,teams:[...teamMap.values()].map(r=>({...r,indexIds:[...r.indexIds].sort(),fixtureIds:[...r.fixtureIds].sort()})),
    gaps,readErrors,consumerDiagnostics,lineageResolutions,canonicalResolutions,frozenPredictionsRegenerated:false};
}
