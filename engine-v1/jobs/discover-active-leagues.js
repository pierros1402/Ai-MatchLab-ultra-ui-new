import fs from "fs";
import { getDataRoot, resolveDataPath } from "../storage/data-root.js";
import * as config from "../config.js";
import { fetchLeagueFixtures } from "../adapters/espn.js";
import { normalizeFixture } from "../core/normalize.js";
import { athensDayKey } from "../core/daykey.js";

const LEAGUE_SEEDS = config.LEAGUE_SEEDS || [];
const leagueName = config.leagueName;

const dataDir = getDataRoot();
const outPath = resolveDataPath("active-leagues.json");

function ensureDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function writeActiveLeagues(data) {
  ensureDir();
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2), "utf8");
}

export async function discoverActiveLeagues(dayKey = athensDayKey()) {
  const result = {
    createdAt: Date.now(),
    dayKey,
    leaguesScanned: 0,
    activeLeagueCount: 0,
    totalMatches: 0,
    leagues: []
  };

  const activeFromMatches = new Map();

  for (const slug of LEAGUE_SEEDS) {
    result.leaguesScanned++;

    const data = await fetchLeagueFixtures(slug, dayKey);
    const events = Array.isArray(data?.events) ? data.events : [];

    const matches = [];

    for (const event of events) {
      const normalized = normalizeFixture(event, slug);
      if (!normalized) continue;
      if (normalized.dayKey !== dayKey) continue;

      matches.push({
        matchId: normalized.matchId,
        kickoffUtc: normalized.kickoffUtc,
        homeTeam: normalized.homeTeam,
        awayTeam: normalized.awayTeam,
        status: normalized.status,
        rawStatus: normalized.rawStatus
      });
    }

    if (matches.length > 0) {
      activeFromMatches.set(slug, {
        slug,
        leagueName: leagueName(slug),
        matchCount: matches.length,
        matchIds: matches.map(x => x.matchId),
        matches
      });

      result.totalMatches += matches.length;
    }
  }

  const historyPath = resolveDataPath("history/2025-2026.json");
  const activeFromHistory = new Set();

  try {
    const history = JSON.parse(fs.readFileSync(historyPath, "utf8"));
    const days = Array.isArray(history?.days) ? history.days : [];
    const recentDays = days.slice(-7);

    for (const day of recentDays) {
      for (const row of day.rows || []) {
        if (row?.leagueSlug) {
          activeFromHistory.add(row.leagueSlug);
        }
      }
    }
  } catch (err) {
    console.warn("[discoverActiveLeagues] history fallback failed:", err.message);
  }

  const allActive = new Set([
    ...activeFromMatches.keys(),
    ...activeFromHistory
  ]);

  for (const slug of allActive) {
    const fromMatches = activeFromMatches.get(slug);

    if (fromMatches) {
      result.leagues.push(fromMatches);
    } else {
      result.leagues.push({
        slug,
        leagueName: leagueName(slug),
        matchCount: 0,
        matchIds: [],
        matches: []
      });
    }
  }

  result.activeLeagueCount = result.leagues.length;

  writeActiveLeagues(result);
  return result;
}