// Read-only Stage20 *committed-path* policy coverage diagnostic.
// This does NOT inspect ignored/untracked runner outputs or prove a checkpoint.
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import {evaluateStage20CapturePaths} from "./daily-resume-stage20-admission.mjs";
export const STAGE20_COMMITTED_SCOPE_SCHEMA="ai-matchlab.stage20-committed-scope-audit.v1";
const sha=data=>crypto.createHash("sha256").update(data).digest("hex");
const group=p=>{
  const prefix=p.split("/")[1]||"";
  const allowed=new Set([
    "research-cache","league-memory","odds-memory","value-data-acquisition",
    "canonical-registry","competition-admission","identity-recovery",
    "ingest-state","coverage-reports","final-result-conflicts",
    "source-reliability.json","active-leagues.json","fixtures.json",
    "observations.json","plan-c-shadow"
  ]);
  return allowed.has(prefix)?prefix:"other";
};
export function auditStage20CommittedScope(paths,dayKey,sourceCommit){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dayKey||"") ||
    !/^[a-f0-9]{40}$/.test(sourceCommit||"") ||
    !Array.isArray(paths) || paths.length===0 || paths.length>250000)
    throw Error("stage20_committed_scope_binding_invalid");
  const groups=new Map();
  let previous="",admitted=0,denied=0,extensionDenied=0;
  const all=crypto.createHash("sha256");
  for(const p of paths){
    if(typeof p!=="string" || !p.startsWith("data/") ||
      p<=previous || p.includes("\0") || p.includes("\\") ||
      p.split("/").some(x=>!x||x==="."||x===".."))
      throw Error("stage20_committed_scope_path_invalid");
    previous=p;
    all.update(Buffer.from(p,"utf8"));all.update(Buffer.from([0]));
    const accepted=evaluateStage20CapturePaths({dayKey,paths:[p]}).ok;
    const family=group(p);
    const counts=groups.get(family)||{total:0,admitted:0,denied:0};
    counts.total++;
    counts[accepted?"admitted":"denied"]++;
    groups.set(family,counts);
    if(accepted)admitted++;else {
      denied++;
      if(!/\.(json|jsonl|ndjson|csv)$/i.test(p))extensionDenied++;
    }
  }
  if(admitted+denied!==paths.length)throw Error("stage20_committed_scope_count_mismatch");
  const breakdown=Object.fromEntries([...groups.entries()]
    .filter(([,v])=>v.denied>0).sort(([a],[b])=>a.localeCompare(b,"en")));
  return {
    schema:STAGE20_COMMITTED_SCOPE_SCHEMA,dayKey,sourceCommit,
    trackedPathCount:paths.length,trackedPathSetSha256:all.digest("hex"),
    admitted,denied,deniedUnsupportedExtension:extensionDenied,
    deniedKnownFamilies:breakdown,
    // This is the committed checkout only, not full physical Stage20 output.
    gitTrackedOnly:true,ignoredRuntimeFilesInspected:false,
    untrackedRuntimeFilesInspected:false,requiredStageOutputsProven:false,
    completeCheckpointProven:false,writerQuiescenceAttested:false,
    resumeAuthorized:false,publicationAuthorized:false
  };
}
export function auditStage20CommittedScopeFromGit(root,dayKey){
  const sourceCommit=execFileSync("git",["rev-parse","HEAD"],{
    cwd:root,encoding:"utf8"}).trim();
  const raw=execFileSync("git",["ls-files","-z","--","data/"],{
    cwd:root,encoding:"buffer",maxBuffer:64*1024*1024});
  const paths=raw.toString("utf8").split("\0").filter(Boolean).sort();
  return auditStage20CommittedScope(paths,dayKey,sourceCommit);
}
