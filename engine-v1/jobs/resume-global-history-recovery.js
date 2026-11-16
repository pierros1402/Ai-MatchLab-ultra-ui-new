import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {getProjectRoot} from '../storage/data-root.js';
import {runGlobalHistoryCoverageDay,preflightHistoryJournal} from './run-global-history-coverage-day.js';
import {validateH2HFoundationSync} from '../core/derived-history-foundation.js';
import {rebuildH2HFoundationFromCurrentHistory} from './rebuild-h2h-foundation-from-current-history.js';

const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const save=(file,doc)=>{const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(doc,null,2)+'\n');fs.renameSync(tmp,file);};

export function officialDetailTasks(comparison){
  if(comparison.schema!=='ai-matchlab.official-history-comparison.v1'||comparison.productionWrites!==0
      ||comparison.authorityPromotionAllowed!==false)throw Error('READ_ONLY_OFFICIAL_COMPARISON_REQUIRED');
  const tasks=new Map();
  for(const entry of comparison.comparisons){
    if(entry.status==='SAME_OBSERVED_SCORE_REQUIRES_AUTHORITY_AND_PERIOD_VALIDATION')continue;
    const row=entry.official;
    if(row.leagueSlug!=='uefa.nations')continue;
    const matched=/^https:\/\/www\.uefa\.com\/uefanationsleague\/match\/(\d+)--[^/?#]+\/$/.exec(row.matchUrl||'');
    if(!matched||matched[1]!==row.officialMatchId)throw Error('EXACT_UEFA_MATCH_URL_AND_ID_REQUIRED');
    tasks.set(row.officialMatchId,{officialMatchId:row.officialMatchId,url:row.matchUrl,
      edition:row.officialEdition,expectedDay:row.officialDate,homeTeam:row.homeTeam,awayTeam:row.awayTeam,
      scoreHome:row.scoreHome,scoreAway:row.scoreAway,sourceSha256:row.responseSha256});
  }
  return [...tasks.values()].sort((a,b)=>a.officialMatchId.localeCompare(b.officialMatchId));
}

function frozenSnapshot(root){
  const snapshot={};
  const walk=relative=>{
    const dir=path.join(root,relative);if(!fs.existsSync(dir))return;
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      const file=path.join(relative,entry.name);
      if(entry.isSymbolicLink())throw Error('FROZEN_SNAPSHOT_SYMLINK_REQUIRES_REVIEW');
      if(entry.isDirectory())walk(file);
      else if(entry.isFile())snapshot[file]=hash(fs.readFileSync(path.join(root,file)));
    }
  };
  for(const dir of ['plan-c-shadow','value-comparison','value-plans','value-unified','value'])walk(path.join('data',dir));
  return snapshot;
}

