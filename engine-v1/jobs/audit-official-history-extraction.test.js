import test from 'node:test';
import assert from 'node:assert/strict';
import {compareOfficialHistory} from './audit-official-history-extraction.js';

const row={leagueSlug:'uefa.nations',officialDate:'2026-09-24',homeTeam:'Home',awayTeam:'Away',scoreHome:2,scoreAway:0};
const local={...row,id:'cid_one',observedDay:'2026-09-24',stores:['data/history/2026-2027.json'],status:'FT'};
const unknown={resolveTeam:()=>({ok:false})};

test('matching aggregate facts never authorize promotion or fill an unknown kickoff',()=>{
  const result=compareOfficialHistory([row],[local],unknown)[0];
  assert.equal(result.status,'SAME_OBSERVED_SCORE_REQUIRES_AUTHORITY_AND_PERIOD_VALIDATION');
  assert.equal(result.official.exactKickoffUtc,undefined);
});

test('date disagreement, missing scores and exact score contradictions remain separate',()=>{
  assert.equal(compareOfficialHistory([row],[{...local,observedDay:'2026-09-25'}],unknown)[0].status,'ORDERED_PAIR_EXISTS_DATE_REQUIRES_REVIEW');
  assert.equal(compareOfficialHistory([row],[{...local,scoreHome:null,scoreAway:null}],unknown)[0].status,'LOCAL_FINAL_SCORE_NOT_OBSERVED');
  assert.equal(compareOfficialHistory([row],[local,{...local,scoreHome:3}],unknown)[0].status,'OFFICIAL_LOCAL_SCORE_DISAGREEMENT');
  assert.equal(compareOfficialHistory([row],[{...local,status:'FIRST_HALF',scoreHome:0}],unknown)[0].status,'LOCAL_NONFINAL_SNAPSHOT_REQUIRES_FINAL_REFRESH');
  assert.equal(compareOfficialHistory([row],[local,{...local,status:'FIRST_HALF',scoreHome:0}],unknown)[0].status,'SAME_OBSERVED_SCORE_REQUIRES_AUTHORITY_AND_PERIOD_VALIDATION');
});

test('committed identities bridge display names while different identities veto matching text',()=>{
  const resolveTeam=(_slug,name)=>({ok:true,globalClubId:['Turkey','Türkiye'].includes(name)?'same':'other'});
  const official={...row,homeTeam:'Turkey'};
  assert.equal(compareOfficialHistory([official],[{...local,homeTeam:'Türkiye'}],{resolveTeam})[0].candidates.length,1);
  let calls=0;
  const alternating=()=>({ok:true,globalClubId:String(++calls)});
  assert.equal(compareOfficialHistory([row],[{...local,homeTeam:'Hôme'}],{resolveTeam:alternating})[0].candidates.length,0);
});

test('missing official dates and competitions outside the map cannot be accepted',()=>{
  assert.equal(compareOfficialHistory([{...row,officialDate:null}],[local],unknown)[0].status,'OFFICIAL_EXACT_DATE_REQUIRED');
  assert.throws(()=>compareOfficialHistory([{...row,leagueSlug:'unmapped.lower'}],[local],unknown),/OUTSIDE_APPROVED_MAP/);
});
