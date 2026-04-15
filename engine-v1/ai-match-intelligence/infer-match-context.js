function marketSignal(value) {
  const market = String(value?.market || value?.marketName || "").toLowerCase();
  const pick = String(value?.pick || "").toLowerCase();
  const score = Number(value?.score || 0);

  if (!market) return null;

  if (market.includes("over / under 2.5") && pick.includes("over")) {
    return {
      code: "value_over25_signal",
      label: "over25",
      strength: score
    };
  }

  if (market.includes("over / under 1.5") && pick.includes("over")) {
    return {
      code: "value_over15_signal",
      label: "over15",
      strength: score
    };
  }

  if (market.includes("over / under 3.5") && pick.includes("over")) {
    return {
      code: "value_over35_signal",
      label: "over35",
      strength: score
    };
  }

  if (market.includes("btts")) {
    return {
      code: "value_btts_signal",
      label: "btts",
      strength: score
    };
  }

  if (market.includes("1x2")) {
    return {
      code: "value_1x2_signal",
      label: "1x2",
      strength: score
    };
  }

  return {
    code: "value_market_signal",
    label: market,
    strength: score
  };
}

function buildValueNarrative(valueSummary) {
  if (!valueSummary?.count) return null;

  const score = Number(valueSummary.topScore || 0).toFixed(3);

  return {
    el: `Το ισχυρότερο value market είναι ${valueSummary.topMarket} → ${valueSummary.topPick} με score ${score}.`,
    en: `The strongest value market is ${valueSummary.topMarket} → ${valueSummary.topPick} with score ${score}.`
  };
}

function hasUsableFormGuide(formGuide) {
  const homeSample = Number(formGuide?.homeTeam?.sampleSize || 0);
  const awaySample = Number(formGuide?.awayTeam?.sampleSize || 0);
  return homeSample > 0 || awaySample > 0;
}

function hasUsableH2H(headToHeadGuide) {
  return Number(headToHeadGuide?.sampleSize || 0) > 0;
}

function buildFormNarrative(formGuide, match) {
  if (!hasUsableFormGuide(formGuide)) return null;

  const home = formGuide?.homeTeam || {};
  const away = formGuide?.awayTeam || {};

  const homeRecord = home?.record || {};
  const awayRecord = away?.record || {};

  const homeSample = Number(home?.sampleSize || 0);
  const awaySample = Number(away?.sampleSize || 0);

  const partsEl = [];
  const partsEn = [];

  if (homeSample > 0) {
    partsEl.push(
      `${match.homeTeam}: ${homeRecord.wins || 0}-${homeRecord.draws || 0}-${homeRecord.losses || 0} στα τελευταία ${homeSample}.`
    );
    partsEn.push(
      `${match.homeTeam}: ${homeRecord.wins || 0}-${homeRecord.draws || 0}-${homeRecord.losses || 0} across the last ${homeSample}.`
    );
  }

  if (awaySample > 0) {
    partsEl.push(
      `${match.awayTeam}: ${awayRecord.wins || 0}-${awayRecord.draws || 0}-${awayRecord.losses || 0} στα τελευταία ${awaySample}.`
    );
    partsEn.push(
      `${match.awayTeam}: ${awayRecord.wins || 0}-${awayRecord.draws || 0}-${awayRecord.losses || 0} across the last ${awaySample}.`
    );
  }

  const comparisonEdge = formGuide?.comparison?.edge || null;
  if (comparisonEdge === "home") {
    partsEl.push("Η πρόσφατη φόρμα δίνει ελαφρύ προβάδισμα στους γηπεδούχους.");
    partsEn.push("Recent form gives a slight edge to the home side.");
  } else if (comparisonEdge === "away") {
    partsEl.push("Η πρόσφατη φόρμα δίνει ελαφρύ προβάδισμα στους φιλοξενούμενους.");
    partsEn.push("Recent form gives a slight edge to the away side.");
  }

  return {
    el: partsEl.join(" "),
    en: partsEn.join(" ")
  };
}

