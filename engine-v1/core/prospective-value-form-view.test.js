import test from 'node:test';
import assert from 'node:assert/strict';
import { prospectiveValueFormView } from './prospective-value-form-view.js';
import { collectPrematchFinalForm } from './prematch-verified-final-form.js';
import { evaluateMatchValue } from './value-engine-v1.js';
import { diagnoseValueRecentSample } from './value-engine-v1.js';

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

test('punctuation-only complete-name variants combine real observations at the consumer without source changes',()=>{
  const make=(id,name)=>({id,canonicalId:id,leagueSlug:'isr.1',homeTeam:name,awayTeam:'Opponent',kickoff:`2026-10-${id==='one'?'01':id==='two'?'08':'15'}T14:00Z`,season:'2026-2027',scoreHome:1,scoreAway:0});
  const original={teamForm:{'Maccabi Tel-Aviv':{matches:[make('one','Maccabi Tel-Aviv'),make('two','Maccabi Tel-Aviv')]},'Maccabi Tel Aviv':{matches:[make('three','Maccabi Tel Aviv')]},Opponent:{matches:[make('one','Maccabi Tel-Aviv'),make('two','Maccabi Tel-Aviv'),make('three','Maccabi Tel Aviv')]}},leagueForm:{},matchups:{}};
  const before=JSON.stringify(original);
  const target={leagueSlug:'isr.1',homeTeam:'Maccabi Tel Aviv',awayTeam:'Opponent',kickoff:'2026-10-19T14:00Z'};
  assert.equal(diagnoseValueRecentSample(target,original,'2026-2027').homeRawSample,2);
  const view=prospectiveValueFormView(original,'2026-2027',now,{readFinalForm:()=>({index:{},summary:{}})});
  assert.equal(diagnoseValueRecentSample(target,view,'2026-2027').homeRawSample,3);
  assert.equal(JSON.stringify(original),before);
});

test('spelling consolidation preserves full distinctive names and squad numbers',()=>{
  const row={id:'x',scoreHome:1,scoreAway:0};
  const names=['Omonia','Omonia 29th May','Omonia Aradippou','Kauno Zalgiris','Zalgiris','Ajax','Ajax U21','Ajax B'];
  const original={teamForm:Object.fromEntries(names.map((name,i)=>[name,{matches:[{...row,id:String(i)}]}]))};
  const view=prospectiveValueFormView(original,'2026-2027',now,{readFinalForm:()=>({index:{},summary:{}})});
  for(const name of names) assert.equal(view.teamForm[name].matches.length,1);
});

test('equivalent spelling never overrides country or explicit club identity boundaries',()=>{
  const make=(id,leagueSlug,homeTeam,homeGlobalClubId)=>({id,leagueSlug,homeTeam,awayTeam:'Opponent',homeGlobalClubId,kickoff:'2026-10-10T14:00Z',season:'2026-2027',scoreHome:1,scoreAway:0});
  const entries={'Liverpool':{matches:[make('eng1','eng.1','Liverpool','english')]},'Liverpool.':{matches:[make('uru1','uru.1','Liverpool.','uruguayan'),make('uru2','uru.1','Liverpool.','uruguayan')]}};
  const view=prospectiveValueFormView({teamForm:entries},'2026-2027',now,{readFinalForm:()=>({index:{},summary:{}})});
  const result=diagnoseValueRecentSample({leagueSlug:'uru.1',homeTeam:'Liverpool',awayTeam:'Opponent',kickoff:'2026-10-19T14:00Z'},view,'2026-2027');
  assert.equal(result.homeRawSample,2);
  assert.equal(result.ok,false);
});

test('equivalent spelling cannot double-count IDs or conceal contradictory scores',()=>{
  const row={id:'same',scoreHome:1,scoreAway:0};
  const base={teamForm:{'Al-Ula':{lastMatches:[row]},'Al Ula':{matches:[{...row}]}}};
  const opts={readFinalForm:()=>({index:{},summary:{}})};
  const view=prospectiveValueFormView(base,'2026-2027',now,opts);
  assert.equal(view.teamForm['Al-Ula'].lastMatches.length,1);
  base.teamForm['Al Ula'].matches[0].scoreHome=2;
  assert.throws(()=>prospectiveValueFormView(base,'2026-2027',now,opts),/value_form_spelling_score_conflict/);
});

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
