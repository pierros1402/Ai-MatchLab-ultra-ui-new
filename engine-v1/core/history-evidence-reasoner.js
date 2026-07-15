import {
  canonicalProvider,
  EVIDENCE_STATUSES
} from "./history-evidence-foundation.js";

export const HISTORY_EVIDENCE_REASONING_SCHEMA =
  "ai-matchlab.history-evidence-reasoning.v1";

export const HISTORY_EVIDENCE_REASONING_POLICY_VERSION =
  "history-evidence-reasoning-policy-v1";

const DIRECT_PROVIDERS = new Set([
  "espn",
  "flashscore",
  "sofascore",
  "api_football"
]);

const DERIVED_PROVIDERS = new Set([
  "results_memory_recovery",
  "snapshot_recovery",
  "reconciled",
  "canonical_native",
  "history_unknown",
  "unknown"
]);

function stableString(value) {
  if (value == null) return "";
  return String(value).trim();
}

function safeNum(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round3(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function sortedCounts(values) {
  const counts = {};
  for (const value of values || []) {
    const key = stableString(value) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]))
  );
}

function addUnique(target, values) {
  for (const value of values || []) {
    if (value != null && !target.includes(value)) target.push(value);
  }
}

function inferUpstreamProvider(sourceId) {
  const id = stableString(sourceId).toLowerCase();
  if (!id) return null;
  if (/^espn[_-]/.test(id)) return "espn";
  if (/^sofa[_-]/.test(id)) return "sofascore";
  if (/^flashscore[_-]/.test(id) || /^fs[_-]/.test(id)) return "flashscore";
  if (/^api[_-]?football[_-]/.test(id)) return "api_football";
  return null;
}

export function classifyClaimIndependence(claim = {}) {
  const provider = canonicalProvider(claim?.provider);
  const role = stableString(claim?.role) || "unknown";
  const sourceId = stableString(claim?.sourceId) || null;
  const reasonCodes = [];

  if (DIRECT_PROVIDERS.has(provider)) {
    return {
      provider,
      sourceKind: "direct_provider",
      independenceFamily: provider,
      independenceEligible: true,
      derivationDepth: 0,
      reasonCodes: ["direct_provider_family"]
    };
  }

  if (provider === "results_memory_recovery") {
    const upstream = inferUpstreamProvider(sourceId);
    if (upstream) {
      return {
        provider,
        sourceKind: "derived_recovery_with_upstream_identity",
        independenceFamily: upstream,
        independenceEligible: true,
        derivationDepth: 1,
        reasonCodes: [
          "derived_results_memory_transport",
          "upstream_provider_inferred_from_source_id"
        ]
      };
    }

    return {
      provider,
      sourceKind: "derived_recovery_unknown_upstream",
      independenceFamily: `derived:${provider}`,
      independenceEligible: false,
      derivationDepth: 1,
      reasonCodes: [
        "derived_results_memory_transport",
        "upstream_provider_not_proven"
      ]
    };
  }

  if (provider === "snapshot_recovery") {
    return {
      provider,
      sourceKind: "derived_snapshot_recovery",
      independenceFamily: `derived:${provider}`,
      independenceEligible: false,
      derivationDepth: 1,
      reasonCodes: [
        "snapshot_is_not_independent_truth",
        "upstream_provider_not_proven"
      ]
    };
  }

  if (provider === "reconciled") {
    return {
      provider,
      sourceKind: "derived_reconciled_record",
      independenceFamily: `derived:${provider}`,
      independenceEligible: false,
      derivationDepth: 1,
      reasonCodes: [
        "reconciled_record_is_composite",
        "upstream_provider_not_proven"
      ]
    };
  }

  if (role === "corroborating_removed_duplicate" && provider !== "unknown") {
    reasonCodes.push("removed_duplicate_claim_preserved");
  }

  return {
    provider,
    sourceKind: DERIVED_PROVIDERS.has(provider)
      ? "derived_or_unresolved_source"
      : "unclassified_provider",
    independenceFamily: `derived:${provider || "unknown"}`,
    independenceEligible: false,
    derivationDepth: DERIVED_PROVIDERS.has(provider) ? 1 : 0,
    reasonCodes: [
      ...reasonCodes,
      DERIVED_PROVIDERS.has(provider)
        ? "derived_source_not_independent"
        : "provider_independence_not_registered"
    ]
  };
}

