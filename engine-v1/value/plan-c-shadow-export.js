import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveDataPath } from "../storage/data-root.js";

export const PLAN_C_SHADOW_DAY_SCHEMA = "ai-matchlab.plan-c-shadow-day.v1";
export const PLAN_C_SHADOW_AUDIT_SCHEMA = "ai-matchlab.plan-c-shadow-export-audit.v1";

function clean(value) {
  return String(value ?? "").trim();
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function canonicalPlanCJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalPlanCJson).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalPlanCJson(value[key])}`).join(",")}}`;
}

export function planCPredictionSignature(prediction) {
  const unsigned = structuredClone(prediction);
  delete unsigned.predictionSignature;
  return sha256(Buffer.from(canonicalPlanCJson(unsigned), "utf8"));
}

export function planCPredictionSetHash(predictions) {
  const rows = (Array.isArray(predictions) ? predictions : [])
    .map(item => ({
      canonicalFixtureId: clean(item?.canonicalFixtureId ?? item?.prediction?.canonicalFixtureId),
      predictionSignature: clean(item?.predictionSignature ?? item?.prediction?.predictionSignature)
    }))
    .sort((left, right) => left.canonicalFixtureId.localeCompare(right.canonicalFixtureId));
  return sha256(Buffer.from(canonicalPlanCJson(rows), "utf8"));
}

export function planCShadowSourceFile(dayKey) {
  return resolveDataPath("plan-c-shadow", `${clean(dayKey)}.json`);
}

function validIso(value) {
  return Number.isFinite(Date.parse(value));
}

function validatePrediction(prediction, index, errors) {
  const label = clean(prediction?.canonicalFixtureId) || `index_${index}`;
  if (!prediction || typeof prediction !== "object" || Array.isArray(prediction)) {
    errors.push(`prediction_not_object:${index}`);
    return;
  }
  if (!clean(prediction.canonicalFixtureId).startsWith("cid_")) errors.push(`prediction_canonical_id_invalid:${label}`);
  if (prediction.identityCategory !== "both" || prediction.eloApplied !== true) errors.push(`prediction_not_verified_elo_cohort:${label}`);
  if (typeof prediction.planCPick !== "boolean") errors.push(`prediction_pick_invalid:${label}`);
  if (!Number.isFinite(prediction?.baseline?.pOver25) || prediction.baseline.pOver25 < 0 || prediction.baseline.pOver25 > 1) {
    errors.push(`prediction_baseline_probability_invalid:${label}`);
  }
  if (!Number.isFinite(prediction?.adjusted?.pOver25) || prediction.adjusted.pOver25 < 0 || prediction.adjusted.pOver25 > 1) {
    errors.push(`prediction_adjusted_probability_invalid:${label}`);
  }
  if (![prediction.snapshotRetrievedAt, prediction.predictionCreatedAt, prediction.kickoffUtc].every(validIso)) {
    errors.push(`prediction_time_invalid:${label}`);
  } else if (!(Date.parse(prediction.snapshotRetrievedAt) < Date.parse(prediction.predictionCreatedAt)
    && Date.parse(prediction.predictionCreatedAt) < Date.parse(prediction.kickoffUtc))) {
    errors.push(`prediction_forward_boundary_invalid:${label}`);
  }
  if (!/^[0-9a-f]{64}$/u.test(clean(prediction.predictionSignature))) {
    errors.push(`prediction_signature_invalid:${label}`);
  } else if (planCPredictionSignature(prediction) !== clean(prediction.predictionSignature)) {
    errors.push(`prediction_signature_mismatch:${label}`);
  }
}

function validateSettlement(settlement, label, errors) {
  if (!settlement || typeof settlement !== "object" || Array.isArray(settlement)) {
    errors.push(`settlement_not_object:${label}`);
    return;
  }
  if (!["PENDING", "SETTLED", "VOID_EXCLUDED"].includes(settlement.state)) {
    errors.push(`settlement_state_invalid:${label}`);
  }
  if (settlement.state === "PENDING" && settlement.truth != null) errors.push(`pending_truth_forbidden:${label}`);
  if (settlement.state === "SETTLED") {
    if (settlement?.truth?.status !== "FT") errors.push(`settled_truth_status_invalid:${label}`);
    if (!Number.isInteger(settlement?.truth?.scoreHome) || settlement.truth.scoreHome < 0) errors.push(`settled_home_score_invalid:${label}`);
    if (!Number.isInteger(settlement?.truth?.scoreAway) || settlement.truth.scoreAway < 0) errors.push(`settled_away_score_invalid:${label}`);
  }
}

