import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import zlib from 'node:zlib';import {isDeepStrictEqual} from 'node:util';import {fileURLToPath} from 'node:url';
import {getProjectRoot} from '../storage/data-root.js';
import {atomicArtifact,journalHistoryBuild,withArtifactLock} from '../storage/evidence-bound-history-store.js';
import {writeHistoryJsonAtomic} from '../storage/history-preservation.js';
import {parseFlashscoreFeed} from '../odds/flashscore-fixtures-source.js';
import {pageNativeHistoryFeeds,validateObservedFeedResult} from './collect-missing-competition-history.js';
import {validCoverageResult} from '../core/global-history-coverage.js';
import {historyCompetitionDecision} from '../core/history-competition-provenance.js';
import {canonicalTeamName} from '../storage/team-aliases-db.js';
import {getProductionIdentityResolver} from '../core/production-identity-resolver-runtime.js';
import {LEAGUES_COVERAGE} from '../../workers/_shared/leagues-coverage.js';
import {athensDayFromKickoff} from '../core/daykey.js';
import {buildHistoryArchiveFastAudit} from './build-history-archive-fast-audit.js';
import {auditHistoryRows} from './audit-history-semantic-integrity.js';
import {verifyGlobalRecoveryProtection} from './reconcile-validated-history-stores.js';
import {preflightHistoryJournal} from './run-global-history-coverage-day.js';
import {buildVerifiedHistoryDay} from './append-finalized-day-to-history.js';
import {sameTeamName} from '../core/fixture-dedup.js';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const save=(f,x)=>{fs.mkdirSync(path.dirname(f),{recursive:true});writeHistoryJsonAtomic(f,x);};

export function sameCanonicalArchiveIdentity(row,canonicalFact){
 return Boolean(canonicalFact&&row.id===canonicalFact.id&&row.leagueSlug===canonicalFact.leagueSlug
  &&(Number(row.kickoff_ms)||Date.parse(row.kickoff||row.kickoffUtc))===canonicalFact.kickoff_ms
  &&sameTeamName(row.leagueSlug,row.homeTeam,canonicalFact.homeTeam)
  &&sameTeamName(row.leagueSlug,row.awayTeam,canonicalFact.awayTeam));
}
export function sameVerifiedCanonicalArchiveEvent(row,canonicalFact){return sameCanonicalArchiveIdentity(row,canonicalFact)&&row.scoreHome===canonicalFact.scoreHome&&row.scoreAway===canonicalFact.scoreAway;}

export function revalidateCollectedArchiveFacts(captureDir){
 const report=read(path.join(captureDir,'report.json'));if(report.schema!=='aiml.missing-competition-native-history-capture.v1'||report.competitionInventory!==230||report.productionWrites!==0||report.excludedCompletedUefaRecovery!==true)throw Error('BOUND_READ_ONLY_COLLECTION_REQUIRED');
 const manifests=read(path.join(captureDir,'capture-manifest.json')),cache=new Map(),facts=[],seen=new Map();
 for(const record of report.records)for(const season of record.seasons)for(const row of season.rows){
  const proof=row.sourceEvidence,source=manifests.find(m=>m.ok&&m.sha256===proof.sha256&&m.url===proof.url&&m.capturedAt===proof.capturedAt);
  if(!source||source.file!==`raw/${source.sha256}.gz`||record.slug!==row.leagueSlug||season.season!==row.season)throw Error('CAPTURE_NATIVE_SOURCE_BINDING_MISMATCH');
  if(!cache.has(source.sha256)){
   const bytes=zlib.gunzipSync(fs.readFileSync(path.join(captureDir,source.file)));if(sha(bytes)!==source.sha256||bytes.length!==source.bytes)throw Error('CAPTURE_RAW_BYTES_CHANGED');
   const text=bytes.toString('utf8'),feeds=pageNativeHistoryFeeds(text);cache.set(source.sha256,feeds.length?feeds.flatMap(f=>f.rows):parseFlashscoreFeed(text));
  }
  const {sourceEvidence,...expected}=row;
  const matches=cache.get(source.sha256).filter(r=>r.matchId===row.id).map(r=>validateObservedFeedResult(r,{slug:row.leagueSlug,season:row.season})).filter(r=>r.ok&&isDeepStrictEqual(r.row,expected));
  if(!matches.length)throw Error('CAPTURE_RAW_NATIVE_FACT_DISAGREEMENT:'+row.id);
  const key=row.leagueSlug+'\0'+row.id,prior=seen.get(key);if(prior&&!isDeepStrictEqual({...prior,sourceEvidence:null},{...row,sourceEvidence:null}))throw Error('CAPTURE_CROSS_SOURCE_CONFLICT');
  if(!prior){seen.set(key,row);facts.push(row);}
 }
 return {facts,validatedSourceCount:cache.size,sourceCaptures:manifests.length};
}

