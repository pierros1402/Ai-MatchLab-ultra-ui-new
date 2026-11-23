import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {inspectAcquisitionRows} from "./audit-stage20-value-acquisition-census.mjs";
const bytes=Buffer.from('{"hello":true,"rows":[1,2]}');
const hash=crypto.createHash("sha256").update(bytes).digest("hex");
const row={path:"data/value-data-acquisition/example.json",bytes:bytes.length,sha256:hash};
test("exact byte and shape census never gives admission",()=>{
  const x=inspectAcquisitionRows([row],()=>bytes);
  assert.equal(x.files,1);assert.equal(x.bytes,bytes.length);
  assert.equal(x.rootTypes.object,1);
  for(const k of ["safeForCrossRunReuse","producerContractMatched","omissionAuthorized",
    "stageSkipAuthorized","publicationAuthorized","externalInputFreshnessProven"])
    assert.equal(x[k],false);
});
test("tampered content is rejected",()=>{
  assert.throws(()=>inspectAcquisitionRows([row],()=>Buffer.from('{"hello":false}')),/acquisition_bytes_mismatch/);
});
test("invalid json with matching hash is rejected",()=>{
  const broken=Buffer.from('{"oops":');
  const r={...row,bytes:broken.length,sha256:crypto.createHash("sha256").update(broken).digest("hex")};
  assert.throws(()=>inspectAcquisitionRows([r],()=>broken),/acquisition_json_invalid/);
});
test("duplicates, traversal and unexpected extension fail closed",()=>{
  assert.throws(()=>inspectAcquisitionRows([row,row],()=>bytes),/acquisition_path_invalid/);
  for(const path of ["data/value-data-acquisition/../x.json",
    "data/value-data-acquisition/x.gz","data/value-data-acquisition/../../x.json"])
    assert.throws(()=>inspectAcquisitionRows([{...row,path}],()=>bytes),/acquisition_path_invalid/);
});
test("manifest byte/sha mismatch and non-buffer refused",()=>{
  assert.throws(()=>inspectAcquisitionRows([{...row,bytes:3}],()=>bytes),/acquisition_bytes_mismatch/);
  assert.throws(()=>inspectAcquisitionRows([row],()=>bytes.toString()),/acquisition_bytes_mismatch/);
});
