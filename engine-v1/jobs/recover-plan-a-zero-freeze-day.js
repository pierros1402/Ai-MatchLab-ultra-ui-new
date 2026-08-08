import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveDataPath } from "../storage/data-root.js";
import {
  ensurePlanAObservationAtPaths,
  rowsFromPlanAPayload
} from "../value/plan-a-observation.js";
import { buildValuePlanComparisonDay } from "./build-value-plan-comparison-day.js";

export const PLAN_A_ZERO_FREEZE_RECOVERY_REASON =
  "season_rollover_readiness_policy_v2_2_defect";
export const PLAN_A_RECOVERY_POLICY_VERSION = "statistical-value-policy-v2.3";

function clean(value) {
  return String(value ?? "").trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256File(filePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function preserveExact(sourcePath, archivePath) {
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  if (fs.existsSync(archivePath)) {
    if (sha256File(sourcePath) !== sha256File(archivePath)) {
      throw new Error(`recovery_archive_collision:${archivePath}`);
    }
    return;
  }
  fs.copyFileSync(sourcePath, archivePath, fs.constants.COPYFILE_EXCL);
}

function restoreExact(archivePath, targetPath) {
  fs.copyFileSync(archivePath, targetPath);
}

export function recoverPlanAZeroFreezeAtPaths({
  dayKey,
  expectedObservationSignature,
  sourcePayload,
  sourcePath,
  observationFile,
  auditFile,
  archiveDir,
  recoveredAt = new Date().toISOString()
}) {
  const day = clean(dayKey);
  const expected = clean(expectedObservationSignature).toLowerCase();
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(day)) {
    return { ok: false, reason: "invalid_day_key", dayKey: day };
  }
  if (!/^[a-f0-9]{64}$/u.test(expected)) {
    return { ok: false, reason: "invalid_expected_observation_signature" };
  }
  if (!fs.existsSync(observationFile) || !fs.existsSync(auditFile)) {
    return { ok: false, reason: "missing_signed_plan_a_observation" };
  }

  const candidatePicks = rowsFromPlanAPayload(sourcePayload);
  if (candidatePicks.length <= 0) {
    return { ok: false, reason: "recovery_candidate_has_no_picks" };
  }

  // Reuse the normal immutable-observation validator. Recovery never bypasses
  // a bad signature or a stale/mismatched observation audit.
  const probe = ensurePlanAObservationAtPaths({
    dayKey: day,
    sourcePayload,
    sourcePath,
    observationFile,
    auditFile
  });
  if (!probe.ok) {
    return { ok: false, reason: "existing_observation_validation_failed", probe };
  }
  if (clean(probe.observationSignature).toLowerCase() !== expected) {
    return {
      ok: false,
      reason: "expected_observation_signature_mismatch",
      expected,
      actual: probe.observationSignature || null
    };
  }
  if (Number(probe.count) !== 0) {
    return {
      ok: false,
      reason: "existing_observation_is_not_zero",
      count: Number(probe.count)
    };
  }
  if (probe.conflict !== true) {
    return { ok: false, reason: "recovery_candidate_does_not_change_observation" };
  }

  const observationArchive = path.join(
    archiveDir,
    `plan-a.pre-recovery.${expected}.json`
  );
  const auditArchive = path.join(
    archiveDir,
    `plan-a-audit.pre-recovery.${expected}.json`
  );

  try {
    preserveExact(observationFile, observationArchive);
    preserveExact(auditFile, auditArchive);
  } catch (error) {
    return {
      ok: false,
      reason: "recovery_archive_failed",
      error: error?.message || String(error)
    };
  }

  fs.unlinkSync(observationFile);
  fs.unlinkSync(auditFile);

  let replacement;
  try {
    replacement = ensurePlanAObservationAtPaths({
      dayKey: day,
      sourcePayload,
      sourcePath,
      observationFile,
      auditFile,
      frozenAt: recoveredAt,
      provenance: {
        kind: "defect_recovery",
        recoveryReason: PLAN_A_ZERO_FREEZE_RECOVERY_REASON,
        supersedesObservationSignature: expected,
        preservedObservation: path.basename(observationArchive),
        preservedAudit: path.basename(auditArchive)
      }
    });
  } catch (error) {
    replacement = {
      ok: false,
      reason: "replacement_write_threw",
      error: error?.message || String(error)
    };
  }

  if (!replacement?.ok || replacement.created !== true) {
    restoreExact(observationArchive, observationFile);
    restoreExact(auditArchive, auditFile);
    return {
      ok: false,
      reason: "replacement_observation_failed_rolled_back",
      replacement
    };
  }

  return {
    ok: true,
    dayKey: day,
    reason: PLAN_A_ZERO_FREEZE_RECOVERY_REASON,
    previousCount: 0,
    replacementCount: candidatePicks.length,
    previousObservationSignature: expected,
    replacementObservationSignature: replacement.observationSignature,
    observationArchive,
    auditArchive
  };
}

function parseArgs(argv) {
  const out = { date: "", expectedSignature: "" };
  for (const arg of argv) {
    if (arg.startsWith("--date=")) out.date = arg.slice("--date=".length);
    if (arg.startsWith("--expected-signature=")) {
      out.expectedSignature = arg.slice("--expected-signature=".length);
    }
  }
  return out;
}

export function recoverPlanAZeroFreezeDay(dayKey, expectedSignature) {
  const valueFile = resolveDataPath("value", `${dayKey}.json`);
  const valueAuditFile = resolveDataPath("value", "_audit", `${dayKey}.json`);
  const observationFile = resolveDataPath("value-plans", dayKey, "plan-a.json");
  const auditFile = resolveDataPath("value-plans", dayKey, "plan-a-audit.json");
  const archiveDir = resolveDataPath("value-plans", dayKey, "recovery");

  if (!fs.existsSync(valueFile) || !fs.existsSync(valueAuditFile)) {
    return { ok: false, reason: "missing_rebuilt_plan_a_value_or_audit" };
  }

  const valuePayload = readJson(valueFile);
  const valueAudit = readJson(valueAuditFile);
  if (valueAudit?.policyVersion !== PLAN_A_RECOVERY_POLICY_VERSION) {
    return {
      ok: false,
      reason: "recovery_requires_v2_3_candidate",
      policyVersion: valueAudit?.policyVersion || null
    };
  }

  const recovery = recoverPlanAZeroFreezeAtPaths({
    dayKey,
    expectedObservationSignature: expectedSignature,
    sourcePayload: valuePayload,
    sourcePath: `data/value/${dayKey}.json`,
    observationFile,
    auditFile,
    archiveDir
  });
  if (!recovery.ok) return recovery;

  const comparison = buildValuePlanComparisonDay(dayKey, { write: true });
  if (!comparison.ok || Number(comparison?.plans?.A?.summary?.picks || 0) <= 0) {
    return {
      ok: false,
      reason: "comparison_did_not_adopt_recovered_plan_a",
      recovery,
      comparisonOk: comparison?.ok === true,
      comparisonPlanA: comparison?.plans?.A?.summary || null
    };
  }

  return {
    ...recovery,
    comparisonPlanA: comparison.plans.A.summary,
    comparisonPlanA2: comparison.plans.A2?.summary || null
  };
}

const isCli =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCli) {
  const args = parseArgs(process.argv.slice(2));
  const result = recoverPlanAZeroFreezeDay(args.date, args.expectedSignature);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
