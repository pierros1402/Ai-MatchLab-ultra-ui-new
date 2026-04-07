import fs from "fs";
import path from "path";
import { getActiveByDay } from "../storage/json-db.js";
import {
  evaluateMatchValue,
  loadValueIndexes,
  loadModelPriors
} from "./value-engine-v1.js";

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
  const dir = path.join(process.cwd(), "data", "value");

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const file = path.join(dir, `${date}.json`);

  const payload = {
    date,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    count: result.picks.length,
    picks: result.picks.map(p => ({
      matchId: p.matchId,
      leagueSlug: p.leagueSlug,
      homeTeam: p.homeTeam,
      awayTeam: p.awayTeam,
      kickoff: p.kickoff,
      market: p.market,
      marketName: p.marketName,
      pick: p.pick,
      score: p.score,
      confidence: p.confidence,
      result: null
    }))
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
        confidence
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
      confidence
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
      confidence
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
      confidence
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
      confidence
    });
  }

  return items;
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
    const file = path.join(process.cwd(), "data", "value", `${date}.json`);

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
      const value = await evaluateMatchValue(
        {
          ...match,
          kickoff: match.kickoffUtc,
          season
        },
        { season, indexes, priors }
      );

      if (!value) continue;

      picks.push(...expandValueMarkets(match, value));
    } catch (_) {}
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