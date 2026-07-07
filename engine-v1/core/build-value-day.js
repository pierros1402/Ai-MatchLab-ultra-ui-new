import fs from "fs";
import { getActiveByDay, getFixturesByDay } from "../storage/json-db.js";
import { ensureDir, resolveDataPath } from "../storage/data-root.js";
import {
  evaluateMatchValue,
  loadValueIndexes,
  loadModelPriors
} from "./value-engine-v1.js";
import { buildMatchIntelligence } from "./build-match-intelligence.js";
import { currentSeason } from "./season.js";

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function readDetailsSnapshot(dayKey, ...ids) {
  // Details are keyed by canonicalId; a fixture's matchId can be a raw provider
  // id (numeric ESPN) that does NOT match the detail filename. Try every id the
  // caller knows (canonicalId first) so ESPN-observed matches still resolve
  // their detail instead of silently building value with no context.
  const candidates = [...new Set(ids.map(id => String(id || "").trim()).filter(Boolean))];

  for (const id of candidates) {
    const canonical = readJsonSafe(resolveDataPath("details", dayKey, `${id}.json`), null);
    if (canonical) return canonical;
  }

  for (const id of candidates) {
    const snapshot = readJsonSafe(resolveDataPath("deploy-snapshots", dayKey, "details", `${id}.json`), null);
    if (snapshot) return snapshot;
  }

  return null;
}

function readDeploySnapshotFixturesByDay(dayKey) {
  const filePath = resolveDataPath("deploy-snapshots", dayKey, "fixtures.json");
  const payload = readJsonSafe(filePath, null);
  const rows = Array.isArray(payload?.fixtures)
    ? payload.fixtures
    : Array.isArray(payload)
      ? payload
      : [];

  return rows
    .filter(row => String(row?.dayKey || row?.date || "").slice(0, 10) === String(dayKey))
    .sort((a, b) => String(a.kickoffUtc || a.kickoff || "").localeCompare(String(b.kickoffUtc || b.kickoff || "")));
}


const STRICT_VALUE_POLICY_VERSION = "statistical-value-policy-v2.2";

const BAND_RANK = Object.freeze({ HIGH: 3, MEDIUM: 2, LOW: 1 });

const MARKET_PRIORITY = Object.freeze({
  "1X2": 90,
  "Over / Under 2.5": 88,
  "BTTS": 74,
  "Over / Under 3.5": 68,
  "Double Chance": 35,
  "Over / Under 1.5": 55
});

function valueNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function valueAvg(values, fallback = 0) {
  const nums = values.map(v => Number(v)).filter(Number.isFinite);
  if (!nums.length) return fallback;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}


function round(value, digits = 3) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
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

function getValueRecencyEntries(value) {
  const recency = value?.meta?.recency || {};
  return [
    recency.homeOverall,
    recency.awayOverall,
    recency.homeSide,
    recency.awaySide
  ].filter(Boolean);
}

function computeStatisticalReadiness(value, confidence) {
  const entries = getValueRecencyEntries(value);
  const sampleScore = valueAvg(
    entries.map(e => Math.min(1, valueNum(e?.rawSample ?? e?.sample, 0) / 5)),
    0.55
  );
  const freshnessScore = valueAvg(entries.map(e => e?.freshnessScore), 0.55);
  const continuityScore = valueAvg(entries.map(e => e?.continuityScore), 0.55);
  const formWeightScore = valueAvg(entries.map(e => e?.formContinuityWeight), 0.55);
  const matchupScore = Math.min(1, valueNum(value?.meta?.matchupSample, 0) / 5);
  const matchProfileScore = Math.min(1, Math.max(0.45, valueNum(value?.meta?.matchProfileConfidence, 0)));

  return clamp01(
    (sampleScore * 0.24) +
      (freshnessScore * 0.12) +
      (continuityScore * 0.14) +
      (formWeightScore * 0.18) +
      (Math.min(1, valueNum(confidence, 0)) * 0.20) +
      (matchupScore * 0.06) +
      (matchProfileScore * 0.06)
  );
}

function computeFormContinuityHaircut(value) {
  const entries = getValueRecencyEntries(value);
  const formWeightScore = valueAvg(entries.map(e => e?.formContinuityWeight), 0.65);
  const maxGap = Math.max(
    ...entries.map(e => Math.max(valueNum(e?.daysSinceLastMatch, 0), valueNum(e?.maxInternalGap, 0))),
    0
  );

  let gapHaircut = 0;
  if (maxGap > 35) gapHaircut = 0.12;
  else if (maxGap > 21) gapHaircut = 0.08;
  else if (maxGap > 14) gapHaircut = 0.045;

  const weightHaircut = Math.max(0, 1 - formWeightScore) * 0.12;
  return Math.max(gapHaircut, weightHaircut);
}

