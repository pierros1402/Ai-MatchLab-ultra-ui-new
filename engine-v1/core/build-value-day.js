import fs from "fs";
import { getActiveByDay, getFixturesByDay } from "../storage/json-db.js";
import { ensureDir, resolveDataPath } from "../storage/data-root.js";
import {
  evaluateMatchValue,
  loadValueIndexes,
  loadModelPriors
} from "./value-engine-v1.js";
import { buildMatchIntelligence } from "./build-match-intelligence.js";

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function readDetailsSnapshot(dayKey, matchId) {
  const canonicalPath = resolveDataPath("details", dayKey, `${matchId}.json`);
  const canonical = readJsonSafe(canonicalPath, null);

  if (canonical) {
    return canonical;
  }

  const snapshotPath = resolveDataPath("deploy-snapshots", dayKey, "details", `${matchId}.json`);
  return readJsonSafe(snapshotPath, null);
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

  const adjusted1X2 = {
    home: Number(value?.homeWinScore ?? -1),
    away: Number(value?.awayWinScore ?? -1)
  };

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

  function toBand(score) {
    if (score >= 0.75) return "HIGH";
    if (score >= 0.65) return "MEDIUM";
    return "LOW";
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

  function pushPick({ market, marketName, pick, score }) {
    items.push({
      matchId: match.matchId,
      leagueSlug: match.leagueSlug,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      kickoff: match.kickoffUtc,
      market,
      marketName,
      pick,
      score,
      band: toBand(score),
      confidence,
      signals: [...signals],
      meta: buildValuePickMeta(),
      context
    });
  }

  // 1X2: only clear home/away edges. Draw remains suppressed for now.
  if (
    Number.isFinite(adjusted1X2.home) &&
    Number.isFinite(adjusted1X2.away)
  ) {
    const best = Math.max(adjusted1X2.home, adjusted1X2.away);
    const second = Math.min(adjusted1X2.home, adjusted1X2.away);
    const gap = best - second;
    const pick = adjusted1X2.home > adjusted1X2.away ? "HOME" : "AWAY";

    const sideHasNegativeFormSignal =
      pick === "HOME"
        ? hasAnySignal([
            "home_form_decay",
            "ai_form_home_negative",
            "ai_form_home_poor"
          ])
        : hasAnySignal([
            "away_form_decay",
            "ai_form_away_negative",
            "ai_form_away_poor"
          ]);

    if (
      best >= 0.68 &&
      gap >= 0.10 &&
      confidence >= 0.42 &&
      !sideHasNegativeFormSignal
    ) {
      pushPick({
        market: "1X2",
        marketName: "1X2",
        pick,
        score: best
      });
    }
  }

  // O1.5: baseline market, but no longer accepts weak/defensive profiles.
  if (
    adjustedOver15 >= 0.70 &&
    !hasGoalsBlocker &&
    confidence >= 0.40
  ) {
    pushPick({
      market: "Over / Under 1.5",
      marketName: "Over / Under 1.5",
      pick: "Over 1.5",
      score: adjustedOver15
    });
  }

  // O2.5: must have real goal support, not just a marginal numeric score.
  // Slightly tolerant after intelligence/match-profile adjustments, but only when xG profile supports goals.
  if (
    adjustedOver25 >= 0.65 &&
    expectedTotalGoals >= 2.75 &&
    hasGoalSupport &&
    !hasGoalsBlocker &&
    confidence >= 0.44
  ) {
    pushPick({
      market: "Over / Under 2.5",
      marketName: "Over / Under 2.5",
      pick: "Over 2.5",
      score: adjustedOver25
    });
  }

  // O3.5: rare market only. Needs strong goal support and no defensive blocker.
  if (
    adjustedOver35 >= 0.74 &&
    hasStrongGoalSupport &&
    !hasGoalsBlocker &&
    confidence >= 0.48
  ) {
    pushPick({
      market: "Over / Under 3.5",
      marketName: "Over / Under 3.5",
      pick: "Over 3.5",
      score: adjustedOver35
    });
  }

  // BTTS YES: requires explicit BTTS/attack support and rejects defensive/no-BTTS profiles.
  if (
    adjustedBtts >= 0.68 &&
    hasBttsSupport &&
    !hasBttsBlocker &&
    confidence >= 0.45
  ) {
    pushPick({
      market: "BTTS",
      marketName: "BTTS",
      pick: "BTTS YES",
      score: adjustedBtts
    });
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
  const season = "2025-2026";
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

        const normalized = {
          ok: true,
          date: parsed.date || date,
          createdAt: parsed.createdAt ?? null,
          updatedAt: parsed.updatedAt ?? null,
          count: parsedPicks.length,
          picks: parsedPicks
        };

        if (parsedPicks.length > 0) {
          __valueDayCache.set(cacheKey, normalized);

          console.log("[value] snapshot hit", {
            date,
            count: parsedPicks.length
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
      const details = readDetailsSnapshot(date, match.matchId);
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
 
  const dedupedPicks = dedupeValuePicks(picks);
  
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