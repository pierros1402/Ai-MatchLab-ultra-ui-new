// Read-only and deliberately conservative transitive Stage20 source inventory.
// Hashing static imports is NOT proof of runtime dependency completeness.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {builtinModules} from "node:module";
const BUILTINS=new Set(builtinModules.map(x=>x.replace(/^node:/,"")));
export const CLOSURE_SCHEMA="ai-matchlab.daily-stage20-source-closure-audit.v1";
export const DAILY954_SOURCE="33eaa635a8745e75fc0a6075a3594f4cd86d3b32";
export const ENTRY="engine-v1/jobs/run-daily-cycle.js";
export const WORKFLOW=".github/workflows/daily-deploy-snapshot.yml";
const SHA40=/^[a-f0-9]{40}$/;
const MAX_FILES=1600;
const MAX_FILE_BYTES=6*1024*1024;
const digest=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
function check(ok,code){if(!ok)throw Error(code);}
function git(root,...args) {
  return execFileSync("git",args,{cwd:root,encoding:"buffer",maxBuffer:64*1024*1024,timeout:30000});
}
function safePath(name) {
  check(typeof name==="string" && name.length>0 && name.length<512 &&
    !name.startsWith("/") && !name.includes("\\") &&
    !name.includes("\0") &&
    name.split("/").every(s=>s && s!=="." && s!==".." && s!==".git"),
    "closure_path_invalid");
  return name;
}
function blob(root,commit,relative) {
  safePath(relative);
  const tree=git(root,"ls-tree",commit,"--",relative).toString("utf8").trim();
  if(!tree)return null;
  const m=tree.match(/^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/);
  check(m && m[3]===relative,"closure_git_tree_nonregular_file");
  const bytes=git(root,"show",commit+":"+relative);
  check(bytes.length<=MAX_FILE_BYTES,"closure_source_file_too_large");
  return bytes;
}
export function scanStaticSourceImports(src) {
  check(typeof src==="string","closure_source_invalid");
  const specs=new Set();
  // Import/export declarations with literal module specifiers and CJS literal require.
  for(const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s+(?:(?:[^;]{0,2400}?)\s+from\s*)?["']([^"'\\\n]+)["']/g))
    specs.add(m[1]);
  for(const m of src.matchAll(/\brequire\s*\(\s*["']([^"'\\\n]+)["']/g))
    specs.add(m[1]);
  const flags=[];
  if(/\bimport\s*\(/.test(src))flags.push("dynamic_import_call");
  if(/\brequire\s*\(\s*(?!["'])/.test(src))flags.push("dynamic_require_call");
  if(/\b(?:spawn|spawnSync|exec|execFile|execSync|execFileSync|fork)\s*\(/.test(src))
    flags.push("process_launch_call");
  if(/\b(?:fs|promises|fsp)\.(?:readFile|readFileSync|writeFile|writeFileSync|appendFile|createReadStream|createWriteStream|readdir|readdirSync|openSync|rmSync|unlinkSync)\s*\(/.test(src))
    flags.push("filesystem_data_access");
  if(/\b(?:fetch|axios|got)\s*\(/.test(src))flags.push("external_network_call");
  return {specifiers:[...specs].sort(),riskFlags:[...new Set(flags)].sort()};
}
function candidatePaths(from,spec) {
  const base=path.posix.normalize(path.posix.join(path.posix.dirname(from),spec));
  safePath(base);
  return path.posix.extname(base)?[base]:[base+".js",base+".mjs",base+".cjs",base+".json",base+"/index.js"];
}
function isExternal(spec){return !spec.startsWith(".");}
function scope(root,commit,entry=ENTRY,maxFiles=MAX_FILES) {
  check(SHA40.test(commit) && Number.isInteger(maxFiles) && maxFiles>0 && maxFiles<=MAX_FILES,
    "closure_binding_invalid");
  const seen=new Map(), unresolved=[], packages=new Set(), risks=[];
  const queue=[entry];
  while(queue.length) {
    check(seen.size<maxFiles,"closure_module_count_limit");
    const name=safePath(queue.shift());
    if(seen.has(name))continue;
    const bytes=blob(root,commit,name);
    if(!bytes){unresolved.push({from:name,reason:"missing_static_source"});continue;}
    const sha256=digest(bytes);
    seen.set(name,sha256);
    if(!/\.(js|mjs|cjs)$/.test(name))continue;
    const scan=scanStaticSourceImports(bytes.toString("utf8"));
    for(const flag of scan.riskFlags)risks.push({file:name,reason:flag});
    for(const spec of scan.specifiers) {
      if(isExternal(spec)){
        if(!spec.startsWith("node:") && !BUILTINS.has(spec)) packages.add(spec);
        continue;
      }
      let resolved=null;
      try{
        for(const candidate of candidatePaths(name,spec)){
          if(blob(root,commit,candidate)!==null){resolved=candidate;break;}
        }
      }catch(err){unresolved.push({from:name,reason:"unsafe_or_unreadable_import"});continue;}
      if(resolved && !seen.has(resolved))queue.push(resolved);
      if(!resolved)unresolved.push({from:name,reason:"unresolved_relative_import"});
    }
  }
  const entries=[...seen.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0)
    .map(([name,sha256])=>({path:name,sha256}));
  const fingerprint=digest(Buffer.from(JSON.stringify(entries),"utf8"));
  return {
    commit,entry,files:entries.length,staticFingerprint:fingerprint,
    entries,unresolved,externalPackages:[...packages].sort(),riskFlags:risks,
    completeRuntimeClosureProven:false,externalEnvironmentBound:false
  };
}
export function compareStage20SourceClosures(producer,consumer) {
  check(producer?.entry===consumer?.entry && producer?.commit!==consumer?.commit &&
    Array.isArray(producer.entries) && Array.isArray(consumer.entries),
    "closure_comparison_binding_invalid");
  const p=new Map(producer.entries.map(r=>[r.path,r.sha256]));
  const c=new Map(consumer.entries.map(r=>[r.path,r.sha256]));
  const changed=[...new Set([...p.keys(),...c.keys()])].sort()
    .filter(name=>p.get(name)!==c.get(name))
    .map(name=>({path:name,change:!p.has(name)?"added":!c.has(name)?"removed":"modified"}));
  return {
    schema:CLOSURE_SCHEMA,
    producerCommit:producer.commit,consumerCommit:consumer.commit,
    entry:producer.entry,
    producerModules:producer.files,consumerModules:consumer.files,
    producerStaticFingerprint:producer.staticFingerprint,
    consumerStaticFingerprint:consumer.staticFingerprint,
    transitiveStaticChangedFiles:changed,
    transitiveStaticChangedCount:changed.length,
    producerUnresolvedCount:producer.unresolved.length,
    consumerUnresolvedCount:consumer.unresolved.length,
    producerExternalPackages:producer.externalPackages,
    consumerExternalPackages:consumer.externalPackages,
    producerRiskFlagCount:producer.riskFlags.length,
    consumerRiskFlagCount:consumer.riskFlags.length,
    staticDependencyInventoryOnly:true,
    runtimeDependencyClosureProven:false,
    immutableInputLineageVerified:false,
    crossCommitResumeAuthorized:false,
    productionWrites:0,publicationAuthorized:false
  };
}
export function auditStage20SourceClosure(repoRoot,consumerCommit,producerCommit=DAILY954_SOURCE) {
  check(SHA40.test(consumerCommit) && SHA40.test(producerCommit),
    "closure_commit_invalid");
  check(git(repoRoot,"rev-parse",consumerCommit+"^{commit}").toString("utf8").trim()===consumerCommit,
    "closure_consumer_not_resolved");
  check(git(repoRoot,"rev-parse",producerCommit+"^{commit}").toString("utf8").trim()===producerCommit,
    "closure_producer_not_resolved");
  const producer=scope(repoRoot,producerCommit);
  const consumer=scope(repoRoot,consumerCommit);
  const summary=compareStage20SourceClosures(producer,consumer);
  const pWorkflow=blob(repoRoot,producerCommit,WORKFLOW);
  const cWorkflow=blob(repoRoot,consumerCommit,WORKFLOW);
  check(pWorkflow!==null && cWorkflow!==null,"closure_workflow_missing");
  return {...summary,producerWorkflowSha256:digest(pWorkflow),
    consumerWorkflowSha256:digest(cWorkflow),
    workflowChanged:digest(pWorkflow)!==digest(cWorkflow),
    completeCodeCompatibilityProven:false};
}
const invoked=process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked) {
  try{
    check(process.argv.length===2,"closure_cli_no_args");
    const result=auditStage20SourceClosure(process.cwd(),process.env.AIML_CONSUMER_MAIN_SHA);
    console.log("DAILY954_STAGE20_SOURCE_CLOSURE="+JSON.stringify(result));
  }catch(err){console.error("DAILY954_STAGE20_SOURCE_CLOSURE_DENIED="+err.message);process.exitCode=1;}
}
