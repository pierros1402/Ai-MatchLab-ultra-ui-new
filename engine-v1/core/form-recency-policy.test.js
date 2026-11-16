import test from 'node:test';
import assert from 'node:assert/strict';
import { LEAGUES_COVERAGE } from '../../workers/_shared/leagues-coverage.js';
import { formMaximumAgeDays, isEligibleFormDate } from './form-recency-policy.js';
import { diagnoseValueRecentSample, evaluateMatchValue } from './value-engine-v1.js';

const kickoff = new Date('2026-11-15T18:00Z');
const season = '2026-2027';
const priors = {teamPriors:{},leaguePriors:{},matchupPriors:{}};
function inputs(slug, days = [40, 50, 60]) {
  const matches = days.map((age, n) => ({id:`result_${n}`, leagueSlug:slug, season,
    homeTeam:'Home', awayTeam:'Away', status:'FT', scoreHome:2, scoreAway:1,
    kickoff:new Date(+kickoff-age*86400000).toISOString()}));
  return { input:{leagueSlug:slug,homeTeam:'Home',awayTeam:'Away',kickoff:kickoff.toISOString()},
    indexes:{teamForm:{Home:{matches},Away:{matches}},leagueForm:{},matchups:{}} };
}

test('every approved international competition uses the exception; every domestic competition retains 35 days', () => {
  for (const meta of LEAGUES_COVERAGE) {
    const international = ['national','continental'].includes(meta.type);
    assert.equal(formMaximumAgeDays(meta.slug), international ? null : 35, meta.slug);
    const {input,indexes} = inputs(meta.slug);
    const diagnosis = diagnoseValueRecentSample(input,indexes,season);
    assert.equal(diagnosis.ok,international,meta.slug);
    assert.equal(diagnosis.homeRawSample,international ? 3 : 0,meta.slug);
    assert.equal(diagnosis.formMaxAgeDays,international ? null : 35,meta.slug);
  }
  assert.equal(formMaximumAgeDays('invented.uefa.world'),35);
});

test('international exception retains the five-result window and the three-real-result gate', () => {
  for (const count of [0,1,2,3,7]) {
    const {input,indexes} = inputs('uefa.nations',Array.from({length:count},(_,n)=>40+n));
    const diagnosis=diagnoseValueRecentSample(input,indexes,season);
    assert.equal(diagnosis.ok,count>=3);
    assert.equal(diagnosis.homeRawSample,Math.min(count,5));
  }
});

test('previous-season, future, same-kickoff and conflicting-identity observations cannot fill the sample', () => {
  const {input,indexes}=inputs('uefa.champions',[40,50,60,0,-1]);
  indexes.teamForm.Home.matches[0].season='2025-2026';
  const diagnosis=diagnoseValueRecentSample(input,indexes,season);
  assert.equal(diagnosis.homeRawSample,2);
  assert.equal(diagnosis.ok,false);
  assert.equal(isEligibleFormDate(new Date(NaN),kickoff,'uefa.nations'),false);
  const bound=inputs('uefa.champions');
  bound.input.homeGlobalClubId='expected';
  for(const row of bound.indexes.teamForm.Home.matches) row.homeGlobalClubId='other';
  assert.equal(diagnoseValueRecentSample(bound.input,bound.indexes,season).homeRawSample,0);
});

test('domestic age boundary is unchanged and unknown competition display text grants no exception', () => {
  assert.equal(isEligibleFormDate(new Date(+kickoff-35*86400000),kickoff,'fra.coupe_de_france'),true);
  assert.equal(isEligibleFormDate(new Date(+kickoff-36*86400000),kickoff,'fra.coupe_de_france'),false);
  assert.equal(isEligibleFormDate(new Date(+kickoff-40*86400000),kickoff,'unknown'),false);
});

test('the existing approved national-team alias resolves Czech Republic to its stored Czechia key',()=>{
  const {input,indexes}=inputs('uefa.nations');
  input.homeTeam='Czech Republic';
  indexes.teamForm.czechia={matches:indexes.teamForm.Home.matches.map(row=>({...row,homeTeam:'czechia'}))};
  delete indexes.teamForm.Home;
  const result=diagnoseValueRecentSample(input,indexes,season);
  assert.equal(result.homeResolvedKey,'czechia');assert.equal(result.homeRawSample,3);
});

test('the committed Turkey identity reaches Türkiye history without adding an alias or accepting a foreign club ID',()=>{
  const {input,indexes}=inputs('uefa.nations');
  input.homeTeam='Turkey';
  indexes.teamForm['Türkiye']={matches:indexes.teamForm.Home.matches.map(row=>({...row,homeTeam:'Türkiye'}))};
  delete indexes.teamForm.Home;
  const result=diagnoseValueRecentSample(input,indexes,season);
  assert.equal(result.homeResolvedKey,'Türkiye');assert.equal(result.homeRawSample,3);assert.equal(result.ok,true);
  input.homeGlobalClubId='different-club';
  const conflict=diagnoseValueRecentSample(input,indexes,season);
  assert.equal(conflict.homeRawSample,0);assert.equal(conflict.ok,false);
  delete input.homeGlobalClubId;
  for(const row of indexes.teamForm['Türkiye'].matches)row.homeGlobalClubId='different-club';
  assert.equal(diagnoseValueRecentSample(input,indexes,season).homeRawSample,0);
});

test('actual evaluator admits older international form and keeps recency decay in its output',async () => {
  const stale=inputs('uefa.nations'), recent=inputs('uefa.nations',[1,5,9]);
  const run=({input,indexes})=>evaluateMatchValue({...input},{season,indexes,priors,returnNullDiagnostics:true});
  const a=await run(stale), b=await run(recent);
  assert.ok(a && !a.__valueNullDiagnostic);
  assert.equal(a.meta.formRules.maxAgeDays,null);
  assert.equal(a.meta.recency.homeOverall.rawSample,3);
  assert.ok(a.meta.recency.homeOverall.freshnessScore < b.meta.recency.homeOverall.freshnessScore);
  const domestic=await run(inputs('fra.coupe_de_france'));
  assert.equal(domestic.reason,'minimum_recent_sample');
  assert.equal(domestic.minimumRecentSample.formMaxAgeDays,35);
});
