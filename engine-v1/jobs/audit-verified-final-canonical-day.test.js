import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {auditVerifiedFinalsDay} from "./audit-verified-final-canonical-day.js";

function withFixture(fn) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"aiml-final-audit-"));
  try {
    const day="2026-10-29";
    const canonical=path.join(root,"data","canonical-fixtures",day);
    const finals=path.join(root,"data","final-results",day);
    fs.mkdirSync(canonical,{recursive:true});
    fs.mkdirSync(finals,{recursive:true});
    const fixture={canonicalId:"cid_1",homeScore:1,awayScore:2};
    const final={schema:"ai-matchlab.verified-final-result.v1",verifiedFinalTruth:true,
      matchId:"cid_1",dayKey:day,homeScore:1,awayScore:2};
    fs.writeFileSync(path.join(canonical,"league.json"),JSON.stringify({fixtures:[fixture]}));
    fs.writeFileSync(path.join(finals,"cid_1.json"),JSON.stringify(final));
    fn({root,day,canonical,finals,fixture,final});
  } finally {fs.rmSync(root,{recursive:true,force:true});}
}
test("read-only reconciliation matches exact verified score and preserves input bytes",()=>{
  withFixture(x=>{
    const file=path.join(x.finals,"cid_1.json");
    const before=fs.readFileSync(file);
    const result=auditVerifiedFinalsDay({root:x.root,dayKey:x.day});
    assert.equal(result.ok,true);assert.equal(result.matched,1);
    assert.equal(result.approvedForWrite,false);
    assert.deepEqual(fs.readFileSync(file),before);
  });
});
test("read-only reconciliation flags final score disagreements without repair",()=>{
  withFixture(x=>{
    const file=path.join(x.finals,"cid_1.json");
    fs.writeFileSync(file,JSON.stringify({...x.final,homeScore:3}));
    const before=fs.readFileSync(file);
    const result=auditVerifiedFinalsDay({root:x.root,dayKey:x.day});
    assert.equal(result.ok,false);
    assert.ok(result.issues.some(e=>e.reason==="final_score_disagreement"));
    assert.deepEqual(fs.readFileSync(file),before);
  });
});
test("read-only reconciliation flags missing canonical fixture",()=>{
  withFixture(x=>{
    fs.writeFileSync(path.join(x.canonical,"league.json"),JSON.stringify({fixtures:[]}));
    const result=auditVerifiedFinalsDay({root:x.root,dayKey:x.day});
    assert.equal(result.ok,false);
    assert.ok(result.issues.some(e=>e.reason==="canonical_fixture_not_found"));
  });
});
