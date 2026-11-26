import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { getProjectRoot } from '../storage/data-root.js';
import { auditGlobalHistoryCoverage } from './audit-global-history-coverage.js';
import { appendFinalizedDayToHistory } from './append-finalized-day-to-history.js';
import { buildCurrentSeasonIndexes } from './build-current-season-indexes.js';
import { COVERAGE_GAP } from '../core/global-history-coverage.js';
import { currentSeason } from '../core/season.js';
import { atomicArtifact, withArtifactLock } from '../storage/evidence-bound-history-store.js';

const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const save=(file,doc)=>{
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const bytes=JSON.stringify(doc,null,2)+'\n';
  if(fs.existsSync(file)&&fs.readFileSync(file,'utf8')===bytes)return;
  fs.writeFileSync(file+'.tmp',bytes);fs.renameSync(file+'.tmp',file);
};

export function selectHistoryCoverageRepairs(report,ledger,{nowMs,maxTasks=7}={}) {
  if(!Number.isFinite(nowMs)||!Number.isInteger(maxTasks)||maxTasks<1||maxTasks>31)throw Error('INVALID_COVERAGE_REPAIR_BUDGET');
  const groups=new Map();
  for(const gap of report.gaps.filter(g=>g.reason===COVERAGE_GAP.acquiredNotStored)){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(gap.dayKey||'')||gap.dayKey>=report.dayKey)continue;
    if(!groups.has(gap.dayKey))groups.set(gap.dayKey,[]);
    groups.get(gap.dayKey).push(gap.id);
  }
  const activeSeason=currentSeason(new Date(`${report.dayKey}T12:00Z`));
  const current=[],older=[],held=[];
  for(const [dayKey,ids] of [...groups].sort(([a],[b])=>a.localeCompare(b))){
    const fingerprint=digest([...new Set(ids)].sort()),previous=ledger[dayKey];
    const unchanged=previous?.fingerprint===fingerprint;
    const priorStorageFailure=previous?.ok===false && /^(EPERM|EACCES|EROFS|ENOSPC):/.test(previous.reason||'');
    const task={dayKey,fingerprint,matchIds:[...new Set(ids)].sort(),attempts:unchanged&&!priorStorageFailure?previous.attempts:0};
    if(unchanged&&!priorStorageFailure&&(previous.attempts>=3||previous.nextAttemptMs>nowMs))held.push({...task,reason:'RETRY_BOUND_OR_COOLDOWN'});
    else if(currentSeason(new Date(`${dayKey}T12:00Z`))===activeSeason)current.push(task);
    else older.push(task);
  }

  // Keep current-season repairs moving while reserving capacity for older dates.
  const currentBudget=older.length && maxTasks>1 ? maxTasks-1 : maxTasks;
  const prioritized=[...current.slice(0,currentBudget),...older,...current.slice(currentBudget)];
  const selected=prioritized.slice(0,maxTasks);
  held.push(...prioritized.slice(maxTasks).map(task=>({...task,reason:'BATCH_BUDGET'})));
  return {selected,held};
}

// This is an audit and a bounded caller of the existing authoritative history
// append/index jobs. It creates no alternative result store or acquisition path.
export async function runGlobalHistoryCoverageDay(dayKey,{root=getProjectRoot(),recover=false,nowMs=Date.now(),maxTasks=7,dependencies={}}={}) {
  if (recover && path.resolve(root)!==path.resolve(getProjectRoot()) &&
      (!dependencies.append || !dependencies.rebuild)) {
    throw Error('COVERAGE_RECOVERY_ROOT_REQUIRES_BOUND_DEPENDENCIES');
  }
  return withArtifactLock(path.join(root,'data/history-coverage/recovery.lock'),()=>
    runLockedCoverageDay(dayKey,{root,recover,nowMs,maxTasks,dependencies}));
}