function buildH2HNarrative(headToHeadGuide, match) {
  if (!hasUsableH2H(headToHeadGuide)) return null;

  const stats = headToHeadGuide?.stats || {};
  const trend = headToHeadGuide?.trend || {};
  const sampleSize = Number(headToHeadGuide?.sampleSize || 0);

  const partsEl = [
    `Στα τελευταία ${sampleSize} μεταξύ τους: ${match.homeTeam} ${stats.homeWins || 0} νίκες, ισοπαλίες ${stats.draws || 0}, ${match.awayTeam} ${stats.awayWins || 0} νίκες.`
  ];

  const partsEn = [
    `Across the last ${sampleSize} head-to-head meetings: ${match.homeTeam} ${stats.homeWins || 0} wins, draws ${stats.draws || 0}, ${match.awayTeam} ${stats.awayWins || 0} wins.`
  ];

  if (trend.edge === "home") {
    partsEl.push("Το H2H γέρνει προς τους γηπεδούχους.");
    partsEn.push("The head-to-head profile leans toward the home side.");
  } else if (trend.edge === "away") {
    partsEl.push("Το H2H γέρνει προς τους φιλοξενούμενους.");
    partsEn.push("The head-to-head profile leans toward the away side.");
  } else {
    partsEl.push("Το H2H είναι σχετικά ισορροπημένο.");
    partsEn.push("The head-to-head profile is relatively balanced.");
  }

  if (trend.goalPattern === "overlean") {
    partsEl.push("Το H2H δείχνει τάση για πιο ανοιχτά παιχνίδια.");
    partsEn.push("The head-to-head profile points toward more open games.");
  } else if (trend.goalPattern === "underlean") {
    partsEl.push("Το H2H δείχνει τάση για πιο κλειστά παιχνίδια.");
    partsEn.push("The head-to-head profile points toward tighter games.");
  }

  return {
    el: partsEl.join(" "),
    en: partsEn.join(" ")
  };
}

function buildRefereeNarrative(refereeContext) {
  const ref = refereeContext?.data || null;
  if (!ref?.name) return null;

  const style = ref?.style || "unknown";
  const cards = ref?.stats?.avgCards;
  const pens = ref?.stats?.avgPenalties;

  const partsEl = [`Διαιτητικό context: ${ref.name}.`];
  const partsEn = [`Referee context: ${ref.name}.`];

  if (style !== "unknown") {
    partsEl.push(`Στυλ: ${style}.`);
    partsEn.push(`Style: ${style}.`);
  }

  if (cards != null) {
    partsEl.push(`Μ.Ο. καρτών ${Number(cards).toFixed(2)}.`);
    partsEn.push(`Average cards ${Number(cards).toFixed(2)}.`);
  }

  if (pens != null) {
    partsEl.push(`Μ.Ο. πέναλτι ${Number(pens).toFixed(2)}.`);
    partsEn.push(`Average penalties ${Number(pens).toFixed(2)}.`);
  }

  return {
    el: partsEl.join(" "),
    en: partsEn.join(" ")
  };
}

function resolveActivePhase(match, competitionContext) {
  const phaseSummary =
    competitionContext?.phaseSummary ||
    competitionContext?.data?.phaseSummary ||
    null;

  if (!phaseSummary || !phaseSummary.hasPhaseTables) {
    return {
      phase: "regular",
      reason: "no_phase_data"
    };
  }

  const keys = phaseSummary.phaseKeys || [];

  if (keys.includes("playoff")) {
    return { phase: "playoff", reason: "phase_key_detected" };
  }

  if (keys.includes("playout")) {
    return { phase: "playout", reason: "phase_key_detected" };
  }

  if (keys.includes("knockout")) {
    return { phase: "knockout", reason: "cup_structure" };
  }

  return {
    phase: "regular",
    reason: "fallback_regular"
  };
}


