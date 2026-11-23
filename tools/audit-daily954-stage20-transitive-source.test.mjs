import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {
  scanStaticSourceImports,compareStage20SourceClosures,auditStage20SourceClosure
} from "./audit-daily954-stage20-transitive-source.mjs";
const git=(root,...args)=>execFileSync("git",args,{cwd:root,encoding:"utf8"}).trim();
function fixture(fn) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"aiml-closure-"));
  try{
    git(root,"init","-q","--initial-branch=main");
    git(root,"config","user.name","Synthetic Audit");
    git(root,"config","user.email","ci@example.invalid");
    fs.mkdirSync(path.join(root,"engine-v1/jobs"),{recursive:true});
    fs.mkdirSync(path.join(root,"engine-v1/core"),{recursive:true});
    fs.mkdirSync(path.join(root,".github/workflows"),{recursive:true});
    fs.writeFileSync(path.join(root,"engine-v1/jobs/run-daily-cycle.js"),
      'import { foo } from "../core/foo.js";\nexport const value=foo;\n');
    fs.writeFileSync(path.join(root,"engine-v1/core/foo.js"),"export const foo=1;\n");
    fs.writeFileSync(path.join(root,".github/workflows/daily-deploy-snapshot.yml"),"name: Synthetic\n");
    git(root,"add",".");git(root,"commit","-qm","producer");
    const producer=git(root,"rev-parse","HEAD");
    fs.writeFileSync(path.join(root,"engine-v1/core/foo.js"),"export const foo=2;\n");
    git(root,"add",".");git(root,"commit","-qm","consumer");
    fn({root,producer,consumer:git(root,"rev-parse","HEAD")});
  }finally{fs.rmSync(root,{recursive:true,force:true});}
}
test("literal ESM side-effect and CJS specifiers identified",()=>{
  const found=scanStaticSourceImports('import "./a.js";\nimport x from "./b.js";\nexport {y} from "./c.js";\nconst x2=require("./d.cjs");');
  assert.deepEqual(found.specifiers,["./a.js","./b.js","./c.js","./d.cjs"]);
});
test("dynamic imports, process launch and filesystem writes remain risks",()=>{
  const found=scanStaticSourceImports('const m=import(dynamicName); spawnSync("node",[]); fs.writeFileSync(file,"x");');
  assert.ok(found.riskFlags.includes("dynamic_import_call"));
  assert.ok(found.riskFlags.includes("process_launch_call"));
  assert.ok(found.riskFlags.includes("filesystem_data_access"));
});
test("real Git blob transitive import mutation detected without reuse authority",()=>fixture(x=>{
  const result=auditStage20SourceClosure(x.root,x.consumer,x.producer);
  assert.equal(result.producerModules,2);
  assert.equal(result.consumerModules,2);
  assert.equal(result.transitiveStaticChangedCount,1);
  assert.deepEqual(result.transitiveStaticChangedFiles.map(x=>x.path),["engine-v1/core/foo.js"]);
  assert.equal(result.runtimeDependencyClosureProven,false);
  assert.equal(result.crossCommitResumeAuthorized,false);
}));
test("even equal static fingerprints cannot authorize runtime reuse",()=>{
  const entries=[{path:"a.js",sha256:"f".repeat(64)}];
  const a={commit:"a".repeat(40),entry:"a.js",files:1,staticFingerprint:"x",entries,unresolved:[],externalPackages:[],riskFlags:[]};
  const b={...a,commit:"b".repeat(40)};
  const r=compareStage20SourceClosures(a,b);
  assert.equal(r.transitiveStaticChangedCount,0);
  assert.equal(r.runtimeDependencyClosureProven,false);
  assert.equal(r.immutableInputLineageVerified,false);
  assert.equal(r.crossCommitResumeAuthorized,false);
});
test("missing relative dependency remains counted and unapproved",()=>fixture(x=>{
  const f=path.join(x.root,"engine-v1/jobs/run-daily-cycle.js");
  fs.writeFileSync(f,'import "./missing.js";\n');
  git(x.root,"add",".");git(x.root,"commit","-qm","missing module");
  const r=auditStage20SourceClosure(x.root,git(x.root,"rev-parse","HEAD"),x.producer);
  assert.ok(r.consumerUnresolvedCount>0);
  assert.equal(r.crossCommitResumeAuthorized,false);
}));
test("unknown commit and unresolvable source denied",()=>fixture(x=>{
  assert.throws(()=>auditStage20SourceClosure(x.root,"0".repeat(40),x.producer));
}));

test("ordinary prose and logging strings containing from are not imported modules",()=>{
  const src='console.log("0 picks generated from analysis");\n'+
    'const text="no data from source";\n'+
    'import x from "node:fs/promises";\n';
  const scan=scanStaticSourceImports(src);
  assert.deepEqual(scan.specifiers,["node:fs/promises"]);
});
