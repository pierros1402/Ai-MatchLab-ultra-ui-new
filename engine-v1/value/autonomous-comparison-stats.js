// Descriptive A/B research statistics; never a performance certification.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {validateProductionProjection} from './unified-production-journal.js';
import {attachResearchPreview} from './autonomous-research-daily.js';
import {readInternalComparison} from './autonomous-observation-lifecycle.js';
export const researchHash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export const validResearchDay=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
const terminal=new Set(['WIN','LOSS','VOID']);
const key=p=>[p.canonicalMatchId,p.market,p.pick].join('|');
function summarize(rows){
 const wins=rows.filter(p=>p.result==='WIN').length,losses=rows.filter(p=>p.result==='LOSS').length,voids=rows.filter(p=>p.result==='VOID').length;
 return {picks:rows.length,uniqueMatches:new Set(rows.map(p=>p.canonicalMatchId)).size,wins,losses,voids,settled:wins+losses,pending:rows.length-wins-losses-voids,hitRate:wins+losses?wins/(wins+losses):null};
}
function group(rows,fn){const map=new Map();for(const p of rows){const k=fn(p);const g=map.get(k)||[];g.push(p);map.set(k,g)}return Object.fromEntries([...map].sort(([a],[b])=>a.localeCompare(b)).map(([k,ps])=>[k,summarize(ps)]));}
function validateRows(plan,day,isB){
 const seen=new Set();if(!Array.isArray(plan.picks)||plan.count!==plan.picks.length)throw Error('research_count_mismatch');
 for(const p of plan.picks){const k=key(p),kick=Date.parse(p.kickoffUtc);if(typeof p.canonicalMatchId!=='string'||!p.canonicalMatchId||typeof p.market!=='string'||!p.market||typeof p.pick!=='string'||!p.pick||!Number.isFinite(kick)||seen.has(k)||!['WIN','LOSS','VOID','PENDING','UNRESOLVED'].includes(p.result))throw Error('research_invalid_stat_row');seen.add(k);
  if(terminal.has(p.result)&&(!p.settlementTruth||(isB&&p.timingCertified!==true)))throw Error('research_uncertified_result');
  if(isB&&p.researchOnly!==true)throw Error('research_non_preview_row');
 }
 const s=summarize(plan.picks);for(const name of ['picks','wins','losses','voids','settled','hitRate'])if(plan.summary?.[name]!==s[name])throw Error('research_summary_mismatch:'+name);
 if(plan.summary?.[isB?'pending':'unresolved']!==s.pending)throw Error('research_pending_mismatch');
 return plan.picks;
}
export function summarizePairedResearchDay(comparison){
 const {date:day,unifiedPlan:a,autonomousPreview:b}=comparison||{};
 if(!validResearchDay(day)||comparison.publicationAuthorized!==false||comparison.autonomousPreviewMode!==true)throw Error('research_comparison_not_private');
 validateProductionProjection(a,day);attachResearchPreview(comparison,b);
 const ar=validateRows(a,day,false),br=validateRows(b,day,true);
 const as=new Set(ar.map(key)),bs=new Set(br.map(key));
 const firstA=a.records?.map(r=>r.generatedAt).filter(t=>Number.isFinite(Date.parse(t))).sort()[0]??null;
 const firstB=b.records?.map(r=>r.commonDecisionAt).filter(t=>Number.isFinite(Date.parse(t))).sort()[0]??null;
 const commonStartBound=firstA!==null&&firstA===firstB&&b.records.every(r=>Number.isFinite(Date.parse(r.commonDecisionAt)));
 return {date:day,pairedObserved:a.records?.length>0&&b.status==='RESEARCH_ONLY'&&b.records?.length>0,commonStartBound,complete:a.analysisComplete===true&&b.analysisComplete===true,
  A:{...summarize(ar),byMarket:group(ar,p=>p.market),bySelection:group(ar,p=>p.market+'|'+p.pick)},
  B:{...summarize(br),byMarket:group(br,p=>p.market),bySelection:group(br,p=>p.market+'|'+p.pick),timingCertified:br.filter(p=>p.timingCertified===true).length},
  agreement:{common:[...as].filter(k=>bs.has(k)).length,onlyA:[...as].filter(k=>!bs.has(k)).length,onlyB:[...bs].filter(k=>!as.has(k)).length},performanceCertified:false};
}
export function buildPairedResearchCohort({startDay,endDay,comparisons}){
 if(!validResearchDay(startDay)||!validResearchDay(endDay)||startDay>endDay||!Array.isArray(comparisons))throw Error('invalid_cohort_range');
 const days=Math.round((Date.parse(endDay)-Date.parse(startDay))/86400000)+1;if(days>3660)throw Error('research_cohort_range_too_large');
 const indexed=new Map();for(const cmp of comparisons){const d=cmp?.date;if(!validResearchDay(d)||d<startDay||d>endDay||indexed.has(d))throw Error('invalid_cohort_day');indexed.set(d,cmp)}
 const observed=[],missing=[],unpaired=[],ar=[],br=[],daily=[];
 for(let i=0;i<days;i++){const d=new Date(Date.parse(startDay)+i*86400000).toISOString().slice(0,10),cmp=indexed.get(d);if(!cmp){missing.push(d);continue}const s=summarizePairedResearchDay(cmp);daily.push(s);if(!s.pairedObserved){unpaired.push(d);continue}observed.push(d);ar.push(...cmp.unifiedPlan.picks);br.push(...cmp.autonomousPreview.picks);}
 // A match can reappear on another scheduled date. Do not count the same canonical selection twice.
 for(const rows of [ar,br]){const seen=new Set();for(const p of rows){const k=key(p);if(seen.has(k))throw Error('research_cross_day_duplicate_selection');seen.add(k)}}
 const body={schema:'aiml.autonomous-cohort-statistics.v1',startDay,endDay,calendarDays:days,observedDays:observed,missingDays:missing,unpairedDays:unpaired,completeDays:daily.filter(d=>d.pairedObserved&&d.complete).map(d=>d.date),commonStartDays:daily.filter(d=>d.pairedObserved&&d.commonStartBound).map(d=>d.date),
  A:{...summarize(ar),byMarket:group(ar,p=>p.market),bySelection:group(ar,p=>p.market+'|'+p.pick)},
  B:{...summarize(br),byMarket:group(br,p=>p.market),bySelection:group(br,p=>p.market+'|'+p.pick),timingCertified:br.filter(p=>p.timingCertified===true).length},
  daily,performanceCertified:false,publicationAuthorized:false,comparisonBasis:'PAIRED_OBSERVED_DAYS_NOT_CALIBRATED',minimumObservationDays:60,reviewTargetDays:90};
 return {...body,statsSha256:researchHash(body)};
}
export function readPairedResearchCohort(root,startDay,endDay){
 if(!validResearchDay(startDay)||!validResearchDay(endDay)||startDay>endDay||(Date.parse(endDay)-Date.parse(startDay))/86400000>=3660)throw Error('invalid_cohort_range');
 const comparisons=[];for(let t=Date.parse(startDay);t<=Date.parse(endDay);t+=86400000){const d=new Date(t).toISOString().slice(0,10);const file=path.resolve(root,'data','value-autonomous-research',d,'comparison.json');if(fs.existsSync(file))comparisons.push(readInternalComparison(root,d).comparison)}
 return buildPairedResearchCohort({startDay,endDay,comparisons});
}
