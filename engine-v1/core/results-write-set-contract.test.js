import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {verifyResultsWriteSetManifest as verify} from "./results-write-set-contract.js";
const h=b=>createHash("sha256").update(b).digest("hex");
const entry=(path="data/league-memory/results/eng.1.json",before="old",after="new")=>{
 const beforeBytes=Buffer.from(before),afterBytes=Buffer.from(after);
 return {m:{path,status:"M",beforeSha256:h(beforeBytes),afterSha256:h(afterBytes)},
  s:{path,status:"M",beforeBytes,afterBytes}};
};
const check=(m,s)=>verify({schema:"ai-matchlab.results-write-set.v1",entries:m},s);
test("exact two-file correction set passes only byte-identical content and matching paths",()=>{
 const a=entry(),b=entry("data/league-memory/results/nor.1.json");
 assert.equal(check([a.m,b.m],[b.s,a.s]).ok,true);
});
test("rejects unapproved additions and partial staged sets",()=>{
 const a=entry(),b=entry("data/league-memory/results/nor.1.json");
 assert.ok(check([a.m],[a.s,b.s]).failures.some(f=>f.reason==="write_set_unapproved_staged_path"));
 assert.ok(check([a.m,b.m],[a.s]).failures.some(f=>f.reason==="write_set_missing_staged_path"));
});
test("detects changed baseline and changed candidate bytes",()=>{
 const a=entry();
 assert.ok(check([a.m],[{...a.s,beforeBytes:Buffer.from("tampered")}]).failures.some(f=>f.reason==="write_set_content_hash_mismatch"));
 assert.ok(check([a.m],[{...a.s,afterBytes:Buffer.from("tampered")}]).failures.some(f=>f.reason==="write_set_content_hash_mismatch"));
});
test("rejects duplicated, path traversal, deletion and renamed entries",()=>{
 const a=entry();
 assert.equal(check([a.m,a.m],[a.s]).ok,false);
 assert.equal(check([{...a.m,path:"data/league-memory/results/../evil.json"}],[a.s]).ok,false);
 assert.equal(check([{...a.m,status:"D"}],[a.s]).ok,false);
 assert.equal(check([a.m],[{...a.s,status:"R"}]).ok,false);
});
test("rejects malformed and empty authorization descriptions",()=>{
 const a=entry();
 assert.equal(verify({},[a.s]).ok,false);
 assert.equal(check([],[]).ok,false);
 assert.equal(check([{...a.m,afterSha256:"unknown"}],[a.s]).ok,false);
});
