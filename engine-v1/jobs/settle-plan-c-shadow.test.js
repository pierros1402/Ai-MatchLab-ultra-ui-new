import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { planCPredictionSetHash, planCPredictionSignature } from "../value/plan-c-shadow-export.js";
import { settlePlanCShadow } from "./settle-plan-c-shadow.js";

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function setup(status = "PRE", scoreHome = null, scoreAway = null) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-plan-c-settle-"));
  const predictionRoot = path.join(root, "bundle");
  const truthRoot = path.join(root, "truth");
  const outputFile = path.join(root, "settlement.json");
  const auditFile = path.join(root, "audit.json");
  const prediction = {
    schema: "ai-matchlab.plan-c-shadow-prediction.v1.2",
    canonicalFixtureId: "cid_test1_home_away_20260827",
    day: "2026-08-27",
    kickoffUtc: "2026-08-27T19:00:00.000Z",
    snapshotRetrievedAt: "2026-08-24T08:00:00.000Z",
    predictionCreatedAt: "2026-08-26T09:00:00.000Z",
    identityCategory: "both",
    eloApplied: true,
    baseline: { lambdaHome: 1.4, lambdaAway: 1.2, pOver25: 0.51 },
    adjusted: { lambdaHome: 1.5, lambdaAway: 1.1, pOver25: 0.57 },
    planCPick: true
  };
  prediction.predictionSignature = planCPredictionSignature(prediction);
  const index = {
    accounting: { total: 1 },
    predictions: [{
      canonicalFixtureId: prediction.canonicalFixtureId,
      relativePath: `predictions/${prediction.canonicalFixtureId}.json`,
      predictionSignature: prediction.predictionSignature,
      planCPick: true
    }]
  };
  writeJson(path.join(predictionRoot, "PREDICTION_INDEX.json"), index);
  writeJson(path.join(predictionRoot, "MANIFEST.json"), { predictionSetHash: planCPredictionSetHash(index.predictions) });
  writeJson(path.join(predictionRoot, index.predictions[0].relativePath), prediction);
  writeJson(path.join(truthRoot, "2026-08-27", "test.1.json"), {
    fixtures: [{ canonicalId: prediction.canonicalFixtureId, status, scoreHome, scoreAway }]
  });
  return { root, predictionRoot, truthRoot, outputFile, auditFile, prediction };
}

test("settlement remains deterministic while truth is pending", () => {
  const input = setup();
  try {
    const options = { dayKey: "2026-08-27", ...input };
    const first = settlePlanCShadow(options);
    const firstBytes = fs.readFileSync(input.outputFile, "utf8");
    const second = settlePlanCShadow(options);
    assert.equal(second.report.accounting.pending, 1);
    assert.equal(second.report.idempotencyHash, first.report.idempotencyHash);
    assert.equal(fs.readFileSync(input.outputFile, "utf8"), firstBytes);
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test("FT truth settles Brier and hit rate and terminal state is immutable", () => {
  const input = setup("FT", 2, 1);
  try {
    const options = { dayKey: "2026-08-27", ...input };
    const first = settlePlanCShadow(options);
    assert.equal(first.report.accounting.settled, 1);
    assert.equal(first.report.records[0].truth.actualOver25, 1);
    assert.equal(first.report.records[0].hitRate.isHit, true);
    assert.equal(first.report.brierSummary.adjustedMeanBrier, 0.1849);
    assert.equal(first.report.brierSummary.baselineMeanBrier, 0.2401);
    const firstBytes = fs.readFileSync(input.outputFile, "utf8");
    const second = settlePlanCShadow(options);
    assert.equal(second.report.idempotencyHash, first.report.idempotencyHash);
    assert.equal(fs.readFileSync(input.outputFile, "utf8"), firstBytes);

    writeJson(path.join(input.truthRoot, "2026-08-27", "test.1.json"), {
      fixtures: [{ canonicalId: input.prediction.canonicalFixtureId, status: "FT", scoreHome: 3, scoreAway: 1 }]
    });
    assert.throws(() => settlePlanCShadow(options), /terminal_settled_score_conflict/);
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test("void canonical status is excluded from all score denominators", () => {
  const input = setup("POSTP", null, null);
  try {
    const result = settlePlanCShadow({ dayKey: "2026-08-27", ...input });
    assert.equal(result.report.accounting.voidExcluded, 1);
    assert.equal(result.report.brierSummary.n, 0);
    assert.equal(result.report.hitRateSummary.settledPickCount, 0);
    assert.equal(result.report.hitRateSummary.hitRate, null);
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});
