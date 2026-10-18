import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {athensDayKey,shiftDay} from '../core/daykey.js';
import {resolveDataPath,getProjectRoot} from '../storage/data-root.js';
import {canonicalFixturesForDay} from '../core/day-fixture-universe.js';
import {buildValueDay} from '../core/build-value-day.js';
import {deriveValueFromOdds} from './derive-value-from-odds.js';
import {buildValueCoverageReportDay} from './build-value-coverage-report-day.js';
import {auditDetailsFoundationDay} from './audit-details-foundation-day.js';
import {buildValueDataReadinessDay} from './build-value-data-readiness-day.js';
import {buildUnifiedShadow,signature,digest,specSha256,selectionKey} from '../value/unified-shadow.js';
import {projectUnifiedProduction,validateProductionProjection} from '../value/unified-production-journal.js';
import {loadFinalResults,evaluatePickResult} from './build-value-settlement-from-final-results-day.js';
import {isValueSettlementVoidState} from '../core/non-played-state.js';
import {checkpointHistoryIfRequired,writeHistoryJsonAtomic} from '../storage/history-preservation.js';
function read(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
function write(file,body){writeHistoryJsonAtomic(file,body);}
function proof(file){
 try{
  const cwd=getProjectRoot(),relative=path.relative(cwd,file).replaceAll('\\','/');
  const git=args=>execFileSync('git',args,{cwd,encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024});
  const commits=git(['log','--diff-filter=A','--format=%H','--',relative]).trim().split('\n').filter(Boolean);
  if(commits.length!==1||digest(Buffer.from(git(['show',`${commits[0]}:${relative}`])))!==digest(fs.readFileSync(file)))return {status:'UNPROVEN'};
  return {status:'ORIGINAL_COMMITTED_BYTES_VERIFIED',commit:commits[0],committedAt:git(['show','-s','--format=%cI',commits[0]]).trim()};
 }catch{return {status:'UNPROVEN'};}
}
export function productionResults(record,timing,finals,now){
 const observation=record.observation,byId=new Map();
 for(const final of finals.rows)byId.set(final.matchId,[...(byId.get(final.matchId)||[]),final]);
 const rows=observation.picks.map(p=>{
  const kickoff=Date.parse(p.kickoffUtc),key=[observation.observationSignature,'U1',selectionKey(p)].join('|');
  let row={key,date:record.date,group:'U1',result:'PENDING',truth:null};
  if(timing.status!=='ORIGINAL_COMMITTED_BYTES_VERIFIED'||!Number.isFinite(Date.parse(timing.committedAt))||Date.parse(timing.committedAt)>=kickoff||Date.parse(now)<kickoff)return row;
  const fixture=finals.canonicalById.get(p.canonicalMatchId);
  if(finals.canonicalIdentityAmbiguities.includes(p.canonicalMatchId)||fixture&&Date.parse(fixture.kickoffUtc)!==kickoff)return row;
  const candidates=(byId.get(p.canonicalMatchId)||[]).filter(f=>f.date===record.date);
  if(candidates.length===1){
   const truth=candidates[0],raw=fs.readFileSync(truth.path),body=JSON.parse(raw.toString('utf8'));
   const truthAt=Date.parse(body.verification?.generatedAt??body.generatedAt);
   if(Date.parse(body.kickoffUtc)!==kickoff||Number.isFinite(truthAt)&&truthAt>Date.parse(now))return row;
   const won=evaluatePickResult(p,truth);
   if(typeof won==='boolean')row={...row,result:won?'WIN':'LOSS',truth:{path:path.relative(getProjectRoot(),truth.path).replaceAll('\\','/'),sha256:digest(raw),matchId:truth.matchId,date:truth.date,scoreHome:truth.homeScore,scoreAway:truth.awayScore}};
  }else if(candidates.length===0&&fixture&&isValueSettlementVoidState(fixture))row={...row,result:'VOID',truth:{canonicalId:p.canonicalMatchId,status:fixture.status,kickoffUtc:p.kickoffUtc}};
  return row;
 });
 const body={schema:'ai-matchlab.unified-shadow-results.v1',date:record.date,candidateId:observation.candidateId,specSha256,
  observations:[{date:record.date,signature:observation.observationSignature,timing}],rows,conflicts:[]};
 return {...body,reportSignature:signature(body)};
}
export async function buildUnifiedProductionDay(day,{capture=true,nowFn=()=>new Date().toISOString(),dependencies={}}={}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||day<'2026-10-18')throw Error('invalid_unified_production_day');
 const today=athensDayKey(new Date(nowFn()));
 if(capture&&(day<today||day>shiftDay(today,1)))throw Error('unified_capture_outside_prospective_window');
 if(capture&&(dependencies.detailsAudit||auditDetailsFoundationDay)(day).ok!==true)throw Error('production_details_foundation_not_verified');
 const root=dependencies.root||resolveDataPath('value-unified',day),observations=path.join(root,'observations');
 fs.mkdirSync(observations,{recursive:true});
 let readiness=null;
 if(capture){
  const runId=crypto.randomUUID(),scratch=path.join(root,'scratch',runId);fs.mkdirSync(scratch,{recursive:true});
  let captured=false;
  try{
   for(const [key,adjusted] of [['A',false],['A2',true]])await (dependencies.buildA||buildValueDay)(day,{rebuild:true,prospectiveOnly:true,opponentAdjusted:adjusted,
    outputPath:path.join(scratch,`plan-${key.toLowerCase()}.json`),auditPath:path.join(scratch,`plan-${key.toLowerCase()}-audit.json`)});
   for(const mode of ['plan-b-observation','plan-b2-observation'])(dependencies.buildB||deriveValueFromOdds)(day,{outputMode:mode,publicationRunId:runId,scratchPath:scratch});
   await (dependencies.coverage||buildValueCoverageReportDay)(day);
   readiness=(dependencies.readiness||buildValueDataReadinessDay)(day,{write:true});
   const sources={},plans={},inputFiles=[];
   for(const key of ['A','A2','B','B2']){
    const load=name=>{const file=path.join(scratch,name),raw=fs.readFileSync(file);inputFiles.push({path:path.relative(getProjectRoot(),file).replaceAll('\\','/'),sha256:digest(raw),bytes:raw.length,rawUtf8:raw.toString('utf8')});return JSON.parse(raw);};
    sources[key]={plan:load(`plan-${key.toLowerCase()}.json`),audit:load(`plan-${key.toLowerCase()}-audit.json`)};
    if(key==='A')sources[key].producerAudit=sources[key].audit;
    plans[key]=sources[key].plan;
   }
   const fixtures=(dependencies.fixtures||canonicalFixturesForDay)(day),now=nowFn();
   const fixtureBytes=Buffer.from(JSON.stringify(fixtures));inputFiles.push({path:'canonical-fixture-read-view.json',sha256:digest(fixtureBytes),bytes:fixtureBytes.length,rawUtf8:fixtureBytes.toString('utf8')});
   const totalBytes=inputFiles.reduce((sum,file)=>sum+file.bytes,0);if(totalBytes>32*1024*1024)throw Error('production_input_capture_size_exceeded');
   const observation=buildUnifiedShadow({day,now,sources,fixtures,inputFiles,run:{runId:process.env.GITHUB_RUN_ID||null}});
   const semanticHash=signature({picks:observation.picks.map(p=>({id:p.canonicalMatchId,market:p.market,pick:p.pick,kickoff:p.kickoffUtc,scores:p.sourceScores})),inputs:readiness.rows.map(r=>({id:r.canonicalId,status:r.status,reasons:r.reasons}))});
   const existing=fs.readdirSync(observations).filter(f=>f.endsWith('.json')).map(f=>read(path.join(observations,f)));
   if(!existing.some(record=>record.semanticHash===semanticHash)){
    const body={schema:'ai-matchlab.unified-production-record.v1',date:day,semanticHash,captureCodeSha256:digest(fs.readFileSync(fileURLToPath(import.meta.url))),observation,plans,readiness};
    JSON.stringify(body,(key,item)=>{
      if(/^(?:api[_-]?key|authorization|password|credentials?|secrets?|access[_-]?token|cookies?)$/i.test(key)&&item!=null&&item!=='')throw Error('credential_field_in_production_evidence');
      if(typeof item==='string'&&/[?&](?:api[_-]?key|access_token)=/i.test(item))throw Error('credential_query_in_production_evidence');
      return item;
    });
    const record={...body,recordSignature:signature(body)};
    const recordFile=path.join(observations,record.recordSignature+'.json');if(fs.existsSync(recordFile))throw Error('production_record_collision');write(recordFile,record);captured=true;
   }
  }catch(error){
   const candidates=[];
   for(const name of fs.readdirSync(scratch).filter(name=>/^plan-[a-z0-9-]+\.json$/.test(name))){
    const raw=fs.readFileSync(path.join(scratch,name));
    const entry={name,bytes:raw.length,sha256:digest(raw)};
    try{const body=JSON.parse(raw);let secret=false;JSON.stringify(body,(key,item)=>{if(/api[_-]?key|authorization|password|credentials?|secrets?|access[_-]?token|cookies?/i.test(key))secret=true;return item;});if(!secret)entry.payload=body;}catch{}
    candidates.push(entry);
   }
   write(path.join(root,'failures',runId+'.json'),{schema:'ai-matchlab.unified-production-failure.v1',date:day,reason:'PRODUCTION_CAPTURE_FAILED',candidates});
   (dependencies.checkpoint||checkpointHistoryIfRequired)(day,'unified-production-capture-failed');
   throw error;
  }finally{
   const real=fs.realpathSync(scratch),expected=path.resolve(root,'scratch',runId);
   if(real.toLowerCase()!==expected.toLowerCase()||!expected.startsWith(path.resolve(root,'scratch')+path.sep))throw Error('unified_scratch_cleanup_boundary');
   fs.rmSync(scratch,{recursive:true,force:false});
  }
  if(captured)(dependencies.checkpoint||checkpointHistoryIfRequired)(day,'unified-production-record-captured');
 }
 return refreshUnifiedProductionProjection(day,{readiness,nowFn,dependencies});
}
export function refreshUnifiedProductionProjection(day,{readiness=null,nowFn=()=>new Date().toISOString(),dependencies={}}={}){
 const root=dependencies.root||resolveDataPath('value-unified',day),observations=path.join(root,'observations');
 if(!fs.existsSync(observations))return {status:'NO_PRODUCTION_RECORDS',date:day};
 const files=fs.readdirSync(observations).filter(f=>f.endsWith('.json')).sort();
 if(!files.length)return {status:'NO_PRODUCTION_RECORDS',date:day};
 const records=files.map(f=>read(path.join(observations,f)));
 readiness ||= [...records].sort((a,b)=>a.observation.generatedAt.localeCompare(b.observation.generatedAt)).at(-1).readiness;
 const finals=(dependencies.finals||loadFinalResults)(day),resultsByRecord={};
 for(let i=0;i<records.length;i++)resultsByRecord[records[i].recordSignature]=productionResults(records[i],(dependencies.proof||proof)(path.join(observations,files[i])),finals,nowFn());
 let plan=projectUnifiedProduction(day,records,{now:nowFn(),readiness,resultsByRecord});
 const previousFile=path.join(root,'public-plan.json');
 const comparisonFile=resolveDataPath('value-comparison',`${day}.json`);
 const priorPlans=[];
 for(const file of [previousFile,comparisonFile]){
  if(!fs.existsSync(file))continue;
  try{const body=read(file),candidate=file===comparisonFile?body.unifiedPlan:body;if(candidate?.policyId==='unified-public-u1-incremental-v1')priorPlans.push(validateProductionProjection(candidate,day));}
  catch{plan.conflicts.push({reason:'invalid_projection_cache_rebuilt_from_immutable_records'});}
 }
 if(priorPlans.length){
  const prior=new Map(priorPlans.flatMap(p=>p.picks||[]).filter(p=>['WIN','LOSS','VOID'].includes(p.result)).map(p=>[selectionKey(p),p]));
  for(const row of plan.picks){const old=prior.get(selectionKey(row));if(old&&['WIN','LOSS','VOID'].includes(old.result)&&signature({result:old.result,truth:old.settlementTruth})!==signature({result:row.result,truth:row.settlementTruth})){
   plan.conflicts.push({key:selectionKey(row),reason:'settlement_truth_changed_existing_result_preserved'});Object.assign(row,{result:old.result,finalScore:old.finalScore,settlementTruth:old.settlementTruth});
  }}
  const wins=plan.picks.filter(p=>p.result==='WIN').length,losses=plan.picks.filter(p=>p.result==='LOSS').length;
  Object.assign(plan.summary,{wins,losses,settled:wins+losses,voids:plan.picks.filter(p=>p.result==='VOID').length,unresolved:plan.picks.filter(p=>!['WIN','LOSS','VOID'].includes(p.result)).length,hitRate:wins+losses?wins/(wins+losses):null});
 }
 const material=body=>{const {generatedAt,projectionSignature,...rest}=body;return signature(rest);};
 const oldProjection=priorPlans[0];
 if(oldProjection&&material(oldProjection)===material(plan))plan.generatedAt=oldProjection.generatedAt;
 plan.projectionSignature=signature(plan);
 write(previousFile,plan);return {status:plan.status,date:day,count:plan.count,analysisComplete:plan.analysisComplete,records:records.length};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const day=process.argv[2],capture=!process.argv.includes('--settle-only');
 console.log(JSON.stringify(await buildUnifiedProductionDay(day,{capture})));
}
