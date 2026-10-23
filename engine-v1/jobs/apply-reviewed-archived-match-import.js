import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {getProjectRoot} from '../storage/data-root.js';
import {writeHistoryJsonAtomic,checkpointHistoryIfRequired} from '../storage/history-preservation.js';
import {prepareArchivedMatchImport} from './prepare-archived-match-import.js';

const allowed=/^data\/(?:canonical-fixtures\/\d{4}-\d{2}-\d{2}\/[a-z0-9_.-]+\.json|final-results\/\d{4}-\d{2}-\d{2}\/cid_[a-zA-Z0-9_]+\.json|value-data-acquisition\/\d{4}-\d{2}-\d{2}\/[a-z0-9_.-]+\.archived-[A-Za-z0-9]{6,16}\.results\.research\.json)$/;

export function applyPreparedArchivedImport(report,{root,writeFn=writeHistoryJsonAtomic,afterWrite}={}) {
  return applyPreparedHistoryEvidence(report,{root,writeFn,afterWrite,authorization:'reviewed_manifest'});
}

// Both callers use the same path boundaries and rollback transaction. Automatic
// policy authorization is explicit and must never masquerade as a reviewed row.
export function applyPreparedHistoryEvidence(report,{root,writeFn=writeHistoryJsonAtomic,afterWrite,authorization}={}) {
  if(!['reviewed_manifest','exact-native-future-team-v1'].includes(authorization))throw Error('HISTORY_EVIDENCE_AUTHORIZATION_REQUIRED');
  const policy=authorization!=='reviewed_manifest';
  if(policy&&(report.authorization!==authorization||report.reviewRequired!==false))throw Error('HISTORY_EVIDENCE_SOURCE_POLICY_REQUIRED');
  if(report?.batch?.ok!==true||report.productionWrites!==0||!Array.isArray(report.batch.files)||!Array.isArray(report.proposals)||!report.batch.files.length||!root)throw Error('UNVERIFIED_ARCHIVED_IMPORT_BATCH');
  const operations=[],seen=new Set();
  for(const entry of report.batch.files){
    const mergeMode=policy?'MERGE_ADDITIVE_ONLY_AFTER_SOURCE_POLICY_VALIDATION':'MERGE_ADDITIVE_ONLY_AFTER_REVIEW';
    const createMode=policy?'CREATE_ONLY_AFTER_SOURCE_POLICY_VALIDATION':'CREATE_ONLY_AFTER_REVIEW';
    if(![mergeMode,createMode].includes(entry.mode))throw Error('ARCHIVED_IMPORT_WRITE_MODE_INVALID');
    if(!allowed.test(entry.path)||entry.path.split('/').some(p=>p==='..'||p==='.')||seen.has(entry.path))throw Error('ARCHIVED_IMPORT_WRITE_SCOPE_INVALID');
    seen.add(entry.path);
    const target=path.resolve(root,entry.path),relative=path.relative(root,target);
    if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('ARCHIVED_IMPORT_ROOT_ESCAPE');
    const exists=fs.existsSync(target),before=exists?fs.readFileSync(target):null;
    let payload=entry.payload;
    if(exists){
      if(entry.mode!==mergeMode)throw Error('ARCHIVED_IMPORT_EXISTING_TRUTH_CONFLICT:'+entry.path);
      const old=JSON.parse(before.toString('utf8'));
      if(!Array.isArray(old.fixtures)||!Array.isArray(payload.fixtures))throw Error('ARCHIVED_IMPORT_CANONICAL_SHAPE_INVALID');
      const ids=new Set(old.fixtures.map(r=>r.canonicalId));
      if(payload.fixtures.some(r=>ids.has(r.canonicalId)))throw Error('ARCHIVED_IMPORT_EXISTING_CANONICAL_CONFLICT');
      payload={...old,fixtures:[...old.fixtures,...payload.fixtures]};
    }
    operations.push({path:entry.path,target,before,payload});
  }
  const applied=[];
  try{
    for(const op of operations){
      // The shared queue serializes repository writers; also detect local drift.
      const current=fs.existsSync(op.target)?fs.readFileSync(op.target):null;
      if(current?.toString('hex')!==op.before?.toString('hex'))throw Error('ARCHIVED_IMPORT_TRUTH_CHANGED_DURING_PREPARATION');
      applied.push(op);writeFn(op.target,op.payload);
    }
    // Durability is part of the transaction for automatic recovery. A failed
    // after-write checkpoint rolls back before any assessment can consume it.
    afterWrite?.();
  }catch(error){
    for(const op of applied.reverse()){
      if(op.before===null){if(fs.existsSync(op.target))fs.unlinkSync(op.target);}
      else fs.writeFileSync(op.target,op.before);
    }
    throw error;
  }
  return {writtenPaths:operations.map(op=>op.path),canonicalAdditions:report.proposals.length,existingPredictionsChanged:false};
}

