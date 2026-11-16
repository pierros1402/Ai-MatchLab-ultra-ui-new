import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {verifyAutonomousPreview,POLICY,eligibleResearchMarkets} from './autonomous-preview.js';
import {exactCheckoutBytes} from './unified-committed-record-proof.js';
import {validateBoundaryEvidence} from '../core/autonomous-value-boundary-evidence.js';
import {verifyExistingBoundaryReceipts} from './autonomous-boundary-receipts.js';
import {auditCommonSources,validateCommonSourceRefs} from './autonomous-common-source-audit.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
const key=p=>[p.canonicalMatchId,p.market,p.pick].join('|');
const validDay=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
export function validateResearchRecord(record){
 verifyAutonomousPreview(record);
 if(record.id!=='plan-autonomous-preview'||!validDay(record.date)||!Number.isFinite(Date.parse(record.generatedAt))||JSON.stringify(record.policy)!==JSON.stringify(POLICY)||!Array.isArray(record.picks)||record.count!==record.picks.length||!Array.isArray(record.ledger))throw Error('invalid_research_record');
 if(record.commonDecisionAt!==undefined&&(!Number.isFinite(Date.parse(record.commonDecisionAt))||Date.parse(record.commonDecisionAt)>Date.parse(record.generatedAt)||record.decisionSkewMs!==Date.parse(record.generatedAt)-Date.parse(record.commonDecisionAt)))throw Error('invalid_research_clock_reference');
 if(Object.hasOwn(record,'commonSourceRefs')){validateCommonSourceRefs(record.commonSourceRefs);if(!record.commonDecisionAt)throw Error('common_source_clock_missing');}
 const ids=new Set(),ledger=new Map(),expected=new Map();for(const r of record.ledger){
  if(typeof r.id!=='string'||!r.id||ledger.has(r.id)||!['HOLD','EVALUATED'].includes(r.status))throw Error('invalid_research_ledger');ledger.set(r.id,r);
  if(r.status==='EVALUATED'){
   if(!/^[a-f0-9]{64}$/.test(r.inputDigest||''))throw Error('invalid_research_ledger_digest');
   if(r.boundaryEvidence)validateBoundaryEvidence(r.boundaryEvidence,{id:r.id,inputDigest:r.inputDigest,probabilities:r.probabilities,recordGeneratedAt:record.generatedAt});
   const eligible=eligibleResearchMarkets(r.probabilities);if(r.accepted!==eligible.length)throw Error('invalid_research_ledger_count');
   for(const [market,pick,p] of eligible)expected.set([r.id,market,pick].join('|'),p);
  }else if(typeof r.reason!=='string'||!r.reason||Object.hasOwn(r,'boundaryEvidence'))throw Error('invalid_research_hold');
 }
 for(const p of record.picks){const k=key(p),l=ledger.get(p.canonicalMatchId);if(p.researchOnly!==true||p.result!=='PENDING'||p.matchId!==p.canonicalMatchId||!l||l.status!=='EVALUATED'||l.inputDigest!==p.inputDigest||(l.boundaryEvidence&&Date.parse(l.boundaryEvidence.kickoffUtc)!==Date.parse(p.kickoffUtc))||!Number.isFinite(Date.parse(p.kickoffUtc))||Date.parse(p.kickoffUtc)<=Date.parse(record.generatedAt)+60000||!Number.isFinite(p.modelProb)||p.modelProb<0||p.modelProb>1||!['OU25|over','BTTS|yes','1X2|home','1X2|away'].includes(p.market+'|'+p.pick)||ids.has(k)||p.band!=='HIGH'||!expected.has(k)||expected.get(k)!==p.modelProb)throw Error('invalid_research_pick');ids.add(k);}
 if(ids.size!==expected.size)throw Error('research_candidate_set_incomplete');
 return record;
}
export function archiveResearchRecord(root,record){
 validateResearchRecord(record);const boundaryReceipts=verifyExistingBoundaryReceipts(root,record);const commonSourceAudit=auditCommonSources(root,record);const bytes=Buffer.from(JSON.stringify(record,null,2)+'\n');const digest=hash(bytes);const dir=path.resolve(root,'data','value-autonomous-research',record.date,'observations');fs.mkdirSync(dir,{recursive:true});if(fs.realpathSync(dir)!==path.resolve(fs.realpathSync(root),'data','value-autonomous-research',record.date,'observations'))throw Error('research_directory_escape');const file=path.join(dir,digest+'.json');const tmp=path.join(dir,'.tmp-'+randomUUID());
 try{fs.writeFileSync(tmp,bytes,{flag:'wx'});const fd=fs.openSync(tmp,'r+');try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)};try{fs.linkSync(tmp,file)}catch(e){if(e.code!=='EEXIST')throw e;if(fs.lstatSync(file).isSymbolicLink()||!fs.readFileSync(file).equals(bytes))throw Error('immutable_research_conflict');}}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp)}
 return {file,sha256:digest,...(boundaryReceipts.verified||boundaryReceipts.unavailable?{boundaryReceipts}:{}),...(record.commonSourceRefs?{commonSourceAudit}:{})};
}
export function readResearchRecord(root,file){const relative=path.relative(root,file).replaceAll('\\','/');const m=/^data\/value-autonomous-research\/(\d{4}-\d{2}-\d{2})\/observations\/([a-f0-9]{64})\.json$/.exec(relative);if(!m||fs.realpathSync(file)!==path.resolve(fs.realpathSync(root),relative))throw Error('invalid_research_path');const raw=fs.readFileSync(file);const r=validateResearchRecord(JSON.parse(raw));const lf=Buffer.from(raw.toString('utf8').replace(/\r\n/g,'\n'));if(r.date!==m[1]||(hash(raw)!==m[2]&&(!exactCheckoutBytes(raw,lf)||hash(lf)!==m[2])))throw Error('research_bytes_mismatch');return r;}
export function proveResearchCommit(root,file){try{readResearchRecord(root,file);const rel=path.relative(root,file).replaceAll('\\','/');const git=args=>execFileSync('git',args,{cwd:root,stdio:['ignore','pipe','pipe'],timeout:20000,maxBuffer:64*1024*1024,env:{...process.env,GIT_OPTIONAL_LOCKS:'0',GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0'}});const head=git(['rev-parse','HEAD']).toString().trim();const adds=git(['log','--diff-filter=A','--format=%H',head,'--',rel]).toString().trim().split(/\r?\n/).filter(Boolean);if(adds.length!==1)throw Error('ambiguous');const original=git(['show',adds[0]+':'+rel]);if(!original.equals(git(['show',head+':'+rel]))||!exactCheckoutBytes(fs.readFileSync(file),original))throw Error('different');const committedAt=git(['show','-s','--format=%cI',adds[0]]).toString().trim();if(!Number.isFinite(Date.parse(committedAt))||git(['rev-parse','HEAD']).toString().trim()!==head)throw Error('unproven');return {status:'ORIGINAL_COMMITTED_BYTES_VERIFIED',commit:adds[0],committedAt};}catch{return {status:'UNPROVEN'}}}
// Reuses existing production settlement computation, but never publishes or alters A.
export function projectResearchRecord(root,file,{finals,now,productionResults}){const r=readResearchRecord(root,file);const timing=proveResearchCommit(root,file);const report=productionResults({date:r.date,observation:{candidateId:r.id,observationSignature:r.recordSha256,picks:r.picks}},timing,finals,now);const rows=report.rows.map(row=>({...row,key:typeof row.key==='string'?row.key.replace('|U1|','|AUTONOMOUS_RESEARCH|'):row.key,group:'AUTONOMOUS_RESEARCH'}));const wins=rows.filter(x=>x.result==='WIN').length,losses=rows.filter(x=>x.result==='LOSS').length,voids=rows.filter(x=>x.result==='VOID').length;return {status:'RESEARCH_ONLY',publicationAuthorized:false,date:r.date,recordSha256:r.recordSha256,timing,rows,summary:{picks:rows.length,wins,losses,voids,pending:rows.length-wins-losses-voids,hitRate:wins+losses?wins/(wins+losses):null}};}
