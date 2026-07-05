/**
 * derive-standings-from-results.js
 *
 * Builds a standings table from the results we ALREADY accumulate (results-memory)
 * for leagues that have NO Wikipedia table — the long-tail (Caribbean / Pacific /
 * small African) leagues Wikipedia doesn't cover but Flashscore does. No new source;
 * the table fills in as the daily results accumulation grows.
 *
 * Only writes for a league that lacks an accepted standings, and marks it
 * source="derived-from-results" (confidence low) so it's distinguishable from a
 * real scraped table. Partial by nature (covers the accumulated window).
 *
 * Usage: node engine-v1/jobs/derive-standings-from-results.js [--summary]
 * Guardrails: canonicalWrites 0 (writes only to league-memory/standings).
 */

import fs from "fs";
import { pathToFileURL } from "node:url";
import { resolveDataPath } from "../storage/data-root.js";
import { readResults } from "../storage/results-memory-db.js";
import { recordStandingsResult, hasAcceptedStandings } from "../storage/standings-memory-db.js";
import { getLeagueMeta } from "../source-discovery/league-awareness-service.js";
import { currentSeasonLabel } from "../source-discovery/season-calendar.js";

const MIN_TEAMS = 4;
const MIN_GAMES = 3;   // need a few games before a table is meaningful

function tableFromResults(slug) {
  const data = readResults(slug);
  const teams = data.teams || {};
  const names = Object.keys(teams);
  if (names.length < MIN_TEAMS) return null;

  const rows = [];
  let totalGames = 0;
  for (const name of names) {
    let P = 0, W = 0, D = 0, L = 0, GF = 0, GA = 0;
    for (const r of teams[name]) {
      P++; GF += Number(r.gf) || 0; GA += Number(r.ga) || 0;
      if (r.res === "W") W++; else if (r.res === "D") D++; else L++;
    }
    totalGames += P;
    rows.push({
      teamName: name, played: P, won: W, drawn: D, lost: L,
      // canonical field names too — compactRows() in standings-memory-db keeps
      // wins/draws/losses/position, so won/drawn/lost/rank alone are dropped
      wins: W, draws: D, losses: L,
      goalsFor: GF, goalsAgainst: GA, goalDifference: GF - GA, points: W * 3 + D
    });
  }
  if (totalGames / 2 < MIN_GAMES) return null;

  rows.sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor);
  rows.forEach((r, i) => { r.rank = i + 1; r.position = i + 1; });
  return rows;
}

export function deriveStandingsFromResults({ force = false } = {}) {
  const dir = resolveDataPath("league-memory", "results");
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith(".json")); } catch { /* none */ }

  const stats = { considered: 0, derived: 0, skippedHaveReal: 0, tooThin: 0, byLeague: {} };
  for (const file of files) {
    const slug = file.replace(/\.json$/, "");
    stats.considered++;

    const season = currentSeasonLabel(slug, getLeagueMeta(slug));
    if (!force && hasAcceptedStandings(slug, season)) { stats.skippedHaveReal++; continue; }

    const rows = tableFromResults(slug);
    if (!rows) { stats.tooThin++; continue; }

    recordStandingsResult(slug, {
      status: "accepted", slug, season,
      source: "derived-from-results", url: null,
      confidence: 0.3, rowCount: rows.length, rows
    });
    stats.derived++;
    stats.byLeague[slug] = rows.length;
  }
  return { ok: true, ...stats };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const r = deriveStandingsFromResults();
  console.log(JSON.stringify({ ...r, guarantees: { canonicalWrites: 0 } }, null, 2));
}
