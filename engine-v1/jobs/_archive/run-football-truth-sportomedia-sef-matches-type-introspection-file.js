import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const allowFetch = process.argv.includes("--allow-fetch");
const endpoint = "https://gql.sportomedia.se/graphql";

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-matches-type-introspection-${today}`);
const outPath = path.join(outDir, `sportomedia-sef-matches-type-introspection-${today}.json`);
const rowsPath = path.join(outDir, `sportomedia-sef-matches-type-introspection-rows-${today}.jsonl`);

function rel(p){ return path.relative(root,p).replaceAll("\\","/"); }
function shaText(s){ return crypto.createHash("sha256").update(String(s ?? "")).digest("hex"); }
function unwrap(t){ const chain=[]; let x=t; while(x){ chain.push({kind:x.kind,name:x.name}); x=x.ofType; } return chain; }
function leafName(t){ let x=t; let last=null; while(x){ if(x.name) last=x.name; x=x.ofType; } return last; }

await fs.mkdir(outDir,{recursive:true});

const blocks=[];
if(!allowFetch) blocks.push("missing_allow_fetch");

const query = `query MatchTypeIntrospection {
  __schema {
    queryType {
      fields {
        name
        args { name type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } }
        type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
      }
    }
    types {
      kind
      name
      fields {
        name
        args { name type { kind name ofType { kind name ofType { kind name } } } }
        type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
      }
    }
  }
}`;

let fetchStatus=null, graphQlErrorCount=0, responseSha256=null, rows=[];

if(allowFetch){
  const body=JSON.stringify({operationName:"MatchTypeIntrospection",query,variables:{}});
  const r=spawnSync("curl.exe",["--location","--ipv4","--http1.1","--connect-timeout","5","--max-time","18","--max-filesize","4000000","--silent","--show-error","--request","POST","--header","Content-Type: application/json","--header","Origin: https://allsvenskan.se","--header","Referer: https://allsvenskan.se/tabell","--data",body,endpoint],{cwd:root,encoding:"utf8",maxBuffer:1024*1024*16});
  fetchStatus=r.status;
  responseSha256=shaText(r.stdout);

  try{
    const json=JSON.parse(r.stdout||"{}");
    graphQlErrorCount=Array.isArray(json.errors)?json.errors.length:0;
    const fields=json?.data?.__schema?.queryType?.fields||[];
    const types=json?.data?.__schema?.types||[];
    const matchesForLeague=fields.find(f=>f.name==="matchesForLeague");
    if(!matchesForLeague) blocks.push("matchesForLeague_field_missing");
    const returnLeaf=matchesForLeague ? leafName(matchesForLeague.type) : null;

    const candidateTypeNames=new Set([returnLeaf]);
    for(const t of types){
      if(/match|fixture|game|schedule/i.test(t.name||"")) candidateTypeNames.add(t.name);
    }

    rows=[...candidateTypeNames].filter(Boolean).sort().flatMap(typeName=>{
      const t=types.find(x=>x.name===typeName);
      if(!t || !Array.isArray(t.fields)) return [];
      return t.fields.map(f=>({
        typeName,
        fieldName:f.name,
        fieldTypeLeaf:leafName(f.type),
        fieldTypeChain:unwrap(f.type),
        args:(f.args||[]).map(a=>({name:a.name,typeLeaf:leafName(a.type),typeChain:unwrap(a.type)})),
        usefulForFixture: /id|date|time|start|round|team|home|away|visit|score|result|status|arena|venue|league|season/i.test(f.name)
      }));
    }).sort((a,b)=>Number(b.usefulForFixture)-Number(a.usefulForFixture)||a.typeName.localeCompare(b.typeName)||a.fieldName.localeCompare(b.fieldName));

    if(!returnLeaf) blocks.push("matchesForLeague_return_type_leaf_missing");
    if(!rows.some(x=>x.typeName===returnLeaf)) blocks.push("return_type_fields_missing");
    if(!rows.some(x=>/start|date|time/i.test(x.fieldName))) blocks.push("no_date_field_seen");
    if(!rows.some(x=>/home/i.test(x.fieldName))) blocks.push("no_home_field_seen");
    if(!rows.some(x=>/visit|away/i.test(x.fieldName))) blocks.push("no_away_or_visiting_field_seen");
  }catch(e){
    blocks.push(`json_parse_failed:${String(e.message||e)}`);
  }
}

if(fetchStatus!==0) blocks.push(`curl_failed_${fetchStatus}`);
if(graphQlErrorCount>0) blocks.push(`graphql_errors_${graphQlErrorCount}`);

const report={
  status: blocks.length===0 ? "passed" : "needs_followup",
  runner:"sportomedia_sef_matches_type_introspection",
  output:rel(outPath),
  rowsOutput:rel(rowsPath),
  endpoint,
  guardrails:{searchExecutedNowCount:0,fetchExecutedNowCount:allowFetch?1:0,providerFetchExecutedNowCount:0,standingsFetchExecutedNowCount:0,fixtureFetchExecutedNowCount:0,restartDateFetchExecutedNowCount:0,canonicalWriteExecutedNowCount:0,lifecycleWriteExecutedNowCount:0,productionWriteExecutedNowCount:0,truthAssertionExecutedNowCount:0,rawPayloadCommitted:false,fullRawPayloadWritten:false},
  summary:{fetchStatus,graphQlErrorCount,responseSha256,selectedFieldCount:rows.length,usefulFixtureFieldCount:rows.filter(r=>r.usefulForFixture).length,readyToPatchMatchesForLeagueQuery:rows.some(x=>/start|date|time/i.test(x.fieldName)) && rows.some(x=>/home/i.test(x.fieldName)) && rows.some(x=>/visit|away/i.test(x.fieldName)),acceptedNowCount:0},
  rows,
  blocks
};

await fs.writeFile(outPath,JSON.stringify(report,null,2)+"\n","utf8");
await fs.writeFile(rowsPath,rows.map(r=>JSON.stringify(r)).join("\n")+"\n","utf8");

console.log(JSON.stringify({
  status:report.status,
  output:report.output,
  rowsOutput:report.rowsOutput,
  guardrails:report.guardrails,
  summary:report.summary,
  topRows:rows.slice(0,80),
  blocks:report.blocks
},null,2));

if(blocks.some(b=>b.startsWith("curl_failed")||b.startsWith("json_parse_failed"))) process.exitCode=1;
