import test from 'node:test';
import assert from 'node:assert/strict';
import {officialDetailTasks} from './resume-global-history-recovery.js';
const row={leagueSlug:'uefa.nations',officialMatchId:'123',matchUrl:'https://www.uefa.com/uefanationsleague/match/123--home-vs-away/',officialEdition:'2026-2027'};
const doc=entries=>({schema:'ai-matchlab.official-history-comparison.v1',productionWrites:0,authorityPromotionAllowed:false,
  comparisons:entries});
const missing=official=>({official,status:'NO_LOCAL_ORDERED_PAIR_OBSERVED'});

test('official detail collection deduplicates exact IDs and retains only the supported official competition',()=>{
  const result=officialDetailTasks(doc([missing(row),missing(row),missing({...row,leagueSlug:'fra.coupe_de_france'})]));
  assert.equal(result.length,1);assert.equal(result[0].officialMatchId,'123');
  assert.equal(officialDetailTasks(doc([{official:row,status:'SAME_OBSERVED_SCORE_REQUIRES_AUTHORITY_AND_PERIOD_VALIDATION'}])).length,0);
});

test('foreign hosts, query injection and a mismatched native ID cannot become acquisition tasks',()=>{
  for(const patch of [{matchUrl:row.matchUrl.replace('www.uefa.com','example.com')},{matchUrl:row.matchUrl+'?url=http://127.0.0.1'},
    {officialMatchId:'456'}])assert.throws(()=>officialDetailTasks(doc([missing({...row,...patch})])),/EXACT_UEFA/);
  assert.throws(()=>officialDetailTasks({...doc([]),authorityPromotionAllowed:true}),/READ_ONLY/);
});
