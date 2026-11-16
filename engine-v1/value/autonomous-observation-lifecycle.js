// Opt-in research lifecycle. The existing Combined producer is called once.
// This artifact is internal, never a runtime release or a policy approval.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {runResearchAlongsideCombined,readCapturedCombinedComparison} from './autonomous-research-orchestrator.js';
import {readResearchDay,attachResearchPreview} from './autonomous-research-daily.js';
import {validateProductionProjection} from './unified-production-journal.js';
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const dayValid=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
function dayDir(root,day){if(!dayValid(day))throw Error('invalid_observation_day');return path.resolve(root,'data','value-autonomous-research',day);}
export function validateInternalComparison(value,day){
 const {comparisonSha256,...body}=value||{};
 if(!dayValid(day)||body.date!==day||body.publicationAuthorized!==false||body.schema!=='aiml.autonomous-internal-comparison.v1'||sha(body)!==comparisonSha256)throw Error('invalid_internal_comparison');
 const cmp=body.comparison;
 if(cmp?.publicationAuthorized!==false||cmp.date!==day||cmp.autonomousPreviewMode!==true)throw Error('invalid_internal_comparison_flags');
 validateProductionProjection(cmp.unifiedPlan,day);
 attachResearchPreview(cmp,cmp.autonomousPreview);
 return value;
}
function persist(root,day,comparison,write){
 const dir=dayDir(root,day),file=path.join(dir,'comparison.json');
 fs.mkdirSync(dir,{recursive:true});
 if(fs.realpathSync(dir)!==path.resolve(fs.realpathSync(root),'data','value-autonomous-research',day))throw Error('internal_comparison_path_escape');
 if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())throw Error('internal_comparison_file_escape');
 const body={schema:'aiml.autonomous-internal-comparison.v1',date:day,publicationAuthorized:false,comparison};
 const artifact={...body,comparisonSha256:sha(body)};
 validateInternalComparison(artifact,day);
 // A valid previously recorded terminal result must not silently change.
 if(fs.existsSync(file)){
  const old=validateInternalComparison(JSON.parse(fs.readFileSync(file,'utf8')),day);
  const current=new Map(comparison.autonomousPreview.picks.map(p=>[[p.canonicalMatchId,p.market,p.pick].join('|'),p]));
  for(const p of old.comparison.autonomousPreview.picks){
   if(!['WIN','LOSS','VOID'].includes(p.result))continue;
   const q=current.get([p.canonicalMatchId,p.market,p.pick].join('|'));
   if(!q||sha({result:p.result,truth:p.settlementTruth})!==sha({result:q.result,truth:q.settlementTruth}))throw Error('autonomous_terminal_truth_changed');
  }
 }
 write(file,artifact);return artifact;
}
// Settle-only uses the signed A projection and immutable B observations; no prediction or data acquisition.
export function refreshInternalComparison(day,{root,clock,loadFinals,productionResults,write}){
 dayDir(root,day);
 const planFile=path.resolve(root,'data','value-unified',day,'public-plan.json');
 if(fs.realpathSync(planFile)!==path.resolve(fs.realpathSync(root),'data','value-unified',day,'public-plan.json'))throw Error('combined_projection_path_escape');
 const plan=validateProductionProjection(JSON.parse(fs.readFileSync(planFile,'utf8')),day);
 const now=clock();
 const summary={date:day,status:plan.status,count:plan.count,analysisComplete:plan.analysisComplete,records:plan.records.length};
 const base=readCapturedCombinedComparison(root,day,summary,now);
 const projection=readResearchDay(root,day,{finals:loadFinals(day),now,productionResults});
 return persist(root,day,attachResearchPreview(base,projection),write);
}
export async function captureInternalComparison(day,options){
 dayDir(options.root,day);
 const captured=await runResearchAlongsideCombined(day,options);
 return {combined:captured.combined,archive:captured.archive,artifact:persist(options.root,day,captured.comparison,options.write)};
}
export function readInternalComparison(root,day){
 const file=path.join(dayDir(root,day),'comparison.json');
 if(fs.realpathSync(file)!==path.resolve(fs.realpathSync(root),'data','value-autonomous-research',day,'comparison.json'))throw Error('internal_comparison_path_escape');
 return validateInternalComparison(JSON.parse(fs.readFileSync(file,'utf8')),day);
}
