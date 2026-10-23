import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {athensDayKey,shiftDay} from '../engine-v1/core/daykey.js';

const scripts={repair:'tools/persist-value-detail-recovery.sh',publish:'tools/publish-unified-value-day.sh'};
export function runProspectiveValueStep(action,day,{today=athensDayKey(),run=spawnSync,log=console.log}={}){
  if(!Object.hasOwn(scripts,action))throw Error('INVALID_PROSPECTIVE_ACTION');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(`${day}T12:00Z`))||new Date(`${day}T12:00Z`).toISOString().slice(0,10)!==day)throw Error('INVALID_PROSPECTIVE_DAY');
  if(day<today){
    log(`VALUE_PROSPECTIVE_STEP_SKIPPED=${action}:past_day:${day}; historical evidence retained, frozen publications unchanged`);
    return {status:0,skipped:true};
  }
  if(day>shiftDay(today,1)||day<'2026-10-18')throw Error('PROSPECTIVE_DAY_OUTSIDE_WINDOW');
  // The producer retains its independent current-day guard at execution time.
  const result=run('bash',[scripts[action],day],{stdio:'inherit',windowsHide:true});
  if(result.error)throw result.error;
  return {status:result.status??1,skipped:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  process.exitCode=runProspectiveValueStep(process.argv[2],process.argv[3]).status;
}
