import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  PLAN_C_SHADOW_DAY_SCHEMA,
  buildPlanCShadowExportAudit,
  canonicalPlanCJson,
  planCPredictionSetHash,
  planCPredictionSignature,
  readPlanCShadowDay,
  unavailablePlanCShadowDay,
  validatePlanCShadowDay,
  validatePlanCShadowExportPayload
} from "./plan-c-shadow-export.js";

test("prediction-set hash is deterministic and order independent", () => {
  const left = [
    { canonicalFixtureId: "cid_b", predictionSignature: "b".repeat(64) },
    { canonicalFixtureId: "cid_a", predictionSignature: "a".repeat(64) }
  ];
  assert.equal(planCPredictionSetHash(left), planCPredictionSetHash(left.slice().reverse()));
  const changed = structuredClone(left);
  changed[0].predictionSignature = "c".repeat(64);
  assert.notEqual(planCPredictionSetHash(left), planCPredictionSetHash(changed));
});

function prediction(overrides = {}) {
  const value = {
    schema: "ai-matchlab.plan-c-shadow-prediction.v1.1",
    canonicalFixtureId: "cid_test_home_away_20260827",
    day: "2026-08-27",
    kickoffUtc: "2026-08-27T19:00:00.000Z",
    snapshotRetrievedAt: "2026-08-26T08:00:00.000Z",
    predictionCreatedAt: "2026-08-26T09:00:00.000Z",
    identityCategory: "both",
    eloApplied: true,
    planCPick: true,
    baseline: { pOver25: 0.51, lambdaHome: 1.4, lambdaAway: 1.2 },
    adjusted: { pOver25: 0.57, lambdaHome: 1.5, lambdaAway: 1.1 },
    ...overrides
  };
  value.predictionSignature = planCPredictionSignature(value);
  return value;
}

function artifact(overrides = {}) {
  const entries = overrides.entries || [{ prediction: prediction(), settlement: { state: "PENDING", truth: null } }];
  return {
    schema: PLAN_C_SHADOW_DAY_SCHEMA,
    ok: true,
    available: true,
    mode: "SHADOW",
    productionEligible: false,
    date: "2026-08-26",
    generatedAt: "2026-08-26T10:00:00.000Z",
    sourcePredictionSetHash: crypto.createHash("sha256").update("set").digest("hex"),
    count: entries.length,
    pickCount: entries.filter(entry => entry.prediction.planCPick).length,
    entries,
    ...overrides
  };
}

test("validates a signed shadow artifact without promoting it to production", () => {
  const result = validatePlanCShadowDay(artifact(), "2026-08-26");
  assert.equal(result.ok, true);
  assert.equal(result.count, 1);
  assert.equal(result.pickCount, 1);
});

test("fails closed when a frozen probability is modified after signing", () => {
  const payload = artifact();
  payload.entries[0].prediction.adjusted.pOver25 = 0.71;
  const result = validatePlanCShadowDay(payload, "2026-08-26");
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /prediction_signature_mismatch/);
});

test("fails closed when the prediction violates forward-only timing", () => {
  const changed = prediction({ predictionCreatedAt: "2026-08-27T20:00:00.000Z" });
  const result = validatePlanCShadowDay(artifact({ entries: [{ prediction: changed, settlement: { state: "PENDING", truth: null } }] }), "2026-08-26");
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /prediction_forward_boundary_invalid/);
});

test("missing optional daily source exports an explicit unavailable shadow artifact", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-plan-c-shadow-"));
  try {
    const loaded = readPlanCShadowDay("2026-08-26", { sourceFile: path.join(dir, "missing.json") });
    assert.deepEqual(loaded.payload, unavailablePlanCShadowDay("2026-08-26"));
    const audit = buildPlanCShadowExportAudit("2026-08-26", loaded, "2026-08-26T10:00:00.000Z");
    assert.equal(audit.available, false);
    assert.equal(audit.officialPlansUnaffected, true);
    assert.equal(validatePlanCShadowExportPayload(loaded.payload, "2026-08-26").ok, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("reads and hashes a valid daily source artifact", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-plan-c-shadow-"));
  try {
    const sourceFile = path.join(dir, "2026-08-26.json");
    fs.writeFileSync(sourceFile, `${JSON.stringify(artifact(), null, 2)}\n`, "utf8");
    const loaded = readPlanCShadowDay("2026-08-26", { sourceFile });
    assert.equal(loaded.payload.count, 1);
    assert.match(loaded.sourceSha256, /^[0-9a-f]{64}$/);
    assert.equal(canonicalPlanCJson({ b: 2, a: 1 }), '{"a":1,"b":2}');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
