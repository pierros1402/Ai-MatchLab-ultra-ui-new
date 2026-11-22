import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { planCPredictionSetHash, planCPredictionSignature } from "../value/plan-c-shadow-export.js";
import { settlePlanCShadow, recoverLegacyPendingTerminal } from "./settle-plan-c-shadow.js";

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

test("invalid historical SETTLED is rejected with and without current canonical truth", () => {
  const input = setup("FT", 2, 1);
  try {
    const options = { dayKey: "2026-08-27", ...input };
    settlePlanCShadow(options);

    const malformed = JSON.parse(fs.readFileSync(input.outputFile, "utf8"));
    malformed.records[0].truth = null;
    writeJson(input.outputFile, malformed);

    assert.throws(
      () => settlePlanCShadow(options),
      /previous_settled_integrity_invalid/
    );

    fs.rmSync(path.join(input.truthRoot, "2026-08-27", "test.1.json"));

    assert.throws(
      () => settlePlanCShadow(options),
      /previous_settled_integrity_invalid/
    );
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test("invalid historical VOID is rejected with and without current truth without overwriting output", () => {
  const input = setup("POSTP", null, null);
  try {
    const options = { dayKey: "2026-08-27", ...input };
    settlePlanCShadow(options);
    const original = fs.readFileSync(input.outputFile);
    const base = JSON.parse(original.toString("utf8"));
    const truthFile = path.join(input.truthRoot, "2026-08-27", "test.1.json");
    const truthBytes = fs.readFileSync(truthFile);

    const invalidTruths = [
      null,
      { ...base.records[0].truth, status: "FT" },
      { ...base.records[0].truth, scoreHome: 1 },
      { ...base.records[0].truth, scoreAway: 2 }
    ];

    for (const invalid of invalidTruths) {
      const corrupted = JSON.parse(original.toString("utf8"));
      corrupted.records[0].truth = invalid;
      writeJson(input.outputFile, corrupted);
      const before = fs.readFileSync(input.outputFile);

      assert.throws(() => settlePlanCShadow(options),
        /previous_void_integrity_invalid/);
      assert.deepEqual(fs.readFileSync(input.outputFile), before);

      fs.rmSync(truthFile);
      assert.throws(() => settlePlanCShadow(options),
        /previous_void_integrity_invalid/);
      assert.deepEqual(fs.readFileSync(input.outputFile), before);
      fs.writeFileSync(truthFile, truthBytes);
    }

    fs.writeFileSync(input.outputFile, original);
    settlePlanCShadow(options);
    assert.deepEqual(fs.readFileSync(input.outputFile), original);
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});


test("terminal integrity union rejects corrupted historical FT and VOID without writes", () => {
  const cases = [
    ["FT", r => { r.truth.totalGoals = 99; }],
    ["FT", r => { r.truth.actualOver25 = 0; }],
    ["FT", r => { r.brier.adjusted = null; }],
    ["FT", r => { r.brier.baseline = "0.2"; }],
    ["VOID", r => { delete r.truth.scoreHome; }],
    ["VOID", r => { r.pendingReason = "invalid"; }],
    ["VOID", r => { r.brier = { adjusted: 0, baseline: 0 }; }],
    ["VOID", r => { r.hitRate = { isHit: true }; }],
    ["VOID", r => { r.truth.scoreAway = 2; }],
    ["FT", r => { r.truth = null; }]
  ];
  for (const [kind, mutate] of cases) {
    const input = kind === "FT" ? setup("FT", 2, 1) : setup("POSTP", null, null);
    try {
      const options = { dayKey: "2026-08-27", ...input };
      settlePlanCShadow(options);
      const malformed = JSON.parse(fs.readFileSync(input.outputFile, "utf8"));
      mutate(malformed.records[0]);
      writeJson(input.outputFile, malformed);
      const bytes = fs.readFileSync(input.outputFile);
      const audit = fs.readFileSync(input.auditFile);
      const expected = kind === "FT" ? /previous_settled_integrity_invalid/ : /previous_void_integrity_invalid/;
      for (const present of [true, false]) {
        if (!present) fs.rmSync(path.join(input.truthRoot, "2026-08-27", "test.1.json"));
        assert.throws(() => settlePlanCShadow(options), expected);
        assert.deepEqual(fs.readFileSync(input.outputFile), bytes);
        assert.deepEqual(fs.readFileSync(input.auditFile), audit);
      }
    } finally { fs.rmSync(input.root, { recursive: true, force: true }); }
  }
});


test("exact source-bound pending-shaped terminal can be reconstructed only with explicit authorization", () => {
  const input = setup("FT", 2, 1);
  try {
    const options = { dayKey: "2026-08-27", ...input };
    settlePlanCShadow(options);
    // Even opt-in recovery must reject unrelated fixture identities.
    const malformed = JSON.parse(fs.readFileSync(input.outputFile, "utf8"));
    const row = malformed.records[0];
    row.state = "SETTLED";
    row.truth = null;
    row.pendingReason = "CANONICAL_STATUS_FIRST_HALF";
    row.brier = null;
    row.hitRate = null;
    writeJson(input.outputFile, malformed);
    const originalBytes = fs.readFileSync(input.outputFile);
    assert.throws(() => settlePlanCShadow({...options, repairLegacyPendingShapedTerminal: true}),
      /previous_settled_integrity_invalid/);
    assert.deepEqual(fs.readFileSync(input.outputFile), originalBytes);
  } finally { fs.rmSync(input.root, { recursive: true, force: true }); }
});

test("all generated terminal rows are checked before write and normal FT remains idempotent", () => {
  const input = setup("FT", 2, 1);
  try {
    const options = { dayKey: "2026-08-27", ...input };
    const first = settlePlanCShadow(options);
    const original = fs.readFileSync(input.outputFile);
    assert.equal(first.report.accounting.settled, 1);
    const second = settlePlanCShadow(options);
    assert.equal(second.audit.explicitLegacyPendingTerminalRecovery.length, 0);
    assert.deepEqual(fs.readFileSync(input.outputFile), original);
  } finally { fs.rmSync(input.root, { recursive: true, force: true }); }
});


test("pinned recovery restores only the exact mislabeled record using authoritative FT", () => {
  const id = "cid_bra1_cruzeiro_palmeiras_20261119";
  const signature = "f9b634412aac9e72de2a6eabdb4952e37b0e81df6fe5b8624";
  const original = {
    canonicalFixtureId: id, state: "SETTLED", planCPick: false,
    prediction: {signature, planCPick: false}, truth: null,
    pendingReason: "CANONICAL_STATUS_FIRST_HALF", brier: null, hitRate: null
  };
  const prediction = {
    canonicalFixtureId: id, predictionSignature: signature, planCPick: false,
    adjusted: {pOver25: 0.48600796, lambdaHome: 1.283993, lambdaAway: 1.333721},
    baseline: {pOver25: 0.48593504}
  };
  const truth = {
    canonicalFixtureId: id, status: "FT", scoreHome: 2, scoreAway: 1,
    sourcePath: "data/canonical-fixtures/2026-11-19/bra.1.json",
    sourceSha256: "14a2b1b84e6b59bd5b50ed40a3eeb2a6cfa008a13011d4a36031468dc4edcaf6"
  };
  assert.equal(recoverLegacyPendingTerminal(original, prediction, truth, false), null);
  const repaired = recoverLegacyPendingTerminal(original, prediction, truth, true);
  assert.equal(repaired.state, "SETTLED");
  assert.equal(repaired.truth.status, "FT");
  assert.deepEqual([repaired.truth.scoreHome, repaired.truth.scoreAway], [2, 1]);
  assert.equal(repaired.brier.adjusted, 0.26418782);
  assert.equal(repaired.brier.baseline, 0.26426278);
  assert.equal(repaired.hitRate.applicableToHitRate, false);
  assert.equal(repaired.hitRate.isHit, null);
  assert.equal(original.truth, null);
  assert.throws(() => recoverLegacyPendingTerminal(original, prediction, {...truth, status: "FIRST_HALF"}, true),
    /legacy_pending_terminal_recovery_not_authorized/);
  assert.throws(() => recoverLegacyPendingTerminal({...original, pendingReason: "UNKNOWN"}, prediction, truth, true),
    /legacy_pending_terminal_recovery_not_authorized/);
  assert.throws(() => recoverLegacyPendingTerminal(original, {...prediction, predictionSignature: "f".repeat(64)}, truth, true),
    /legacy_pending_terminal_recovery_not_authorized/);
});