function adjustedValueConfidence(value, confidence) {
  return clamp01(valueNum(confidence, 0) - computeFormContinuityHaircut(value));
}

function strictBand({ score, confidence, readiness, high, medium }) {
  if (
    score >= high.score &&
    confidence >= high.confidence &&
    readiness >= high.readiness
  ) {
    return "HIGH";
  }

  if (
    medium &&
    score >= medium.score &&
    confidence >= medium.confidence &&
    readiness >= medium.readiness
  ) {
    return "MEDIUM";
  }

  return "LOW";
}

function normalizeOutcomeScores(value) {
  return renormalize1X2Scores({
    homeWinScore: value?.homeWinScore,
    drawScore: value?.drawScore,
    awayWinScore: value?.awayWinScore
  });
}

function strongestPickPerMatch(picks) {
  const bestByMatch = new Map();

  for (const pick of Array.isArray(picks) ? picks : []) {
    const key = String(pick?.matchId || "");
    if (!key) continue;

    const existing = bestByMatch.get(key);
    if (!existing || compareValuePicks(pick, existing) > 0) {
      bestByMatch.set(key, pick);
    }
  }

  return Array.from(bestByMatch.values());
}

function compareValuePicks(a, b) {
  const aScore =
    ((BAND_RANK[a?.band] || 0) * 100000) +
    (valueNum(a?.score, 0) * 10000) +
    (valueNum(a?.confidence, 0) * 1000) +
    (valueNum(a?.readiness, 0) * 500) +
    (MARKET_PRIORITY[a?.marketName || a?.market] || 0);

  const bScore =
    ((BAND_RANK[b?.band] || 0) * 100000) +
    (valueNum(b?.score, 0) * 10000) +
    (valueNum(b?.confidence, 0) * 1000) +
    (valueNum(b?.readiness, 0) * 500) +
    (MARKET_PRIORITY[b?.marketName || b?.market] || 0);

  return aScore - bScore;
}

// ------------------------------
// LOCAL CACHES
// ------------------------------
const __seasonResourceCache = new Map();
const __valueDayCache = new Map();

// ------------------------------
function isPlayable(match) {
  if (!match) return false;
  if (!match.homeTeam || !match.awayTeam) return false;
  if (!match.kickoffUtc) return false;

  const s = String(match.status || "").toUpperCase();

  if (s.includes("POSTPONED")) return false;
  if (s.includes("CANCELLED")) return false;

  return true;
}

// ------------------------------
function writeValueSnapshot(date, result) {
  ensureDir(resolveDataPath("value"));
  const file = resolveDataPath("value", `${date}.json`);

  const payload = {
    date,
    source: result.source || null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    count: result.picks.length,
    picks: result.picks
  };

  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
}
// ------------------------------
async function getSeasonResources(season, force = false) {
  if (!force && __seasonResourceCache.has(season)) {
    return __seasonResourceCache.get(season);
  }

  const [indexes, priors] = await Promise.all([
    loadValueIndexes(season),
    loadModelPriors(season)
  ]);

  const resources = { indexes, priors };
  __seasonResourceCache.set(season, resources);
  return resources;
}

