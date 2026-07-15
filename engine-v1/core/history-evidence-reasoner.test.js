import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyClaimIndependence,
  reasonAboutHistoryEvidence,
  scoreHistoryEvidenceClaim
} from "./history-evidence-reasoner.js";

function claim(overrides = {}) {
  return {
    claimId: "claim-1",
    factId: "fact-1",
    provider: "espn",
    sourceId: "espn_1",
    role: "current_history_claim",
    evidenceClass: "direct_structured_final",
    observed: {
      kickoff: "2026-07-12T18:00Z",
      status: "STATUS_FULL_TIME"
    },
    fieldClaims: { score: "1|1", finalStatus: true },
    providerDiagnostics: {
      initialPrior: 0.82,
      learnedAgreementRate: 1,
      learnedSampleSize: 826
    },
    ...overrides
  };
}

function foundation(facts) {
  return {
    schema: "ai-matchlab.history-evidence-foundation.v1",
    facts
  };
}

function fact(overrides = {}) {
  return {
    factId: "fact-1",
    factKey: "match_result|arg.2|home|away|2026-07-12|1",
    identity: {},
    claims: [claim()],
    resolution: {
      evidenceStatus: "supported",
      confidence: 0.7,
      selectedScore: { home: 1, away: 1 },
      reasonCodes: []
    },
    lineage: { blockIds: [] },
    ...overrides
  };
}

test("direct provider is an eligible independent family", () => {
  const result = classifyClaimIndependence(claim());
  assert.equal(result.independenceEligible, true);
  assert.equal(result.independenceFamily, "espn");
  assert.equal(result.sourceKind, "direct_provider");
});

test("results-memory recovery inherits upstream family only from explicit source id", () => {
  const result = classifyClaimIndependence(claim({
    provider: "results-memory-recovery",
    sourceId: "espn_401843965"
  }));
  assert.equal(result.independenceEligible, true);
  assert.equal(result.independenceFamily, "espn");
  assert.equal(result.derivationDepth, 1);
});

test("snapshot recovery is not an independent truth source", () => {
  const result = classifyClaimIndependence(claim({
    provider: "snapshot-recovery",
    sourceId: "401843965"
  }));
  assert.equal(result.independenceEligible, false);
  assert.match(result.reasonCodes.join(" "), /snapshot_is_not_independent_truth/);
});

test("final historical evidence does not decay merely because it is old", () => {
  const scored = scoreHistoryEvidenceClaim(claim({
    observed: { kickoff: "2018-01-01T12:00Z" }
  }));
  assert.equal(scored.temporal.temporalClass, "immutable_final_fact");
  assert.equal(scored.temporal.freshnessFactor, 1);
  assert.equal(scored.temporal.ageDecayApplied, false);
});

test("learned reliability is shrunk and explainable", () => {
  const scored = scoreHistoryEvidenceClaim(claim());
  assert.equal(scored.learnedReliability.applied, true);
  assert.ok(scored.learnedReliability.effectiveValue > 0.82);
  assert.ok(scored.score <= 1 && scored.score >= 0);
});

test("same upstream family counts once in a conflict alternative", () => {
  const result = reasonAboutHistoryEvidence({
    evidenceFoundation: foundation([fact({
      claims: [
        claim({ claimId: "direct", sourceId: "espn_1" }),
        claim({
          claimId: "recovered",
          provider: "results-memory-recovery",
          sourceId: "espn_1",
          role: "current_history_claim"
        }),
        claim({
          claimId: "fs",
          provider: "flashscore",
          sourceId: "fs_1",
          fieldClaims: { score: "2|1", finalStatus: true },
          providerDiagnostics: {
            initialPrior: 0.82,
            learnedAgreementRate: null,
            learnedSampleSize: 0
          }
        })
      ],
      resolution: {
        evidenceStatus: "conflicted",
        confidence: 0,
        selectedScore: null,
        reasonCodes: [
          "blocked_authoritative_score_resolution_required",
          "direct_score_claims_disagree"
        ],
        alternatives: [
          {
            score: "1|1",
            providers: ["espn", "results_memory_recovery"],
            claimIds: ["direct", "recovered"]
          },
          {
            score: "2|1",
            providers: ["flashscore"],
            claimIds: ["fs"]
          }
        ]
      },
      lineage: { blockIds: ["block-1"] }
    })]),
    includeFacts: true
  });
  const alternative = result.facts[0].proposal.alternatives.find(x => x.score === "1|1");
  assert.equal(alternative.independentFamilyCount, 1);
  assert.deepEqual(alternative.independentFamilies, ["espn"]);
});

test("stronger score alternative becomes review candidate, never automatic truth", () => {
  const result = reasonAboutHistoryEvidence({
    evidenceFoundation: foundation([fact({
      claims: [
        claim({ claimId: "espn" }),
        claim({
          claimId: "fs",
          provider: "flashscore",
          sourceId: "fs_1",
          fieldClaims: { score: "2|1", finalStatus: true },
          providerDiagnostics: {
            initialPrior: 0.5,
            learnedAgreementRate: null,
            learnedSampleSize: 0
          }
        })
      ],
      resolution: {
        evidenceStatus: "conflicted",
        confidence: 0,
        selectedScore: null,
        reasonCodes: ["direct_score_claims_disagree"],
        alternatives: [
          { score: "1|1", providers: ["espn"], claimIds: ["espn"] },
          { score: "2|1", providers: ["flashscore"], claimIds: ["fs"] }
        ]
      },
      lineage: { blockIds: ["block-1"] }
    })])
  });
  assert.equal(result.proposals[0].proposal.proposalStatus, "review_candidate");
  assert.equal(result.proposals[0].proposal.candidate.score, "1|1");
  assert.equal(result.proposals[0].proposal.automaticApplyAllowed, false);
  assert.equal(result.guarantees.conflictedFactsAutoResolved, 0);
});

test("orientation conflict remains insufficient evidence", () => {
  const result = reasonAboutHistoryEvidence({
    evidenceFoundation: foundation([fact({
      resolution: {
        evidenceStatus: "conflicted",
        confidence: 0,
        selectedScore: null,
        reasonCodes: ["blocked_fixture_orientation_resolution_required"],
        alternatives: []
      },
      lineage: { blockIds: ["orientation-1"] }
    })])
  });
  assert.equal(result.proposals[0].proposal.proposalStatus, "insufficient_evidence");
  assert.equal(result.proposals[0].proposal.candidate, null);
});

test("full reasoning is read-only and preserves all facts and claims", () => {
  const input = foundation([fact()]);
  const before = JSON.stringify(input);
  const result = reasonAboutHistoryEvidence({ evidenceFoundation: input });
  assert.equal(result.summary.factsAnalyzed, 1);
  assert.equal(result.summary.claimsScored, 1);
  assert.equal(result.guarantees.truthWrites, 0);
  assert.equal(JSON.stringify(input), before);
});
