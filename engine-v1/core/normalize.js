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

const TEAM_NAME_REPAIRS = new Map([
  ["AtlΓ©tico de San Luis", "Atlético de San Luis"],
  ["MazatlΓ΅n FC", "Mazatlán FC"]
]);

function repairTeamDisplayName(name = "") {
  const raw = String(name || "").trim();
  if (!raw) return null;
  return TEAM_NAME_REPAIRS.get(raw) || raw;
}

// ─── Canonical team-name normalization (single source of truth) ─────────────────
// Strips ONLY generic football affixes/connectives — never distinctive identity
// words (real, atletico, sporting, deportivo, racing…) so Real Madrid and Atlético
// Madrid stay distinct. normalizeTeamTokens keeps spaces (token Jaccard);
// normalizeTeamKey removes them (exact-equality keys / dedup).
const TEAM_AFFIX_RE =
  /\b(fc|afc|cf|sc|ac|cd|ca|ec|se|ad|sv|fk|if|bk|aif|club|calcio|fodbold|futebol|footballclub|dos|das|de|do|da|e)\b/g;

export function normalizeTeamTokens(name = "") {
  return String(name || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[.'`’]/g, "")            // collapse dotted abbreviations: f.c. → fc
    .replace(TEAM_AFFIX_RE, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeTeamKey(name = "") {
  return normalizeTeamTokens(name).replace(/ /g, "");
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

  const homeTeam = repairTeamDisplayName(home?.team?.displayName || null);
  const awayTeam = repairTeamDisplayName(away?.team?.displayName || null);
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