import test from 'node:test';
import assert from 'node:assert/strict';
import {buildValueDataReadiness} from './value-data-readiness.js';
import {buildValueFixtureUniverse,valueFixtureUniverseContract} from './value-fixture-universe.js';
const day='2026-10-18';
const fixtures=[{canonicalId:'cid_ready',leagueSlug:'eng.1',homeTeam:'H',awayTeam:'A',kickoffUtc:day+'T19:00Z',status:'PRE'}];
const assessment={...fixtures[0],aiAssessment:{markets:{OU25:{probs:{over:.8,under:.2}}}}};
const coverage={dayKey:day,source:{fixtureUniverse:valueFixtureUniverseContract(buildValueFixtureUniverse(day,{fixtures}))},rows:[{matchId:'cid_ready',detailsFound:true,valueReturned:true}]};
test('only evaluated fixtures with a unique model join are complete; absent standings stay explicit',()=>{
 const r=buildValueDataReadiness({day,fixtures,assessments:[assessment],coverage});
 assert.equal(r.complete,true);assert.equal(r.rows[0].standings.usable,false);assert.equal(r.sourcePolicy.thresholdsChanged,false);
});
test('green infrastructure cannot certify absent models or insufficient recent history',()=>{
 const c=structuredClone(coverage);Object.assign(c.rows[0],{valueReturned:false,nullReason:'minimum_recent_sample'});
 const r=buildValueDataReadiness({day,fixtures,coverage:c,standings:{'eng.1':{ok:true}}});
 assert.equal(r.complete,false);assert.equal(r.status,'INSUFFICIENT_DATA');assert.deepEqual(r.rows[0].reasons,['minimum_recent_sample','missing_model_assessment']);
});
test('stale universe, duplicate diagnostics and ambiguous assessments fail closed',()=>{
 const c=structuredClone(coverage);c.source.fixtureUniverse.hash='wrong';c.rows.push(c.rows[0]);
 const r=buildValueDataReadiness({day,fixtures,coverage:c,assessments:[assessment,{...assessment,aiAssessment:{markets:{OU25:{probs:{over:.9}}}}}]});
 assert.equal(r.complete,false);assert.ok(r.rows[0].reasons.includes('coverage_missing_or_wrong_universe'));
 assert.ok(r.rows[0].reasons.includes('fixture_coverage_missing_or_ambiguous'));assert.ok(r.rows[0].reasons.includes('ambiguous_model_assessment'));
});
test('cancelled fixtures are explicit exclusions; empty fixture discovery is never complete',()=>{
 assert.equal(buildValueDataReadiness({day,fixtures:[]}).complete,false);
 const r=buildValueDataReadiness({day,fixtures:[{...fixtures[0],status:'CANCELLED'}]});assert.equal(r.rows[0].status,'NOT_APPLICABLE');assert.equal(r.complete,false);
});
