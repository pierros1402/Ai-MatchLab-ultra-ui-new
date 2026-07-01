/**
 * team-league-index.js
 *
 * Shared team → league attribution over accepted standings. Extracted verbatim
 * from run-odds-opening.js so both the odds-opening capture and the OddsPapi
 * board capture attribute fixtures to our leagues the same way — a fixture is
 * "ours" only when BOTH teams resolve into one league's table (fuzzy, ≥0.6).
 *
 * This is the filter that bounds OddsPapi board capture to leagues we cover
 * without needing OddsPapi's own competition taxonomy.
 */

import fs from "fs";

import { resolveDataPath } from "../storage/data-root.js";
import { readStandings } from "../storage/standings-memory-db.js";
import { readLeagueState } from "../storage/league-memory-db.js";
import { resolveAliasCandidates } from "../storage/team-aliases-db.js";
import { normalizeTeamKey as normalizeTeam, stripYouthSuffix } from "../core/normalize.js";

export function tokenJaccard(a, b) {
  const A = new Set(a.split(" ").filter(Boolean));
  const B = new Set(b.split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / new Set([...A, ...B]).size;
}

// Global team → league index from accepted standings. Domestic attribution
// indexes ACTIVE leagues; the cross-league index (activeOnly:false) includes
// every league with an accepted table (last-season included) for UEFA cups.
export function buildLeagueIndex({ activeOnly = true } = {}) {
  const dir = resolveDataPath("league-memory", "standings");
  const leagues = [];

  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith(".json")); } catch { /* none */ }

  for (const file of files) {
    const slug = file.replace(/\.json$/, "");
    if (activeOnly && readLeagueState(slug)?.state !== "active") continue;

    const rows = readStandings(slug)?.accepted?.rows;
    if (!Array.isArray(rows) || rows.length < 4) continue;

    const teams = [];
    for (const r of rows) {
      for (const cand of resolveAliasCandidates(slug, r.teamName)) {
        const n = normalizeTeam(cand);
        if (n) teams.push({ norm: n, row: r });
      }
    }
    let gf = 0, pld = 0;
    for (const r of rows) { gf += Number(r.goalsFor) || 0; pld += Number(r.played) || 0; }
    leagues.push({ slug, teams, leagueAvg: pld > 0 ? gf / pld : 1.35 });
  }
  return leagues;
}

export function findTeam(name, teams) {
  const norm = normalizeTeam(name);
  if (!norm) return null;
  let best = null, bestScore = 0;
  for (const t of teams) {
    const s = t.norm === norm ? 1 : tokenJaccard(norm, t.norm);
    if (s > bestScore) { bestScore = s; best = t; }
  }
  if (bestScore >= 0.6) return best;

  // Fallback: strip youth/reserve suffix and retry (e.g. "Flora U21" → "Flora")
  const stripped = stripYouthSuffix(name);
  if (stripped !== name) {
    const normStripped = normalizeTeam(stripped);
    let best2 = null, bestScore2 = 0;
    for (const t of teams) {
      const s = t.norm === normStripped ? 1 : tokenJaccard(normStripped, t.norm);
      if (s > bestScore2) { bestScore2 = s; best2 = t; }
    }
    if (bestScore2 >= 0.6) return best2;
  }

  return null;
}

// Find one team in ANY league (for cross-league cup / UEFA-qualifier matches).
export function findTeamAnyLeague(name, allLeagues) {
  let best = null, bestScore = 0;
  for (const lg of allLeagues) {
    const t = findTeam(name, lg.teams);
    if (!t) continue;
    const s = tokenJaccard(normalizeTeam(name), t.norm);
    if (s > bestScore) { bestScore = s; best = { slug: lg.slug, row: t.row, leagueAvg: lg.leagueAvg }; }
  }
  return best;
}

// Attribute a scraped match to the league whose standings contain BOTH teams.
export function attributeMatch(home, away, leagues) {
  let best = null, bestScore = 0;
  for (const lg of leagues) {
    const h = findTeam(home, lg.teams);
    const a = findTeam(away, lg.teams);
    if (!h || !a) continue;
    const score = (tokenJaccard(normalizeTeam(home), h.norm) + tokenJaccard(normalizeTeam(away), a.norm)) / 2;
    if (score > bestScore) { bestScore = score; best = { league: lg, home: h.row, away: a.row }; }
  }
  return best;
}