function evidenceClassFactor(claim) {
  const evidenceClass = stableString(claim?.evidenceClass);
  if (evidenceClass === "direct_structured_final") return 1;
  if (evidenceClass === "direct_structured_result") return 0.91;
  return 0.72;
}

function roleFactor(claim) {
  const role = stableString(claim?.role);
  if (role === "current_history_claim") return 1;
  if (role === "corroborating_removed_duplicate") return 0.95;
  return 0.82;
}

function derivationFactor(independence) {
  if (independence?.sourceKind === "direct_provider") return 1;
  if (
    independence?.sourceKind ===
    "derived_recovery_with_upstream_identity"
  ) return 0.9;
  if (independence?.sourceKind === "derived_reconciled_record") return 0.77;
  if (independence?.sourceKind === "derived_snapshot_recovery") return 0.72;
  return 0.68;
}

function temporalAssessment(claim) {
  const finalStatus = Boolean(claim?.fieldClaims?.finalStatus);
  const kickoff = claim?.observed?.kickoff || null;
  const kickoffMs = kickoff ? Date.parse(kickoff) : NaN;

  if (finalStatus) {
    return {
      temporalClass: "immutable_final_fact",
      freshnessFactor: 1,
      ageDecayApplied: false,
      kickoffKnown: Number.isFinite(kickoffMs),
      reasonCode: "final_result_does_not_decay_with_age"
    };
  }

  if (!Number.isFinite(kickoffMs)) {
    return {
      temporalClass: "time_unknown",
      freshnessFactor: 0.78,
      ageDecayApplied: false,
      kickoffKnown: false,
      reasonCode: "missing_temporal_anchor"
    };
  }

  return {
    temporalClass: "mutable_non_final_claim",
    freshnessFactor: 0.82,
    ageDecayApplied: false,
    kickoffKnown: true,
    reasonCode: "non_final_claim_requires_freshness_evidence"
  };
}

function learnedReliabilityComponent(claim) {
  const diagnostics = claim?.providerDiagnostics || {};
  const sampleSize = safeNum(diagnostics?.learnedSampleSize, 0);
  const learnedRate = safeNum(diagnostics?.learnedAgreementRate, null);
  const prior = safeNum(diagnostics?.initialPrior, 0.5);

  if (learnedRate == null || sampleSize < 25) {
    return {
      value: prior,
      applied: false,
      sampleSize,
      learnedRate,
      reasonCode: "learned_reliability_sample_insufficient"
    };
  }

  const weight = Math.min(0.8, sampleSize / (sampleSize + 100));
  const value = prior * (1 - weight) + learnedRate * weight;
  return {
    value: clamp01(value),
    applied: true,
    sampleSize,
    learnedRate,
    reasonCode: "learned_reliability_shrunk_toward_provider_prior"
  };
}

export function scoreHistoryEvidenceClaim(claim = {}) {
  const independence = classifyClaimIndependence(claim);
  const temporal = temporalAssessment(claim);
  const learned = learnedReliabilityComponent(claim);
  const providerPrior = safeNum(claim?.providerDiagnostics?.initialPrior, 0.5);
  const completeness = claim?.fieldClaims?.score != null ? 1 : 0.35;

  const components = {
    evidenceClass: evidenceClassFactor(claim),
    providerPrior: clamp01(providerPrior),
    learnedReliability: clamp01(learned.value),
    role: roleFactor(claim),
    derivation: derivationFactor(independence),
    temporalFreshness: temporal.freshnessFactor,
    fieldCompleteness: completeness
  };

  const score = clamp01(
    components.evidenceClass * 0.2 +
      components.providerPrior * 0.15 +
      components.learnedReliability * 0.15 +
      components.role * 0.12 +
      components.derivation * 0.18 +
      components.temporalFreshness * 0.1 +
      components.fieldCompleteness * 0.1
  );

  const reasonCodes = [];
  addUnique(reasonCodes, independence.reasonCodes);
  addUnique(reasonCodes, [temporal.reasonCode, learned.reasonCode]);
  if (claim?.role === "corroborating_removed_duplicate") {
    addUnique(reasonCodes, ["removed_duplicate_claim_preserved_as_evidence"]);
  }
  if (claim?.fieldClaims?.score == null) {
    addUnique(reasonCodes, ["missing_complete_score_claim"]);
  }

  return {
    claimId: claim?.claimId || null,
    factId: claim?.factId || null,
    provider: canonicalProvider(claim?.provider),
    sourceId: claim?.sourceId || null,
    role: claim?.role || null,
    evidenceClass: claim?.evidenceClass || null,
    score: round3(score),
    components: Object.fromEntries(
      Object.entries(components).map(([key, value]) => [key, round3(value)])
    ),
    independence,
    temporal,
    learnedReliability: {
      applied: learned.applied,
      sampleSize: learned.sampleSize,
      learnedRate: learned.learnedRate,
      effectiveValue: round3(learned.value),
      reasonCode: learned.reasonCode
    },
    reasonCodes: reasonCodes.sort()
  };
}