export function canonicalRowsInCheckout(root){
  const dir=path.join(root,'data','canonical-fixtures');
  if(!fs.existsSync(dir))throw Error('ARCHIVED_IMPORT_CANONICAL_SCAN_REQUIRED');
  const rows=[];
  for(const day of fs.readdirSync(dir).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x)))for(const file of fs.readdirSync(path.join(dir,day)).filter(x=>x.endsWith('.json'))){
    const doc=JSON.parse(fs.readFileSync(path.join(dir,day,file),'utf8'));if(Array.isArray(doc.fixtures))rows.push(...doc.fixtures);
  }
  return rows;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const manifestPath=String(process.env.VALUE_ARCHIVED_IMPORT_MANIFEST||''),expected=String(process.env.VALUE_ARCHIVED_IMPORT_SHA256||'');
  if(!/^data\/value-data-acquisition\/import-review\/[a-zA-Z0-9_-]+\.json$/.test(manifestPath)||!/^[a-f0-9]{64}$/.test(expected))throw Error('EXACT_REVIEWED_MANIFEST_REQUIRED');
  const root=getProjectRoot(),raw=fs.readFileSync(path.join(root,manifestPath));
  // Git may check out CRLF; hash the canonical LF bytes of the reviewed file.
  const normalized=raw.toString('utf8').replace(/\r\n?/g,'\n');
  if(crypto.createHash('sha256').update(normalized).digest('hex')!==expected)throw Error('REVIEWED_MANIFEST_HASH_MISMATCH');
  const write=process.argv.includes('--write');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(process.env.DAY_KEY||''))throw Error('EXACT_IMPORT_EXECUTION_DAY_REQUIRED');
  if(write&&(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REPOSITORY!=='pierros1402/Ai-MatchLab-ultra-ui-new'||process.env.GITHUB_WORKFLOW!=='Autonomous Value data preparation'||process.env.HISTORY_PRESERVATION_REQUIRED!=='1'))throw Error('ARCHIVED_IMPORT_SHARED_WORKFLOW_REQUIRED');
  const report=await prepareArchivedMatchImport(JSON.parse(normalized),{canonicalRows:canonicalRowsInCheckout(root)});
  if(!report.batch.ok)throw Error('ARCHIVED_IMPORT_BATCH_REJECTED:'+report.batch.conflicts.join(','));
  if(write){
    checkpointHistoryIfRequired(process.env.DAY_KEY,'before-reviewed-archived-import');
    const applied=applyPreparedArchivedImport(report,{root});
    const output=path.join(root,'data','value-data-acquisition',process.env.DAY_KEY,'archived-import.report.research.json');
    writeHistoryJsonAtomic(output,{...applied,manifestPath,manifestSha256:expected,generatedAt:new Date().toISOString(),frozenPredictionsRegenerated:false});
    checkpointHistoryIfRequired(process.env.DAY_KEY,'after-reviewed-archived-import');
  }
  console.log(JSON.stringify({ok:true,write,proposedFiles:report.batch.files.length,manifestSha256:expected}));
}
