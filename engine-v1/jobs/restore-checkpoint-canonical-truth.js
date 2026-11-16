import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {getProjectRoot} from '../storage/data-root.js';
import {atomicArtifact,withArtifactLock} from '../storage/evidence-bound-history-store.js';
import {buildVerifiedHistoryDay} from './append-finalized-day-to-history.js';
import {verifyGlobalRecoveryProtection} from './reconcile-validated-history-stores.js';
import {preflightHistoryJournal} from './run-global-history-coverage-day.js';
import {getLeagueCoverage} from '../../workers/_shared/leagues-coverage.js';
import {athensDayFromKickoff} from '../core/daykey.js';
import {historyCompetitionDecision} from '../core/history-competition-provenance.js';

const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const encode=x=>JSON.stringify(x,null,2)+'\n';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const time=r=>Number(r.kickoff_ms)||Date.parse(r.kickoffUtc||r.kickoff);

// Restore a missing canonical record only from an existing verified final and
// an exact native event retained in the checkpoint archive. Neither source is
// promoted to a new verified final, and existing canonical rows are not edited.
export function planCanonicalRestoration({dayKey,final,archiveRows,existingRows,finalSha256,archiveSha256,approved=true}){
 const reject=reason=>({ok:false,reason});
 if(!approved)return reject('OUTSIDE_APPROVED_REGISTRY');
 if(final?.schema!=='ai-matchlab.verified-final-result.v1'||final.verifiedFinalTruth!==true
   ||final.finalTruthVerdict!=='verified_final_result'||!final.matchId||final.dayKey!==dayKey
   ||athensDayFromKickoff(final.kickoffUtc)!==dayKey||![finalSha256,archiveSha256].every(v=>/^[a-f0-9]{64}$/.test(v||'')))return reject('EXACT_VERIFIED_FINAL_SOURCE_REQUIRED');
 const ids=new Set((final.sources||[]).filter(s=>s.provider==='flashscore'&&/^[A-Za-z0-9]{6,16}$/.test(s.providerMatchId||'')
   &&s.home===final.homeTeam&&s.away===final.awayTeam&&s.scoreHome===final.scoreHome&&s.scoreAway===final.scoreAway
   &&Date.parse(s.kickoffUtc)===time(final)).map(s=>s.providerMatchId));
 if(ids.size!==1)return reject('UNIQUE_EXACT_NATIVE_FINAL_BINDING_REQUIRED');
 const id=[...ids][0];
 const matches=archiveRows.filter(r=>r.leagueSlug===final.leagueSlug&&(r.id===id||r.providerIds?.flashscore===id));
 if(matches.length!==1)return reject('UNIQUE_NATIVE_ARCHIVE_EVENT_REQUIRED');
 const a=matches[0];
 if(!historyCompetitionDecision(a).accepted||!historyCompetitionDecision(final).accepted)return reject('EXPLICIT_COMPETITION_CONTRADICTION');
 if(!['FT','STATUS_FINAL','STATUS_FULL_TIME'].includes(a.status)||a.nonPlayedTerminal===true
   ||time(a)!==time(final)||a.homeTeam!==final.homeTeam||a.awayTeam!==final.awayTeam
   ||a.scoreHome!==final.scoreHome||a.scoreAway!==final.scoreAway
   ||![a.scoreHome,a.scoreAway].every(v=>Number.isInteger(v)&&v>=0))return reject('EXACT_NATIVE_ARCHIVE_FACT_REQUIRED');
 if(existingRows.some(r=>r.canonicalId===final.matchId||r.providerIds?.flashscore===id
   ||r.leagueSlug===final.leagueSlug&&Date.parse(r.kickoffUtc||r.kickoff)===time(final)
     &&(r.homeTeam===final.homeTeam&&r.awayTeam===final.awayTeam||r.homeTeam===final.awayTeam&&r.awayTeam===final.homeTeam)))return reject('EXISTING_CANONICAL_EVENT_RECONCILIATION_REQUIRED');
 const canonical={canonicalId:final.matchId,matchId:final.matchId,matchKey:final.matchId,leagueSlug:final.leagueSlug,
   leagueName:final.leagueName,dayKey,kickoffUtc:final.kickoffUtc,homeTeam:final.homeTeam,awayTeam:final.awayTeam,
   scoreHome:final.scoreHome,scoreAway:final.scoreAway,status:'FT',rawStatus:'STATUS_FINAL',minute:'FT',
   source:'verified_final_native_archive_restoration',sourceId:id,sourceMatchId:id,providerIds:{flashscore:id},
   restorationEvidence:{schema:'aiml.checkpoint-canonical-restoration-proof.v1',finalSha256,archiveSha256,nativeMatchId:id,existingVerifiedFinalRetained:true}};
 const build=buildVerifiedHistoryDay({dayKey,canonicalRows:[canonical],finalResultRows:[final],rebuiltAt:0});
 if(!build.ok||build.rows.length!==1)return reject('VERIFIED_HISTORY_CONTRACT_REJECTED');
 return {ok:true,canonical};
}

