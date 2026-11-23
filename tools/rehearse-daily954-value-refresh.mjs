import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";

const DAY = "2026-11-23";
const EXPECTED_PLAN_A_SIGNATURE = "e7426b78e621cdadd438a29b04d08f569f2ddd698c84882e7f5a7a5cd5322fd9";
const HEX = /^[a-f0-9]{64}$/;
function check(ok,code){if(!ok)throw Error(code);}
function sha(buf){return crypto.createHash("sha256").update(buf).digest("hex");}
export function auditFrozenValueSources(root) {
  const planAFile=path.join(root,"data/value-plans",DAY,"plan-a.json");
  const planAAuditFile=path.join(root,"data/value-plans",DAY,"plan-a-audit.json");
  const oldBytes=fs.readFileSync(planAFile);
  const oldAuditBytes=fs.readFileSync(planAAuditFile);
  const planA=JSON.parse(oldBytes);
  const audit=JSON.parse(oldAuditBytes);
  check(planA.ok===true && planA.immutable===true &&
        planA.observationSignature===EXPECTED_PLAN_A_SIGNATURE &&
        planA.observationSignature===audit.observationSignature,
        "historical_plan_a_authority_invalid");
  const memoryDir=path.join(root,"data/odds-memory");
  let sourceFiles=0,assessments=0,postKickoff=0,invalidTimestamps=0;
  const canonicalIds=new Set();
  for(const name of fs.readdirSync(memoryDir).filter(x=>x.endsWith(".json"))) {
    const file=path.join(memoryDir,name);
    const doc=JSON.parse(fs.readFileSync(file,"utf8"));
    if(String(doc.dayKey||"")!==DAY)continue;
    sourceFiles++;
    if (!doc.aiAssessment || typeof doc.aiAssessment!=="object")continue;
    assessments++;
    check(typeof doc.canonicalId==="string" && !canonicalIds.has(doc.canonicalId),
          "assessment_duplicate_or_missing_canonical_identity");
    canonicalIds.add(doc.canonicalId);
    const stamp=Date.parse(doc.updatedAt),kickoff=Date.parse(doc.kickoffUtc);
    if(!Number.isFinite(stamp)||!Number.isFinite(kickoff))invalidTimestamps++;
    else if(stamp>kickoff)postKickoff++;
  }
  check(sourceFiles>0 && assessments>0,"historical_assessment_evidence_missing");
  check(invalidTimestamps===0 && postKickoff===0,
        "historical_assessment_after_kickoff_or_undated");
  return {
    sourceFiles,assessments,canonicalIds:canonicalIds.size,postKickoff,invalidTimestamps,
    planAFile,planAAuditFile,planABeforeSha256:sha(oldBytes),
    planAAuditBeforeSha256:sha(oldAuditBytes),
    planAObservationSignature:planA.observationSignature
  };
}
export function rehearseValueRefresh(root){
  const baseline=auditFrozenValueSources(root);
  const result=spawnSync(process.execPath,
    ["engine-v1/jobs/refresh-value-artifacts-day.js",`--date=${DAY}`,"--no-update-latest"],
    {cwd:root,encoding:"utf8",timeout:240000,maxBuffer:8*1024*1024});
  const afterPlanA=sha(fs.readFileSync(baseline.planAFile));
  const afterAudit=sha(fs.readFileSync(baseline.planAAuditFile));
  check(afterPlanA===baseline.planABeforeSha256 &&
        afterAudit===baseline.planAAuditBeforeSha256,
        "frozen_plan_a_changed_during_recovery_rehearsal");
  const lastOutput=(result.stdout||"").slice(-5000);
  const lastError=(result.stderr||"").slice(-3000);
  let status="REFRESH_FAILED_CLOSED";
  if(result.status===0){
    const required=["plan-a2.json","plan-b.json","plan-b2.json"];
    const dayRoot=path.join(root,"data/value-plans",DAY);
    check(required.every(name=>fs.existsSync(path.join(dayRoot,name))) &&
          fs.existsSync(path.join(root,"data/value-comparison",DAY+".json")) &&
          fs.existsSync(path.join(root,"data/deploy-snapshots",DAY,"freshness-report.json")),
          "value_refresh_claimed_success_but_artifacts_missing");
    status="VALUE_REFRESH_SANDBOX_PASS";
  }
  return {dayKey:DAY,status,exitCode:result.status,
    signal:result.signal||null,error:result.error?.message||null,
    sourceAssessmentFiles:baseline.sourceFiles,
    assessmentRows:baseline.assessments,
    planASignature:baseline.planAObservationSignature,
    planAUnchanged:true,productionWrites:0,publicationApproved:false,
    stdoutTail:lastOutput,stderrTail:lastError};
}
const isCli=process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname;
if(isCli){
  try{
    const root=process.argv[2];
    check(root&&path.isAbsolute(root),"scratch_root_required");
    const r=rehearseValueRefresh(root);
    console.log("DAILY954_VALUE_REHEARSAL="+JSON.stringify(r));
    if(r.status!=="VALUE_REFRESH_SANDBOX_PASS")process.exitCode=1;
  }catch(e){console.error("DAILY954_VALUE_REHEARSAL_DENIED="+(e.stack||e));process.exitCode=1;}
}
