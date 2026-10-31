import {readFileSync,writeFileSync,existsSync} from "node:fs";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
const definitions=[
 {name:"G2_FIXTURES",path:"g2-two-pass-fixtures-result.json",expected:20,pass:"PASS_G2_TWO_PASS_FIXTURES_ONLY",count:"successfulTargets",total:"selectedTargetCount"},
 {name:"G2_FIXTURES_ALL",path:"g2-fixtures-all-two-pass.json",expected:24,pass:"PASS_G2_FIXTURES_ALL_TWO_PASS_ONLY",count:"passed",total:"expected"},
 {name:"G2_ODDS",path:"g2-odds-two-pass.json",expected:8,pass:"PASS_G2_ODDS_DETERMINISM_ONLY",count:"passed",total:"expected"},
 {name:"G2_DETAILS",path:"g2-details-two-pass.json",expected:66,pass:"PASS_G2_DETAILS_DETERMINISM_ONLY",count:"passed",total:"expected"},
 {name:"G2_MANIFEST_REFERENCES",path:"g2-manifest-integrity.json",expected:20,pass:"PASS_G2_MANIFEST_REFERENCES_ONLY",count:"passed",total:"expected"},
];
const sha=b=>createHash("sha256").update(b).digest("hex");
const rows=definitions.map(item=>{
 if(!existsSync(item.path))return {name:item.name,state:"HOLD",reason:"EVIDENCE_MISSING",expected:item.expected};
 try{
  const bytes=readFileSync(item.path),e=JSON.parse(bytes.toString("utf8"));
  const passed=Number(e[item.count]),expected=Number(e[item.total]);
  const valid=e.readOnly===true&&e.writeAuthorized===false&&e.status===item.pass&&
   passed===item.expected&&expected===item.expected;
  return {name:item.name,state:valid?"CLOSED_SCOPE_ONLY":"HOLD",
   reason:valid?"TWO_PASS_SCOPE_ATTESTED":"REPORT_FAILED_OR_INCOMPLETE",
   evidence:item.path,evidenceSha256:sha(bytes),passed,expected,status:e.status};
 }catch(err){return {name:item.name,state:"HOLD",reason:"EVIDENCE_INVALID",detail:String(err.message||err)};}
});
const result={schema:"ai-matchlab.g2-closure-ledger.v1",
 gitHead:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),
 approval:"NO_WRITE_AUTHORITY",applicationAuthorized:false,mergeAuthorized:false,deployAuthorized:false,
 meaningOfClosed:"Only the stated read-only producer or structural-reference validation scope, never historical identity truth or deployment.",
 entries:rows,closed:rows.filter(x=>x.state==="CLOSED_SCOPE_ONLY").length,
 held:rows.filter(x=>x.state==="HOLD").length,
 projectFullyRestored:false};
writeFileSync("g2-closure-ledger.json",JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify({closed:result.closed,held:result.held,entries:rows.map(x=>[x.name,x.state,x.passed])}));
