import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { ensureDir, resolveDataPath } from "../storage/data-root.js";

export const PLAN_A_OBSERVATION_START_DAY = "2026-07-05";
export const PLAN_A_OBSERVATION_SCHEMA = "ai-matchlab.value-plan-a-observation.v1";
export const PLAN_A_OBSERVATION_AUDIT_SCHEMA = "ai-matchlab.value-plan-a-observation-audit.v1";

function clean(value) {
  return String(value ?? "").trim();
}

function isDayKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(clean(value));
}

export function isPlanAObservationDay(dayKey) {
  const day = clean(dayKey);
  return isDayKey(day) && day >= PLAN_A_OBSERVATION_START_DAY;
}

export function planAObservationFile(dayKey) {
  return resolveDataPath("value-plans", clean(dayKey), "plan-a.json");
}

export function planAObservationAuditFile(dayKey) {
  return resolveDataPath("value-plans", clean(dayKey), "plan-a-audit.json");
}

export function rowsFromPlanAPayload(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  for (const key of ["picks", "valuePicks", "rows", "items"]) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return [];
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;

  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = stableValue(value[key]);
  }
  return out;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonPretty(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function relativeArtifactPath(filePath) {
  const dataRoot = resolveDataPath();
  const relative = path.relative(path.dirname(dataRoot), filePath).replaceAll("\\", "/");
  return relative || filePath.replaceAll("\\", "/");
}

export function planAObservationSignature(dayKey, payload) {
  const picks = rowsFromPlanAPayload(payload);
  return sha256Text(stableJson({
    date: clean(dayKey),
    count: picks.length,
    picks
  }));
}

function normalizedProvenance(provenance = {}) {
  const out = {};
  for (const [key, value] of Object.entries(provenance || {})) {
    if (value === undefined || value === null || value === "") continue;
    out[key] = value;
  }
  return out;
}

function validateExistingObservation(dayKey, payload) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, reason: "plan_a_observation_invalid_json" };
  }
  if (payload.schema !== PLAN_A_OBSERVATION_SCHEMA) {
    return { ok: false, reason: "plan_a_observation_schema_invalid", schema: payload.schema || null };
  }
  if (clean(payload.date) !== clean(dayKey)) {
    return { ok: false, reason: "plan_a_observation_date_mismatch", date: payload.date || null };
  }
  if (payload.immutable !== true) {
    return { ok: false, reason: "plan_a_observation_not_immutable" };
  }
  const picks = rowsFromPlanAPayload(payload);
  if (Number(payload.count) !== picks.length) {
    return {
      ok: false,
      reason: "plan_a_observation_count_mismatch",
      declaredCount: payload.count,
      picks: picks.length
    };
  }
  const declaredSignature = clean(payload.observationSignature).toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(declaredSignature)) {
    return {
      ok: false,
      reason: "plan_a_observation_signature_missing_or_invalid",
      declaredSignature: payload.observationSignature || null
    };
  }

  const computed = planAObservationSignature(dayKey, payload);
  if (declaredSignature !== computed) {
    return {
      ok: false,
      reason: "plan_a_observation_signature_mismatch",
      declaredSignature,
      computedSignature: computed
    };
  }
  return { ok: true, picks, signature: computed };
}

function ensureAudit({ dayKey, observationFile, auditFile, observation, provenance, sourcePayloadSha256 }) {
  const expected = {
    schema: PLAN_A_OBSERVATION_AUDIT_SCHEMA,
    date: dayKey,
    immutable: true,
    observationPath: relativeArtifactPath(observationFile),
    observationFileSha256: sha256File(observationFile),
    observationSignature: observation.observationSignature,
    count: observation.count
  };

  if (fs.existsSync(auditFile)) {
    const existing = readJsonSafe(auditFile, null);
    if (!existing || typeof existing !== "object") {
      return { ok: false, reason: "plan_a_observation_audit_invalid_json" };
    }
    for (const [key, value] of Object.entries(expected)) {
      if (existing[key] !== value) {
        return {
          ok: false,
          reason: "plan_a_observation_audit_mismatch",
          field: key,
          expected: value,
          actual: existing[key] ?? null
        };
      }
    }
    return { ok: true, created: false, auditFile };
  }

  writeJsonPretty(auditFile, {
    ok: true,
    ...expected,
    generatedAt: observation.frozenAt,
    trialStartDate: PLAN_A_OBSERVATION_START_DAY,
    sourcePayloadSha256,
    provenance
  });
  return { ok: true, created: true, auditFile };
}

