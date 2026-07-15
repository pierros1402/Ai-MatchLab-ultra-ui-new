import test from "node:test";
import assert from "node:assert/strict";
import { buildSourceReliabilityCalibration } from "./source-reliability-calibration.js";

function claim(claimId, family, sourceKind = "direct_provider") {
  return {
    claimId,
    provider: family,
    sourceId: claimId,
    independence: {
      independenceFamily: family,
      independenceEligible: true,
      sourceKind
    }
  };
}

function fixtures() {
  const scoreFact = {
    factId: "score-fact",
    reasoningState: "insufficient_evidence",
    claimScores: [claim("espn-claim", "espn"), claim("flash-claim", "flashscore")],
    proposal: {
      alternatives: [
        { score: "1|1", claimIds: ["espn-claim"] },
        { score: "2|1", claimIds: ["flash-claim"] }
      ]
    }
  };
  const verifiedFact = {
    factId: "verified-fact",
    reasoningState: "stable_verified",
    claimScores: [claim("peer-a", "espn"), claim("peer-b", "sofascore")]
  };
  const reasoning = { ok: true, facts: [scoreFact, verifiedFact] };
  const resolutionReport = {
    ok: true,
    resolutions: [{
      resolutionId: "score-resolution",
      resolutionType: "score",
      proposalStatus: "authoritatively_supported",
      blockIds: ["score-block"],
      candidate: { homeGoals: 1, awayGoals: 1 },
      targetFacts: [scoreFact]
    }]
  };
  return { reasoning, resolutionReport };
}

test("authoritative candidate creates agreement and disagreement observations", () => {
  const { reasoning, resolutionReport } = fixtures();
  const report = buildSourceReliabilityCalibration({ reasoning, resolutionReport });
  assert.equal(report.summary.adjudicatedObservations, 2);
  assert.equal(report.summary.adjudicatedAgreements, 1);
  assert.equal(report.summary.adjudicatedDisagreements, 1);
});

test("peer agreement remains diagnostic rather than accuracy evidence", () => {
  const { reasoning, resolutionReport } = fixtures();
  const report = buildSourceReliabilityCalibration({ reasoning, resolutionReport });
  assert.equal(report.summary.peerAgreementObservations, 2);
  assert.equal(report.peerAgreementDiagnostics.operationalAccuracyEvidence, false);
  assert.equal(report.guarantees.peerAgreementUsedAsAdjudicatedAccuracy, 0);
});

test("legacy reliability is diagnostic only", () => {
  const { reasoning, resolutionReport } = fixtures();
  const report = buildSourceReliabilityCalibration({
    reasoning,
    resolutionReport,
    legacyReliability: { espn: { total: 826, agreements: 826, disagreements: 0 } }
  });
  assert.equal(report.summary.legacyReliabilityObservations, 826);
  assert.equal(report.legacyReliability.rows[0].operationallyTrusted, false);
  assert.equal(report.guarantees.legacyReliabilityOperationallyTrusted, 0);
});

test("small adjudicated samples cannot update operational reliability", () => {
  const { reasoning, resolutionReport } = fixtures();
  const report = buildSourceReliabilityCalibration({
    reasoning,
    resolutionReport,
    minimumOperationalSamples: 30
  });
  assert.equal(report.summary.operationallyEligibleUpdates, 0);
  assert.ok(report.calibrationRows.every(row => row.proposedOperationalValue == null));
});
