import test from 'node:test';
import assert from 'node:assert/strict';
import {sameSquadMarkers,teamNamesMatch} from './team-identity.js';
import {dedupeLeagueDayFixtures,sameTeamName} from './fixture-dedup.js';

test('reviewed Borussia initial is a senior club abbreviation, not a reserve marker',()=>{
 assert.equal(teamNamesMatch('B. Monchengladbach','Borussia Mönchengladbach'),true);
 assert.equal(sameSquadMarkers('B. Monchengladbach','Borussia Mönchengladbach'),true);
 for(const [a,b] of [['Barcelona B','Barcelona'],['B. Monchengladbach','Borussia Mönchengladbach II'],['B. Monchengladbach','Borussia Mönchengladbach U21'],['B. Monchengladbach','Borussia Mönchengladbach W'],['B. Monchengladbach B','Borussia Mönchengladbach']]){
  assert.equal(sameSquadMarkers(a,b),false,`${a} vs ${b}`);
 }
 assert.equal(teamNamesMatch('B. Dortmund','Borussia Dortmund'),false);
});
test('the two German provider rows collapse with both provider IDs and no source mutation',()=>{
 const row=(canonicalId,source,sourceId,homeTeam,awayTeam,kickoffUtc)=>({canonicalId,matchId:canonicalId,source,sourceId,providerIds:{[source]:sourceId},homeTeam,awayTeam,kickoffUtc,dayKey:'2026-10-18',leagueSlug:'ger.1',status:'SCHEDULED'});
 const fs=row('cid_ger1_bmonchengladbach_hoffenheim_20261018','flashscore','zZsPbOwH','B. Monchengladbach','Hoffenheim','2026-10-18T15:30:00Z');
 const espn=row('cid_ger1_borussiamonchengladbach_tsghoffenheim_20261018','espn','401884768','Borussia Mönchengladbach','TSG Hoffenheim','2026-10-18T15:30:00Z');
 const other=row('cid_ger1_bayerleverkusen_freiburg_20261018','espn','401884771','Bayer Leverkusen','SC Freiburg','2026-10-18T13:30:00Z');
 const input=[fs,espn,other],before=JSON.stringify(input),result=dedupeLeagueDayFixtures(input,{slug:'ger.1'});
 assert.equal(result.rows.length,2);assert.equal(result.removed.length,1);
 const kept=result.rows.find(x=>x.canonicalId===espn.canonicalId);
 assert.deepEqual(kept.providerIds,{espn:'401884768',flashscore:'zZsPbOwH'});
 assert.equal(JSON.stringify(input),before);
});
test('explicit production club identity still vetoes a reviewed abbreviation',()=>{
 const identityResolver={resolveTeamReference:({alias})=>({ok:true,globalClubId:alias.startsWith('B.')?'different-club':'senior-club'})};
 assert.equal(sameTeamName('ger.1','B. Monchengladbach','Borussia Mönchengladbach',{identityResolver}),false);
});
