import test from 'node:test';
import assert from 'node:assert/strict';
import { bucketLeagueMatches } from './build-history-archive-from-results.js';
import { archiveSeasonForDate } from '../core/season-model.js';

const slug='eng.1';
const date='2026-10-10T14:00:00Z';
const seasons=new Set([archiveSeasonForDate(slug,date)]);
const first={matchId:'cid_example',date,opp:'Beta',ha:'H',gf:2,ga:1};
const second={...first,matchId:'sofa_example'};
const payload=(rows)=>({teams:{Alpha:rows}});
test('consistent provider duplicates collapse to one archive row',()=>{
 const result=bucketLeagueMatches(slug,payload([first,second]),seasons);
 assert.equal([...result.values()][0].size,1);
});
test('conflicting home or away scores are rejected regardless of source order',()=>{
 for(const changed of [{...second,gf:3},{...second,ga:0}]){
  for(const rows of [[first,changed],[changed,first]])
   assert.throws(()=>bucketLeagueMatches(slug,payload(rows),seasons),/history_archive_result_conflict/);
 }
});
test('different opponents remain separate',()=>{
 const result=bucketLeagueMatches(slug,payload([first,{...second,opp:'Gamma'}]),seasons);
 assert.equal([...result.values()][0].size,2);
});
