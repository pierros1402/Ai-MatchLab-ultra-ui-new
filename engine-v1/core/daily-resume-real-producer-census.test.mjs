import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
const root=new URL("../../",import.meta.url);
const manifest=JSON.parse(fs.readFileSync(new URL("./daily-resume-real-producer-census.json",import.meta.url),"utf8"));
const blob=b=>crypto.createHash("sha1").update("blob "+b.length+"\\0".replace("\\0","\0")).update(b).digest("hex");
const producers=["buildStandingsDay","buildDetailsDay","buildValueDay","checkpointDailyPlanA","exportDeploySnapshotDay","buildModelPriors"];
test("seven exact source blobs remain pinned",()=>{
 assert.equal(manifest.sources.length,7);
 assert.equal(new Set(manifest.sources.map(x=>x.path)).size,7);
 for(const s of manifest.sources)assert.equal(blob(fs.readFileSync(new URL(s.path,root))),s.blob,s.path);
});
test("all selected literal direct call lines match reviewed census",()=>{
 const cycle=fs.readFileSync(new URL("engine-v1/jobs/run-daily-cycle.js",root),"utf8");
 const calls=cycle.split("\n").flatMap((line,i)=>producers.filter(n=>new RegExp("\\b"+n+"\\s*\\(").test(line)).map(n=>({producer:n,line:i+1,sourceLine:line.trim()})));
 assert.equal(calls.length,13);
 assert.deepEqual(calls,manifest.calls);
});
test("census cannot grant checkpoint authority",()=>{
 assert.equal(manifest.coverage,"selected_direct_calls_only");
 for(const k of ["transitiveClosureVerified","artifactOwnershipVerified","resumeAuthorized","publicationAuthorized"])assert.equal(manifest[k],false);
});
