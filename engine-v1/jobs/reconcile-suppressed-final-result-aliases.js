import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolveDataPath, ensureDir } from '../storage/data-root.js';

export const SUPPRESSED_FINAL_ALIAS_REPAIR_SCHEMA = 'ai-matchlab.suppressed-final-result-alias-repair.v1';

function clean(v){ return String(v ?? '').trim(); }
function strictScore(v){ if(v===null||v===undefined||v==='') return null; const n=Number(v); return Number.isInteger(n)&&n>=0?n:null; }
function scoreOf(row){
  const h=strictScore(row?.scoreHome ?? row?.homeScore ?? row?.finalScore?.homeScore ?? row?.finalScore?.home);
  const a=strictScore(row?.scoreAway ?? row?.awayScore ?? row?.finalScore?.awayScore ?? row?.finalScore?.away);
  return h===null||a===null?null:{home:h,away:a,key:`${h}-${a}`};
}
function readJson(file){ return JSON.parse(fs.readFileSync(file,'utf8')); }
function sha256(buf){ return crypto.createHash('sha256').update(buf).digest('hex'); }
function writeJsonAtomic(file,value){ ensureDir(path.dirname(file)); const tmp=`${file}.tmp-${process.pid}-${Date.now()}`; fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n','utf8'); fs.renameSync(tmp,file); }

function loadAliasMappings(retentionPath, supplementPath=''){
  const payload=readJson(retentionPath);
  const out=[];
  for(const decision of Array.isArray(payload?.decisions)?payload.decisions:[]){
    const dayKey=clean(decision?.dayKey);
    const retained=clean(decision?.retainedRepositoryFixtureId);
    for(const row of Array.isArray(decision?.suppressedFixtureLineageAliases)?decision.suppressedFixtureLineageAliases:[]){
      const alias=clean(row?.aliasFixtureId);
      const target=clean(row?.targetFixtureId || retained);
      if(dayKey&&alias&&target) out.push({dayKey,aliasFixtureId:alias,targetFixtureId:target,decisionId:clean(decision?.fixtureRetentionDecisionId)});
    }
  }
  if(supplementPath && fs.existsSync(supplementPath)){
    const ext=readJson(supplementPath);
    for(const decision of Array.isArray(ext?.fixtureLineageDecisions)?ext.fixtureLineageDecisions:[]){
      const dayKey=clean(decision?.dayKey); const target=clean(decision?.retainedRepositoryFixtureId);
      for(const alias of Array.isArray(decision?.suppressedRepositoryFixtureIds)?decision.suppressedRepositoryFixtureIds:[]){
        if(dayKey&&target&&clean(alias)) out.push({dayKey,aliasFixtureId:clean(alias),targetFixtureId:target,decisionId:clean(decision?.fixtureRetentionDecisionId)});
      }
    }
  }
  const byAlias=new Map();
  for(const row of out){ const k=`${row.dayKey}|${row.aliasFixtureId}`; const prev=byAlias.get(k); if(prev&&prev.targetFixtureId!==row.targetFixtureId) throw new Error(`suppressed_alias_mapping_conflict:${k}`); byAlias.set(k,row); }
  return [...byAlias.values()];
}
function loadAdjudications(file){
  if(!fs.existsSync(file)) return new Map();
  const payload=readJson(file); const map=new Map();
  for(const row of Array.isArray(payload?.adjudications)?payload.adjudications:[]){
    const id=clean(row?.matchId); const s=scoreOf(row);
    if(id&&s) map.set(id,{...row,score:s});
  }
  return map;
}

export function buildSuppressedFinalAliasRepairPlan({
  finalRoot=resolveDataPath('final-results'),
  retentionPath=resolveDataPath('identity-decisions','fixture-retention-decision-ledger.v1.json'),
  adjudicationPath=resolveDataPath('final-truth-adjudications.v1.json'),
  supplementPath=resolveDataPath('identity-decisions','production-identity-recovery-supplement.v1.json'),
  fromDay='', toDay='9999-99-99'
}={}){
  const aliases=loadAliasMappings(retentionPath,supplementPath);
  const adjudications=loadAdjudications(adjudicationPath);
  const actions=[]; const blocked=[];
  for(const map of aliases){
    if(fromDay && map.dayKey<fromDay) continue;
    if(toDay && map.dayKey>toDay) continue;
    const aliasFile=path.join(finalRoot,map.dayKey,`${map.aliasFixtureId}.json`);
    if(!fs.existsSync(aliasFile)) continue;
    const targetFile=path.join(finalRoot,map.dayKey,`${map.targetFixtureId}.json`);
    if(!fs.existsSync(targetFile)){
      const aliasRaw=fs.readFileSync(aliasFile); const alias=JSON.parse(aliasRaw.toString('utf8')); const as=scoreOf(alias);
      if(!as || alias?.verifiedFinalTruth!==true){ blocked.push({...map,reason:'RETAINED_FINAL_MISSING_UNVERIFIED_ALIAS'}); continue; }
      actions.push({...map,reason:'MIGRATE_VERIFIED_ALIAS_TO_RETAINED_ID',aliasScore:as.key,targetScore:as.key,aliasFile,targetFile,aliasSha256:sha256(aliasRaw),targetSha256:null,migrate:true});
      continue;
    }
    const aliasRaw=fs.readFileSync(aliasFile); const targetRaw=fs.readFileSync(targetFile);
    const alias=JSON.parse(aliasRaw.toString('utf8')); const target=JSON.parse(targetRaw.toString('utf8'));
    const as=scoreOf(alias), ts=scoreOf(target);
    if(!as||!ts){ blocked.push({...map,reason:'NON_NUMERIC_FINAL_SCORE'}); continue; }
    let reason='SAME_TRUTH_SUPPRESSED_ALIAS';
    if(as.key!==ts.key){
      const adj=adjudications.get(map.targetFixtureId);
      if(!adj || adj.score.key!==ts.key){
        blocked.push({...map,reason:'SUPPRESSED_SCORE_CONFLICT_WITHOUT_MATCHING_ADJUDICATION',aliasScore:as.key,targetScore:ts.key});
        continue;
      }
      reason='SUPPRESSED_ALIAS_CONFLICTS_WITH_ADJUDICATED_RETAINED_TRUTH';
    }
    actions.push({...map,reason,aliasScore:as.key,targetScore:ts.key,aliasFile,targetFile,aliasSha256:sha256(aliasRaw),targetSha256:sha256(targetRaw)});
  }
  return {schema:SUPPRESSED_FINAL_ALIAS_REPAIR_SCHEMA,ok:blocked.length===0,actions,blocked};
}

export function applySuppressedFinalAliasRepair(plan,{write=false,quarantineRoot=resolveDataPath('quarantine','final-result-aliases')}={}){
  if(!plan?.ok) throw new Error(`suppressed_final_alias_plan_blocked:${plan?.blocked?.length||0}`);
  const applied=[];
  for(const action of plan.actions){
    if(!fs.existsSync(action.aliasFile)){ applied.push({...action,status:'ALREADY_ABSENT'}); continue; }
    if(!write){ applied.push({...action,status:'WOULD_QUARANTINE'}); continue; }
    const aliasRaw=fs.readFileSync(action.aliasFile);
    if(sha256(aliasRaw)!==action.aliasSha256) throw new Error(`suppressed_alias_source_drift:${action.aliasFixtureId}`);
    if(action.migrate && !fs.existsSync(action.targetFile)){
      const migrated=JSON.parse(aliasRaw.toString('utf8')); migrated.matchId=action.targetFixtureId; migrated.canonicalId=action.targetFixtureId; migrated.matchKey=action.targetFixtureId; migrated.identityMigration={schema:SUPPRESSED_FINAL_ALIAS_REPAIR_SCHEMA,migratedAt:new Date().toISOString(),fromFixtureId:action.aliasFixtureId,toFixtureId:action.targetFixtureId,decisionId:action.decisionId,scoreChanged:false}; writeJsonAtomic(action.targetFile,migrated);
    }
    const qdir=path.join(quarantineRoot,action.dayKey);
    ensureDir(qdir);
    const qfile=path.join(qdir,`${action.aliasFixtureId}.json`);
    if(!fs.existsSync(qfile)) fs.writeFileSync(qfile,aliasRaw);
    const manifest={schema:SUPPRESSED_FINAL_ALIAS_REPAIR_SCHEMA,quarantinedAt:new Date().toISOString(),dayKey:action.dayKey,aliasFixtureId:action.aliasFixtureId,targetFixtureId:action.targetFixtureId,reason:action.reason,aliasScore:action.aliasScore,targetScore:action.targetScore,aliasSha256:action.aliasSha256,targetSha256:action.targetSha256,reversible:true};
    writeJsonAtomic(`${qfile}.manifest.json`,manifest);
    fs.unlinkSync(action.aliasFile);
    applied.push({...action,status:'QUARANTINED'});
  }
  return {schema:SUPPRESSED_FINAL_ALIAS_REPAIR_SCHEMA,ok:true,write,actionCount:plan.actions.length,applied};
}

function parseArgs(argv){ const out={write:false,fromDay:'',toDay:'9999-99-99'}; for(const a of argv){ if(a==='--write')out.write=true; else if(a.startsWith('--from='))out.fromDay=a.slice(7); else if(a.startsWith('--to='))out.toDay=a.slice(5); } return out; }
const isCli=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isCli){
  try{ const args=parseArgs(process.argv.slice(2)); const plan=buildSuppressedFinalAliasRepairPlan(args); const result=applySuppressedFinalAliasRepair(plan,{write:args.write}); console.log(JSON.stringify({ok:true,write:args.write,actions:plan.actions.length,blocked:plan.blocked,applied:result.applied.map(x=>({dayKey:x.dayKey,aliasFixtureId:x.aliasFixtureId,targetFixtureId:x.targetFixtureId,reason:x.reason,status:x.status}))},null,2)); }
  catch(e){ console.error(e?.stack||String(e)); process.exit(1); }
}
