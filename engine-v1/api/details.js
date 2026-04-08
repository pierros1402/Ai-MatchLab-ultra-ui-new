import fs from "fs";
import { getFixtureById } from "../storage/json-db.js";
import { athensDayFromKickoff } from "../core/daykey.js";
import { resolveDataPath } from "../storage/data-root.js";
import { buildDetailsForMatch } from "../jobs/build-details-day.js";

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function kickoffDay(match) {
  if (match?.dayKey) return String(match.dayKey);
  if (match?.kickoffUtc) return athensDayFromKickoff(match.kickoffUtc);
  return null;
}

function readValueForMatch(dayKey, matchId) {
  const file = resolveDataPath("value", `${dayKey}.json`);
  const payload = readJsonSafe(file, null);
  const picks = Array.isArray(payload?.picks) ? payload.picks : [];
  return picks.filter(p => String(p?.matchId) === String(matchId));
}

export function getDetailsPayload(matchId, { rebuild = false } = {}) {
  const match = getFixtureById(String(matchId));

  if (!match) {
    return { ok: false, error: "match_not_found", matchId: String(matchId) };
  }

  const dayKey = kickoffDay(match);

  if (!dayKey) {
    return { ok: false, error: "missing_day_key", matchId: String(matchId) };
  }

  const detailsFile = resolveDataPath("details", dayKey, `${match.matchId}.json`);

  let snapshot = readJsonSafe(detailsFile, null);

  if (!snapshot || rebuild) {
    const built = buildDetailsForMatch(match.matchId, { rebuild });
    snapshot = built?.details || null;
  }

  const value = readValueForMatch(dayKey, match.matchId);

  return {
    ok: true,
    matchId: String(match.matchId),
    dayKey,
    basic: {
      matchId: String(match.matchId),
      leagueSlug: match.leagueSlug || null,
      leagueName: match.leagueName || null,
      homeTeam: match.homeTeam || null,
      awayTeam: match.awayTeam || null,
      kickoffUtc: match.kickoffUtc || null,
      status: match.status || null,
      rawStatus: match.rawStatus || null,
      minute: match.minute || null,
      scoreHome: Number.isFinite(Number(match.scoreHome)) ? Number(match.scoreHome) : null,
      scoreAway: Number.isFinite(Number(match.scoreAway)) ? Number(match.scoreAway) : null,
      venue: match.venue || null
    },
    value,
    snapshot,
    meta: {
      hasSnapshot: !!snapshot,
      hasValue: value.length > 0,
      isLive: String(match.status || "").toUpperCase() === "LIVE",
      isFinal: String(match.status || "").toUpperCase() === "FT",
      version: "details-api-v1"
    }
  };
}