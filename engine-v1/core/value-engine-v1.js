// ============================================================
// VALUE ENGINE V1 — PURE STATISTICAL VALUE (NO ODDS)
// engine-v1/core/value-engine-v1.js
// ============================================================

import fs from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.resolve("data");
const HISTORY_INDEX_DIR = path.join(DATA_DIR, "history-index");

const DEFAULT_SEASON = "2025-2026";

// ------------------------------------------------------------
// FORM RULES
// ------------------------------------------------------------
const FORM_WINDOW = 5;
const FORM_MAX_AGE_DAYS = 35;
const FORM_FULL_STRENGTH_DAYS = 7;
const FORM_DECAY_START_DAYS = 8;
const FORM_HEAVY_DECAY_DAYS = 14;
const FORM_BREAKDOWN_DAYS = 21;

const BASE_WEIGHTS = Object.freeze({
  form: 0.5,
  homeAway: 0.2,
  goals: 0.2,
  matchup: 0.1
});

const BOUNDS = Object.freeze({
  minConfidence: 0.35,
  maxConfidence: 0.95
});

// ------------------------------------------------------------
// FILE HELPERS
// ------------------------------------------------------------
async function readJsonSafe(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function clamp(value, min = 0, max = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function round(value, digits = 3) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function avg(arr) {
  const nums = arr.map(v => Number(v)).filter(Number.isFinite);
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function ratio(part, total, fallback = 0) {
  const p = Number(part);
  const t = Number(total);
  if (!Number.isFinite(p) || !Number.isFinite(t) || t <= 0) return fallback;
  return p / t;
}

function pickFirstDefined(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

function parseDateSafe(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function daysBetween(later, earlier) {
  if (!(later instanceof Date) || !(earlier instanceof Date)) return null;
  const diff = later.getTime() - earlier.getTime();
  return Math.floor(diff / 86400000);
}

// ------------------------------------------------------------
// INDEX LOADING
// ------------------------------------------------------------
export async function loadValueIndexes(season = DEFAULT_SEASON) {
  const teamFormPath = path.join(HISTORY_INDEX_DIR, "team-form", `${season}.json`);
  const leagueFormPath = path.join(HISTORY_INDEX_DIR, "league-form", `${season}.json`);
  const matchupsPath = path.join(HISTORY_INDEX_DIR, "matchups", `${season}.json`);

  const [teamForm, leagueForm, matchups] = await Promise.all([
    readJsonSafe(teamFormPath, {}),
    readJsonSafe(leagueFormPath, {}),
    readJsonSafe(matchupsPath, {})
  ]);

  return {
    season,
    teamForm: teamForm || {},
    leagueForm: leagueForm || {},
    matchups: matchups || {}
  };
}

// ------------------------------------------------------------
// KEY RESOLUTION
// ------------------------------------------------------------
function resolveTeamEntry(teamFormIndex, leagueSlug, teamName) {
  const directLeague = teamFormIndex?.[leagueSlug];
  const normalizedTeam = normalizeName(teamName);

  if (directLeague && typeof directLeague === "object") {
    for (const [key, value] of Object.entries(directLeague)) {
      if (normalizeName(key) === normalizedTeam) {
        return { key, value, leagueKey: leagueSlug };
      }
    }
  }

  for (const [leagueKey, teams] of Object.entries(teamFormIndex || {})) {
    if (!teams || typeof teams !== "object") continue;
    for (const [teamKey, value] of Object.entries(teams)) {
      if (normalizeName(teamKey) === normalizedTeam) {
        return { key: teamKey, value, leagueKey };
      }
    }
  }

  return { key: teamName, value: null, leagueKey: leagueSlug };
}

function resolveLeagueEntry(leagueFormIndex, leagueSlug) {
  if (leagueFormIndex?.[leagueSlug]) {
    return { key: leagueSlug, value: leagueFormIndex[leagueSlug] };
  }

  for (const [key, value] of Object.entries(leagueFormIndex || {})) {
    if (normalizeName(key) === normalizeName(leagueSlug)) {
      return { key, value };
    }
  }

  return { key: leagueSlug, value: null };
}

function buildMatchupCandidateKeys(homeTeam, awayTeam, leagueSlug = "") {
  const h = normalizeName(homeTeam);
  const a = normalizeName(awayTeam);
  const l = normalizeName(leagueSlug);

  return [
    `${l}|${h}|${a}`,
    `${l}|${a}|${h}`,
    `${h}|${a}`,
    `${a}|${h}`
  ];
}

function resolveMatchupEntry(matchupsIndex, homeTeam, awayTeam, leagueSlug = "") {
  const candidates = buildMatchupCandidateKeys(homeTeam, awayTeam, leagueSlug);

  for (const key of candidates) {
    if (matchupsIndex?.[key]) {
      return { key, value: matchupsIndex[key] };
    }
  }

  for (const [key, value] of Object.entries(matchupsIndex || {})) {
    const normalizedKey = normalizeName(key).replace(/\s+/g, "");
    for (const candidate of candidates) {
      if (normalizedKey === candidate.replace(/\s+/g, "")) {
        return { key, value };
      }
    }
  }

  return { key: candidates[0], value: null };
}

// ------------------------------------------------------------
// EXTRACTION HELPERS
// ------------------------------------------------------------
function extractRecentMatches(teamEntry) {
  const entry = teamEntry || {};

  return safeArray(
    pickFirstDefined(
      entry.lastMatches,
      entry.recentMatches,
      entry.matches,
      entry.form,
      entry.history
    )
  );
}

function extractNumeric(entry, keys, fallback = 0) {
  for (const key of keys) {
    const val = entry?.[key];
    if (Number.isFinite(Number(val))) return Number(val);
  }
  return fallback;
}

function extractOutcomePoints(match, teamName) {
  const explicit = pickFirstDefined(match?.points, match?.teamPoints);
  if (Number.isFinite(Number(explicit))) return Number(explicit);

  const result = String(
    pickFirstDefined(match?.result, match?.outcome, match?.teamResult, "")
  ).toUpperCase();

  if (result === "W" || result === "WIN") return 3;
  if (result === "D" || result === "DRAW") return 1;
  if (result === "L" || result === "LOSS") return 0;

  const team = normalizeName(teamName);
  const home = normalizeName(pickFirstDefined(match?.homeTeam, match?.home, ""));
  const away = normalizeName(pickFirstDefined(match?.awayTeam, match?.away, ""));
  const scoreHome = toNumber(match?.scoreHome, NaN);
  const scoreAway = toNumber(match?.scoreAway, NaN);

  if (!Number.isFinite(scoreHome) || !Number.isFinite(scoreAway)) return 0;

  if (scoreHome === scoreAway) return 1;

  if (team && team === home) return scoreHome > scoreAway ? 3 : 0;
  if (team && team === away) return scoreAway > scoreHome ? 3 : 0;

  return 0;
}

function extractGoalsForAgainst(match, teamName) {
  const explicitFor = pickFirstDefined(
    match?.goalsFor,
    match?.gf,
    match?.teamGoals
  );
  const explicitAgainst = pickFirstDefined(
    match?.goalsAgainst,
    match?.ga,
    match?.opponentGoals
  );

  if (
    Number.isFinite(Number(explicitFor)) &&
    Number.isFinite(Number(explicitAgainst))
  ) {
    return {
      gf: Number(explicitFor),
      ga: Number(explicitAgainst)
    };
  }

  const scoreHome = toNumber(match?.scoreHome, NaN);
  const scoreAway = toNumber(match?.scoreAway, NaN);
  const team = normalizeName(teamName);
  const home = normalizeName(pickFirstDefined(match?.homeTeam, match?.home, ""));
  const away = normalizeName(pickFirstDefined(match?.awayTeam, match?.away, ""));

  if (!Number.isFinite(scoreHome) || !Number.isFinite(scoreAway)) {
    return { gf: 0, ga: 0 };
  }

  if (team && team === home) return { gf: scoreHome, ga: scoreAway };
  if (team && team === away) return { gf: scoreAway, ga: scoreHome };

  return { gf: 0, ga: 0 };
}

function isHomeMatch(match, teamName) {
  const team = normalizeName(teamName);
  const home = normalizeName(pickFirstDefined(match?.homeTeam, match?.home, ""));
  return !!team && !!home && team === home;
}

function isAwayMatch(match, teamName) {
  const team = normalizeName(teamName);
  const away = normalizeName(pickFirstDefined(match?.awayTeam, match?.away, ""));
  return !!team && !!away && team === away;
}

function isOver25Match(match) {
  const explicit = pickFirstDefined(match?.over25, match?.isOver25);
  if (typeof explicit === "boolean") return explicit;

  const totalGoals = toNumber(match?.scoreHome, 0) + toNumber(match?.scoreAway, 0);
  return totalGoals > 2.5;
}

function isBTTSMatch(match) {
  const explicit = pickFirstDefined(match?.btts, match?.isBTTS);
  if (typeof explicit === "boolean") return explicit;

  return toNumber(match?.scoreHome, 0) > 0 && toNumber(match?.scoreAway, 0) > 0;
}

function extractMatchSeason(match, fallbackSeason) {
  return String(
    pickFirstDefined(match?.season, match?.seasonKey, fallbackSeason || "")
  ).trim();
}

function extractMatchDate(match) {
  return parseDateSafe(
    pickFirstDefined(
      match?.kickoff,
      match?.date,
      match?.playedAt,
      match?.ts,
      match?.dayKey
    )
  );
}

// ------------------------------------------------------------
// FORM RECENCY / CONTINUITY
// ------------------------------------------------------------
function computeFreshnessScore(daysSinceLastMatch) {
  if (!Number.isFinite(daysSinceLastMatch)) return 0.2;

  if (daysSinceLastMatch <= FORM_FULL_STRENGTH_DAYS) return 1.0;
  if (daysSinceLastMatch <= FORM_DECAY_START_DAYS) return 0.9;
  if (daysSinceLastMatch <= FORM_HEAVY_DECAY_DAYS) {
    return 0.7 - ((daysSinceLastMatch - FORM_DECAY_START_DAYS) * 0.05);
  }
  if (daysSinceLastMatch <= FORM_BREAKDOWN_DAYS) {
    return 0.4 - ((daysSinceLastMatch - FORM_HEAVY_DECAY_DAYS) * 0.035);
  }

  return 0.08;
}

function computeContinuityScore(selectedMatches, fixtureDate) {
  if (!selectedMatches.length || !(fixtureDate instanceof Date)) return 0.2;

  const dated = selectedMatches
    .map(m => ({ match: m, date: extractMatchDate(m) }))
    .filter(x => x.date instanceof Date)
    .sort((a, b) => b.date - a.date);

  if (!dated.length) return 0.2;

  const mostRecent = dated[0].date;
  const oldest = dated[dated.length - 1].date;

  const daysSinceLastMatch = daysBetween(fixtureDate, mostRecent);
  const spanDays = daysBetween(mostRecent, oldest) || 0;

  let maxInternalGap = 0;
  for (let i = 0; i < dated.length - 1; i += 1) {
    const gap = daysBetween(dated[i].date, dated[i + 1].date);
    if (Number.isFinite(gap) && gap > maxInternalGap) {
      maxInternalGap = gap;
    }
  }

  let score = 1.0;

  if (Number.isFinite(daysSinceLastMatch)) {
    if (daysSinceLastMatch > 10) score -= 0.15;
    if (daysSinceLastMatch > 14) score -= 0.2;
    if (daysSinceLastMatch > 21) score -= 0.3;
  }

  if (spanDays > 21) score -= 0.15;
  if (spanDays > 28) score -= 0.2;
  if (spanDays > 35) score -= 0.25;

  if (maxInternalGap > 10) score -= 0.15;
  if (maxInternalGap > 14) score -= 0.2;
  if (maxInternalGap > 21) score -= 0.25;

  return clamp(score, 0.1, 1);
}

function computeEffectiveFormWeight(baseWeight, freshnessScore, continuityScore, sampleSize) {
  const sampleFactor = clamp(sampleSize / FORM_WINDOW, 0.25, 1);
  return clamp(baseWeight * freshnessScore * continuityScore * sampleFactor, 0.02, baseWeight);
}

function selectValidFormMatches(matches, teamName, side, season, fixtureDate, window = FORM_WINDOW) {
  let filtered = safeArray(matches);

  if (side === "home") {
    filtered = filtered.filter(m => isHomeMatch(m, teamName));
  } else if (side === "away") {
    filtered = filtered.filter(m => isAwayMatch(m, teamName));
  }

  filtered = filtered
    .filter(match => extractMatchSeason(match, season) === season)
    .map(match => {
      const matchDate = extractMatchDate(match);
      return { match, matchDate };
    })
    .filter(x => x.matchDate instanceof Date)
    .filter(x => {
      const diff = daysBetween(fixtureDate, x.matchDate);
      return Number.isFinite(diff) && diff >= 0 && diff <= FORM_MAX_AGE_DAYS;
    })
    .sort((a, b) => b.matchDate - a.matchDate)
    .slice(0, window);

  const selected = filtered.map(x => x.match);
  const dated = filtered.map(x => x.matchDate);

  const mostRecent = dated[0] || null;
  const oldest = dated[dated.length - 1] || null;

  const daysSinceLastMatch =
    mostRecent instanceof Date ? daysBetween(fixtureDate, mostRecent) : null;

  const spanDays =
    mostRecent instanceof Date && oldest instanceof Date
      ? daysBetween(mostRecent, oldest)
      : null;

  const freshnessScore = computeFreshnessScore(daysSinceLastMatch);
  const continuityScore = computeContinuityScore(selected, fixtureDate);

  return {
    selected,
    sample: selected.length,
    daysSinceLastMatch,
    spanDays,
    freshnessScore,
    continuityScore
  };
}

// ------------------------------------------------------------
// TEAM METRICS
// ------------------------------------------------------------
function computeTeamMetricsFromSelection(teamName, selection) {
  const recent = safeArray(selection?.selected);

  if (!recent.length) {
    return {
      sample: 0,
      ppg: 0,
      winRate: 0,
      drawRate: 0,
      lossRate: 0,
      gfAvg: 0,
      gaAvg: 0,
      over25Rate: 0,
      bttsRate: 0,
      daysSinceLastMatch: null,
      spanDays: null,
      freshnessScore: 0.2,
      continuityScore: 0.2
    };
  }

  let points = 0;
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let gf = 0;
  let ga = 0;
  let over25 = 0;
  let btts = 0;

  for (const match of recent) {
    const pts = extractOutcomePoints(match, teamName);
    points += pts;

    if (pts === 3) wins += 1;
    else if (pts === 1) draws += 1;
    else losses += 1;

    const g = extractGoalsForAgainst(match, teamName);
    gf += g.gf;
    ga += g.ga;

    if (isOver25Match(match)) over25 += 1;
    if (isBTTSMatch(match)) btts += 1;
  }

  const total = recent.length;

  return {
    sample: total,
    ppg: points / total,
    winRate: wins / total,
    drawRate: draws / total,
    lossRate: losses / total,
    gfAvg: gf / total,
    gaAvg: ga / total,
    over25Rate: over25 / total,
    bttsRate: btts / total,
    daysSinceLastMatch: selection.daysSinceLastMatch,
    spanDays: selection.spanDays,
    freshnessScore: selection.freshnessScore,
    continuityScore: selection.continuityScore
  };
}

function computeTeamStrength(mainMetrics, leagueBaseline) {
  const leagueGoalsAvg = toNumber(leagueBaseline.goalsAvg, 2.4);
  const leagueDrawRate = toNumber(leagueBaseline.drawRate, 0.28);

  const ppgNorm = clamp(mainMetrics.ppg / 3, 0, 1);
  const winNorm = clamp(mainMetrics.winRate, 0, 1);
  const attackNorm = clamp(mainMetrics.gfAvg / Math.max(leagueGoalsAvg, 1), 0, 1);
  const defenseNorm = clamp(1 - (mainMetrics.gaAvg / Math.max(leagueGoalsAvg, 1.2)), 0, 1);
  const antiDrawNorm = clamp(1 - Math.abs(mainMetrics.drawRate - leagueDrawRate), 0, 1);

  const rawStrength =
    (ppgNorm * 0.4) +
    (winNorm * 0.2) +
    (attackNorm * 0.2) +
    (defenseNorm * 0.15) +
    (antiDrawNorm * 0.05);

  const temporalModifier =
    (mainMetrics.freshnessScore * 0.6) +
    (mainMetrics.continuityScore * 0.4);

  return clamp(rawStrength * temporalModifier, 0, 1);
}

function computeHomeAwayEdge(homeSideMetrics, awaySideMetrics, leagueBaseline) {
  const leagueHomeWinRate = toNumber(leagueBaseline.homeWinRate, 0.45);
  const leagueAwayWinRate = toNumber(leagueBaseline.awayWinRate, 0.28);

  const homeBase = clamp(
    (homeSideMetrics.ppg / 3) * 0.45 +
      homeSideMetrics.winRate * 0.35 +
      clamp(homeSideMetrics.gfAvg / Math.max(leagueBaseline.goalsAvg || 2.4, 1), 0, 1) * 0.2,
    0,
    1
  );

  const awayBasePenalty = clamp(
    (1 - (awaySideMetrics.ppg / 3)) * 0.3 +
      awaySideMetrics.lossRate * 0.35 +
      clamp(awaySideMetrics.gaAvg / Math.max(leagueBaseline.goalsAvg || 2.4, 1.2), 0, 1) * 0.2 +
      clamp(leagueHomeWinRate - leagueAwayWinRate, 0, 1) * 0.15,
    0,
    1
  );

  const homeTemporal =
    (homeSideMetrics.freshnessScore * 0.55) +
    (homeSideMetrics.continuityScore * 0.45);

  const awayTemporal =
    (awaySideMetrics.freshnessScore * 0.55) +
    (awaySideMetrics.continuityScore * 0.45);

  const homeBoost = clamp(homeBase * homeTemporal, 0, 1);
  const awayPenalty = clamp(awayBasePenalty * awayTemporal, 0, 1);

  return {
    homeBoost,
    awayPenalty,
    edgeScore: clamp((homeBoost * 0.6) + (awayPenalty * 0.4), 0, 1)
  };
}

function computeGoalsProfile(homeMetrics, awayMetrics, leagueBaseline) {
  const leagueGoalsAvg = toNumber(leagueBaseline.goalsAvg, 2.4);
  const leagueOver25Rate = toNumber(leagueBaseline.over25Rate, 0.5);
  const leagueBTTSRate = toNumber(leagueBaseline.bttsRate, 0.48);

  const expectedHomeGoals = (homeMetrics.gfAvg + awayMetrics.gaAvg) / 2;
  const expectedAwayGoals = (awayMetrics.gfAvg + homeMetrics.gaAvg) / 2;
  const expectedTotalGoals = expectedHomeGoals + expectedAwayGoals;

  const totalGoalsNorm = clamp(
    expectedTotalGoals / Math.max(leagueGoalsAvg + 0.4, 1.5),
    0,
    1
  );

  const temporalBlend =
    avg([
      homeMetrics.freshnessScore,
      awayMetrics.freshnessScore,
      homeMetrics.continuityScore,
      awayMetrics.continuityScore
    ]) || 0.35;

  const over25Core = clamp(
    totalGoalsNorm * 0.45 +
      avg([homeMetrics.over25Rate, awayMetrics.over25Rate]) * 0.35 +
      leagueOver25Rate * 0.2,
    0,
    1
  );

  const bttsCore = clamp(
    avg([homeMetrics.bttsRate, awayMetrics.bttsRate]) * 0.45 +
      clamp((Math.min(homeMetrics.gfAvg, 3) / 3), 0, 1) * 0.15 +
      clamp((Math.min(awayMetrics.gfAvg, 3) / 3), 0, 1) * 0.15 +
      clamp(1 - (Math.abs(homeMetrics.gaAvg - awayMetrics.gaAvg) / 3), 0, 1) * 0.1 +
      leagueBTTSRate * 0.15,
    0,
    1
  );

  // goals profile κρατά μέρος του league baseline ακόμα και όταν το recent signal ξεφτίζει
  const over25Score = clamp((over25Core * (0.65 + temporalBlend * 0.35)), 0, 1);
  const bttsScore = clamp((bttsCore * (0.65 + temporalBlend * 0.35)), 0, 1);

  return {
    expectedHomeGoals: round(expectedHomeGoals, 3),
    expectedAwayGoals: round(expectedAwayGoals, 3),
    expectedTotalGoals: round(expectedTotalGoals, 3),
    over25Score,
    bttsScore
  };
}

function computeMatchupBias(matchupEntry, homeTeam, awayTeam, season, fixtureDate) {
  const entry = matchupEntry || {};
  const matches = safeArray(
    pickFirstDefined(
      entry.lastMatches,
      entry.matches,
      entry.history,
      entry.meetings
    )
  )
    .filter(match => extractMatchSeason(match, season) === season)
    .map(match => ({ match, date: extractMatchDate(match) }))
    .filter(x => x.date instanceof Date)
    .filter(x => {
      const diff = daysBetween(fixtureDate, x.date);
      return Number.isFinite(diff) && diff >= 0 && diff <= FORM_MAX_AGE_DAYS;
    })
    .sort((a, b) => b.date - a.date)
    .slice(0, FORM_WINDOW)
    .map(x => x.match);

  if (!matches.length) {
    return {
      sample: 0,
      homeBias: 0.5,
      drawBias: 0.5,
      awayBias: 0.5,
      over25Bias: 0.5,
      bttsBias: 0.5
    };
  }

  let homeWins = 0;
  let awayWins = 0;
  let draws = 0;
  let over25 = 0;
  let btts = 0;

  const homeNorm = normalizeName(homeTeam);
  const awayNorm = normalizeName(awayTeam);

  for (const match of matches) {
    const home = normalizeName(pickFirstDefined(match?.homeTeam, match?.home, ""));
    const away = normalizeName(pickFirstDefined(match?.awayTeam, match?.away, ""));
    const scoreHome = toNumber(match?.scoreHome, NaN);
    const scoreAway = toNumber(match?.scoreAway, NaN);

    if (Number.isFinite(scoreHome) && Number.isFinite(scoreAway)) {
      const isSameOrientation = home === homeNorm && away === awayNorm;
      const isReverseOrientation = home === awayNorm && away === homeNorm;

      if (scoreHome === scoreAway) {
        draws += 1;
      } else if (isSameOrientation) {
        if (scoreHome > scoreAway) homeWins += 1;
        else awayWins += 1;
      } else if (isReverseOrientation) {
        if (scoreHome > scoreAway) awayWins += 1;
        else homeWins += 1;
      }
    }

    if (isOver25Match(match)) over25 += 1;
    if (isBTTSMatch(match)) btts += 1;
  }

  const total = matches.length;

  return {
    sample: total,
    homeBias: ratio(homeWins, total, 0.5),
    drawBias: ratio(draws, total, 0.5),
    awayBias: ratio(awayWins, total, 0.5),
    over25Bias: ratio(over25, total, 0.5),
    bttsBias: ratio(btts, total, 0.5)
  };
}

function computeLeagueBaseline(leagueEntry) {
  const entry = leagueEntry || {};

  const goalsAvg = extractNumeric(entry, [
    "goalsAvg",
    "avgGoals",
    "averageGoals",
    "goalsPerMatch"
  ], 2.4);

  const drawRate = extractNumeric(entry, [
    "drawRate",
    "drawPct",
    "drawPercentage"
  ], 0.28);

  const homeWinRate = extractNumeric(entry, [
    "homeWinRate",
    "homeWinPct",
    "homePct"
  ], 0.45);

  const awayWinRate = extractNumeric(entry, [
    "awayWinRate",
    "awayWinPct",
    "awayPct"
  ], 0.27);

  const over25Rate = extractNumeric(entry, [
    "over25Rate",
    "over2_5Rate",
    "o25Rate"
  ], 0.5);

  const bttsRate = extractNumeric(entry, [
    "bttsRate",
    "bothTeamsToScoreRate"
  ], 0.48);

  return {
    goalsAvg,
    drawRate,
    homeWinRate,
    awayWinRate,
    over25Rate,
    bttsRate
  };
}

// ------------------------------------------------------------
// OUTCOME MODEL
// ------------------------------------------------------------
function computeDynamicWeights({
  homeMetrics,
  awayMetrics,
  homeSideMetrics,
  awaySideMetrics
}) {
  const homeOverallFormWeight = computeEffectiveFormWeight(
    BASE_WEIGHTS.form,
    homeMetrics.freshnessScore,
    homeMetrics.continuityScore,
    homeMetrics.sample
  );

  const awayOverallFormWeight = computeEffectiveFormWeight(
    BASE_WEIGHTS.form,
    awayMetrics.freshnessScore,
    awayMetrics.continuityScore,
    awayMetrics.sample
  );

  const homeSideFormWeight = computeEffectiveFormWeight(
    BASE_WEIGHTS.homeAway,
    homeSideMetrics.freshnessScore,
    homeSideMetrics.continuityScore,
    homeSideMetrics.sample
  );

  const awaySideFormWeight = computeEffectiveFormWeight(
    BASE_WEIGHTS.homeAway,
    awaySideMetrics.freshnessScore,
    awaySideMetrics.continuityScore,
    awaySideMetrics.sample
  );

  return {
    homeOverallFormWeight,
    awayOverallFormWeight,
    homeSideFormWeight,
    awaySideFormWeight,
    homeAverageTemporal:
      avg([homeMetrics.freshnessScore, homeMetrics.continuityScore]) || 0.25,
    awayAverageTemporal:
      avg([awayMetrics.freshnessScore, awayMetrics.continuityScore]) || 0.25
  };
}

function computeOutcomeScores({
  homeStrength,
  awayStrength,
  homeAwayEdge,
  matchupBias,
  leagueBaseline,
  dynamicWeights
}) {
  const homeFormWeight = dynamicWeights.homeOverallFormWeight;
  const awayFormWeight = dynamicWeights.awayOverallFormWeight;
  const homeSideWeight = dynamicWeights.homeSideFormWeight;
  const awaySideWeight = dynamicWeights.awaySideFormWeight;

  const leagueHomeBoost = clamp((leagueBaseline.homeWinRate / 0.65), 0, 1) * 0.08;
  const leagueAwayBoost = clamp((leagueBaseline.awayWinRate / 0.5), 0, 1) * 0.08;

  const matchupWeight = BASE_WEIGHTS.matchup;
  const leagueDrawBase = leagueBaseline.drawRate;

  const homeRaw =
    (homeStrength * homeFormWeight) +
    (homeAwayEdge.homeBoost * homeSideWeight) +
    (matchupBias.homeBias * matchupWeight) +
    leagueHomeBoost;

  const awayRaw =
    (awayStrength * awayFormWeight) +
    ((1 - homeAwayEdge.awayPenalty) * awaySideWeight) +
    (matchupBias.awayBias * matchupWeight) +
    leagueAwayBoost;

  const closeness = clamp(1 - Math.abs(homeRaw - awayRaw), 0, 1);

  const drawRaw = clamp(
    (leagueDrawBase * 0.5) +
      (closeness * 0.35) +
      (matchupBias.drawBias * 0.15),
    0.05,
    0.8
  );

  const total = homeRaw + awayRaw + drawRaw;

  let homeWinScore = ratio(homeRaw, total, 0.33);
  let drawScore = ratio(drawRaw, total, 0.33);
  let awayWinScore = ratio(awayRaw, total, 0.33);

  const sum = homeWinScore + drawScore + awayWinScore;
  if (sum > 0) {
    homeWinScore /= sum;
    drawScore /= sum;
    awayWinScore /= sum;
  }

  return {
    homeWinScore: clamp(homeWinScore, 0, 1),
    drawScore: clamp(drawScore, 0, 1),
    awayWinScore: clamp(awayWinScore, 0, 1)
  };
}

function computeConfidence({
  homeMetrics,
  awayMetrics,
  homeSideMetrics,
  awaySideMetrics,
  matchupBias
}) {
  const mainSample = clamp((homeMetrics.sample + awayMetrics.sample) / (FORM_WINDOW * 2), 0, 1);
  const sideSample = clamp((homeSideMetrics.sample + awaySideMetrics.sample) / (FORM_WINDOW * 2), 0, 1);
  const matchupSample = clamp(matchupBias.sample / FORM_WINDOW, 0, 1);

  const recencyQuality = avg([
    homeMetrics.freshnessScore,
    awayMetrics.freshnessScore,
    homeMetrics.continuityScore,
    awayMetrics.continuityScore
  ]) || 0.2;

  const stability =
    1 - clamp(Math.abs(homeMetrics.ppg - awayMetrics.ppg) / 3, 0, 1) * 0.35;

  const raw =
    (mainSample * 0.35) +
    (sideSample * 0.2) +
    (matchupSample * 0.1) +
    (recencyQuality * 0.2) +
    (stability * 0.15);

  return clamp(raw, BOUNDS.minConfidence, BOUNDS.maxConfidence);
}

function buildSignals({
  outcomeScores,
  goalsProfile,
  confidence,
  homeMetrics,
  awayMetrics,
  matchupBias,
  dynamicWeights
}) {
  const signals = [];

  if (outcomeScores.homeWinScore >= 0.5) {
    signals.push("home_edge_strong");
  } else if (outcomeScores.homeWinScore >= 0.42) {
    signals.push("home_edge");
  }

  if (outcomeScores.awayWinScore >= 0.42) {
    signals.push("away_edge");
  }

  if (outcomeScores.drawScore >= 0.3) {
    signals.push("draw_live");
  }

  if (goalsProfile.over25Score >= 0.62) {
    signals.push("over25_support");
  } else if (goalsProfile.over25Score <= 0.38) {
    signals.push("under25_lean");
  }

  if (goalsProfile.bttsScore >= 0.6) {
    signals.push("btts_support");
  } else if (goalsProfile.bttsScore <= 0.38) {
    signals.push("btts_no_lean");
  }

  if (confidence <= 0.5) {
    signals.push("confidence_moderate");
  }
  if (confidence <= 0.42) {
    signals.push("confidence_low_sample");
  }

  if (
    homeMetrics.daysSinceLastMatch !== null &&
    homeMetrics.daysSinceLastMatch > 14
  ) {
    signals.push("home_form_decay");
  }

  if (
    awayMetrics.daysSinceLastMatch !== null &&
    awayMetrics.daysSinceLastMatch > 14
  ) {
    signals.push("away_form_decay");
  }

  if (
    dynamicWeights.homeOverallFormWeight < 0.2 ||
    dynamicWeights.awayOverallFormWeight < 0.2
  ) {
    signals.push("form_influence_reduced");
  }

  if (homeMetrics.gfAvg >= 1.8 && awayMetrics.gfAvg >= 1.2) {
    signals.push("mutual_attack_profile");
  }

  if (homeMetrics.gaAvg <= 0.8 && awayMetrics.gaAvg <= 0.8) {
    signals.push("defensive_profile");
  }

  if (matchupBias.sample >= 3 && matchupBias.over25Bias >= 0.66) {
    signals.push("matchup_goals_history");
  }

  return signals;
}

// ------------------------------------------------------------
// PUBLIC EVALUATOR
// ------------------------------------------------------------
export async function evaluateMatchValue(input, opts = {}) {
  const season = String(opts.season || input?.season || DEFAULT_SEASON);
  const indexes = opts.indexes || await loadValueIndexes(season);

  const leagueSlug = String(input?.leagueSlug || input?.league || "").trim();
  const homeTeam = String(input?.homeTeam || input?.home || "").trim();
  const awayTeam = String(input?.awayTeam || input?.away || "").trim();

  if (!leagueSlug) {
    throw new Error("evaluateMatchValue: missing leagueSlug");
  }
  if (!homeTeam || !awayTeam) {
    throw new Error("evaluateMatchValue: missing homeTeam/awayTeam");
  }

  const fixtureDate = parseDateSafe(
    pickFirstDefined(input?.kickoff, input?.date, input?.dayKey)
  );

  if (!(fixtureDate instanceof Date)) {
    throw new Error("evaluateMatchValue: missing/invalid fixture date");
  }

  const homeResolved = resolveTeamEntry(indexes.teamForm, leagueSlug, homeTeam);
  const awayResolved = resolveTeamEntry(indexes.teamForm, leagueSlug, awayTeam);
  const leagueResolved = resolveLeagueEntry(indexes.leagueForm, leagueSlug);
  const matchupResolved = resolveMatchupEntry(indexes.matchups, homeTeam, awayTeam, leagueSlug);

  const leagueBaseline = computeLeagueBaseline(leagueResolved.value);

  const homeAllSelection = selectValidFormMatches(
    extractRecentMatches(homeResolved.value),
    homeTeam,
    "all",
    season,
    fixtureDate,
    FORM_WINDOW
  );

  const awayAllSelection = selectValidFormMatches(
    extractRecentMatches(awayResolved.value),
    awayTeam,
    "all",
    season,
    fixtureDate,
    FORM_WINDOW
  );

  const homeSideSelection = selectValidFormMatches(
    extractRecentMatches(homeResolved.value),
    homeTeam,
    "home",
    season,
    fixtureDate,
    FORM_WINDOW
  );

  const awaySideSelection = selectValidFormMatches(
    extractRecentMatches(awayResolved.value),
    awayTeam,
    "away",
    season,
    fixtureDate,
    FORM_WINDOW
  );

  const homeMetrics = computeTeamMetricsFromSelection(homeTeam, homeAllSelection);
  const awayMetrics = computeTeamMetricsFromSelection(awayTeam, awayAllSelection);

  const homeSideMetrics = computeTeamMetricsFromSelection(homeTeam, homeSideSelection);
  const awaySideMetrics = computeTeamMetricsFromSelection(awayTeam, awaySideSelection);

  const homeStrength = computeTeamStrength(homeMetrics, leagueBaseline);
  const awayStrength = computeTeamStrength(awayMetrics, leagueBaseline);

  const homeAwayEdge = computeHomeAwayEdge(homeSideMetrics, awaySideMetrics, leagueBaseline);
  const goalsProfile = computeGoalsProfile(homeMetrics, awayMetrics, leagueBaseline);

  const matchupBias = computeMatchupBias(
    matchupResolved.value,
    homeTeam,
    awayTeam,
    season,
    fixtureDate
  );

  const dynamicWeights = computeDynamicWeights({
    homeMetrics,
    awayMetrics,
    homeSideMetrics,
    awaySideMetrics
  });

  const outcomeScores = computeOutcomeScores({
    homeStrength,
    awayStrength,
    homeAwayEdge,
    matchupBias,
    leagueBaseline,
    dynamicWeights
  });

  const confidence = computeConfidence({
    homeMetrics,
    awayMetrics,
    homeSideMetrics,
    awaySideMetrics,
    matchupBias
  });

  const signals = buildSignals({
    outcomeScores,
    goalsProfile,
    confidence,
    homeMetrics,
    awayMetrics,
    matchupBias,
    dynamicWeights
  });

  return {
    season,
    leagueSlug,
    homeTeam,
    awayTeam,

    homeWinScore: round(outcomeScores.homeWinScore, 3),
    drawScore: round(outcomeScores.drawScore, 3),
    awayWinScore: round(outcomeScores.awayWinScore, 3),
    over25Score: round(goalsProfile.over25Score, 3),
    bttsScore: round(goalsProfile.bttsScore, 3),
    confidence: round(confidence, 3),

    signals,

    meta: {
      model: "value-engine-v1",
      mode: "statistical_only",
      formWindow: FORM_WINDOW,
      formRules: {
        sameSeasonOnly: true,
        maxAgeDays: FORM_MAX_AGE_DAYS,
        fullStrengthDays: FORM_FULL_STRENGTH_DAYS,
        decayStartDays: FORM_DECAY_START_DAYS,
        heavyDecayDays: FORM_HEAVY_DECAY_DAYS,
        breakdownDays: FORM_BREAKDOWN_DAYS
      },

      baseWeights: BASE_WEIGHTS,
      effectiveWeights: {
        homeOverallFormWeight: round(dynamicWeights.homeOverallFormWeight, 3),
        awayOverallFormWeight: round(dynamicWeights.awayOverallFormWeight, 3),
        homeSideFormWeight: round(dynamicWeights.homeSideFormWeight, 3),
        awaySideFormWeight: round(dynamicWeights.awaySideFormWeight, 3)
      },

      expectedHomeGoals: goalsProfile.expectedHomeGoals,
      expectedAwayGoals: goalsProfile.expectedAwayGoals,
      expectedTotalGoals: goalsProfile.expectedTotalGoals,

      homeStrength: round(homeStrength, 3),
      awayStrength: round(awayStrength, 3),
      homeEdge: round(homeAwayEdge.homeBoost, 3),
      awayPenalty: round(homeAwayEdge.awayPenalty, 3),

      recency: {
        homeOverall: {
          sample: homeMetrics.sample,
          daysSinceLastMatch: homeMetrics.daysSinceLastMatch,
          spanDays: homeMetrics.spanDays,
          freshnessScore: round(homeMetrics.freshnessScore, 3),
          continuityScore: round(homeMetrics.continuityScore, 3)
        },
        awayOverall: {
          sample: awayMetrics.sample,
          daysSinceLastMatch: awayMetrics.daysSinceLastMatch,
          spanDays: awayMetrics.spanDays,
          freshnessScore: round(awayMetrics.freshnessScore, 3),
          continuityScore: round(awayMetrics.continuityScore, 3)
        },
        homeSide: {
          sample: homeSideMetrics.sample,
          daysSinceLastMatch: homeSideMetrics.daysSinceLastMatch,
          spanDays: homeSideMetrics.spanDays,
          freshnessScore: round(homeSideMetrics.freshnessScore, 3),
          continuityScore: round(homeSideMetrics.continuityScore, 3)
        },
        awaySide: {
          sample: awaySideMetrics.sample,
          daysSinceLastMatch: awaySideMetrics.daysSinceLastMatch,
          spanDays: awaySideMetrics.spanDays,
          freshnessScore: round(awaySideMetrics.freshnessScore, 3),
          continuityScore: round(awaySideMetrics.continuityScore, 3)
        }
      },

      matchupSample: matchupBias.sample,

      sourceKeys: {
        homeTeamKey: homeResolved.key,
        awayTeamKey: awayResolved.key,
        leagueKey: leagueResolved.key,
        matchupKey: matchupResolved.key
      }
    }
  };
}

export default {
  loadValueIndexes,
  evaluateMatchValue
};