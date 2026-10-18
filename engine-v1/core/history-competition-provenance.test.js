import test from 'node:test';
import assert from 'node:assert/strict';
import { filterHistoryCompetitionRows, historyCompetitionDecision } from './history-competition-provenance.js';
import { resolveSlug } from '../odds/flashscore-league-map.js';
import { isStrictStandingsHistoryRow } from './standings-foundation.js';
import { isUsableModelPriorRow } from '../jobs/build-model-priors.js';

test('observed competition contamination is rejected by every statistical read boundary', () => {
 const cases=[['eng.1','Southern League Premier Central','England'],['eng.1','Premier League 2','England'],['eng.5','National League North','England'],['ita.1','Serie C - Group A','Italy'],['ita.2','Serie D - Group B','Italy'],['pol.2','III Liga - Group I','Poland'],['tur.2','3. Lig Group 1','Turkey'],['ukr.1','Premier League 2','Ukraine']];
 for(const [leagueSlug,leagueName,country] of cases){
  const row={id:leagueName,leagueSlug,leagueName,homeTeam:'Home',awayTeam:'Away',status:'FT',scoreHome:2,scoreAway:1};
  const before=JSON.stringify(row);
  assert.equal(historyCompetitionDecision(row).accepted,false,leagueName);
  assert.equal(isStrictStandingsHistoryRow(row,leagueSlug),false,leagueName);
  assert.equal(isUsableModelPriorRow(row),false,leagueName);
  assert.equal(resolveSlug(country,leagueName),null,leagueName);
  const result=filterHistoryCompetitionRows([row]);assert.equal(result.summary.excludedRows,1);
  assert.equal(JSON.stringify(row),before);
 }
});
test('real senior competitions and phase labels survive; missing proof is not certification',()=>{
 for(const [leagueSlug,leagueName] of [['eng.1','Premier League'],['eng.5','National League'],['ita.1','Serie A'],['ita.2','Serie B'],['pol.2','I Liga'],['tur.2','1. Lig'],['fin.1','Veikkausliiga - Relegation Group'],['eng.fa','FA Cup']]){
  const r=historyCompetitionDecision({leagueSlug,leagueName});assert.equal(r.accepted,true,leagueName);assert.equal(r.status,'NO_EXPLICIT_CONTRADICTION');
 }
});
test('explicit provider path and resolved slug contradictions cannot enter legacy reads',()=>{
 const r={leagueSlug:'eng.1',leagueName:'Premier League',providerLeaguePath:'/football/england/championship/'};
 assert.equal(historyCompetitionDecision(r).reason,'EXACT_PROVIDER_PATH_SLUG_MISMATCH');
 assert.equal(historyCompetitionDecision({...r,providerLeaguePath:'/football/england/premier-league/'}).status,'EXACT_PATH_VERIFIED');
 assert.equal(historyCompetitionDecision({...r,providerLeaguePath:'/football/england/unknown/'}).accepted,false);
 assert.equal(historyCompetitionDecision({leagueSlug:'eng.1',competitionResolution:{canonicalSlug:'eng.2'}}).accepted,false);
 assert.equal(historyCompetitionDecision({...r,providerLeaguePath:'/football/england/premier-league/',competitionResolution:{canonicalSlug:'eng.2'}}).accepted,false);
 assert.equal(filterHistoryCompetitionRows([null]).summary.excludedRows,1);
});
