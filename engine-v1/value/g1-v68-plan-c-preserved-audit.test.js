import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
 buildPlanCShadowExportAudit,
 unavailablePlanCShadowDay,
 validatePlanCShadowPreservedAudit,
 PLAN_C_SHADOW_DAY_SCHEMA
} from "./plan-c-shadow-export.js";

const day="2026-08-26";
const exportedAt="2026-08-26T10:00:00.000Z";
const sha=x=>crypto.createHash("sha256").update(x).digest("hex");

function fixture(available){
 const payload=available?{
   schema:PLAN_C_SHADOW_DAY_SCHEMA,
   ok:true,available:true,mode:"SHADOW",productionEligible:false,
   date:day,generatedAt:exportedAt,
   sourcePredictionSetHash:sha("predictions"),
   count:0,pickCount:0,entries:[]
 }:unavailablePlanCShadowDay(day);
 const audit=buildPlanCShadowExportAudit(day,{
   payload,sourceMissing:!available,
   sourceSha256:available?sha("source bytes"):null
 },exportedAt);
 return {payload,audit};
}

for(const available of [true,false]){
 const kind=available?"available":"unavailable";

 test("G1 V68 accepts coherent "+kind+" shadow audit",()=>{
  const {payload,audit}=fixture(available);
  assert.deepEqual(
   validatePlanCShadowPreservedAudit(audit,payload,day),
   {ok:true,errors:[]}
  );
 });

 const defects=[
  ["schema",audit=>audit.schema="wrong"],
  ["audit_ok",audit=>audit.ok=false],
  ["date",audit=>audit.date="2026-08-25"],
  ["exported_at",audit=>audit.exportedAt="invalid"],
  ["mode",audit=>audit.mode="PRODUCTION"],
  ["production_eligible",audit=>audit.productionEligible=true],
  ["plans_affected",audit=>audit.officialPlansUnaffected=false],
  ["source_path",audit=>audit.sourcePath="data/wrong.json"],
  ["availability",audit=>audit.available=!available],
  ["count",audit=>audit.count=7],
  ["pick_count",audit=>audit.pickCount=7],
  ["source_type",audit=>audit.source="unknown"],
  ["source_hash",audit=>audit.sourceSha256=available?"invalid":sha("unexpected")]
 ];

 for(const [name,mutate] of defects){
  test("G1 V68 rejects "+kind+" audit "+name,()=>{
   const {payload,audit}=fixture(available);
   mutate(audit);
   const result=validatePlanCShadowPreservedAudit(audit,payload,day);
   assert.equal(result.ok,false,name);
   assert.ok(result.errors.length>0);
  });
 }
}

test("G1 V68 rejects missing audit",()=>{
 const {payload}=fixture(true);
 assert.equal(
  validatePlanCShadowPreservedAudit(null,payload,day).ok,
  false
 );
});

test("G1 V68 does not mutate valid frozen payload or audit",()=>{
 const {payload,audit}=fixture(true);
 const before=JSON.stringify({payload,audit});
 assert.equal(
  validatePlanCShadowPreservedAudit(audit,payload,day).ok,
  true
 );
 assert.equal(JSON.stringify({payload,audit}),before);
});
