import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {verifyGraph,verifyRepositoryGraph} from "./daily-resume-static-import-graph.mjs";
const blob=b=>crypto.createHash("sha1").update("blob "+b.length+"\0").update(b).digest("hex");
const a="engine-v1/a.js",b="engine-v1/b.js";
const files=new Map([[a,Buffer.from('import "./b.js";')],[b,Buffer.from('export const x=1;')]]);
const fixture=()=>({schema:"ai-matchlab.daily-static-import-graph.v1",sourceCommit:"a".repeat(40),coverage:"lexical_relative_imports_only",sourceClosureVerified:false,artifactOwnershipVerified:false,resumeAuthorized:false,publicationAuthorized:false,frontier:[],unresolved:[],roots:[a],nodes:[{path:a,blob:blob(files.get(a)),edges:[b]},{path:b,blob:blob(files.get(b)),edges:[]}]});
const verify=g=>verifyGraph(g,p=>files.get(p));
test("real repository graph closes and binds all source bytes",()=>{const r=verifyRepositoryGraph();assert.equal(r.nodes,255);assert.equal(r.edges,805);assert.equal(r.resumeAuthorized,false);assert.equal(r.publicationAuthorized,false);});
test("fixture accepted",()=>assert.equal(verify(fixture()).nodes,2));
for(const [name,change] of [
["missing node",g=>g.nodes.pop()],
["omitted edge",g=>g.nodes[0].edges=[]],
["invented edge",g=>g.nodes[1].edges=[a]],
["source drift",g=>g.nodes[0].blob="0".repeat(40)],
["duplicate",g=>g.nodes.push(g.nodes[0])],
["frontier",g=>g.frontier=[b]],
["unresolved",g=>g.unresolved=[b]],
["authority",g=>g.resumeAuthorized=true],
["publication",g=>g.publicationAuthorized=true],
["runtime closure claim",g=>g.sourceClosureVerified=true],
["unreachable node",g=>g.nodes.push({path:"engine-v1/c.js",blob:"0".repeat(40),edges:[]})],
["path traversal",g=>g.nodes[0].path="engine-v1/../a.js"]
])test("reject "+name,()=>{const g=fixture();change(g);assert.throws(()=>verify(g));});

