import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { STAGE20_APPROVED_FAMILIES, evaluateStage20CapturePaths } from "../engine-v1/core/daily-resume-stage20-admission.mjs";

export const HISTORICAL_954 = Object.freeze({
  manifestSha256: "12c19ca0c9c97aca10c25fe62f3184ceaa02d87b5e9d66fa4340e0d5589ce1c0",
  runId: "45137286904", attempt: 1, dayKey: "2026-11-23",
  sourceCommit: "5133d9ff8623dd015c6578d89e34b7a5da0b12a0",
  baselineCommit: "33eaa635a8745e75fc0a6075a3594f4cd86d3b32",
  count: 9083, bytes: 428113899
});
const SHA = /^[a-f0-9]{64}$/;
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
function requireThat(ok, message) { if (!ok) throw Error(message); }
function safePath(name) {
  requireThat(typeof name === "string" && name.startsWith("data/") &&
    name.length > 5 && name.length < 700 && !name.includes("\\") &&
    !name.includes("\0") && name.split("/").every(s => s && s !== "." && s !== ".."),
    "historical_inventory_unsafe_path");
  return name;
}
function safeFile(root, relative) {
  let file = path.resolve(root);
  for (const part of relative.split("/")) {
    file = path.join(file, part);
    const stat = fs.lstatSync(file);
    requireThat(!stat.isSymbolicLink(), "historical_inventory_symlink");
    if (part !== relative.split("/").at(-1)) requireThat(stat.isDirectory(), "historical_inventory_non_directory");
  }
  requireThat(fs.statSync(file).isFile(), "historical_inventory_nonregular");
  return file;
}
function physicalInventory(root) {
  const found = new Set();
  function walk(dir, prefix = "") {
    for (const ent of fs.readdirSync(dir, {withFileTypes:true})) {
      requireThat(!ent.isSymbolicLink(), "historical_inventory_symlink");
      const rel = prefix ? prefix + "/" + ent.name : ent.name;
      if (ent.isDirectory()) walk(path.join(dir,ent.name),rel);
      else { requireThat(ent.isFile(), "historical_inventory_nonregular"); found.add(rel); }
    }
  }
  walk(root);
  return found;
}
function family(name) { return name.split("/").slice(0,2).join("/"); }
function denyReason(name) {
  if (/(^|[._/-])(secret|credential|password|token|private[-_]?key|\.env)([._/-]|$)/i.test(name)) return "secret_like_path";
  if (!/\.(json|jsonl|ndjson|csv)$/i.test(name)) return "unsupported_extension";
  if (!STAGE20_APPROVED_FAMILIES.some(prefix=>name.startsWith(prefix))) return "unapproved_family";
  return "unknown";
}
export function auditHistorical954(root, pin = HISTORICAL_954) {
  const manifestBytes = fs.readFileSync(safeFile(root,"manifest.json"));
  requireThat(sha(manifestBytes) === pin.manifestSha256, "historical_manifest_sha_mismatch");
  const doc = JSON.parse(manifestBytes.toString("utf8"));
  for(const key of ["runId","attempt","dayKey","sourceCommit","baselineCommit"])
    requireThat(String(doc[key]) === String(pin[key]), "historical_source_binding_mismatch:"+key);
  requireThat(doc.purpose==="recovery_evidence_only" && doc.publicationApproved===false &&
    doc.scope==="changes_and_untracked_evidence" &&
    Array.isArray(doc.files) && doc.files.length===pin.count &&
    Array.isArray(doc.absentPaths), "historical_scope_not_admitted");
  const observed = new Set(["manifest.json"]);
  const rows=[], counts={}, reasons={}, dates={};
  let bytes=0, approved=0, denied=0;
  for(const row of doc.files) {
    const name=safePath(row.path);
    requireThat(!observed.has(name),"historical_duplicate_file");
    observed.add(name);
    requireThat(Number.isSafeInteger(row.bytes) && row.bytes>=0 &&
      SHA.test(row.sha256),"historical_row_invalid");
    const file=safeFile(root,name);
    const buffer=fs.readFileSync(file);
    requireThat(buffer.length===row.bytes && sha(buffer)===row.sha256,
      "historical_file_integrity_mismatch:"+sha(Buffer.from(name)).slice(0,12));
    bytes+=buffer.length;
    const allow=evaluateStage20CapturePaths({dayKey:pin.dayKey,paths:[name]}).ok;
    const type=family(name), reason=allow?"admitted":denyReason(name);
    const record=counts[type] || (counts[type]={admitted:0,denied:0,bytes:0});
    record[allow?"admitted":"denied"]++;
    record.bytes+=buffer.length;
    reasons[reason]=(reasons[reason]||0)+1;
    const dateKeys=[...name.matchAll(/20\d{2}-\d{2}-\d{2}/g)].map(m=>m[0]);
    if(dateKeys.length && !dateKeys.includes(pin.dayKey)) dates["other_day_path"]=(dates["other_day_path"]||0)+1;
    if(!dateKeys.length) dates["undated_path"]=(dates["undated_path"]||0)+1;
    if(allow) approved++; else denied++;
    rows.push(name);
  }
  requireThat(bytes===pin.bytes, "historical_total_bytes_mismatch");
  const physical=physicalInventory(root);
  requireThat(physical.size===observed.size && [...physical].every(x=>observed.has(x)),
    "historical_extra_or_missing_files");
  const absentPaths=doc.absentPaths.map(safePath);
  requireThat(new Set(absentPaths).size===absentPaths.length &&
    absentPaths.every(x=>!observed.has(x)), "historical_absent_paths_invalid");
  return {
    schema:"ai-matchlab.daily954-stage20-historical-inventory-audit.v1",
    dayKey:pin.dayKey, runId:pin.runId, sourceCommit:pin.sourceCommit,
    manifestSha256:pin.manifestSha256, files:rows.length, bytes,
    admitted:approved, denied, familyCounts:Object.fromEntries(Object.entries(counts).sort()),
    denyReasons:Object.fromEntries(Object.entries(reasons).sort()),
    datePathIndicators:dates, absentPathCount:absentPaths.length,
    completeForGitTrackedAndUntrackedEvidence:true,
    completeStage20CaptureProven:false,
    ignoredFilesAudited:false, preStage20BaselineAudited:false,
    contentSecretScanApproved:false, crossCommitResumeAuthorized:false,
    publicationApproved:false, productionWrites:0
  };
}
const invoked=process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  try {
    requireThat(process.argv.length===3 && path.isAbsolute(process.argv[2]),"absolute_extracted_root_required");
    console.log("DAILY954_STAGE20_HISTORICAL_INVENTORY="+JSON.stringify(auditHistorical954(process.argv[2])));
  } catch(err) { console.error("DAILY954_STAGE20_AUDIT_DENIED="+String(err.message||err)); process.exitCode=1; }
}
