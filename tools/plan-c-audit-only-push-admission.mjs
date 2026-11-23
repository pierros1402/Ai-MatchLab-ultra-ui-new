// P0: Only unrelated, read-only Stage20 audit source may cross a finished
// Plan C data release. Any runtime, production data, or unknown path denies.
const allowed=[
  /^tools\/audit-stage20-[a-z0-9-]+\.(?:mjs|test\.mjs)$/,
  /^\.github\/workflows\/p0-stage20-[a-z0-9-]+\.ya?ml$/
];
export function decidePlanCAuditOnlyRemoteDiff(paths){
  if(!Array.isArray(paths)||paths.length===0)return {ok:false,reason:"missing_remote_diff"};
  const seen=new Set();
  for(const p of paths){
    if(typeof p!=="string"||p.length===0||p.includes("\0")||p.includes("\\")||seen.has(p)||!allowed.some(re=>re.test(p)))
      return {ok:false,reason:"remote_change_outside_readonly_audit"};
    seen.add(p);
  }
  return {ok:true,reason:"audit_only_remote_changes",files:seen.size};
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href){
  const raw=await new Promise((resolve,reject)=>{
    const chunks=[];process.stdin.on("data",x=>chunks.push(x));
    process.stdin.on("end",()=>resolve(Buffer.concat(chunks)));
    process.stdin.on("error",reject);
  });
  const paths=raw.toString("utf8").split("\0").filter(Boolean);
  const decision=decidePlanCAuditOnlyRemoteDiff(paths);
  console.log(JSON.stringify(decision));
  if(!decision.ok)process.exitCode=1;
}