// Run from the user's ordinary PowerShell. Existing verified append/index jobs
// remain authoritative. Official HTML is collected for validation, never imported.
export async function resumeGlobalHistoryRecovery(dayKey,{collectOfficialDetails=true}={}){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dayKey||''))throw Error('EXPLICIT_HISTORY_EXECUTION_DAY_REQUIRED');
  const root=getProjectRoot(),dir=path.join(root,'docs/history-coverage');
  const comparisonBytes=fs.readFileSync(path.join(dir,'20261115-official-comparison.json'));
  const comparison=JSON.parse(comparisonBytes);
  const tasks=collectOfficialDetails?officialDetailTasks(comparison):[];
  if(tasks.length>200)throw Error('OFFICIAL_DETAIL_BATCH_EXCEEDS_200');
  const captureTemp=process.env.AIML_HISTORY_CAPTURE_TEMP||os.tmpdir();
  if(!path.isAbsolute(captureTemp))throw Error('ABSOLUTE_CAPTURE_TEMP_DIRECTORY_REQUIRED');
  const output=fs.mkdtempSync(path.join(captureTemp,'AIML_HISTORY_RECOVERY_RUN_'));
  const before=frozenSnapshot(root),journal=await preflightHistoryJournal(root),batches=[];
  console.log(JSON.stringify({event:'start',journal,officialDetailsPlanned:tasks.length,output}));
  if(journal.ok)for(let batch=1;batch<=5;batch++){
    const result=await runGlobalHistoryCoverageDay(dayKey,{recover:true,maxTasks:31});
    if(result.ok===false){batches.push({batch,error:result.reason});break;}
    const summary={batch,attempts:result.attempts.length,
      rowsWritten:result.attempts.reduce((sum,r)=>sum+(r.rowsWritten||0),0),
      success:result.attempts.filter(r=>r.ok).length,
      holds:result.attempts.filter(r=>!r.ok).reduce((a,r)=>(a[r.reason]=(a[r.reason]||0)+1,a),{}),
      rebuilds:result.rebuilds,pendingRebuildSeasons:result.pendingRebuildSeasons,storage:result.storage,
      beforeMetrics:result.beforeMetrics,afterMetrics:result.afterMetrics};
    batches.push(summary);save(path.join(output,'local-batches.json'),batches);
    console.log(JSON.stringify({event:'local-batch',batch,attempts:summary.attempts,rowsWritten:summary.rowsWritten,holds:summary.holds}));
    if(!result.storage.ok||!result.attempts.length)break;
  }
  let derivedH2H={checked:false};
  if(batches.length){
    const validation=validateH2HFoundationSync();
    derivedH2H={checked:true,ok:validation.ok,reason:validation.reason};
    if(!validation.ok)try{
      const result=rebuildH2HFoundationFromCurrentHistory();
      derivedH2H={checked:true,rebuilt:true,ok:result.validation?.ok===true,artifactCount:result.artifactCount};
    }catch(error){derivedH2H={checked:true,ok:false,reason:error.message};}
  }
  const captures=[],started=Date.now();
  for(let offset=0;offset<tasks.length;offset+=3){
    if(Date.now()-started>180000)break;
    const responses=await Promise.all(tasks.slice(offset,offset+3).map(async task=>{
      try{
        const response=await fetch(task.url,{redirect:'error',signal:AbortSignal.timeout(20000)});
        if(!response.ok)throw Error('HTTP_'+response.status);
        const body=Buffer.from(await response.arrayBuffer()),sha256=hash(body),file=path.join(output,sha256+'.html');
        if(!fs.existsSync(file))fs.writeFileSync(file,body,{flag:'wx'});
        else if(hash(fs.readFileSync(file))!==sha256)throw Error('CAPTURE_CONTENT_ADDRESS_CONFLICT');
        return {...task,ok:true,file,sha256,bytes:body.length,capturedAt:new Date().toISOString(),authorityPromotionAllowed:false};
      }catch(error){return {...task,ok:false,reason:error.cause?.code||error.code||error.message,authorityPromotionAllowed:false};}
    }));
    captures.push(...responses);save(path.join(output,'official-details.json'),{captures,planned:tasks.length,productionWrites:0,authorityPromotionAllowed:false});
    if(captures.length%30===0||captures.length===tasks.length)console.log(JSON.stringify({event:'official-details',completed:captures.length,planned:tasks.length,ok:captures.filter(c=>c.ok).length}));
  }
  const after=frozenSnapshot(root);
  const changed=[...new Set([...Object.keys(before),...Object.keys(after)])].filter(file=>before[file]!==after[file]);
  const report={schema:'ai-matchlab.history-runtime-recovery.v1',dayKey,generatedAt:new Date().toISOString(),
    root,comparisonSha256:hash(comparisonBytes),journal,batches,derivedH2H,
    officialDetails:{enabled:collectOfficialDetails,planned:tasks.length,attempted:captures.length,ok:captures.filter(c=>c.ok).length,
      failed:captures.filter(c=>!c.ok).length,deferred:tasks.length-captures.length,manifest:captures.length?path.join(output,'official-details.json'):null},
    frozenArtifacts:{before:Object.keys(before).length,after:Object.keys(after).length,changed},
    externalMatchesImported:0,fullCoverageCertified:false,verdict:changed.length?'FROZEN_ARTIFACT_CHANGED_STOP':'HOLD_PENDING_SOURCE_VALIDATION',output};
  save(path.join(output,'report.json'),report);
  save(path.join(dir,dayKey.replaceAll('-','')+'-runtime-recovery.json'),report);
  if(changed.length)throw Error('FROZEN_ARTIFACT_CHANGED:'+JSON.stringify(changed));
  console.log(JSON.stringify({event:'done',journal,localRowsWritten:batches.reduce((n,b)=>n+(b.rowsWritten||0),0),
    officialDetails:report.officialDetails,derivedH2H,frozenArtifacts:report.frozenArtifacts,output,verdict:report.verdict}));
  return report;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))await resumeGlobalHistoryRecovery(process.argv[2],{collectOfficialDetails:!process.argv.includes('--local-only')});
