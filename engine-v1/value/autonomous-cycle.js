// Optional research integration at the existing Combined producer. No new data acquisition.
import fs from 'node:fs';import path from 'node:path';
import {captureInternalComparison,refreshInternalComparison} from './autonomous-observation-lifecycle.js';
import {buildAutonomousTransport} from './autonomous-preview-transport.js';
import {readPairedResearchCohort,validResearchDay} from './autonomous-comparison-stats.js';
import {athensDayKey,shiftDay} from '../core/daykey.js';
export function researchStartDay(env=process.env){
 if(env.AIML_AB_RESEARCH_ENABLED!=='1')return null;
 if(!validResearchDay(env.AIML_AB_RESEARCH_START_DAY))throw Error('autonomous_activation_day_required');
 return env.AIML_AB_RESEARCH_START_DAY;
}
function hasObservations(root,day){if(!validResearchDay(day))throw Error('invalid_research_day');const dir=path.resolve(root,'data','value-autonomous-research',day,'observations');return fs.existsSync(dir)&&fs.readdirSync(dir).some(f=>/^[a-f0-9]{64}\.json$/.test(f));}
function candidate(root,day,startDay,artifact,write){
 const cohort=readPairedResearchCohort(root,startDay,day);
 const transport=buildAutonomousTransport(artifact.comparison,cohort);
 const dir=path.resolve(root,'data','value-autonomous-research',day),file=path.join(dir,'release-candidate.json');
 if(fs.realpathSync(dir)!==path.resolve(fs.realpathSync(root),'data','value-autonomous-research',day)||fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())throw Error('autonomous_release_candidate_path_escape');
 write(file,transport);return {status:'RESEARCH_ONLY',date:day,count:transport.autonomousPreview.count,publicationAuthorized:false,transportSha256:transport.transportSha256};
}
export function refreshResearchAfterCombined(day,options){
 const start=options.startDay;if(start===null||day<start||!hasObservations(options.root,day))return {status:'NOT_APPLICABLE',date:day};
 try{const artifact=refreshInternalComparison(day,options);return candidate(options.root,day,start,artifact,options.write);}catch(e){return {status:'HOLD',date:day,reason:String(e?.message||e)};}
}
export async function runCombinedResearchCycle(day,{capture=true,startDay,buildCombined,...options}){
 if(!validResearchDay(day)||startDay!==null&&!validResearchDay(startDay))throw Error('invalid_research_activation');
 if(startDay===null||day<startDay)return buildCombined(day,{capture,nowFn:options.clock,dependencies:options.dependencies});
 if(capture){const today=athensDayKey(new Date(options.clock()));if(day<today||day>shiftDay(today,1))throw Error('autonomous_capture_outside_prospective_window');}
 if(!capture){const combined=await buildCombined(day,{capture:false,nowFn:options.clock,dependencies:options.dependencies});return {...combined,autonomousResearch:combined.status==='AVAILABLE'?refreshResearchAfterCombined(day,{...options,startDay}):{status:'NOT_APPLICABLE',date:day}};}
 let combined=null;
 try{
  const r=await captureInternalComparison(day,{...options,buildCombined:async(d,o)=>{combined=await buildCombined(d,o);return combined;}});
  const research=candidate(options.root,day,startDay,r.artifact,options.write);
  return {...r.combined,autonomousResearch:{...research,...(r.archive.commonSourceAudit?{commonSourceAudit:r.archive.commonSourceAudit}:{}),...(r.archive.boundaryReceipts?{boundaryReceipts:r.archive.boundaryReceipts}:{})}};
 }catch(e){if(!combined)throw e;return {...combined,autonomousResearch:{status:'HOLD',date:day,reason:String(e?.message||e)}};}
}
