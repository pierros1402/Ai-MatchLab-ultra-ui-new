import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {getDataRoot} from '../storage/data-root.js';
import {writeHistoryJsonAtomic,checkpointHistoryIfRequired} from '../storage/history-preservation.js';
import {loadFinalResults,evaluatePickResult} from './build-value-settlement-from-final-results-day.js';
import {isValueSettlementVoidState} from '../core/non-played-state.js';
import {athensDayKey,shiftDay} from '../core/daykey.js';
import {unifiedSpec,specSha256,digest,signature,prospectiveDay,buildUnifiedShadow,
  validateUnifiedShadow,selectionKey,assertUnified,selectorSourceSha256} from '../value/unified-shadow.js';

const schemaResults='ai-matchlab.unified-shadow-results.v1';
const observationName=`${unifiedSpec.candidateId}.json`;
const resultsName=`${unifiedSpec.candidateId}-results.json`;
const incidentsName=`${unifiedSpec.candidateId}-incidents`;
const selectorCodeSha256=selectorSourceSha256;
const captureCodeSha256=digest(fs.readFileSync(fileURLToPath(import.meta.url),'utf8').replace(/\r\n?/gu,'\n'));
assertUnified(captureCodeSha256===unifiedSpec.code?.captureSha256,'unified_pinned_capture_code_mismatch');
function read(file) {
  assertUnified(!fs.lstatSync(file).isSymbolicLink(),'unified_source_symlink');
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
function writeOnce(file,value) {
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temporary=`${file}.tmp-${crypto.randomUUID()}`;
  const fd=fs.openSync(temporary,'wx');
  try {fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
  try {
    // An atomic exclusive link, never replacement of an earlier forecast.
    fs.linkSync(temporary,file);
    if (process.platform!=='win32') {const dir=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}}
    return value;
  } catch(error) {if(error.code==='EEXIST')return validateUnifiedShadow(read(file));throw error;}
  finally {fs.unlinkSync(temporary);}
}
function runIdentity() {
  return {runId:/^\d+$/u.test(process.env.GITHUB_RUN_ID||'')?process.env.GITHUB_RUN_ID:null,
    attempt:/^\d+$/u.test(process.env.GITHUB_RUN_ATTEMPT||'')?process.env.GITHUB_RUN_ATTEMPT:null,
    workflowHead:/^[a-f0-9]{40}$/u.test(process.env.GITHUB_SHA||'')?process.env.GITHUB_SHA:null};
}
function checkCredentialFields(value) {
  JSON.stringify(value,(key,item)=>{
    assertUnified(!(/^(?:api[_-]?key|authorization|password|credentials?|secrets?|access[_-]?token|cookies?)$/iu.test(key)&&item!=null&&item!==''),'unified_credential_field_in_source');
    assertUnified(!(typeof item==='string'&&/[?&](?:api[_-]?key|access_token)=/iu.test(item)),'unified_credential_query_in_source');
    return item;
  });
}
export function captureUnifiedShadow(day,{dataRoot=getDataRoot(),now=new Date().toISOString(),checkpoint=checkpointHistoryIfRequired}={}) {
  if(!prospectiveDay(day,now))return {status:'SKIPPED_OUTSIDE_PROSPECTIVE_WINDOW',date:day};
  const dir=path.join(dataRoot,'value-plans',day),file=path.join(dir,observationName);
  if(fs.existsSync(file)) {
    const existing=validateUnifiedShadow(read(file));
    assertUnified(existing.date===day,'unified_existing_date_mismatch');
    return {status:'FROZEN_OBSERVATION_PRESERVED',date:day,count:existing.count};
  }
  const inputFiles=[];
  let bytes=0;
  const source=relative=>{
    const full=path.join(dataRoot,...relative.split('/'));
    const raw=fs.readFileSync(full);bytes+=raw.length;
    assertUnified(bytes<=32*1024*1024,'unified_input_capture_size_exceeded');
    assertUnified(!fs.lstatSync(full).isSymbolicLink(),'unified_source_symlink');
    const rawUtf8=raw.toString('utf8');
    assertUnified(digest(Buffer.from(rawUtf8,'utf8'))===digest(raw),'unified_source_not_utf8');
    const body=JSON.parse(rawUtf8);checkCredentialFields(body);
    inputFiles.push({path:'data/'+relative,sha256:digest(raw),bytes:raw.length,rawUtf8});
    return body;
  };
  const sources={};
  for(const plan of ['A','A2','B','B2']) {
    const name=plan.toLowerCase();
    sources[plan]={plan:source(`value-plans/${day}/plan-${name}.json`),audit:source(`value-plans/${day}/plan-${name}-audit.json`)};
    if(plan==='A')sources[plan].producerAudit=source(`value/_audit/${day}.json`);
  }
  const canonicalDir=path.join(dataRoot,'canonical-fixtures',day);
  const files=fs.readdirSync(canonicalDir).filter(f=>f.endsWith('.json')).sort();
  assertUnified(files.length>0,'unified_canonical_input_files_missing');
  const fixtures=[];
  for(const file of files) {
    const body=source(`canonical-fixtures/${day}/${file}`);
    const rows=Array.isArray(body)?body:body.fixtures;
    assertUnified(Array.isArray(rows),'unified_canonical_input_invalid');fixtures.push(...rows);
  }
  const observation=buildUnifiedShadow({day,now,sources,fixtures,inputFiles,run:runIdentity()});
  observation.selectorCodeSha256=selectorCodeSha256;
  observation.captureCodeSha256=captureCodeSha256;
  const {observationSignature,...body}=observation;observation.observationSignature=signature(body);
  const stored=writeOnce(file,observation);
  checkpoint(day,'unified-shadow-captured');
  return {status:'CAPTURED',date:day,count:stored.count,selectionStatus:stored.selectionStatus,upstreamCoverage:stored.upstreamCoverage};
}

function committedProof(root,file) {
  const relative=path.relative(root,file).replaceAll('\\','/');
  const git=args=>spawnSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:64*1024*1024});
  const history=git(['log','--diff-filter=A','--format=%H','--',relative]);
  if(history.status!==0)return {status:'GIT_HISTORY_UNAVAILABLE'};
  const commits=history.stdout.trim().split('\n').filter(Boolean);
  if(commits.length!==1)return {status:'ORIGINAL_COMMIT_NOT_UNIQUE_OR_NOT_YET_PUBLISHED'};
  const commit=commits[0],content=git(['show',`${commit}:${relative}`]),time=git(['show','-s','--format=%cI',commit]);
  if(content.status!==0||time.status!==0||digest(Buffer.from(content.stdout,'utf8'))!==digest(fs.readFileSync(file)))return {status:'ORIGINAL_COMMITTED_BYTES_DO_NOT_MATCH'};
  return {status:'ORIGINAL_COMMITTED_BYTES_VERIFIED',commit,committedAt:time.stdout.trim()};
}
function validateResults(value) {
  const {reportSignature,...body}=value;
  assertUnified(value.schema===schemaResults&&value.specSha256===specSha256&&signature(body)===reportSignature,'unified_previous_results_invalid');
  return value;
}
export function refreshUnifiedShadowResults(day,{dataRoot=getDataRoot(),now=new Date().toISOString(),proof=committedProof}={}) {
  if(!prospectiveDay(day,now))return {status:'SKIPPED_OUTSIDE_PROSPECTIVE_WINDOW'};
  const plansRoot=path.join(dataRoot,'value-plans');
  if(!fs.existsSync(plansRoot))return {status:'NO_OBSERVATIONS_YET'};
  const days=fs.readdirSync(plansRoot).filter(d=>/^\d{4}-\d{2}-\d{2}$/u.test(d)&&d>=unifiedSpec.earliestTargetDay).sort();
  let previous=null;
  for(const d of days) {
    const f=path.join(plansRoot,d,resultsName);
    if(!fs.existsSync(f))continue;
    const value=validateResults(read(f));
    if(Date.parse(value.generatedAt)<=Date.parse(now)&&(!previous||value.generatedAt>previous.generatedAt))previous=value;
  }
  const previousRows=new Map((previous?.rows||[]).map(r=>[r.key,r]));
  const rows=[],observations=[],conflicts=[];
  for(const d of days) {
    const file=path.join(plansRoot,d,observationName);if(!fs.existsSync(file))continue;
    const o=validateUnifiedShadow(read(file));
    assertUnified(o.date===d&&o.date>=unifiedSpec.earliestTargetDay,'unified_observation_day_mismatch');
    if(Date.parse(o.generatedAt)>Date.parse(now))continue;
    const timing=proof(path.dirname(dataRoot),file);
    observations.push({date:d,signature:o.observationSignature,upstreamCoverage:o.upstreamCoverage,count:o.count,
      selectorCodeSha256:o.selectorCodeSha256,captureCodeSha256:o.captureCodeSha256,timing});
    const finals=loadFinalResults(d,{finalResultsDir:path.join(dataRoot,'final-results',d),canonicalFixturesDir:path.join(dataRoot,'canonical-fixtures',d)});
    const byId=new Map();
    for(const result of finals.rows)byId.set(result.matchId,[...(byId.get(result.matchId)||[]),result]);
    for(const [group,picks] of Object.entries({U1:o.picks,...o.baselineSelections}))for(const p of picks) {
      const key=[o.observationSignature,group,selectionKey(p)].join('|'),kickoff=Date.parse(p.kickoffUtc);
      let row={key,date:d,group,canonicalMatchId:p.canonicalMatchId,market:p.market,pick:p.pick,upstreamCoverage:o.upstreamCoverage,
        result:'PENDING',reason:'EXACT_VERIFIED_FINAL_NOT_AVAILABLE',truth:null};
      if(timing.status!=='ORIGINAL_COMMITTED_BYTES_VERIFIED'||!Number.isFinite(Date.parse(timing.committedAt))||Date.parse(timing.committedAt)>=kickoff)row.reason='PRE_KICKOFF_DURABILITY_NOT_PROVEN';
      else if(Date.parse(now)<kickoff)row.reason='MATCH_NOT_STARTED';
      else {
        const candidates=(byId.get(p.canonicalMatchId)||[]).filter(f=>f.date===d);
        const fixture=finals.canonicalById.get(p.canonicalMatchId);
        const fixtureKo=Date.parse(fixture?.kickoffUtc??fixture?.kickoff??fixture?.startTime);
        const identitySafe=!finals.canonicalIdentityAmbiguities.includes(p.canonicalMatchId)&&
          (!fixture || Number.isFinite(fixtureKo)&&fixtureKo===kickoff);
        if(!identitySafe)row.reason='CANONICAL_IDENTITY_OR_KICKOFF_CONFLICT';
        else if(candidates.length>1)row.reason='AMBIGUOUS_EXACT_FINAL_TRUTH';
        else if(candidates.length===1) {
          const truth=candidates[0],raw=fs.readFileSync(truth.path),body=JSON.parse(raw.toString('utf8'));
          const truthAt=Date.parse(body.verification?.generatedAt??body.generatedAt);
          if(Date.parse(body.kickoffUtc)!==kickoff)row.reason='FINAL_TRUTH_KICKOFF_NOT_BOUND';
          else if(Number.isFinite(truthAt)&&truthAt>Date.parse(now))row.reason='FINAL_TRUTH_TIMESTAMP_IN_THE_FUTURE';
          else {
            const won=evaluatePickResult(p,truth);
            if(typeof won==='boolean')row={...row,result:won?'WIN':'LOSS',reason:'EXACT_VERIFIED_FINAL',truth:{
              path:path.relative(path.dirname(dataRoot),truth.path).replaceAll('\\','/'),sha256:digest(raw),
              matchId:truth.matchId,date:truth.date,scoreHome:truth.homeScore,scoreAway:truth.awayScore}};
          }
        } else if(fixture&&isValueSettlementVoidState(fixture))row={...row,result:'VOID',reason:'EXACT_CANONICAL_NON_PLAYED_STATE',
          truth:{canonicalId:p.canonicalMatchId,status:fixture.status,kickoffUtc:p.kickoffUtc}};
      }
      const old=previousRows.get(key);
      if(old&&['WIN','LOSS','VOID'].includes(old.result)) {
        if(old.result!==row.result || signature(old.truth)!==signature(row.truth))conflicts.push({key,previous:old.result,proposed:row.result,reason:row.reason});
        row=old; // A changed source never silently rewrites a terminal result.
      }
      rows.push(row);
    }
  }
  // Disappearing/corrupt observations cannot shrink an earlier report.
  const rowKeys=new Set(rows.map(r=>r.key));
  assertUnified(rowKeys.size===rows.length,'unified_duplicate_result_row');
  assertUnified([...previousRows.keys()].every(k=>rowKeys.has(k)),'unified_previous_result_row_disappeared');
  const metrics={},metricsByUpstreamCoverage={};
  for(const group of ['U1','A','A2','B','B2']) {
    const groupRows=rows.filter(r=>r.group===group),settled=groupRows.filter(r=>['WIN','LOSS'].includes(r.result));
    const events=new Set(settled.map(r=>r.canonicalMatchId)),dates=new Set(settled.map(r=>r.date));
    metrics[group]={selectedMarkets:groupRows.length,settledMarkets:settled.length,wins:settled.filter(r=>r.result==='WIN').length,
      pending:groupRows.filter(r=>r.result==='PENDING').length,voids:groupRows.filter(r=>r.result==='VOID').length,
      distinctSettledMatches:events.size,distinctSettledTargetDays:dates.size,
      hitRate:settled.length?settled.filter(r=>r.result==='WIN').length/settled.length:null};
    metricsByUpstreamCoverage[group]={};
    for(const quality of [...new Set(groupRows.map(r=>r.upstreamCoverage))]) {
      const groupQuality=groupRows.filter(r=>r.upstreamCoverage===quality),settledQuality=groupQuality.filter(r=>['WIN','LOSS'].includes(r.result));
      metricsByUpstreamCoverage[group][quality]={selectedMarkets:groupQuality.length,settledMarkets:settledQuality.length,
        distinctSettledMatches:new Set(settledQuality.map(r=>r.canonicalMatchId)).size,
        wins:settledQuality.filter(r=>r.result==='WIN').length,
        hitRate:settledQuality.length?settledQuality.filter(r=>r.result==='WIN').length/settledQuality.length:null};
    }
  }
  const candidate=metrics.U1;
  const expectedDays=[],today=athensDayKey(new Date(now));
  for(let d=unifiedSpec.earliestTargetDay;d<=today;d=shiftDay(d,1))expectedDays.push(d);
  const observedDays=new Set(observations.map(o=>o.date));
  const collectionCoverage={expectedThroughAthensToday:expectedDays.length,capturedTargetDays:observedDays.size,
    notCapturedTargetDays:expectedDays.filter(d=>!observedDays.has(d)),
    interpretation:'A missing capture is not a zero-pick result; future target-day captures are listed separately in observations.'};
  const body={schema:schemaResults,candidateId:unifiedSpec.candidateId,specSha256,date:day,observations,rows,metrics,metricsByUpstreamCoverage,conflicts,
    collectionCoverage,
    reviewSampleReached:candidate.distinctSettledMatches>=unifiedSpec.reviewMinimum.distinctSettledMatches&&
      candidate.distinctSettledTargetDays>=unifiedSpec.reviewMinimum.distinctSettledTargetDays,
    automaticPromotion:false,winningParametersCertified:false,fullUpstreamRuntimeLineageCertified:false,
    interpretation:'Conditional selected-market metrics; variants are correlated and denominators differ. Partial input coverage is retained per observation.'};
  const priorComparable=previous?Object.fromEntries(Object.entries(previous).filter(([k])=>!['generatedAt','reportSignature','date'].includes(k))):null;
  const comparable=Object.fromEntries(Object.entries(body).filter(([k])=>k!=='date'));
  if(previous&&previous.date===day&&signature(priorComparable)===signature(comparable))return {status:'RESULTS_UNCHANGED',metrics};
  const output={...body,generatedAt:now};output.reportSignature=signature(output);
  writeHistoryJsonAtomic(path.join(plansRoot,day,resultsName),output);
  return {status:'RESULTS_WRITTEN',metrics,conflictCount:conflicts.length};
}