export function validatePlanCShadowDay(payload, expectedDay = "") {
  const errors = [];
  const day = clean(expectedDay);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) errors.push("payload_not_object");
  if (payload?.schema !== PLAN_C_SHADOW_DAY_SCHEMA) errors.push("schema_invalid");
  if (payload?.ok !== true || payload?.available !== true) errors.push("availability_invalid");
  if (payload?.mode !== "SHADOW" || payload?.productionEligible !== false) errors.push("shadow_boundary_invalid");
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(clean(payload?.date))) errors.push("date_invalid");
  if (day && clean(payload?.date) !== day) errors.push("date_mismatch");
  if (!validIso(payload?.generatedAt)) errors.push("generated_at_invalid");
  if (!/^[0-9a-f]{64}$/u.test(clean(payload?.sourcePredictionSetHash))) errors.push("source_prediction_set_hash_invalid");
  if (!Array.isArray(payload?.entries)) errors.push("entries_missing");
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  const ids = new Set();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push(`entry_not_object:${index}`);
      continue;
    }
    validatePrediction(entry.prediction, index, errors);
    const id = clean(entry?.prediction?.canonicalFixtureId);
    if (id && ids.has(id)) errors.push(`duplicate_canonical_id:${id}`);
    if (id) ids.add(id);
    validateSettlement(entry.settlement, id || `index_${index}`, errors);
  }
  const pickCount = entries.filter(entry => entry?.prediction?.planCPick === true).length;
  if (!Number.isInteger(payload?.count) || payload.count !== entries.length) errors.push("count_mismatch");
  if (!Number.isInteger(payload?.pickCount) || payload.pickCount !== pickCount) errors.push("pick_count_mismatch");
  return { ok: errors.length === 0, errors, count: entries.length, pickCount };
}

export function validatePlanCShadowExportPayload(payload, expectedDay = "") {
  if (payload?.available === true) return validatePlanCShadowDay(payload, expectedDay);
  const errors = [];
  const day = clean(expectedDay);
  if (payload?.schema !== PLAN_C_SHADOW_DAY_SCHEMA) errors.push("schema_invalid");
  if (payload?.ok !== true || payload?.available !== false) errors.push("availability_invalid");
  if (payload?.mode !== "SHADOW" || payload?.productionEligible !== false) errors.push("shadow_boundary_invalid");
  if (day && clean(payload?.date) !== day) errors.push("date_mismatch");
  if (payload?.count !== 0 || payload?.pickCount !== 0 || !Array.isArray(payload?.entries) || payload.entries.length !== 0) {
    errors.push("unavailable_accounting_invalid");
  }
  if (payload?.reason !== "missing_plan_c_shadow_day_artifact") errors.push("unavailable_reason_invalid");
  return { ok: errors.length === 0, errors, count: 0, pickCount: 0 };
}

export function unavailablePlanCShadowDay(dayKey) {
  return {
    schema: PLAN_C_SHADOW_DAY_SCHEMA,
    ok: true,
    available: false,
    mode: "SHADOW",
    productionEligible: false,
    date: clean(dayKey),
    generatedAt: null,
    sourcePredictionSetHash: null,
    count: 0,
    pickCount: 0,
    entries: [],
    reason: "missing_plan_c_shadow_day_artifact"
  };
}

export function readPlanCShadowDay(dayKey, options = {}) {
  const sourceFile = options.sourceFile || planCShadowSourceFile(dayKey);
  if (!fs.existsSync(sourceFile)) {
    return { payload: unavailablePlanCShadowDay(dayKey), sourceFile, sourceSha256: null, sourceMissing: true };
  }
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(sourceFile, "utf8"));
  } catch {
    throw new Error(`plan_c_shadow_invalid_json:${clean(dayKey)}`);
  }
  const validation = validatePlanCShadowDay(payload, dayKey);
  if (!validation.ok) throw new Error(`plan_c_shadow_invalid:${clean(dayKey)}:${validation.errors.join(",")}`);
  const bytes = fs.readFileSync(sourceFile);
  return { payload, sourceFile, sourceSha256: sha256(bytes), sourceMissing: false };
}

export function buildPlanCShadowExportAudit(dayKey, loaded, exportedAt) {
  return {
    schema: PLAN_C_SHADOW_AUDIT_SCHEMA,
    ok: true,
    date: clean(dayKey),
    exportedAt,
    mode: "SHADOW",
    productionEligible: false,
    source: loaded.sourceMissing ? "missing_optional_source" : "validated_daily_artifact",
    sourcePath: path.posix.join("data", "plan-c-shadow", `${clean(dayKey)}.json`),
    sourceSha256: loaded.sourceSha256,
    available: loaded.payload.available === true,
    count: loaded.payload.count,
    pickCount: loaded.payload.pickCount,
    officialPlansUnaffected: true
  };
}
