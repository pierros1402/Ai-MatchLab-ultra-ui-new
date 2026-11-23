import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {inspectTemporalRows} from "./audit-stage20-value-acquisition-temporal.mjs";
const path="data/value-data-acquisition/2026-11-23.json";
function fixture(doc){const bytes=Buffer.from(JSON.stringify(doc));return {rows:[{path,bytes:bytes.length,sha256:crypto.createHash("sha256").update(bytes).digest("hex")}],read:()=>bytes};}
test("valid self-declared time remains non-authoritative",()=>{
 const f=fixture({generatedAt:"2026-11-23T16:59:59.000Z"}),x=inspectTemporalRows(f.rows,f.read);
 assert.equal(x.parseableTopLevelTimeFields,1);
 for(const key of ["sourceTimestampAuthenticationProven","providerResponseEquivalenceProven","transitiveDependencyClosureVerified","timeEvidenceEstablishesFreshness","crossRunReuseAuthorized","checkpointAuthorized","omissionAuthorized"])assert.equal(x[key],false,key);
});
test("future invalid and absent top-level times are observed without approval",()=>{
 for(const [doc,key] of [[{generatedAt:"2026-11-23T17:00:00.001Z"},"futureTopLevelTimeFields"],[{generatedAt:"2026-99-99T00:00:00Z"},"invalidTopLevelTimeFields"],[{nested:{fetchedAt:"2026-11-23T16:00:00Z"}},"filesWithoutTopLevelTime"]]){
 const f=fixture(doc),x=inspectTemporalRows(f.rows,f.read);
 assert.equal(x[key],1);assert.equal(x.crossRunReuseAuthorized,false);
 }
});
test("duplicate, corrupt, changed bytes and unknown writer paths fail closed",()=>{
 const f=fixture({generatedAt:"2026-11-23T16:00:00Z"});
 assert.throws(()=>inspectTemporalRows([...f.rows,...f.rows],f.read),/temporal_manifest_invalid/);
 assert.throws(()=>inspectTemporalRows([{...f.rows[0],sha256:"0".repeat(64)}],f.read),/temporal_bytes_mismatch/);
 assert.throws(()=>inspectTemporalRows([{...f.rows[0],bytes:0}],f.read),/temporal_bytes_mismatch/);
 assert.throws(()=>inspectTemporalRows([{...f.rows[0],path:"data/value-data-acquisition/../foo.json"}],f.read),/temporal_manifest_invalid/);
 assert.throws(()=>inspectTemporalRows([{...f.rows[0],path:"data/value-data-acquisition/2026-11-23/unknown.json"}],f.read),/temporal_unknown_writer_path/);
});
test("nonobject document and malformed reference fail closed",()=>{
 const f=fixture([]);assert.throws(()=>inspectTemporalRows(f.rows,f.read),/temporal_invalid_root/);
 const g=fixture({});assert.throws(()=>inspectTemporalRows(g.rows,g.read,{reference:"tomorrow"}),/temporal_bad_arguments/);
});
