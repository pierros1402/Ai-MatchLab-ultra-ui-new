// Opt-in hook for the existing writer; no acquisition or second A calculation.
// --refresh uses existing verified finals; --stage is reserved for the approved workflow writer.
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {getProjectRoot} from '../storage/data-root.js';
import {writeHistoryJsonAtomic} from '../storage/history-preservation.js';
import {loadFinalResults} from './build-value-settlement-from-final-results-day.js';
import {productionResults} from './build-unified-production-day.js';
import {researchStartDay,refreshResearchAfterCombined} from '../value/autonomous-cycle.js';
import {collectResearchStageFiles} from '../value/autonomous-stage-contract.js';
import {composeResearchRelease} from '../value/autonomous-release-binding.js';
import {exactCheckoutBytes} from '../value/unified-committed-record-proof.js';
const root=getProjectRoot(),day=process.argv[2],startDay=researchStartDay();
if(startDay===null){console.log(JSON.stringify({status:'NOT_APPLICABLE',date:day,staged:0}));process.exit(0);}
const flags=process.argv.slice(3);if(flags.some(f=>!['--refresh','--stage','--include-observations'].includes(f)))throw Error('invalid_autonomous_stage_flag');
if(flags.includes('--stage')&&process.env.GITHUB_ACTIONS!=='true')throw Error('research_staging_requires_workflow_writer');
const options={root,startDay,clock:()=>new Date().toISOString(),loadFinals:loadFinalResults,productionResults,write:writeHistoryJsonAtomic};
const refresh=(flags.includes('--refresh')||flags.includes('--stage'))?refreshResearchAfterCombined(day,options):null;
const plan=collectResearchStageFiles(root,day,{startDay,includeObservations:flags.includes('--include-observations'),includeDerived:refresh?.status!=='HOLD'});
let staged=0,bindingStatus='NOT_APPLICABLE';
if(flags.includes('--stage')&&day>=startDay){
 const git=args=>execFileSync('git',args,{cwd:root,stdio:['ignore','pipe','pipe'],maxBuffer:64*1024*1024,timeout:30000,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GIT_NO_LAZY_FETCH:'1'}});
 if(path.resolve(git(['rev-parse','--show-toplevel']).toString().trim())!==path.resolve(root))throw Error('research_stage_wrong_repository');
 for(const rel of plan.files.filter(p=>p.includes('/observations/'))){
  if(git(['ls-tree','HEAD','--',rel]).toString().trim()){
   const old=git(['show','HEAD:'+rel]),now=fs.readFileSync(path.join(root,rel));if(!exactCheckoutBytes(now,old))throw Error('immutable_research_stage_change');
  }
 }
 // Before writing the existing comparison, verify the repository and immutable records.
 // A HOLD removes an earlier research envelope rather than publishing stale B.
 const rel=`data/value-comparison/${day}.json`,file=path.resolve(root,rel);
 try{
  if(fs.existsSync(file)){
   if(fs.realpathSync(file)!==path.resolve(fs.realpathSync(root),rel))throw Error('ab_comparison_path_escape');
   const original=JSON.parse(fs.readFileSync(file,'utf8'));
   let transport=null;
   if(plan.status==='RESEARCH_ONLY'){
    const candidate=path.resolve(root,`data/value-autonomous-research/${day}/release-candidate.json`);
    if(fs.realpathSync(candidate)!==path.resolve(fs.realpathSync(root),`data/value-autonomous-research/${day}/release-candidate.json`))throw Error('ab_candidate_path_escape');
    transport=JSON.parse(fs.readFileSync(candidate,'utf8'));
   }
   const result=composeResearchRelease(original,transport,day);bindingStatus=result.status;
   if(result.reason)plan.issues.push(result.reason);
   if(JSON.stringify(original)!==JSON.stringify(result.payload)){writeHistoryJsonAtomic(file,result.payload);plan.files.push(rel);}
  }else if(plan.status==='RESEARCH_ONLY'){bindingStatus='HOLD';plan.issues.push('ab_existing_comparison_missing');}
 }catch(e){bindingStatus='HOLD';plan.issues.push(String(e?.message||e));throw e;}
 if(plan.files.length){git(['add','--',...plan.files]);staged=plan.files.length;}

}
console.log(JSON.stringify({date:day,refresh,stageStatus:plan.status,bindingStatus,issues:plan.issues,files:plan.files,staged,publicationAuthorized:false}));
