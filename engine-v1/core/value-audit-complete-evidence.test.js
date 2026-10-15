import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { buildValueDay, expandValueMarkets } from "./build-value-day.js";
import { evaluateMatchValue } from "./value-engine-v1.js";
import { resolveDataPath, getDataRoot } from "../storage/data-root.js";
import { createValueDecisionEvidence } from "../storage/value-decision-evidence.js";

test("a real Plan A build retains rejection 101 and the raw-sample null diagnostic", async () => {
  const day = "2099-12-30";
  const canonical = resolveDataPath("canonical-fixtures", day);
  const output = resolveDataPath(`test-value-evidence-${crypto.randomUUID()}`);
  assert.equal(fs.existsSync(canonical), false, "test must never replace an existing fixture day");
  const owned = [];
  try {
    fs.mkdirSync(canonical, { recursive: true }); owned.push(canonical);
    fs.mkdirSync(output, { recursive: true }); owned.push(output);
    const fixtures = Array.from({ length: 103 }, (_, i) => ({
      canonicalId: `cid_audit_evidence_${String(i).padStart(3, "0")}`,
      matchId: `cid_audit_evidence_${String(i).padStart(3, "0")}`,
      leagueSlug: "test.1", homeTeam: "Evidence Home", awayTeam: `Evidence Away ${i}`,
      kickoffUtc: `${day}T18:00:00Z`, status: i === 102 ? "PRE" : "STATUS_CANCELLED"
    }));
    fs.writeFileSync(path.join(canonical, "test.1.json"), JSON.stringify({ date: day, fixtures }), { flag: "wx" });
    const result = await buildValueDay(day, {
      rebuild: true, outputPath: path.join(output, "value.json"), auditPath: path.join(output, "audit.json"),
      decisionEvidenceFactory: (dayKey, planId, inputs) => createValueDecisionEvidence(dayKey, planId, inputs, { dataRoot: output })
    });
    const audit = JSON.parse(fs.readFileSync(path.join(output, "audit.json")));
    assert.deepEqual(result.picks, []);
    assert.equal(audit.evaluationAccounting.evaluatedFixtureCount, 103);
    assert.equal(audit.evaluationAccounting.terminalOutcomeCount, 103);
    assert.equal(audit.evaluationAccounting.unaccountedFixtureCount, 0);
    assert.equal(audit.rejections.total, 103);
    assert.equal(audit.rejections.sample.length, 100);
    assert.equal(audit.rejections.complete, true);
    assert.equal(audit.rejections.details.length, 103);
    assert.equal(new Set(audit.rejections.details.map(r => r.matchId)).size, 103);
    const last = audit.rejections.details.find(r => r.matchId === fixtures[102].canonicalId);
    assert.equal(last.reason, "no_value_signal");
    assert.equal(last.valueNullReason, "minimum_recent_sample");
    assert.equal(last.minimumRecentSample.sampleBasis, "current_season_raw");
    assert.equal(last.minimumRecentSample.homeRawSample, 0);
    assert.equal(last.minimumRecentSample.awayRawSample, 0);
    assert.equal(audit.rejections.sample.some(r => r.matchId === last.matchId), false);
    assert.ok(audit.decisionInputEvidence.records.some(r => r.stage === "shared_inputs"));
    const returned = audit.decisionInputEvidence.records.find(r => r.stage === "engine_returned");
    assert.equal(returned.canonicalMatchId, fixtures[102].canonicalId);
    const receiptFile = path.join(output, returned.receipt.path.replace(/^data\//u, ""));
    assert.equal(crypto.createHash("sha256").update(fs.readFileSync(receiptFile)).digest("hex"), returned.receipt.sha256);
    const receipt = JSON.parse(fs.readFileSync(receiptFile));
    const inputFile = path.join(output, receipt.inputs.input.path.replace(/^data\//u, ""));
    const input = JSON.parse(fs.readFileSync(inputFile));
    assert.ok(Object.hasOwn(input, "ai"), "internal AI detail load must be captured after the engine returns");
    assert.equal(input.canonicalId, fixtures[102].canonicalId);
    const beforeFailure = fs.readFileSync(path.join(output, "value.json"));
    await assert.rejects(buildValueDay(day, {
      rebuild: true, outputPath: path.join(output, "value.json"), auditPath: path.join(output, "audit.json"),
      decisionEvidenceFactory: () => ({ capture() {
        const error = new Error("synthetic evidence I/O failure"); error.code = "VALUE_DECISION_EVIDENCE_FAILED"; throw error;
      }, summary() { return {}; } })
    }), { code: "VALUE_DECISION_EVIDENCE_FAILED" });
    assert.deepEqual(fs.readFileSync(path.join(output, "value.json")), beforeFailure);
  } finally {
    for (const directory of owned) {
      const resolved = fs.realpathSync(directory);
      assert.ok(resolved.startsWith(fs.realpathSync(getDataRoot()) + path.sep));
      assert.notEqual(resolved, fs.realpathSync(getDataRoot()));
      fs.rmSync(resolved, { recursive: true });
    }
  }
});

test("requesting null evidence retains the original engine rejection", async () => {
  const fixture = { leagueSlug: "test.1", homeTeam: "No History Home", awayTeam: "No History Away", kickoff: "2099-12-30T18:00:00Z" };
  const options = { season: "2099", indexes: { teamForm: {}, leagueForm: {}, matchups: {} }, priors: { teamPriors: {}, leaguePriors: {}, matchupPriors: {} } };
  assert.equal(await evaluateMatchValue({ ...fixture }, options), null);
  const diagnostic = await evaluateMatchValue({ ...fixture }, { ...options, returnNullDiagnostics: true });
  assert.equal(diagnostic.__valueNullDiagnostic, true);
  assert.equal(diagnostic.reason, "minimum_recent_sample");
});

test("market expansion preserves opponent evidence without changing any forecast field", () => {
  const recency = Object.fromEntries(["homeOverall", "awayOverall", "homeSide", "awaySide"].map(k => [k, {
    rawSample: 12, sample: 12, priorSample: 0, freshnessScore: 1, continuityScore: 1, formContinuityWeight: 1
  }]));
  const value = { score: .91, confidence: .95, rawConfidence: .95, band: "HIGH", homeWinScore: .9,
    drawScore: .05, awayWinScore: .05, over25Score: .88, over35Score: .8, bttsScore: .86,
    meta: { recency, matchupSample: 6 } };
  const fixture = { matchId: "cid_evidence_meta", canonicalId: "cid_evidence_meta", leagueSlug: "test.1", homeTeam: "Home", awayTeam: "Away", kickoffUtc: "2099-12-30T18:00:00Z" };
  const evidence = { home: { sample: 8, impact: { goals: .12 } }, away: { sample: 9 }, sampleReliability: .8 };
  const baseline = expandValueMarkets(fixture, value);
  const withEvidence = expandValueMarkets(fixture, { ...value, opponentAdjustedForm: evidence });
  assert.ok(baseline.length > 0);
  for (const pick of withEvidence) assert.deepEqual(pick.meta.opponentAdjustedForm, evidence);
  const withoutEvidence = withEvidence.map(pick => {
    const { opponentAdjustedForm, ...meta } = pick.meta;
    return { ...pick, meta };
  });
  assert.deepEqual(withoutEvidence, baseline);
});
