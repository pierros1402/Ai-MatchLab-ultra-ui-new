// Downstream research projection only. No new data readers for prediction.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readResearchRecord,projectResearchRecord,validateResearchRecord} from './autonomous-research-journal.js';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const key=p=>[p.canonicalMatchId,p.market,p.pick].join('|');
const marketKey=p=>[p.canonicalMatchId,p.market].join('|');
const terminal=new Set(['WIN','LOSS','VOID']);
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
export function composeResearchDay(day,observations,now){
 if(!validDate(day)||!Number.isFinite(Date.parse(now))||!Array.isArray(observations))throw Error('invalid_research_day');
 const bySelection=new Map(),seen=new Set(),conflicts=[],records=[],evaluations=new Map(),universeSignatures=new Set();
 for(const item of observations){
  const r=validateResearchRecord(item.record),p=item.projection;
  if(r.date!==day||Date.parse(r.generatedAt)>Date.parse(now)||seen.has(r.recordSha256))throw Error('invalid_observation_set');
  seen.add(r.recordSha256);
  universeSignatures.add(hash(r.ledger.map(x=>x.id).sort()));
  for(const row of r.ledger){const old=evaluations.get(row.id);if(!old||row.status==='EVALUATED'||old.status!=='EVALUATED'&&r.generatedAt>old.observedAt)evaluations.set(row.id,{...row,observedAt:r.generatedAt});}
  if(p?.date!==day||p.recordSha256!==r.recordSha256||p.status!=='RESEARCH_ONLY'||p.publicationAuthorized!==false||!Array.isArray(p.rows)||p.rows.length!==r.picks.length)throw Error('invalid_observation_projection');
  const committed=Date.parse(p.timing?.committedAt),proven=p.timing?.status==='ORIGINAL_COMMITTED_BYTES_VERIFIED'&&Number.isFinite(committed)&&committed>=Date.parse(r.generatedAt)&&committed<=Date.parse(now);
  records.push({signature:r.recordSha256,generatedAt:r.generatedAt,committedAt:proven?p.timing.committedAt:null,...(r.commonDecisionAt!==undefined?{commonDecisionAt:r.commonDecisionAt,decisionSkewMs:r.decisionSkewMs}:{})});
  r.picks.forEach((pick,i)=>{
   const row=p.rows[i],k=key(pick),expected=[r.recordSha256,'AUTONOMOUS_RESEARCH',k].join('|');
   if(row.key!==expected||!['PENDING','WIN','LOSS','VOID'].includes(row.result))throw Error('settlement_identity_mismatch');
   const certified=proven&&committed<Date.parse(pick.kickoffUtc);
   if(terminal.has(row.result)&&(!certified||!row.truth))throw Error('settlement_without_evidence');
   const candidate={pick,row,record:r,certified,committed};
   const list=bySelection.get(k)||[];list.push(candidate);bySelection.set(k,list);
  });
 }
 const byMarket=new Map();for(const [k,list] of bySelection){const m=marketKey(list[0].pick);const keys=byMarket.get(m)||[];keys.push(k);byMarket.set(m,keys);}
 const picks=[];
 for(const [k,list] of bySelection){
  if(byMarket.get(marketKey(list[0].pick)).length!==1){conflicts.push({key:k,reason:'OPPOSING_SELECTIONS'});continue;}
  if(new Set(list.map(x=>x.pick.kickoffUtc)).size!==1){conflicts.push({key:k,reason:'KICKOFF_CONFLICT'});continue;}
  list.sort((a,b)=>Date.parse(a.record.generatedAt)-Date.parse(b.record.generatedAt)||a.record.recordSha256.localeCompare(b.record.recordSha256));
  const first=list[0];const settled=list.filter(x=>terminal.has(x.row.result));
  if(new Set(settled.map(x=>hash({result:x.row.result,truth:x.row.truth}))).size>1){conflicts.push({key:k,reason:'SETTLEMENT_CONFLICT'});continue;}
  // A later observation cannot overwrite the first selected probability.
  // A settlement is used only if it belongs to that exact selected record.
  const row=first.row,truth=row.truth||null;
  const pick={...first.pick,result:row.result,firstObservedAt:first.record.generatedAt,publicationRecord:first.record.recordSha256,timingCertified:first.certified,settlementTruth:truth};
  if(['WIN','LOSS'].includes(row.result)&&Number.isFinite(truth?.scoreHome)&&Number.isFinite(truth?.scoreAway))pick.finalScore={scoreKey:`${truth.scoreHome}-${truth.scoreAway}`};
  picks.push(pick);
 }
 picks.sort((a,b)=>a.kickoffUtc.localeCompare(b.kickoffUtc)||key(a).localeCompare(key(b)));
 records.sort((a,b)=>a.generatedAt.localeCompare(b.generatedAt)||a.signature.localeCompare(b.signature));conflicts.sort((a,b)=>a.key.localeCompare(b.key));
 const wins=picks.filter(p=>p.result==='WIN').length,losses=picks.filter(p=>p.result==='LOSS').length,voids=picks.filter(p=>p.result==='VOID').length;
 const evaluated=[...evaluations.values()].filter(r=>r.status==='EVALUATED').length,holdReasons={};for(const r of evaluations.values())if(r.status!=='EVALUATED')holdReasons[r.reason]=(holdReasons[r.reason]||0)+1;
 const evaluationCoverage={basis:'UNION_OF_ACTUAL_OBSERVATION_LEDGERS',uniqueFixtures:evaluations.size,evaluated,neverEvaluated:evaluations.size-evaluated,holdReasons:Object.fromEntries(Object.entries(holdReasons).sort()),universeVersions:universeSignatures.size,completeCertified:false};
 const body={schema:'aiml.autonomous-research-daily.v1',id:'plan-autonomous-preview',date:day,status:records.length?'RESEARCH_ONLY':'NOT_AVAILABLE',publicationAuthorized:false,analysisComplete:false,zeroPicksCertified:false,generatedAt:now,count:picks.length,picks,records,conflicts,evaluationCoverage,summary:{picks:picks.length,settled:wins+losses,wins,losses,voids,pending:picks.length-wins-losses-voids,hitRate:wins+losses?wins/(wins+losses):null}};
 return {...body,projectionSha256:hash(body)};
}
export function readResearchDay(root,day,options){
 if(!validDate(day))throw Error('invalid_research_day');
 const dir=path.resolve(root,'data','value-autonomous-research',day,'observations');
 if(!fs.existsSync(dir))return composeResearchDay(day,[],options.now);
 if(fs.realpathSync(dir)!==path.resolve(fs.realpathSync(root),'data','value-autonomous-research',day,'observations'))throw Error('research_directory_escape');
 const files=fs.readdirSync(dir).filter(f=>f.endsWith('.json')).sort();
 return composeResearchDay(day,files.map(f=>{const file=path.join(dir,f);return {record:readResearchRecord(root,file),projection:projectResearchRecord(root,file,options)};}),options.now);
}
export function attachResearchPreview(comparison,projection){
 if(comparison?.ok!==true||comparison.date!==projection?.date||!comparison.unifiedPlan||projection?.schema!=='aiml.autonomous-research-daily.v1'||projection.publicationAuthorized!==false)throw Error('invalid_research_comparison');
 const {projectionSha256,...body}=projection;
 if(hash(body)!==projectionSha256||!Array.isArray(body.picks)||body.count!==body.picks.length||body.analysisComplete!==false||body.zeroPicksCertified!==false||!['RESEARCH_ONLY','NOT_AVAILABLE'].includes(body.status))throw Error('invalid_research_projection');
 return {...comparison,autonomousPreviewMode:true,autonomousPreview:structuredClone(projection)};
}
