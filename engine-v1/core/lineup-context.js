function safeNum(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function daysBetween(a, b) {
  const ta = Date.parse(a || "");
  const tb = Date.parse(b || "");
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return Math.round((tb - ta) / 86400000);
}

function fatigueLevel(daysRest) {
  if (daysRest == null) return "unknown";
  if (daysRest <= 2) return "high";
  if (daysRest <= 4) return "medium";
  return "low";
}

function rotationLevel(daysRest, absencesImpact) {
  if (daysRest == null) return "unknown";

  if (daysRest <= 2 && absencesImpact >= 0.4) return "high";
  if (daysRest <= 2) return "medium";
  if (daysRest <= 4 && absencesImpact >= 0.4) return "medium";
  return "low";
}

function expectedStrength(absencesImpact, rotationRisk) {
  let score = 1;

  if (absencesImpact >= 0.7) score -= 0.35;
  else if (absencesImpact >= 0.4) score -= 0.2;
  else if (absencesImpact > 0) score -= 0.1;

  if (rotationRisk === "high") score -= 0.2;
  else if (rotationRisk === "medium") score -= 0.1;

  if (score >= 0.9) return "strong";
  if (score >= 0.7) return "stable";
  if (score >= 0.5) return "reduced";
  return "weak";
}

function findLastMatchDate(last5) {
  if (!Array.isArray(last5) || !last5.length) return null;
  return last5[0]?.date || null;
}

function inferLineupReliability({
  homeRestDays,
  awayRestDays,
  homeAbsenceImpact,
  awayAbsenceImpact
}) {
  const hasHomeRest = homeRestDays != null;
  const hasAwayRest = awayRestDays != null;
  const hasAnyRest = hasHomeRest || hasAwayRest;
  const hasBothRest = hasHomeRest && hasAwayRest;

  const hasHomeAbsences = homeAbsenceImpact > 0;
  const hasAwayAbsences = awayAbsenceImpact > 0;
  const hasAnyAbsences = hasHomeAbsences || hasAwayAbsences;

  if (!hasAnyRest && !hasAnyAbsences) {
    return {
      reliability: "empty",
      hasHomeRest,
      hasAwayRest,
      hasBothRest,
      hasHomeAbsences,
      hasAwayAbsences,
      hasAnyAbsences
    };
  }

  if (hasBothRest && hasAnyAbsences) {
    return {
      reliability: "usable",
      hasHomeRest,
      hasAwayRest,
      hasBothRest,
      hasHomeAbsences,
      hasAwayAbsences,
      hasAnyAbsences
    };
  }

  return {
    reliability: "limited",
    hasHomeRest,
    hasAwayRest,
    hasBothRest,
    hasHomeAbsences,
    hasAwayAbsences,
    hasAnyAbsences
  };
}

export function buildLineupContext(match, { formGuide, teamNewsContext }) {
  const kickoffUtc = match?.kickoffUtc || null;

  const homeLastDate = findLastMatchDate(formGuide?.homeTeam?.last5);
  const awayLastDate = findLastMatchDate(formGuide?.awayTeam?.last5);

  const homeRestDays = daysBetween(homeLastDate, kickoffUtc);
  const awayRestDays = daysBetween(awayLastDate, kickoffUtc);

  const homeAbsenceImpact = safeNum(teamNewsContext?.data?.home?.impactScore, 0) || 0;
  const awayAbsenceImpact = safeNum(teamNewsContext?.data?.away?.impactScore, 0) || 0;

  const homeFatigue = fatigueLevel(homeRestDays);
  const awayFatigue = fatigueLevel(awayRestDays);

  const homeRotation = rotationLevel(homeRestDays, homeAbsenceImpact);
  const awayRotation = rotationLevel(awayRestDays, awayAbsenceImpact);

  const homeStrength = expectedStrength(homeAbsenceImpact, homeRotation);
  const awayStrength = expectedStrength(awayAbsenceImpact, awayRotation);

  const reliabilityMeta = inferLineupReliability({
    homeRestDays,
    awayRestDays,
    homeAbsenceImpact,
    awayAbsenceImpact
  });

  if (reliabilityMeta.reliability === "empty") {
    return {
      key: "expected_lineups",
      status: "empty",
      data: null,
      confidence: 0,
      reliability: "empty",
      diagnostics: {
        hasHomeRest: reliabilityMeta.hasHomeRest,
        hasAwayRest: reliabilityMeta.hasAwayRest,
        hasBothRest: reliabilityMeta.hasBothRest,
        hasHomeAbsences: reliabilityMeta.hasHomeAbsences,
        hasAwayAbsences: reliabilityMeta.hasAwayAbsences,
        hasAnyAbsences: reliabilityMeta.hasAnyAbsences
      }
    };
  }

  return {
    key: "expected_lineups",
    status: reliabilityMeta.reliability === "usable" ? "ready" : "partial",
    data: {
      home: {
        restDays: homeRestDays,
        fatigue: homeFatigue,
        rotationRisk: homeRotation,
        expectedStrength: homeStrength
      },
      away: {
        restDays: awayRestDays,
        fatigue: awayFatigue,
        rotationRisk: awayRotation,
        expectedStrength: awayStrength
      }
    },
    confidence: reliabilityMeta.reliability === "usable" ? 0.62 : 0.42,
    reliability: reliabilityMeta.reliability,
    diagnostics: {
      hasHomeRest: reliabilityMeta.hasHomeRest,
      hasAwayRest: reliabilityMeta.hasAwayRest,
      hasBothRest: reliabilityMeta.hasBothRest,
      hasHomeAbsences: reliabilityMeta.hasHomeAbsences,
      hasAwayAbsences: reliabilityMeta.hasAwayAbsences,
      hasAnyAbsences: reliabilityMeta.hasAnyAbsences
    }
  };
}