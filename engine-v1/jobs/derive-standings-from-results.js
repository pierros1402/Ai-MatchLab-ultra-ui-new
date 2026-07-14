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
import { recordStandingsResult, readStandings, clearAcceptedStandings } from "../storage/standings-memory-db.js";
import { getLeagueMeta } from "../source-discovery/league-awareness-service.js";
import { currentSeasonLabel, seasonWindow } from "../source-discovery/season-calendar.js";
import { maxPlayableGames, isKnownNonLeagueCompetition } from "../core/matchday-axis.js";

const MIN_TEAMS = 4;
const MIN_GAMES = 3;   // need a few games before a table is meaningful

/**
 * Concrete [from, to) UTC millisecond bounds for the season currently in
 * progress, derived from the league's season window (start/end MONTHS) and today.
 * results-memory accumulates EVERY match a league ever played (5+ seasons), so
 * without this bound the table sums all-time games — the cumulative-standings
 * corruption the matchday axis flags (mex.1 played 213, aze.1 169 …).
 */
export function currentSeasonBounds(slug, meta = {}, date = new Date()) {
  const { start, end } = seasonWindow(slug, meta);
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  if (start <= end) {
    // Calendar-year season (Brazil, Sweden, Mexico Apertura window, …).
    return { from: Date.UTC(y, start - 1, 1), to: Date.UTC(y, end, 1) };
  }
  // Cross-year season (Aug→May): identified by the year it started in. `end` is
  // 1-based, so Date.UTC(year, end, 1) is the first day AFTER the end month.
  const startYear = (m >= start) ? y : y - 1;
  return { from: Date.UTC(startYear, start - 1, 1), to: Date.UTC(startYear + 1, end, 1) };
}

function matchTime(r) {
  const t = Date.parse(r?.date || r?.kickoff || r?.dayKey || "");
  return Number.isNaN(t) ? null : t;
}

function tableFromResults(slug, meta = {}) {
  const data = readResults(slug);
  const teams = data.teams || {};
  const names = Object.keys(teams);
  if (names.length < MIN_TEAMS) return null;

  const { from, to } = currentSeasonBounds(slug, meta);

  const rows = [];
  let totalGames = 0;
  for (const name of names) {
    let P = 0, W = 0, D = 0, L = 0, GF = 0, GA = 0;
    for (const r of teams[name]) {
      // Current season only — drop earlier seasons still in results-memory.
      const t = matchTime(r);
      if (t == null || t < from || t >= to) continue;
      P++; GF += Number(r.gf) || 0; GA += Number(r.ga) || 0;
      if (r.res === "W") W++; else if (r.res === "D") D++; else L++;
    }
    totalGames += P;
    // A team with zero games in the season window is NOT a current participant —
    // it's a relegated/withdrawn club that still has older results in
    // results-memory (e.g. blr.1 carries 9 such: Shakhtyor, Slutsk, Smorgon …).
    // Listing it as a played=0 row pollutes the table (and drags matchdayMin to 0),
    // so drop it; a real team gets its row back the moment it plays.
    if (P === 0) continue;
    rows.push({
      teamName: name, played: P, won: W, drawn: D, lost: L,
      // canonical field names too — compactRows() in standings-memory-db keeps
      // wins/draws/losses/position, so won/drawn/lost/rank alone are dropped
      wins: W, draws: D, losses: L,
      goalsFor: GF, goalsAgainst: GA, goalDifference: GF - GA, points: W * 3 + D
    });
  }
  if (totalGames / 2 < MIN_GAMES || rows.length < MIN_TEAMS) return null;

  rows.sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor);
  rows.forEach((r, i) => { r.rank = i + 1; r.position = i + 1; });
  return rows;
}

export function deriveStandingsFromResults({ force = false, leagues = null } = {}) {
  const dir = resolveDataPath("league-memory", "results");
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith(".json")); } catch { /* none */ }

  const only = Array.isArray(leagues) && leagues.length ? new Set(leagues) : null;

  const stats = { considered: 0, derived: 0, skippedHaveReal: 0, tooThin: 0, clearedCorrupt: 0, byLeague: {} };
  for (const file of files) {
    const slug = file.replace(/\.json$/, "");
    if (only && !only.has(slug)) continue;
    stats.considered++;

    // Cups / qualifiers / national-team competitions are knockout or phase-based:
    // accumulating their results into a single "league table" produces garbage
    // (last season's holders still in the table, both name universes as separate
    // rows — see uefa.champions 2026-07-14). Never derive for them, and clear any
    // previously-derived table so the stored garbage self-heals.
    if (isKnownNonLeagueCompetition(slug)) {
      if (readStandings(slug)?.accepted?.source === "derived-from-results") {
        clearAcceptedStandings(slug, "not_league_competition");
        stats.clearedCorrupt++;
      }
      stats.skippedNotLeague = (stats.skippedNotLeague || 0) + 1;
      continue;
    }

    const meta = getLeagueMeta(slug);
    const season = currentSeasonLabel(slug, meta);

    let accepted = readStandings(slug)?.accepted;

    // Drop a previously-DERIVED table that is a corrupt all-time aggregate
    // (played beyond a quadruple round-robin) BEFORE anything else. Done up
    // front — not just when the current season is thin — because such a table is
    // often mislabelled (e.g. an Aug→May league stamped "2026" instead of
    // "2025-26"), and shouldReplace() would otherwise keep the corrupt one and
    // reject the correct current-season derive as an "older" season.
    if (accepted?.source === "derived-from-results") {
      const teams = accepted.rows?.length || 0;
      const maxPlayed = Math.max(0, ...(accepted.rows || []).map(r => Number(r.played) || 0));
      if (teams >= 2 && maxPlayed > maxPlayableGames(teams, 4)) {
        clearAcceptedStandings(slug, "corrupt_all_time_aggregate");
        stats.clearedCorrupt++;
        accepted = null;
      }
    }

    // Skip only when a REAL (non-derived) table already covers this season — a
    // scraped Wikipedia table must never be clobbered. A remaining DERIVED table
    // is refreshed every run so it grows with the accumulating results.
    const hasRealForSeason = accepted &&
      accepted.source !== "derived-from-results" &&
      String(accepted.season) === String(season) &&
      Array.isArray(accepted.rows) && accepted.rows.length > 0;
    if (!force && hasRealForSeason) { stats.skippedHaveReal++; continue; }

    const rows = tableFromResults(slug, meta);
    // Too thin to build a meaningful table; the corrupt aggregate (if any) has
    // already been cleared above, so the honest state is "no standings yet".
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
  const args = process.argv.slice(2);
  const val = (k) => { const hit = args.find(a => a.startsWith(`${k}=`)); return hit ? hit.slice(k.length + 1) : null; };
  const leagues = String(val("--leagues") || "").split(",").map(s => s.trim()).filter(Boolean);
  const r = deriveStandingsFromResults({ force: args.includes("--force"), leagues });
  console.log(JSON.stringify({ ...r, guarantees: { canonicalWrites: 0 } }, null, 2));
}
