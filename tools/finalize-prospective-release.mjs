import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {athensDayKey} from '../engine-v1/core/daykey.js';

export function finalizeProspectiveRelease(day,{cwd=process.cwd(),today=athensDayKey(),run}={}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('invalid_prospective_release_day');
 const latestFile=path.join(cwd,'data/deploy-snapshots/latest.json');
 const before=fs.readFileSync(latestFile);
 const latest=JSON.parse(before.toString('utf8'));
 // Daily owns rollover. A prospective Value refresh cannot advance the day.
 if(day!==today||latest.date!==day)return {snapshotSyncRequired:false,reason:'daily_owns_day_rollover'};
 const snapshot=path.join(cwd,'data/deploy-snapshots',day);
 const manifest=JSON.parse(fs.readFileSync(path.join(snapshot,'manifest.json'),'utf8'));
 if(manifest.date!==day)throw Error('prospective_manifest_day_mismatch');
 if(manifest.hash===latest.hash)return {snapshotSyncRequired:false,reason:'snapshot_pointer_already_matches'};
 const execute=run||((script,args)=>execFileSync(process.execPath,[script,...args],{cwd,stdio:'inherit'}));
 const job=(name,args)=>execute(`engine-v1/jobs/${name}.js`,args);
 const fixtures=JSON.parse(fs.readFileSync(path.join(snapshot,'fixtures.json'),'utf8')).fixtures;
 if(!Array.isArray(fixtures))throw Error('prospective_publication_fixtures_required');
 // Source Details are derived and intentionally not tracked. Cold runners
 // rebuild them from canonical inputs; never copy a deploy view into truth.
 if(fixtures.some(row=>!fs.existsSync(path.join(cwd,'data/details',day,`${row.canonicalId||row.matchId}.json`)))){
  job('build-details-day',[day,'--rebuild']);
 }
 job('verify-details-value-mirror-day',[`--date=${day}`,'--gate']);
 job('run-snapshot-invariant-check',[day]);
 job('verify-artifact-freshness-day',[`--date=${day}`,'--gate']);
 job('build-foundation-integrity-report',[`--date=${day}`,'--no-latest']);
 job('build-day-report',[`--date=${day}`]);
 job('verify-daily-publish-contract',[`--date=${day}`,'--prepublish','--gate']);
 try{
  job('promote-deploy-snapshot-latest-day',[`--date=${day}`]);
  job('verify-daily-publish-contract',[`--date=${day}`,'--gate']);
 }catch(error){fs.writeFileSync(latestFile,before);throw error;}
 return {snapshotSyncRequired:true,day,manifestHash:manifest.hash};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=finalizeProspectiveRelease(process.argv[2]);
 fs.writeFileSync(process.argv[3],JSON.stringify(result)+'\n');
 console.log(JSON.stringify(result));
}
