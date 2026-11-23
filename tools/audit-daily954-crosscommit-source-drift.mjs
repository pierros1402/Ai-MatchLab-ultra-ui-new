// Source-drift classification only. NOT a proof of transitive runtime
// compatibility and cannot authorize cross-commit resume.
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
export const ORIGINAL_DAILY954_COMMIT="33eaa635a8745e75fc0a6075a3594f4cd86d3b32";
const SHA40=/^[a-f0-9]{40}$/;
const critical=Object.freeze([
  ".github/workflows/daily-deploy-snapshot.yml",
  "engine-v1/jobs/run-daily-cycle.js",
  "engine-v1/jobs/settle-plan-c-shadow.js",
  "engine-v1/jobs/build-details-day.js",
  "engine-v1/jobs/export-deploy-snapshot-day.js",
  "engine-v1/jobs/refresh-value-artifacts-day.js",
  "engine-v1/jobs/verify-daily-publish-contract.js"
]);
function check(ok,code){if(!ok)throw Error(code);}
function group(name){
  if(name.startsWith("data/"))return "data";
  if(name.startsWith("engine-v1/"))return "engine";
  if(name.startsWith(".github/workflows/"))return "workflow";
  if(name.startsWith("tools/"))return "tools";
  if(/(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(name))return "dependency";
  return "other";
}
export function summarizeHistoricalSourceDrift(rows) {
  check(Array.isArray(rows),"crosscommit_diff_records_invalid");
  const grouped={},statuses={},criticalChanged=[];
  const seen=new Set();
  let changedSource=0,changedData=0;
  for(const row of rows) {
    const status=String(row?.status||""),name=row?.path;
    check(["A","M","D","T"].includes(status) &&
      typeof name==="string" && name.length>0 && name.length<=700 &&
      !name.startsWith("/") && !name.includes("\\") && !name.includes("\0") &&
      name.split("/").every(s=>s&&s!=="."&&s!=="..") && !seen.has(name),
      "crosscommit_diff_row_invalid");
    seen.add(name);
    const bucket=group(name);
    grouped[bucket]=(grouped[bucket]||0)+1;
    statuses[status]=(statuses[status]||0)+1;
    if(bucket==="data")changedData++;else changedSource++;
    if(critical.includes(name))criticalChanged.push({path:name,status});
  }
  criticalChanged.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  return {
    totalChanged:rows.length,sourceAndControlPathsChanged:changedSource,
    dataPathsChanged:changedData,
    byGroup:Object.fromEntries(Object.entries(grouped).sort()),
    byStatus:Object.fromEntries(Object.entries(statuses).sort()),
    criticalEntrypointsChanged:criticalChanged,
    stageScopedTransitiveClosureVerified:false,
    immutableInputParityVerified:false,
    crossCommitResumeAuthorized:false,publicationAuthorized:false
  };
}
function git(root,...args){return execFileSync("git",args,{cwd:root,encoding:"buffer",maxBuffer:128*1024*1024});}
export function auditOriginalDaily954SourceDrift(root) {
  const head=git(root,"rev-parse","HEAD").toString("utf8").trim();
  check(SHA40.test(head) && head!==ORIGINAL_DAILY954_COMMIT,
    "crosscommit_consumer_identity_invalid");
  const original=git(root,"rev-parse",ORIGINAL_DAILY954_COMMIT+"^{commit}").toString("utf8").trim();
  check(original===ORIGINAL_DAILY954_COMMIT,"crosscommit_producer_identity_invalid");
  const raw=git(root,"diff","--no-renames","--name-status","-z",original,head,"--");
  const tokens=raw.toString("utf8").split("\0").filter(Boolean);
  check(tokens.length%2===0 && tokens.length<=500000,
    "crosscommit_diff_format_invalid");
  const rows=[];
  for(let i=0;i<tokens.length;i+=2)rows.push({status:tokens[i],path:tokens[i+1]});
  const result=summarizeHistoricalSourceDrift(rows);
  return {
    schema:"ai-matchlab.daily954-crosscommit-source-drift-audit.v1",
    originalProducerCommit:original,consumerCommit:head,
    gitDiffSha256:crypto.createHash("sha256").update(raw).digest("hex"),
    ...result,readOnly:true,productionWrites:0
  };
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  try{
    check(process.argv.length===2,"crosscommit_usage_no_args");
    console.log("DAILY954_CROSSCOMMIT_SOURCE_DRIFT="+JSON.stringify(auditOriginalDaily954SourceDrift(process.cwd())));
  }catch(e){console.error("DAILY954_CROSSCOMMIT_DENIED="+e.message);process.exitCode=1;}
}
