import test from 'node:test';
import assert from 'node:assert/strict';
import {proposeArchivedMatchImport,planArchivedMatchImportBatch} from './archived-match-page-import.js';
const nowMs=Date.parse('2026-10-22T04:00Z'),acquiredAt='2026-10-21T15:00Z';
const candidate={providerMatchId:'match001',leagueSlug:'idn.1',home:'Bali United',away:'PSM Makassar',homeProviderTeamId:'home0001',awayProviderTeamId:'away0001',kickoffUtc:'2026-10-01T08:30Z',scoreHome:2,scoreAway:0};
function environment(){return {event_id_c:'match001',sport_id:1,eventStageId:3,eventStageTypeId:3,common_feed:[{DA:3},{DB:3},{DC:Date.parse(candidate.kickoffUtc)/1000},{DE:'2'},{DF:'0'}],header:{country_name:'Indonesia',tournament:{link:'/football/indonesia/super-league/',tournament:'Super League - Round 4'}},stats2_config:{tournament:'native01',tournamentStage:'native02'},participantsData:{home:[{id:'home0001',name:'Bali United'}],away:[{id:'away0001',name:'PSM Makassar'}]}};}
const page=e=>'window.environment = '+JSON.stringify(e)+';';
const run=(e=environment(),overrides={})=>proposeArchivedMatchImport({html:page(e),candidate,sourceUrl:'https://www.flashscore.com/match/match001/',acquiredAt,nowMs,...overrides});
test('native page and profile agreement produce review-only proposals passing the existing final consumer',()=>{
 const input=environment(),before=JSON.stringify(input),r=run(input);assert.equal(r.ok,true);assert.equal(r.productionWrites,0);assert.equal(r.authorityPromoted,false);assert.equal(r.reviewRequired,true);assert.equal(r.consumerValidation,'PASSED');assert.equal(r.canonicalProposal.providerIds.flashscore,candidate.providerMatchId);assert.equal(r.finalProposal.matchId,r.canonicalProposal.canonicalId);assert.equal(r.finalProposal.generatedAt,new Date(nowMs).toISOString());assert.equal(r.finalProposal.verification.method,'flashscore_archived_match_page_exact_native_parity');assert.equal(JSON.stringify(input),before);
});

test('only country-code suffix capitalization may differ under the same exact native identities',()=>{
 const e=environment();e.participantsData.home[0].name='Bali United (IDN)';e.participantsData.away[0].name='PSM Makassar (IDN)';
 const c={...candidate,home:'Bali United (Idn)',away:'PSM Makassar (Idn)'};
 const accepted=run(e,{candidate:c});assert.equal(accepted.ok,true);
 assert.equal(accepted.canonicalProposal.homeTeam,'Bali United (IDN)');
 assert.equal(accepted.finalProposal.homeTeam,'Bali United (IDN)');
 assert.deepEqual(accepted.canonicalProposal.archivedSourceEvidence.labelRepresentation,{policy:'trailing_country_code_case_only',profileHome:c.home,profileAway:c.away});
 for(const home of ['bali United (Idn)','Bali United (Mne)','Bali United U21 (Idn)','Bali United','BaliUnited (Idn)']){
  assert.equal(run(e,{candidate:{...c,home}}).reason,'PROFILE_MATCH_PAGE_PARITY_FAILED');
 }
 e.participantsData.home[0].id='wrong001';assert.equal(run(e,{candidate:c}).reason,'PROFILE_MATCH_PAGE_PARITY_FAILED');
});
for(const [name,mutate,reason] of [
 ['wrong native match',e=>e.event_id_c='another1','PROFILE_MATCH_PAGE_PARITY_FAILED'],
 ['namesake native club',e=>e.participantsData.home[0].id='namesake','PROFILE_MATCH_PAGE_PARITY_FAILED'],
 ['swapped teams',e=>[e.participantsData.home,e.participantsData.away]=[e.participantsData.away,e.participantsData.home],'PROFILE_MATCH_PAGE_PARITY_FAILED'],
 ['score conflict',e=>e.common_feed.push({DE:'3'}),'PROFILE_MATCH_PAGE_PARITY_FAILED'],
 ['missing score',e=>e.common_feed=e.common_feed.filter(r=>!('DE'in r)),'REGULATION_SCORE_REQUIRED'],
 ['after penalties',e=>e.eventStageId=11,'REGULATION_FINAL_REQUIRED'],
 ['nonplayed',e=>e.eventStageTypeId=5,'REGULATION_FINAL_REQUIRED'],
 ['wrong competition',e=>e.header.tournament.link='/football/azerbaijan/first-division/','PROFILE_MATCH_PAGE_PARITY_FAILED'],
 ['duplicate participant',e=>e.participantsData.home.push({...e.participantsData.home[0]}),'NATIVE_TEAM_IDENTITY_NOT_UNIQUE']
])test(name+' cannot be promoted',()=>{const e=environment();mutate(e);const r=run(e);assert.equal(r.ok,false);assert.equal(r.reason,reason);assert.equal(r.productionWrites,0);});
test('disabled Tanzania, future acquisition, stale matches and ambiguous documents are refused',()=>{
 assert.equal(run(undefined,{candidate:{...candidate,leagueSlug:'tan.1'}}).reason,'DISABLED_COMPETITION');
 assert.equal(run(undefined,{acquiredAt:'2026-10-23T00:00Z'}).reason,'SOURCE_AVAILABILITY_INVALID');
 assert.equal(run(undefined,{nowMs:nowMs+181*86400000}).reason,'OUTSIDE_VERIFIED_PAST_WINDOW');
 assert.equal(run(undefined,{html:page(environment())+'\n'+page(environment())}).reason,'SOURCE_ENVIRONMENT_NOT_UNIQUE');
 assert.equal(run(undefined,{html:'window.environment = (()=>{throw 1})()'}).reason,'SOURCE_ENVIRONMENT_INVALID');
 assert.equal(run(undefined,{sourceUrl:'https://example.com/match/match001/'}).reason,'EXACT_SOURCE_ROUTE_REQUIRED');
});
test('batch preparation is additive and blocks all files on any existing or duplicate identity',()=>{
 const p=run();const batch=planArchivedMatchImportBatch([p]);assert.equal(batch.ok,true);assert.equal(batch.productionWrites,0);assert.equal(batch.files.length,2);
 for(const options of [{canonicalRows:[p.canonicalProposal]},{canonicalRows:[{...p.canonicalProposal,canonicalId:'cid_retained_other_spelling'}]},{finalRows:[p.finalProposal]}]){
  const blocked=planArchivedMatchImportBatch([p],options);assert.equal(blocked.ok,false);assert.deepEqual(blocked.files,[]);
 }
 assert.equal(planArchivedMatchImportBatch([p,p]).ok,false);
 assert.equal(planArchivedMatchImportBatch([{ok:false}]).ok,false);
});
