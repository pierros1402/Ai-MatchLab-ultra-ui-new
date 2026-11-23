// Source-bound remaining Stage20 family triage. No semantic permission to
// drop, replay or regenerate any excluded data merely because a name says cache.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {auditHistorical954} from "./audit-daily954-stage20-history.mjs";
import {evaluateStage20CapturePaths} from "../engine-v1/core/daily-resume-stage20-admission.mjs";
export const RESIDUAL_SCHEMA="ai-matchlab.stage20-residual-family-triage.v1";
const CLASS=Object.freeze({
  "data/research-cache": "cache-named-needs-rebuild-proof",
  "data/league-memory": "memory-named-needs-input-proof",
  "data/odds-memory": "memory-named-needs-input-proof",
  "data/value-data-acquisition": "acquisition-named-needs-provider-proof",
  "data/canonical-registry": "canonical-identity-needs-retention-proof",
  "data/active-leagues.json": "root-input-needs-frozen-parity",
  "data/fixtures.json": "root-input-needs-frozen-parity",
  "data/observations.json": "root-input-needs-frozen-parity",
  "data/source-reliability.json": "root-input-needs-frozen-parity",
  "data/coverage-reports": "derived-needs-lineage",
  "data/competition-admission": "derived-needs-lineage",
  "data/final-result-conflicts": "truth-conflict-needs-immutable-guard",
  "data/identity-recovery": "identity-needs-source-authority",
  "data/ingest-state": "mutable-state-needs-exact-dependency",
  "data/plan-c-shadow": "unsupported-extension-needs-format-review"
});
function check(ok,reason){if(!ok)throw Error(reason);}
export function classifyResidualFamily(family) {
  return CLASS[family]||"unknown-family-not-qualified";
}
export function aggregateResidualRows(rows,dayKey){
  check(Array.isArray(rows) && /^\d{4}-\d{2}-\d{2}$/.test(dayKey),
    "stage20_residual_input_invalid");
  const families=new Map(),kinds=new Map();
  let denied=0,admitted=0,deniedBytes=0,unclassified=0;
  const seen=new Set();
  for(const row of rows){
    const p=row?.path,bytes=row?.bytes;
    check(typeof p==="string" && p.startsWith("data/") &&
      !p.includes("\\") && !p.includes("\0") &&
      p.split("/").every(s=>s && s!=="." && s!=="..") &&
      Number.isSafeInteger(bytes) && bytes>=0 && !seen.has(p),
      "stage20_residual_row_invalid");
    seen.add(p);
    const ok=evaluateStage20CapturePaths({dayKey,paths:[p]}).ok;
    if(ok){admitted++;continue;}
    denied++;deniedBytes+=bytes;
    const family=p.split("/").slice(0,2).join("/");
    const kind=classifyResidualFamily(family);
    const info=families.get(family)||{files:0,bytes:0,reviewClass:kind};
    info.files++;info.bytes+=bytes;families.set(family,info);
    kinds.set(kind,(kinds.get(kind)||0)+1);
    if(kind==="unknown-family-not-qualified")unclassified++;
  }
  return {
    admitted,denied,deniedBytes,unclassified,
    families:Object.fromEntries([...families].sort(([a],[b])=>a.localeCompare(b))),
    reviewClasses:Object.fromEntries([...kinds].sort(([a],[b])=>a.localeCompare(b))),
    excludedFilesApprovedForOmission:0,
    sourceLineageComplete:false,omissionAuthorized:false,
    checkpointCompletenessProven:false,resumeAuthorized:false,publicationAuthorized:false
  };
}
export function auditStage20Residual(root) {
  const original=auditHistorical954(root);
  check(original.files===9083 && original.bytes===428113899 &&
    original.manifestSha256==="12c19ca0c9c97aca10c25fe62f3184ceaa02d87b5e9d66fa4340e0d5589ce1c0",
    "stage20_residual_original_not_bound");
  const manifest=JSON.parse(fs.readFileSync(path.join(root,"manifest.json"),"utf8"));
  const classification=aggregateResidualRows(manifest.files,original.dayKey);
  check(classification.admitted===8535 && classification.denied===548,
    "stage20_residual_policy_count_mismatch");
  check(classification.unclassified===0,
    "stage20_residual_unknown_family");
  return {
    schema:RESIDUAL_SCHEMA,
    runId:original.runId,dayKey:original.dayKey,
    originalManifestSha256:original.manifestSha256,
    originalFiles:original.files,originalBytes:original.bytes,
    ...classification,readOnly:true,productionWrites:0
  };
}
const invoked=process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  try{
    check(process.argv.length===3 && path.isAbsolute(process.argv[2]),
      "stage20_residual_usage_root_absolute");
    console.log("STAGE20_RESIDUAL_TRIAGE="+JSON.stringify(auditStage20Residual(process.argv[2])));
  }catch(e){console.error("STAGE20_RESIDUAL_TRIAGE_DENIED="+String(e.message||e));process.exitCode=1;}
}