function alternativeScore(alternative, claimScoreMap) {
  const claims = (alternative?.claimIds || [])
    .map(id => claimScoreMap.get(id))
    .filter(Boolean);
  const familyBest = new Map();
  const ineligible = [];

  for (const scored of claims) {
    if (!scored.independence.independenceEligible) {
      ineligible.push(scored);
      continue;
    }
    const family = scored.independence.independenceFamily;
    const existing = familyBest.get(family);
    if (!existing || scored.score > existing.score) familyBest.set(family, scored);
  }

  const independentClaims = [...familyBest.values()];
  const independentCount = independentClaims.length;
  const independentMean = independentCount
    ? independentClaims.reduce((sum, x) => sum + x.score, 0) / independentCount
    : 0;
  const diversityBonus = Math.min(0.06, Math.max(0, independentCount - 1) * 0.03);
  const ineligibleSupport = ineligible.length
    ? Math.max(...ineligible.map(x => x.score)) * 0.15
    : 0;
  const supportScore = clamp01(independentMean + diversityBonus + ineligibleSupport);

  return {
    score: alternative?.score || null,
    claimIds: (alternative?.claimIds || []).slice().sort(),
    providers: (alternative?.providers || []).slice().sort(),
    supportScore: round3(supportScore),
    independentFamilyCount: independentCount,
    independentFamilies: [...familyBest.keys()].sort(),
    dependentOrUnprovenClaimCount: ineligible.length,
    bestClaimScores: independentClaims
      .map(x => ({
        claimId: x.claimId,
        family: x.independence.independenceFamily,
        score: x.score
      }))
      .sort((a, b) => a.family.localeCompare(b.family)),
    reasonCodes: [
      independentCount
        ? "alternative_scored_by_best_claim_per_independent_family"
        : "alternative_has_no_proven_independent_source",
      ineligible.length
        ? "dependent_or_unproven_claims_do_not_count_as_independent_votes"
        : "all_scored_claims_have_proven_independence"
    ]
  };
}

