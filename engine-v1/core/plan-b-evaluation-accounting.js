import { describeProbabilityAdjustment } from "./opponent-strength-adjusted-form.js";

const supportedSelections = { "1X2": ["home", "draw", "away"], OU25: ["over", "under"], BTTS: ["yes", "no"] };

export function describeOpponentAdjustment(profiles) {
  const deltas = describeProbabilityAdjustment(profiles.home, profiles.away);
  const unavailable = profiles.standingsCoverage === 0 || !profiles.home?.sample || !profiles.away?.sample || deltas.reliability === 0;
  return {
    standingsCoverage: profiles.standingsCoverage,
    homeSample: profiles.home?.sample || 0, awaySample: profiles.away?.sample || 0, deltas,
    reasonCodes: [...new Set([...(profiles.home?.reasonCodes || []), ...(profiles.away?.reasonCodes || []),
      ...(profiles.standingsCoverage === 0 ? ["trusted_opponent_standings_unavailable"] : [])])],
    status: unavailable ? "unavailable" :
      Object.values(deltas).some(value => value && typeof value === "object" && Object.values(value).some(n => n !== 0)) ? "adjusted" : "neutral"
  };
}

export function describePlanBMarketEligibility(match) {
  const model = match?.aiAssessment?.model || {};
  const samples = [Number(model.homeFormSample || 0), Number(model.awayFormSample || 0)];
  return Object.entries(supportedSelections).flatMap(([market, selections]) => selections.map(pick => {
    const probs = match?.aiAssessment?.markets?.[market]?.probs;
    const probability = Number(probs?.[pick] || 0);
    const minimumProbability = 0.65 + (market !== "BTTS" && match?.aiAssessment?.crossLeague ? 0.05 : 0);
    const reasons = [];
    if (!probs) reasons.push("missing_market_probabilities");
    if (!Number.isFinite(probability) || probability < minimumProbability) reasons.push("below_model_probability_threshold");
    if (!model.formUsed || Math.min(...samples) < 3) reasons.push("insufficient_form_evidence");
    return { market, pick, probability, minimumProbability, formUsed: Boolean(model.formUsed), formSamples: samples, reasonCodes: reasons };
  }));
}

export function completePlanBEvaluationAccounting(sourceMatches, fixtureDiagnostics, candidateLedger) {
  const fixtureLedger = sourceMatches.map(match => {
    const canonicalId = String(match?.canonicalId || match?.matchId || "");
    const diagnostic = fixtureDiagnostics.get(canonicalId) || {};
    const candidates = candidateLedger.filter(row => row.canonicalId === canonicalId || row.matchId === canonicalId);
    const approved = candidates.filter(row => row.status === "approved").length;
    const outcome = diagnostic.reasonCode || (approved > 0 ? "picks_approved" : candidates.length > 0 ? "candidates_rejected_by_policy" : "no_eligible_market");
    return { canonicalId, outcome, candidateMarkets: candidates.length, approved,
      rejected: candidates.length - approved, marketEligibility: diagnostic.marketEligibility || [],
      opponentAdjustment: diagnostic.opponentAdjustment || null };
  });
  const counts = {};
  for (const row of fixtureLedger) counts[row.outcome] = (counts[row.outcome] || 0) + 1;
  const inputGapFixtures = fixtureLedger.filter(row => ["missing_model_assessment", "ambiguous_model_assessment", "missing_canonical_identity"].includes(row.outcome)).length;
  const ids = fixtureLedger.map(row => row.canonicalId);
  const accountedCandidates = fixtureLedger.reduce((sum, row) => sum + row.candidateMarkets, 0);
  const complete = ids.every(Boolean) && new Set(ids).size === ids.length && fixtureLedger.length === sourceMatches.length && accountedCandidates === candidateLedger.length;
  const approved = fixtureLedger.reduce((sum, row) => sum + row.approved, 0);
  return {
    fixtureLedger,
    evaluationAccounting: { schema: "ai-matchlab.plan-b-evaluation-accounting.v1", complete,
      fixturesSeen: sourceMatches.length, terminalOutcomeCount: fixtureLedger.length,
      inputGapFixtures, assessedFixtures: fixtureLedger.length - inputGapFixtures, byOutcome: counts,
      diagnosis: !complete ? "evaluation_accounting_failed" : inputGapFixtures > 0 ? "incomplete_assessment_coverage" : approved > 0 ? "picks_produced" : "zero_picks_after_evaluation" }
  };
}
