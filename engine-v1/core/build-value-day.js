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
  const filePath = resolveDataPath("details", dayKey, `${matchId}.json`);
  return readJsonSafe(filePath, null);
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

  const home = Number(value?.homeWinScore ?? -1);
  const away = Number(value?.awayWinScore ?? -1);

  const over15 = Number(value?.over15Score ?? -1);
  const over25 = Number(value?.over25Score ?? -1);
  const over35 = Number(value?.over35Score ?? -1);

  const btts = Number(value?.bttsScore ?? -1);
  const confidence = Number(value?.confidence ?? 0);

  const signals = Array.isArray(value?.signals) ? value.signals : [];
  const meta = value?.meta || {};
  const context = value?.context || null;

  const aiSignals = value?.signals || [];

  const aiStrongPositive =
    aiSignals.includes("ai_form_home_strong") ||
    aiSignals.includes("ai_form_away_strong") ||
    aiSignals.includes("ai_h2h_over_signal");

  const aiStrongNegative = aiSignals.some(s =>
    s.includes("ai_form_home_negative") ||
    s.includes("ai_form_home_poor") ||
    s.includes("ai_form_away_negative") ||
    s.includes("ai_form_away_poor")
  );

  const aiOverLean =
    aiSignals.includes("ai_h2h_overlean");

  if (aiStrongNegative) {
    return [];
  }

// -----------------------------
// AI PENALTY / BOOST
// -----------------------------
let adjustedOver15 = over15;
let adjustedOver25 = over25;
let adjustedOver35 = over35;
let adjustedBtts = btts;
let adjusted1X2 = {
  home: value.homeWinScore,
  draw: value.drawScore,
  away: value.awayWinScore
};

// -----------------------------
// AI PENALTY / BOOST
// -----------------------------

if (aiStrongPositive) {
  adjustedOver25 *= 1.04;
  adjustedBtts *= 1.03;

  adjusted1X2.home *= 1.03;
  adjusted1X2.away *= 1.03;
}

// extra: overlean influence
if (aiOverLean) {
  adjustedOver25 *= 1.05;
  adjustedOver35 *= 1.04;
}

function toBand(score) {
  if (score >= 0.72) return "HIGH";
  if (score >= 0.60) return "MEDIUM";
  return "LOW";
}

// 1X2 (NO DRAW)
if (
  Number.isFinite(adjusted1X2.home) &&
  Number.isFinite(adjusted1X2.away)
) {
  const best = Math.max(adjusted1X2.home, adjusted1X2.away);
  const second = Math.min(adjusted1X2.home, adjusted1X2.away);
  const gap = best - second;

  if (best >= 0.66 && gap >= 0.08) {

    // AI HARD FILTER
    

    items.push({
      matchId: match.matchId,
      leagueSlug: match.leagueSlug,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      kickoff: match.kickoffUtc,
      market: "1X2",
      marketName: "1X2",
      pick: adjusted1X2.home > adjusted1X2.away ? "HOME" : "AWAY",
      score: best,
      band: toBand(best),
      confidence,
      signals,
      meta,
      context
    });
  }
}

  if (adjustedOver15 >= 0.67) {

  // AI HARD FILTER
    


    items.push({
      matchId: match.matchId,
      leagueSlug: match.leagueSlug,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      kickoff: match.kickoffUtc,
      market: "Over / Under 1.5",
      marketName: "Over / Under 1.5",
      pick: "Over 1.5",
      score: adjustedOver15,
      band: toBand(adjustedOver15),
      confidence,
      signals,
      meta,
      context
    });
  }

  if (adjustedOver25 >= 0.60) {

  // AI HARD FILTER
    if (!aiOverLean && adjustedOver25 < 0.63) return items;

    items.push({
      matchId: match.matchId,
      leagueSlug: match.leagueSlug,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      kickoff: match.kickoffUtc,
      market: "Over / Under 2.5",
      marketName: "Over / Under 2.5",
      pick: "Over 2.5",
      score: adjustedOver25,
      band: toBand(adjustedOver25),
      confidence,
      signals,
      meta,
      context
    });
  }

  if (adjustedOver35 >= 0.64) {

  // AI HARD FILTER
    

    items.push({
      matchId: match.matchId,
      leagueSlug: match.leagueSlug,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      kickoff: match.kickoffUtc,
      market: "Over / Under 3.5",
      marketName: "Over / Under 3.5",
      pick: "Over 3.5",
      score: adjustedOver35,
      band: toBand(adjustedOver35),
      confidence,
      signals,
      meta,
      context
    });
  }

  if (adjustedBtts >= 0.62) {

  // AI HARD FILTER
    

    items.push({
      matchId: match.matchId,
      leagueSlug: match.leagueSlug,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      kickoff: match.kickoffUtc,
      market: "BTTS",
      marketName: "BTTS",
      pick: "BTTS YES",
      score: adjustedBtts,
      band: toBand(adjustedBtts),
      confidence,
      signals,
      meta,
      context
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

  const sourceMatches = rebuild ? getFixturesByDay(date) : getActiveByDay(date);

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
                        signals: details?.aiContext?.signals || [],
                        matchIntelligence: intelligence
                      }
                    },
                    { season, indexes, priors }
                  );

      if (!value) continue;

      const enrichedValue = applyIntelligenceToValue(value, intelligence);

      picks.push(...expandValueMarkets(match, enrichedValue));
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
    count: dedupedPicks.length,
    picks: dedupedPicks
  };

  __valueDayCache.set(cacheKey, result);
  writeValueSnapshot(date, result);

  return result;
}