export async function reconcileCollectedHistoryArchives({captureDir,outputDir,protectionDir,write=false}={}){
 const root=getProjectRoot();if(path.resolve(root)!==path.resolve('C:/workspace/GLOBAL_HISTORY_COVERAGE_20261114'))throw Error('EXACT_ISOLATED_WORKSPACE_REQUIRED');
 const protectedBefore=verifyGlobalRecoveryProtection(root,protectionDir),source=revalidateCollectedArchiveFacts(captureDir),resolver=getProductionIdentityResolver(),names=new Map();
 const team=(slug,name)=>{const k=slug+'\0'+name;if(!names.has(k)){const r=resolver.resolveTeamReference({leagueSlug:slug,alias:name});names.set(k,r.ok?'global:'+r.globalClubId:String(canonicalTeamName(slug,name)||name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim());}return names.get(k);};
 const event=r=>JSON.stringify([r.leagueSlug,Number(r.kickoff_ms)||Date.parse(r.kickoff||r.kickoffUtc),team(r.leagueSlug,r.homeTeam),team(r.leagueSlug,r.awayTeam)]);
 const truth=r=>JSON.stringify([event(r),Number(r.scoreHome),Number(r.scoreAway),r.status||'FT']);
 const docs=new Map(),globalEvents=new Map(),quarantines=[],conflicts=[],skipped=[],added=[],canonicalProofs=new Map(),originalRecords=new WeakMap();let dayCorrections=0;
 const canonicalProof=(id,slug)=>{
  const key=slug+'\0'+id;if(canonicalProofs.has(key))return canonicalProofs.get(key);
  const date=/_([0-9]{8})$/.exec(String(id));let fact=null;
  if(date){const d=date[1],day=d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6),cp=path.join(root,'data/canonical-fixtures',day,slug+'.json'),fp=path.join(root,'data/final-results',day,id+'.json');
   if(fs.existsSync(cp)&&fs.existsSync(fp)){const canonical=read(cp).fixtures?.find(r=>r.canonicalId===id);if(canonical){const b=buildVerifiedHistoryDay({dayKey:day,canonicalRows:[canonical],finalResultRows:[read(fp)],rebuiltAt:0});if(b.ok&&b.rows.length===1)fact=b.rows[0];}}
  }
  canonicalProofs.set(key,fact);return fact;
 };
 for(const meta of LEAGUES_COVERAGE){if(meta.slug==='uefa.nations')continue;const folder=path.join(root,'data/history-archive',meta.slug);if(!fs.existsSync(folder))continue;
  for(const file of fs.readdirSync(folder).filter(f=>/^\d{4}(?:-\d{4})?\.json$/.test(f))){const relative=`data/history-archive/${meta.slug}/${file}`,bytes=fs.readFileSync(path.join(root,relative)),payload=JSON.parse(bytes),rows=Array.isArray(payload)?payload:payload.matches||payload.rows;if(!Array.isArray(rows))throw Error('ARCHIVE_STORE_SHAPE_INVALID');
   const unique=[],ids=new Map(),events=new Map();let blocked=false;
   for(const original of rows){
    if(!validCoverageResult(original)||!historyCompetitionDecision(original).accepted){quarantines.push({relative,id:original.id,reason:!validCoverageResult(original)?'NON_PLAYED_OR_INVALID_OBSERVATION':'EXPLICIT_COMPETITION_CONTRADICTION',row:original});continue;}
    const row={...original},operationalDay=athensDayFromKickoff(row.kickoff||row.kickoffUtc||new Date(row.kickoff_ms).toISOString());if(row.dayKey!==operationalDay){row.dayKey=operationalDay;dayCorrections++;}
    const id=row.canonicalId||row.matchId||row.id,previous=ids.get(id);
    if(previous){
     const proof=truth(previous)!==truth(row)?canonicalProof(id,row.leagueSlug):null;
     if(proof&&sameVerifiedCanonicalArchiveEvent(previous,proof)&&sameVerifiedCanonicalArchiveEvent(row,proof)){
      const preferCurrent=row.homeTeam===proof.homeTeam&&row.awayTeam===proof.awayTeam;
      quarantines.push({relative,id,reason:'VERIFIED_CANONICAL_ID_ALIAS_DUPLICATE',row:preferCurrent?(originalRecords.get(previous)||previous):original,canonicalId:proof.id});
      if(preferCurrent){events.delete(truth(previous));Object.assign(previous,row);originalRecords.set(previous,original);events.set(truth(previous),previous);}
     }else if(proof&&sameCanonicalArchiveIdentity(previous,proof)&&sameCanonicalArchiveIdentity(row,proof)
        &&(sameVerifiedCanonicalArchiveEvent(previous,proof)||sameVerifiedCanonicalArchiveEvent(row,proof))){
      const keepCurrent=sameVerifiedCanonicalArchiveEvent(row,proof);
      quarantines.push({relative,id,reason:'SCORE_DISAGREEMENT_RESOLVED_BY_EXACT_VERIFIED_CANONICAL_FINAL',row:keepCurrent?(originalRecords.get(previous)||previous):original,retainedScore:[proof.scoreHome,proof.scoreAway],retainedStatus:proof.status});
      events.delete(truth(previous));if(keepCurrent){Object.assign(previous,row);originalRecords.set(previous,original);}previous.status=proof.status;previous.rawStatus=proof.status==='PEN'?'STATUS_FINAL_PEN':proof.status==='AET'?'STATUS_FINAL_AET':'STATUS_FINAL';previous.scoreBasis='EXACT_VERIFIED_CANONICAL_FINAL';events.set(truth(previous),previous);
     }else if(truth(previous)!==truth(row)){conflicts.push({relative,id,reason:'EXISTING_ID_SCORE_OR_EVENT_CONFLICT',previous:{homeTeam:previous.homeTeam,awayTeam:previous.awayTeam,scoreHome:previous.scoreHome,scoreAway:previous.scoreAway,kickoff:previous.kickoff},candidate:{homeTeam:row.homeTeam,awayTeam:row.awayTeam,scoreHome:row.scoreHome,scoreAway:row.scoreAway,kickoff:row.kickoff}});blocked=true;unique.push(row);}
     else quarantines.push({relative,id,reason:'EXACT_STABLE_ID_DUPLICATE',row:original});continue;
    }
    const duplicate=events.get(truth(row));if(duplicate){quarantines.push({relative,id,retainedId:duplicate.id,reason:'EXACT_EVENT_AND_SCORE_DUPLICATE',row:original});continue;}
    ids.set(id,row);originalRecords.set(row,original);events.set(truth(row),row);unique.push(row);
   }
   docs.set(relative,{relative,beforeSha256:sha(bytes),before:bytes,payload,rows:blocked?rows:unique,blocked});
   for(const r of unique){const key=event(r);if(!globalEvents.has(key))globalEvents.set(key,[]);globalEvents.get(key).push({relative,row:r});}
  }
 }
 for(const row of source.facts){
  const relative=`data/history-archive/${row.leagueSlug}/${row.season}.json`;
  const represented=globalEvents.get(event(row))||[];
  if(represented.length){if(represented.every(x=>truth(x.row)===truth(row)))skipped.push({id:row.id,slug:row.leagueSlug,reason:'EXACT_EVENT_ALREADY_ARCHIVED',existingIds:represented.map(x=>x.row.id)});else conflicts.push({relative,id:row.id,reason:'OBSERVED_SOURCE_SCORE_OR_STATUS_CONFLICT',existing:represented.map(x=>({id:x.row.id,scoreHome:x.row.scoreHome,scoreAway:x.row.scoreAway,status:x.row.status}))});continue;}
  let doc=docs.get(relative);if(!doc){doc={relative,beforeSha256:null,before:null,payload:{leagueSlug:row.leagueSlug,season:row.season,source:'validated-native-archive-feed',matches:[]},rows:[],blocked:false};docs.set(relative,doc);}
  if(doc.blocked){conflicts.push({relative,id:row.id,reason:'EXISTING_ARCHIVE_FILE_CONFLICT'});continue;}
  const old=doc.rows.find(r=>(r.id||r.matchId)===row.id);if(old){conflicts.push({relative,id:row.id,reason:'NATIVE_ID_EVENT_DISAGREEMENT'});continue;}
  doc.rows.push(row);globalEvents.set(event(row),[{relative,row}]);added.push(row);
 }
 const addedKeys=new Set(added.map(r=>r.leagueSlug+'\0'+r.id));
 const projected=auditHistoryRows([...docs.values()].flatMap(d=>d.rows.map(r=>({...r,__container:d.relative}))),{maxExamples:100000});
 for(const kind of ['semanticDuplicates','scoreConflicts','flippedOrientation'])for(const group of projected.semantic.examples[kind]||[]){
  for(const r of group.rows||[])if(addedKeys.has(r.leagueSlug+'\0'+r.id)){
   const relative=r.container||r.__container,doc=docs.get(relative);if(doc&&!doc.blocked){doc.blocked=true;conflicts.push({relative,id:r.id,reason:'PROJECTED_'+kind.toUpperCase()+'_REQUIRES_ADJUDICATION'});}
  }
 }
 save(path.join(outputDir,'projected-integrity.json'),projected);
 const eligibleAdded=added.filter(r=>!docs.get(`data/history-archive/${r.leagueSlug}/${r.season}.json`)?.blocked);
 const operations=[...docs.values()].filter(d=>!d.blocked).map(d=>{const payload=Array.isArray(d.payload)?d.rows:{...d.payload,[Array.isArray(d.payload.matches)?'matches':'rows']:d.rows};return {...d,payload};}).filter(d=>d.before===null||JSON.stringify(JSON.parse(d.before))!==JSON.stringify(d.payload));
 const portable=operations.map(({before,rows,blocked,...d})=>d);save(path.join(outputDir,'prepared-archive-operations.json'),{operations:portable,quarantines,conflicts,added,skipped});
 const beforeAudit=buildHistoryArchiveFastAudit();save(path.join(outputDir,'integrity-before.json'),beforeAudit);
 let journal={ok:false,reason:'DRY_RUN'},appliedFiles=0;
 if(write){journal=await preflightHistoryJournal(root);
  if(journal.ok){
   for(const op of operations){const target=path.join(root,op.relative),current=fs.existsSync(target)?sha(fs.readFileSync(target)):null;if(current!==op.beforeSha256)throw Error('ARCHIVE_INPUT_DRIFT');if(op.before)await atomicArtifact(path.join(root,'data/history-recovery-journal/archive-inputs',op.beforeSha256+'.json'),op.before,{immutable:true});}
   const canonicalFacts=[...canonicalProofs.values()].filter(Boolean);
   const canonicalJournal=await journalHistoryBuild(path.join(root,'data/history-recovery-journal'),{ok:true,errors:[],rows:canonicalFacts});
   if(canonicalJournal.journaled.length!==canonicalFacts.length)throw Error('CANONICAL_CORRECTION_JOURNAL_REQUIRED');
   for(const row of eligibleAdded){const record={schema:'ai-matchlab.observed-native-archive-fact.v1',verifiedCanonicalPromotion:false,fact:row},bytes=JSON.stringify(record,null,2)+'\n';await atomicArtifact(path.join(root,'data/history-recovery-journal/archive-source-facts',sha(bytes)+'.json'),bytes,{immutable:true});}
   const written=[];try{for(const op of operations){await atomicArtifact(path.join(root,op.relative),JSON.stringify(op.payload,null,2)+'\n');written.push(op);}
    const after=buildHistoryArchiveFastAudit();save(path.join(outputDir,'integrity-after.json'),after);
    for(const k of ['duplicateGroups','scoreConflictGroups','flippedOrientationGroups'])if(after.semantic[k]>beforeAudit.semantic[k])throw Error('ARCHIVE_POST_AUDIT_SEMANTIC_FAILURE:'+k);
    if(after.invalidRowCount>beforeAudit.invalidRowCount||after.duplicateIdCount>beforeAudit.duplicateIdCount)throw Error('ARCHIVE_POST_AUDIT_ID_OR_SHAPE_FAILURE');appliedFiles=written.length;
   }catch(error){for(const op of written.reverse()){if(op.before)await atomicArtifact(path.join(root,op.relative),op.before);else fs.unlinkSync(path.join(root,op.relative));}throw error;}
  }
 }
 const report={schema:'aiml.native-archive-reconciliation.v1',write,generatedAt:new Date().toISOString(),sourceFactsRevalidated:source.facts.length,validatedSourceCount:source.validatedSourceCount,proposedNewArchiveFacts:eligibleAdded.length,heldObservedFacts:added.length-eligibleAdded.length,alreadyRepresented:skipped.length,quarantinesByReason:quarantines.reduce((a,r)=>(a[r.reason]=(a[r.reason]||0)+1,a),{}),quarantineCount:quarantines.length,dayCorrections,conflicts:conflicts.length,proposedFiles:operations.length,appliedFiles,journal,protectedBefore,protectedAfter:verifyGlobalRecoveryProtection(root,protectionDir),fullCoverageCertified:false};
 save(path.join(outputDir,write?'execution.json':'preflight.json'),report);console.log(JSON.stringify(report));return report;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){const [captureDir,outputDir,protectionDir]=process.argv.slice(2);const result=await withArtifactLock(path.join(getProjectRoot(),'data/history-coverage/recovery.lock'),()=>reconcileCollectedHistoryArchives({captureDir,outputDir,protectionDir,write:process.argv.includes('--write')}));if(result?.reason==='artifact_writer_busy')throw Error('HISTORY_WRITER_BUSY');}
