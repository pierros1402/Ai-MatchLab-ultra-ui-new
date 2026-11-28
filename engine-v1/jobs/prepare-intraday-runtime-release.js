import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveDataPath} from '../storage/data-root.js';
import {buildLeagueGapReportDay} from './build-league-gap-report-day.js';
import {stageRuntimeReleaseArtifacts, validateRuntimeCoverageFoundationArtifact} from './sync-deploy-snapshot-from-github.js';

function validDay(day) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day)throw Error('runtime_release_invalid_day');
}

export function refreshIntradayCoverageReadiness(day,{dataRoot=resolveDataPath(),buildCoverage=buildLeagueGapReportDay}={}) {
  validDay(day);
  const file=path.join(dataRoot,'coverage-readiness',day+'.json');
  const previous=fs.existsSync(file)?fs.readFileSync(file):null;
  buildCoverage(day);
  const current=fs.readFileSync(file);
  const report=validateRuntimeCoverageFoundationArtifact(current,{kind:'coverage',day});
  const semantic=bytes=>{const value=JSON.parse(bytes);delete value.generatedAt;return JSON.stringify(value);};
  // Preserve actual evidence times and exact bytes when only the report clock moved.
  // Nested input timestamps remain material because they identify changed evidence.
  if(previous){
    try {
      if(semantic(previous)===semantic(current)){
        fs.writeFileSync(file,previous);
        return {changed:false,report:JSON.parse(previous)};
      }
    } catch { /* A malformed previous artifact must be replaced by the real builder. */ }
  }
  return {changed:true,report};
}

export async function verifyIntradayRuntimeRelease(day,{dataRoot=resolveDataPath(),ref=null,readBlob=(ref,file)=>execFileSync('git',['show',`${ref}:data/${file}`],{maxBuffer:64*1024*1024,stdio:['ignore','pipe','pipe']})}={}) {
  validDay(day);
  if(ref!==null&&!/^[a-f0-9]{40}$/.test(ref))throw Error('runtime_release_invalid_ref');
  const allowed=new Set(['value-comparison','build-reports','system-health','coverage-readiness','foundation-integrity'].map(kind=>`${kind}/${day}.json`));
  const stage=await fsp.mkdtemp(path.join(os.tmpdir(),'aiml-runtime-closure-'));
  const prefix=`https://raw.githubusercontent.com/local/release/${'0'.repeat(40)}/data/`;
  try {
    const result=await stageRuntimeReleaseArtifacts({repo:'local/release',ref:'0'.repeat(40),day,stageDayDir:stage,
      stats:{filesDownloaded:0,bytesDownloaded:0},requireDiagnostics:true,
      fetchArtifact:async url=>{
        if(!url.startsWith(prefix)||!allowed.has(url.slice(prefix.length)))throw Error('runtime_release_unexpected_artifact');
        if(ref!==null)return readBlob(ref,url.slice(prefix.length));
        const file=path.join(dataRoot,url.slice(prefix.length));
        try{return await fsp.readFile(file);}catch(error){if(error.code==='ENOENT')return null;throw error;}
      }});
    return {ok:true,day,comparisonPresent:result.comparisonPresent,coverageReadinessPresent:result.coverageReadinessPresent,foundationIntegrityPresent:result.foundationIntegrityPresent};
  } finally {await fsp.rm(stage,{recursive:true,force:true});}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  console.log(JSON.stringify(await verifyIntradayRuntimeRelease(process.argv[2],{ref:process.argv[3]??null})));
}
