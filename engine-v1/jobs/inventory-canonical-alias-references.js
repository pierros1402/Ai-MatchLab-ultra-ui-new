import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

// READ ONLY: exact string inventory in tracked repository files. No data migration.
export const aliases=Object.freeze([
 "cid_afccup_tampinesrovers_preahkhanreachsvayrieng_20261029",
 "cid_afccup_tampinesrovers_pkrsvayrieng_20261029"
]);
export function inventoryCanonicalAliasReferences(root, ids=aliases) {
 const files=execFileSync("git",["ls-files","-z"],{cwd:root,maxBuffer:64*1024*1024})
  .toString("utf8").split("\0").filter(Boolean);
 // Git searches the index first, so only files actually containing one of the
 // exact aliases need to be opened. A no-match exit is valid; other errors fail.
 let hits;
 try {
   hits=execFileSync("git",["grep","-I","-l","-z","-F",...ids.flatMap(id=>["-e",id]),"--","data"],{
     cwd:root,maxBuffer:64*1024*1024
   }).toString("utf8").split("\0").filter(Boolean);
 } catch(error) {
   if(error.status!==1) throw error;
   hits=[];
 }
 const references=[],totals=Object.fromEntries(ids.map(id=>[id,0]));
 for(const file of hits) {
   if (!file.startsWith("data/")) continue;
   const full=path.join(root,file);
   if (!fs.existsSync(full)||!fs.statSync(full).isFile()) continue;
   const source=fs.readFileSync(full,"utf8");
   for(const id of ids) {
     const occurrences=source.split(id).length-1;
     if(occurrences) {references.push({path:file,id,occurrences});totals[id]+=occurrences;}
   }
 }
 return {readOnly:true,approvedForWrite:false,trackedFiles:files.length,
  affectedFiles:new Set(references.map(x=>x.path)).size,totals,references};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 const report=inventoryCanonicalAliasReferences(process.cwd());
 console.log(JSON.stringify(report,null,2));
 if(Object.values(report.totals).some(n=>n===0))process.exitCode=1;
}
