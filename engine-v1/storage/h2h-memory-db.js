/**
 * h2h-memory-db.js
 *
 * Head-to-head match history keyed by team pair (alphabetical, league-agnostic).
 * Populated by accumulate-h2h.js from ALL Flashscore completed matches — no
 * standing requirement, so even untracked leagues build up H2H over time.
 *
 * File: data/h2h/{normA}~{normB}.json
 *   { teamA, teamB, matches:[{matchId,date,homeTeam,awayTeam,scoreHome,scoreAway,
 *                             competition,leagueSlug}], updatedAt }
 */

import fs from "fs";
import { resolveDataPath, ensureDir } from "./data-root.js";
import { normalizeTeamKey } from "../core/normalize.js";
import { globalCanonicalTeamName } from "./team-aliases-db.js";

const DIR = resolveDataPath("h2h");
const MAX_MATCHES = 20;

// H2H is league-agnostic, so it uses the GLOBAL (cross-league, collision-safe)
// identity resolver to fold spelling variants of the same club onto one key —
// otherwise "Dinamo Minsk" (ESPN) and "Din. Minsk" (Flashscore) split a pair's
// meetings across two files and a lookup by the fixture name finds only some.
const canon = (name) => globalCanonicalTeamName(name) || name;
const canonKey = (name) => normalizeTeamKey(canon(name));
const rawKey = (name) => normalizeTeamKey(name);

function pairKeyOf(na, nb) {
  return na < nb ? `${na}~${nb}` : `${nb}~${na}`;
}

/** Canonical file key (spelling variants folded to one identity). */
export function canonPairKey(a, b) {
  return pairKeyOf(canonKey(a), canonKey(b));
}

function fileForKey(key) {
  return resolveDataPath("h2h", `${key}.json`);
}

export function readH2H(teamA, teamB) {
  const ck = canonPairKey(teamA, teamB);
  try { return JSON.parse(fs.readFileSync(fileForKey(ck), "utf8")); } catch { /* fall through */ }
  // Fallback to the pre-canonicalization key so lookups keep working before the
  // one-off re-key migration has consolidated an old-spelling file (no regression).
  const rk = pairKeyOf(rawKey(teamA), rawKey(teamB));
  if (rk !== ck) {
    try { return JSON.parse(fs.readFileSync(fileForKey(rk), "utf8")); } catch { /* none */ }
  }
  return null;
}

/**
 * Record one completed match in both teams' H2H file.
 * @param {{matchId,homeTeam,awayTeam,scoreHome,scoreAway,date,competition,leagueSlug}} m
 * @returns {boolean} true if stored as new entry
 */
export function recordH2H(m) {
  if (m.scoreHome == null || m.scoreAway == null) return false;
  if (!m.homeTeam || !m.awayTeam) return false;

  // Store under canonical identity so the same club never splits across two
  // spellings — both the file key and the stored names are canonicalized.
  const homeTeam = canon(m.homeTeam);
  const awayTeam = canon(m.awayTeam);

  ensureDir(DIR);
  const file = fileForKey(canonPairKey(m.homeTeam, m.awayTeam));
  let data;
  try { data = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { data = { teamA: null, teamB: null, matches: [] }; }

  // Canonical team names (first seen wins)
  const na = canonKey(m.homeTeam), nb = canonKey(m.awayTeam);
  if (!data.teamA) {
    data.teamA = na < nb ? homeTeam : awayTeam;
    data.teamB = na < nb ? awayTeam : homeTeam;
  }

  if ((data.matches || []).some(x => x.matchId === m.matchId)) return false; // dedup

  data.matches = [
    {
      matchId: m.matchId,
      date: m.date || null,
      homeTeam,
      awayTeam,
      scoreHome: m.scoreHome,
      scoreAway: m.scoreAway,
      competition: m.competition || null,
      leagueSlug: m.leagueSlug || null
    },
    ...(data.matches || [])
  ]
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, MAX_MATCHES);

  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  return true;
}

/**
 * H2H shaped for the details API: all matches + venue-filtered subsets.
 * homeTeam / awayTeam are the TODAY'S match participants (home = playing at home).
 */
export function getH2HForMatch(homeTeam, awayTeam) {
  const data = readH2H(homeTeam, awayTeam);
  if (!data || !data.matches?.length) return null;

  const all = data.matches;
  // Compare on canonical keys so venue/perspective splits are correct even when
  // a stored match still carries a pre-migration spelling of the participant.
  const atHome = all.filter(m => canonKey(m.homeTeam) === canonKey(homeTeam));
  const atAway = all.filter(m => canonKey(m.homeTeam) === canonKey(awayTeam));

  function summary(matches, home, away) {
    let w = 0, d = 0, l = 0, gf = 0, ga = 0;
    for (const m of matches) {
      const isHome = canonKey(m.homeTeam) === canonKey(home);
      const mGf = isHome ? m.scoreHome : m.scoreAway;
      const mGa = isHome ? m.scoreAway : m.scoreHome;
      gf += mGf; ga += mGa;
      if (mGf > mGa) w++; else if (mGf < mGa) l++; else d++;
    }
    const n = matches.length;
    return n ? { wins: w, draws: d, losses: l, gfPerGame: +(gf / n).toFixed(2), gaPerGame: +(ga / n).toFixed(2), sample: n } : null;
  }

  return {
    homeTeam,
    awayTeam,
    all,
    atHome,
    atAway,
    summary: {
      all:    summary(all,    homeTeam, awayTeam),
      atHome: summary(atHome, homeTeam, awayTeam),
      atAway: summary(atAway, homeTeam, awayTeam)
    }
  };
}
