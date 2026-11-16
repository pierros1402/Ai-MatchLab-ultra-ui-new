import fs from 'node:fs';
import path from 'node:path';
import {validateProductionProjection} from './unified-production-journal.js';
import {buildAutonomousPreview} from './autonomous-preview.js';
import {archiveResearchRecord} from './autonomous-research-journal.js';
import {readResearchDay,attachResearchPreview} from './autonomous-research-daily.js';
import {checkpointHistoryIfRequired} from '../storage/history-preservation.js';
// Explicit candidate execution, wired to the existing Combined callback. Never invokes a second producer.
export async function runResearchAlongsideCombined(day,{root,clock,buildCombined,loadFinals,productionResults,dependencies={}}){
 let observed=null,captureError=null,captureSeen=false;
 const combined=await buildCombined(day,{nowFn:clock,dependencies,onAutonomousResearch:capture=>{
  // A must not be retried or invalidated by an experimental B failure.
  try{if(captureSeen||capture.day!==day)throw Error('invalid_combined_capture');captureSeen=true;observed=buildAutonomousPreview(capture,clock());}catch(e){captureError=e;}
 }});
 if(captureError)throw captureError;
 if(!observed||combined?.date!==day||combined.status!=='AVAILABLE')throw Error('combined_capture_not_available');
 const archive=archiveResearchRecord(root,observed);
 // The Combined checkpoint may precede the B record and may be skipped on an
 // unchanged A output. Preserve the original B observation and its actual
 // receipt objects through the existing evidence archive; no second service.
 const checkpoint=(dependencies.researchCheckpoint||checkpointHistoryIfRequired)(day,'autonomous-research-record-captured');
 if(process.env.HISTORY_PRESERVATION_REQUIRED==='1'&&(!checkpoint||checkpoint.ok!==true))throw Error('autonomous_research_durability_unverified');
 const projection=readResearchDay(root,day,{finals:loadFinals(day),now:clock(),productionResults});
 const comparison=readCapturedCombinedComparison(root,day,combined,clock());
 return {combined,archive,projection,comparison:attachResearchPreview(comparison,projection)};
}
// Read the exact signed projection written by this Combined invocation, not legacy standalone artifacts.
export function readCapturedCombinedComparison(root,day,combined,now){
 const stage='combined_signed_projection';
 try {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||combined?.date!==day||combined.status!=='AVAILABLE'||!Number.isInteger(combined.count)||!Number.isFinite(Date.parse(now)))throw Error('invalid_combined_summary');
  const file=path.resolve(root,'data','value-unified',day,'public-plan.json');
  if(fs.realpathSync(file)!==path.resolve(fs.realpathSync(root),'data','value-unified',day,'public-plan.json'))throw Error('combined_projection_path_escape');
  const plan=validateProductionProjection(JSON.parse(fs.readFileSync(file,'utf8')),day);
  if(plan.id!=='plan-u1'||plan.count!==combined.count||plan.analysisComplete!==combined.analysisComplete||!Array.isArray(plan.records)||plan.records.length!==combined.records)throw Error('combined_projection_summary_mismatch');
  return {ok:true,schema:'aiml.combined-autonomous-research-comparison.v1',date:day,generatedAt:now,publicationAuthorized:false,unifiedPlan:plan};
 }catch(e){throw Error(stage+': '+e.message,{cause:e});}
}
