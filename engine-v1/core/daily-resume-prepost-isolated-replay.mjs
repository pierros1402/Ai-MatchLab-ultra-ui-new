// Isolated full-data reconstruction from a VERIFIED baseline and an admitted
// SHA-bound delta. This does not grant any production skip or publish authority.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {execFileSync} from "node:child_process";
import {
  inventoryDataTree, verifyDataInventory
} from "./daily-resume-complete-data-inventory.mjs";
import {verifyPrepostDeltaArchive} from "./daily-resume-prepost-delta-archive.mjs";
export const ISOLATED_REPLAY_SCHEMA="ai-matchlab.daily-stage20-complete-replay-proof.v1";
function check(ok,code){if(!ok)throw Error(code);}
function git(root,...args){
  return execFileSync("git",args,{cwd:root,encoding:"utf8",maxBuffer:4*1024*1024,timeout:60000}).trim();
}
function stableFile(root,name) {
  check(typeof name==="string" && name.startsWith("data/") &&
    name.length<512 && !name.includes("\\") && !name.includes("\0") &&
    name.split("/").every(p=>p && p!=="." && p!==".."),
    "stage20_replay_unsafe_path");
  let next=path.resolve(root);
  for(const part of name.split("/")){
    next=path.join(next,part);
    check(!fs.lstatSync(next).isSymbolicLink(),"stage20_replay_symlink_forbidden");
  }
  check(fs.statSync(next).isFile(),"stage20_replay_not_regular");
  return next;
}
function copyVerifiedBaseline(baselineRoot,stagingRoot,before) {
  // A clone contains HEAD's tracked files, not prior-stage tracked mutations
  // or ignored assets. Reconstruct the ENTIRE source baseline from inventory.
  fs.rmSync(path.join(stagingRoot,"data"),{recursive:true,force:true});
  for(const row of before.files) {
    const source=stableFile(baselineRoot,row.path);
    const target=path.join(stagingRoot,row.path);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.copyFileSync(source,target,fs.constants.COPYFILE_EXCL);
  }
  const scanned=inventoryDataTree(stagingRoot,before.dayKey);
  check(scanned.manifestSha256===before.manifestSha256,
    "stage20_replay_baseline_sha_mismatch");
}
export function replayPrepostDeltaToIsolatedClone({
  sourceRepoRoot, archiveRoot, before, after,
  parent=os.tmpdir()
}={}) {
  check(typeof sourceRepoRoot==="string" && typeof archiveRoot==="string" &&
    typeof parent==="string" && path.isAbsolute(parent),
    "stage20_replay_arguments_invalid");
  check(verifyDataInventory(before).ok && verifyDataInventory(after).ok,
    "stage20_replay_inventory_invalid");
  check(before.sourceCommit===after.sourceCommit && before.dayKey===after.dayKey,
    "stage20_replay_binding_mismatch");
  check(git(sourceRepoRoot,"rev-parse","HEAD")===before.sourceCommit,
    "stage20_replay_source_commit_mismatch");
  const verified=verifyPrepostDeltaArchive(archiveRoot,before,after);
  check(verified.ok,"stage20_replay_archive_invalid:"+verified.reason);
  const dest=fs.mkdtempSync(path.join(parent,"aiml-stage20-replay-"));
  try {
    fs.rmSync(dest,{recursive:true,force:true});
    execFileSync("git",["clone","--quiet","--no-hardlinks","--",
      path.resolve(sourceRepoRoot),dest],{
      encoding:"buffer",timeout:120000,maxBuffer:4*1024*1024
    });
    check(git(dest,"rev-parse","HEAD")===before.sourceCommit,
      "stage20_replay_clone_source_mismatch");
    // Do not write the source checkout or producer archive.
    copyVerifiedBaseline(sourceRepoRoot,dest,before);
    const manifest=JSON.parse(fs.readFileSync(path.join(archiveRoot,"manifest.json"),"utf8"));
    for(const e of manifest.entries) {
      const target=path.join(dest,e.path);
      if(e.op==="DELETE"){
        check(fs.existsSync(target) && fs.lstatSync(target).isFile() &&
          !fs.lstatSync(target).isSymbolicLink(),
          "stage20_replay_deletion_target_mismatch");
        fs.unlinkSync(target);
      }else {
        const source=stableFile(path.join(archiveRoot,"files"),e.path);
        const existed=fs.existsSync(target);
        if(existed)check(fs.lstatSync(target).isFile() &&
          !fs.lstatSync(target).isSymbolicLink(),"stage20_replay_target_invalid");
        fs.mkdirSync(path.dirname(target),{recursive:true});
        fs.copyFileSync(source,target,existed?0:fs.constants.COPYFILE_EXCL);
      }
    }
    const final=inventoryDataTree(dest,after.dayKey);
    check(final.manifestSha256===after.manifestSha256,
      "stage20_replay_final_tree_mismatch");
    return {
      schema:ISOLATED_REPLAY_SCHEMA,
      stagingClone:dest,
      dayKey:after.dayKey,sourceCommit:after.sourceCommit,
      beforeSha256:before.manifestSha256,afterSha256:after.manifestSha256,
      checkpointSha256:verified.evidenceSha256,
      totalFiles:final.fileCount,totalBytes:final.totalBytes,
      completeBaselineParity:true,completeFinalTreeParity:true,
      ignoredFilesIncluded:true,
      dynamicInputFreshnessVerified:false,
      productionStageResumeProven:false,resumeAuthorized:false,
      publicationAuthorized:false,productionWrites:0
    };
  }catch(error){
    fs.rmSync(dest,{recursive:true,force:true});
    throw error;
  }
}
