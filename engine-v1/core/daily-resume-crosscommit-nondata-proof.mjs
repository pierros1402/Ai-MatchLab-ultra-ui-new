// Conservative, evidence-only check for a later commit's non-data source.
 // This never overrides cross-run artifact admission or allows a Daily skip.
import {spawnSync} from "node:child_process";
export const STAGE20_CROSSCOMMIT_PROOF_SCHEMA =
  "ai-matchlab.daily-stage20-crosscommit-nondata-proof.v1";
const SHA=/^[a-f0-9]{40}$/;
const denial=(reason)=>({
  schema:STAGE20_CROSSCOMMIT_PROOF_SCHEMA,accepted:false,reason,
  nonDataContentEqual:false,dataInputsVerified:false,
  dependencyDAGVerified:false,stageCodeCompatibilityVerified:false,
  resumeAuthorized:false,publicationAuthorized:false
});
function git(repo,args) {
  return spawnSync("git",args,{cwd:repo,encoding:"utf8",maxBuffer:32*1024*1024});
}
export function inspectStage20CrossCommitNonDataProof(repoRoot,producerCommit,consumerCommit) {
  if(typeof repoRoot!=="string" || !repoRoot ||
    !SHA.test(producerCommit||"") || !SHA.test(consumerCommit||""))
    return denial("stage20_crosscommit_input_invalid");
  try {
    for(const sha of [producerCommit,consumerCommit]) {
      const check=git(repoRoot,["cat-file","-t",sha]);
      if(check.error || check.status!==0 || check.stdout.trim()!=="commit")
        return denial("stage20_crosscommit_commit_not_found");
    }
    const ancestor=git(repoRoot,["merge-base","--is-ancestor",producerCommit,consumerCommit]);
    if(ancestor.error || ancestor.status!==0)
      return denial(ancestor.status===1?
        "stage20_crosscommit_not_ancestor":"stage20_crosscommit_ancestry_unavailable");
    // Git pathspec excludes ONLY the entire data tree. All other repository
    // source, workflow, lockfile, config and trust policy changes deny parity.
    const diff=git(repoRoot,[
      "diff","--quiet","--exit-code",producerCommit,consumerCommit,
      "--",".",":(exclude)data",":(exclude)data/"
    ]);
    if(diff.error || diff.status!==0)
      return denial(diff.status===1?
        "stage20_crosscommit_nondata_changed":"stage20_crosscommit_comparison_unavailable");
    return {
      schema:STAGE20_CROSSCOMMIT_PROOF_SCHEMA,
      accepted:true,reason:null,producerCommit,consumerCommit,
      monotonicAncestor:true,nonDataContentEqual:true,
      dataInputsVerified:false,dependencyDAGVerified:false,
      stageCodeCompatibilityVerified:false,
      resumeAuthorized:false,publicationAuthorized:false
    };
  }catch {
    return denial("stage20_crosscommit_unexpected_error");
  }
}
