export function inferMatchContext(match, support) {
  const signals = [];
  const warnings = [];

  let confidence = 0.5;

  if (support.hasValue) {
    signals.push("value_support_present");
    confidence += 0.1;
  }

  if (support.hasPriors) {
    signals.push("historical_context_available");
    confidence += 0.1;
  }

  if (support.research?.competitionContext) {
    signals.push("competition_context_verified");
    confidence += 0.1;
  }

  const summary = {
    el: `${match.homeTeam} - ${match.awayTeam}: ανάλυση με βάση ιστορικά και διαθέσιμα δεδομένα.`,
    en: `${match.homeTeam} vs ${match.awayTeam}: contextual analysis using historical and available data.`
  };

  return {
    status: "ready",
    summary,
    confidence: Math.min(confidence, 0.9),
    signals,
    warnings,
    reasoning: {
      tempoProfile: { label: "unknown", explanation: "" },
      riskProfile: { label: "unknown", explanation: "" },
      motivationProfile: { label: "unknown", explanation: "" },
      tacticalInteraction: { label: "unknown", explanation: "" },
      gameStateExpectation: { label: "unknown", explanation: "" }
    },
    support: {
      priorsUsed: support.hasPriors,
      valueUsed: support.hasValue,
      researchUsed: !!support.research,
      historyUsed: false
    }
  };
}