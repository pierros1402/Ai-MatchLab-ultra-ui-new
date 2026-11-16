// Candidate envelope for the EXISTING pinned comparison API. No public writes here.
import {validateProductionProjection} from './unified-production-journal.js';
import {attachResearchPreview} from './autonomous-research-daily.js';
import {researchHash,summarizePairedResearchDay,validResearchDay} from './autonomous-comparison-stats.js';
export const AB_PREVIEW_SCHEMA='aiml.combined-autonomous-preview-transport.v1';
export function buildAutonomousTransport(comparison,cohort=null){
 const daily=summarizePairedResearchDay(comparison);
 const body={ok:true,schema:AB_PREVIEW_SCHEMA,date:comparison.date,generatedAt:comparison.generatedAt,publicationAuthorized:false,researchOnly:true,unifiedPlan:comparison.unifiedPlan,autonomousPreviewMode:true,autonomousPreview:comparison.autonomousPreview,autonomousDailyStats:daily,autonomousCohortStats:cohort};
 const result={...body,transportSha256:researchHash(body)};return validateAutonomousTransport(result,body.date);
}
function validateCohortTotals(stats){
 const calendar=Math.round((Date.parse(stats.endDay)-Date.parse(stats.startDay))/86400000)+1;
 if(stats.calendarDays!==calendar||calendar<1||calendar>3660||!['observedDays','missingDays','unpairedDays','completeDays','commonStartDays'].every(k=>Array.isArray(stats[k])))throw Error('ab_cohort_calendar_mismatch');
 const byDay=new Map();for(const row of stats.daily){if(!validResearchDay(row.date)||row.date<stats.startDay||row.date>stats.endDay||byDay.has(row.date))throw Error('ab_cohort_duplicate_day');byDay.set(row.date,row);}
 const observed=[],missing=[],unpaired=[],complete=[],commonStart=[];
 const sums={A:{},B:{}};const fields=['picks','wins','losses','voids','settled','pending'];
 const init=()=>Object.fromEntries(fields.map(k=>[k,0]));for(const p of ['A','B'])sums[p]=init();sums.B.timingCertified=0;
 function accounting(s){if(!s||!fields.every(k=>Number.isSafeInteger(s[k])&&s[k]>=0)||s.settled!==s.wins+s.losses||s.picks!==s.settled+s.voids+s.pending||s.hitRate!==(s.settled?s.wins/s.settled:null)||!Number.isSafeInteger(s.uniqueMatches)||s.uniqueMatches<0||s.uniqueMatches>s.picks)throw Error('ab_cohort_accounting_mismatch');}
 for(let i=0;i<calendar;i++){const d=new Date(Date.parse(stats.startDay)+i*86400000).toISOString().slice(0,10),row=byDay.get(d);if(!row){missing.push(d);continue}if(row.performanceCertified!==false||typeof row.pairedObserved!=='boolean'||typeof row.commonStartBound!=='boolean'||typeof row.complete!=='boolean')throw Error('ab_cohort_daily_flags');for(const p of ['A','B'])accounting(row[p]);if(!row.pairedObserved){unpaired.push(d);continue}observed.push(d);if(row.complete)complete.push(d);if(row.commonStartBound)commonStart.push(d);for(const p of ['A','B'])for(const k of fields)sums[p][k]+=row[p][k];if(!Number.isSafeInteger(row.B.timingCertified)||row.B.timingCertified<row.B.settled+row.B.voids||row.B.timingCertified>row.B.picks)throw Error('ab_cohort_timing_mismatch');sums.B.timingCertified+=row.B.timingCertified;}
 for(const [name,values] of Object.entries({observedDays:observed,missingDays:missing,unpairedDays:unpaired,completeDays:complete,commonStartDays:commonStart}))if(researchHash(stats[name])!==researchHash(values))throw Error('ab_cohort_partition_mismatch');
 for(const p of ['A','B']){accounting(stats[p]);for(const [k,v] of Object.entries(sums[p]))if(stats[p][k]!==v)throw Error('ab_cohort_aggregate_mismatch');for(const group of ['byMarket','bySelection']){const actual=stats[p][group];if(!actual||typeof actual!=='object'||Array.isArray(actual))throw Error('ab_cohort_group_mismatch');const expected=new Map();for(const d of observed){const groups=byDay.get(d)[p][group];if(!groups||typeof groups!=='object')throw Error('ab_cohort_group_mismatch');for(const [k,v] of Object.entries(groups)){accounting(v);const acc=expected.get(k)||init();for(const f of fields)acc[f]+=v[f];expected.set(k,acc)}}if(Object.keys(actual).length!==expected.size)throw Error('ab_cohort_group_mismatch');for(const [k,v] of expected){accounting(actual[k]);if(fields.some(f=>actual[k][f]!==v[f]))throw Error('ab_cohort_group_mismatch');}}}
}
export function validateAutonomousTransport(payload,day){
 const {transportSha256,...body}=payload||{};
 if(!validResearchDay(day)||body.date!==day||body.ok!==true||body.schema!==AB_PREVIEW_SCHEMA||body.publicationAuthorized!==false||body.researchOnly!==true||body.autonomousPreviewMode!==true||!Number.isFinite(Date.parse(body.generatedAt))||researchHash(body)!==transportSha256)throw Error('invalid_ab_transport');
 validateProductionProjection(body.unifiedPlan,day);attachResearchPreview(body,body.autonomousPreview);
 const daily=summarizePairedResearchDay(body);if(researchHash(daily)!==researchHash(body.autonomousDailyStats))throw Error('ab_daily_stats_mismatch');
 const cohort=body.autonomousCohortStats;if(cohort!==null){const {statsSha256,...stats}=cohort||{};if(stats.schema!=='aiml.autonomous-cohort-statistics.v1'||stats.publicationAuthorized!==false||stats.performanceCertified!==false||stats.endDay!==day||!validResearchDay(stats.startDay)||stats.startDay>day||researchHash(stats)!==statsSha256||!Array.isArray(stats.daily)||!stats.daily.some(x=>x.date===day&&researchHash(x)===researchHash(daily)))throw Error('ab_cohort_stats_mismatch');validateCohortTotals(stats)}
 return payload;
}
// Never accept an experimental artifact through legacy/unpinned runtime paths.
export function readAutonomousPreviewTransport(payload,day,{pinned=false,enabled=false}={}){
 if(payload?.schema!==AB_PREVIEW_SCHEMA)return null;
 if(!pinned||!enabled)throw Error('ab_preview_not_authorized_for_runtime');
 return validateAutonomousTransport(payload,day);
}
