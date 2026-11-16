import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {getProjectRoot} from '../../engine-v1/storage/data-root.js';
const root=getProjectRoot();
const [checkpointDir,out]=process.argv.slice(2);
if(!checkpointDir||!out)throw Error('CHECKPOINT_DIRECTORY_AND_NEW_OUTPUT_DIRECTORY_REQUIRED');
if(fs.existsSync(path.join(out,'full-engine-regression.json')))throw Error('USE_NEW_OUTPUT_DIRECTORY_TO_PRESERVE_PRIOR_EVIDENCE');
fs.mkdirSync(out,{recursive:true});
const files=JSON.parse(fs.readFileSync(path.join(checkpointDir,'regression/regression-files.json')));
const discovered=[];
function walk(dir){for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())walk(p);else if(e.name.endsWith('.test.js'))discovered.push(p);}}
walk('engine-v1');
if(JSON.stringify([...files].sort())!==JSON.stringify(discovered.sort()))throw Error('REGRESSION_FILE_SCOPE_CHANGED');
const results=[];
for(let i=0;i<files.length;i+=16){
 const batch=files.slice(i,i+16), start=Date.now();
 const r=spawnSync(process.execPath,['--test','--test-reporter=tap',...batch],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024,timeout:180000});
 const log=path.join(out,`engine-regression-${String(results.length+1).padStart(3,'0')}.tap`);
 fs.writeFileSync(log,(r.stdout||'')+(r.stderr||''));
 const stat=key=>Number((r.stdout||'').match(new RegExp('^# '+key+' (\\d+)','m'))?.[1]||0);
 results.push({batch:results.length+1,files:batch,exitCode:r.status,error:r.error?.message||null,durationMs:Date.now()-start,tests:stat('tests'),passed:stat('pass'),failed:stat('fail'),cancelled:stat('cancelled'),skipped:stat('skipped'),log});
 fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify({...results.at(-1),files:undefined,log:undefined}));
}
const summary={files:files.length,batches:results.length,failedBatches:results.filter(r=>r.exitCode!==0).length,tests:results.reduce((s,r)=>s+r.tests,0),passed:results.reduce((s,r)=>s+r.passed,0),failed:results.reduce((s,r)=>s+r.failed,0),cancelled:results.reduce((s,r)=>s+r.cancelled,0),skipped:results.reduce((s,r)=>s+r.skipped,0),results};
fs.writeFileSync(path.join(out,'full-engine-regression.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify({...summary,results:undefined}));
if(summary.failedBatches)process.exitCode=1;
