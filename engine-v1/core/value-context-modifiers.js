import fs from "fs/promises";
import path from "path";
import { resolveDataPath } from "../storage/data-root.js";

// ============================================================
// VALUE CONTEXT MODIFIERS — STABLE v1.0
// Layer on top of value-engine-v1
// Reads existing local indexes/history substrate
// Deterministic / no odds / no provider coupling
// ============================================================

const DATA_ROOT = resolveDataPath();
const INDEX_ROOT = path.join(DATA_ROOT, "history-index");

const DEFAULTS = {
  fatigue: {
    rest2DaysPenalty: 0.08,
    rest3DaysPenalty: 0.05,
    rest4DaysPenalty: 0.025
  },
  congestion: {
    last7Threshold: 3,
    last14Threshold: 5,
    last7Penalty: 0.045,
    last14Penalty: 0.025
  },
  lookAhead: {
    next2DaysPenalty: 0.04,
    next3DaysPenalty: 0.025,
    next4DaysPenalty: 0.015
  },
  motivation: {
    lateSeasonBoost: 0.035,
    cupKnockoutBoost: 0.03,
    playoffBoost: 0.045,
    relegationPressureBoost: 0.02,
    titlePressureBoost: 0.02,
    closeStrengthGapBonus: 0.015
  },
  confidence: {
    lowTrustCeiling: 0.86,
    mediumTrustCeiling: 0.92,
    highTrustCeiling: 0.97
  }
};

// ------------------------------------------------------------
// PUBLIC API
// ------------------------------------------------------------

export async function applyValueContextModifiers({
  fixture,
  baseValue,
  opts = {}
}) {
  if (!fixture || typeof fixture !== "object") {
    throw new Error("applyValueContextModifiers: fixture is required");
  }

  if (!baseValue || typeof baseValue !== "object") {
    throw new Error("applyValueContextModifiers: baseValue is required");
  }

  const config = mergeConfig(DEFAULTS, opts?.config || {});
  const season = resolveSeason(fixture);
  const kickoffTs = getFixtureKickoffTs(fixture);

  const indexes = await loadIndexes(season);
  const fixturesDb = await readJsonSafe(path.join(DATA_ROOT, "fixtures.json"), []);
  const currentFixtures = Array.isArray(fixturesDb) ? fixturesDb : [];

  const homeName = getHomeTeamName(fixture);
  const awayName = getAwayTeamName(fixture);

  const homeTeam = resolveTeamEntry(indexes.teamForm, homeName, fixture.leagueSlug);
  const awayTeam = resolveTeamEntry(indexes.teamForm, awayName, fixture.leagueSlug);

  const previousHome = extractPreviousMatches(homeTeam, kickoffTs);
  const previousAway = extractPreviousMatches(awayTeam, kickoffTs);

  const nextHome = findNextScheduledMatch(currentFixtures, {
    teamName: homeName,
    leagueSlug: fixture.leagueSlug,
    kickoffTs,
    excludeFixtureId: fixture.id
  });

  const nextAway = findNextScheduledMatch(currentFixtures, {
    teamName: awayName,
    leagueSlug: fixture.leagueSlug,
    kickoffTs,
    excludeFixtureId: fixture.id
  });

  const homeRestDays = computeRestDays(previousHome.lastMatchTs, kickoffTs);
  const awayRestDays = computeRestDays(previousAway.lastMatchTs, kickoffTs);

  const homeMatchesLast7 = countMatchesInWindow(previousHome.matchTimestamps, kickoffTs, 7);
  const awayMatchesLast7 = countMatchesInWindow(previousAway.matchTimestamps, kickoffTs, 7);

  const homeMatchesLast14 = countMatchesInWindow(previousHome.matchTimestamps, kickoffTs, 14);
  const awayMatchesLast14 = countMatchesInWindow(previousAway.matchTimestamps, kickoffTs, 14);

  const homeNextMatchInDays = computeRestDays(kickoffTs, nextHome?.kickoffTs);
  const awayNextMatchInDays = computeRestDays(kickoffTs, nextAway?.kickoffTs);

  const leagueMeta = extractLeagueMeta(indexes.leagueForm, fixture.leagueSlug, fixture.leagueName);
  const contextMeta = buildContextMeta({
    fixture,
    season,
    leagueMeta,
    homeTeam,
    awayTeam,
    kickoffTs
  });

  const motivation = computeMotivationModifier({
    fixture,
    contextMeta,
    homeTeam,
    awayTeam,
    baseValue,
    config
  });

  const fatigue = computeFatigueModifier({
    homeRestDays,
    awayRestDays,
    config
  });

  const congestion = computeCongestionModifier({
    homeMatchesLast7,
    awayMatchesLast7,
    homeMatchesLast14,
    awayMatchesLast14,
    config
  });

  const lookAhead = computeLookAheadModifier({
    homeNextMatchInDays,
    awayNextMatchInDays,
    config
  });

  const adjusted = applyAdjustmentsToBaseValue({
    baseValue,
    motivation,
    fatigue,
    congestion,
    lookAhead
  });

  let reconcileReasons = [];

  const reconcileAdjusted = applyReconcileContext(
    fixture,
    adjusted,
    reconcileReasons
  );

  const finalAdjusted = reconcileAdjusted.next;

  const confidenceAdjusted = computeAdjustedConfidence({
    baseConfidence: toNumber(baseValue.confidence, 0.5),
    fatigue,
    congestion,
    lookAhead,
    motivation,
    contextMeta,
    config,
    fixture
  });

  return {
    ...baseValue,
    adjusted: finalAdjusted,
    modifiers: {
       reconcile: {
         reasons: reconcileReasons
       },
      motivation,
      fatigue,
      congestion,
      lookAhead
    },
    context: {
      season,
      leagueSlug: fixture.leagueSlug || "",
      competitionType: contextMeta.competitionType,
      phase: contextMeta.phase,
      leagueTrust: contextMeta.leagueTrust,
      leagueTier: contextMeta.leagueTier,
      homeRestDays,
      awayRestDays,
      homeMatchesLast7,
      awayMatchesLast7,
      homeMatchesLast14,
      awayMatchesLast14,
      homeNextMatchInDays,
      awayNextMatchInDays
    },
    meta: {
      confidenceAdjusted
    }
  };
}

