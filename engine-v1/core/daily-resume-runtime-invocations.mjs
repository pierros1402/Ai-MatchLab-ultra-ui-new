// Source-bound invocation contract. No execution or reuse authority.
import { createHash } from 'node:crypto';
const rows = [
 ['standings.initial','buildStandingsDay',782,'dayKey','always','once','active-leagues'],
 ['details.initial','buildDetailsDay',961,'dayKey','always','once','detailsRebuild'],
 ['details.player-usage','buildDetailsDay',1159,'dayKey','player-usage-writes-positive','once','rebuild:true'],
 ['value.initial','buildValueDay',1403,'dayKey','always','once','rebuild:true'],
 ['value.plan-a-checkpoint','checkpointDailyPlanA',1407,'dayKey','always','once','valueBuild'],
 ['details.final','buildDetailsDay',1638,'dayKey','always','once','rebuild:true'],
 ['snapshot.initial','exportDeploySnapshotDay',1672,'dayKey','always','once','default'],
 ['value.historical','buildValueDay',1856,'finalizeDayKey','finalization-block','once','rebuild:false'],
 ['details.historical','buildDetailsDay',1884,'finalizeDayKey','finalization-try','once','rebuild:true'],
 ['snapshot.historical','exportDeploySnapshotDay',1907,'finalizeDayKey','finalization-try','once','updateLatest:false,preserveValue:true'],
 ['snapshot.catch-up','exportDeploySnapshotDay',2135,'day','catch-up-readiness-and-value','per-day','updateLatest:false,preserveValue:true'],
 ['standings.final','buildStandingsDay',2305,'dayKey','always','once','all-leagues,finalFoundationSeason'],
 ['priors.final','buildModelPriors',2342,'finalFoundationSeason','always','once','targetSeason']
];
export const invocationContract = Object.freeze(rows.map(([id,producer,line,scope,guard,multiplicity,options])=>Object.freeze({id,producer,line,scope,guard,multiplicity,options})));
const expectedBlob='8f539391cc7ad81d45f6f2b69450e4d7bbc608a8';
export function verifyInvocationSource(source,census){
 if(typeof source!=='string') throw Error('source_invalid');
 const bytes=Buffer.from(source);
 const blob=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
 if(blob!==expectedBlob) throw Error('source_blob_mismatch');
 if(!Array.isArray(census?.calls)||census.calls.length!==rows.length) throw Error('census_count_mismatch');
 const lines=source.split(/\r?\n/);
 for(const [i,row] of invocationContract.entries()){
  const c=census.calls[i];
  if(c.producer!==row.producer||c.line!==row.line||lines[row.line-1]?.trim()!==c.sourceLine.trim()) throw Error('invocation_source_mismatch');
 }
 return {invocationCount:rows.length,sourceBound:true,runtimeObserved:false,artifactOwnershipVerified:false,resumeAuthorized:false,publicationAuthorized:false};
}
// Observation identity includes the call site and concrete scope, never producer alone.
export function invocationKey(id,scope){
 const row=invocationContract.find(x=>x.id===id);
 if(!row) throw Error('unknown_invocation');
 if(typeof scope!=='string'||!(row.scope==='finalFoundationSeason'?/^\d{4}(?:[-/]\d{2,4})?$/:/^\d{4}-\d{2}-\d{2}$/).test(scope)) throw Error('invalid_scope');
 if(row.scope!=='finalFoundationSeason' && (!Number.isFinite(Date.parse(scope+'T00:00:00Z'))||new Date(scope+'T00:00:00Z').toISOString().slice(0,10)!==scope)) throw Error('invalid_day');
 return JSON.stringify([id,scope]);
}
