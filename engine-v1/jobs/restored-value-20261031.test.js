import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {planAObservationSignature} from '../value/plan-a-observation.js';
import {canonicalFileSha256} from '../core/deploy-snapshot-release-contract.js';
import {validateStagedRelease} from './sync-deploy-snapshot-from-github.js';
import {verifyDetailsValueMirrorDay} from './verify-details-value-mirror-day.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),day='2026-10-31';
const data=(...p)=>path.join(root,'data',...p),snap=data('deploy-snapshots',day),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
test('31 October retains the exact original prematch observation and approved audit',()=>{
 const observation=read(data('value-plans',day,'plan-a.json')),value=read(path.join(snap,'value.json'));
 assert.equal(canonicalFileSha256(data('value-plans',day,'plan-a.json')),'5171f346ff93d183655acec092c96eae54bd1d3837d33ec797a04df9f6aa21cd');
 assert.equal(planAObservationSignature(day,observation),'12f7556309c0f1149b0fdddc1063440193a01255459e7446725b749250c99735');
 assert.deepEqual(value.picks,observation.picks);assert.equal(value.count,1);assert.equal(value.publicationAuthority,'frozen_plan_a_observation');
 assert.ok(Date.parse(observation.frozenAt)<Date.parse(observation.picks[0].kickoff));
 assert.equal(canonicalFileSha256(path.join(snap,'value-audit.json')),'8c551ecc59d9b23f38511dc277bd8176871ab377d0b017c1889ae1b92d30ea84');
});
test('all 537 published Details, manifest bindings and the source observation agree',async()=>{
 const manifest=read(path.join(snap,'manifest.json'));await validateStagedRelease(snap,manifest);
 assert.equal(manifest.valueGate.ok,true);assert.equal(manifest.counts.details,537);assert.equal(manifest.counts.valuePicks,1);
 const result=verifyDetailsValueMirrorDay(day,{resolveDataPath:(...parts)=>parts[0]==='details'?path.join(snap,'details',...parts.slice(2)):data(...parts)});
 assert.equal(result.ok,true,JSON.stringify(result.violations));
});
test('four original plan routes settle only against verified finals; U1 absence is never a zero-pick success',()=>{
 const result=read(data('value-comparison',day+'.json'));
 assert.deepEqual(['A','A2','B','B2'].map(k=>result.plans[k].count),[1,1,2,2]);
 assert.deepEqual(['A','A2','B','B2'].map(k=>[result.plans[k].summary.wins,result.plans[k].summary.losses]),[[1,0],[1,0],[1,1],[1,1]]);
 for(const plan of Object.values(result.plans))for(const row of plan.picks){const final=read(data('final-results',day,row.matchId+'.json'));assert.equal(final.verifiedFinalTruth,true);assert.equal(final.date,day);assert.equal(final.matchId,row.matchId);assert.equal(row.finalScore.homeScore,final.scoreHome);assert.equal(row.finalScore.awayScore,final.scoreAway);}
 assert.equal(result.unifiedPlan.status,'NOT_AVAILABLE');assert.equal(result.unifiedPlan.zeroPicksCertified,false);
 const original=read(data('history-resolutions',day,'original-comparison.json'));
 assert.equal(original.unifiedPlan.reason,'unified_existing_observation_signature_mismatch');
});
