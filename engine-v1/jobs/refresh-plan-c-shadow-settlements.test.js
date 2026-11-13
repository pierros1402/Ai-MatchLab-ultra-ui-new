import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { refreshPlanCSettlements } from "./refresh-plan-c-shadow-settlements.js";
const sample = JSON.parse(fs.readFileSync(new URL("../../data/plan-c-shadow/2026-08-26.json", import.meta.url), "utf8"));
test("historical export receives FT settlement without changing frozen predictions", () => {
  const previous = structuredClone(sample);
  const entry = previous.entries.find(e => e.prediction.planCPick);
  entry.settlement = { state: "PENDING", truth: null, pendingReason: "NO_CANONICAL_TRUTH", brier: null, hitRate: null };
  const record = { canonicalFixtureId: entry.prediction.canonicalFixtureId, prediction: { signature: entry.prediction.predictionSignature }, state: "SETTLED", truth: { status: "FT", scoreHome: 2, scoreAway: 1 }, pendingReason: null, brier: null, hitRate: { isHit: true } };
  const report = { ok: true, mode: "SHADOW", productionEligible: false, records: [record] };
  const result = refreshPlanCSettlements(previous, report);
  assert.equal(result.changed, true);
  assert.deepEqual(result.payload.entries.map(e => e.prediction), previous.entries.map(e => e.prediction));
  assert.equal(refreshPlanCSettlements(result.payload, report).changed, false);
  const wrong = structuredClone(report); wrong.records[0].prediction.signature = "b".repeat(64);
  assert.throws(() => refreshPlanCSettlements(previous, wrong), /signature_conflict/);
  const rewrite = structuredClone(report); rewrite.records[0].truth.scoreHome = 0;
  assert.throws(() => refreshPlanCSettlements(result.payload, rewrite), /terminal_rewrite/);
  const duplicate = structuredClone(report); duplicate.records.push(record);
  assert.throws(() => refreshPlanCSettlements(previous, duplicate), /duplicate_settlement/);
});

test("terminal source-hash drift preserves original settlement and rejects real changes", () => {
  const previous = structuredClone(sample);
  const entry = previous.entries.find(e => e.prediction.planCPick);
  const id = entry.prediction.canonicalFixtureId;
  const original = {
    state: "SETTLED",
    truth: {
      status: "FT",
      source: "data/canonical-fixtures/day.json",
      sourceSha256: "a".repeat(64),
      scoreHome: 1,
      scoreAway: 3,
      totalGoals: 4,
      actualOver25: 1
    },
    pendingReason: null,
    brier: { adjusted: 0.1, baseline: 0.2 },
    hitRate: { applicableToHitRate: true, isHit: true }
  };
  entry.settlement = structuredClone(original);

  const record = {
    canonicalFixtureId: id,
    prediction: { signature: entry.prediction.predictionSignature },
    ...structuredClone(original),
    truth: { ...original.truth, sourceSha256: "b".repeat(64) }
  };
  const report = {
    ok: true,
    mode: "SHADOW",
    productionEligible: false,
    records: [record]
  };

  const preserved = refreshPlanCSettlements(previous, report);
  assert.equal(preserved.changed, false);
  assert.deepEqual(
    preserved.payload.entries.find(e => e.prediction.canonicalFixtureId === id).settlement,
    original
  );

  for (const mutate of [
    r => { r.truth.scoreHome = 2; },
    r => { r.truth.source = "other-source.json"; },
    r => { r.brier.adjusted = 0.3; }
  ]) {
    const conflicting = structuredClone(report);
    mutate(conflicting.records[0]);
    assert.throws(
      () => refreshPlanCSettlements(previous, conflicting),
      /terminal_rewrite/
    );
  }
});
