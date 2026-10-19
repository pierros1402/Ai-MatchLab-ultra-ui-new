import test from 'node:test';
import assert from 'node:assert/strict';
import {sameSquadMarkers,teamNamesMatch} from './team-identity.js';
import {dedupeLeagueDayFixtures,sameTeamName} from './fixture-dedup.js';

test('reviewed Celta Fortuna rename retains reserve identity and excludes other squads',()=>{
  for(const name of ['RC Celta Fortuna','Celta Fortuna']){
    assert.equal(teamNamesMatch(name,'Celta Vigo B'),true);
    assert.equal(sameSquadMarkers(name,'Celta Vigo B'),true);
    for(const other of ['Celta Vigo','RC Celta','Celta Vigo W','Celta Vigo U21','Celta Vigo C']){
      assert.equal(teamNamesMatch(name,other),false,`${name} / ${other}`);
      assert.equal(sameSquadMarkers(name,other),false,`${name} / ${other}`);
    }
  }
  assert.equal(teamNamesMatch('Fortuna Düsseldorf','Celta Vigo B'),false);
});

test('actual 19 October Celta provider rows merge without changing inputs or dropping either provider identity',()=>{
  const rows=[{canonicalId:'cid_esp2_celtavigob_tenerife_20261019',source:'flashscore',sourceId:'YLuihUR1',providerIds:{flashscore:'YLuihUR1'},homeTeam:'Celta Vigo B',awayTeam:'Tenerife',kickoffUtc:'2026-10-19T18:30:00Z'},
    {canonicalId:'cid_esp2_rcceltafortuna_tenerife_20261019',source:'espn',sourceId:'401883309',providerIds:{espn:'401883309'},homeTeam:'RC Celta Fortuna',awayTeam:'Tenerife',kickoffUtc:'2026-10-19T18:30Z'}]
    .map(row=>({...row,matchId:row.canonicalId,leagueSlug:'esp.2',dayKey:'2026-10-19',status:'SCHEDULED'}));
  const before=JSON.stringify(rows),result=dedupeLeagueDayFixtures(rows,{slug:'esp.2'});
  assert.equal(result.rows.length,1);assert.equal(result.removed.length,1);
  assert.equal(result.rows[0].canonicalId,rows[1].canonicalId);
  assert.deepEqual(result.rows[0].providerIds,{espn:'401883309',flashscore:'YLuihUR1'});
  assert.equal(JSON.stringify(rows),before);
});

test('a finalized contradictory club identity still vetoes the Celta rename',()=>{
  const identityResolver={resolveTeamReference:({alias})=>({ok:true,globalClubId:alias.includes('Fortuna')?'conflicting':'reserve-club'})};
  assert.equal(sameTeamName('esp.2','RC Celta Fortuna','Celta Vigo B',{identityResolver}),false);
});
