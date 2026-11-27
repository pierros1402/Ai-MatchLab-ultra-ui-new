import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {invocationContract,verifyInvocationSource,invocationKey} from './daily-resume-runtime-invocations.mjs';
const source=readFileSync(new URL('../jobs/run-daily-cycle.js',import.meta.url),'utf8');
const census=JSON.parse(readFileSync(new URL('./daily-resume-real-producer-census.json',import.meta.url),'utf8'));
test('all 14 source-bound calls, no runtime authority',()=>{
 const result=verifyInvocationSource(source,census);
 assert.equal(result.invocationCount,14);
 assert.equal(result.sourceBound,true);
 for(const field of ['runtimeObserved','artifactOwnershipVerified','resumeAuthorized','publicationAuthorized']) assert.equal(result[field],false);
 assert.equal(new Set(invocationContract.map(x=>x.id)).size,14);
});
test('source mutation fails closed',()=>assert.throws(()=>verifyInvocationSource(source+'\n',census),/source_blob_mismatch/));
test('missing and reordered census rejected',()=>{
 assert.throws(()=>verifyInvocationSource(source,{calls:census.calls.slice(1)}),/census_count_mismatch/);
 assert.throws(()=>verifyInvocationSource(source,{calls:[...census.calls].reverse()}),/invocation_source_mismatch/);
});
test('repeated calls and catch-up days are distinct',()=>{
 assert.notEqual(invocationKey('details.initial','2026-11-24'),invocationKey('details.final','2026-11-24'));
 assert.notEqual(invocationKey('snapshot.catch-up','2026-11-23'),invocationKey('snapshot.catch-up','2026-11-22'));
});
test('conditional and historical policy preserved',()=>{
 const byId=Object.fromEntries(invocationContract.map(r=>[r.id,r]));
 assert.equal(byId['details.player-usage'].guard,'player-usage-writes-positive');
 assert.equal(byId['snapshot.catch-up'].multiplicity,'per-day');
 for(const id of ['snapshot.catch-up','snapshot.historical']) assert.equal(byId[id].options,'updateLatest:false,preserveValue:true');
 assert.equal(byId['value.historical'].options,'rebuild:false');
});
test('invalid scopes rejected',()=>{
 for(const day of ['2026-02-30','2026-13-01','../foo',null]) assert.throws(()=>invocationKey('details.initial',day));
 assert.throws(()=>invocationKey('unknown','2026-11-24'));
});

// Include focused coverage checks in the existing runtime invocation CI entrypoint.
import './daily-resume-invocation-coverage-advisory.test.mjs';

// Exercise the planner composition in the existing source-bound CI.
import './daily-resume-dependency-aware-advisory.test.mjs';

import './daily-resume-invocation-receipt-candidate.test.mjs';
