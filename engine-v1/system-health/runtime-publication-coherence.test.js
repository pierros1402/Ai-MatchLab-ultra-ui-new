import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { runtimePublicationCoherence as check } from "./runtime-publication-coherence.js";
const date = "2026-11-11";
const sha = "a".repeat(64);
const ref = "b".repeat(40);
const latest = {date,hash:sha};
const manifest = {date,hash:sha};
const runtimeSync = {schema:"ai-matchlab.runtime-snapshot-sync.v2",latestDay:date,latestRef:ref,days:{[date]:{ref,manifestHash:sha,latestPromoted:true}}};
test("matching latest, manifest and completed sync witness passes",()=>{
 assert.deepEqual(check({latest,manifest,runtimeSync}).reasonCodes,[]);
 assert.equal(check({latest,manifest,runtimeSync}).status,"PASS");
});
test("missing witness is HOLD rather than fabricated green",()=>{
 const result=check({latest,manifest,runtimeSync:null});
 assert.equal(result.verified,false);
 assert.ok(result.reasonCodes.includes("runtime_sync_witness_missing_or_invalid"));
});
test("new manifest with old state is HOLD",()=>{
 const result=check({latest,manifest,runtimeSync:{...runtimeSync,days:{[date]:{ref,manifestHash:"c".repeat(64),latestPromoted:true}}}});
 assert.ok(result.reasonCodes.includes("runtime_sync_day_witness_mismatch"));
});
test("new state with old manifest is HOLD",()=>{
 const result=check({latest,manifest:{date,hash:"c".repeat(64)},runtimeSync});
 assert.ok(result.reasonCodes.includes("latest_manifest_binding_mismatch"));
});
test("latest day and runtime day mismatch is HOLD",()=>{
 const result=check({latest,manifest,runtimeSync:{...runtimeSync,latestDay:"2026-11-10"}});
 assert.ok(result.reasonCodes.includes("runtime_sync_latest_day_mismatch"));
});
test("unpromoted same-day witness cannot become PASS",()=>{
 const result=check({latest,manifest,runtimeSync:{...runtimeSync,days:{[date]:{ref,manifestHash:sha,latestPromoted:false}}}});
 assert.ok(result.reasonCodes.includes("runtime_sync_day_witness_mismatch"));
});
test("invalid pointer is HOLD",()=>{
 const result=check({latest:{date:"../escape",hash:sha},manifest,runtimeSync});
 assert.equal(result.status,"HOLD");
 assert.ok(result.reasonCodes.includes("latest_pointer_missing_or_invalid"));
});
test("real release endpoint reports cross-artifact coherence",()=>{
 const source=fs.readFileSync(new URL("../index.js",import.meta.url),"utf8");
 assert.match(source,/runtimePublicationCoherence\(\{ latest, manifest: latestManifest, runtimeSync \}\)/);
 assert.match(source,/runtimePublicationConsistency: publicationConsistency/);
});
