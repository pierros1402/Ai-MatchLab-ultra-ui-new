import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
import {getProjectRoot} from '../storage/data-root.js';
import {atomicArtifact,journalHistoryBuild,withArtifactLock} from '../storage/evidence-bound-history-store.js';
import {writeHistoryJsonAtomic} from '../storage/history-preservation.js';
import {fingerprint} from '../core/season-closure-contract.js';
import {buildHistoryDayFromTruth} from './append-finalized-day-to-history.js';
import {buildSourceBoundHistoryEventIdentities} from '../core/source-bound-history-event-identities.js';
import {buildSourceBoundHistoryTeamIdentities} from '../core/source-bound-history-team-identities.js';
import {planAdditiveHistoryDay} from '../core/additive-history-recovery.js';
import {getProductionIdentityResolver} from '../core/production-identity-resolver-runtime.js';
import {getLeagueCoverage} from '../../workers/_shared/leagues-coverage.js';
import {historyCompetitionDecision} from '../core/history-competition-provenance.js';
import {auditHistoryRows} from './audit-history-semantic-integrity.js';
import {buildCurrentSeasonIndexes} from './build-current-season-indexes.js';
import {rebuildH2HFoundationFromCurrentHistory} from './rebuild-h2h-foundation-from-current-history.js';
import {auditGlobalHistoryCoverage} from './audit-global-history-coverage.js';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const fact=r=>{const {rebuiltAt,...f}=r;return f;};
const save=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});writeHistoryJsonAtomic(file,value);};
export function verifyGlobalRecoveryProtection(root,dir){
 const report=[];
 for(const name of ['protected-prediction-artifacts.json','protected-core-algorithms.json','protected-uefa-source-files.json']){
  const list=read(path.join(dir,name));if(name==='protected-prediction-artifacts.json'&&list.length!==2506)throw Error('EXACT_2506_PROTECTION_REQUIRED');
  const changed=list.filter(r=>!fs.existsSync(path.join(root,r.path))||sha(fs.readFileSync(path.join(root,r.path)))!==r.sha256).map(r=>r.path);
  report.push({manifest:name,checked:list.length,changed,ok:!changed.length});
 }
 if(report.some(r=>!r.ok))throw Error('GLOBAL_RECOVERY_PROTECTION_DRIFT:'+JSON.stringify(report));return report;
}
export async function reconcileValidatedHistoryStores({analysisFile,checkpointFile,outputDir,protectionDir,write=false,derive=false,captureDir=null}={}){
 const root=getProjectRoot();if(path.resolve(root)!==path.resolve('C:/workspace/GLOBAL_HISTORY_COVERAGE_20261114'))throw Error('EXACT_ISOLATED_WORKSPACE_REQUIRED');
 fs.mkdirSync(outputDir,{recursive:true});const protectedBefore=verifyGlobalRecoveryProtection(root,protectionDir);
 const analysis=read(analysisFile),checkpoint=read(checkpointFile),scope=new Set(checkpoint.gaps.filter(g=>g.reason==='VERIFIED_CANONICAL_RESULT_NOT_IN_HISTORY').map(g=>g.id));
 if(scope.size!==9577)throw Error('EXACT_CHECKPOINT_CANONICAL_SCOPE_REQUIRED');
 const histories=new Map(),before=new Map();
 for(const name of fs.readdirSync(path.join(root,'data/history')).filter(n=>/^\d{4}-\d{4}\.json$/.test(n))){const bytes=fs.readFileSync(path.join(root,'data/history',name)),doc=JSON.parse(bytes);histories.set(doc.season,doc);before.set(doc.season,bytes);}
 const originalRows=[...histories.values()].flatMap(d=>d.days.flatMap(d=>d.rows));
 const rawCanon=[],entries=[];
 for(const day of fs.readdirSync(path.join(root,'data/canonical-fixtures')).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)))for(const name of fs.readdirSync(path.join(root,'data/canonical-fixtures',day)).filter(f=>f.endsWith('.json'))){
  const file=path.join(root,'data/canonical-fixtures',day,name),bytes=fs.readFileSync(file),rows=JSON.parse(bytes).fixtures||[];rawCanon.push(...rows);
  for(const canonical of rows){const f=path.join(root,'data/final-results',day,canonical.canonicalId+'.json');if(fs.existsSync(f))entries.push({canonical,final:read(f),sourceSha256:sha(bytes)});}
 }
 const observed=captureDir?(await import('./reconcile-collected-history-archives.js')).revalidateCollectedArchiveFacts(captureDir).facts:[];
 const events=buildSourceBoundHistoryEventIdentities(entries),native=buildSourceBoundHistoryTeamIdentities(rawCanon,observed),resolver=getProductionIdentityResolver();
 const dayCache=new Map(),accepted=[],held=[],journalRecords=[];
 const resolveTeam=(slug,alias)=>{const n=native.resolveTeam(slug,alias);return n.ok?n:resolver.resolveTeamReference({leagueSlug:slug,alias});};
 const groups=analysis.builds.filter(x=>x.plan.ok);
 for(const [i,entry] of groups.entries()){
  const build=entry.build;
  if(!dayCache.has(build.dayKey))dayCache.set(build.dayKey,buildHistoryDayFromTruth(build.dayKey));
  const fresh=dayCache.get(build.dayKey),errors=new Set(fresh.errors?.map(e=>e.matchId));
  if(build.rows.some(r=>!scope.has(r.id)||!getLeagueCoverage(r.leagueSlug)||!historyCompetitionDecision(r).accepted
   ||errors.has(r.id)||!fresh.rows.some(n=>n.id===r.id&&fingerprint(fact(n))===fingerprint(fact(r))))||fresh.errors?.some(e=>!e.matchId)){
    held.push({dayKey:build.dayKey,slug:build.rows[0]?.leagueSlug,reason:'CURRENT_VERIFIED_SCOPE_OR_FACT_DRIFT'});continue;
  }
  const plan=planAdditiveHistoryDay(build,histories.get(build.season),{resolveTeam,resolveEvent:events.resolveEvent});
  if(!plan.ok){held.push({dayKey:build.dayKey,slug:build.rows[0]?.leagueSlug,reason:plan.reason,details:plan.held});continue;}
  let journal=null;
  if(write)try{
   journal=await journalHistoryBuild(path.join(root,'data/history-recovery-journal'),build);
   if(journal.journaled.length!==build.rows.length)throw Error('EVERY_ADDITIVE_FACT_MUST_BE_JOURNALED');
   journalRecords.push(...journal.journaled);
  }catch(e){held.push({dayKey:build.dayKey,slug:build.rows[0]?.leagueSlug,reason:'MANDATORY_JOURNAL_FAILED',code:e.code||null,detail:e.message});continue;}
  histories.set(build.season,plan.document);accepted.push({dayKey:build.dayKey,season:build.season,slug:build.rows[0]?.leagueSlug,ids:plan.additions.map(r=>r.id),rowsWritten:plan.additions.length});
  if((i+1)%200===0)console.log(JSON.stringify({event:'validated-group',completed:i+1,total:groups.length,accepted:accepted.length,held:held.length}));
 }
 const integrityBefore=auditHistoryRows(originalRows,{maxExamples:100000});
 const integrityProjected=auditHistoryRows([...histories.values()].flatMap(d=>d.days.flatMap(d=>d.rows)),{maxExamples:100000});
 save(path.join(outputDir,'history-integrity-validation.json'),{before:integrityBefore,projected:integrityProjected});
 for(const key of ['invalidRowCount','duplicateIdCount','selfPairCount','operationalDayMismatchCount'])if(integrityProjected[key]>integrityBefore[key])throw Error('NEW_HISTORY_INTEGRITY_FAILURE:'+key);
 for(const key of ['duplicateGroups','scoreConflictGroups','flippedOrientationGroups'])if(integrityProjected.semantic[key]>integrityBefore.semantic[key])throw Error('NEW_HISTORY_SEMANTIC_FAILURE:'+key);
 const operations=[...histories].filter(([season,doc])=>JSON.stringify(JSON.parse(before.get(season)))!==JSON.stringify(doc)).map(([season,payload])=>({relative:`data/history/${season}.json`,beforeSha256:sha(before.get(season)),payload}));
 save(path.join(outputDir,'prepared-history-operations.json'),{operations,accepted,held});save(path.join(outputDir,'journal-records.json'),journalRecords);
 const written=[];
 if(write)try{
  for(const op of operations){const file=path.join(root,op.relative);if(sha(fs.readFileSync(file))!==op.beforeSha256)throw Error('HISTORY_STORE_DRIFT');}
  const backupDir=path.join(outputDir,'before');fs.mkdirSync(backupDir,{recursive:true});
  for(const op of operations){const file=path.join(root,op.relative),season=op.payload.season;fs.writeFileSync(path.join(backupDir,season+'.json'),before.get(season),{flag:'wx'});written.push(season);await atomicArtifact(file,JSON.stringify(op.payload,null,2)+'\n');}
 }catch(error){for(const season of written)await atomicArtifact(path.join(root,'data/history',season+'.json'),before.get(season));throw error;}
 const derived=[];
 if(write&&derive&&written.length){
  for(const season of written)try{const r=await buildCurrentSeasonIndexes({season,dayKey:'2026-11-15'});derived.push({job:'indexes',season,ok:r.ok,matchCount:r.matchCount,foundationFingerprint:r.foundationFingerprint});}catch(e){derived.push({job:'indexes',season,ok:false,reason:e.message});}
  const h2hRoot=path.resolve(root,'data/h2h'),h2hTemp=path.resolve(root,`data/.h2h.tmp-${process.pid}`);
  if(![h2hRoot,h2hTemp].every(p=>p.startsWith(path.resolve(root)+path.sep)&&(!fs.existsSync(p)||!fs.lstatSync(p).isSymbolicLink())))throw Error('H2H_REBUILD_ROOT_NOT_SAFE');
  try{const r=rebuildH2HFoundationFromCurrentHistory();derived.push({job:'h2h',ok:r.ok,artifactCount:r.artifactCount,validationOK:r.validation?.ok});}catch(e){derived.push({job:'h2h',ok:false,reason:e.message});}
 }
 if(write&&derive){const a=auditGlobalHistoryCoverage({dayKey:'2026-11-15',write:true,phase:'after'});save(path.join(outputDir,'coverage-after.json'),a);derived.push({job:'coverage',status:a.status,metrics:a.metrics});}
 const protectedAfter=verifyGlobalRecoveryProtection(root,protectionDir);
 const report={schema:'aiml.validated-global-history-reconciliation.v1',write,generatedAt:new Date().toISOString(),checkpointSha256:sha(fs.readFileSync(checkpointFile)),analysisSha256:sha(fs.readFileSync(analysisFile)),scopeCount:scope.size,completedUefaRecoveryRepeated:false,
  attemptedGroups:groups.length,acceptedGroups:accepted.length,heldGroups:held.length,rowsWritten:write?accepted.reduce((n,r)=>n+r.rowsWritten,0):0,proposedRows:accepted.reduce((n,r)=>n+r.rowsWritten,0),writtenSeasons:written,journaledFacts:journalRecords.length,held,derived,protectedBefore,protectedAfter,fullCoverageCertified:false};
 save(path.join(outputDir,write?'execution.json':'preflight.json'),report);console.log(JSON.stringify({rowsWritten:report.rowsWritten,proposedRows:report.proposedRows,heldGroups:held.length,writtenSeasons:written,derived}));return report;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 const [analysisFile,checkpointFile,outputDir,protectionDir]=process.argv.slice(2);if(!analysisFile||!checkpointFile||!outputDir||!protectionDir)throw Error('ANALYSIS_CHECKPOINT_OUTPUT_PROTECTION_REQUIRED');
 const cp=process.argv.indexOf('--capture-dir');if(cp>=0&&!process.argv[cp+1])throw Error('CAPTURE_DIRECTORY_ARGUMENT_REQUIRED');
 const args={analysisFile,checkpointFile,outputDir,protectionDir,write:process.argv.includes('--write'),derive:process.argv.includes('--derive'),captureDir:cp>=0?process.argv[cp+1]:null};
 const result=await withArtifactLock(path.join(getProjectRoot(),'data/history-coverage/recovery.lock'),()=>reconcileValidatedHistoryStores(args));if(result?.reason==='artifact_writer_busy')throw Error('HISTORY_WRITER_BUSY');
}