// ------------------------------------------------------------
// LOADERS
// ------------------------------------------------------------

async function loadIndexes(season) {
  const teamFormPath = path.join(INDEX_ROOT, "team-form", `${season}.json`);
  const leagueFormPath = path.join(INDEX_ROOT, "league-form", `${season}.json`);
  const matchupsPath = path.join(INDEX_ROOT, "matchups", `${season}.json`);

  const [teamForm, leagueForm, matchups] = await Promise.all([
    readJsonSafe(teamFormPath, {}),
    readJsonSafe(leagueFormPath, {}),
    readJsonSafe(matchupsPath, {})
  ]);

  return {
    teamForm: isObject(teamForm) ? teamForm : {},
    leagueForm: isObject(leagueForm) ? leagueForm : {},
    matchups: isObject(matchups) ? matchups : {}
  };
}

async function readJsonSafe(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

// ------------------------------------------------------------
// MAIN CONTEXT BUILDERS
// ------------------------------------------------------------

function buildContextMeta({
  fixture,
  season,
  leagueMeta,
  homeTeam,
  awayTeam,
  kickoffTs
}) {
  const seasonProgress = computeSeasonProgress(season, kickoffTs);

  const competitionType =
    String(
      fixture.competitionType ||
      leagueMeta?.competitionType ||
      inferCompetitionType(fixture)
    ).toLowerCase() || "league";

  const phase =
    String(
      fixture.phase ||
      leagueMeta?.phase ||
      inferPhase(fixture)
    ).toLowerCase() || "regular";

  const leagueTrust = String(
    fixture.leagueTrust ||
    leagueMeta?.leagueTrust ||
    "medium"
  ).toLowerCase();

  const leagueTier = toNumber(
    fixture.leagueTier,
    toNumber(leagueMeta?.leagueTier, 2)
  );

  const homeStrength = extractStrengthProxy(homeTeam);
  const awayStrength = extractStrengthProxy(awayTeam);

  const homeTablePos = extractTablePosition(homeTeam);
  const awayTablePos = extractTablePosition(awayTeam);

  return {
    seasonProgress,
    competitionType,
    phase,
    leagueTrust,
    leagueTier,
    homeStrength,
    awayStrength,
    homeTablePos,
    awayTablePos
  };
}

// ------------------------------------------------------------
// MODIFIERS
// ------------------------------------------------------------

function computeMotivationModifier({
  fixture,
  contextMeta,
  homeTeam,
  awayTeam,
  baseValue,
  config
}) {
  let homeDelta = 0;
  let awayDelta = 0;
  let drawDelta = 0;
  const reasons = [];

  if (contextMeta.seasonProgress >= 0.68) {
    reasons.push("late_season_pressure");
    const posEffect = computeTablePressureBoost(contextMeta, config);
    homeDelta += posEffect.home;
    awayDelta += posEffect.away;
    drawDelta += posEffect.draw;
  }

  if (contextMeta.competitionType === "cup") {
    reasons.push("cup_intensity");
    drawDelta += 0.01;
    homeDelta += config.motivation.cupKnockoutBoost * 0.4;
    awayDelta += config.motivation.cupKnockoutBoost * 0.4;
  }

  if (
    contextMeta.phase.includes("playoff") ||
    contextMeta.phase.includes("play-out") ||
    contextMeta.phase.includes("playoff") ||
    contextMeta.phase.includes("promotion") ||
    contextMeta.phase.includes("relegation")
  ) {
    reasons.push("playoff_pressure");
    homeDelta += config.motivation.playoffBoost * 0.45;
    awayDelta += config.motivation.playoffBoost * 0.45;
    drawDelta += 0.012;
  }

  const strengthGap = Math.abs(
    toNumber(contextMeta.homeStrength, 0.5) - toNumber(contextMeta.awayStrength, 0.5)
  );

  if (strengthGap <= 0.08) {
    reasons.push("close_strength_gap");
    drawDelta += 0.01;
    const bonus = config.motivation.closeStrengthGapBonus;
    if (toNumber(baseValue.homeWinScore, 0.33) >= toNumber(baseValue.awayWinScore, 0.33)) {
      homeDelta += bonus * 0.6;
    } else {
      awayDelta += bonus * 0.6;
    }
  }

  return {
    homeDelta: round6(homeDelta),
    awayDelta: round6(awayDelta),
    drawDelta: round6(drawDelta),
    reasons
  };
}

function computeFatigueModifier({
  homeRestDays,
  awayRestDays,
  config
}) {
  const homePenalty = computeRestPenalty(homeRestDays, config.fatigue);
  const awayPenalty = computeRestPenalty(awayRestDays, config.fatigue);

  return {
    homePenalty: round6(homePenalty),
    awayPenalty: round6(awayPenalty),
    reasons: [
      ...(homePenalty > 0 ? [`home_rest_${safeLabel(homeRestDays)}`] : []),
      ...(awayPenalty > 0 ? [`away_rest_${safeLabel(awayRestDays)}`] : [])
    ]
  };
}

function computeCongestionModifier({
  homeMatchesLast7,
  awayMatchesLast7,
  homeMatchesLast14,
  awayMatchesLast14,
  config
}) {
  const homePenalty = computeCongestionPenalty({
    matchesLast7: homeMatchesLast7,
    matchesLast14: homeMatchesLast14,
    config: config.congestion
  });

  const awayPenalty = computeCongestionPenalty({
    matchesLast7: awayMatchesLast7,
    matchesLast14: awayMatchesLast14,
    config: config.congestion
  });

  return {
    homePenalty: round6(homePenalty),
    awayPenalty: round6(awayPenalty),
    drawBoost: round6((homePenalty + awayPenalty) * 0.22),
    reasons: [
      ...(homePenalty > 0 ? [`home_congestion_7_${homeMatchesLast7}_14_${homeMatchesLast14}`] : []),
      ...(awayPenalty > 0 ? [`away_congestion_7_${awayMatchesLast7}_14_${awayMatchesLast14}`] : [])
    ]
  };
}

function computeLookAheadModifier({
  homeNextMatchInDays,
  awayNextMatchInDays,
  config
}) {
  const homePenalty = computeLookAheadPenalty(homeNextMatchInDays, config.lookAhead);
  const awayPenalty = computeLookAheadPenalty(awayNextMatchInDays, config.lookAhead);

  return {
    homePenalty: round6(homePenalty),
    awayPenalty: round6(awayPenalty),
    reasons: [
      ...(homePenalty > 0 ? [`home_next_${safeLabel(homeNextMatchInDays)}`] : []),
      ...(awayPenalty > 0 ? [`away_next_${safeLabel(awayNextMatchInDays)}`] : [])
    ]
  };
}

function applyReconcileContext(fixture, adjusted, reasons = []) {
  const next = { ...adjusted };

  const hasConflict = fixture?.hasConflict === true;
  const needsReview = fixture?.needsReview === true;
  const confidenceBand = String(fixture?.confidenceBand || "").toUpperCase();
  const conflictTypes = Array.isArray(fixture?.conflictTypes) ? fixture.conflictTypes : [];
  const reconcileConfidence = Number(fixture?.reconcileMeta?.confidence || 0);

  if (hasConflict) {
    next.homeWinScore -= 0.04;
    next.drawScore -= 0.02;
    next.awayWinScore -= 0.04;
    next.over25Score -= 0.03;
    next.over35Score -= 0.03;
    next.bttsScore -= 0.03;
    reasons.push("reconcile_conflict");
  }

  if (needsReview) {
    next.homeWinScore -= 0.03;
    next.awayWinScore -= 0.03;
    next.over25Score -= 0.02;
    next.bttsScore -= 0.02;
    reasons.push("reconcile_needs_review");
  }

  if (confidenceBand === "LOW") {
    next.homeWinScore -= 0.05;
    next.awayWinScore -= 0.05;
    next.over25Score -= 0.04;
    next.bttsScore -= 0.04;
    reasons.push("reconcile_low_confidence");
  } else if (confidenceBand === "MEDIUM") {
    next.homeWinScore -= 0.02;
    next.awayWinScore -= 0.02;
    next.over25Score -= 0.02;
    next.bttsScore -= 0.02;
  } else if (confidenceBand === "HIGH" && reconcileConfidence >= 0.9 && !hasConflict) {
    next.homeWinScore += 0.01;
    next.awayWinScore += 0.01;
    reasons.push("reconcile_high_confidence");
  }

  if (conflictTypes.includes("score")) {
    next.over25Score -= 0.05;
    next.over35Score -= 0.05;
    next.bttsScore -= 0.05;
    reasons.push("score_conflict");
  }

  return { next, reasons };
}

// ------------------------------------------------------------
// ADJUSTMENTS
// ------------------------------------------------------------

function applyAdjustmentsToBaseValue({
  baseValue,
  motivation,
  fatigue,
  congestion,
  lookAhead
}) {
  let home = toNumber(baseValue.homeWinScore, 0.333333);
  let draw = toNumber(baseValue.drawScore, 0.333333);
  let away = toNumber(baseValue.awayWinScore, 0.333333);

  home += motivation.homeDelta;
  away += motivation.awayDelta;
  draw += motivation.drawDelta;

  home -= fatigue.homePenalty;
  away -= fatigue.awayPenalty;
  draw += (fatigue.homePenalty + fatigue.awayPenalty) * 0.18;

  home -= congestion.homePenalty;
  away -= congestion.awayPenalty;
  draw += congestion.drawBoost;

  home -= lookAhead.homePenalty;
  away -= lookAhead.awayPenalty;
  draw += (lookAhead.homePenalty + lookAhead.awayPenalty) * 0.15;

  const normalized = normalizeThreeWay(home, draw, away);

  let over25 = toNumber(baseValue.over25Score, 0.5);
  let btts = toNumber(baseValue.bttsScore, 0.5);

  const totalFatigue = fatigue.homePenalty + fatigue.awayPenalty;
  const totalCongestion = congestion.homePenalty + congestion.awayPenalty;
  const totalLookAhead = lookAhead.homePenalty + lookAhead.awayPenalty;
  const intensityBoost = motivation.drawDelta > 0.015 ? 0.01 : 0;

  over25 = clamp01(
    over25
      - totalFatigue * 0.22
      - totalLookAhead * 0.10
      + totalCongestion * 0.05
      + intensityBoost
  );

  btts = clamp01(
    btts
      - totalFatigue * 0.14
      - totalLookAhead * 0.06
      + totalCongestion * 0.04
      + intensityBoost * 0.6
  );

  return {
    homeWinScore: round6(normalized.home),
    drawScore: round6(normalized.draw),
    awayWinScore: round6(normalized.away),
    over25Score: round6(over25),
    bttsScore: round6(btts)
  };
}

function computeAdjustedConfidence({
  baseConfidence,
  fatigue,
  congestion,
  lookAhead,
  motivation,
  contextMeta,
  config,
  fixture
}) {
  let adjusted = toNumber(baseConfidence, 0.5);

  adjusted -= (fatigue.homePenalty + fatigue.awayPenalty) * 0.55;
  adjusted -= (congestion.homePenalty + congestion.awayPenalty) * 0.45;
  adjusted -= (lookAhead.homePenalty + lookAhead.awayPenalty) * 0.35;

  if (
    contextMeta.phase.includes("playoff") ||
    contextMeta.phase.includes("promotion") ||
    contextMeta.phase.includes("relegation")
  ) {
    adjusted -= 0.02;
  }

  if (contextMeta.competitionType === "cup") {
    adjusted -= 0.015;
  }

  if (motivation.reasons.includes("late_season_pressure")) {
    adjusted -= 0.01;
  }

  const hasConflict = fixture?.hasConflict === true;
  const needsReview = fixture?.needsReview === true;
  const confidenceBand = String(fixture?.confidenceBand || "").toUpperCase();
  const conflictTypes = Array.isArray(fixture?.conflictTypes) ? fixture.conflictTypes : [];
  const reconcileConfidence = Number(fixture?.reconcileMeta?.confidence || 0);

  if (hasConflict) {
    adjusted -= 0.06;
  }

  if (needsReview) {
    adjusted -= 0.04;
  }

  if (confidenceBand === "LOW") {
    adjusted -= 0.06;
  } else if (confidenceBand === "MEDIUM") {
    adjusted -= 0.03;
  } else if (confidenceBand === "HIGH" && reconcileConfidence >= 0.9 && !hasConflict) {
    adjusted += 0.015;
  }

  if (conflictTypes.includes("score")) {
    adjusted -= 0.07;
  }

  if (conflictTypes.includes("status")) {
    adjusted -= 0.05;
  }

  if (conflictTypes.includes("kickoff")) {
    adjusted -= 0.02;
  }

  if (conflictTypes.includes("minute")) {
    adjusted -= 0.02;
  }

  const trustCeiling = getTrustCeiling(contextMeta.leagueTrust, config.confidence);
  adjusted = Math.min(adjusted, trustCeiling);

  return round6(clamp(adjusted, 0.2, 0.99));
}

// ------------------------------------------------------------
// TEAM / INDEX RESOLUTION
// ------------------------------------------------------------

function resolveTeamEntry(teamFormIndex, teamName, leagueSlug = "") {
  if (!isObject(teamFormIndex) || !teamName) return null;

  const target = normalizeName(teamName);
  const directCandidates = [];

  for (const [key, value] of Object.entries(teamFormIndex)) {
    if (!value) continue;

    const normalizedKey = normalizeName(key);
    const candidateNames = [
      key,
      value.teamName,
      value.name,
      value.team,
      value.teamLabel,
      value.displayName
    ]
      .filter(Boolean)
      .map(normalizeName);

    const candidateLeague = String(
      value.leagueSlug ||
      value.league ||
      value.competition ||
      ""
    ).toLowerCase();

    const exactNameHit =
      normalizedKey === target ||
      candidateNames.includes(target);

    if (exactNameHit) {
      directCandidates.push({
        key,
        value,
        score: candidateLeague && leagueSlug && candidateLeague === String(leagueSlug).toLowerCase() ? 10 : 8
      });
      continue;
    }

    const tokenScore = computeTokenSimilarity(target, normalizedKey);
    if (tokenScore >= 0.92) {
      directCandidates.push({
        key,
        value,
        score: tokenScore + (candidateLeague && leagueSlug && candidateLeague === String(leagueSlug).toLowerCase() ? 1 : 0)
      });
    }
  }

  if (!directCandidates.length) return null;

  directCandidates.sort((a, b) => b.score - a.score);
  return directCandidates[0].value;
}

function extractLeagueMeta(leagueFormIndex, leagueSlug, leagueName) {
  if (!isObject(leagueFormIndex)) return null;

  const slugTarget = String(leagueSlug || "").toLowerCase().trim();
  const nameTarget = normalizeName(leagueName || "");

  for (const [key, value] of Object.entries(leagueFormIndex)) {
    const keySlug = String(key || "").toLowerCase().trim();
    const valueSlug = String(value?.leagueSlug || value?.slug || "").toLowerCase().trim();
    const valueName = normalizeName(value?.leagueName || value?.name || "");

    if (
      (slugTarget && (keySlug === slugTarget || valueSlug === slugTarget)) ||
      (nameTarget && valueName && valueName === nameTarget)
    ) {
      return value;
    }
  }

  return null;
}

// ------------------------------------------------------------
// PREVIOUS / NEXT MATCH EXTRACTION
// ------------------------------------------------------------

function extractPreviousMatches(teamEntry, kickoffTs) {
  const rawMatches = extractTeamMatchList(teamEntry);
  const timestamps = [];

  for (const match of rawMatches) {
    const ts = extractMatchTimestamp(match);
    if (!Number.isFinite(ts)) continue;
    if (ts >= kickoffTs) continue;
    timestamps.push(ts);
  }

  timestamps.sort((a, b) => b - a);

  return {
    lastMatchTs: timestamps[0] || null,
    matchTimestamps: timestamps
  };
}

function extractTeamMatchList(teamEntry) {
  if (!teamEntry || typeof teamEntry !== "object") return [];

  const candidates = [
    teamEntry.matches,
    teamEntry.history,
    teamEntry.fixtures,
    teamEntry.rows,
    teamEntry.events,
    teamEntry.recentMatches,
    teamEntry.matchHistory,
    teamEntry.formMatches
  ];

  for (const item of candidates) {
    if (Array.isArray(item)) return item;
  }

  if (Array.isArray(teamEntry.lastMatches)) return teamEntry.lastMatches;

  if (isObject(teamEntry.matchesById)) return Object.values(teamEntry.matchesById);

  return [];
}

function findNextScheduledMatch(fixtures, {
  teamName,
  leagueSlug,
  kickoffTs,
  excludeFixtureId
}) {
  const target = normalizeName(teamName);
  let best = null;

  for (const fixture of Array.isArray(fixtures) ? fixtures : []) {
    if (!fixture || fixture.id === excludeFixtureId) continue;

    const ts = getFixtureKickoffTs(fixture);
    if (!Number.isFinite(ts) || ts <= kickoffTs) continue;

    const status = String(fixture.status || "").toUpperCase();
    if (status === "FT" || status.includes("FINAL")) continue;

    const home = normalizeName(getHomeTeamName(fixture));
    const away = normalizeName(getAwayTeamName(fixture));

    if (home !== target && away !== target) continue;

    if (
      leagueSlug &&
      fixture.leagueSlug &&
      String(fixture.leagueSlug).toLowerCase() !== String(leagueSlug).toLowerCase()
    ) {
      // do not hard reject cross-competition future matches
    }

    if (!best || ts < best.kickoffTs) {
      best = { fixture, kickoffTs: ts };
    }
  }

  return best;
}

// ------------------------------------------------------------
// PRESSURE / STRENGTH
// ------------------------------------------------------------

function computeTablePressureBoost(contextMeta, config) {
  let home = 0;
  let away = 0;
  let draw = 0;

  const homePos = toNumber(contextMeta.homeTablePos, null);
  const awayPos = toNumber(contextMeta.awayTablePos, null);

  if (Number.isFinite(homePos)) {
    if (homePos <= 3) home += config.motivation.titlePressureBoost;
    if (homePos >= 16) home += config.motivation.relegationPressureBoost;
  }

  if (Number.isFinite(awayPos)) {
    if (awayPos <= 3) away += config.motivation.titlePressureBoost;
    if (awayPos >= 16) away += config.motivation.relegationPressureBoost;
  }

  if (Number.isFinite(homePos) && Number.isFinite(awayPos)) {
    const diff = Math.abs(homePos - awayPos);
    if (diff <= 2) {
      draw += 0.008;
    }
  }

  if (contextMeta.seasonProgress >= 0.82) {
    const lateBoost = config.motivation.lateSeasonBoost;
    home += lateBoost * 0.4;
    away += lateBoost * 0.4;
  }

  return {
    home,
    away,
    draw
  };
}

function extractStrengthProxy(teamEntry) {
  if (!teamEntry || typeof teamEntry !== "object") return 0.5;

  const direct = [
    teamEntry.strength,
    teamEntry.power,
    teamEntry.rating,
    teamEntry.formScore,
    teamEntry.pointsPerGame,
    teamEntry.ppg,
    teamEntry.winRate
  ]
    .map(v => toNumber(v, null))
    .find(v => Number.isFinite(v));

  if (Number.isFinite(direct)) {
    if (direct > 1) {
      return clamp(direct / 3, 0, 1);
    }
    return clamp(direct, 0, 1);
  }

  const matches = extractTeamMatchList(teamEntry);
  if (!matches.length) return 0.5;

  let points = 0;
  let counted = 0;

  for (const m of matches.slice(0, 8)) {
    const gf = toNumber(m.goalsFor ?? m.gf ?? m.scoreFor ?? m.teamGoals, null);
    const ga = toNumber(m.goalsAgainst ?? m.ga ?? m.scoreAgainst ?? m.oppGoals, null);
    if (!Number.isFinite(gf) || !Number.isFinite(ga)) continue;

    counted += 1;
    if (gf > ga) points += 3;
    else if (gf === ga) points += 1;
  }

  if (!counted) return 0.5;
  return clamp(points / (counted * 3), 0, 1);
}

function extractTablePosition(teamEntry) {
  if (!teamEntry || typeof teamEntry !== "object") return null;

  const values = [
    teamEntry.position,
    teamEntry.tablePosition,
    teamEntry.rank,
    teamEntry.place
  ];

  for (const value of values) {
    const n = toNumber(value, null);
    if (Number.isFinite(n)) return n;
  }

  return null;
}

// ------------------------------------------------------------
// PENALTIES / WINDOWS
// ------------------------------------------------------------

function computeRestPenalty(restDays, cfg) {
  if (!Number.isFinite(restDays)) return 0;
  if (restDays <= 2) return cfg.rest2DaysPenalty;
  if (restDays <= 3) return cfg.rest3DaysPenalty;
  if (restDays <= 4) return cfg.rest4DaysPenalty;
  return 0;
}

function computeCongestionPenalty({ matchesLast7, matchesLast14, config }) {
  let penalty = 0;

  if (matchesLast7 >= config.last7Threshold) {
    penalty += config.last7Penalty;
  }

  if (matchesLast14 >= config.last14Threshold) {
    penalty += config.last14Penalty;
  }

  return penalty;
}

function computeLookAheadPenalty(nextMatchInDays, cfg) {
  if (!Number.isFinite(nextMatchInDays)) return 0;
  if (nextMatchInDays <= 2) return cfg.next2DaysPenalty;
  if (nextMatchInDays <= 3) return cfg.next3DaysPenalty;
  if (nextMatchInDays <= 4) return cfg.next4DaysPenalty;
  return 0;
}

function countMatchesInWindow(timestamps, referenceTs, days) {
  if (!Array.isArray(timestamps) || !Number.isFinite(referenceTs)) return 0;
  const windowMs = days * 86400000;

  let count = 0;
  for (const ts of timestamps) {
    if (!Number.isFinite(ts)) continue;
    const diff = referenceTs - ts;
    if (diff >= 0 && diff <= windowMs) count += 1;
  }
  return count;
}

function computeRestDays(fromTs, toTs) {
  if (!Number.isFinite(fromTs) || !Number.isFinite(toTs) || toTs <= fromTs) {
    return null;
  }
  return Math.floor((toTs - fromTs) / 86400000);
}

// ------------------------------------------------------------
// FIXTURE HELPERS
// ------------------------------------------------------------

function getHomeTeamName(fixture) {
  return (
    fixture.homeTeam ||
    fixture.home ||
    fixture.homeName ||
    fixture.teams?.home ||
    fixture.participants?.home ||
    ""
  );
}

function getAwayTeamName(fixture) {
  return (
    fixture.awayTeam ||
    fixture.away ||
    fixture.awayName ||
    fixture.teams?.away ||
    fixture.participants?.away ||
    ""
  );
}

function getFixtureKickoffTs(fixture) {
  const values = [
    fixture.kickoffTs,
    fixture.kickoff,
    fixture.startTime,
    fixture.date,
    fixture.ts
  ];

  for (const value of values) {
    const ts = parseTs(value);
    if (Number.isFinite(ts)) return ts;
  }

  return Date.now();
}

function extractMatchTimestamp(match) {
  if (!match || typeof match !== "object") return null;

  const values = [
    match.kickoffTs,
    match.kickoff,
    match.startTime,
    match.date,
    match.ts,
    match.playedAt,
    match.dayKey
  ];

  for (const value of values) {
    const ts = parseTs(value);
    if (Number.isFinite(ts)) return ts;
  }

  return null;
}

function inferCompetitionType(fixture) {
  const raw = `${fixture.leagueSlug || ""} ${fixture.leagueName || ""} ${fixture.competitionType || ""}`.toLowerCase();

  if (
    raw.includes("cup") ||
    raw.includes("copa") ||
    raw.includes("pokal") ||
    raw.includes("coppa") ||
    raw.includes("trophy")
  ) {
    return "cup";
  }

  if (
    raw.includes("champions") ||
    raw.includes("europa") ||
    raw.includes("conference") ||
    raw.includes("continental") ||
    raw.includes("uefa")
  ) {
    return "continental";
  }

  return "league";
}

function inferPhase(fixture) {
  const raw = `${fixture.phase || ""} ${fixture.leagueName || ""}`.toLowerCase();

  if (raw.includes("playoff") || raw.includes("play-off")) return "playoff";
  if (raw.includes("relegation")) return "relegation";
  if (raw.includes("promotion")) return "promotion";
  if (raw.includes("group")) return "group";
  if (raw.includes("knockout")) return "knockout";

  return "regular";
}

function resolveSeason(fixture) {
  if (fixture?.season) return String(fixture.season);

  const ts = getFixtureKickoffTs(fixture);
  const d = new Date(ts);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;

  if (month >= 7) {
    return `${year}-${year + 1}`;
  }
  return `${year - 1}-${year}`;
}

function computeSeasonProgress(season, kickoffTs) {
  const parsed = parseSeason(season);
  if (!parsed || !Number.isFinite(kickoffTs)) return 0.5;

  const seasonStart = Date.UTC(parsed.startYear, 6, 1, 0, 0, 0, 0); // Jul 1
  const seasonEnd = Date.UTC(parsed.endYear, 5, 30, 23, 59, 59, 999); // Jun 30

  if (kickoffTs <= seasonStart) return 0;
  if (kickoffTs >= seasonEnd) return 1;

  return clamp((kickoffTs - seasonStart) / (seasonEnd - seasonStart), 0, 1);
}

// ------------------------------------------------------------
// NORMALIZATION / NUMBERS
// ------------------------------------------------------------

function normalizeThreeWay(home, draw, away) {
  home = Math.max(0.000001, home);
  draw = Math.max(0.000001, draw);
  away = Math.max(0.000001, away);

  const sum = home + draw + away;

  return {
    home: home / sum,
    draw: draw / sum,
    away: away / sum
  };
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(fc|cf|sc|afc|ac|cd|fk|sv|club|deportivo|athletic|atletico)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function computeTokenSimilarity(a, b) {
  const ta = new Set(normalizeName(a).split(" ").filter(Boolean));
  const tb = new Set(normalizeName(b).split(" ").filter(Boolean));

  if (!ta.size || !tb.size) return 0;

  let common = 0;
  for (const token of ta) {
    if (tb.has(token)) common += 1;
  }

  const denom = Math.max(ta.size, tb.size);
  return common / denom;
}

function parseTs(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }

  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return Date.parse(`${trimmed}T00:00:00Z`);
  }

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSeason(season) {
  const m = String(season || "").match(/^(\d{4})-(\d{4})$/);
  if (!m) return null;

  return {
    startYear: Number(m[1]),
    endYear: Number(m[2])
  };
}

function getTrustCeiling(leagueTrust, cfg) {
  const trust = String(leagueTrust || "medium").toLowerCase();

  if (trust === "high" || trust === "top") return cfg.highTrustCeiling;
  if (trust === "low") return cfg.lowTrustCeiling;
  return cfg.mediumTrustCeiling;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function round6(value) {
  return Math.round((Number(value) + Number.EPSILON) * 1e6) / 1e6;
}

function safeLabel(value) {
  return Number.isFinite(value) ? String(value) : "unknown";
}

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function mergeConfig(base, extra) {
  const out = structuredCloneSafe(base);

  if (!isObject(extra)) return out;

  for (const [key, value] of Object.entries(extra)) {
    if (isObject(value) && isObject(out[key])) {
      out[key] = mergeConfig(out[key], value);
    } else {
      out[key] = value;
    }
  }

  return out;
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}