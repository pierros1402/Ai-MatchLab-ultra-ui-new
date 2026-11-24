// Evidence-only Stage20 input-byte compatibility across commits.
// Source continuity does not imply data content continuity. Never skip a Daily.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import {inspectStage20CrossCommitNonDataProof} from "./daily-resume-crosscommit-nondata-proof.mjs";
export const STAGE20_INPUT_BYTES_SCHEMA="ai-matchlab.stage20-crosscommit-input-bytes.v1";
const SHA=/^[a-f0-9]{40}$/, HASH=/^[a-f0-9]{64}$/;
const sha=buf=>crypto.createHash("sha256").update(buf).digest("hex");
const deny=reason=>({schema:STAGE20_INPUT_BYTES_SCHEMA,accepted:false,reason,
  inputBytesVerified:false,completeInputUniverseVerified:false,
  sourceCodeDependencyVerified:false,stageCompleteVerified:false,
  resumeAuthorized:false,publicationAuthorized:false});
function safe(p){
  return typeof p==="string" && p.startsWith("data/") && p.length<512 &&
    !p.includes("\\") && !p.includes("\0") &&
    p.split("/").every(s=>s && s!=="." && s!==".." && s!==".git");
}
function bytesAt(root,rel) {
  let at=path.resolve(root);
  for(const part of rel.split("/")){
    at=path.join(at,part);
    if(fs.lstatSync(at).isSymbolicLink())throw Error("stage20_input_symlink_forbidden");
  }
  const stat=fs.statSync(at);
  if(!stat.isFile() || stat.size>1024*1024*1024)throw Error("stage20_input_not_regular_or_oversize");
  return fs.readFileSync(at);
}
export function inspectStage20CrossCommitInputBytes({
  repoRoot,producerCommit,consumerCommit,dayKey,stageId,
  requiredInputPaths,producerInputs
}={}) {
  if(typeof repoRoot!=="string" || !repoRoot || !SHA.test(producerCommit||"") ||
    !SHA.test(consumerCommit||"") ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dayKey||"") ||
    !/^[a-z][a-z0-9-]{0,63}$/.test(stageId||""))
    return deny("stage20_input_identity_invalid");
  if(!Array.isArray(requiredInputPaths) || !requiredInputPaths.length ||
    requiredInputPaths.length>10000 || !Array.isArray(producerInputs) ||
    producerInputs.length!==requiredInputPaths.length ||
    requiredInputPaths.some(x=>!safe(x)) ||
    new Set(requiredInputPaths).size!==requiredInputPaths.length)
    return deny("stage20_input_set_invalid");
  const names=[...requiredInputPaths].sort();
  const rows=[...producerInputs].sort((a,b)=>String(a?.path).localeCompare(String(b?.path),"en"));
  if(!rows.every((r,i)=>r && r.path===names[i] &&
    Number.isSafeInteger(r.bytes) && r.bytes>=0 && r.bytes<=1024*1024*1024 &&
    HASH.test(r.sha256||"") && r.provenance==="immutable_or_bound_derived"))
    return deny("stage20_input_manifest_untrusted");
  try {
    const head=execFileSync("git",["rev-parse","HEAD"],{cwd:repoRoot,encoding:"utf8"}).trim();
    if(head!==consumerCommit)return deny("stage20_input_consumer_head_mismatch");
    const compatibility=inspectStage20CrossCommitNonDataProof(
      repoRoot,producerCommit,consumerCommit);
    if(compatibility.accepted!==true)return deny("stage20_input_source_untrusted:"+compatibility.reason);
    let total=0;
    for(const row of rows){
      const actual=bytesAt(repoRoot,row.path);
      total+=actual.length;
      if(total>2*1024*1024*1024)return deny("stage20_input_total_oversize");
      if(actual.length!==row.bytes || sha(actual)!==row.sha256)
        return deny("stage20_input_bytes_changed:"+sha(Buffer.from(row.path)).slice(0,12));
    }
    return {schema:STAGE20_INPUT_BYTES_SCHEMA,accepted:true,reason:null,
      dayKey,stageId,producerCommit,consumerCommit,
      exactDeclaredInputCount:rows.length,totalInputBytes:total,
      inputBytesVerified:true,
      // A caller-supplied declared list is not proof that ALL source reads
      // (including provider/time-based inputs and transitive reads) were named.
      completeInputUniverseVerified:false,sourceCodeDependencyVerified:false,
      stageCompleteVerified:false,resumeAuthorized:false,publicationAuthorized:false};
  }catch(e){return deny("stage20_input_read_or_git_failure:"+String(e.message||e).slice(0,100));}
}