function proposalForConflict(fact, scoredClaims) {
  const blockIds = Array.isArray(fact?.lineage?.blockIds)
    ? fact.lineage.blockIds
    : [];
  const reasonCodes = fact?.resolution?.reasonCodes || [];
  const isOrientation = reasonCodes.includes(
    "blocked_fixture_orientation_resolution_required"
  );

  if (isOrientation) {
    return {
      proposalStatus: "insufficient_evidence",
      proposalType: "fixture_orientation_review",
      candidate: null,
      confidence: 0,
      automaticApplyAllowed: false,
      blockIds: blockIds.slice().sort(),
      requiredEvidence: [
        "authoritative_fixture_identity",
        "home_away_orientation_confirmation",
        "canonical_team_key_resolution"
      ],
      reasonCodes: [
        "orientation_cannot_be_decided_from_equal_score_claims",
        "manual_or_authoritative_fixture_identity_required"
      ]
    };
  }

  const claimScoreMap = new Map(scoredClaims.map(x => [x.claimId, x]));
  const alternatives = (fact?.resolution?.alternatives || [])
    .map(x => alternativeScore(x, claimScoreMap))
    .sort((a, b) => {
      if (b.supportScore !== a.supportScore) return b.supportScore - a.supportScore;
      return stableString(a.score).localeCompare(stableString(b.score));
    });

  const top = alternatives[0] || null;
  const runnerUp = alternatives[1] || null;
  const margin = top && runnerUp
    ? round3(top.supportScore - runnerUp.supportScore)
    : top
      ? top.supportScore
      : 0;
  const reviewCandidate = Boolean(
    top &&
      top.independentFamilyCount >= 1 &&
      top.supportScore >= 0.75 &&
      margin >= 0.06
  );

  return {
    proposalStatus: reviewCandidate
      ? "review_candidate"
      : "insufficient_evidence",
    proposalType: "score_resolution_review",
    candidate: reviewCandidate
      ? {
          score: top.score,
          supportScore: top.supportScore,
          independentFamilies: top.independentFamilies,
          claimIds: top.claimIds
        }
      : null,
    confidence: reviewCandidate
      ? round3(Math.min(0.89, top.supportScore * 0.78 + margin * 0.5))
      : 0,
    margin,
    alternatives,
    automaticApplyAllowed: false,
    blockIds: blockIds.slice().sort(),
    requiredEvidence: [
      "authoritative_final_score_confirmation",
      "resolution_manifest_with_source_citation"
    ],
    reasonCodes: [
      reviewCandidate
        ? "one_alternative_has_materially_stronger_internal_evidence"
        : "internal_evidence_margin_is_not_sufficient",
      "proposal_is_review_only_not_truth_selection",
      "authoritative_resolution_still_required"
    ]
  };
}

function reasoningState(fact, proposal) {
  const status = fact?.resolution?.evidenceStatus;
  if (status === "conflicted") return proposal?.proposalStatus || "conflicted";
  if (status === "verified") return "stable_verified";
  if (status === "supported") return "stable_supported";
  if (status === "inferred") return "stable_inferred";
  if (status === "missing") return "missing";
  if (status === "stale") return "stale";
  return "unknown";
}

