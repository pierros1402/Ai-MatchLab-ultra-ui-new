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

const DIR = resolveDataPath("h2h");
const MAX_MATCHES = 20;

function pairKey(a, b) {
  const na = normalizeTeamKey(a), nb = normalizeTeamKey(b);
  return na < nb ? `${na}~${nb}` : `${nb}~${na}`;
}

function fileFor(a, b) {
  return resolveDataPath("h2h", `${pairKey(a, b)}.json`);
}

export function readH2H(teamA, teamB) {
  try { return JSON.parse(fs.readFileSync(fileFor(teamA, teamB), "utf8")); }
  catch { return null; }
}

/**
 * Record one completed match in both teams' H2H file.
 * @param {{matchId,homeTeam,awayTeam,scoreHome,scoreAway,date,competition,leagueSlug}} m
 * @returns {boolean} true if stored as new entry
 */
export function recordH2H(m) {
  if (m.scoreHome == null || m.scoreAway == null) return false;
  if (!m.homeTeam || !m.awayTeam) return false;

  ensureDir(DIR);
  const file = fileFor(m.homeTeam, m.awayTeam);
  let data;
  try { data = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { data = { teamA: null, teamB: null, matches: [] }; }

  // Canonical team names (first seen wins)
  const na = normalizeTeamKey(m.homeTeam), nb = normalizeTeamKey(m.awayTeam);
  if (!data.teamA) {
    data.teamA = na < nb ? m.homeTeam : m.awayTeam;
    data.teamB = na < nb ? m.awayTeam : m.homeTeam;
  }

  if ((data.matches || []).some(x => x.matchId === m.matchId)) return false; // dedup

  data.matches = [
    {
      matchId: m.matchId,
      date: m.date || null,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
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
  const atHome = all.filter(m => normalizeTeamKey(m.homeTeam) === normalizeTeamKey(homeTeam));
  const atAway = all.filter(m => normalizeTeamKey(m.homeTeam) === normalizeTeamKey(awayTeam));

  function summary(matches, home, away) {
    let w = 0, d = 0, l = 0, gf = 0, ga = 0;
    for (const m of matches) {
      const isHome = normalizeTeamKey(m.homeTeam) === normalizeTeamKey(home);
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
