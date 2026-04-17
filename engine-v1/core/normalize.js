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

function normalizeTeamKey(name = "") {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")

    // 🔥 NEW — remove common suffixes
    .replace(/\b(fc|cf|sc|if|ac|afc|club|footballclub|fodbold|fk)\b/g, "")

    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function roundKickoffTo10Min(utc) {
  const ts = new Date(utc || 0).getTime();
  if (!Number.isFinite(ts) || ts <= 0) return "0";

  const rounded = Math.round(ts / (10 * 60 * 1000)) * (10 * 60 * 1000);
  return String(rounded);
}

export function buildMatchKey({ homeTeam, awayTeam, kickoffUtc }) {
  return [
    normalizeTeamKey(homeTeam),
    normalizeTeamKey(awayTeam),
    roundKickoffTo10Min(kickoffUtc)
  ].join("|");
}

export function normalizeFixture(event, slug) {
  const comp = event?.competitions?.[0];
  if (!comp) return null;

  const home = comp?.competitors?.find(c => c.homeAway === "home");
  const away = comp?.competitors?.find(c => c.homeAway === "away");

  const kickoff = event?.date || comp?.date || null;
  if (!kickoff) return null;

  const homeTeam = home?.team?.displayName || null;
  const awayTeam = away?.team?.displayName || null;
  if (!homeTeam || !awayTeam) return null;

  const rawStatus = comp?.status?.type?.name || "UNKNOWN";
  const status = mapStatus(rawStatus);

  const decidedBy =
    String(rawStatus || "").toUpperCase().includes("PEN")
      ? "pens"
      : null;

  let scoreHome = parseScore(home?.score);
  let scoreAway = parseScore(away?.score);

  let penalties = null;

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

  if (status === "STATUS_SCHEDULED" || status === "PRE") {
    scoreHome = null;
    scoreAway = null;
  }

  const matchKey = buildMatchKey({
    homeTeam,
    awayTeam,
    kickoffUtc: kickoff
  });

  return {
    matchId: String(event.id), // κρατιέται προσωρινά για backward compatibility
    matchKey,
    source: "espn",
    sourceId: String(event.id),
    sourceMatchId: String(event.id),

    leagueSlug: slug,
    leagueName: LEAGUE_NAME_MAP[slug] || slug,

    dayKey: athensDayFromKickoff(kickoff),
    kickoffUtc: kickoff,

    homeTeam,
    awayTeam,

    scoreHome,
    scoreAway,
    penalties,
    decidedBy: penalties ? "pens" : decidedBy,

    rawStatus,
    status,
    minute: comp?.status?.displayClock || null,

    venue: comp?.venue?.fullName || null,

    state: "staging",
    finalized: 0,
    updatedAt: Date.now()
  };
}