// Exercise the actual publication primitive in the target directory. An
// environment failure must not spend the per-day evidence retry budget.
export async function preflightHistoryJournal(root) {
  const dir=path.join(root,'data/history-recovery-journal',`.preflight-${crypto.randomUUID()}`);
  try {
    const file=path.join(dir,'fact.json');
    await atomicArtifact(file,'journal-preflight\n',{immutable:true});
    await atomicArtifact(file,'journal-preflight\n',{immutable:true});
    return {ok:true};
  } catch(error) {
    return {ok:false,reason:'HISTORY_JOURNAL_UNAVAILABLE',code:error.code||null};
  } finally {
    fs.rmSync(dir,{recursive:true,force:true});
  }
}

async function runLockedCoverageDay(dayKey,{root,recover,nowMs,maxTasks,dependencies}) {
  const audit=dependencies.audit||auditGlobalHistoryCoverage;
  const before=audit({dayKey,root,write:true,phase:'before'});
  const file=path.join(root,'data/history-coverage/recovery-ledger.json');
  const ledger=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
  const rebuildFile=path.join(root,'data/history-coverage/pending-rebuilds.json');
  const pending=fs.existsSync(rebuildFile)?JSON.parse(fs.readFileSync(rebuildFile,'utf8')):{};
  const selection=selectHistoryCoverageRepairs(before,ledger,{nowMs,maxTasks});
  const attempts=[];
  const storage= recover && selection.selected.length
    ? await (dependencies.preflight || (dependencies.append ? async()=>({ok:true}) : preflightHistoryJournal))(root)
    : {ok:true};
  if(recover&&storage.ok)for(const task of selection.selected){
    // Persist the obligation before append: interruption after a successful
    // history write must not strand the new rows outside the derived indexes.
    const season=currentSeason(new Date(`${task.dayKey}T12:00Z`));
    pending[season]={dayKey,reason:'HISTORY_APPEND_REQUIRES_INDEX_REBUILD'};
    save(rebuildFile,pending);
    let result;
    try{result=await (dependencies.append||appendFinalizedDayToHistory)(task.dayKey,{recoveryMatchIds:task.matchIds});}
    catch(error){result={ok:false,reason:error.message};}
    const attemptsCount=task.attempts+1;
    ledger[task.dayKey]={fingerprint:task.fingerprint,attempts:attemptsCount,ok:result.ok===true,
      nextAttemptMs:nowMs+Math.min(7,2**(attemptsCount-1))*86400000,reason:result.reason||null};
    attempts.push({dayKey:task.dayKey,...result});
    // Persist each completion so a process interruption cannot reset retries.
    save(file,ledger);
  }
  const rebuilds=[];
  if(recover)for(const season of Object.keys(pending).sort()){
    if(!/^\d{4}-\d{4}$/.test(season))throw Error('INVALID_PENDING_HISTORY_REBUILD_SEASON');
    let result;
    try{result=await (dependencies.rebuild||buildCurrentSeasonIndexes)({season,dayKey});}
    catch(error){result={ok:false,season,reason:error.message};}
    rebuilds.push(result);
    if(result?.ok===true){delete pending[season];save(rebuildFile,pending);}
  }
  const after=audit({dayKey,root,write:true,phase:'after'});
  const result={schema:'ai-matchlab.global-history-recovery-day.v1',dayKey,
    recover,attempts,rebuilds,deferred:selection.held,storage,
    pendingRebuildSeasons:Object.keys(pending).sort(),
    externalAcquisition:'EXISTING_VALUE_DATA_ALARM_AND_APPROVED_BACKFILL_JOBS_REQUIRED',
    fullCoverageCertified:false,beforeMetrics:before.metrics,afterMetrics:after.metrics,
    frozenPredictionsRegenerated:false};
  save(path.join(root,'data/history-coverage',dayKey,'recovery.json'),result);
  return result;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  console.log(JSON.stringify(await runGlobalHistoryCoverageDay(process.argv[2],{recover:process.argv.includes('--recover')}),null,2));
}