export function runUnifiedShadowDay(day,{dataRoot=getDataRoot(),now=new Date().toISOString(),checkpoint=checkpointHistoryIfRequired,...options}={}) {
  if(!prospectiveDay(day,now))return {status:'SKIPPED_OUTSIDE_PROSPECTIVE_WINDOW',date:day};
  const incident=(e,status)=>{
    const code=String(e.message||'unified_failed');
    const safeCode=/^unified_[A-Za-z0-9_]+$/u.test(code)?code:'unified_source_unavailable_or_invalid';
    writeHistoryJsonAtomic(path.join(dataRoot,'value-plans',day,incidentsName,`${crypto.randomUUID()}.json`),{
      schema:'ai-matchlab.unified-shadow-incident.v1',date:day,capturedAt:now,run:runIdentity(),
      status,errorCode:safeCode,specSha256});
    checkpoint(day,'unified-shadow-incident-written');
  };
  let capture,error=null;
  try{capture=captureUnifiedShadow(day,{dataRoot,now,checkpoint});}
  catch(e){
    error=e;incident(e,'CAPTURE_FAILED_NOT_A_ZERO_PICK_RESULT');
  }
  let results;
  try{results=refreshUnifiedShadowResults(day,{dataRoot,now,...options});}
  catch(e){incident(e,'SETTLEMENT_FAILED_PREVIOUS_REPORT_RETAINED');throw new Error('unified_settlement_failed_evidence_retained');}
  if(error)throw new Error('unified_capture_failed_evidence_retained');
  if(results.status==='RESULTS_WRITTEN')checkpoint(day,'unified-shadow-results-written');
  return {capture,results};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const arg=process.argv.slice(2).find(a=>a.startsWith('--date='));
    assertUnified(arg,'unified_date_argument_required');
    assertUnified(process.env.HISTORY_PRESERVATION_REQUIRED==='1','unified_cli_requires_durable_checkpoint');
    console.log(JSON.stringify(runUnifiedShadowDay(arg.slice(7))));
  }catch(error){console.error('::error::'+error.message);process.exitCode=1;}
}
