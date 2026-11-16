import test from 'node:test';
import assert from 'node:assert/strict';
import {planAdditiveHistoryDay} from './additive-history-recovery.js';
const row={id:'cid_new',dayKey:'2026-09-01',leagueSlug:'eng.1',kickoff_ms:Date.parse('2026-09-01T18:00Z'),homeTeam:'Home',awayTeam:'Away',scoreHome:1,scoreAway:0,status:'FT',
  truthContract:{canonicalIdExact:true,athensDayExact:true,exactScoreParity:true,verifiedFinalTruth:true}};
const build=rows=>({ok:true,dayKey:row.dayKey,season:'2026-2027',errors:[],rows});
const store=rows=>({season:'2026-2027',days:[{dayKey:row.dayKey,rows,customMetadata:'preserve'}]});
const options={resolveTeam:(_slug,name)=>({ok:true,globalClubId:name})};

test('verified additions preserve every absent old fact and its metadata without mutating input',()=>{
  const old={...row,id:'old_numeric',leagueSlug:'bul.2'},existing=store([old]);
  const before=JSON.stringify(existing),result=planAdditiveHistoryDay(build([row]),existing,options);
  assert.equal(result.ok,true);assert.equal(result.additions.length,1);assert.deepEqual(result.document.days[0].rows,[old,row]);
  assert.equal(result.document.days[0].customMetadata,'preserve');assert.equal(JSON.stringify(existing),before);
});

test('conflicting same IDs and cross-day IDs hold the entire day',()=>{
  assert.equal(planAdditiveHistoryDay(build([row]),store([{...row,scoreAway:2}]),options).held[0].reason,'EXISTING_HISTORY_FACT_CONFLICT');
  const existing=store([]);existing.days.push({dayKey:'2026-08-31',rows:[row]});
  assert.equal(planAdditiveHistoryDay(build([row]),existing,options).ok,false);
});

test('unknown legacy identity and alternate provider IDs cannot create duplicate events',()=>{
  const old={...row,id:'123'};
  assert.equal(planAdditiveHistoryDay(build([row]),store([old])).held[0].reason,'LEGACY_IDENTITY_RECONCILIATION_REQUIRED');
  assert.equal(planAdditiveHistoryDay(build([row]),store([old]),options).held[0].reason,'POSSIBLE_CROSS_PROVIDER_EVENT_DUPLICATE');
  const result=planAdditiveHistoryDay(build([row]),store([{...old,homeTeam:'Other Home',awayTeam:'Other Away'}]),options);
  assert.equal(result.ok,true);
});

test('an identical existing fact is idempotent, while missing parity and off-map facts are rejected',()=>{
  const existing=store([row]);const result=planAdditiveHistoryDay(build([row]),existing,options);
  assert.equal(result.ok,true);assert.equal(result.additions.length,0);assert.equal(result.document,existing);
  assert.equal(planAdditiveHistoryDay({...build([row]),ok:false},existing,options).ok,false);
  for(const patch of [{leagueSlug:'unmapped.lower'},{scoreHome:null},{truthContract:{}}])assert.equal(planAdditiveHistoryDay(build([{...row,...patch}]),store([]),options).ok,false);
});

test('two proposed identities for one event hold rather than write a partial day',()=>{
  const result=planAdditiveHistoryDay(build([row,{...row,id:'cid_second'}]),store([]),options);
  assert.equal(result.ok,false);assert.deepEqual(result.additions,[]);
  assert.equal(result.held[0].reason,'PROPOSED_EVENT_IDENTITY_RECONCILIATION_REQUIRED');
});

test('validated UEFA senior native IDs prove distinct national events without inventing global club IDs',()=>{
  const fresh={...row,leagueSlug:'uefa.nations'};
  const old={...fresh,id:'cid_old',homeTeam:'Other Home',awayTeam:'Other Away'};
  const native={resolveTeam:(_slug,name)=>({ok:true,provider:'uefa-official',teamScope:'NATIONAL_MEN_TEAM_A',providerTeamId:String(['Home','Away','Other Home','Other Away'].indexOf(name)+1)})};
  assert.equal(planAdditiveHistoryDay(build([fresh]),store([old]),native).ok,true);
  assert.equal(planAdditiveHistoryDay(build([fresh]),store([{...fresh,id:'old_id'}]),native).ok,false);
  assert.equal(planAdditiveHistoryDay(build([row]),store([{...old,leagueSlug:'eng.1'}]),native).ok,false);
});

test('same-provider event IDs distinguish separately verified fixtures while shared IDs and unbound facts remain held',()=>{
 const old={...row,id:'cid_other',homeTeam:'Different Home',awayTeam:'Different Away'};
 const resolveEvent=r=>({ok:true,canonicalId:r.id,eventKey:r.homeTeam+'|'+r.awayTeam,verifiedFinalTruth:true,sourceSha256:'a'.repeat(64),providerIds:{flashscore:r.id==='cid_new'?'NATIVE01':'NATIVE02'}});
 assert.equal(planAdditiveHistoryDay(build([row]),store([old]),{resolveEvent}).ok,true);
 assert.equal(planAdditiveHistoryDay(build([row]),store([old]),{resolveEvent:r=>({...resolveEvent(r),providerIds:{flashscore:'NATIVE01'}})}).ok,false);
 assert.equal(planAdditiveHistoryDay(build([row]),store([old]),{resolveEvent:r=>({...resolveEvent(r),verifiedFinalTruth:false})}).ok,false);
 assert.equal(planAdditiveHistoryDay(build([row]),store([old]),{resolveEvent:r=>({...resolveEvent(r),eventKey:'same-event'})}).ok,false);
});
