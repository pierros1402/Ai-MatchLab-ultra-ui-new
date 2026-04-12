import { LEAGUE_NAME_MAP } from "../config.js";
import { athensDayFromKickoff } from "./daykey.js";
import { mapStatus } from "./status-map.js";

function parseScore(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeFixture(event, slug) {
  const comp = event?.competitions?.[0];
  if (!comp) return null;

  const home = comp?.competitors?.find(c => c.homeAway === "home");
  const away = comp?.competitors?.find(c => c.homeAway === "away");

  const kickoff = event?.date || comp?.date || null;
  if (!kickoff) return null;

  const rawStatus = comp?.status?.type?.name || "UNKNOWN";
  const status = mapStatus(rawStatus);

  let scoreHome = parseScore(home?.score);
  let scoreAway = parseScore(away?.score); 

  let penalties = null;

  // ESPN penalty extraction
  const homeShootout = parseScore(home?.shootoutScore);
  const awayShootout = parseScore(away?.shootoutScore);

  if (
    Number.isFinite(homeShootout) &&
    Number.isFinite(awayShootout)
  ) {
    penalties = {
      home: homeShootout,
      away: awayShootout
    };
  }

  // ------------------------------------------------------------
  // PRE / SCHEDULED → no scores
  // ------------------------------------------------------------
  if (status === "STATUS_SCHEDULED" || status === "PRE") {
    scoreHome = null;
    scoreAway = null;
  }

  return {
    matchId: String(event.id),
    source: "espn",
    sourceId: String(event.id),

    leagueSlug: slug,
    leagueName: LEAGUE_NAME_MAP[slug] || slug,

    dayKey: athensDayFromKickoff(kickoff),
    kickoffUtc: kickoff,

    homeTeam: home?.team?.displayName || null,
    awayTeam: away?.team?.displayName || null,

    scoreHome,
    scoreAway,
    penalties,
    decidedBy: penalties ? "pens" : null,

    rawStatus,
    status,
    minute: comp?.status?.displayClock || null,

    venue: comp?.venue?.fullName || null,

    state: "staging",
    finalized: 0,
    updatedAt: Date.now()
  };
}