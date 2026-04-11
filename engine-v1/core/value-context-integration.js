function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function addReason(reasons, code, impact, note) {
  reasons.push({
    code,
    impact: Number(impact.toFixed(3)),
    note
  });
}

export function applyValueContextIntegration(baseOutput, context = {}) {
  const result = structuredClone(baseOutput || {});
  const reasons = [];

  if (!result || typeof result !== "object") {
    return {
      ...baseOutput,
      contextAdjusted: false,
      contextReasons: []
    };
  }

  const comp = context?.competitionContext?.data || null;
  const ref = context?.refereeProfile?.data || null;
  const teamNews = context?.teamNews?.data || null;
  const lineups = context?.expectedLineups?.data || null;
  const h2h = context?.headToHead || null;
// -------------------------
// FORM CONTEXT (NEW)
// -------------------------
const form = context?.formGuide || null;

if (form?.homeTeam?.formScore != null && form?.awayTeam?.formScore != null) {
  const diff = form.homeTeam.formScore - form.awayTeam.formScore;

  if (diff >= 0.2) {
    result.homeWinScore = clamp((result.homeWinScore || 0) + 0.08, 0, 1);
    addReason(reasons, "form_home_stronger", 0.08, "Home team has significantly stronger form");
  }

  if (diff <= -0.2) {
    result.awayWinScore = clamp((result.awayWinScore || 0) + 0.08, 0, 1);
    addReason(reasons, "form_away_stronger", 0.08, "Away team has significantly stronger form");
  }

  if (Math.abs(diff) <= 0.08) {
    result.drawScore = clamp((result.drawScore || 0) + 0.04, 0, 1);
    addReason(reasons, "form_balanced", 0.04, "Teams have similar recent form");
  }
}

  let confidenceDelta = 0;

  // -------------------------
  // competition context
  // -------------------------
  if (comp) {
    const homeStake = comp?.stakes?.home || "unknown";
    const awayStake = comp?.stakes?.away || "unknown";
    const highStakes = comp?.importance === "high";

    if (highStakes) {
      confidenceDelta += 0.04;
      addReason(reasons, "competition_high_stakes", 0.04, "High-stakes league context");
    }

    if (homeStake === "promotion" || homeStake === "title") {
      result.homeWinScore = clamp((result.homeWinScore || 0) + 0.03, 0, 1);
      addReason(reasons, "home_motivation_boost", 0.03, `Home stake: ${homeStake}`);
    }

    if (awayStake === "promotion" || awayStake === "title") {
      result.awayWinScore = clamp((result.awayWinScore || 0) + 0.03, 0, 1);
      addReason(reasons, "away_motivation_boost", 0.03, `Away stake: ${awayStake}`);
    }

    if (homeStake === "relegation" && awayStake === "relegation") {
      result.drawScore = clamp((result.drawScore || 0) + 0.025, 0, 1);
      addReason(reasons, "dual_relegation_tension", 0.025, "Both sides under relegation pressure");
    }
  }

  // -------------------------
  // referee context
  // -------------------------
  if (ref) {
    const style = ref?.style || "unknown";
    const avgCards = Number(ref?.stats?.avgCards || 0);
    const avgPens = Number(ref?.stats?.avgPenalties || 0);

    if (style === "strict") {
      result.drawScore = clamp((result.drawScore || 0) + 0.015, 0, 1);
      confidenceDelta += 0.015;
      addReason(reasons, "strict_referee", 0.015, "Strict referee may compress game flow");
    }

    if (avgPens >= 0.35) {
      result.over25Score = clamp((result.over25Score || 0) + 0.025, 0, 1);
      result.bttsScore = clamp((result.bttsScore || 0) + 0.015, 0, 1);
      addReason(reasons, "penalty_active_referee", 0.025, "Penalty-active referee");
    }

    if (avgCards >= 5.5) {
      confidenceDelta += 0.01;
      addReason(reasons, "high_cards_referee", 0.01, "High card referee profile");
    }
  }

  // -------------------------
  // team news
  // -------------------------
  if (teamNews) {
    const homeImpact = Number(teamNews?.home?.impactScore || 0);
    const awayImpact = Number(teamNews?.away?.impactScore || 0);

    if (homeImpact > 0) {
      result.homeWinScore = clamp((result.homeWinScore || 0) - homeImpact * 0.12, 0, 1);
      result.awayWinScore = clamp((result.awayWinScore || 0) + homeImpact * 0.06, 0, 1);
      addReason(reasons, "home_absence_impact", homeImpact * 0.12, "Home absences reduce home edge");
    }

    if (awayImpact > 0) {
      result.awayWinScore = clamp((result.awayWinScore || 0) - awayImpact * 0.12, 0, 1);
      result.homeWinScore = clamp((result.homeWinScore || 0) + awayImpact * 0.06, 0, 1);
      addReason(reasons, "away_absence_impact", awayImpact * 0.12, "Away absences reduce away edge");
    }

    if (homeImpact >= 0.4 || awayImpact >= 0.4) {
      confidenceDelta -= 0.03;
      addReason(reasons, "absence_uncertainty", -0.03, "Absences increase variance");
    }
  }

  // -------------------------
  // lineup / fatigue / rotation
  // -------------------------
  if (lineups) {
    const homeFatigue = lineups?.home?.fatigue || "unknown";
    const awayFatigue = lineups?.away?.fatigue || "unknown";
    const homeRotation = lineups?.home?.rotationRisk || "unknown";
    const awayRotation = lineups?.away?.rotationRisk || "unknown";
    const homeStrength = lineups?.home?.expectedStrength || "unknown";
    const awayStrength = lineups?.away?.expectedStrength || "unknown";

    if (homeFatigue === "high" || homeRotation === "high") {
      result.homeWinScore = clamp((result.homeWinScore || 0) - 0.05, 0, 1);
      result.drawScore = clamp((result.drawScore || 0) + 0.015, 0, 1);
      addReason(reasons, "home_fatigue_rotation", 0.05, "Home fatigue/rotation reduces edge");
    }

    if (awayFatigue === "high" || awayRotation === "high") {
      result.awayWinScore = clamp((result.awayWinScore || 0) - 0.05, 0, 1);
      result.drawScore = clamp((result.drawScore || 0) + 0.015, 0, 1);
      addReason(reasons, "away_fatigue_rotation", 0.05, "Away fatigue/rotation reduces edge");
    }

    if (homeStrength === "reduced" || homeStrength === "weak") {
      result.homeWinScore = clamp((result.homeWinScore || 0) - 0.05, 0, 1);
      addReason(reasons, "home_lineup_reduced", 0.05, "Home projected lineup strength reduced");
    }

    if (awayStrength === "reduced" || awayStrength === "weak") {
      result.awayWinScore = clamp((result.awayWinScore || 0) - 0.05, 0, 1);
      addReason(reasons, "away_lineup_reduced", 0.05, "Away projected lineup strength reduced");
    }
  }

  // -------------------------
  // H2H context
  // -------------------------
  if (h2h?.sampleSize >= 3) {
    const edge = h2h?.trend?.edge || null;
    const goalPattern = h2h?.trend?.goalPattern || "balanced";

    if (edge === "home") {
      result.homeWinScore = clamp((result.homeWinScore || 0) + 0.025, 0, 1);
      addReason(reasons, "h2h_home_edge", 0.025, "Recent H2H leans home");
    } else if (edge === "away") {
      result.awayWinScore = clamp((result.awayWinScore || 0) + 0.025, 0, 1);
      addReason(reasons, "h2h_away_edge", 0.025, "Recent H2H leans away");
    }

    if (goalPattern === "overlean") {
      result.over25Score = clamp((result.over25Score || 0) + 0.03, 0, 1);
      result.bttsScore = clamp((result.bttsScore || 0) + 0.02, 0, 1);
      addReason(reasons, "h2h_overlean", 0.03, "Recent H2H goals profile is open");
    } else if (goalPattern === "underlean") {
      result.over25Score = clamp((result.over25Score || 0) - 0.03, 0, 1);
      result.drawScore = clamp((result.drawScore || 0) + 0.015, 0, 1);
      addReason(reasons, "h2h_underlean", 0.03, "Recent H2H goals profile is tight");
    }
  }

// -------------------------
// AI SIGNALS (NEW)
// -------------------------
const signals = context?.signals || context?.aiContext?.signals || [];

if (signals.includes("h2h_goal_pattern_over")) {
  result.over25Score = clamp((result.over25Score || 0) + 0.07, 0, 1);
  addReason(reasons, "ai_h2h_over_signal", 0.07, "AI detected open H2H pattern");
}

if (signals.includes("h2h_edge_home")) {
  result.homeWinScore = clamp((result.homeWinScore || 0) + 0.06, 0, 1);
  addReason(reasons, "ai_h2h_home_edge", 0.06, "AI detected home H2H edge");
}

if (signals.includes("h2h_edge_away")) {
  result.awayWinScore = clamp((result.awayWinScore || 0) + 0.06, 0, 1);
  addReason(reasons, "ai_h2h_away_edge", 0.06, "AI detected away H2H edge");
}

if (signals.includes("home_strong_form")) {
  result.homeWinScore = clamp((result.homeWinScore || 0) + 0.05, 0, 1);
  addReason(reasons, "ai_home_form_signal", 0.05, "AI strong home form signal");
}

if (signals.includes("away_strong_form")) {
  result.awayWinScore = clamp((result.awayWinScore || 0) + 0.05, 0, 1);
  addReason(reasons, "ai_away_form_signal", 0.05, "AI strong away form signal");
}

if (
  signals.includes("history_form_available") &&
  form?.homeTeam?.formScore != null &&
  form?.awayTeam?.formScore != null
) {
  const diff = form.homeTeam.formScore - form.awayTeam.formScore;

  if (diff >= 0.2) {
    result.homeWinScore = clamp((result.homeWinScore || 0) + 0.05, 0, 1);
    addReason(reasons, "ai_home_form_signal", 0.05, "AI confirmed strong home form edge");
  } else if (diff <= -0.2) {
    result.awayWinScore = clamp((result.awayWinScore || 0) + 0.05, 0, 1);
    addReason(reasons, "ai_away_form_signal", 0.05, "AI confirmed strong away form edge");
  }
}

// -------------------------
// NORMALIZE 1X2 SCORES
// -------------------------
const h = Number(result.homeWinScore || 0);
const d = Number(result.drawScore || 0);
const a = Number(result.awayWinScore || 0);

const sum = h + d + a;

if (sum > 0) {
  result.homeWinScore = clamp(h / sum, 0, 1);
  result.drawScore = clamp(d / sum, 0, 1);
  result.awayWinScore = clamp(a / sum, 0, 1);
}

  const priorConfidence = Number(result.confidence || 0);
  result.confidence = clamp(priorConfidence + confidenceDelta, 0, 1);

  result.contextAdjusted = reasons.length > 0;
  result.contextReasons = reasons;
  result.contextDelta = Number(confidenceDelta.toFixed(3));

  return result;
}