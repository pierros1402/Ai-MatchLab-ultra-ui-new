/**
 * run-history-seasons.js
 *
 * Builds the multi-season standings HISTORY (proistoria): the final tables of the
 * last N completed seasons per league, into standings-history-db (separate from
 * the live current-season standings, which never holds more than one season).
 *
 * Season selection is state-aware:
 *   - off-season league → currentSeasonLabel is already the completed season → start there
 *   - active league     → currentSeasonLabel is in progress → start one season back
 * then walk back N seasons total. Handles "YYYY" and "YYYY-YY" labels.
 *
 * Resumable: skips (league, season) pairs already stored. Only leagues that
 * already have a current accepted table are processed (others have no source).
 *
 * Usage:
 *   node engine-v1/jobs/run-history-seasons.js --allow-search [--seasons 5] [--max 60]
 *   node engine-v1/jobs/run-history-seasons.js --summary
 *
 * Guardrails: canonicalWrites 0; writes only to league-memory/standings-history.
 */

import fs from "fs";
import { pathToFileURL } from "node:url";

import { resolveDataPath } from "../storage/data-root.js";
import { researchStandings } from "../source-discovery/standings-researcher.js";
import { isDisabledLeague } from "../source-discovery/disabled-leagues.js";
import { getLeagueMeta } from "../source-discovery/league-awareness-service.js";
import { currentSeasonLabel } from "../source-discovery/season-calendar.js";
import { readLeagueState } from "../storage/league-memory-db.js";
import { hasAcceptedStandings } from "../storage/standings-memory-db.js";
import { hasSeasonHistory, recordSeasonHistory, getHistorySummary } from "../storage/standings-history-db.js";

function log(...a) { console.log("[run-history-seasons]", ...a); }

function decrementSeason(label) {
  const s = String(label);
  const m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const y1 = parseInt(m[1], 10) - 1;
    const y2 = (y1 + 1) % 100;
    return `${y1}-${String(y2).padStart(2, "0")}`;
  }
  const y = parseInt(s, 10);
  return Number.isFinite(y) ? String(y - 1) : null;
}

// The N most-recent COMPLETED seasons for a league, newest first.
function recentCompletedSeasons(slug, meta, state, n) {
  const current = currentSeasonLabel(slug, meta);
  let label = state === "active" ? decrementSeason(current) : current;
  const out = [];
  while (label && out.length < n) { out.push(label); label = decrementSeason(label); }
  return out;
}

// Leagues that currently hold an ACCEPTED table (a source exists). Stub/needs_review
// files are skipped so the job doesn't grind the long-tail and never reach the
// big leagues that actually have history.
function leaguesWithCurrentStandings() {
  const dir = resolveDataPath("league-memory", "standings");
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith(".json")); } catch { /* none */ }
  return files
    .filter(f => {
      try { return !!JSON.parse(fs.readFileSync(resolveDataPath("league-memory", "standings", f), "utf8")).accepted; }
      catch { return false; }
    })
    .map(f => f.replace(/\.json$/, ""));
}

function parseArgs(argv) {
  const out = { allowSearch: false, seasons: 5, max: 60, summary: false };
  for (let i = 0; i < argv.length; i++) {
    const a = String(argv[i] || "").trim();
    if (a === "--allow-search") out.allowSearch = true;
    else if (a === "--summary") out.summary = true;
    else if (a === "--seasons" && argv[i + 1]) { const n = parseInt(argv[++i], 10); if (n > 0) out.seasons = n; }
    else if (a === "--max" && argv[i + 1]) { const n = parseInt(argv[++i], 10); if (n > 0) out.max = n; }
  }
  return out;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.summary) {
    console.log(JSON.stringify({ ok: true, history: getHistorySummary() }, null, 2));
    return;
  }

  const slugs = leaguesWithCurrentStandings();
  const stats = { leaguesConsidered: slugs.length, fetched: 0, accepted: 0, skipped: 0, needsReview: 0, results: [] };

  outer:
  for (const slug of slugs) {
    if (isDisabledLeague(slug)) continue;   // deactivated: never searched
    const meta = getLeagueMeta(slug);
    if (!meta?.name) continue;
    const state = readLeagueState(slug)?.state || "unknown";
    const seasons = recentCompletedSeasons(slug, meta, state, opts.seasons);

    for (const season of seasons) {
      if (stats.fetched >= opts.max) break outer;

      // already have it, or it's the live current table (no need to duplicate)
      if (hasSeasonHistory(slug, season)) { stats.skipped++; continue; }
      if (hasAcceptedStandings(slug, season)) { stats.skipped++; continue; }

      stats.fetched++;
      if (!opts.allowSearch) { stats.results.push({ slug, season, dryRun: true }); continue; }

      try {
        await new Promise(r => setTimeout(r, 1200 + Math.random() * 1500));
        const research = await researchStandings(slug, meta.name, meta.country, { season, allowSearch: true });
        if (research.status === "accepted") {
          recordSeasonHistory(slug, season, research);
          stats.accepted++;
        } else {
          stats.needsReview++;
        }
        log("season", { slug, state, season, status: research.status, rows: research.rowCount });
      } catch (err) {
        stats.results.push({ slug, season, ok: false, error: String(err?.message || err) });
      }
    }
  }

  console.log(JSON.stringify({
    ok: true,
    fetched: stats.fetched, accepted: stats.accepted, skipped: stats.skipped, needsReview: stats.needsReview,
    history: getHistorySummary(),
    guarantees: { canonicalWrites: 0, productionWrite: false, searchExecuted: opts.allowSearch }
  }, null, 2));
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  main().catch(err => { console.error("[run-history-seasons] fatal", String(err?.message || err)); process.exitCode = 1; });
}

export { main as runHistorySeasons };
