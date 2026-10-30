import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,dirname} from "node:path";
import {createHash} from "node:crypto";
import {preflightResultsWriteSet} from "./preflight-results-write-set-sandbox.js";

// This runner can write ONLY to its own freshly-created temporary root.
// Its source root is read-only; neither approval nor production publication is performed.
const hash=b=>createHash("sha256").update(b).digest("hex");
export function simulateResultsWriteSetTransaction({root,manifest,candidates,injectFailureAfter=-1}) {
 const prepared=preflightResultsWriteSet({root,manifest,candidates});
 const temp=mkdtempSync(join(tmpdir(),"aiml-write-set-transaction-"));
 const before=new Map();
 const written=[];
 let verified=false,rollbackVerified=false,failed=false;
 try {
  // Stage every source byte in private storage before any mutation.
  for(const e of prepared.hashes) {
   const original=readFileSync(join(root,e.path));
   if(hash(original)!==e.beforeSha256) throw Error("sandbox_source_changed_after_preflight");
   before.set(e.path,original);
   mkdirSync(dirname(join(temp,e.path)),{recursive:true});
   writeFileSync(join(temp,e.path),original,{flag:"wx"});
  }
  try {
   for(const e of prepared.hashes) {
    if(written.length===injectFailureAfter)throw Error("sandbox_injected_application_failure");
    writeFileSync(join(temp,e.path),candidates[e.path]);
    written.push(e.path);
   }
   verified=prepared.hashes.every(e=>hash(readFileSync(join(temp,e.path)))===e.afterSha256);
   if(!verified)throw Error("sandbox_post_write_verification_failed");
  } catch(error) {
   failed=true;
   for(const [path,bytes] of before)writeFileSync(join(temp,path),bytes);
   rollbackVerified=[...before].every(([path,bytes])=>hash(readFileSync(join(temp,path)))===hash(bytes));
   if(!rollbackVerified)throw Error("sandbox_rollback_verification_failed");
  }
  // The simulation's private copy must match the baseline after any failure
  // and the expected candidate after a successful run.
  const expectedState=failed?"beforeSha256":"afterSha256";
  const privateStateVerified=prepared.hashes.every(e=>
    hash(readFileSync(join(temp,e.path)))===e[expectedState]);
  if(!privateStateVerified)throw Error("sandbox_private_state_verification_failed");
  const sourceUnchanged=prepared.hashes.every(e=>hash(readFileSync(join(root,e.path)))===e.beforeSha256);
  if(!sourceUnchanged)throw Error("sandbox_source_mutated");
  return {ok:verified&&!failed,simulated:true,productionWrites:0,
   applied:verified?written.length:0,rolledBack:failed,rollbackVerified,
   sourceUnchanged,privateStateVerified,files:prepared.hashes.length};
 } finally {rmSync(temp,{recursive:true,force:true});}
}
