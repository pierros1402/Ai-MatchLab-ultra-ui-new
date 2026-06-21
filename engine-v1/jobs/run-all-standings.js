/**
 * run-all-standings.js
 *
 * Standings acquisition across the WHOLE coverage map (not just active leagues):
 *   - active leagues       → current season (fills coverage gaps)
 *   - off-season leagues   → the season that just finished (currentSeasonLabel
 *                            returns the completed season for cross-year leagues),
 *                            so we hold last-season tables before they restart.
 *
 * Resumable: skips leagues that already have accepted standings for the target
 * season. Validated via standings-validator; wrong/national-team tables rejected.
 *
 * Usage:
 *   node engine-v1/jobs/run-all-standings.js --allow-search [--max 40] [--state active|finished]
 *   node engine-v1/jobs/run-all-standings.js --summary
 *
 * Guardrails: canonicalWrites 0; writes only to league-memory/standings.
 */

import { pathToFileURL } from "node:url";
import { researchStandings } from "../source-discovery/standings-researcher.js";
import { getLeagueMeta, getAllKnownSlugs } from "../source-discovery/league-awareness-service.js";
import { currentSeasonLabel } from "../source-discovery/season-calendar.js";
import { readLeagueState } from "../storage/league-memory-db.js";
import {
  recordStandingsResult, hasAcceptedStandings, getStandingsSummary
} from "../storage/standings-memory-db.js";

function log(...a) { console.log("[run-all-standings]", ...a); }

function parseArgs(argv) {
  const out = { allowSearch: false, max: 40, summary: false, state: null };
  for (let i = 0; i < argv.length; i++) {
    const a = String(argv[i] || "").trim();
    if (a === "--allow-search") out.allowSearch = true;
    else if (a === "--summary") out.summary = true;
    else if (a === "--state" && argv[i + 1]) out.state = String(argv[++i]).trim();
    else if (a === "--max" && argv[i + 1]) { const n = parseInt(argv[++i], 10); if (n > 0) out.max = n; }
  }
  return out;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.summary) {
    console.log(JSON.stringify({ ok: true, standings: getStandingsSummary() }, null, 2));
    return;
  }

  const slugs = getAllKnownSlugs();
  const stats = { considered: 0, processed: 0, accepted: 0, skipped: 0, needsReview: 0, byState: {}, results: [] };

  for (const slug of slugs) {
    if (stats.processed >= opts.max) break;

    const state = readLeagueState(slug)?.state || "unknown";
    if (opts.state && state !== opts.state) continue;
    stats.considered++;

    const meta = getLeagueMeta(slug);
    const season = currentSeasonLabel(slug, meta);

    if (hasAcceptedStandings(slug, season)) { stats.skipped++; continue; }

    stats.processed++;
    if (!opts.allowSearch) { stats.results.push({ slug, season, dryRun: true }); continue; }

    try {
      // Polite delay to avoid tripping search rate-limits on large batches.
      if (stats.processed > 1) await new Promise(r => setTimeout(r, 1200 + Math.random() * 1500));

      const research = await researchStandings(slug, meta.name, meta.country, { season, allowSearch: true });
      const rec = recordStandingsResult(slug, research);
      if (research.status === "accepted") { stats.accepted++; stats.byState[state] = (stats.byState[state] || 0) + 1; }
      else stats.needsReview++;
      stats.results.push({ slug, state, season, status: research.status, rows: research.rowCount, written: rec.written });
      log("league", { slug, state, season, status: research.status, rows: research.rowCount });
    } catch (err) {
      stats.results.push({ slug, season, ok: false, error: String(err?.message || err) });
    }
  }

  console.log(JSON.stringify({
    ok: true, processed: stats.processed, accepted: stats.accepted,
    skipped: stats.skipped, needsReview: stats.needsReview, byState: stats.byState,
    standings: getStandingsSummary(),
    guarantees: { canonicalWrites: 0, productionWrite: false, searchExecuted: opts.allowSearch }
  }, null, 2));
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  main().catch(err => { console.error("[run-all-standings] fatal", String(err?.message || err)); process.exitCode = 1; });
}
