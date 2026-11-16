import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getProjectRoot} from '../storage/data-root.js';
import {writeHistoryJsonAtomic} from '../storage/history-preservation.js';
import {journalHistoryBuild,withArtifactLock} from '../storage/evidence-bound-history-store.js';
import {getProductionIdentityResolver} from '../core/production-identity-resolver-runtime.js';
import {canonicalTeamName} from '../storage/team-aliases-db.js';
import {planAdditiveHistoryDay} from '../core/additive-history-recovery.js';
import {archiveSeasonForDate} from '../core/season-model.js';
import {proposeReviewedUefaRecovery,UEFA_LEDGER_RECOVERY_POLICY,sha256} from '../core/reviewed-uefa-ledger-recovery.js';
import {preflightHistoryJournal} from './run-global-history-coverage-day.js';
import {buildCurrentSeasonIndexes} from './build-current-season-indexes.js';
import {buildModelPriors} from './build-model-priors.js';
import {rebuildH2HFoundationFromCurrentHistory} from './rebuild-h2h-foundation-from-current-history.js';
import {auditGlobalHistoryCoverage} from './audit-global-history-coverage.js';

const norm=name=>String(canonicalTeamName('uefa.nations',name)||name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const sameTeam=(a,b)=>norm(a)===norm(b);
const json=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const save=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});writeHistoryJsonAtomic(file,value);};
const allowed=/^data\/(?:canonical-fixtures\/\d{4}-\d{2}-\d{2}\/uefa\.nations\.json|final-results\/\d{4}-\d{2}-\d{2}\/cid_[a-zA-Z0-9_]+\.json|history-archive\/uefa\.nations\/\d{4}(?:-\d{4})?\.json|history\/\d{4}-\d{4}\.json)$/;

export function applyReviewedOperations(operations,{root,backupDir,writeFn=writeHistoryJsonAtomic}={}){
  const applied=[],seen=new Set();
  for(const op of operations){
    if(!allowed.test(op.relative)||seen.has(op.relative))throw Error('REVIEWED_WRITE_PATH_OUT_OF_SCOPE');
    seen.add(op.relative);
    const target=path.resolve(root,op.relative);
    if(!target.startsWith(path.resolve(root)+path.sep))throw Error('REVIEWED_WRITE_ROOT_ESCAPE');
    for(let p=target;p!==path.resolve(root);p=path.dirname(p))if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('REVIEWED_WRITE_SYMLINK_REJECTED');
    const current=fs.existsSync(target)?fs.readFileSync(target):null;
    if((current?sha256(current):null)!==op.beforeSha256)throw Error('REVIEWED_INPUT_DRIFT:'+op.relative);
  }
  fs.mkdirSync(backupDir,{recursive:true});
  const manifest=[];
  try{
    for(const [i,op] of operations.entries()){
      const target=path.resolve(root,op.relative),before=fs.existsSync(target)?fs.readFileSync(target):null;
      if((before?sha256(before):null)!==op.beforeSha256)throw Error('REVIEWED_INPUT_DRIFT:'+op.relative);
      const backup=before?path.join(backupDir,String(i).padStart(4,'0')+'.before'):null;
      if(backup)fs.writeFileSync(backup,before,{flag:'wx'});
      manifest.push({relative:op.relative,beforeSha256:op.beforeSha256,backup});
      applied.push({target,before});writeFn(target,op.payload);
      if(sha256(fs.readFileSync(target))!==sha256(Buffer.from(JSON.stringify(op.payload,null,2)+'\n')))throw Error('REVIEWED_WRITE_READBACK_FAILED');
    }
    save(path.join(backupDir,'manifest.json'),manifest);
  }catch(error){
    for(const op of applied.reverse()){
      if(op.before===null){if(fs.existsSync(op.target))fs.unlinkSync(op.target);}
      else fs.writeFileSync(op.target,op.before);
    }
    throw error;
  }
  return {filesWritten:operations.length,backupDir};
}