export async function restoreCheckpointCanonicalTruth({checkpointDir,evidenceDir,protectionDir,write=false}){
 const root=getProjectRoot();if(path.resolve(root)!==path.resolve('C:/workspace/GLOBAL_HISTORY_COVERAGE_20261114'))throw Error('EXACT_ISOLATED_WORKSPACE_REQUIRED');
 fs.mkdirSync(evidenceDir,{recursive:true});const protectionBefore=verifyGlobalRecoveryProtection(root,protectionDir);
 const report=read(path.join(checkpointDir,'coverage-after.json'));
 const days=report.truthDays.filter(d=>!d.ok);if(days.length!==69)throw Error('EXACT_69_DAY_CHECKPOINT_REQUIRED');
 const accepted=[],held=[],operations=[],archiveCache=new Map(),canonicalCache=new Map();
 const archives=slug=>{if(!archiveCache.has(slug)){const dir=path.join(root,'data/history-archive',slug),files=fs.existsSync(dir)?fs.readdirSync(dir).filter(n=>n.endsWith('.json')):[];
  archiveCache.set(slug,files.map(n=>{const file=path.join(dir,n),bytes=fs.readFileSync(file),d=JSON.parse(bytes);return {file,sha256:hash(bytes),rows:Array.isArray(d)?d:d.matches||d.rows||[]};}));}return archiveCache.get(slug);};
 for(const day of days){
  const dir=path.join(root,'data/canonical-fixtures',day.dayKey),names=fs.readdirSync(dir).filter(n=>n.endsWith('.json'));
  const existing=names.flatMap(n=>read(path.join(dir,n)).fixtures||[]);
  const finalDir=path.join(root,'data/final-results',day.dayKey),finalFiles=fs.readdirSync(finalDir).filter(n=>n.endsWith('.json')).map(n=>{const file=path.join(finalDir,n),bytes=fs.readFileSync(file);return {file,bytes,doc:JSON.parse(bytes)};});
  for(const e of day.errors.filter(e=>e.reason==='verified_final_missing_canonical_fixture')){
   const selected=finalFiles.filter(f=>f.doc.matchId===e.matchId);if(selected.length!==1){held.push({dayKey:day.dayKey,id:e.matchId,reason:'UNIQUE_VERIFIED_FINAL_ARTIFACT_REQUIRED'});continue;}
   const {file:finalFile,bytes,doc:final}=selected[0];
   const sources=archives(final.leagueSlug),ids=new Set((final.sources||[]).filter(s=>s.provider==='flashscore').map(s=>s.providerMatchId));
   const candidates=sources.filter(s=>s.rows.some(r=>ids.has(r.id)||ids.has(r.providerIds?.flashscore)));
   if(candidates.length!==1){held.push({dayKey:day.dayKey,id:e.matchId,reason:'UNIQUE_NATIVE_ARCHIVE_FILE_REQUIRED'});continue;}
   const source=candidates[0],plan=planCanonicalRestoration({dayKey:day.dayKey,final,archiveRows:source.rows,existingRows:existing,finalSha256:hash(bytes),archiveSha256:source.sha256,approved:!!getLeagueCoverage(final.leagueSlug)});
   if(!plan.ok){held.push({dayKey:day.dayKey,id:e.matchId,reason:plan.reason});continue;}
   const relative=`data/canonical-fixtures/${day.dayKey}/${final.leagueSlug}.json`,file=path.join(root,relative);
   if(!canonicalCache.has(relative)){const before=fs.existsSync(file)?fs.readFileSync(file):null;canonicalCache.set(relative,{relative,beforeSha256:before?hash(before):null,before:before?.toString('utf8')||null,payload:before?JSON.parse(before):{dayKey:day.dayKey,leagueSlug:final.leagueSlug,fixtures:[]}});}
   canonicalCache.get(relative).payload.fixtures.push(plan.canonical);existing.push(plan.canonical);
   accepted.push({dayKey:day.dayKey,id:e.matchId,relative,finalPath:path.relative(root,finalFile).replaceAll('\\','/'),finalSha256:hash(bytes),archivePath:path.relative(root,source.file).replaceAll('\\','/'),archiveSha256:source.sha256});
  }
 }
 operations.push(...canonicalCache.values());
 fs.writeFileSync(path.join(evidenceDir,'prepared-canonical-restoration.json'),encode({accepted,held,operations}));
 let journal={ok:false,reason:'DRY_RUN'},appliedFiles=0;
 if(write){journal=await preflightHistoryJournal(root);if(journal.ok){
  for(const op of operations){const file=path.join(root,op.relative),current=fs.existsSync(file)?hash(fs.readFileSync(file)):null;if(current!==op.beforeSha256)throw Error('CANONICAL_INPUT_DRIFT');}
  for(const proof of accepted)if(hash(fs.readFileSync(path.join(root,proof.finalPath)))!==proof.finalSha256||hash(fs.readFileSync(path.join(root,proof.archivePath)))!==proof.archiveSha256)throw Error('RESTORATION_SOURCE_DRIFT');
  for(const op of operations){
   if(op.before!==null)await atomicArtifact(path.join(root,'data/history-recovery-journal/canonical-inputs',op.beforeSha256+'.json'),op.before,{immutable:true});
   const proofIds=new Set(accepted.filter(p=>p.relative===op.relative).map(p=>p.id));
   const record={schema:'aiml.checkpoint-canonical-restoration-transaction.v1',relative:op.relative,beforeSha256:op.beforeSha256,afterSha256:hash(encode(op.payload)),restoredRows:op.payload.fixtures.filter(r=>proofIds.has(r.canonicalId)),proofs:accepted.filter(p=>p.relative===op.relative)};
   const bytes=encode(record);await atomicArtifact(path.join(root,'data/history-recovery-journal/canonical-restorations',hash(bytes)+'.json'),bytes,{immutable:true});
  }
  const written=[];try{for(const op of operations){await atomicArtifact(path.join(root,op.relative),encode(op.payload));written.push(op);}appliedFiles=written.length;}
  catch(error){for(const op of written){if(op.before===null)fs.unlinkSync(path.join(root,op.relative));else await atomicArtifact(path.join(root,op.relative),op.before);}throw error;}
 }}
 const result={schema:'aiml.checkpoint-canonical-restoration.v1',write,accepted:accepted.length,held:held.length,proposedFiles:operations.length,appliedFiles,journal,protectionBefore,protectionAfter:verifyGlobalRecoveryProtection(root,protectionDir),existingCanonicalRowsEdited:0,verifiedFinalsEdited:0,fullCoverageCertified:false};
 fs.writeFileSync(path.join(evidenceDir,'execution.json'),encode(result));return result;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 const [checkpointDir,evidenceDir,protectionDir]=process.argv.slice(2);
 const result=await withArtifactLock(path.join(getProjectRoot(),'data/history-coverage/recovery.lock'),()=>restoreCheckpointCanonicalTruth({checkpointDir,evidenceDir,protectionDir,write:process.argv.includes('--write')}));console.log(JSON.stringify(result));
}
