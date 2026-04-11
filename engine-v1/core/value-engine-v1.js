// ============================================================
// VALUE ENGINE V1 — PURE STATISTICAL VALUE (NO ODDS)
// engine-v1/core/value-engine-v1.js
// ============================================================

import fs from "node:fs/promises";
import path from "node:path";
import { resolveDataPath } from "../storage/data-root.js";
import { applyValueContextModifiers } from "./value-context-modifiers.js";
import { applyValueContextIntegration } from "./value-context-integration.js";

const DATA_DIR = resolveDataPath();
const HISTORY_INDEX_DIR = path.join(DATA_DIR, "history-index");

const DEFAULT_SEASON = "2025-2026";
const __indexesCache = new Map();
// ------------------------------------------------------------
// FORM RULES
// ------------------------------------------------------------
const FORM_WINDOW = 5;
const FORM_MAX_AGE_DAYS = 35;
const MIN_REQUIRED_RECENT_MATCHES = 3;
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

const GENERIC_CLUB_TOKENS = new Set([
  "fc",
  "cf",
  "sc",
  "afc",
  "ac",
  "bc",
  "cd",
  "fk",
  "sk",
  "nk",
  "sv",
  "if",
  "bk",
  "ik",
  "jk",
  "kc",
  "rc",
  "club",
  "clube",
  "deportivo",
  "futbol",
  "football",
  "soccer",
  "clubde",
  "clubdeportivo"
]);

const TOKEN_ALIASES = new Map([
  ["munchen", "munich"],
  ["muenchen", "munich"],
  ["koln", "cologne"],
  ["koeln", "cologne"],
  ["internazionale", "inter"],
  ["atletico", "atletico"],
  ["athletico", "atletico"],
  ["utd", "united"],
  ["st", "saint"],
  ["sg", "saintgermain"],
  ["psg", "parissaintgermain"]
]);

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

