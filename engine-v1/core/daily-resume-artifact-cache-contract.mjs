// Selected direct artifact families and process-cache hazards, not a complete IO trace.
import { createHash } from 'node:crypto';
import { invocationContract } from './daily-resume-runtime-invocations.mjs';
const freeze = x => Object.freeze(x);
export const sourcePins=freeze({
 'engine-v1/jobs/build-details-day.js':'81419c0605fa168c1931e5110d7aa8b87a5354f4',
 'engine-v1/core/build-value-day.js':'e127f22a3985d0861c5f68357928474800aeb7ee',
 'engine-v1/value/daily-plan-a-checkpoint.js':'15f3c1a549b77daf6c858d55fee14ae17d60cb3c',
 'engine-v1/value/plan-a-observation.js':'4cfc5acb44da0bc29809a6d0e2ee156efddfaef9',
 'engine-v1/jobs/export-deploy-snapshot-day.js':'111f2d2201872ad729fc8f23efacc4be0a786b96',
 'engine-v1/jobs/build-standings-day.js':'915d8b30989e75de6bc4999699a4ee584ea9555c',
 'engine-v1/jobs/build-model-priors.js':'f5154a3065948d3a46a1ebf3ec13060b53b2fb82',
 'engine-v1/core/derived-history-foundation.js':'5c4f81f4fbeea557ed901a91e3b931c2e72db51c'
});
export const cacheHazards=freeze([
 freeze({id:'details.foundation',kind:'process',key:'season',dependencies:freeze(['history-index foundation','H2H foundation','kickoff or clock']),policy:'block-unobserved-state'}),
 freeze({id:'value.season-resources',kind:'process',key:'season',dependencies:freeze(['value indexes','model priors','force']),policy:'block-unobserved-state'}),
 freeze({id:'value.day',kind:'process',key:'season:date:a-or-a2',dependencies:freeze(['prior result','rebuild','execution order']),policy:'block-unobserved-state'}),
 freeze({id:'value.file',kind:'disk',key:'date',dependencies:freeze(['value snapshot bytes or absence','canonical fixture IDs','parse outcome','rebuild']),policy:'block-unobserved-state'})
]);
const families=freeze({
 buildDetailsDay:freeze(['details/{day}/{id}.json']),
 buildValueDay:freeze(['value/{day}.json','value/_audit/{day}.json']),
 checkpointDailyPlanA:freeze(['value-plans/{day}/plan-a.json','value-plans/{day}/plan-a-audit.json']),
 exportDeploySnapshotDay:freeze(['deploy-snapshots/{day}/**','deploy-snapshots/latest.json']),
 buildStandingsDay:freeze(['standings/{slug}.json']),
 buildModelPriors:freeze(['model-priors/{season}.json','model-priors/foundation/{season}.json'])
});
export const artifactCandidates=freeze(invocationContract.map(row=>freeze({
 id:row.id, candidateWrites:freeze(families[row.producer].filter(p=>!(p==='deploy-snapshots/latest.json' && row.options.includes('updateLatest:false')))),
 conditionalWrites:true, exclusiveOwnershipVerified:false
})));
export function verifyArtifactSources(sources){
 if(!sources||Object.keys(sources).length!==Object.keys(sourcePins).length) throw Error('source_set_mismatch');
 for(const [path,expected] of Object.entries(sourcePins)){
  if(typeof sources[path]!=='string') throw Error('source_missing:'+path);
  const bytes=Buffer.from(sources[path]);
  const actual=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  if(actual!==expected) throw Error('source_drift:'+path);
 }
 return {sourceCount:Object.keys(sourcePins).length,invocationCount:artifactCandidates.length,cacheHazardCount:cacheHazards.length,sourceBound:true,runtimeObserved:false,artifactOwnershipVerified:false,resumeAuthorized:false,publicationAuthorized:false};
}
// A conservative admission boundary: this metadata never grants a skip.
export function assessReuse(invocationId){
 if(!artifactCandidates.some(row=>row.id===invocationId)) throw Error('unknown_invocation');
 return {reusable:false,reason:'runtime_io_and_cache_state_unqualified'};
}
