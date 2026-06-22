import fs from "fs";
import { getFixtureById } from "../storage/json-db.js";
import { athensDayFromKickoff } from "../core/daykey.js";
import { resolveDataPath } from "../storage/data-root.js";
import { buildDetailsForMatch } from "../jobs/build-details-day.js";
import { readOdds } from "../storage/odds-memory-db.js";
import { teamDisciplineRates } from "../storage/discipline-memory-db.js";

// Map our appointed-referee tendencies (from aiAssessment.referee) to the shape the
// details panel already renders: { name, style, stats:{avgCards, avgPenalties} }.
function refereeForDetails(matchId) {
  const r = readOdds(matchId)?.aiAssessment?.referee;
  if (!r || !r.name) return null;
  const cards = (Number(r.yellowPerGame) || 0) + (Number(r.redPerGame) || 0);
  const round2 = v => (v == null ? null : Math.round(v * 100) / 100);
  const style = cards >= 4.5 ? "strict" : cards <= 2.5 ? "lenient" : "balanced";
  return {
    name: r.name,
    style,
    stats: { avgCards: round2(cards), avgPenalties: round2(r.penPerGame) },
    appearances: r.appearances ?? null,
    source: r.source || "transfermarkt"
  };
}

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

export async function getDetailsPayload(matchId, { rebuild = false } = {}) {
  let match = getFixtureById(String(matchId));

  // Our autonomous Flashscore matches (fs_*) live in odds-memory, not the canonical
  // json-db, so fall back to that record for the match basics.
  if (!match) {
    const odds = readOdds(String(matchId));
    if (odds) {
      match = {
        matchId: String(matchId),
        leagueSlug: odds.leagueSlug || null,
        leagueName: odds.competition || null,
        homeTeam: odds.home || null,
        awayTeam: odds.away || null,
        kickoffUtc: odds.kickoffUtc || null,
        dayKey: odds.dayKey || null,
        status: "SCHEDULED"
      };
    }
  }

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
    try {
      const built = await buildDetailsForMatch(match.matchId, { rebuild });
      snapshot = built?.details || null;
    } catch {
      // Builder only knows canonical matches; ours still get the referee merge below.
      snapshot = snapshot || null;
    }
  }

  // Merge our appointed referee + tendencies (from odds-memory) into the snapshot,
  // without clobbering any referee the platform builder already produced.
  const referee = refereeForDetails(match.matchId);
  if (referee) {
    snapshot = snapshot || {};
    if (!snapshot.referee || !snapshot.referee.name) snapshot.referee = referee;
  }

  // Our own AI assessment (form-aware fair odds) — shown for EVERY match we priced,
  // independent of the value run. Plus per-team discipline (cards/fouls/penalties).
  const oddsRec = readOdds(String(match.matchId));
  const assessment = oddsRec?.aiAssessment
    ? { model: oddsRec.aiAssessment.model || null, markets: oddsRec.aiAssessment.markets || null }
    : null;
  const slug = match.leagueSlug;
  const discipline = slug ? {
    home: teamDisciplineRates(slug, match.homeTeam),
    away: teamDisciplineRates(slug, match.awayTeam)
  } : null;

  // Also expose on the snapshot so the existing detailed render (which reads `snap`)
  // can surface them without threading the whole payload through.
  if (assessment || discipline) {
    snapshot = snapshot || {};
    if (assessment && !snapshot.assessment) snapshot.assessment = assessment;
    if (discipline && !snapshot.discipline) snapshot.discipline = discipline;
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
    assessment,
    discipline,
    snapshot,
    meta: {
      hasSnapshot: !!snapshot,
      hasAssessment: !!assessment,
      hasValue: value.length > 0,
      isLive: String(match.status || "").toUpperCase() === "LIVE",
      isFinal: String(match.status || "").toUpperCase() === "FT",
      version: "details-api-v1"
    }
  };
}