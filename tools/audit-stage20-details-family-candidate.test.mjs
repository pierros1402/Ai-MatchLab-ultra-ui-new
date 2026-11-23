import test from "node:test";
import assert from "node:assert/strict";
import {classifyDetailsCandidate} from "./audit-stage20-details-family-candidate.mjs";
test("valid canonical file and date is candidate only",()=>{
  const r=classifyDetailsCandidate("data/details/2026-11-23/cid_eng1_arsenal_chelsea_20261123.json");
  assert.equal(r.eligible,true);assert.equal(r.date,"2026-11-23");
});
test("other-day legitimate canonical details remain date-bound",()=>{
  assert.equal(classifyDetailsCandidate("data/details/2026-11-22/cid_eng1_arsenal_chelsea_20261122.json").eligible,true);
});
test("mismatched suffix and folder date fail closed",()=>{
  assert.equal(classifyDetailsCandidate("data/details/2026-11-23/cid_eng1_arsenal_chelsea_20261122.json").eligible,false);
});
test("invalid calendar day rejected",()=>{
  assert.equal(classifyDetailsCandidate("data/details/2026-02-30/cid_eng1_a_b_20260230.json").eligible,false);
});
test("arbitrary filename and legacy IDs not silently approved",()=>{
  for(const p of ["data/details/2026-11-23/private-key.json","data/details/2026-11-23/12345.json",
    "data/details/2026-11-23/CID_ENG1_X_20261123.json"])
    assert.equal(classifyDetailsCandidate(p).eligible,false);
});
test("traversal, nested unknown files and cross-family assets fail closed",()=>{
  for(const p of ["data/details/../secrets.json","data/details/2026-11-23/subdir/cid_x_20261123.json",
    "data/research-cache/2026-11-23/cid_eng1_a_b_20261123.json"])
    assert.equal(classifyDetailsCandidate(p).eligible,false);
});
