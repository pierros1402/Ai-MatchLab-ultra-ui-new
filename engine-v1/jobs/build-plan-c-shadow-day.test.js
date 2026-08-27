import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildPlanCShadowDayArtifact, assertPlanCShadowMonotonic, parsePlanCShadowCli, writePlanCShadowDay } from "./build-plan-c-shadow-day.js";
import { planCPredictionSignature } from "../value/plan-c-shadow-export.js";

function fixturePrediction() {
  const prediction = {
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
    adjusted: { pOver25: 0.57, lambdaHome: 1.5, lambdaAway: 1.1 }
  };
  prediction.predictionSignature = planCPredictionSignature(prediction);
  return prediction;
}

function inputPackage() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-plan-c-input-"));
  fs.mkdirSync(path.join(root, "predictions"));
  const prediction = fixturePrediction();
  const relativePath = "predictions/one.json";
  fs.writeFileSync(path.join(root, "MANIFEST.json"), '{"accepted":true}\n', "utf8");
  fs.writeFileSync(path.join(root, ...relativePath.split("/")), `${JSON.stringify(prediction, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(root, "PREDICTION_INDEX.json"), `${JSON.stringify({ accounting: { total: 1 }, predictions: [{ canonicalFixtureId: prediction.canonicalFixtureId, relativePath, predictionSignature: prediction.predictionSignature }] }, null, 2)}\n`, "utf8");
  return { root, prediction, manifestHash: crypto.createHash("sha256").update(fs.readFileSync(path.join(root, "MANIFEST.json"))).digest("hex") };
}

test("daily builder emits an export-ready all-PENDING artifact", () => {
  const input = inputPackage();
  try {
    const payload = buildPlanCShadowDayArtifact({ dayKey: "2026-08-26", predictionRoot: input.root, generatedAt: "2026-08-26T10:00:00.000Z" });
    assert.equal(payload.count, 1);
    assert.equal(payload.pickCount, 1);
    assert.equal(payload.entries[0].settlement.state, "PENDING");
    assert.equal(payload.sourcePredictionSetHash, input.manifestHash);
    assert.equal(payload.productionEligible, false);
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test("daily builder applies a bound settlement report", () => {
  const input = inputPackage();
  try {
    const report = {
      sourcePredictionSetHash: input.manifestHash,
      records: [{ canonicalFixtureId: input.prediction.canonicalFixtureId, state: "SETTLED", truth: { status: "FT", scoreHome: 2, scoreAway: 1 }, pendingReason: null, brier: { adjusted: 0.1849, baseline: 0.2401 }, hitRate: { applicableToHitRate: true, isHit: true } }]
    };
    const payload = buildPlanCShadowDayArtifact({ dayKey: "2026-08-26", predictionRoot: input.root, settlementReport: report, generatedAt: "2026-08-26T22:00:00.000Z" });
    assert.equal(payload.entries[0].settlement.state, "SETTLED");
    assert.equal(payload.entries[0].settlement.truth.status, "FT");
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test("terminal settlement cannot be rewritten on a later daily build", () => {
  const input = inputPackage();
  try {
    const oldPayload = buildPlanCShadowDayArtifact({ dayKey: "2026-08-26", predictionRoot: input.root, generatedAt: "2026-08-26T10:00:00.000Z" });
    oldPayload.entries[0].settlement = { state: "SETTLED", truth: { status: "FT", scoreHome: 2, scoreAway: 1 }, pendingReason: null, brier: null, hitRate: null };
    const nextPayload = structuredClone(oldPayload);
    nextPayload.entries[0].settlement.truth.scoreHome = 3;
    assert.throws(() => assertPlanCShadowMonotonic(oldPayload, nextPayload), /plan_c_shadow_terminal_rewrite/);
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test("writer creates daily artifact and audit outside the repository when paths are supplied", () => {
  const input = inputPackage();
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-plan-c-output-"));
  try {
    const outputFile = path.join(outputRoot, "day.json");
    const auditFile = path.join(outputRoot, "audit.json");
    const result = writePlanCShadowDay({ dayKey: "2026-08-26", predictionRoot: input.root, generatedAt: "2026-08-26T10:00:00.000Z", outputFile, auditFile });
    assert.equal(fs.existsSync(outputFile), true);
    assert.equal(fs.existsSync(auditFile), true);
    assert.equal(result.audit.productionEligible, false);
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});

test("CLI omission of --generated-at uses the builder clock instead of an invalid null", () => {
  const input = inputPackage();
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-plan-c-output-"));
  try {
    const args = parsePlanCShadowCli(["2026-08-26", "--prediction-root", input.root]);
    assert.equal(args.generatedAt, undefined);
    const result = writePlanCShadowDay({
      ...args,
      outputFile: path.join(outputRoot, "day.json"),
      auditFile: path.join(outputRoot, "audit.json")
    });
    assert.equal(Number.isFinite(Date.parse(result.payload.generatedAt)), true);
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});

test("daily builder validates LF-normalized manifest artifacts from a CRLF worktree", () => {
  const input = inputPackage();
  try {
    const relativePath = "predictions/one.json";
    const predictionFile = path.join(input.root, ...relativePath.split("/"));
    const lfBytes = Buffer.from(fs.readFileSync(predictionFile, "utf8").replace(/\r\n/gu, "\n"), "utf8");
    const manifest = {
      artifactHashMode: "UTF8_LF_NORMALIZED",
      artifactCount: 1,
      artifacts: [{
        path: relativePath,
        bytes: lfBytes.length,
        sha256: crypto.createHash("sha256").update(lfBytes).digest("hex")
      }]
    };
    fs.writeFileSync(path.join(input.root, "MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    fs.writeFileSync(predictionFile, lfBytes.toString("utf8").replace(/\n/gu, "\r\n"), "utf8");

    const payload = buildPlanCShadowDayArtifact({ dayKey: "2026-08-26", predictionRoot: input.root, generatedAt: "2026-08-26T10:00:00.000Z" });
    assert.equal(payload.count, 1);
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});