export function reasonAboutHistoryEvidence({
  evidenceFoundation,
  generatedAt = new Date().toISOString(),
  includeFacts = true,
  maxExamples = 20
} = {}) {
  if (!evidenceFoundation || evidenceFoundation.schema !==
    "ai-matchlab.history-evidence-foundation.v1") {
    throw new Error("invalid_or_missing_evidence_foundation");
  }
  if (!Array.isArray(evidenceFoundation.facts)) {
    throw new Error("full_evidence_facts_required_for_reasoning");
  }

  const reasonedFacts = [];
  const allScoredClaims = [];

  for (const fact of evidenceFoundation.facts) {
    const scoredClaims = (fact.claims || []).map(scoreHistoryEvidenceClaim);
    allScoredClaims.push(...scoredClaims);
    const proposal = fact?.resolution?.evidenceStatus === "conflicted"
      ? proposalForConflict(fact, scoredClaims)
      : null;

    reasonedFacts.push({
      factId: fact.factId,
      factKey: fact.factKey,
      identity: fact.identity,
      evidenceStatus: fact?.resolution?.evidenceStatus || "missing",
      selectedScore: fact?.resolution?.selectedScore || null,
      confidenceBeforeReasoning: safeNum(fact?.resolution?.confidence, 0),
      reasoningState: reasoningState(fact, proposal),
      claimScores: scoredClaims,
      proposal,
      lineage: fact.lineage
    });
  }

  reasonedFacts.sort((a, b) => a.factKey.localeCompare(b.factKey));
  const conflicted = reasonedFacts.filter(x => x.evidenceStatus === "conflicted");
  const reviewCandidates = conflicted.filter(
    x => x.proposal?.proposalStatus === "review_candidate"
  );
  const insufficient = conflicted.filter(
    x => x.proposal?.proposalStatus === "insufficient_evidence"
  );
  const directClaims = allScoredClaims.filter(
    x => x.independence.sourceKind === "direct_provider"
  );
  const derivedClaims = allScoredClaims.filter(
    x => x.independence.sourceKind !== "direct_provider"
  );
  const eligibleClaims = allScoredClaims.filter(
    x => x.independence.independenceEligible
  );
  const ineligibleClaims = allScoredClaims.filter(
    x => !x.independence.independenceEligible
  );

  const providerDiagnostics = {};
  for (const claim of allScoredClaims) {
    const provider = claim.provider || "unknown";
    if (!providerDiagnostics[provider]) {
      providerDiagnostics[provider] = {
        claims: 0,
        totalScore: 0,
        independenceEligibleClaims: 0,
        learnedReliabilityAppliedClaims: 0
      };
    }
    const row = providerDiagnostics[provider];
    row.claims += 1;
    row.totalScore += claim.score;
    if (claim.independence.independenceEligible) {
      row.independenceEligibleClaims += 1;
    }
    if (claim.learnedReliability.applied) {
      row.learnedReliabilityAppliedClaims += 1;
    }
  }
  for (const row of Object.values(providerDiagnostics)) {
    row.averageClaimScore = round3(row.totalScore / Math.max(1, row.claims));
    delete row.totalScore;
  }

  const report = {
    ok: true,
    status: conflicted.length ? "partial" : "available",
    schema: HISTORY_EVIDENCE_REASONING_SCHEMA,
    policyVersion: HISTORY_EVIDENCE_REASONING_POLICY_VERSION,
    generatedAt,
    sourceContract: {
      evidenceFoundationReadOnly: true,
      sourceClaimsReadOnly: true,
      proposalsAreReviewOnly: true,
      automaticTruthSelection: false,
      automaticTruthWrites: 0,
      truthFilesChanged: 0
    },
    reasoningContract: {
      evidenceStatuses: EVIDENCE_STATUSES,
      claimScoring:
        "weighted_explainable_components_with_no_single_provider_hard_override",
      sourceIndependence:
        "best_claim_per_proven_upstream_family_counts_once",
      derivedSourcePolicy:
        "recovery_reconciled_and_snapshot_rows_are_not_independent_without_proven_upstream",
      temporalPolicy:
        "immutable_final_results_do_not_decay_with_age",
      conflictPolicy:
        "rank_review_candidates_but_never_auto_resolve_or_write_truth"
    },
    summary: {
      factsAnalyzed: reasonedFacts.length,
      claimsScored: allScoredClaims.length,
      conflictedFacts: conflicted.length,
      reviewCandidateProposals: reviewCandidates.length,
      insufficientEvidenceProposals: insufficient.length,
      directProviderClaims: directClaims.length,
      derivedOrCompositeClaims: derivedClaims.length,
      independenceEligibleClaims: eligibleClaims.length,
      independenceIneligibleClaims: ineligibleClaims.length,
      learnedReliabilityAppliedClaims: allScoredClaims.filter(
        x => x.learnedReliability.applied
      ).length,
      byEvidenceStatus: sortedCounts(
        reasonedFacts.map(x => x.evidenceStatus)
      ),
      byReasoningState: sortedCounts(
        reasonedFacts.map(x => x.reasoningState)
      ),
      bySourceKind: sortedCounts(
        allScoredClaims.map(x => x.independence.sourceKind)
      )
    },
    providerDiagnostics: Object.fromEntries(
      Object.entries(providerDiagnostics).sort((a, b) =>
        a[0].localeCompare(b[0])
      )
    ),
    proposals: conflicted.map(x => ({
      factId: x.factId,
      factKey: x.factKey,
      evidenceStatus: x.evidenceStatus,
      proposal: x.proposal
    })),
    diagnostics: {
      reviewCandidateExamples: reviewCandidates.slice(0, maxExamples).map(x => ({
        factId: x.factId,
        factKey: x.factKey,
        proposal: x.proposal
      })),
      insufficientEvidenceExamples: insufficient
        .slice(0, maxExamples)
        .map(x => ({
          factId: x.factId,
          factKey: x.factKey,
          proposal: x.proposal
        })),
      derivedSourceExamples: derivedClaims.slice(0, maxExamples).map(x => ({
        claimId: x.claimId,
        factId: x.factId,
        provider: x.provider,
        sourceId: x.sourceId,
        score: x.score,
        independence: x.independence
      }))
    },
    guarantees: {
      truthWrites: 0,
      truthFilesChanged: 0,
      conflictedFactsAutoResolved: 0,
      proposalsAutomaticallyApplied: 0
    }
  };

  if (includeFacts) report.facts = reasonedFacts;
  return report;
}
