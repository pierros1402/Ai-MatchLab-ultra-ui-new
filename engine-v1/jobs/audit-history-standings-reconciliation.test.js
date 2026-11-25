import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {reconcile} from "./audit-history-standings-reconciliation.js";
test("gated roster cannot certify memory; exact keys distinguish sparse and missing",()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"reconcile-"));
 try{
 fs.mkdirSync(path.join(root,"data/standings"),{recursive:true});
 const rows=["a.1","b.1","c.1","d.1"].map(slug=>({slug,status:"REVIEW",teams:[{team:"A",distinctCandidateResults:slug==="c.1"?2:8}]}));
 for(const {slug} of rows)fs.writeFileSync(path.join(root,"data/standings",slug+".json"),JSON.stringify({league:slug,completeness:1,foundation:{usable:slug!=="a.1"},table:[{teamName:slug==="b.1"?"B":"A"}]}));
 assert.deepEqual(reconcile(root,{rows}).rows.map(r=>r.status),["ROSTER_AUTHORITY_HOLD","IDENTITY_OR_MEMORY_GAP","SPARSE_ACTIVE_MEMORY","ACTIVE_MEMORY_SAMPLE_PRESENT"]);
 assert.equal(reconcile(root,{rows}).fullCoverageCertified,false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