export function verifyFrozenArtifacts(root,manifest){
  if(manifest.length!==2506)throw Error('FROZEN_MANIFEST_COUNT_MISMATCH');
  if(new Set(manifest.map(i=>i.path)).size!==2506)throw Error('FROZEN_MANIFEST_DUPLICATE');
  const changed=[];
  for(const item of manifest){
    if(!/^data\/(?:plan-c-shadow|value-comparison|value-plans|value-unified|value)\//.test(item.path))throw Error('FROZEN_MANIFEST_PATH_OUT_OF_SCOPE');
    const file=path.join(root,item.path);
    if(!fs.existsSync(file)||sha256(fs.readFileSync(file))!==item.sha256)changed.push(item.path);
  }
  return {checked:manifest.length,changed,ok:!changed.length};
}

export async function applyReviewedUefaLedger({ledgerPath,sourcesPath,outputDir,write=false,finishDerived=false,frozenManifestPath='C:/Users/pierr/AppData/Local/Temp/AIML_GLOBAL_HISTORY_EVIDENCE_20261114/frozen-artifacts-before.json'}={}){
  const root=getProjectRoot();
  if(path.resolve(root)!==path.resolve('C:/workspace/GLOBAL_HISTORY_COVERAGE_20261114'))throw Error('EXACT_ISOLATED_WORKSPACE_REQUIRED');
  const ledgerBytes=fs.readFileSync(ledgerPath),ledger=json(ledgerPath),ledgerSha256=sha256(ledgerBytes);
  if(ledger.schema!=='aiml.uefa.alias-aware-disposition.v1'||ledger.rows?.length!==318
      ||new Set(ledger.rows.map(r=>r.id)).size!==318)throw Error('FINAL_REVIEWED_LEDGER_REQUIRED');
  const counts=ledger.rows.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{});
  if(counts.EXISTING_THREE_WAY_MATCH!==125||counts.MISSING_VERIFIED_FINAL_REVIEW!==5
      ||counts.HISTORICAL_CANONICAL_ABSENT_REVIEW!==187||counts.SOURCE_HOLD!==1)throw Error('REVIEWED_SCOPE_COUNT_MISMATCH');
  const frozen=json(frozenManifestPath);
  const frozenBefore=verifyFrozenArtifacts(root,frozen);if(!frozenBefore.ok)throw Error('FROZEN_BASELINE_CHANGED');
  fs.mkdirSync(outputDir,{recursive:true});
  const selected=ledger.rows.filter(r=>['MISSING_VERIFIED_FINAL_REVIEW','HISTORICAL_CANONICAL_ABSENT_REVIEW'].includes(r.status));
  const sources=new Map(json(sourcesPath).map(r=>[r.id,r]));
  if(sources.size!==192)throw Error('EXACT_SCOPED_SOURCE_MANIFEST_REQUIRED');
  const docs=new Map(),operations=new Map(),proposals=[],blockers=[],nativeTeams=new Map();
  const read=relative=>{
    if(!docs.has(relative)){const file=path.join(root,relative),bytes=fs.existsSync(file)?fs.readFileSync(file):null;
      docs.set(relative,{relative,beforeSha256:bytes?sha256(bytes):null,payload:bytes?JSON.parse(bytes):null});}
    return docs.get(relative);
  };
  const stage=(relative,payload)=>{
    const entry=read(relative);
    if(JSON.stringify(entry.payload)!==JSON.stringify(payload))operations.set(relative,{...entry,payload});
    entry.payload=payload;
  };
  const existing=[];
  for(const day of fs.readdirSync(path.join(root,'data/canonical-fixtures')).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d))){
    const file=path.join(root,'data/canonical-fixtures',day,'uefa.nations.json');
    if(fs.existsSync(file))existing.push(...json(file).fixtures);
  }
  let fixed=0,created=0,alreadyApplied=0;
  for(const row of selected){
    const source=sources.get(row.id);
    if(!source||source.sha256!==row.sourceSha256||source.url!=='https://match.uefa.com/v5/matches/'+row.id)throw Error('SCOPED_SOURCE_BINDING_MISMATCH');
    const cpath=`data/canonical-fixtures/${row.day}/uefa.nations.json`;
    if(row.canonicalPath!==cpath)throw Error('REVIEWED_CANONICAL_PATH_MISMATCH');
    const cdoc=read(cpath),payload=cdoc.payload||{dayKey:row.day,leagueSlug:'uefa.nations',fixtures:[]};
    const old=row.status==='MISSING_VERIFIED_FINAL_REVIEW'?payload.fixtures.find(c=>c.canonicalId===row.canonicalId):
      payload.fixtures.find(c=>c.providerIds?.uefa===row.id);
    const already=old?.reviewedUefaRecovery?.ledgerSha256===ledgerSha256&&old?.reviewedUefaRecovery?.sourceSha256===row.sourceSha256;
    if(row.status==='MISSING_VERIFIED_FINAL_REVIEW'&&!already&&cdoc.beforeSha256!==row.canonicalSha256)throw Error('REVIEWED_CANONICAL_HASH_DRIFT');
    // Recreate the pre-terminal input only for validation of an already applied
    // repair; existing terminal facts themselves are never overwritten here.
    const validationCanonical=already&&row.status==='MISSING_VERIFIED_FINAL_REVIEW'?{...old,status:'FIRST_HALF',rawStatus:'STATUS_FIRST_HALF',statusType:undefined,operationalState:undefined}:old;
    const sourceFile=path.isAbsolute(source.file)?source.file:path.resolve(path.dirname(sourcesPath),source.file);
    const proposal=proposeReviewedUefaRecovery(row,fs.readFileSync(sourceFile),{ledgerSha256,capturedAt:source.capturedAt,
      canonical:row.status==='MISSING_VERIFIED_FINAL_REVIEW'?validationCanonical:null,sameTeam});
    if(!proposal.ok){blockers.push({id:row.id,reason:proposal.reason});continue;}
    if(already)proposal.canonicalProposal=old;
    const c=proposal.canonicalProposal,final=proposal.finalProposal;
    for(const side of ['home','away']){
      const key=norm(row.fact[side+'Team']),id=row.fact[side+'ProviderTeamId'];
      if(nativeTeams.has(key)&&nativeTeams.get(key)!==id)throw Error('OFFICIAL_NATIVE_TEAM_BINDING_CONFLICT');
      nativeTeams.set(key,id);
    }
    const fpath=`data/final-results/${row.day}/${c.canonicalId}.json`,fdoc=read(fpath);
    if(row.finalPath&&row.finalPath!==fpath)throw Error('REVIEWED_FINAL_PATH_MISMATCH');
    if(already){
      if(fdoc.payload?.reviewedUefaRecovery?.ledgerSha256!==ledgerSha256||fdoc.payload?.reviewedUefaRecovery?.sourceSha256!==row.sourceSha256
          ||fdoc.payload.scoreHome!==final.scoreHome||fdoc.payload.scoreAway!==final.scoreAway)throw Error('ALREADY_APPLIED_FINAL_CONFLICT');
      proposal.finalProposal=fdoc.payload;alreadyApplied++;
    }else{
      if(fdoc.payload)throw Error('EXISTING_VERIFIED_FINAL_MUST_NOT_BE_OVERWRITTEN');
      if(row.status==='HISTORICAL_CANONICAL_ABSENT_REVIEW'&&existing.some(x=>x.canonicalId===c.canonicalId||x.providerIds?.uefa===row.id
          ||Date.parse(x.kickoffUtc)===Date.parse(c.kickoffUtc)&&sameTeam(x.homeTeam,c.homeTeam)&&sameTeam(x.awayTeam,c.awayTeam)))throw Error('HISTORICAL_EVENT_COLLISION_REQUIRES_REVIEW');
      const fixtures=old?payload.fixtures.map(x=>x.canonicalId===old.canonicalId?c:x):[...payload.fixtures,c];
      stage(cpath,{...payload,fixtures});stage(fpath,final);
      if(old)fixed++;else created++;
    }
    proposals.push(proposal);
  }
  const historyBuilds=new Map();
  for(const p of proposals){
    const row=p.historyRow,day=row.dayKey;
    if(!historyBuilds.has(day))historyBuilds.set(day,{ok:true,reason:null,dayKey:day,season:p.season,rows:[],errors:[]});
    historyBuilds.get(day).rows.push(row);
    const season=archiveSeasonForDate('uefa.nations',row.kickoff),relative=`data/history-archive/uefa.nations/${season}.json`;
    const doc=read(relative).payload||{leagueSlug:'uefa.nations',season,source:UEFA_LEDGER_RECOVERY_POLICY,matches:[]};
    const matches=Array.isArray(doc)?doc:doc.matches||doc.rows;
    if(!Array.isArray(matches))throw Error('ARCHIVE_SHAPE_INVALID');
    const old=matches.find(r=>r.id===row.id);
    if(old&&old.reviewedUefaRecovery?.sourceSha256!==row.reviewedUefaRecovery.sourceSha256)throw Error('ARCHIVE_SAME_ID_CONFLICT');
    if(!old)stage(relative,{...doc,matches:[...matches,{...row,season}]});
  }
  const sourceOps=[...operations.values()];
  save(path.join(outputDir,'prepared-source-operations.json'),{ledgerSha256,operations:sourceOps,blockers});
  const resolveTeam=(slug,name)=>slug==='uefa.nations'&&nativeTeams.has(norm(name))?
    {ok:true,provider:'uefa-official',providerTeamId:nativeTeams.get(norm(name)),teamScope:'NATIONAL_MEN_TEAM_A'}:
    getProductionIdentityResolver().resolveTeamReference({leagueSlug:slug,alias:name});
  const historyDocs=new Map(),historyPlans=[];
  for(const build of historyBuilds.values()){
    const relative=`data/history/${build.season}.json`;
    if(!historyDocs.has(relative))historyDocs.set(relative,read(relative).payload||{season:build.season,days:[]});
    const plan=planAdditiveHistoryDay(build,historyDocs.get(relative),{resolveTeam});
    historyPlans.push({dayKey:build.dayKey,ok:plan.ok,reason:plan.reason||null,rows:plan.additions.length,held:plan.held});
    if(plan.ok)historyDocs.set(relative,plan.document);
  }
  const historyOps=[...historyDocs].flatMap(([relative,payload])=>JSON.stringify(read(relative).payload)!==JSON.stringify(payload)?[{...read(relative),payload}]:[]);
  save(path.join(outputDir,'prepared-history-operations.json'),{operations:historyOps,historyPlans});
  let sourceApplied=null,historyApplied=null,journal={ok:false,reason:'DRY_RUN'},historyBlocker=null;
  if(write){
    sourceApplied=applyReviewedOperations(sourceOps,{root,backupDir:path.join(outputDir,'source-before-'+Date.now())});
    journal=await preflightHistoryJournal(root);
    if(journal.ok){
      try{
        for(const build of historyBuilds.values())if(historyPlans.find(p=>p.dayKey===build.dayKey)?.ok)await journalHistoryBuild(path.join(root,'data/history-recovery-journal'),build);
        historyApplied=applyReviewedOperations(historyOps,{root,backupDir:path.join(outputDir,'history-before-'+Date.now())});
      }catch(error){historyBlocker={reason:'HISTORY_JOURNAL_OR_TRANSACTION_FAILED',code:error.code||null,detail:error.message};}
    }else historyBlocker=journal;
  }
  const derived=[],seasons=[...new Set(proposals.map(p=>p.season))].sort();
  if(write&&finishDerived){
    for(const season of seasons)try{const r=await buildCurrentSeasonIndexes({season,dayKey:'2026-11-15'});derived.push({job:'indexes',...r});}catch(e){derived.push({job:'indexes',season,ok:false,reason:e.message});}
    for(const season of ['2025-2026','2026-2027'])try{derived.push({job:'priors',...await buildModelPriors({targetSeason:season})});}catch(e){derived.push({job:'priors',season,ok:false,reason:e.message});}
    if(historyApplied&&!historyPlans.some(p=>!p.ok))try{
      const r=rebuildH2HFoundationFromCurrentHistory();derived.push({job:'h2h',ok:r.ok,artifactCount:r.artifactCount,validationOK:r.validation?.ok});
    }catch(e){derived.push({job:'h2h',ok:false,reason:e.message});}
    else derived.push({job:'h2h',ok:false,reason:'SELECTED_HISTORY_NOT_FULLY_PERSISTED',blockedBy:historyBlocker});
    try{const r=auditGlobalHistoryCoverage({dayKey:'2026-11-15',write:true,phase:'after'});save(path.join(outputDir,'coverage-audit.json'),r);derived.push({job:'coverage-audit',ok:!r.readErrors.length,metrics:r.metrics,readErrors:r.readErrors});}catch(e){derived.push({job:'coverage-audit',ok:false,reason:e.message});}
  }
  const frozenAfter=verifyFrozenArtifacts(root,frozen);if(!frozenAfter.ok)throw Error('FROZEN_ARTIFACT_CHANGED');
  const report={schema:'aiml.reviewed-uefa-ledger-execution.v1',generatedAt:new Date().toISOString(),root,write,
    ledgerSha256,policy:UEFA_LEDGER_RECOVERY_POLICY,scope:{existingMatchedExcluded:125,sourceHoldExcluded:1,finalRepairs:5,historicalImports:187},
    validated:proposals.length,blockers,fixed,created,alreadyApplied,sourceApplied,historyApplied,journal,historyBlocker,
    historyPlans,derived,frozenBefore,frozenAfter,fullGlobalCoverageCertified:false,
    verdict:write&&proposals.length===192&&!blockers.length&&historyApplied&&!historyPlans.some(p=>!p.ok)&&!derived.some(d=>!d.ok)?'PASS_SCOPED_UEFA_RECOVERY':'HOLD'};
  save(path.join(outputDir,write?'execution.json':'dry-run.json'),report);
  console.log(JSON.stringify({write,validated:proposals.length,fixed,created,alreadyApplied,sourceFiles:sourceOps.length,
    historyReadyDays:historyPlans.filter(p=>p.ok).length,historyHeldDays:historyPlans.filter(p=>!p.ok).length,historyBlocker,verdict:report.verdict}));
  return report;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  const [ledgerPath,sourcesPath,outputDir]=process.argv.slice(2);
  if(!ledgerPath||!sourcesPath||!outputDir)throw Error('LEDGER_SOURCES_AND_EVIDENCE_DIRECTORY_REQUIRED');
  const write=process.argv.includes('--write');
  const manifestArg=process.argv.indexOf('--frozen-manifest');
  if(manifestArg>=0&&!process.argv[manifestArg+1])throw Error('FROZEN_MANIFEST_ARGUMENT_REQUIRED');
  const args={ledgerPath,sourcesPath,outputDir,write,finishDerived:process.argv.includes('--finish-derived'),...(manifestArg>=0?{frozenManifestPath:process.argv[manifestArg+1]}:{})};
  const result=write?await withArtifactLock(path.join(getProjectRoot(),'data/history-coverage/uefa-reviewed-recovery.lock'),()=>applyReviewedUefaLedger(args)):await applyReviewedUefaLedger(args);
  if(result?.reason==='artifact_writer_busy')throw Error('UEFA_RECOVERY_WRITER_BUSY');
}
