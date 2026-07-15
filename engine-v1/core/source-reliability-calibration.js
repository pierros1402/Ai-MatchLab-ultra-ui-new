export const SOURCE_RELIABILITY_CALIBRATION_SCHEMA =
  "ai-matchlab.source-reliability-calibration.v1";

export const SOURCE_RELIABILITY_CALIBRATION_POLICY_VERSION =
  "source-reliability-calibration-policy-v1";

const DEFAULT_PRIOR_RATE = 0.82;
const DEFAULT_PRIOR_STRENGTH = 10;
const DEFAULT_MIN_OPERATIONAL_SAMPLES = 30;

function text(value) {
  return value == null ? "" : String(value).trim();
}

function round3(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function claimScoreMapForScoreFact(fact) {
  const map = new Map();
  for (const alternative of fact?.proposal?.alternatives || []) {
    for (const claimId of alternative.claimIds || []) {
      map.set(claimId, alternative.score);
    }
  }
  return map;
}

function providerFamily(claimScore = {}) {
  return text(claimScore?.independence?.independenceFamily) ||
    text(claimScore?.provider) || "unknown";
}

function sourceOrigin(claimScore = {}) {
  return text(claimScore?.independence?.sourceKind) || "unknown";
}

function observation({ resolution, claimScore, outcome, factType, factId }) {
  return {
    observationId: [
      resolution.resolutionId,
      factId,
      claimScore.claimId,
      factType
    ].join("|"),
    resolutionId: resolution.resolutionId,
    blockIds: resolution.blockIds,
    factId,
    factType,
    provider: text(claimScore.provider) || "unknown",
    providerFamily: providerFamily(claimScore),
    sourceOrigin: sourceOrigin(claimScore),
    claimId: claimScore.claimId,
    sourceId: claimScore.sourceId,
    outcome,
    adjudicated: true,
    reasonCode: outcome === "agreement"
      ? "claim_matches_authoritatively_supported_candidate"
      : "claim_conflicts_with_authoritatively_supported_candidate"
  };
}

function buildAdjudicatedObservations(resolutionReport) {
  const out = [];
  for (const resolution of resolutionReport?.resolutions || []) {
    if (resolution.proposalStatus !== "authoritatively_supported") continue;
    if (resolution.resolutionType === "score") {
      const fact = (resolution.targetFacts || [])[0];
      const claimToScore = claimScoreMapForScoreFact(fact);
      const candidateScore = `${resolution.candidate.homeGoals}|${resolution.candidate.awayGoals}`;
      for (const claimScore of fact?.claimScores || []) {
        const observedScore = claimToScore.get(claimScore.claimId);
        out.push(observation({
          resolution,
          claimScore,
          factId: fact.factId,
          factType: "match_score",
          outcome: observedScore === candidateScore ? "agreement" : "disagreement"
        }));
      }
    } else if (resolution.resolutionType === "orientation") {
      const retainedFactId = resolution.candidate?.retainedFactId;
      const suppressed = new Set(resolution.candidate?.suppressedFactIds || []);
      for (const fact of resolution.targetFacts || []) {
        const outcome = fact.factId === retainedFactId
          ? "agreement"
          : suppressed.has(fact.factId)
            ? "disagreement"
            : "unclassified";
        if (outcome === "unclassified") continue;
        for (const claimScore of fact.claimScores || []) {
          out.push(observation({
            resolution,
            claimScore,
            factId: fact.factId,
            factType: "fixture_orientation",
            outcome
          }));
        }
      }
    }
  }
  return out;
}

function buildPeerAgreementObservations(reasoning) {
  const out = [];
  for (const fact of reasoning?.facts || []) {
    if (fact.reasoningState !== "stable_verified") continue;
    for (const claimScore of fact.claimScores || []) {
      if (!claimScore?.independence?.independenceEligible) continue;
      out.push({
        factId: fact.factId,
        claimId: claimScore.claimId,
        providerFamily: providerFamily(claimScore),
        sourceOrigin: sourceOrigin(claimScore),
        observationType: "peer_agreement_only",
        operationalAccuracyEvidence: false
      });
    }
  }
  return out;
}

function aggregateAdjudicated(observations, options = {}) {
  const priorRate = Number.isFinite(Number(options.priorRate))
    ? Number(options.priorRate)
    : DEFAULT_PRIOR_RATE;
  const priorStrength = Number.isFinite(Number(options.priorStrength))
    ? Number(options.priorStrength)
    : DEFAULT_PRIOR_STRENGTH;
  const minSamples = Number.isFinite(Number(options.minimumOperationalSamples))
    ? Number(options.minimumOperationalSamples)
    : DEFAULT_MIN_OPERATIONAL_SAMPLES;

  const groups = new Map();
  for (const row of observations) {
    const key = `${row.providerFamily}|${row.factType}`;
    if (!groups.has(key)) {
      groups.set(key, {
        providerFamily: row.providerFamily,
        factType: row.factType,
        total: 0,
        agreements: 0,
        disagreements: 0,
        sourceOrigins: new Set(),
        resolutionIds: new Set()
      });
    }
    const group = groups.get(key);
    group.total += 1;
    if (row.outcome === "agreement") group.agreements += 1;
    if (row.outcome === "disagreement") group.disagreements += 1;
    group.sourceOrigins.add(row.sourceOrigin);
    group.resolutionIds.add(row.resolutionId);
  }

  return [...groups.values()]
    .map(group => {
      const posterior = (
        priorRate * priorStrength + group.agreements
      ) / (priorStrength + group.total);
      const operationalEligible = group.total >= minSamples;
      return {
        providerFamily: group.providerFamily,
        factType: group.factType,
        total: group.total,
        agreements: group.agreements,
        disagreements: group.disagreements,
        rawAgreementRate: group.total ? round3(group.agreements / group.total) : 0,
        posteriorMean: round3(posterior),
        priorRate,
        priorStrength,
        minimumOperationalSamples: minSamples,
        operationalEligible,
        proposedOperationalValue: operationalEligible ? round3(posterior) : null,
        sourceOrigins: [...group.sourceOrigins].sort(),
        resolutionIds: [...group.resolutionIds].sort(),
        reasonCodes: operationalEligible
          ? ["minimum_adjudicated_sample_threshold_met"]
          : [
              "adjudicated_sample_below_operational_threshold",
              "calibration_is_observation_only"
            ]
      };
    })
    .sort((a, b) =>
      a.providerFamily.localeCompare(b.providerFamily) ||
      a.factType.localeCompare(b.factType)
    );
}

function legacyReliabilityDiagnostics(legacyReliability = {}) {
  const rows = Object.entries(legacyReliability || {}).map(([provider, value]) => ({
    provider,
    total: Number(value?.total || 0),
    agreements: Number(value?.agreements || 0),
    disagreements: Number(value?.disagreements || 0),
    classification: "legacy_unadjudicated_agreement_counts",
    operationallyTrusted: false,
    reasonCode: "legacy_counts_lack_authoritative_adjudication_contract"
  }));
  return {
    providers: rows.length,
    observations: rows.reduce((sum, row) => sum + row.total, 0),
    rows
  };
}

export function buildSourceReliabilityCalibration({
  reasoning,
  resolutionReport,
  legacyReliability = {},
  minimumOperationalSamples = DEFAULT_MIN_OPERATIONAL_SAMPLES
} = {}) {
  if (!reasoning?.ok || !Array.isArray(reasoning?.facts)) {
    throw new Error("full_reasoning_required_for_calibration");
  }
  if (!resolutionReport?.ok) {
    throw new Error("authoritative_resolution_report_required");
  }

  const adjudicatedObservations = buildAdjudicatedObservations(resolutionReport);
  const peerAgreementObservations = buildPeerAgreementObservations(reasoning);
  const calibrationRows = aggregateAdjudicated(adjudicatedObservations, {
    minimumOperationalSamples
  });
  const legacy = legacyReliabilityDiagnostics(legacyReliability);

  return {
    ok: true,
    status: calibrationRows.some(row => row.operationalEligible)
      ? "operational_candidates_available"
      : "observation_only",
    schema: SOURCE_RELIABILITY_CALIBRATION_SCHEMA,
    policyVersion: SOURCE_RELIABILITY_CALIBRATION_POLICY_VERSION,
    generatedAt: new Date().toISOString(),
    summary: {
      adjudicatedObservations: adjudicatedObservations.length,
      adjudicatedAgreements: adjudicatedObservations.filter(
        row => row.outcome === "agreement"
      ).length,
      adjudicatedDisagreements: adjudicatedObservations.filter(
        row => row.outcome === "disagreement"
      ).length,
      peerAgreementObservations: peerAgreementObservations.length,
      calibrationRows: calibrationRows.length,
      operationallyEligibleUpdates: calibrationRows.filter(
        row => row.operationalEligible
      ).length,
      legacyReliabilityProviders: legacy.providers,
      legacyReliabilityObservations: legacy.observations
    },
    adjudicatedObservations,
    peerAgreementDiagnostics: {
      count: peerAgreementObservations.length,
      operationalAccuracyEvidence: false,
      byProviderFamily: Object.fromEntries(
        [...new Set(peerAgreementObservations.map(row => row.providerFamily))]
          .sort()
          .map(provider => [
            provider,
            peerAgreementObservations.filter(
              row => row.providerFamily === provider
            ).length
          ])
      )
    },
    calibrationRows,
    legacyReliability: legacy,
    guarantees: {
      sourceReliabilityWrites: 0,
      legacyReliabilityOperationallyTrusted: 0,
      peerAgreementUsedAsAdjudicatedAccuracy: 0
    }
  };
}
