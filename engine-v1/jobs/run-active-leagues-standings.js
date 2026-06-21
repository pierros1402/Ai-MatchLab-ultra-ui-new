/**
 * run-active-leagues-standings.js
 *
 * Autonomous standings acquisition for every league the awareness layer marks as
 * ACTIVE. Uses the deterministic season calendar to pick the correct season label
 * (e.g. Brazil → "2026", Premier League → "2025-26") and stores results in
 * append-only standings memory.
 *
 * Usage:
 *   node engine-v1/jobs/run-active-leagues-standings.js               (dry-run)
 *   node engine-v1/jobs/run-active-leagues-standings.js --allow-search
 *     [--max 20]        max leagues to research this run (default 20)
 *     [--slug a,b]      restrict to specific slugs
 *     [--force]         re-research even if accepted standings already exist
 *     [--summary]       print standings-memory coverage and exit
 *
 * Guardrails:
 *   canonicalWrites: 0   — writes only to league-memory/standings
 *   productionWrite: false
 *   searchExecuted: only with --allow-search
 */

import { pathToFileURL } from "node:url";

import { researchStandings } from "../source-discovery/standings-researcher.js";
import { getLeagueMeta } from "../source-discovery/league-awareness-service.js";
import { currentSeasonLabel } from "../source-discovery/season-calendar.js";
import { getLeaguesByState } from "../storage/league-memory-db.js";
import {
  recordStandingsResult,
  hasAcceptedStandings,
  getStandingsSummary
} from "../storage/standings-memory-db.js";

function log(...args) {
  console.log("[run-active-standings]", ...args);
}

function parseArgs(argv) {
  const args = argv || [];
  const out = { allowSearch: false, max: 20, slugs: null, force: false, summary: false };

  for (let i = 0; i < args.length; i++) {
    const a = String(args[i] || "").trim();
    if (a === "--allow-search") { out.allowSearch = true; continue; }
    if (a === "--force")        { out.force       = true; continue; }
    if (a === "--summary")      { out.summary     = true; continue; }
    if ((a === "--slug" || a === "--slugs") && args[i + 1]) {
      out.slugs = String(args[++i]).split(",").map(s => s.trim()).filter(Boolean);
      continue;
    }
    if (a === "--max" && args[i + 1]) {
      const n = parseInt(args[++i], 10);
      if (Number.isFinite(n) && n > 0) out.max = n;
      continue;
    }
  }

  return out;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.summary) {
    console.log(JSON.stringify({ ok: true, standings: getStandingsSummary() }, null, 2));
    return;
  }

  const active = getLeaguesByState("active").map(l => l.slug);
  const targets = (opts.slugs ? active.filter(s => opts.slugs.includes(s)) : active);

  log("start", {
    activeLeagues: active.length,
    targeted: targets.length,
    max: opts.max,
    allowSearch: opts.allowSearch,
    force: opts.force
  });

  const results = [];
  let processed = 0;

  for (const slug of targets) {
    if (processed >= opts.max) break;

    const meta = getLeagueMeta(slug);
    const season = currentSeasonLabel(slug, meta);

    if (!opts.force && hasAcceptedStandings(slug, season)) {
      results.push({ slug, season, skipped: true, reason: "already_have_accepted" });
      continue;
    }

    processed++;

    if (!opts.allowSearch) {
      results.push({ slug, season, dryRun: true });
      continue;
    }

    try {
      // Politeness delay between leagues to avoid tripping search rate-limits
      // (DuckDuckGo starts returning HTTP 403 under burst load).
      if (processed > 1) await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500));

      const research = await researchStandings(slug, meta.name, meta.country, {
        season,
        allowSearch: true
      });
      const recorded = recordStandingsResult(slug, research);
      results.push({
        slug, season,
        status: research.status,
        level: research.level,
        source: research.source,
        confidence: research.confidence,
        rowCount: research.rowCount,
        written: recorded.written,
        recordReason: recorded.reason
      });
      log("league:done", {
        slug, season, status: research.status,
        rows: research.rowCount, written: recorded.written
      });
    } catch (err) {
      results.push({ slug, season, ok: false, error: String(err?.message || err) });
      log("league:error", { slug, error: String(err?.message || err) });
    }
  }

  const accepted = results.filter(r => r.status === "accepted").length;
  const written = results.filter(r => r.written).length;

  console.log(JSON.stringify({
    ok: true,
    activeLeagues: active.length,
    processed,
    accepted,
    written,
    skippedExisting: results.filter(r => r.skipped).length,
    standings: getStandingsSummary(),
    results,
    guarantees: { canonicalWrites: 0, productionWrite: false, searchExecuted: opts.allowSearch }
  }, null, 2));
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (entryUrl === import.meta.url) {
  main().catch(err => {
    console.error("[run-active-standings] fatal", String(err?.message || err));
    process.exitCode = 1;
  });
}

export { main as runActiveLeaguesStandings };