export function inferMatchContext(match, support) {
  const signals = [];
  const warnings = [];

  let confidence = 0.5;

  const formGuide = support?.formGuide || null;
  const historyContext = support?.historyContext || null;
  const headToHeadGuide = support?.headToHeadGuide || null;
  const competitionContext = support?.competitionContext?.data || null;
  const phaseInfo = resolveActivePhase(match, competitionContext);
  const refereeContext = support?.refereeContext || null;
  const teamNewsContext = support?.teamNewsContext || null;
  const lineupContext = support?.lineupContext || null;

  const historyUsed = hasUsableFormGuide(formGuide);
  const h2hUsed = hasUsableH2H(headToHeadGuide);
  const refereeUsed = !!refereeContext?.data?.name;
  const historyRows = Number(historyContext?.meta?.mergedRows || 0);

  if (support.hasPriors) {
    signals.push("historical_context_available");
    confidence += 0.1;
  }

  if (historyUsed) {
    signals.push("history_form_available");
    confidence += 0.08;

    const homeSample = Number(formGuide?.homeTeam?.sampleSize || 0);
    const awaySample = Number(formGuide?.awayTeam?.sampleSize || 0);

    if (homeSample >= 5 && awaySample >= 5) {
      signals.push("balanced_form_samples");
      confidence += 0.04;
    }

    if (historyContext?.meta?.usedArchiveForHome || historyContext?.meta?.usedArchiveForAway) {
      signals.push("archive_history_fallback_used");
    }
  }

  if (h2hUsed) {
    signals.push("h2h_history_available");
    confidence += 0.05;

    const edge = headToHeadGuide?.trend?.edge || null;
    const goalPattern = headToHeadGuide?.trend?.goalPattern || null;

    if (edge === "home") signals.push("h2h_edge_home");
    else if (edge === "away") signals.push("h2h_edge_away");
    else signals.push("h2h_balanced");

    if (goalPattern === "overlean") signals.push("h2h_goal_pattern_over");
    else if (goalPattern === "underlean") signals.push("h2h_goal_pattern_under");
  }

  if (competitionContext) {
    signals.push("competition_context_available");
    confidence += 0.05;

  if (phaseInfo?.phase) {
    signals.push(`phase_${phaseInfo.phase}`);

    if (phaseInfo.phase === "playoff") {
      signals.push("high_competition_pressure");
      confidence += 0.06;
    }

    if (phaseInfo.phase === "playout") {
      signals.push("relegation_battle_phase");
      confidence += 0.06;
    }

    if (phaseInfo.phase === "knockout") {
      signals.push("elimination_match");
      confidence += 0.08;
    }
  }

    if (competitionContext?.importance === "high") {
      signals.push("high_stakes_match");
      confidence += 0.08;
    }

    if (
      competitionContext?.stakes?.home === "relegation" ||
      competitionContext?.stakes?.away === "relegation"
    ) {
      signals.push("relegation_pressure");
    }

    if (
      competitionContext?.stakes?.home === "title" ||
      competitionContext?.stakes?.away === "title"
    ) {
      signals.push("title_pressure");
    }

    if (
      competitionContext?.stakes?.home === "promotion" ||
      competitionContext?.stakes?.away === "promotion"
    ) {
      signals.push("promotion_race");
    }
  }

  if (refereeUsed) {
    signals.push("referee_context_available");
    confidence += 0.04;

    const refSignals = refereeContext?.data?.signals || [];
    for (const s of refSignals) {
      signals.push(s);
    }
  } else {
    warnings.push("referee_unavailable");
  }

  if (teamNewsContext?.data) {
    signals.push("team_news_available");

    const homeImpact = teamNewsContext?.data?.home?.impactLevel;
    const awayImpact = teamNewsContext?.data?.away?.impactLevel;

    if (homeImpact === "severe") signals.push("home_team_weakened");
    if (awayImpact === "severe") signals.push("away_team_weakened");

    if (homeImpact === "moderate" || awayImpact === "moderate") {
      signals.push("lineup_uncertainty");
    }
  }

  if (lineupContext?.data) {
    signals.push("lineup_context_available");

    const homeRotation = lineupContext?.data?.home?.rotationRisk;
    const awayRotation = lineupContext?.data?.away?.rotationRisk;
    const homeFatigue = lineupContext?.data?.home?.fatigue;
    const awayFatigue = lineupContext?.data?.away?.fatigue;
    const homeStrength = lineupContext?.data?.home?.expectedStrength;
    const awayStrength = lineupContext?.data?.away?.expectedStrength;

    if (homeRotation === "high") signals.push("home_rotation_risk");
    if (awayRotation === "high") signals.push("away_rotation_risk");

    if (homeFatigue === "high") signals.push("home_fatigue_high");
    if (awayFatigue === "high") signals.push("away_fatigue_high");

    if (homeStrength === "reduced" || homeStrength === "weak") {
      signals.push("home_lineup_strength_reduced");
    }

    if (awayStrength === "reduced" || awayStrength === "weak") {
      signals.push("away_lineup_strength_reduced");
    }
  }

  if (support.hasValue) {
    signals.push("value_support_present");
    confidence += 0.12;

    const topSignal = marketSignal(support.topValue);
    if (topSignal?.code) {
      signals.push(topSignal.code);

      if ((topSignal.strength || 0) >= 0.7) {
        signals.push("high_edge_market");
        confidence += 0.05;
      }
    }
  }

  const summaryPartsEl = [
    `${match.homeTeam} - ${match.awayTeam}: ανάλυση με βάση ιστορικά και διαθέσιμα δεδομένα.`
  ];

  const summaryPartsEn = [
    `${match.homeTeam} vs ${match.awayTeam}: contextual analysis using historical and available data.`
  ];

  if (historyUsed) {
    const formNarrative = buildFormNarrative(formGuide, match);
    if (formNarrative) {
      summaryPartsEl.push(formNarrative.el);
      summaryPartsEn.push(formNarrative.en);
    }

    if (historyRows > 0) {
      summaryPartsEl.push(`Το historical layer βασίστηκε σε ${historyRows} διαθέσιμες εγγραφές αγώνων.`);
      summaryPartsEn.push(`The historical layer was based on ${historyRows} available match records.`);
    }
  }

  if (h2hUsed) {
    const h2hNarrative = buildH2HNarrative(headToHeadGuide, match);
    if (h2hNarrative) {
      summaryPartsEl.push(h2hNarrative.el);
      summaryPartsEn.push(h2hNarrative.en);
    }
  }

  if (competitionContext) {
    const homeStake = competitionContext?.stakes?.home || "unknown";
    const awayStake = competitionContext?.stakes?.away || "unknown";

    summaryPartsEl.push(
      `Βαθμολογικό context: ${match.homeTeam}=${homeStake}, ${match.awayTeam}=${awayStake}.`
    );
    summaryPartsEn.push(
      `Table context: ${match.homeTeam}=${homeStake}, ${match.awayTeam}=${awayStake}.`
    );

    if (competitionContext?.importance === "high") {
      summaryPartsEl.push("Ο αγώνας αξιολογείται ως υψηλής σημασίας.");
      summaryPartsEn.push("This match is assessed as high importance.");
    }
  }

  if (refereeUsed) {
    const refereeNarrative = buildRefereeNarrative(refereeContext);
    if (refereeNarrative) {
      summaryPartsEl.push(refereeNarrative.el);
      summaryPartsEn.push(refereeNarrative.en);
    }
  }

  if (teamNewsContext?.data) {
    const homeImpact = teamNewsContext.data.home.impactLevel;
    const awayImpact = teamNewsContext.data.away.impactLevel;

    summaryPartsEl.push(
      `Απουσίες: ${match.homeTeam}=${homeImpact}, ${match.awayTeam}=${awayImpact}.`
    );

    summaryPartsEn.push(
      `Absences: ${match.homeTeam}=${homeImpact}, ${match.awayTeam}=${awayImpact}.`
    );
  }

  if (lineupContext?.data) {
    const homeFatigue = lineupContext.data.home.fatigue;
    const awayFatigue = lineupContext.data.away.fatigue;
    const homeRotation = lineupContext.data.home.rotationRisk;
    const awayRotation = lineupContext.data.away.rotationRisk;
    const homeStrength = lineupContext.data.home.expectedStrength;
    const awayStrength = lineupContext.data.away.expectedStrength;

    summaryPartsEl.push(
      `Lineup context: ${match.homeTeam}=fatigue:${homeFatigue}, rotation:${homeRotation}, strength:${homeStrength}; ${match.awayTeam}=fatigue:${awayFatigue}, rotation:${awayRotation}, strength:${awayStrength}.`
    );

    summaryPartsEn.push(
      `Lineup context: ${match.homeTeam}=fatigue:${homeFatigue}, rotation:${homeRotation}, strength:${homeStrength}; ${match.awayTeam}=fatigue:${awayFatigue}, rotation:${awayRotation}, strength:${awayStrength}.`
    );
  }

  const valueNarrative = buildValueNarrative(support.valueSummary);
  if (valueNarrative) {
    summaryPartsEl.push(valueNarrative.el);
    summaryPartsEn.push(valueNarrative.en);
  }

  let tempoLabel = "unknown";
  let riskLabel = "unknown";

  const topMarket = String(support.valueSummary?.topMarket || "").toLowerCase();
  const refStyle = refereeContext?.data?.style || "unknown";
  const h2hGoalPattern = headToHeadGuide?.trend?.goalPattern || "unknown";
  const homeFatigue = lineupContext?.data?.home?.fatigue || "unknown";
  const awayFatigue = lineupContext?.data?.away?.fatigue || "unknown";
  const homeRotation = lineupContext?.data?.home?.rotationRisk || "unknown";
  const awayRotation = lineupContext?.data?.away?.rotationRisk || "unknown";

  if (topMarket.includes("over / under 3.5") || topMarket.includes("over / under 2.5")) {
    tempoLabel = "open_game_lean";
    riskLabel = "higher_goal_variance";
  } else if (topMarket.includes("btts")) {
    tempoLabel = "both_teams_threat";
    riskLabel = "mutual_scoring_risk";
  } else if (topMarket.includes("1x2")) {
    tempoLabel = "result_driven";
    riskLabel = "directional_match_edge";
  } else if (h2hUsed && h2hGoalPattern === "overlean") {
    tempoLabel = "h2h_open_pattern";
    riskLabel = "historical_goal_variance";
  } else if (h2hUsed && h2hGoalPattern === "underlean") {
    tempoLabel = "history_informed";
    riskLabel = "historical_low_event_risk";
  } else if (historyUsed) {
    tempoLabel = "history_informed";
    riskLabel = "form_shaped";
  }

  if (
    tempoLabel === "unknown" &&
    (
      homeFatigue === "high" ||
      awayFatigue === "high" ||
      homeRotation === "high" ||
      awayRotation === "high"
    )
  ) {
    tempoLabel = "lineup_shaped";
    riskLabel = "rotation_fatigue_risk";
  }

  if (refereeUsed && refStyle === "strict" && tempoLabel === "unknown") {
    tempoLabel = "referee_shaped";
  }

  if (refereeUsed && refStyle === "strict") {
    riskLabel = riskLabel === "unknown" ? "discipline_event_risk" : riskLabel;
  }

  return {
    status: "ready",
    phase: phaseInfo,
    summary: {
      el: summaryPartsEl.join(" "),
      en: summaryPartsEn.join(" ")
    },
    confidence: Math.min(confidence, 0.92),
    signals,
    warnings,
    valueSummary: support.valueSummary,
    reasoning: {
      tempoProfile: {
        label: tempoLabel,
        explanation: refereeUsed && refStyle === "strict"
          ? "Partly shaped by the referee style and event tendency."
          : h2hUsed
            ? "Derived from head-to-head goal patterns."
            : support.hasValue
              ? "Derived from strongest value market currently attached to the match."
              : historyUsed
                ? "Derived from recent form and historical match coverage."
                : ""
      },
      riskProfile: {
        label: riskLabel,
        explanation: refereeUsed && refStyle === "strict"
          ? "Adjusted according to referee strictness and possible discipline events."
          : h2hUsed
            ? "Adjusted according to repeated matchup tendencies in recent head-to-head games."
            : support.hasValue
              ? "Adjusted according to value market direction and edge strength."
              : historyUsed
                ? "Adjusted according to recent team form samples."
                : ""
      },
      motivationProfile: {
        label:
          phaseInfo.phase === "playoff"
            ? "title_or_promotion_phase"
            : phaseInfo.phase === "playout"
            ? "relegation_survival_phase"
            : phaseInfo.phase === "knockout"
            ? "elimination_phase"
            : competitionContext?.importance === "high"
            ? "high_stakes"
            : "regular_context",
        explanation: ""
      },
 
      tacticalInteraction: {
        label: support.hasValue
          ? "value_supported_context"
          : h2hUsed
            ? "h2h_supported_context"
            : historyUsed
              ? "history_supported_context"
              : "unknown",
        explanation: ""
      },
      gameStateExpectation: {
        label: support.hasValue
          ? "market_informed"
          : h2hUsed
            ? "matchup_informed"
            : historyUsed
              ? "history_informed"
              : lineupContext?.data
                ? "lineup_informed"
                : "unknown",
        explanation: ""
      }
    },
    support: {
      priorsUsed: support.hasPriors,
      valueUsed: support.hasValue,
      researchUsed: !!support.research,
      historyUsed,
      h2hUsed,
      refereeUsed,
      lineupUsed: !!lineupContext?.data
    }
  };
}