// Exact immutable and derived research write-set; never adds production artifacts.
import fs from 'node:fs';import path from 'node:path';
import {readResearchRecord} from './autonomous-research-journal.js';
import {readInternalComparison} from './autonomous-observation-lifecycle.js';
import {buildAutonomousTransport,validateAutonomousTransport} from './autonomous-preview-transport.js';
import {readPairedResearchCohort,researchHash,validResearchDay} from './autonomous-comparison-stats.js';
import {validateProductionProjection} from './unified-production-journal.js';
const safe=(root,rel)=>{const file=path.resolve(root,rel);if(fs.realpathSync(file)!==path.resolve(fs.realpathSync(root),rel))throw Error('research_stage_path_escape');return file;};
export function collectResearchStageFiles(root,day,{startDay,includeObservations=false,includeDerived=true}={}){
 if(!validResearchDay(day)||startDay!==null&&!validResearchDay(startDay))throw Error('invalid_research_stage_day');
 if(startDay===null||day<startDay)return {status:'NOT_APPLICABLE',files:[],issues:[]};
 const prefix=`data/value-autonomous-research/${day}`,dir=path.resolve(root,prefix,'observations');
 if(!fs.existsSync(dir))return {status:'NO_RESEARCH_OBSERVATIONS',files:[],issues:[]};
 const observed=fs.readdirSync(safe(root,prefix+'/observations')).filter(f=>f.endsWith('.json')).sort();
 if(!observed.length)return {status:'NO_RESEARCH_OBSERVATIONS',files:[],issues:[]};
 const signatures=[];
 const observationFiles=observed.map(name=>{if(!/^[a-f0-9]{64}\.json$/.test(name))throw Error('research_stage_unexpected_observation');const relative=prefix+'/observations/'+name;const record=readResearchRecord(root,safe(root,relative));signatures.push(record.recordSha256);return relative;});
 const files=includeObservations?[...observationFiles]:[],issues=[];
 if(!includeDerived)return {status:'HOLD_DERIVED_RESEARCH_ONLY',files,issues:['research_refresh_failed']};
 try{
  const internal=readInternalComparison(root,day),publicPlan=validateProductionProjection(JSON.parse(fs.readFileSync(safe(root,`data/value-unified/${day}/public-plan.json`),'utf8')),day);
  if(researchHash(signatures.sort())!==researchHash(internal.comparison.autonomousPreview.records.map(r=>r.signature).sort()))throw Error('research_stage_observation_set_changed');
  if(researchHash(publicPlan)!==researchHash(internal.comparison.unifiedPlan))throw Error('research_stage_combined_projection_stale');
  const candidate=validateAutonomousTransport(JSON.parse(fs.readFileSync(safe(root,prefix+'/release-candidate.json'),'utf8')),day);
  const expected=buildAutonomousTransport(internal.comparison,readPairedResearchCohort(root,startDay,day));
  if(researchHash(candidate)!==researchHash(expected))throw Error('research_stage_candidate_stale');
  files.push(prefix+'/comparison.json',prefix+'/release-candidate.json');
 }catch(e){issues.push(String(e?.message||e));}
 return {status:issues.length?'HOLD_DERIVED_RESEARCH_ONLY':'RESEARCH_ONLY',files,issues};
}
