import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourcePins,cacheHazards,artifactCandidates,verifyArtifactSources,assessReuse} from './daily-resume-artifact-cache-contract.mjs';
const sources=Object.fromEntries(Object.keys(sourcePins).map(p=>[p,readFileSync(new URL('../../'+p,import.meta.url),'utf8')]));
test('eight exact producer and authority source pins',()=>{
 const r=verifyArtifactSources(sources);
 assert.equal(r.sourceCount,8);assert.equal(r.invocationCount,13);assert.equal(r.cacheHazardCount,4);
 for(const k of ['runtimeObserved','artifactOwnershipVerified','resumeAuthorized','publicationAuthorized'])assert.equal(r[k],false);
});
test('source corruption and missing source fail closed',()=>{
 const p=Object.keys(sources)[0];
 assert.throws(()=>verifyArtifactSources({...sources,[p]:sources[p]+'\n'}),/source_drift/);
 const missing={...sources};delete missing[p];assert.throws(()=>verifyArtifactSources(missing),/source_set_mismatch/);
});
test('historical exports cannot claim latest',()=>{
 for(const id of ['snapshot.historical','snapshot.catch-up'])assert.equal(artifactCandidates.find(r=>r.id===id).candidateWrites.includes('deploy-snapshots/latest.json'),false);
 assert.equal(artifactCandidates.find(r=>r.id==='snapshot.initial').candidateWrites.includes('deploy-snapshots/latest.json'),true);
});
test('shared families are candidates, never exclusive ownership',()=>{
 assert.ok(artifactCandidates.every(r=>r.conditionalWrites&&!r.exclusiveOwnershipVerified));
 assert.deepEqual(artifactCandidates.find(r=>r.id==='details.initial').candidateWrites,artifactCandidates.find(r=>r.id==='details.final').candidateWrites);
});
test('all process and disk hazards fail closed',()=>{
 assert.equal(cacheHazards.filter(r=>r.kind==='process').length,3);
 assert.equal(cacheHazards.filter(r=>r.kind==='disk').length,1);
 assert.ok(cacheHazards.every(r=>r.policy==='block-unobserved-state'));
 for(const row of artifactCandidates)assert.equal(assessReuse(row.id).reusable,false);
 assert.throws(()=>assessReuse('unregistered'),/unknown_invocation/);
});
