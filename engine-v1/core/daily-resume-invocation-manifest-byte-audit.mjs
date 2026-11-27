// Offline receipt evidence verification; does not establish runtime provenance.
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {inventoryDataTree,compareDataInventories} from "./daily-resume-complete-data-inventory.mjs";
import {verifyPrepostDeltaArchive} from "./daily-resume-prepost-delta-archive.mjs";
import {auditInvocationReceiptCandidate} from "./daily-resume-invocation-receipt-candidate.mjs";
const schema="ai-matchlab.daily-invocation-manifest-byte-audit.v1";
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
function need(ok,reason){if(!ok)throw Error(reason);}
function directory(p){
 need(typeof p==="string"&&path.isAbsolute(p),"receipt_evidence_root_invalid");
 const real=fs.realpathSync(p);
 need(real===path.resolve(p)&&fs.lstatSync(real).isDirectory(),"receipt_evidence_root_invalid");
 return real;
}
export function auditInvocationManifestBytes({binding,source,census,receipt,beforeRoot,afterRoot,archiveRoot}={}){
 const deny=reason=>({schema,accepted:false,reason,manifestBytesVerified:false,deltaPayloadVerified:false,runtimeAttested:false,writerQuiescenceAttested:false,checkpointReusable:false,resumeAuthorized:false,publicationAuthorized:false});
 try {
  const candidate=auditInvocationReceiptCandidate({binding,source,census,receipt});
  need(candidate.accepted,"receipt_candidate_not_verified");
  const pre=directory(beforeRoot),post=directory(afterRoot);
  need(pre!==post&&!pre.startsWith(post+path.sep)&&!post.startsWith(pre+path.sep),"receipt_evidence_roots_not_independent");
  const before=inventoryDataTree(pre,binding.dayKey),after=inventoryDataTree(post,binding.dayKey);
  need(before.sourceCommit===binding.producerCommit&&after.sourceCommit===binding.producerCommit,"receipt_manifest_commit_mismatch");
  need(before.manifestSha256===receipt.inputManifestSha256&&after.manifestSha256===receipt.outputManifestSha256,"receipt_manifest_digest_mismatch");
  const delta=compareDataInventories(before,after);
  const deltaSha256=hash(JSON.stringify(delta));
  need(deltaSha256===receipt.deltaManifestSha256,"receipt_delta_digest_mismatch");
  if(delta.changes.length){
   const archive=directory(archiveRoot);
   need([pre,post].every(root=>archive!==root&&!archive.startsWith(root+path.sep)&&!root.startsWith(archive+path.sep)),"receipt_archive_root_overlap");
   const checked=verifyPrepostDeltaArchive(archive,before,after);
   need(checked.ok===true&&checked.entries===delta.changes.length,"receipt_delta_archive_invalid");
  }else need(archiveRoot===undefined||archiveRoot===null,"receipt_noop_archive_unexpected");
  // Repeat both full inventories to detect evidence drift during verification.
  need(inventoryDataTree(pre,binding.dayKey).manifestSha256===before.manifestSha256&&inventoryDataTree(post,binding.dayKey).manifestSha256===after.manifestSha256,"receipt_evidence_tree_drift");
  return {schema,accepted:true,reason:null,receiptSha256:receipt.receiptSha256,
   beforeSha256:before.manifestSha256,afterSha256:after.manifestSha256,deltaSha256,
   added:delta.added,modified:delta.modified,deleted:delta.deleted,
   manifestBytesVerified:true,deltaPayloadVerified:delta.changes.length>0,verifiedNoop:delta.changes.length===0,
   runtimeAttested:false,writerQuiescenceAttested:false,checkpointReusable:false,resumeAuthorized:false,publicationAuthorized:false};
 }catch(e){return deny(e.message);}
}
