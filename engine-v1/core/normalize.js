import { LEAGUE_NAME_MAP } from "../config.js";
import { athensDayFromKickoff } from "./daykey.js";
import { mapStatus } from "./status-map.js";
import { buildCanonicalId } from "./canonical-id.js";
import { isPreKickoffNonPlayed } from "./non-played-state.js";

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

// Strip youth/reserve suffixes for standings lookup only.
// Do NOT use in canonical ID generation — U21 teams have distinct IDs from parent clubs.
const YOUTH_SUFFIX_RE = /\s+(u\d{2}|ii|b|reserves?|youth|juniors?|sub[-\s]?\d{2})$/i;

export function stripYouthSuffix(name = "") {
  return String(name || "").trim().replace(YOUTH_SUFFIX_RE, "").trim();
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
  const preKickoffNonPlayed = isPreKickoffNonPlayed({ status, rawStatus });

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

  if (status === "STATUS_SCHEDULED" || status === "PRE" || preKickoffNonPlayed) {
    scoreHome = null;
    scoreAway = null;
  }

  if (preKickoffNonPlayed) {
    penalties = null;
  }

  const matchKey = buildMatchKey({
    homeTeam,
    awayTeam,
    kickoffUtc: kickoff
  });
  // Canonical identity must use the Athens/dayKey calendar day, not the UTC
  // kickoff date. ESPN can return 23:00Z matches that belong to the next
  // Athens day; using kickoff directly would create a previous-day cid_*.
  const dayKey = event?.dayKey || athensDayFromKickoff(kickoff);
  const canonicalId = buildCanonicalId(slug, homeTeam, awayTeam, dayKey || kickoff);

  return {
    // canonicalId is the primary stable key — provider-agnostic
    canonicalId,
    // matchId kept for backward compatibility; equals espn sourceId for now
    matchId: String(event.id),
    matchKey,
    source: "espn",
    sourceId: String(event.id),
    sourceMatchId: String(event.id),

    leagueSlug: slug,
    leagueName: LEAGUE_NAME_MAP[slug] || slug,
    dayKey,
    kickoffUtc: kickoff,

    homeTeam,
    awayTeam,

    scoreHome,
    scoreAway,
    penalties,
    decidedBy: preKickoffNonPlayed ? null : (penalties ? "pens" : decidedBy),

    rawStatus,
    status,
    minute: preKickoffNonPlayed ? null : (comp?.status?.displayClock || null),

    venue: comp?.venue?.fullName || null,

    state: "staging",
    finalized: 0,
    updatedAt: Date.now()
  };
}