function renormalize1X2Scores(scores = {}) {
  const home = Number(scores.homeWinScore) || 0;
  const draw = Number(scores.drawScore) || 0;
  const away = Number(scores.awayWinScore) || 0;

  const sum = home + draw + away;

  if (sum <= 0) {
    return {
      homeWinScore: 0.33,
      drawScore: 0.34,
      awayWinScore: 0.33
    };
  }

  return {
    homeWinScore: home / sum,
    drawScore: draw / sum,
    awayWinScore: away / sum
  };
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
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
// TEXT / NAME NORMALIZATION
// ------------------------------------------------------------
function stripDiacritics(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function basicNormalizeText(value) {
  return stripDiacritics(String(value || ""))
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\+/g, " ")
    .replace(/[’'`]/g, "")
    .replace(/[().,/\\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLeagueName(value) {
  return basicNormalizeText(value)
    .replace(/\s+/g, "")
    .trim();
}

function normalizeTeamTokens(value) {
  let s = basicNormalizeText(value)
    .replace(/\bparis sg\b/g, " paris saint germain ")
    .replace(/\bpsg\b/g, " paris saint germain ")
    .replace(/\batl\b/g, " atletico ")
    .replace(/\butd\b/g, " united ")
    .replace(/\bfc bayern\b/g, " bayern ")
    .replace(/\bborussia dortmund\b/g, " dortmund ")
    .replace(/\bborussia monchengladbach\b/g, " monchengladbach ")
    .replace(/\binter milan\b/g, " inter ");

  const rawTokens = s.split(" ").filter(Boolean);
  const out = [];

  for (let token of rawTokens) {
    token = TOKEN_ALIASES.get(token) || token;

    if (GENERIC_CLUB_TOKENS.has(token)) continue;
    if (/^\d+$/.test(token)) continue;

    out.push(token);
  }

  return out;
}

function canonicalTeamKey(value) {
  const tokens = normalizeTeamTokens(value);
  const seen = new Set();
  const filtered = [];

  for (const token of tokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    filtered.push(token);
  }

  return filtered.join(" ");
}

function normalizeName(value) {
  return canonicalTeamKey(value);
}

function tokenOverlapScore(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return 0;

  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);

  let overlap = 0;
  for (const token of aSet) {
    if (bSet.has(token)) overlap += 1;
  }

  return overlap / Math.max(aSet.size, bSet.size, 1);
}

function isSubsetTokenMatch(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return false;

  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);

  const aInB = [...aSet].every(t => bSet.has(t));
  const bInA = [...bSet].every(t => aSet.has(t));

  return aInB || bInA;
}

function scoreTeamNameMatch(inputName, candidateName) {
  const inputKey = canonicalTeamKey(inputName);
  const candKey = canonicalTeamKey(candidateName);

  if (!inputKey || !candKey) return 0;
  if (inputKey === candKey) return 1;

  const inputTokens = inputKey.split(" ").filter(Boolean);
  const candTokens = candKey.split(" ").filter(Boolean);

  if (isSubsetTokenMatch(inputTokens, candTokens)) {
    return 0.93;
  }

  const overlap = tokenOverlapScore(inputTokens, candTokens);

  if (inputKey.includes(candKey) || candKey.includes(inputKey)) {
    return Math.max(overlap, 0.88);
  }

  return overlap;
}

// ------------------------------------------------------------
// PRIORS LOADING
// ------------------------------------------------------------
async function loadModelPriors(season) {
  const file = path.join(DATA_DIR, "model-priors", `${season}.json`);
  return await readJsonSafe(file, {
    teamPriors: {},
    leaguePriors: {},
    matchupPriors: {}
  });
}

// ------------------------------------------------------------
// INDEX LOADING
// ------------------------------------------------------------
export async function loadValueIndexes(season = DEFAULT_SEASON) {
  if (__indexesCache.has(season)) {
    return __indexesCache.get(season);
  }

  const teamFormPath = path.join(HISTORY_INDEX_DIR, "team-form", `${season}.json`);
  const leagueFormPath = path.join(HISTORY_INDEX_DIR, "league-form", `${season}.json`);
  const matchupsPath = path.join(HISTORY_INDEX_DIR, "matchups", `${season}.json`);

  const [teamForm, leagueForm, matchups] = await Promise.all([
    readJsonSafe(teamFormPath, {}),
    readJsonSafe(leagueFormPath, {}),
    readJsonSafe(matchupsPath, {})
  ]);

  const result = {
    season,
    teamForm: teamForm || {},
    leagueForm: leagueForm || {},
    matchups: matchups || {}
  };

  __indexesCache.set(season, result);

  console.log("[value] indexes loaded", {
    season,
    teamFormSize: Object.keys(result.teamForm).length,
    leagueFormSize: Object.keys(result.leagueForm).length,
    matchupsSize: Object.keys(result.matchups).length
  });

  return result;
}

// ------------------------------------------------------------
// ENTRY HELPERS
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

  if (result === "D" || result === "DRAW" || result === "X") return 1;

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
  if (typeof match?.isHome === "boolean") return match.isHome;

  const team = normalizeName(teamName);
  const home = normalizeName(pickFirstDefined(match?.homeTeam, match?.home, ""));
  return !!team && !!home && team === home;
}

function isAwayMatch(match, teamName) {
  if (typeof match?.isHome === "boolean") return !match.isHome;

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

function entryLeagueScore(entry, leagueSlug) {
  const league = String(
    pickFirstDefined(
      entry?.leagueSlug,
      entry?.league,
      entry?.leagueKey,
      entry?.matches?.[0]?.leagueSlug,
      ""
    )
  ).trim();

  if (!leagueSlug) return 0.5;
  if (!league) return 0.35;
  return league === leagueSlug ? 1 : 0;
}

// ------------------------------------------------------------
// RESOLUTION HELPERS
// ------------------------------------------------------------
function resolveTeamEntry(teamFormIndex, leagueSlug, teamName) {
  const entries = Object.entries(teamFormIndex || {});
  if (!entries.length) {
    return { key: teamName, value: null, leagueKey: leagueSlug, score: 0 };
  }

  let best = null;

  for (const [teamKey, value] of entries) {
    const nameScore = scoreTeamNameMatch(teamName, teamKey);
    if (nameScore < 0.45) continue;

    const leagueScore = entryLeagueScore(value, leagueSlug);
    const totalScore = (nameScore * 0.82) + (leagueScore * 0.18);

    if (!best || totalScore > best.totalScore) {
      best = {
        key: teamKey,
        value,
        leagueKey: leagueSlug,
        totalScore
      };
    }
  }

  if (best && best.totalScore >= 0.7) {
    return {
      key: best.key,
      value: best.value,
      leagueKey: best.leagueKey,
      score: best.totalScore
    };
  }

  return {
    key: teamName,
    value: null,
    leagueKey: leagueSlug,
    score: 0
  };
}

function resolveLeagueEntry(leagueFormIndex, leagueSlug) {
  if (leagueFormIndex?.[leagueSlug]) {
    return { key: leagueSlug, value: leagueFormIndex[leagueSlug] };
  }

  const target = normalizeLeagueName(leagueSlug);

  for (const [key, value] of Object.entries(leagueFormIndex || {})) {
    if (normalizeLeagueName(key) === target) {
      return { key, value };
    }
  }

  return { key: leagueSlug, value: null };
}

function parseMatchupTeamsFromKey(key) {
  const raw = String(key || "").trim();

  if (raw.includes("::")) {
    const [a, b] = raw.split("::");
    return { teamA: a?.trim() || "", teamB: b?.trim() || "", leagueKey: "" };
  }

  const parts = raw.split("|").map(x => x.trim()).filter(Boolean);

  if (parts.length >= 3) {
    return {
      leagueKey: parts[0],
      teamA: parts[1],
      teamB: parts[2]
    };
  }

  if (parts.length === 2) {
    return {
      leagueKey: "",
      teamA: parts[0],
      teamB: parts[1]
    };
  }

  return { leagueKey: "", teamA: "", teamB: "" };
}

function matchupPairScore(inputHome, inputAway, candA, candB) {
  const directA = scoreTeamNameMatch(inputHome, candA);
  const directB = scoreTeamNameMatch(inputAway, candB);
  const reverseA = scoreTeamNameMatch(inputHome, candB);
  const reverseB = scoreTeamNameMatch(inputAway, candA);

  const direct = (directA + directB) / 2;
  const reverse = (reverseA + reverseB) / 2;

  return Math.max(direct, reverse);
}

function resolveMatchupEntry(matchupsIndex, homeTeam, awayTeam, leagueSlug = "") {
  const entries = Object.entries(matchupsIndex || {});
  if (!entries.length) {
    return {
      key: `${homeTeam}::${awayTeam}`,
      value: null,
      score: 0
    };
  }

  let best = null;

  for (const [key, value] of entries) {
    const parsed = parseMatchupTeamsFromKey(key);

    const pairScore = matchupPairScore(
      homeTeam,
      awayTeam,
      parsed.teamA || value?.teams?.[0] || "",
      parsed.teamB || value?.teams?.[1] || ""
    );

    if (pairScore < 0.55) continue;

    const candidateLeague = String(
      pickFirstDefined(
        parsed.leagueKey,
        value?.leagueSlug,
        value?.lastMatch?.leagueSlug,
        value?.matches?.[0]?.leagueSlug,
        ""
      )
    ).trim();

    const leagueScore =
      leagueSlug && candidateLeague
        ? (candidateLeague === leagueSlug ? 1 : 0)
        : 0.5;

    const totalScore = (pairScore * 0.86) + (leagueScore * 0.14);

    if (!best || totalScore > best.totalScore) {
      best = { key, value, totalScore };
    }
  }

  if (best && best.totalScore >= 0.75) {
    return { key: best.key, value: best.value, score: best.totalScore };
  }

  return {
    key: `${homeTeam}::${awayTeam}`,
    value: null,
    score: 0
  };
}

function resolveTeamPrior(teamPriors, leagueSlug, teamName) {
  const entries = Object.entries(teamPriors || {});
  if (!entries.length) return null;

  const targetLeague = String(leagueSlug || "").trim();
  let best = null;

  for (const [key, value] of entries) {
    const parts = String(key).split("::");
    const priorLeague = parts[0] || "";
    const priorTeam = parts.slice(1).join("::") || key;

    // HARD FILTER: avoid II / B teams mismatch
    if (
      teamName &&
      priorTeam &&
      (
        (teamName.includes("II") && !priorTeam.includes("II")) ||
        (!teamName.includes("II") && priorTeam.includes("II"))
      )
    ) {
      continue;
    }

    const nameScore = scoreTeamNameMatch(teamName, priorTeam);
    if (nameScore < 0.6) continue;

    if (targetLeague && priorLeague && priorLeague !== targetLeague) {
      continue;
    }

    const leagueScore =
      targetLeague && priorLeague
        ? 1
        : 0.5;

    const totalScore = (nameScore * 0.82) + (leagueScore * 0.18);

    if (!best || totalScore > best.totalScore) {
      best = {
        key,
        value,
        totalScore
      };
    }
  }

  if (best && best.totalScore >= 0.75) {
    return {
      key: best.key,
      value: best.value,
      score: best.totalScore
    };
  }

  return null;
}
function resolveLeaguePrior(leaguePriors, leagueSlug) {
  return leaguePriors?.[leagueSlug] || null;
}

function resolveMatchupPrior(matchupPriors, leagueSlug, homeTeam, awayTeam) {
  const entries = Object.entries(matchupPriors || {});
  if (!entries.length) return null;

  let best = null;

  for (const [key, value] of entries) {
    const parsed = parseMatchupTeamsFromKey(key);

    const pairScore = matchupPairScore(
      homeTeam,
      awayTeam,
      parsed.teamA || value?.teamA || "",
      parsed.teamB || value?.teamB || ""
    );

    if (pairScore < 0.55) continue;

    const priorLeague = String(
      pickFirstDefined(parsed.leagueKey, value?.leagueSlug, "")
    ).trim();

    if (leagueSlug && priorLeague && priorLeague !== leagueSlug) {
      continue;
    }

    const leagueScore =
      leagueSlug && priorLeague
        ? 1
        : 0.5;

    const totalScore = (pairScore * 0.86) + (leagueScore * 0.14);

    if (!best || totalScore > best.totalScore) {
      best = { key, value, totalScore };
    }
  }

  if (best && best.totalScore >= 0.72) {
    return {
      key: best.key,
      value: best.value,
      score: best.totalScore
    };
  }

  return null;
}

// ------------------------------------------------------------
// PRIORS BLENDING HELPERS
// ------------------------------------------------------------
function cappedSample(sample, cap) {
  const n = Number(sample);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, cap);
}

function blendMetric(currentValue, currentSample, priorValue, priorSample, fallback = 0) {
  const cVal = Number.isFinite(Number(currentValue)) ? Number(currentValue) : null;
  const pVal = Number.isFinite(Number(priorValue)) ? Number(priorValue) : null;

  const cS = cappedSample(currentSample, 8);
  const pS = cappedSample(priorSample, 20);

  if (cVal === null && pVal === null) return fallback;
  if (cVal !== null && pVal === null) return cVal;
  if (cVal === null && pVal !== null) return pVal;

  const total = cS + pS;
  if (total <= 0) return fallback;

  return ((cVal * cS) + (pVal * pS)) / total;
}

function effectiveSample(currentSample, priorSample) {
  return Number(currentSample || 0) + Math.min(Number(priorSample || 0), 3);
}

function getPriorBucket(priorEntry, side) {
  if (!priorEntry) return null;
  if (side === "home") return priorEntry.home || null;
  if (side === "away") return priorEntry.away || null;
  return priorEntry.all || null;
}

function blendTeamMetrics(currentMetrics, priorEntry, side = "all") {
  const priorBucket = getPriorBucket(priorEntry, side);
  const currentSample = Number(currentMetrics?.sample || 0);
  const priorSample = Number(priorBucket?.sample || priorEntry?.sample || 0);

  return {
    ...currentMetrics,
    sample: effectiveSample(currentSample, priorSample),
    ppg: blendMetric(currentMetrics?.ppg, currentSample, priorBucket?.ppg, priorSample, currentMetrics?.ppg || 0),
    winRate: blendMetric(currentMetrics?.winRate, currentSample, priorBucket?.winRate, priorSample, currentMetrics?.winRate || 0),
    drawRate: blendMetric(currentMetrics?.drawRate, currentSample, priorBucket?.drawRate, priorSample, currentMetrics?.drawRate || 0),
    lossRate: blendMetric(currentMetrics?.lossRate, currentSample, priorBucket?.lossRate, priorSample, currentMetrics?.lossRate || 0),
    gfAvg: blendMetric(currentMetrics?.gfAvg, currentSample, priorBucket?.gfAvg, priorSample, currentMetrics?.gfAvg || 0),
    gaAvg: blendMetric(currentMetrics?.gaAvg, currentSample, priorBucket?.gaAvg, priorSample, currentMetrics?.gaAvg || 0),
    over25Rate: blendMetric(currentMetrics?.over25Rate, currentSample, priorBucket?.over25Rate, priorSample, currentMetrics?.over25Rate || 0),
    bttsRate: blendMetric(currentMetrics?.bttsRate, currentSample, priorBucket?.bttsRate, priorSample, currentMetrics?.bttsRate || 0)
  };
}

function blendLeagueBaseline(currentBaseline, priorBaseline) {
  const currentSample = Number(currentBaseline?.sample || 0);
  const priorSample = Number(priorBaseline?.sample || 0);

  return {
    goalsAvg: blendMetric(currentBaseline?.goalsAvg, currentSample, priorBaseline?.goalsAvg, priorSample, currentBaseline?.goalsAvg || 2.4),
    drawRate: blendMetric(currentBaseline?.drawRate, currentSample, priorBaseline?.drawRate, priorSample, currentBaseline?.drawRate || 0.28),
    homeWinRate: blendMetric(currentBaseline?.homeWinRate, currentSample, priorBaseline?.homeWinRate, priorSample, currentBaseline?.homeWinRate || 0.45),
    awayWinRate: blendMetric(currentBaseline?.awayWinRate, currentSample, priorBaseline?.awayWinRate, priorSample, currentBaseline?.awayWinRate || 0.27),
    over25Rate: blendMetric(currentBaseline?.over25Rate, currentSample, priorBaseline?.over25Rate, priorSample, currentBaseline?.over25Rate || 0.5),
    bttsRate: blendMetric(currentBaseline?.bttsRate, currentSample, priorBaseline?.bttsRate, priorSample, currentBaseline?.bttsRate || 0.48),
    sample: Math.max(currentSample, priorSample)
  };
}

function orientMatchupBiasToHomeAway(priorEntry, homeTeam, awayTeam) {
  if (!priorEntry) {
    return {
      sample: 0,
      homeBias: 0.5,
      drawBias: 0.5,
      awayBias: 0.5,
      over25Bias: 0.5,
      bttsBias: 0.5
    };
  }

  const teamA = String(priorEntry.teamA || "").trim();
  const teamB = String(priorEntry.teamB || "").trim();

  const homeIsA = scoreTeamNameMatch(homeTeam, teamA) >= scoreTeamNameMatch(homeTeam, teamB);
  const awayIsB = scoreTeamNameMatch(awayTeam, teamB) >= scoreTeamNameMatch(awayTeam, teamA);

  if (homeIsA && awayIsB) {
    return {
      sample: Number(priorEntry.sample || 0),
      homeBias: toNumber(priorEntry.teamABias, 0.5),
      drawBias: toNumber(priorEntry.drawBias, 0.5),
      awayBias: toNumber(priorEntry.teamBBias, 0.5),
      over25Bias: toNumber(priorEntry.over25Bias, 0.5),
      bttsBias: toNumber(priorEntry.bttsBias, 0.5)
    };
  }

  return {
    sample: Number(priorEntry.sample || 0),
    homeBias: toNumber(priorEntry.teamBBias, 0.5),
    drawBias: toNumber(priorEntry.drawBias, 0.5),
    awayBias: toNumber(priorEntry.teamABias, 0.5),
    over25Bias: toNumber(priorEntry.over25Bias, 0.5),
    bttsBias: toNumber(priorEntry.bttsBias, 0.5)
  };
}

function blendMatchupBias(currentBias, priorBiasOriented) {
  const currentSample = Number(currentBias?.sample || 0);
  const priorSample = Number(priorBiasOriented?.sample || 0);

  return {
    sample: effectiveSample(currentSample, priorSample),
    homeBias: blendMetric(currentBias?.homeBias, currentSample, priorBiasOriented?.homeBias, priorSample, currentBias?.homeBias || 0.5),
    drawBias: blendMetric(currentBias?.drawBias, currentSample, priorBiasOriented?.drawBias, priorSample, currentBias?.drawBias || 0.5),
    awayBias: blendMetric(currentBias?.awayBias, currentSample, priorBiasOriented?.awayBias, priorSample, currentBias?.awayBias || 0.5),
    over25Bias: blendMetric(currentBias?.over25Bias, currentSample, priorBiasOriented?.over25Bias, priorSample, currentBias?.over25Bias || 0.5),
    bttsBias: blendMetric(currentBias?.bttsBias, currentSample, priorBiasOriented?.bttsBias, priorSample, currentBias?.bttsBias || 0.5)
  };
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
  const safeBaseWeight = Number(baseWeight) || 0;
  const safeFreshness = clamp(freshnessScore, 0.2, 1);
  const safeContinuity = clamp(continuityScore, 0.2, 1);
  const safeSample = Math.max(0, Number(sampleSize) || 0);

  const sampleFactor = clamp(safeSample / FORM_WINDOW, 0.35, 1);
  const rawWeight = safeBaseWeight * safeFreshness * safeContinuity * sampleFactor;

  return clamp(rawWeight, Math.min(0.12, safeBaseWeight), safeBaseWeight);
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

  const over15Core = clamp(
    (
      totalGoalsNorm * 0.45 +
      avg([homeMetrics.over25Rate, awayMetrics.over25Rate]) * 0.25 +
      clamp(expectedTotalGoals / 3.2, 0, 1) * 0.30
    ),
    0,
    1
  );

  const over25Core = clamp(
    (
      totalGoalsNorm * 0.34 +
      avg([homeMetrics.over25Rate, awayMetrics.over25Rate]) * 0.31 +
      leagueOver25Rate * 0.20 +
      clamp(expectedTotalGoals / 4.2, 0, 1) * 0.15
    ),
    0,
    1
  );

  const over35Core = clamp(
    (
      totalGoalsNorm * 0.25 +
      avg([homeMetrics.over25Rate, awayMetrics.over25Rate]) * 0.25 +
      clamp(expectedTotalGoals / 5.5, 0, 1) * 0.50
    ),
    0,
    1
  );

  const bttsCore = clamp(
    (
      avg([homeMetrics.bttsRate, awayMetrics.bttsRate]) * 0.38 +
      clamp(Math.min(expectedHomeGoals, 2.4) / 2.4, 0, 1) * 0.12 +
      clamp(Math.min(expectedAwayGoals, 2.4) / 2.4, 0, 1) * 0.12 +
      clamp(1 - (Math.abs(homeMetrics.gaAvg - awayMetrics.gaAvg) / 3.5), 0, 1) * 0.08 +
      leagueBTTSRate * 0.18 +
      clamp(Math.min(expectedTotalGoals, 4.5) / 4.5, 0, 1) * 0.12
    ),
    0,
    1
  );

  const over15Score = clamp(
    (over15Core * (0.72 + temporalBlend * 0.20)),
    0,
    1
  );

  const over25Score = clamp(
    (over25Core * (0.72 + temporalBlend * 0.20)),
    0,
    1
  );

  const over35Score = clamp(
    (over35Core * (0.72 + temporalBlend * 0.20)),
    0,
    1
  );

  const bttsScore = clamp(
    (bttsCore * (0.72 + temporalBlend * 0.20)),
    0,
    1
  );

  return {
    expectedHomeGoals: round(expectedHomeGoals, 3),
    expectedAwayGoals: round(expectedAwayGoals, 3),
    expectedTotalGoals: round(expectedTotalGoals, 3),
    over15Score,
    over25Score,
    over35Score,
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
    bttsRate,
    sample: extractNumeric(entry, ["sample", "matches"], 0)
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

  const strengthGap = Math.abs(homeStrength - awayStrength);
  const edgeGap = Math.abs(homeAwayEdge.homeBoost - (1 - homeAwayEdge.awayPenalty));

  const drawSuppression = clamp(
    1 - ((strengthGap * 0.55) + (edgeGap * 0.25)),
    0.35,
    1
  );

  const drawRaw = clamp(
    (
      (leagueDrawBase * 0.18) +
      (closeness * 0.10) +
      (matchupBias.drawBias * 0.04)
    ) * drawSuppression,
    0.02,
    0.18
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

  const MAX_DRAW_SCORE = 0.14;

  if (drawScore > MAX_DRAW_SCORE) {
    const excess = drawScore - MAX_DRAW_SCORE;
    drawScore = MAX_DRAW_SCORE;

    const nonDraw = homeWinScore + awayWinScore;
    if (nonDraw > 0) {
      homeWinScore += excess * (homeWinScore / nonDraw);
      awayWinScore += excess * (awayWinScore / nonDraw);
    }
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
  dynamicWeights,
  priorsMeta
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

  if (priorsMeta?.used) {
    signals.push("priors_applied");
  }

  return signals;
}

// ------------------------------------------------------------
// PUBLIC EVALUATOR
// ------------------------------------------------------------
export async function evaluateMatchValue(input, opts = {}) {
  const season = String(opts.season || input?.season || DEFAULT_SEASON);
  const indexes = opts.indexes || await loadValueIndexes(season);
  const priors = opts.priors || await loadModelPriors(season);

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

  const homePriorResolved = resolveTeamPrior(priors.teamPriors, leagueSlug, homeTeam);
  const awayPriorResolved = resolveTeamPrior(priors.teamPriors, leagueSlug, awayTeam);
  const leaguePrior = resolveLeaguePrior(priors.leaguePriors, leagueSlug);
  const matchupPriorResolved = resolveMatchupPrior(priors.matchupPriors, leagueSlug, homeTeam, awayTeam);

  const rawLeagueBaseline = computeLeagueBaseline(leagueResolved.value);
  const leagueBaseline = blendLeagueBaseline(rawLeagueBaseline, leaguePrior);

  const homeAllSelection = selectValidFormMatches(
    extractRecentMatches(homeResolved.value),
    homeResolved.key,
    "all",
    season,
    fixtureDate,
    FORM_WINDOW
  );

  const awayAllSelection = selectValidFormMatches(
    extractRecentMatches(awayResolved.value),
    awayResolved.key,
    "all",
    season,
    fixtureDate,
    FORM_WINDOW
  );

  const homeSideSelection = selectValidFormMatches(
    extractRecentMatches(homeResolved.value),
    homeResolved.key,
    "home",
    season,
    fixtureDate,
    FORM_WINDOW
  );

  const awaySideSelection = selectValidFormMatches(
    extractRecentMatches(awayResolved.value),
    awayResolved.key,
    "away",
    season,
    fixtureDate,
    FORM_WINDOW
  );

  const rawHomeMetrics = computeTeamMetricsFromSelection(homeResolved.key, homeAllSelection);
  const rawAwayMetrics = computeTeamMetricsFromSelection(awayResolved.key, awayAllSelection);

  const rawHomeSideMetrics = computeTeamMetricsFromSelection(homeResolved.key, homeSideSelection);
  const rawAwaySideMetrics = computeTeamMetricsFromSelection(awayResolved.key, awaySideSelection);

  const homeMetrics = blendTeamMetrics(rawHomeMetrics, homePriorResolved?.value, "all");
  const awayMetrics = blendTeamMetrics(rawAwayMetrics, awayPriorResolved?.value, "all");

  const homeSideMetrics = blendTeamMetrics(rawHomeSideMetrics, homePriorResolved?.value, "home");
  const awaySideMetrics = blendTeamMetrics(rawAwaySideMetrics, awayPriorResolved?.value, "away");

  const hasMinimumRecentSample =
    homeMetrics.sample >= MIN_REQUIRED_RECENT_MATCHES &&
    awayMetrics.sample >= MIN_REQUIRED_RECENT_MATCHES;

  if (!hasMinimumRecentSample) {
    return null;
  }

  const rawMatchupBias = computeMatchupBias(
    matchupResolved.value,
    homeResolved.key,
    awayResolved.key,
    season,
    fixtureDate
  );

  const matchupBias = blendMatchupBias(
    rawMatchupBias,
    orientMatchupBiasToHomeAway(
      matchupPriorResolved?.value,
      homeResolved.key,
      awayResolved.key
    )
  );

  const homeStrength = computeTeamStrength(homeMetrics, leagueBaseline);
  const awayStrength = computeTeamStrength(awayMetrics, leagueBaseline);

  const homeAwayEdge = computeHomeAwayEdge(homeSideMetrics, awaySideMetrics, leagueBaseline);
  const goalsProfile = computeGoalsProfile(homeMetrics, awayMetrics, leagueBaseline);

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

  const priorsMeta = {
    used: !!(homePriorResolved || awayPriorResolved || leaguePrior || matchupPriorResolved),
    homePriorSample: Number(homePriorResolved?.value?.sample || 0),
    awayPriorSample: Number(awayPriorResolved?.value?.sample || 0),
    leaguePriorSample: Number(leaguePrior?.sample || 0),
    matchupPriorSample: Number(matchupPriorResolved?.value?.sample || 0)
  };

  const signals = buildSignals({
    outcomeScores,
    goalsProfile,
    confidence,
    homeMetrics,
    awayMetrics,
    matchupBias,
    dynamicWeights,
    priorsMeta
  });

  const baseValue = {
    season,
    leagueSlug,
    homeTeam,
    awayTeam,
    homeWinScore: round(outcomeScores.homeWinScore, 3),
    drawScore: round(outcomeScores.drawScore, 3),
    awayWinScore: round(outcomeScores.awayWinScore, 3),
    over15Score: round(goalsProfile.over15Score, 3),
    over25Score: round(goalsProfile.over25Score, 3),
    over35Score: round(goalsProfile.over35Score, 3),
    bttsScore: round(goalsProfile.bttsScore, 3),
    confidence: round(confidence, 3),
    signals,
    meta: {
      model: "value-engine-v1",
      mode: "statistical_plus_context",
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
          rawSample: rawHomeMetrics.sample,
          priorSample: priorsMeta.homePriorSample,
          daysSinceLastMatch: homeMetrics.daysSinceLastMatch,
          spanDays: homeMetrics.spanDays,
          freshnessScore: round(homeMetrics.freshnessScore, 3),
          continuityScore: round(homeMetrics.continuityScore, 3)
        },
        awayOverall: {
          sample: awayMetrics.sample,
          rawSample: rawAwayMetrics.sample,
          priorSample: priorsMeta.awayPriorSample,
          daysSinceLastMatch: awayMetrics.daysSinceLastMatch,
          spanDays: awayMetrics.spanDays,
          freshnessScore: round(awayMetrics.freshnessScore, 3),
          continuityScore: round(awayMetrics.continuityScore, 3)
        },
        homeSide: {
          sample: homeSideMetrics.sample,
          rawSample: rawHomeSideMetrics.sample,
          priorSample: priorsMeta.homePriorSample,
          daysSinceLastMatch: homeSideMetrics.daysSinceLastMatch,
          spanDays: homeSideMetrics.spanDays,
          freshnessScore: round(homeSideMetrics.freshnessScore, 3),
          continuityScore: round(homeSideMetrics.continuityScore, 3)
        },
        awaySide: {
          sample: awaySideMetrics.sample,
          rawSample: rawAwaySideMetrics.sample,
          priorSample: priorsMeta.awayPriorSample,
          daysSinceLastMatch: awaySideMetrics.daysSinceLastMatch,
          spanDays: awaySideMetrics.spanDays,
          freshnessScore: round(awaySideMetrics.freshnessScore, 3),
          continuityScore: round(awaySideMetrics.continuityScore, 3)
        }
      },
      matchupSample: matchupBias.sample,
      priorsUsed: priorsMeta.used,
      priors: priorsMeta,
      resolution: {
        homeInput: homeTeam,
        awayInput: awayTeam,
        homeResolvedKey: homeResolved.key,
        awayResolvedKey: awayResolved.key,
        homeResolveScore: round(homeResolved.score || 0, 3),
        awayResolveScore: round(awayResolved.score || 0, 3),
        matchupResolvedKey: matchupResolved.key,
        matchupResolveScore: round(matchupResolved.score || 0, 3),
        homePriorKey: homePriorResolved?.key || null,
        awayPriorKey: awayPriorResolved?.key || null,
        matchupPriorKey: matchupPriorResolved?.key || null
      },
      sourceKeys: {
        homeTeamKey: homeResolved.key,
        awayTeamKey: awayResolved.key,
        leagueKey: leagueResolved.key,
        matchupKey: matchupResolved.key
      }
    }
  };

  const contextApplied = await applyValueContextModifiers({
    fixture: input,
    baseValue,
    opts: {
      season
    }
  });

// -----------------------------
  // APPLY AI CONTEXT INTEGRATION
  // -----------------------------
  const contextIntelligence = input?.contextIntelligence || {};

  const integrated = applyValueContextIntegration(
    {
      ...baseValue,
      homeWinScore: round(
        contextApplied?.adjusted?.homeWinScore ?? baseValue.homeWinScore,
        3
      ),
      drawScore: round(
        contextApplied?.adjusted?.drawScore ?? baseValue.drawScore,
        3
      ),
      awayWinScore: round(
        contextApplied?.adjusted?.awayWinScore ?? baseValue.awayWinScore,
        3
      ),
      over25Score: round(
        contextApplied?.adjusted?.over25Score ?? baseValue.over25Score,
        3
      ),
      bttsScore: round(
        contextApplied?.adjusted?.bttsScore ?? baseValue.bttsScore,
        3
      ),
      confidence: round(
        contextApplied?.meta?.confidenceAdjusted ?? baseValue.confidence,
        3
      )
    },
    contextIntelligence
  );

  const normalized1X2 = renormalize1X2Scores({
    homeWinScore: integrated?.homeWinScore,
    drawScore: integrated?.drawScore,
    awayWinScore: integrated?.awayWinScore
  });

  const modifierSignals = [
    ...(contextApplied?.modifiers?.motivation?.reasons || []),
    ...(contextApplied?.modifiers?.fatigue?.reasons || []),
    ...(contextApplied?.modifiers?.congestion?.reasons || []),
    ...(contextApplied?.modifiers?.lookAhead?.reasons || [])
  ].filter(Boolean);

  return {
    ...baseValue,
    ...integrated,
    homeWinScore: round(normalized1X2.homeWinScore, 3),
    drawScore: round(normalized1X2.drawScore, 3),
    awayWinScore: round(normalized1X2.awayWinScore, 3),
    over15Score: baseValue.over15Score,
    over35Score: baseValue.over35Score,
    signals: [...new Set([
      ...(baseValue.signals || []),
      ...modifierSignals
    ])],
    modifiers: contextApplied?.modifiers || null,
    context: contextApplied?.context || null,
    meta: {
      ...(baseValue.meta || {}),
      mode: "statistical_plus_context",
      contextModifiers: {
        applied: true,
        version: "value-context-modifiers-v1.0"
      },
      contextAdjusted: !!integrated?.contextAdjusted,
      contextDelta: integrated?.contextDelta ?? 0,
      contextReasons: integrated?.contextReasons || []
    }
  };
}

export { loadModelPriors };

export default {
  loadValueIndexes,
  loadModelPriors,
  evaluateMatchValue
};