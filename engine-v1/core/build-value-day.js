import fs from "fs";
import { getActiveByDay } from "../storage/json-db.js";
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

  let existing = {
    date,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    picks: []
  };

  if (fs.existsSync(file)) {
    try {
      existing = JSON.parse(fs.readFileSync(file, "utf-8"));
    } catch {}
  }

  const existingMap = new Map();

  for (const p of existing.picks || []) {
    const key = `${p.matchId}|${p.market}`;
    existingMap.set(key, p);
  }

  const newMap = new Map();

  for (const p of result.picks || []) {
    const key = `${p.matchId}|${p.market}`;
    newMap.set(key, p);
  }

  // 1. κρατάμε ό,τι ήδη υπάρχει
  const merged = new Map(existingMap);

  // 2. overwrite μόνο τα νέα picks
  for (const [key, val] of newMap) {
    const existingPick = existingMap.get(key);

    merged.set(key, {
      ...val,
      result: existingPick?.result ?? null
    });
  }

  const finalPicks = Array.from(merged.values());

  const payload = {
    date,
    createdAt: existing.createdAt || Date.now(),
    updatedAt: Date.now(),
    count: finalPicks.length,
    picks: finalPicks
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

  // 1X2 (NO DRAW)
  if (Number.isFinite(home) && Number.isFinite(away)) {
    const best = Math.max(home, away);
    const second = Math.min(home, away);
    const gap = best - second;

    if (best >= 0.58 && gap >= 0.08) {
      items.push({
        matchId: match.matchId,
        leagueSlug: match.leagueSlug,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        kickoff: match.kickoffUtc,
        market: "1X2",
        marketName: "1X2",
        pick: home > away ? "HOME" : "AWAY",
        score: best,
        confidence,
        signals,
        meta,
        context
      });
    }
  }

  if (over15 >= 0.62) {
    items.push({
      matchId: match.matchId,
      leagueSlug: match.leagueSlug,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      kickoff: match.kickoffUtc,
      market: "Over / Under 1.5",
      marketName: "Over / Under 1.5",
      pick: "Over 1.5",
      score: over15,
      confidence,
      signals,
      meta,
      context
    });
  }

  if (over25 >= 0.57) {
    items.push({
      matchId: match.matchId,
      leagueSlug: match.leagueSlug,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      kickoff: match.kickoffUtc,
      market: "Over / Under 2.5",
      marketName: "Over / Under 2.5",
      pick: "Over 2.5",
      score: over25,
      confidence,
      signals,
      meta,
      context
    });
  }

  if (over35 >= 0.60) {
    items.push({
      matchId: match.matchId,
      leagueSlug: match.leagueSlug,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      kickoff: match.kickoffUtc,
      market: "Over / Under 3.5",
      marketName: "Over / Under 3.5",
      pick: "Over 3.5",
      score: over35,
      confidence,
      signals,
      meta,
      context
    });
  }

  if (btts >= 0.57) {
    items.push({
      matchId: match.matchId,
      leagueSlug: match.leagueSlug,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      kickoff: match.kickoffUtc,
      market: "BTTS",
      marketName: "BTTS",
      pick: "BTTS YES",
      score: btts,
      confidence,
      signals,
      meta,
      context
    });
  }

  return items;
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

        const normalized = {
          ok: true,
          date: parsed.date || date,
          createdAt: parsed.createdAt ?? null,
          updatedAt: parsed.updatedAt ?? null,
          count: Array.isArray(parsed.picks) ? parsed.picks.length : 0,
          picks: Array.isArray(parsed.picks) ? parsed.picks : []
        };

        __valueDayCache.set(cacheKey, normalized);

        console.log("[value] snapshot hit", { date });

        return normalized;
      }
    } catch (e) {
      console.log("[value] snapshot read failed", e?.message || e);
    }
  }

  const now = Date.now();

  const matches = getActiveByDay(date).filter(m => {
    if (!isPlayable(m)) return false;

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

  const result = {
    ok: true,
    date,
    count: picks.length,
    picks
  };

  __valueDayCache.set(cacheKey, result);
  writeValueSnapshot(date, result);

  return result;
}