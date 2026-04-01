import fs from "fs";
import path from "path";
import { LEAGUE_SEEDS, leagueName } from "../config.js";
import { fetchLeagueFixtures } from "../adapters/espn.js";
import { normalizeFixture } from "../core/normalize.js";
import { athensDayKey } from "../core/daykey.js";

const dataDir = path.resolve("data");
const outPath = path.join(dataDir, "active-leagues.json");

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
      result.leagues.push({
        slug,
        leagueName: leagueName(slug),
        matchCount: matches.length,
        matchIds: matches.map(x => x.matchId),
        matches
      });

      result.activeLeagueCount++;
      result.totalMatches += matches.length;
    }
  }

  writeActiveLeagues(result);
  return result;
}