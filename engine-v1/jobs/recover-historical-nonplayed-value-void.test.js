import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { planAObservationSignature } from "../value/plan-a-observation.js";
import { recoverHistoricalNonPlayedValueVoid } from "./recover-historical-nonplayed-value-void.js";

function write(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload), "utf8");
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-nonplayed-void-"));
  const comparisonPath = path.join(root, "comparison.json");
  const planAPath = path.join(root, "plan-a.json");
  const archivedDetailPath = path.join(root, "detail.json");
  const dayKey = "2026-07-19";
  const canonicalId = "cid_kaz1_ertispavlodar_astana_20260719";
  const providerMatchId = "ldvtm1Wg";
  const pick = { matchId: canonicalId, result: "UNRESOLVED", finalScore: null, oddsDecimal: null };
  const planA = { immutable: true, date: dayKey, count: 1, picks: [pick] };
  planA.observationSignature = planAObservationSignature(dayKey, planA);
  write(planAPath, planA);
  write(comparisonPath, {
    plans: {
      A: { picks: [{ ...pick }], summary: {} },
      B: { picks: [{ matchId: "b", result: "WIN", oddsDecimal: 2 }], summary: {} }
    },
    comparison: {}
  });
  write(archivedDetailPath, {
    generatedAt: "2026-07-19T00:47:31.094Z",
    basic: {
      canonicalId,
      providerMatchId,
      source: "flashscore",
      status: "STATUS_POSTPONED",
      rawStatus: "STATUS_POSTPONED",
      statusType: "STATUS_POSTPONED",
      scoreHome: null,
      scoreAway: null
    }
  });
  const resolveDecision = () => ({
    decisionId: "decision-1",
    policyVersion: "v1",
    dayKey,
    canonicalId,
    providerMatchId,
    resolvedStatus: "STATUS_POSTPONED"
  });
  return { dayKey, canonicalId, providerMatchId, comparisonPath, planAPath, archivedDetailPath, resolveDecision };
}

test("recovers an unresolved historical postponed pick as VOID", () => {
  const input = fixture();
  const result = recoverHistoricalNonPlayedValueVoid({ ...input, recoveredAt: "2026-08-15T08:30:00.000Z" });
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  const comparison = JSON.parse(fs.readFileSync(input.comparisonPath, "utf8"));
  assert.equal(comparison.plans.A.picks[0].result, "VOID");
  assert.equal(comparison.plans.A.summary.voids, 1);
  assert.equal(comparison.plans.A.summary.unresolved, 0);
  assert.equal(comparison.plans.A.summary.settled, 0);
  assert.equal(comparison.comparison.winsDeltaPlanBMinusPlanA, 1);

  const repeated = recoverHistoricalNonPlayedValueVoid({ ...input });
  assert.equal(repeated.ok, true);
  assert.equal(repeated.changed, false);
});

test("rejects archived evidence bound to a different provider occurrence", () => {
  const input = fixture();
  const detail = JSON.parse(fs.readFileSync(input.archivedDetailPath, "utf8"));
  detail.basic.providerMatchId = "wrong";
  write(input.archivedDetailPath, detail);
  const result = recoverHistoricalNonPlayedValueVoid(input);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "archived_nonplayed_fixture_evidence_invalid");
});
