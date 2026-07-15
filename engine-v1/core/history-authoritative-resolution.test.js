import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAuthoritativeResolutionReport,
  AUTHORITATIVE_EVIDENCE_MANIFEST_SCHEMA
} from "./history-authoritative-resolution.js";

function reasoningFixture() {
  return {
    ok: true,
    summary: { conflictedFacts: 3 },
    facts: [
      {
        factId: "score-fact",
        factKey: "score-key",
        evidenceStatus: "conflicted",
        identity: {},
        claimScores: [],
        lineage: { blockIds: ["score-block"] }
      },
      {
        factId: "orientation-home",
        factKey: "orientation-home-key",
        evidenceStatus: "conflicted",
        identity: {},
        claimScores: [],
        lineage: { blockIds: ["orientation-block"] }
      },
      {
        factId: "orientation-away",
        factKey: "orientation-away-key",
        evidenceStatus: "conflicted",
        identity: {},
        claimScores: [],
        lineage: { blockIds: ["orientation-block"] }
      }
    ]
  };
}

function evidence(sourceFamily, sourceType, observed) {
  return {
    evidenceId: `${sourceFamily}-${sourceType}`,
    publisher: sourceFamily,
    sourceFamily,
    sourceType,
    url: `https://example.com/${sourceFamily}`,
    retrievedAt: "2026-07-15T10:00:00.000Z",
    observed
  };
}

function manifest(resolutions) {
  return {
    schema: AUTHORITATIVE_EVIDENCE_MANIFEST_SCHEMA,
    policyVersion: "history-authoritative-resolution-policy-v1",
    resolutions,
    deferredBlocks: []
  };
}

test("one official federation source supports a score candidate", () => {
  const report = buildAuthoritativeResolutionReport({
    reasoning: reasoningFixture(),
    manifest: manifest([{
      resolutionId: "score-resolution",
      resolutionType: "score",
      blockIds: ["score-block"],
      targetFactIds: ["score-fact"],
      candidate: { homeGoals: 1, awayGoals: 1 },
      evidenceItems: [
        evidence("federation", "official_federation", { homeGoals: 1, awayGoals: 1 })
      ]
    }])
  });
  assert.equal(report.resolutions[0].proposalStatus, "authoritatively_supported");
  assert.equal(report.resolutions[0].confidenceClass, "authoritative");
});

test("two independent scoreboards support a score candidate", () => {
  const report = buildAuthoritativeResolutionReport({
    reasoning: reasoningFixture(),
    manifest: manifest([{
      resolutionId: "score-resolution",
      resolutionType: "score",
      blockIds: ["score-block"],
      targetFactIds: ["score-fact"],
      candidate: { homeGoals: 1, awayGoals: 1 },
      evidenceItems: [
        evidence("provider-a", "direct_scoreboard", { homeGoals: 1, awayGoals: 1 }),
        evidence("provider-b", "independent_results_portal", { homeGoals: 1, awayGoals: 1 })
      ]
    }])
  });
  assert.equal(report.resolutions[0].proposalStatus, "authoritatively_supported");
  assert.equal(report.resolutions[0].confidenceClass, "multi_source_corroborated");
});

test("one non-authoritative source is insufficient", () => {
  const report = buildAuthoritativeResolutionReport({
    reasoning: reasoningFixture(),
    manifest: manifest([{
      resolutionId: "score-resolution",
      resolutionType: "score",
      blockIds: ["score-block"],
      targetFactIds: ["score-fact"],
      candidate: { homeGoals: 1, awayGoals: 1 },
      evidenceItems: [
        evidence("provider-a", "direct_scoreboard", { homeGoals: 1, awayGoals: 1 })
      ]
    }])
  });
  assert.equal(
    report.resolutions[0].proposalStatus,
    "insufficient_authoritative_evidence"
  );
});

test("official orientation evidence supports retained and suppressed facts", () => {
  const report = buildAuthoritativeResolutionReport({
    reasoning: reasoningFixture(),
    manifest: manifest([{
      resolutionId: "orientation-resolution",
      resolutionType: "orientation",
      blockIds: ["orientation-block"],
      targetFactIds: ["orientation-home", "orientation-away"],
      candidate: {
        retainedFactId: "orientation-home",
        suppressedFactIds: ["orientation-away"],
        homeTeam: "Nomme Kalju U21",
        awayTeam: "Viimsi JK",
        homeGoals: 1,
        awayGoals: 1
      },
      evidenceItems: [
        evidence("efa", "official_federation", {
          homeTeam: "Nomme Kalju U21",
          awayTeam: "Viimsi JK",
          homeGoals: 1,
          awayGoals: 1
        })
      ]
    }])
  });
  assert.equal(report.resolutions[0].proposalStatus, "authoritatively_supported");
  assert.equal(report.resolutions[0].candidate.retainedFactId, "orientation-home");
});

test("supported proposals never permit automatic application", () => {
  const report = buildAuthoritativeResolutionReport({
    reasoning: reasoningFixture(),
    manifest: manifest([{
      resolutionId: "score-resolution",
      resolutionType: "score",
      blockIds: ["score-block"],
      targetFactIds: ["score-fact"],
      candidate: { homeGoals: 1, awayGoals: 1 },
      evidenceItems: [
        evidence("federation", "official_federation", { homeGoals: 1, awayGoals: 1 })
      ]
    }])
  });
  assert.equal(report.resolutions[0].automaticApplyAllowed, false);
  assert.equal(report.guarantees.resolutionsAutomaticallyApplied, 0);
});
