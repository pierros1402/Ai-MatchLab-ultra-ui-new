import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { validatePlanCShadowSyncPair } from "./sync-plan-c-shadow-from-github.js";
import { planCPredictionSignature } from "../value/plan-c-shadow-export.js";

function pair() {
  const prediction = {
    schema: "ai-matchlab.plan-c-shadow-prediction.v1.2",
    canonicalFixtureId: "cid_test_home_away_20260828",
    day: "2026-08-28",
    kickoffUtc: "2026-08-28T19:00:00.000Z",
    snapshotRetrievedAt: "2026-08-27T08:00:00.000Z",
    predictionCreatedAt: "2026-08-27T09:00:00.000Z",
    identityCategory: "both",
    eloApplied: true,
    planCPick: true,
    baseline: { pOver25: 0.51 },
    adjusted: { pOver25: 0.57 }
  };
  prediction.predictionSignature = planCPredictionSignature(prediction);
  const payload = {
    schema: "ai-matchlab.plan-c-shadow-day.v1",
    ok: true,
    available: true,
    mode: "SHADOW",
    productionEligible: false,
    date: "2026-08-27",
    generatedAt: "2026-08-27T09:01:00.000Z",
    sourcePredictionSetHash: "a".repeat(64),
    count: 1,
    pickCount: 1,
    entries: [{ prediction, settlement: { state: "PENDING", truth: null } }]
  };
  const payloadBuffer = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, "utf8");
  const audit = {
    schema: "ai-matchlab.plan-c-shadow-build-audit.v1",
    ok: true,
    date: "2026-08-27",
    outputSha256: crypto.createHash("sha256").update(payloadBuffer).digest("hex"),
    count: 1,
    pickCount: 1,
    productionEligible: false
  };
  return { payloadBuffer, auditBuffer: Buffer.from(`${JSON.stringify(audit, null, 2)}\n`, "utf8") };
}

test("commit-pinned Plan C shadow sync validates payload and audit binding", () => {
  const input = pair();
  const result = validatePlanCShadowSyncPair({ dayKey: "2026-08-27", ...input });
  assert.equal(result.count, 1);
  assert.equal(result.pickCount, 1);
  assert.equal(result.payload.productionEligible, false);
});

test("Plan C shadow sync rejects an audit that does not bind the payload", () => {
  const input = pair();
  const audit = JSON.parse(input.auditBuffer.toString("utf8"));
  audit.outputSha256 = "b".repeat(64);
  assert.throws(
    () => validatePlanCShadowSyncPair({
      dayKey: "2026-08-27",
      payloadBuffer: input.payloadBuffer,
      auditBuffer: Buffer.from(JSON.stringify(audit), "utf8")
    }),
    /plan_c_shadow_sync_audit_binding_invalid/u
  );
});
