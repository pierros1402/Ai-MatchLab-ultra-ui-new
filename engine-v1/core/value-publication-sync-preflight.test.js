import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('../../tools/sync-public-value-comparison.mjs',import.meta.url));
const preload=`import crypto from 'node:crypto';
 const source=JSON.parse(process.env.TEST_COMPARISON), raw=JSON.stringify(source);
 globalThis.fetch=async(url,init={})=>{
  let body;
  if(String(url).includes('raw.githubusercontent.com'))return new Response(raw,{status:200});
  if(init.method==='POST'){console.log('TEST_PUBLIC_WRITE');body={ok:true,job:{id:'test'}};}
  else if(String(url).includes('/status?'))body={job:{status:'succeeded',result:{ok:true,dayKey:source.date,ref:'b'.repeat(40),valueComparisonWritten:true,comparisonSha256:crypto.createHash('sha256').update(raw).digest('hex')}}};
  else body=source;
  return new Response(JSON.stringify(body),{status:200});
 };`;
function run(payload){return spawnSync(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(preload),script,'2099-10-22','b'.repeat(40)],{encoding:'utf8',env:{...process.env,CRON_SECRET:'local-test-no-credentials',ENGINE_BASE:'https://test.invalid',TEST_COMPARISON:JSON.stringify(payload)}});}
const partial=()=>({ok:true,date:'2099-10-22',plans:{A:null,A2:null,B:null,B2:null},dataReadiness:{date:'2099-10-22',complete:false,fixtureUniverse:{count:1,canonicalIds:['cid_one']},summary:{fixtures:1,applicable:1,ready:0,insufficient:1,byReason:{missing_model_assessment:1}},rows:[{canonicalId:'cid_one',status:'INSUFFICIENT_DATA',reasons:['missing_model_assessment']}]},unifiedPlan:{date:'2099-10-22',status:'AVAILABLE',analysisComplete:false,count:0,picks:[],zeroPicksCertified:false}});
test('a false complete candidate is rejected before the public write endpoint is called',()=>{
 const source=partial();source.unifiedPlan.zeroPicksCertified=true;
 const result=run(source);assert.notEqual(result.status,0);assert.match(result.stderr,/VALUE_PUBLICATION_INTEGRITY/);assert.doesNotMatch(result.stdout,/TEST_PUBLIC_WRITE/);
});
test('an honest incomplete day still synchronizes and verifies the exact public bytes',()=>{
 const result=run(partial());assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/TEST_PUBLIC_WRITE/);assert.match(result.stdout,/VALUE_PUBLICATION_COVERAGE=INCOMPLETE/);assert.match(result.stdout,/VALUE_COMPARISON_SYNC_VERIFIED=true/);
});
