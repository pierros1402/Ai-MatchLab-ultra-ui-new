import { LEAGUE_NAME_MAP } from "../config.js";
import { athensDayFromKickoff } from "./daykey.js";

// ============================================================
// HELPERS
// ============================================================

function parseScore(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// ------------------------------------------------------------
// STATUS → CANONICAL (PRE / LIVE / FT)
// ------------------------------------------------------------
function mapStatus(rawStatus) {
  const s = String(rawStatus || "").toUpperCase();

  if (
    s.includes("FINAL") ||
    s.includes("FULL_TIME") ||
    s.includes("FT") ||
    s.includes("AET") ||
    s.includes("PEN")
  ) {
    return "FT";
  }

  if (
    s.includes("LIVE") ||
    s.includes("IN_PROGRESS") ||
    s.includes("FIRST_HALF") ||
    s.includes("SECOND_HALF") ||
    s.includes("HT")
  ) {
    return "LIVE";
  }

  return "PRE";
}

// ------------------------------------------------------------
// MINUTE NORMALIZATION
// ------------------------------------------------------------
function normalizeMinute(v) {
  if (!v) return "0'";

  const s = String(v).trim();

  // ήδη σωστό
  if (/^\d+\+?\d*'$/.test(s)) return s;

  // 45:23 → 45'
  const match = s.match(/^(\d{1,3})/);
  if (match) return `${match[1]}'`;

  // fallback
  return "0'";
}

// ============================================================
// MAIN NORMALIZER
// ============================================================

export function normalizeFixtureSource2(event, slug) {
  if (!event || typeof event !== "object") return null;

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

  const status = mapStatus(rawStatus);

  let scoreHome = parseScore(
    event.scoreHome ?? event.homeScore
  );

  let scoreAway = parseScore(
    event.scoreAway ?? event.awayScore
  );

  // PRE → no scores
  if (status === "PRE") {
    scoreHome = null;
    scoreAway = null;
  }

  const minute = normalizeMinute(
    event.minute ?? event.clock
  );

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
    minute,

    venue: event.venue || null,

    state: "staging",
    finalized: 0,
    updatedAt: Date.now()
  };
}