export function ensurePlanAObservationAtPaths({
  dayKey,
  sourcePayload,
  sourcePath = null,
  observationFile,
  auditFile,
  provenance = {},
  frozenAt = new Date().toISOString()
}) {
  const day = clean(dayKey);
  if (!isPlanAObservationDay(day)) {
    return {
      ok: false,
      reason: "outside_plan_a_observation_period",
      dayKey: day,
      trialStartDate: PLAN_A_OBSERVATION_START_DAY
    };
  }
  if (!sourcePayload || typeof sourcePayload !== "object") {
    return { ok: false, reason: "missing_plan_a_source_payload", dayKey: day };
  }
  if (!observationFile || !auditFile) {
    return { ok: false, reason: "missing_plan_a_observation_paths", dayKey: day };
  }

  const candidatePicks = rowsFromPlanAPayload(sourcePayload);
  const candidateSignature = planAObservationSignature(day, sourcePayload);
  const sourcePayloadSha256 = sha256Text(stableJson(sourcePayload));
  const provenancePayload = normalizedProvenance({
    kind: "daily_freeze",
    sourcePath: sourcePath ? String(sourcePath).replaceAll("\\", "/") : null,
    ...provenance
  });

  if (fs.existsSync(observationFile)) {
    const existing = readJsonSafe(observationFile, null);
    const validation = validateExistingObservation(day, existing);
    if (!validation.ok) {
      return {
        ok: false,
        created: false,
        preservedExisting: true,
        dayKey: day,
        observationFile,
        ...validation
      };
    }

    const audit = ensureAudit({
      dayKey: day,
      observationFile,
      auditFile,
      observation: existing,
      provenance: existing.provenance || provenancePayload,
      sourcePayloadSha256
    });
    if (!audit.ok) {
      return {
        ok: false,
        created: false,
        preservedExisting: true,
        dayKey: day,
        observationFile,
        auditFile,
        ...audit
      };
    }

    const conflict = validation.signature !== candidateSignature;
    return {
      ok: true,
      created: false,
      preservedExisting: true,
      conflict,
      reason: conflict ? "plan_a_observation_conflict_preserved" : "plan_a_observation_already_frozen",
      dayKey: day,
      observationFile,
      auditFile,
      count: validation.picks.length,
      observationSignature: validation.signature,
      candidateCount: candidatePicks.length,
      candidateSignature
    };
  }

  const observation = {
    ...sourcePayload,
    ok: sourcePayload.ok !== false,
    schema: PLAN_A_OBSERVATION_SCHEMA,
    date: day,
    planId: "plan-a",
    outputMode: "plan-a-observation",
    immutable: true,
    trialStartDate: PLAN_A_OBSERVATION_START_DAY,
    frozenAt,
    count: candidatePicks.length,
    picks: candidatePicks,
    observationSignature: candidateSignature,
    sourceContract: {
      ...(sourcePayload.sourceContract || {}),
      observationInputArtifact: provenancePayload.sourcePath || null,
      observationImmutable: true,
      deploySnapshotUsedAsFinalTruth: false,
      trialStartDate: PLAN_A_OBSERVATION_START_DAY
    },
    provenance: provenancePayload
  };

  writeJsonPretty(observationFile, observation);
  const audit = ensureAudit({
    dayKey: day,
    observationFile,
    auditFile,
    observation,
    provenance: provenancePayload,
    sourcePayloadSha256
  });
  if (!audit.ok) {
    return {
      ok: false,
      created: true,
      preservedExisting: false,
      dayKey: day,
      observationFile,
      auditFile,
      ...audit
    };
  }

  return {
    ok: true,
    created: true,
    preservedExisting: false,
    conflict: false,
    reason: "plan_a_observation_frozen",
    dayKey: day,
    observationFile,
    auditFile,
    count: candidatePicks.length,
    observationSignature: candidateSignature,
    candidateCount: candidatePicks.length,
    candidateSignature
  };
}

export function ensurePlanAObservationDay(dayKey, sourcePayload, options = {}) {
  const day = clean(dayKey);
  return ensurePlanAObservationAtPaths({
    dayKey: day,
    sourcePayload,
    sourcePath: options.sourcePath || `data/deploy-snapshots/${day}/value.json`,
    observationFile: options.observationFile || planAObservationFile(day),
    auditFile: options.auditFile || planAObservationAuditFile(day),
    provenance: options.provenance || {},
    frozenAt: options.frozenAt || new Date().toISOString()
  });
}

export function readPlanAObservationDay(dayKey) {
  const day = clean(dayKey);
  const file = planAObservationFile(day);
  const payload = readJsonSafe(file, null);
  const validation = validateExistingObservation(day, payload);
  return {
    ok: validation.ok,
    dayKey: day,
    file,
    payload: validation.ok ? payload : null,
    ...validation
  };
}
