import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const root=fileURLToPath(new URL("../../",import.meta.url));
export function verifyGraph(graph,read){
  assert.equal(graph.schema,"ai-matchlab.daily-static-import-graph.v1");
  assert.match(graph.sourceCommit,/^[a-f0-9]{40}$/);
  assert.equal(graph.coverage,"lexical_relative_imports_only");
  for(const flag of ["sourceClosureVerified","artifactOwnershipVerified","resumeAuthorized","publicationAuthorized"])assert.equal(graph[flag],false);
  assert.deepEqual(graph.frontier,[]);
  assert.deepEqual(graph.unresolved,[]);
  const nodes=new Map();
  for(const n of graph.nodes){
    assert.match(n.path,/^[A-Za-z0-9._/-]+$/);
    assert(n.path.startsWith("engine-v1/") || ["workers/_shared/leagues-coverage.js","workers/_shared/leagues-registry.js"].includes(n.path),"unapproved external source "+n.path);
    assert(!n.path.split("/").some(s=>!s||s==="."||s===".."));
    assert(!nodes.has(n.path),"duplicate node "+n.path);
    nodes.set(n.path,n);
  }
  const visited=new Set(), queue=[...graph.roots];
  assert.equal(new Set(queue).size,queue.length);
  assert(queue.length>0);
  while(queue.length){
    const p=queue.pop();
    if(visited.has(p))continue;
    const n=nodes.get(p);
    assert(n,"missing dependency "+p);
    visited.add(p);
    const b=read(p);
    const blob=crypto.createHash("sha1").update("blob "+b.length+"\0").update(b).digest("hex");
    assert.equal(blob,n.blob,"source drift "+p);
    const found=new Set();
    const pattern=/(?:\bfrom\s*|\bimport\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)["'](\.[^"'\n]+)["']/g;
    for(const match of b.toString("utf8").matchAll(pattern))found.add(path.posix.normalize(path.posix.join(path.posix.dirname(p),match[1])));
    assert.deepEqual([...found].sort(),n.edges,"edge drift "+p);
    queue.push(...n.edges);
  }
  assert.equal(visited.size,nodes.size,"unreachable nodes");
  return {nodes:nodes.size,edges:graph.nodes.reduce((s,n)=>s+n.edges.length,0),lexicalClosureVerified:true,resumeAuthorized:false,publicationAuthorized:false};
}
export function verifyRepositoryGraph(){
  const graph=JSON.parse(fs.readFileSync(new URL("./daily-resume-static-import-graph.json",import.meta.url),"utf8"));
  const census=JSON.parse(fs.readFileSync(new URL("./daily-resume-real-producer-census.json",import.meta.url),"utf8"));
  assert.deepEqual(graph.roots,census.sources.map(s=>s.path));
  for(const s of census.sources)assert.equal(graph.nodes.find(n=>n.path===s.path)?.blob,s.blob);
  return verifyGraph(graph,p=>fs.readFileSync(path.join(root,p)));
}
