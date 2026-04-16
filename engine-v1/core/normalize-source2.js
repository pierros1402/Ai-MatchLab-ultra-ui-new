import { LEAGUE_NAME_MAP } from "../config.js";
import { athensDayFromKickoff } from "./daykey.js";
import { buildMatchKey } from "./normalize.js";

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

function normalizeMinute(v) {
  if (v === null || v === undefined) return null;

  const n = Number(v);
  if (Number.isFinite(n)) return `${n}'`;

  return null;
}

// ============================================================
// MAIN NORMALIZER (COMPATIBLE WITH NEW source2.js)
// ============================================================

export function normalizeFixtureSource2(event, slug) {
  if (!event || typeof event !== "object") return null;

  const fixture = event.fixture || {};
  const teams = event.teams || {};
  const goals = event.goals || {};
  const meta = event.__meta || {};

  const kickoff = fixture.date;
  const homeTeam = teams?.home?.name;
  const awayTeam = teams?.away?.name;

  if (!kickoff || !homeTeam || !awayTeam) {
    return null;
  }

  const rawStatus = fixture?.status?.short || "UNKNOWN";
  const status = meta.normalizedStatus || "PRE";

  let scoreHome = parseScore(goals.home);
  let scoreAway = parseScore(goals.away);

  if (status === "PRE") {
    scoreHome = null;
    scoreAway = null;
  }

  const minute = normalizeMinute(fixture?.status?.elapsed);

  const matchKey = buildMatchKey({
    homeTeam,
    awayTeam,
    kickoffUtc: kickoff
  });

  const providerMatchId = fixture.id;

  return {
    matchId: String(providerMatchId || matchKey),
    matchKey,

    source: "source2",
    sourceId: String(providerMatchId || matchKey),
    sourceMatchId: String(providerMatchId || matchKey),

    leagueSlug: slug,
    leagueName: LEAGUE_NAME_MAP[slug] || slug,

    dayKey: athensDayFromKickoff(kickoff),
    kickoffUtc: kickoff,

    homeTeam: String(homeTeam),
    awayTeam: String(awayTeam),

    scoreHome,
    scoreAway,

    penalties: null,
    decidedBy: null,

    rawStatus: rawStatus,
    status,
    minute,

    venue: fixture?.venue?.name || null,

    state: "staging",
    finalized: 0,
    updatedAt: Date.now()
  };
}