import { LEAGUE_NAME_MAP } from "../config.js";
import { athensDayFromKickoff } from "./daykey.js";

function parseScore(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapSource2Status(rawStatus) {
  const s = String(rawStatus || "").toUpperCase();

  if (
    s.includes("FINAL") ||
    s.includes("FULL_TIME") ||
    s.includes("FT") ||
    s.includes("AET") ||
    s.includes("PEN")
  ) {
    return "STATUS_FINAL";
  }

  if (
    s.includes("IN_PROGRESS") ||
    s.includes("LIVE") ||
    s.includes("FIRST_HALF") ||
    s.includes("SECOND_HALF")
  ) {
    return "STATUS_IN_PROGRESS";
  }

  if (s.includes("HALF_TIME") || s === "HT") {
    return "STATUS_HALF_TIME";
  }

  return "STATUS_SCHEDULED";
}

export function normalizeFixtureSource2(event, slug) {
  if (!event || typeof event !== "object") return null;

  // ------------------------------------------------------------
  // Expected flexible source2 shape
  // Adjust field names later when real provider is chosen
  // ------------------------------------------------------------
  const matchId =
    event.matchId ||
    event.id ||
    event.fixtureId ||
    null;

  const kickoff =
    event.kickoffUtc ||
    event.kickoff ||
    event.date ||
    null;

  const homeTeam =
    event.homeTeam ||
    event.home ||
    event.teams?.home ||
    null;

  const awayTeam =
    event.awayTeam ||
    event.away ||
    event.teams?.away ||
    null;

  if (!matchId || !kickoff || !homeTeam || !awayTeam) {
    return null;
  }

  const rawStatus =
    event.rawStatus ||
    event.status ||
    "UNKNOWN";

  const status = mapSource2Status(rawStatus);

  let scoreHome = parseScore(
    event.scoreHome ?? event.homeScore
  );

  let scoreAway = parseScore(
    event.scoreAway ?? event.awayScore
  );

  if (status === "STATUS_SCHEDULED") {
    scoreHome = null;
    scoreAway = null;
  }

  return {
    matchId: String(matchId),
    source: "source2",
    sourceId: String(event.sourceId || matchId),

    leagueSlug: slug,
    leagueName: LEAGUE_NAME_MAP[slug] || slug,

    dayKey: athensDayFromKickoff(kickoff),
    kickoffUtc: kickoff,

    homeTeam: String(homeTeam),
    awayTeam: String(awayTeam),

    scoreHome,
    scoreAway,

    rawStatus: String(rawStatus),
    status,
    minute: event.minute ?? event.clock ?? null,

    venue: event.venue || null,

    state: "staging",
    finalized: 0,
    updatedAt: Date.now()
  };
}