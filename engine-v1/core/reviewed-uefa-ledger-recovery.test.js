import test from 'node:test';
import assert from 'node:assert/strict';
import {validateUefaOfficialResult} from '../jobs/collect-uefa-official-history.js';
import {proposeReviewedUefaRecovery,sha256} from './reviewed-uefa-ledger-recovery.js';
const nowMs=Date.parse('2026-11-15T06:00Z'),opts={nowMs,ledgerSha256:'a'.repeat(64),capturedAt:'2026-11-15T00:00Z'};
function fixture(periods={regular:{home:2,away:2},total:{home:2,away:2}}){
 const doc={id:'123',competition:{id:'2014',sex:'MALE',sportsType:'FOOTBALL',teamCategory:'NATIONAL'},seasonYear:'2025',status:'FINISHED',
  kickOffTime:{date:'2024-09-05',dateTime:'2024-09-05T18:00Z'},fullTimeAt:'2024-09-05T20:00Z',
  homeTeam:{id:'100',internationalName:'Home',teamTypeDetail:'NATIONAL_MEN_TEAM_A'},awayTeam:{id:'200',internationalName:'Away',teamTypeDetail:'NATIONAL_MEN_TEAM_A'},score:periods};
 const expected={leagueSlug:'uefa.nations',officialMatchId:'123',officialEdition:'2024-2025',officialDate:'2024-09-05',homeTeam:'Home',awayTeam:'Away',scoreHome:periods.total.home,scoreAway:periods.total.away};
 const raw=Buffer.from(JSON.stringify(doc)),fact=validateUefaOfficialResult(doc,expected,{nowMs}).fact;
 return {raw,row:{id:'123',status:'HISTORICAL_CANONICAL_ABSENT_REVIEW',sourceSha256:sha256(raw),day:'2024-09-05',fact}};
}
test('reviewed final produces exact consumer parity and truthful single-authority provenance',()=>{
 const f=fixture(),r=proposeReviewedUefaRecovery(f.row,f.raw,opts);
 assert.equal(r.ok,true);assert.equal(r.consumerValidation,'PASSED');assert.equal(r.finalProposal.verification.independentSourceCount,1);
 assert.equal(r.historyRow.scoreHome,2);assert.equal(r.finalProposal.status,'FT');assert.equal(r.canonicalProposal.providerIds.uefa,'123');
 assert.equal(JSON.stringify(r.finalProposal).includes('flashscore'),false);
});
test('penalty and extra-time scores never replace explicit ninety-minute scores',()=>{
 for(const [periods,status] of [[{regular:{home:2,away:2},total:{home:3,away:3},penalty:{home:5,away:4}},'PEN'],[{regular:{home:3,away:2},total:{home:5,away:2}},'AET']]){
  const f=fixture(periods),r=proposeReviewedUefaRecovery(f.row,f.raw,opts);
  assert.equal(r.ok,true);assert.equal(r.finalProposal.status,status);assert.equal(r.historyRow.scoreHome,periods.regular.home);
  assert.deepEqual(r.historyRow.scorePeriods.total,periods.total);
 }
});
test('excluded rows, modified bytes, changed ledger facts and invalid capture times are held',()=>{
 const f=fixture();
 assert.equal(proposeReviewedUefaRecovery({...f.row,status:'EXISTING_THREE_WAY_MATCH'},f.raw,opts).ok,false);
 assert.equal(proposeReviewedUefaRecovery(f.row,Buffer.concat([f.raw,Buffer.from(' ')]),opts).ok,false);
 const row=structuredClone(f.row);row.fact.regularScore.home=9;
 assert.equal(proposeReviewedUefaRecovery(row,f.raw,opts).reason,'REVIEWED_LEDGER_RAW_FACT_DISAGREEMENT');
 for(const capturedAt of ['2024-09-05T19:00Z','2027-01-01T00:00Z'])assert.equal(proposeReviewedUefaRecovery(f.row,f.raw,{...opts,capturedAt}).ok,false);
});
test('five-result repair preserves existing IDs and rejects mismatched event or terminal truth',()=>{
 const f=fixture(),canonical={canonicalId:'cid_uefanations_home_away_20240905',leagueSlug:'uefa.nations',dayKey:f.row.day,kickoffUtc:f.row.fact.kickoffUtc,homeTeam:'Home',awayTeam:'Away',status:'FIRST_HALF',rawStatus:'STATUS_FIRST_HALF',providerIds:{espn:'E1',flashscore:'F1'}};
 const row={...f.row,status:'MISSING_VERIFIED_FINAL_REVIEW',canonicalId:canonical.canonicalId,canonicalPath:'data/canonical-fixtures/2024-09-05/uefa.nations.json',finalPath:'data/final-results/2024-09-05/'+canonical.canonicalId+'.json'};
 const r=proposeReviewedUefaRecovery(row,f.raw,{...opts,canonical});assert.equal(r.ok,true);
 assert.deepEqual(r.canonicalProposal.providerIds,{espn:'E1',flashscore:'F1',uefa:'123'});assert.equal(r.canonicalProposal.canonicalId,canonical.canonicalId);
 assert.equal(proposeReviewedUefaRecovery(row,f.raw,{...opts,canonical:{...canonical,awayTeam:'Other'}}).ok,false);
 assert.equal(proposeReviewedUefaRecovery(row,f.raw,{...opts,canonical:{...canonical,status:'FT',rawStatus:'STATUS_FINAL',scoreHome:9,scoreAway:0}}).ok,false);
});
