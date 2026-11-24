// Immutable Git-object committed-delta census; never reads file payload or
// claims coverage of ignored/untracked live runner outputs.
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import {evaluateStage20CapturePaths} from "./daily-resume-stage20-admission.mjs";
export const STAGE20_COMMITTED_DELTA_SCHEMA="ai-matchlab.daily-stage20-committed-delta-audit.v1";
const SHA=/^[a-f0-9]{40}$/;
const hash=s=>crypto.createHash("sha256").update(s).digest("hex");
const git=(root,...args)=>execFileSync("git",args,{
  cwd:root,encoding:"buffer",maxBuffer:16*1024*1024});
const deny=reason=>({schema:STAGE20_COMMITTED_DELTA_SCHEMA,
  accepted:false,reason,completeStage20Payload:false,
  ignoredRuntimeFilesVerified:false,untrackedRuntimeFilesVerified:false,
  resumeAuthorized:false,publicationAuthorized:false});
export function auditStage20CommittedDelta({repoRoot,baseCommit,targetCommit,dayKey}={}){
  if(typeof repoRoot!=="string" || !repoRoot ||
    !SHA.test(baseCommit||"") || !SHA.test(targetCommit||"") ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dayKey||"") ||
    baseCommit===targetCommit)return deny("stage20_committed_delta_binding_invalid");
  try{
    git(repoRoot,"merge-base","--is-ancestor",baseCommit,targetCommit);
    const result=git(repoRoot,"diff","--no-renames","--name-status","-z",
      baseCommit,targetCommit,"--","data/").toString("utf8").split("\0");
    if(result.at(-1)==="")result.pop();
    if(!result.length || result.length%2)return deny("stage20_committed_delta_empty_or_malformed");
    if(result.length/2>100000)return deny("stage20_committed_delta_too_many_paths");
    const entries=[],seen=new Set();
    for(let i=0;i<result.length;i+=2){
      const status=result[i],name=result[i+1];
      if(!["A","M","D"].includes(status) ||
        typeof name!=="string" || !name.startsWith("data/") ||
        name.includes("\\") || name.includes("\0") ||
        name.split("/").some(x=>!x||x==="."||x==="..") ||
        seen.has(name))
        return deny("stage20_committed_delta_entry_invalid");
      seen.add(name);
      const approved=evaluateStage20CapturePaths({dayKey,paths:[name]}).ok;
      entries.push({name,status,approved});
    }
    entries.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
    const signature=crypto.createHash("sha256");
    const families={};let accepted=0,denied=0;
    for(const item of entries){
      signature.update(item.status+"\0"+item.name+"\0");
      if(item.approved)accepted++;else denied++;
      const name=item.name.split("/")[1];
      const f=families[name]||(families[name]={changed:0,admitted:0,denied:0});
      f.changed++;f[item.approved?"admitted":"denied"]++;
    }
    const deniedFamilyCounts=Object.fromEntries(Object.entries(families)
      .filter(([,v])=>v.denied).map(([k,v])=>[k,v.denied]).sort(([a],[b])=>a.localeCompare(b,"en")));
    return {schema:STAGE20_COMMITTED_DELTA_SCHEMA,accepted:true,reason:null,
      dayKey,baseCommit,targetCommit,changedDataPaths:entries.length,
      policyAdmitted:accepted,policyDenied:denied,
      added:entries.filter(x=>x.status==="A").length,
      modified:entries.filter(x=>x.status==="M").length,
      deleted:entries.filter(x=>x.status==="D").length,
      exactChangedPathSetSha256:signature.digest("hex"),
      deniedFamilyCounts,
      // A Git *commit* diff is not the physical Stage20 worktree delta.
      committedOnly:true,completeStage20Payload:false,
      ignoredRuntimeFilesVerified:false,untrackedRuntimeFilesVerified:false,
      producerStageBoundaryVerified:false,writerQuiescenceAttested:false,
      resumeAuthorized:false,publicationAuthorized:false};
  }catch{return deny("stage20_committed_delta_git_unavailable_or_untrusted")}
}
