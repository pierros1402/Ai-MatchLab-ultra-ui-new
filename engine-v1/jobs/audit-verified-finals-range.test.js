import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {auditVerifiedFinalsRange} from "./audit-verified-finals-range.js";

test("range audit flags absent days, never treating missing evidence as success",()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"aiml-history-range-"));
  try {
    const day="2026-10-29";
    const c=path.join(root,"data","canonical-fixtures",day);
    const f=path.join(root,"data","final-results",day);
    fs.mkdirSync(c,{recursive:true});fs.mkdirSync(f,{recursive:true});
    fs.writeFileSync(path.join(c,"league.json"),JSON.stringify({fixtures:[
      {canonicalId:"cid_1",scoreHome:1,scoreAway:0}]}));
    fs.writeFileSync(path.join(f,"cid_1.json"),JSON.stringify({
      matchId:"cid_1",dayKey:day,verifiedFinalTruth:true,homeScore:1,awayScore:0
    }));
    const report=auditVerifiedFinalsRange({root,fromDay:"2026-10-28",throughDay:day});
    assert.equal(report.ok,false);
    assert.equal(report.daysChecked,2);
    assert.equal(report.days[0].missing,true);
    assert.equal(report.days[1].matched,1);
    assert.ok(report.issues.some(x=>x.reason==="historical_source_day_missing"));
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
test("range audit refuses reversed or unbounded history windows",()=>{
  assert.throws(()=>auditVerifiedFinalsRange({root:"/invalid",fromDay:"2026-10-30",throughDay:"2026-10-29"}),/historical_audit_range_bounds/);
  assert.throws(()=>auditVerifiedFinalsRange({root:"/invalid",fromDay:"2025-01-01",throughDay:"2026-10-29"}),/historical_audit_range_bounds/);
});