// ------------------------------
function expandValueMarkets(match, value) {
  const items = [];

  const over15 = Number(value?.over15Score ?? -1);
  const over25 = Number(value?.over25Score ?? -1);
  const over35 = Number(value?.over35Score ?? -1);
  const btts = Number(value?.bttsScore ?? -1);
  const confidence = Number(value?.confidence ?? 0);
  const expectedTotalGoals = Number(value?.meta?.expectedTotalGoals ?? 0);

  const signals = Array.isArray(value?.signals) ? value.signals : [];
  const context = value?.context || null;

  const hasSignal = (name) => signals.includes(name);
  const hasAnySignal = (names) => names.some(name => hasSignal(name));

  const hasPoorForm = hasAnySignal([
    "ai_form_home_negative",
    "ai_form_home_poor",
    "ai_form_away_negative",
    "ai_form_away_poor"
  ]);

  const hasGoalSupport = hasAnySignal([
    "over25_support",
    "mutual_attack_profile",
    "matchup_goals_history",
    "ai_h2h_overlean"
  ]);

  const hasStrongGoalSupport = hasAnySignal([
    "mutual_attack_profile",
    "matchup_goals_history",
    "ai_h2h_overlean"
  ]);

  const hasBttsSupport = hasAnySignal([
    "btts_support",
    "mutual_attack_profile"
  ]);

  const hasGoalsBlocker = hasAnySignal([
    "defensive_profile",
    "under25_lean"
  ]);

  const hasBttsBlocker = hasAnySignal([
    "defensive_profile",
    "btts_no_lean",
    "under25_lean"
  ]);

  const aiStrongPositive = hasAnySignal([
    "ai_form_home_strong",
    "ai_form_away_strong"
  ]);

  const aiOverLean = hasSignal("ai_h2h_overlean");

  let adjustedOver15 = over15;
  let adjustedOver25 = over25;
  let adjustedOver35 = over35;
  let adjustedBtts = btts;

  const normalizedOutcomeScores = normalizeOutcomeScores(value);
  const adjusted1X2 = {
    home: Number(normalizedOutcomeScores.homeWinScore ?? -1),
    draw: Number(normalizedOutcomeScores.drawScore ?? -1),
    away: Number(normalizedOutcomeScores.awayWinScore ?? -1)
  };

  const readiness = computeStatisticalReadiness(value, confidence);
  const effectiveConfidence = adjustedValueConfidence(value, confidence);

  if (aiStrongPositive && !hasPoorForm) {
    adjustedOver25 *= 1.03;
    adjustedBtts *= 1.02;
    adjusted1X2.home *= 1.02;
    adjusted1X2.away *= 1.02;
  }

  if (aiOverLean && !hasGoalsBlocker) {
    adjustedOver25 *= 1.04;
    adjustedOver35 *= 1.03;
  }

  function buildValuePickMeta() {
    const homeWinScore = Number(value?.homeWinScore);
    const drawScore = Number(value?.drawScore);
    const awayWinScore = Number(value?.awayWinScore);

    const hasOutcomeScores =
      Number.isFinite(homeWinScore) &&
      Number.isFinite(drawScore) &&
      Number.isFinite(awayWinScore);

    const bestSide =
      Number.isFinite(homeWinScore) &&
      Number.isFinite(awayWinScore)
        ? (homeWinScore >= awayWinScore ? "HOME" : "AWAY")
        : null;

    const sideGap =
      Number.isFinite(homeWinScore) &&
      Number.isFinite(awayWinScore)
        ? Math.abs(homeWinScore - awayWinScore)
        : null;

    return {
      ...(value.meta || {}),
      valuePolicy: {
        version: STRICT_VALUE_POLICY_VERSION,
        oddsIndependent: true,
        type: "statistical_value",
        formGapHandling: "reduced_weight_not_rejected"
      },
      readiness: round(readiness, 3),
      adjustedConfidence: round(effectiveConfidence, 3),
      outcomeScores: hasOutcomeScores
        ? {
            homeWinScore,
            drawScore,
            awayWinScore,
            bestSide,
            sideGap,
            drawGapToBestSide:
              bestSide === "HOME"
                ? homeWinScore - drawScore
                : awayWinScore - drawScore
          }
        : null
    };
  }

  function pushPick({ market, marketName, pick, score, band, policyReason }) {
    if (!band || band === "LOW") return;

    items.push({
      matchId: match.matchId,
      leagueSlug: match.leagueSlug,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      kickoff: match.kickoffUtc,
      market,
      marketName,
      pick,
      score: round(score, 3),
      band,
      confidence: round(effectiveConfidence, 3),
      rawConfidence: round(confidence, 3),
      readiness: round(readiness, 3),
      signals: [...signals],
      meta: {
        ...buildValuePickMeta(),
        policyReason
      },
      context
    });
  }

  // 1X2: strict home/away only; draw is deliberately rare and HIGH-only.
  if (
    Number.isFinite(adjusted1X2.home) &&
    Number.isFinite(adjusted1X2.draw) &&
    Number.isFinite(adjusted1X2.away)
  ) {
    const outcomes = [
      { pick: "HOME", score: adjusted1X2.home },
      { pick: "DRAW", score: adjusted1X2.draw },
      { pick: "AWAY", score: adjusted1X2.away }
    ].sort((a, b) => b.score - a.score);

    const bestOutcome = outcomes[0];
    const secondOutcome = outcomes[1];
    const gap = bestOutcome.score - secondOutcome.score;

    const sideHasNegativeFormSignal =
      bestOutcome.pick === "HOME"
        ? hasAnySignal([
            "home_form_decay",
            "ai_form_home_negative",
            "ai_form_home_poor"
          ])
        : bestOutcome.pick === "AWAY"
          ? hasAnySignal([
              "away_form_decay",
              "ai_form_away_negative",
              "ai_form_away_poor"
            ])
          : false;

    if (bestOutcome.pick === "HOME" || bestOutcome.pick === "AWAY") {
      const band = strictBand({
        score: bestOutcome.score,
        confidence: effectiveConfidence,
        readiness,
        high: { score: 0.78, confidence: 0.74, readiness: 0.78 },
        medium: { score: 0.72, confidence: 0.68, readiness: 0.70 }
      });

      if (gap >= (band === "HIGH" ? 0.22 : 0.16) && !sideHasNegativeFormSignal) {
        pushPick({
          market: "1X2",
          marketName: "1X2",
          pick: bestOutcome.pick,
          score: bestOutcome.score,
          band,
          policyReason: "strict_1x2_clear_side_edge"
        });
      }
    }

    if (bestOutcome.pick === "DRAW") {
      const maxDrawGap = Math.max(
        Math.abs(adjusted1X2.draw - adjusted1X2.home),
        Math.abs(adjusted1X2.draw - adjusted1X2.away)
      );

      if (
        adjusted1X2.draw >= 0.36 &&
        maxDrawGap <= 0.06 &&
        expectedTotalGoals >= 1.80 &&
        expectedTotalGoals <= 2.45 &&
        effectiveConfidence >= 0.76 &&
        readiness >= 0.80
      ) {
        pushPick({
          market: "1X2",
          marketName: "1X2",
          pick: "DRAW",
          score: adjusted1X2.draw,
          band: "HIGH",
          policyReason: "strict_draw_profile_high_only"
        });
      }
    }

  }

  const over25High =
    adjustedOver25 >= 0.72 &&
    expectedTotalGoals >= 2.90 &&
    effectiveConfidence >= 0.70 &&
    readiness >= 0.72 &&
    !hasGoalsBlocker &&
    (hasGoalSupport || expectedTotalGoals >= 3.00);

  const over25NearHighMedium =
    adjustedOver25 >= 0.68 &&
    expectedTotalGoals >= 2.75 &&
    effectiveConfidence >= 0.66 &&
    readiness >= 0.68 &&
    !hasGoalsBlocker &&
    (hasGoalSupport || expectedTotalGoals >= 2.95);

  const qualifiesOver25 =
    over25High || over25NearHighMedium;

  // O1.5: easy market, so panel only accepts HIGH and never accepts Under 1.5.
  if (
    adjustedOver15 >= 0.86 &&
    expectedTotalGoals >= 2.75 &&
    !qualifiesOver25 &&
    !hasGoalsBlocker &&
    effectiveConfidence >= 0.76 &&
    readiness >= 0.78
  ) {
    pushPick({
      market: "Over / Under 1.5",
      marketName: "Over / Under 1.5",
      pick: "Over 1.5",
      score: adjustedOver15,
      band: "HIGH",
      policyReason: "over15_high_only_under15_disabled"
    });
  }

  // O2.5: accepts HIGH plus only near-HIGH MEDIUM; weak MEDIUM stays out of the panel.
  if (qualifiesOver25) {
    pushPick({
      market: "Over / Under 2.5",
      marketName: "Over / Under 2.5",
      pick: "Over 2.5",
      score: adjustedOver25,
      band: over25High ? "HIGH" : "MEDIUM",
      policyReason: over25High
        ? "over25_strict_high"
        : "over25_near_high_medium_only"
    });
  }

  // O3.5: volatile market, conservative only. Under 3.5 is intentionally not generated here.
  if (
    adjustedOver35 >= 0.80 &&
    expectedTotalGoals >= 3.35 &&
    hasStrongGoalSupport &&
    !hasGoalsBlocker &&
    effectiveConfidence >= 0.74 &&
    readiness >= 0.78
  ) {
    pushPick({
      market: "Over / Under 3.5",
      marketName: "Over / Under 3.5",
      pick: "Over 3.5",
      score: adjustedOver35,
      band: adjustedOver35 >= 0.86 && effectiveConfidence >= 0.78 ? "HIGH" : "MEDIUM",
      policyReason: "over35_conservative"
    });
  }

  // BTTS YES: requires explicit BTTS/attack support and rejects defensive/no-BTTS profiles.
  if (
    adjustedBtts >= 0.72 &&
    hasBttsSupport &&
    !hasBttsBlocker &&
    effectiveConfidence >= 0.68 &&
    readiness >= 0.70
  ) {
    pushPick({
      market: "BTTS",
      marketName: "BTTS",
      pick: "BTTS YES",
      score: adjustedBtts,
      band: adjustedBtts >= 0.78 && effectiveConfidence >= 0.74 && readiness >= 0.78 ? "HIGH" : "MEDIUM",
      policyReason: "btts_strict_support_no_blocker"
    });
  }

  // DC: fallback only. It must not override stronger statistical value markets.
  if (
    Number.isFinite(adjusted1X2.home) &&
    Number.isFinite(adjusted1X2.draw) &&
    Number.isFinite(adjusted1X2.away)
  ) {
    const strongGoalMarketProfile =
      qualifiesOver25 ||
      (
        adjustedOver35 >= 0.80 &&
        expectedTotalGoals >= 3.35 &&
        hasStrongGoalSupport &&
        !hasGoalsBlocker &&
        effectiveConfidence >= 0.74 &&
        readiness >= 0.78
      );

    const dc1xScore = adjusted1X2.home + adjusted1X2.draw;
    const dcx2Score = adjusted1X2.draw + adjusted1X2.away;
    const dc12Score = adjusted1X2.home + adjusted1X2.away;

    const hasPrimaryValuePick = items.some(p =>
      p?.market === "1X2" ||
      p?.market === "Over / Under 2.5" ||
      p?.market === "Over / Under 3.5" ||
      p?.market === "Over / Under 1.5" ||
      p?.market === "BTTS"
    );

    const dcFallbackBlocked = hasPrimaryValuePick || strongGoalMarketProfile;

    if (
      !dcFallbackBlocked &&
      adjusted1X2.away <= 0.16 &&
      adjusted1X2.home >= 0.60 &&
      adjusted1X2.draw >= 0.23 &&
      dc1xScore >= 0.84 &&
      effectiveConfidence >= 0.76 &&
      readiness >= 0.80
    ) {
      pushPick({
        market: "DC",
        marketName: "Double Chance",
        pick: "1X",
        score: dc1xScore,
        band: dc1xScore >= 0.88 && effectiveConfidence >= 0.80 && readiness >= 0.84 ? "HIGH" : "MEDIUM",
        policyReason: "dc_away_strict_near_excluded_draw_live_fallback"
      });
    }

    if (
      !dcFallbackBlocked &&
      adjusted1X2.home <= 0.16 &&
      adjusted1X2.away >= 0.60 &&
      adjusted1X2.draw >= 0.23 &&
      dcx2Score >= 0.84 &&
      effectiveConfidence >= 0.76 &&
      readiness >= 0.80
    ) {
      pushPick({
        market: "DC",
        marketName: "Double Chance",
        pick: "X2",
        score: dcx2Score,
        band: dcx2Score >= 0.88 && effectiveConfidence >= 0.80 && readiness >= 0.84 ? "HIGH" : "MEDIUM",
        policyReason: "dc_home_strict_near_excluded_draw_live_fallback"
      });
    }

    // 12 is a high-risk no-draw market. It is allowed only as a rare fallback.
    if (
      !dcFallbackBlocked &&
      adjusted1X2.draw <= 0.12 &&
      adjusted1X2.home >= 0.40 &&
      adjusted1X2.away >= 0.40 &&
      Math.abs(adjusted1X2.home - adjusted1X2.away) <= 0.12 &&
      dc12Score >= 0.88 &&
      expectedTotalGoals >= 2.85 &&
      hasStrongGoalSupport &&
      !hasGoalsBlocker &&
      effectiveConfidence >= 0.80 &&
      readiness >= 0.82
    ) {
      pushPick({
        market: "DC",
        marketName: "Double Chance",
        pick: "12",
        score: dc12Score,
        band: "HIGH",
        policyReason: "dc12_rare_draw_almost_removed_open_goal_fallback"
      });
    }
  }

  return items;
}

