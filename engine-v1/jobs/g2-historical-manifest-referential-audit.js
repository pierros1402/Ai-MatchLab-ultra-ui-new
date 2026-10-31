import {readFileSync,writeFileSync,existsSync} from "node:fs";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
const sha=b=>createHash("sha256").update(b).digest("hex");
const before=execFileSync("git",["status","--porcelain","--untracked-files=no"],{encoding:"utf8"});
const registry=JSON.parse(readFileSync("historical-identity-register.json","utf8"));
const entries=registry.aliasReviewManifest?.entries;
if(!Array.isArray(entries)||!entries.length||registry.readOnly!==true||registry.approvedForWrite!==false||registry.aliasPreflight?.preflightQualifiedCount!==entries.length||!Array.isArray(registry.aliasSourceBoundManifest?.files))throw Error("G2_MANIFEST_SOURCE_REGISTER_INVALID");
const paths=[...new Set(entries.flatMap(e=>(e.dependencies||[]).map(d=>d.path)
 .filter(p=>/^data\/deploy-snapshots\/\d{4}-\d{2}-\d{2}\/manifest\.json$/.test(p))))].sort();
if(paths.length!==20)throw Error("G2_MANIFEST_TARGETS_CHANGED:"+paths.length);
const passed=[],held=[];
for(const path of paths){
 const day=path.split("/")[2],root="data/deploy-snapshots/"+day+"/";
 try{
  const raw=readFileSync(path),manifest=JSON.parse(raw);
  if(manifest.date!==day||manifest.ok!==true||!Array.isArray(manifest.details))throw Error("MANIFEST_SHAPE_MISMATCH");
  const fixtureFile=root+"fixtures.json";
  if(!existsSync(fixtureFile))throw Error("FIXTURES_ABSENT");
  const fixtures=JSON.parse(readFileSync(fixtureFile,"utf8"));
  const rows=Array.isArray(fixtures.fixtures)?fixtures.fixtures:fixtures.matches;
  if(!Array.isArray(rows))throw Error("FIXTURES_SHAPE_MISMATCH");
  const ids=new Set(rows.map(r=>r.canonicalId||r.matchId||r.id));
  if(ids.size!==rows.length||ids.has(undefined))throw Error("INVALID_FIXTURE_IDS");
  const fixtureCounts={manifestCountsFixtures:manifest.counts?.fixtures,
    manifestFixtureJsonCount:manifest.fixtureJsonCount,actualFixtureRows:rows.length};
  if(manifest.counts?.fixtures!==rows.length){
   throw Error("PUBLISHED_FIXTURE_COUNT_MISMATCH:"+JSON.stringify(fixtureCounts));
  }
  if(!Number.isInteger(manifest.fixtureJsonCount)||manifest.fixtureJsonCount<0){
   throw Error("SOURCE_FIXTURE_JSON_COUNT_INVALID");
  }
  if(manifest.counts?.details!==manifest.details.length)throw Error("DETAIL_COUNT_MISMATCH");
  const seen=new Set();
  for(const record of manifest.details){
   const file=record.file;
   if(typeof file!=="string"||!/^[-a-zA-Z0-9_.]+\.json$/.test(file)||seen.has(file))throw Error("UNSAFE_OR_DUPLICATE_DETAIL_NAME");
   seen.add(file);
   const detailPath=root+"details/"+file;
   if(!existsSync(detailPath))throw Error("DETAIL_MISSING:"+file);
   const bytes=readFileSync(detailPath);
   if(record.bytes!==bytes.length)throw Error("DETAIL_BYTE_LENGTH_MISMATCH:"+file+":expected="+record.bytes+":actual="+bytes.length);
   const id=record.canonicalId||record.matchId||file.replace(/\.json$/,"");
   if(!ids.has(id))throw Error("ORPHAN_DETAIL:"+file);
  }
  passed.push({path,manifestSha256:sha(raw),fixtures:rows.length,details:seen.size});
 }catch(e){held.push({path,reason:String(e.message||e)});}
}
if(before!==execFileSync("git",["status","--porcelain","--untracked-files=no"],{encoding:"utf8"}))held.push({reason:"TRACKED_WORKTREE_CHANGED"});
const result={schema:"ai-matchlab.g2-manifest-referential-integrity.v1",
 readOnly:true,writeAuthorized:false,semanticScope:"existing manifest-to-snapshot structural referential integrity, not historical truth",
 expected:20,passed:passed.length,held:held.length,
 status:held.length?"HOLD_G2_MANIFESTS":"PASS_G2_MANIFEST_REFERENCES_ONLY",outputs:passed,failures:held};
writeFileSync("g2-manifest-integrity.json",JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify({status:result.status,passed:result.passed,held:result.held}));
if(held.length)process.exitCode=1;
