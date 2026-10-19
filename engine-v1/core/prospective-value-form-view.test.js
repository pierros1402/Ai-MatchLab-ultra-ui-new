import test from 'node:test';
import assert from 'node:assert/strict';
import { prospectiveValueFormView } from './prospective-value-form-view.js';
import { collectPrematchFinalForm } from './prematch-verified-final-form.js';
import { evaluateMatchValue } from './value-engine-v1.js';

const now = Date.parse('2026-10-19T06:00Z');
function evidence({ wrongScore = false, generatedAfterCutoff = false } = {}) {
  const canonicals = [1, 8, 15].map(day => ({ canonicalId:`cid_form_view_${day}`, dayKey:`2026-10-${String(day).padStart(2,'0')}`,
    leagueSlug:'egy.2', homeTeam:'Home', awayTeam:'Away', kickoffUtc:`2026-10-${String(day).padStart(2,'0')}T14:00Z`,
    status:'FT', scoreHome:2, scoreAway:1, source:'flashscore', providerIds:{flashscore:`match00${day}`}, sourceMatchId:`match00${day}` }));
  const candidates = canonicals.map(c => ({providerMatchId:c.sourceMatchId,leagueSlug:c.leagueSlug,kickoffUtc:c.kickoffUtc,scoreHome:wrongScore?9:2,scoreAway:1}));
  const finals = canonicals.map(c => ({...c,schema:'ai-matchlab.verified-final-result.v1',matchId:c.canonicalId,
    verifiedFinalTruth:true,verdict:'verified_final_result',finalTruthVerdict:'verified_final_result',
    generatedAt:generatedAfterCutoff?'2026-10-20T06:00Z':`${c.dayKey}T20:00Z`}));
  return (base, cutoff) => collectPrematchFinalForm(base,candidates,cutoff,{
    fixturesForDay:day=>canonicals.filter(c=>c.dayKey===day),finalForFixture:(_,id)=>finals.find(f=>f.matchId===id)});
}
const base = () => ({teamForm:{},leagueForm:{},matchups:{}});
const input = {leagueSlug:'egy.2',homeTeam:'Home',awayTeam:'Away',kickoff:'2026-10-19T14:00Z'};
const options = {season:'2026-2027',priors:{teamPriors:{},leaguePriors:{},matchupPriors:{}},returnNullDiagnostics:true};

test('actual canonical-final validation supplies three real observations to the unchanged Value gate',async()=>{
  const original=base(),before=structuredClone(original);
  const empty=await evaluateMatchValue({...input},{...options,indexes:original});
  assert.equal(empty.reason,'minimum_recent_sample');
  const view=prospectiveValueFormView(original,'2026-2027',now,{readFinalForm:evidence()});
  const value=await evaluateMatchValue({...input},{...options,indexes:view});
  assert.ok(value&&!value.__valueNullDiagnostic);
  assert.equal(value.meta.recency.homeOverall.rawSample,3);
  assert.equal(value.meta.recency.awayOverall.rawSample,3);
  assert.equal(view.prospectiveVerifiedForm.acceptedMatches,3);
  assert.deepEqual(original,before,'source index remains byte-equivalent');
});

test('a source score conflict or unavailable final cannot populate the Value view',()=>{
  for(const settings of [{wrongScore:true},{generatedAfterCutoff:true}]){
    const view=prospectiveValueFormView(base(),'2026-2027',now,{readFinalForm:evidence(settings)});
    assert.equal(view.prospectiveVerifiedForm.acceptedMatches,0);
    assert.deepEqual(view.teamForm,{});
  }
});

test('invalid foundations and wrong seasons cannot be filled by a read overlay',()=>{
  const gated={...base(),foundationGate:'invalid'};
  assert.equal(prospectiveValueFormView(gated,'2026-2027',now,{readFinalForm:()=>{throw Error('must not read');}}),gated);
  const old=prospectiveValueFormView(base(),'2025-2026',now,{readFinalForm:evidence()});
  assert.equal(old.prospectiveVerifiedForm.acceptedMatches,0);
});

test('preferred entry fields are updated without duplicate samples or changed scores',()=>{
  const seed=prospectiveValueFormView(base(),'2026-2027',now,{readFinalForm:evidence()});
  const existing={...base(),teamForm:{Home:{lastMatches:seed.teamForm.Home.matches}}};
  const view=prospectiveValueFormView(existing,'2026-2027',now,{readFinalForm:evidence()});
  assert.equal(view.teamForm.Home.lastMatches.length,3);
  assert.equal(view.teamForm.Away.matches.length,3);
  assert.equal(existing.teamForm.Away,undefined);
});