function normalizeValueTeamKey(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(fc|cf|sc|afc|ac|cd|fk|sk|nk|sv|if|bk|club|deportivo|futbol|football|soccer)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function dedupeValuePicks(picks) {
  const bestByKey = new Map();

  for (const p of Array.isArray(picks) ? picks : []) {
    const homeKey = normalizeValueTeamKey(p.homeTeam || p.home || "");
    const awayKey = normalizeValueTeamKey(p.awayTeam || p.away || "");
    const kickoffKey = String(p.kickoff || "");
    const marketKey = String(p.market || p.marketName || "");
    const dedupeKey = `${homeKey}|${awayKey}|${kickoffKey}|${marketKey}`;

    const existing = bestByKey.get(dedupeKey);

    if (!existing) {
      bestByKey.set(dedupeKey, p);
      continue;
    }

    const existingScore = Number(existing.score || 0);
    const nextScore = Number(p.score || 0);

    if (nextScore > existingScore) {
      bestByKey.set(dedupeKey, p);
    }
  }

  return Array.from(bestByKey.values());
}

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function applyIntelligenceToValue(value, intelligence) {
  if (!value || !intelligence?.ok) {
    return value;
  }

  const mode = String(intelligence?.coverage?.mode || "fallback").toLowerCase();

  if (mode === "fallback") {
    return {
      ...value,
      intelligence: {
        applied: false,
        mode,
        reason: "fallback_coverage"
      }
    };
  }

  const multiplier = mode === "full" ? 1.0 : 0.5;

  let homeWinScore = Number(value.homeWinScore ?? 0);
  let drawScore = Number(value.drawScore ?? 0);
  let awayWinScore = Number(value.awayWinScore ?? 0);
  let over25Score = Number(value.over25Score ?? 0);
  let bttsScore = Number(value.bttsScore ?? 0);

  const signals = Array.isArray(intelligence?.signals) ? intelligence.signals : [];
  const finalAssessment = intelligence?.finalAssessment || {};
  const standingsContext = intelligence?.standingsContext || {};

  if (finalAssessment.lean === "home") {
    homeWinScore += 0.05 * multiplier;
    drawScore -= 0.02 * multiplier;
  } else if (finalAssessment.lean === "away") {
    awayWinScore += 0.05 * multiplier;
    drawScore -= 0.02 * multiplier;
  } else if (finalAssessment.lean === "draw") {
    drawScore += 0.05 * multiplier;
  }

  if (signals.includes("attack_support")) {
    over25Score += 0.04 * multiplier;
    bttsScore += 0.03 * multiplier;
  }

  if (signals.includes("defensive_resilience")) {
    over25Score -= 0.03 * multiplier;
    bttsScore -= 0.02 * multiplier;
    drawScore += 0.02 * multiplier;
  }

  if (signals.includes("home_form_edge")) {
    homeWinScore += 0.04 * multiplier;
  }

  if (signals.includes("away_form_edge")) {
    awayWinScore += 0.04 * multiplier;
  }

  if (signals.includes("motivation_pressure_high")) {
    homeWinScore += Number(standingsContext?.homePressure || 0) * 0.02 * multiplier;
    awayWinScore += Number(standingsContext?.awayPressure || 0) * 0.02 * multiplier;
  }

  return {
    ...value,
    homeWinScore: clamp01(homeWinScore),
    drawScore: clamp01(drawScore),
    awayWinScore: clamp01(awayWinScore),
    over25Score: clamp01(over25Score),
    bttsScore: clamp01(bttsScore),
    intelligence: {
      applied: true,
      mode,
      coverage: intelligence?.coverage || null,
      signals
    }
  };
}

// ------------------------------
export async function buildValueDay(date, { rebuild = false, env } = {}) {
  const season = currentSeason();
  const cacheKey = `${season}:${date}`;

  if (!rebuild && __valueDayCache.has(cacheKey)) {
    return __valueDayCache.get(cacheKey);
  }

  // ------------------------------
  // SNAPSHOT GUARD (FILE CACHE)
  // ------------------------------
  if (!rebuild) {
    try {
      const file = resolveDataPath("value", `${date}.json`);

      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, "utf-8");
        const parsed = JSON.parse(raw);
        const parsedPicks = Array.isArray(parsed?.picks) ? parsed.picks : [];

        const currentFixtureIds = new Set(
          getFixturesByDay(date)
            .map(f => String(f?.matchId || f?.id || ""))
            .filter(Boolean)
        );
        const filteredPicks = currentFixtureIds.size > 0
          ? parsedPicks.filter(p => currentFixtureIds.has(String(p?.matchId || "")))
          : parsedPicks;

        if (filteredPicks.length !== parsedPicks.length) {
          console.log("[value] cached snapshot orphan picks removed", {
            date,
            before: parsedPicks.length,
            after: filteredPicks.length,
            removed: parsedPicks.length - filteredPicks.length
          });
        }

        const normalized = {
          ok: true,
          date: parsed.date || date,
          createdAt: parsed.createdAt ?? null,
          updatedAt: parsed.updatedAt ?? null,
          count: filteredPicks.length,
          picks: filteredPicks
        };

        if (filteredPicks.length > 0) {
          __valueDayCache.set(cacheKey, normalized);

          console.log("[value] snapshot hit", {
            date,
            count: filteredPicks.length
          });

          return normalized;
        }

        console.log("[value] snapshot empty -> recompute", { date });
      }
    } catch (e) {
      console.log("[value] snapshot read failed", e?.message || e);
    }
  }
  const now = Date.now();

  const canonicalMatches = rebuild ? getFixturesByDay(date) : getActiveByDay(date);
  const snapshotFallbackMatches = canonicalMatches.length === 0
    ? readDeploySnapshotFixturesByDay(date)
    : [];

  const sourceMatches = canonicalMatches.length > 0
    ? canonicalMatches
    : snapshotFallbackMatches;

  const inputSource = canonicalMatches.length > 0
    ? "canonical_fixtures"
    : snapshotFallbackMatches.length > 0
      ? "deploy_snapshot_fixtures_fallback"
      : "empty";

  if (canonicalMatches.length === 0 && snapshotFallbackMatches.length > 0) {
    console.log("[value] using deploy snapshot fixture fallback", {
      date,
      sourceMatches: snapshotFallbackMatches.length
    });
  }

  const matches = sourceMatches.filter(m => {
    if (!isPlayable(m)) return false;

    if (rebuild) {
      return true;
    }

    const status = String(m?.status || "").toUpperCase();
    if (status !== "PRE") return false;

    const kickoffTs = new Date(m?.kickoffUtc || 0).getTime();
    return kickoffTs > now;
  });
  const { indexes, priors } = await getSeasonResources(season, rebuild);

  const picks = [];

  for (const match of matches) {
    try {
      const details = readDetailsSnapshot(date, match.canonicalId, match.matchId);
      const matchProfile = details?.researchedFacts?.matchProfile || null;

            const competitionContext =
              details?.researchedFacts?.competitionContext || null;

            const competitionData = competitionContext?.data || {};

                  const intelligence = await buildMatchIntelligence(match, { season });

                  const value = await evaluateMatchValue(
                    {
                      ...match,
                      kickoff: match.kickoffUtc,
                      season,
                      contextIntelligence: {
                        ...competitionData,
                        competitionContext,
                        refereeProfile: details?.researchedFacts?.refereeProfile || null,
                        teamNews: details?.researchedFacts?.teamNews || null,
                        expectedLineups: details?.researchedFacts?.expectedLineups || null,
                        headToHead: details?.researchedFacts?.headToHead || null,
                        formGuide: details?.researchedFacts?.formGuide || null,
                        matchProfile,
                        signals: details?.aiContext?.signals || [],
                        matchIntelligence: intelligence
                      }
                    },
                    { season, indexes, priors }
                  );

      if (!value) continue;

      const enrichedValue = applyIntelligenceToValue(value, intelligence);
      const finalValue = applyMatchProfileToValue(enrichedValue, matchProfile);

      picks.push(...expandValueMarkets(match, finalValue));
    } catch (err) {
      console.log("[value] match failed", {
        date,
        matchId: match?.matchId,
        homeTeam: match?.homeTeam,
        awayTeam: match?.awayTeam,
        error: err?.message || String(err)
      });
    }
  }
 
  const dedupedPicks = strongestPickPerMatch(dedupeValuePicks(picks));
  
  dedupedPicks.sort((a, b) => {
    const bandRank = { HIGH: 3, MEDIUM: 2, LOW: 1 };

    const bandDiff = (bandRank[b.band] || 0) - (bandRank[a.band] || 0);
    if (bandDiff !== 0) return bandDiff;

    return (b.score || 0) - (a.score || 0);
  });


  const result = {
    ok: true,
    date,
    source: inputSource,
    count: dedupedPicks.length,
    picks: dedupedPicks
  };

  __valueDayCache.set(cacheKey, result);
  writeValueSnapshot(date, result);

  return result;
}
function applyMatchProfileToValue(value, matchProfile) {
  if (!value || !matchProfile?.data) return value;

  const data = matchProfile.data;

  const homeForm = Number(data?.seasonFormLast5?.home?.record?.points || 0);
  const awayForm = Number(data?.seasonFormLast5?.away?.record?.points || 0);

  const homePos = Number(data?.standings?.home?.position || 0);
  const awayPos = Number(data?.standings?.away?.position || 0);

  const h2hEdge = data?.h2hLast5?.trend?.edge || null;
  const h2hGoalPattern = data?.h2hLast5?.trend?.goalPattern || null;

  let homeWin = Number(value.homeWinScore ?? value.homeWin ?? value.home ?? 0);
  let awayWin = Number(value.awayWinScore ?? value.awayWin ?? value.away ?? 0);
  let over25 = Number(value.over25Score || 0);
  let btts = Number(value.bttsScore || 0);

  const appliedReasons = [];
  const PROFILE_IMPACT_MULTIPLIER = 0.55;
  const PROFILE_MAX_NET_BOOST = 0.055;

  if (!matchProfile?.data) {
    console.log("[matchProfile] missing data", matchProfile);
  }

  if (homeForm > awayForm + 2) {
    homeWin += 0.04 * PROFILE_IMPACT_MULTIPLIER;
    appliedReasons.push({
      code: "match_profile_home_form_edge",
      impact: 0.04 * PROFILE_IMPACT_MULTIPLIER,
      note: `MatchProfile last5 points: home ${homeForm}, away ${awayForm}`
    });
  } else if (awayForm > homeForm + 2) {
    awayWin += 0.04 * PROFILE_IMPACT_MULTIPLIER;
    appliedReasons.push({
      code: "match_profile_away_form_edge",
      impact: 0.04 * PROFILE_IMPACT_MULTIPLIER,
      note: `MatchProfile last5 points: home ${homeForm}, away ${awayForm}`
    });
  }

  if (homePos && awayPos) {
    const gap = awayPos - homePos;

    if (gap >= 5) {
      homeWin += 0.05 * PROFILE_IMPACT_MULTIPLIER;
      appliedReasons.push({
        code: "match_profile_home_table_edge",
        impact: 0.05 * PROFILE_IMPACT_MULTIPLIER,
        note: `MatchProfile table positions: home #${homePos}, away #${awayPos}`
      });
    } else if (gap <= -5) {
      awayWin += 0.05 * PROFILE_IMPACT_MULTIPLIER;
      appliedReasons.push({
        code: "match_profile_away_table_edge",
        impact: 0.05 * PROFILE_IMPACT_MULTIPLIER,
        note: `MatchProfile table positions: home #${homePos}, away #${awayPos}`
      });
    }
  }

  if (h2hEdge === "home") {
    homeWin += 0.02 * PROFILE_IMPACT_MULTIPLIER;
    appliedReasons.push({
      code: "match_profile_h2h_home_edge",
      impact: 0.02 * PROFILE_IMPACT_MULTIPLIER,
      note: "MatchProfile H2H trend leans home"
    });
  } else if (h2hEdge === "away") {
    awayWin += 0.02 * PROFILE_IMPACT_MULTIPLIER;
    appliedReasons.push({
      code: "match_profile_h2h_away_edge",
      impact: 0.02 * PROFILE_IMPACT_MULTIPLIER,
      note: "MatchProfile H2H trend leans away"
    });
  }

  if (h2hGoalPattern === "overlean") {
    over25 += 0.04 * PROFILE_IMPACT_MULTIPLIER;
    btts += 0.03 * PROFILE_IMPACT_MULTIPLIER;
    appliedReasons.push({
      code: "match_profile_h2h_overlean",
      impact: 0.04 * PROFILE_IMPACT_MULTIPLIER,
      note: "MatchProfile H2H goal pattern leans over"
    });
  } else if (h2hGoalPattern === "underlean") {
    over25 -= 0.03 * PROFILE_IMPACT_MULTIPLIER;
    btts -= 0.02 * PROFILE_IMPACT_MULTIPLIER;
    appliedReasons.push({
      code: "match_profile_h2h_underlean",
      impact: -0.03 * PROFILE_IMPACT_MULTIPLIER,
      note: "MatchProfile H2H goal pattern leans under"
    });
  }

  if (data?.playerUsage?.home?.coreStarters?.length >= 6) {
    homeWin += 0.02 * PROFILE_IMPACT_MULTIPLIER;
    appliedReasons.push({
      code: "match_profile_home_usage_stability",
      impact: 0.02 * PROFILE_IMPACT_MULTIPLIER,
      note: "Home player-usage core starters available"
    });
  }

  if (data?.playerUsage?.away?.coreStarters?.length >= 6) {
    awayWin += 0.02 * PROFILE_IMPACT_MULTIPLIER;
    appliedReasons.push({
      code: "match_profile_away_usage_stability",
      impact: 0.02 * PROFILE_IMPACT_MULTIPLIER,
      note: "Away player-usage core starters available"
    });
  }

  const nextSignals = Array.isArray(value.signals) ? [...value.signals] : [];
  if (appliedReasons.length > 0) {
    nextSignals.push("match_profile_applied");
  }

  const originalHomeWin = Number(value.homeWinScore ?? value.homeWin ?? value.home ?? 0);
  const originalAwayWin = Number(value.awayWinScore ?? value.awayWin ?? value.away ?? 0);
  const originalOver25 = Number(value.over25Score ?? 0);
  const originalBtts = Number(value.bttsScore ?? 0);

  const capBoost = (next, original) => {
    const delta = next - original;

    if (delta > PROFILE_MAX_NET_BOOST) {
      return original + PROFILE_MAX_NET_BOOST;
    }

    if (delta < -PROFILE_MAX_NET_BOOST) {
      return original - PROFILE_MAX_NET_BOOST;
    }

    return next;
  };

  homeWin = capBoost(homeWin, originalHomeWin);
  awayWin = capBoost(awayWin, originalAwayWin);
  over25 = capBoost(over25, originalOver25);
  btts = capBoost(btts, originalBtts);

  return {
    ...value,
    homeWinScore: clamp01(homeWin),
    awayWinScore: clamp01(awayWin),
    over25Score: clamp01(over25),
    bttsScore: clamp01(btts),
    signals: [...new Set(nextSignals)],
    meta: {
      ...(value.meta || {}),
      matchProfileApplied: appliedReasons.length > 0,
      matchProfileConfidence: matchProfile.confidence || 0,
      matchProfileReasons: appliedReasons
    }
  };
}

const isCliRun =
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).href;

if (isCliRun) {
  const date = process.argv[2];

  if (!date) {
    console.error("[build-value-day] missing date argument");
    process.exit(1);
  }

  buildValueDay(date, { rebuild: true })
    .then(result => {
      console.log("[build-value-day] done", {
        ok: result?.ok,
        date: result?.date,
        count: result?.count
      });
    })
    .catch(error => {
      console.error("[build-value-day] fatal", error);
      process.exit(1);
    });
}
