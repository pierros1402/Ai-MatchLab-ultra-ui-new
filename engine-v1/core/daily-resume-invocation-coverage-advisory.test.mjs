import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {invocationContract} from "./daily-resume-runtime-invocations.mjs";
import {auditInvocationCoverage} from "./daily-resume-invocation-coverage-advisory.mjs";
const source=fs.readFileSync(new URL("../jobs/run-daily-cycle.js",import.meta.url),"utf8");
const census=JSON.parse(fs.readFileSync(new URL("./daily-resume-real-producer-census.json",import.meta.url),"utf8"));
function fixture(){
 const expected=invocationContract.map(r=>({id:r.id,scope:r.scope.endsWith("FoundationSeason")?"2026":"2026-11-27",requirement:r.guard==="always"?"required":"conditional-unresolved"}));
 return {source,census,expected,observed:expected.map(({id,scope})=>({id,scope,status:"completed"}))};
}
test("exact declared invocation inventory matches but never authorizes reuse",()=>{
 const r=auditInvocationCoverage(fixture());
 assert.equal(r.accepted,true);assert.equal(r.declaredInventoryMatched,true);
 assert.equal(r.coverageVerified,false);assert.equal(r.resumeAuthorized,false);assert.equal(r.publicationAuthorized,false);
});
test("missing observed conditional invocation remains unresolved",()=>{
 const f=fixture();f.observed.pop();
 const r=auditInvocationCoverage(f);assert.equal(r.accepted,true);assert.equal(r.declaredInventoryMatched,false);assert.equal(r.missing.length,1);
});
test("missing expected contract row is denied",()=>{
 const f=fixture();f.expected.pop();assert.equal(auditInvocationCoverage(f).reason,"invocation_contract_incomplete");
});
test("duplicate observation is denied",()=>{
 const f=fixture();f.observed.push(f.observed[0]);assert.equal(auditInvocationCoverage(f).reason,"invocation_observation_unplanned_or_duplicate");
});
test("always invocation cannot become conditional",()=>{
 const f=fixture();f.expected[0].requirement="conditional-unresolved";assert.equal(auditInvocationCoverage(f).reason,"invocation_required_downgrade");
});
test("source drift and incomplete observations fail closed",()=>{
 const f=fixture();f.source+="\n";assert.equal(auditInvocationCoverage(f).accepted,false);
 const g=fixture();g.observed[0].status="started";assert.equal(auditInvocationCoverage(g).reason,"invocation_observation_incomplete");
});
test("once invocation cannot be declared for multiple scopes",()=>{
 const f=fixture();f.expected.push({...f.expected[0],scope:"2026-11-28"});assert.equal(auditInvocationCoverage(f).reason,"invocation_multiplicity_invalid");
});
