import test from 'node:test';import assert from 'node:assert/strict';
import {mergeIdentityStableRows,rowFixtureIdentityKey} from './build-current-season-indexes.js';
const row={id:'canonical_retained',leagueSlug:'ger.1',dayKey:'2026-10-01',kickoff:'2026-10-01T18:00Z',homeTeam:'FC Cologne',awayTeam:'Other Team',scoreHome:2,scoreAway:1,status:'FT'};
test('index dedup uses the unchanged managed club identity across exact established aliases',()=>{
 const alias={...row,id:'native_alternate',homeTeam:'1. FC Köln'};
 assert.equal(rowFixtureIdentityKey(row),rowFixtureIdentityKey(alias));
 const result=mergeIdentityStableRows([row],[alias]);assert.equal(result.rows.length,1);assert.equal(result.rows[0].id,row.id);
 assert.equal(result.metrics.semanticDuplicateRejected,1);
 const conflict=mergeIdentityStableRows([row],[{...alias,scoreAway:9}]);assert.equal(conflict.rows.length,1);assert.equal(conflict.metrics.scoreConflictRejected,1);
});
