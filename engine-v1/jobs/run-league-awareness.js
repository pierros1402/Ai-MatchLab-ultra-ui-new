/**
 * run-league-awareness.js
 *
 * Refreshes league pulse states in league-memory/state.json.
 * Checks which leagues are active / paused / finished via web search snippets.
 *
 * Usage:
 *   node engine-v1/jobs/run-league-awareness.js
 *     [--allow-search]          enable live web search (default: dry-run)
 *     [--slug eng.1,esp.1]      only refresh specific leagues
 *     [--max 20]                max leagues to refresh per run (default: 20)
 *     [--seed]                  seed all known leagues as "unknown" first
 *     [--summary]               print current memory summary and exit
 *
 * Guardrails:
 *   canonicalWrites: 0   — never writes fixtures, standings, or canonical data
 *   productionWrite: false
 *   searchExecuted: only when --allow-search is passed
 */

import { pathToFileURL } from "node:url";

import {
  seedKnownLeagues,
  refreshStaleLeagues,
  updateLeaguePulse,
  classifyAllByCalendar
} from "../source-discovery/league-awareness-service.js";

import {
  getSummary,
  readAllStates
} from "../storage/league-memory-db.js";

function log(...args) {
  console.log("[run-league-awareness]", ...args);
}

function parseArgs(argv) {
  const args = argv || [];
  const out = {
    allowSearch: false,
    slugs:       null,
    max:         20,
    seed:        false,
    summary:     false,
    calendar:    false
  };

  for (let i = 0; i < args.length; i++) {
    const a = String(args[i] || "").trim();

    if (a === "--allow-search") { out.allowSearch = true; continue; }
    if (a === "--seed")         { out.seed        = true; continue; }
    if (a === "--summary")      { out.summary     = true; continue; }
    if (a === "--calendar")     { out.calendar    = true; continue; }

    if (a === "--slug" || a === "--slugs") {
      const val = String(args[++i] || "").trim();
      out.slugs = val.split(",").map(s => s.trim()).filter(Boolean);
      continue;
    }

    if (a === "--max") {
      const n = parseInt(args[++i], 10);
      if (Number.isFinite(n) && n > 0) out.max = n;
      continue;
    }
  }

  return out;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  log("start", {
    allowSearch: opts.allowSearch,
    seed:        opts.seed,
    summary:     opts.summary,
    slugs:       opts.slugs,
    max:         opts.max,
    guarantees: {
      canonicalWrites: 0,
      productionWrite: false,
      searchExecuted:  opts.allowSearch
    }
  });

  // --summary: print current state and exit
  if (opts.summary) {
    const summary = getSummary();
    const all = readAllStates();
    console.log(JSON.stringify({ ok: true, summary, leagues: all }, null, 2));
    return;
  }

  // --seed: initialise unknown leagues
  if (opts.seed) {
    const seeded = seedKnownLeagues();
    log("seed:done", seeded);
  }

  // --calendar: deterministic, search-free classification of all leagues
  if (opts.calendar) {
    const result = classifyAllByCalendar({ slugs: opts.slugs || null });
    log("calendar:done", {
      classified: result.classified,
      byState: result.summary?.byState,
      activeCount: result.summary?.activeCount
    });
    console.log(JSON.stringify({
      ok: true,
      classified: result.classified,
      summary: result.summary,
      guarantees: { canonicalWrites: 0, productionWrite: false, searchExecuted: false }
    }, null, 2));
    return;
  }

  // Single-slug mode (for targeted refresh)
  if (opts.slugs && opts.slugs.length === 1) {
    const slug = opts.slugs[0];
    log("single-slug:start", { slug });

    const result = await updateLeaguePulse(slug, { allowSearch: opts.allowSearch });

    log("single-slug:done", {
      slug:       result.slug,
      state:      result.state,
      confidence: result.confidence,
      resumeDate: result.resumeDate,
      snippetCount: result.snippetCount
    });

    console.log(JSON.stringify({
      ok: true,
      result,
      guarantees: {
        canonicalWrites: 0,
        productionWrite: false,
        searchExecuted:  opts.allowSearch
      }
    }, null, 2));

    return;
  }

  // Batch refresh of stale leagues
  const result = await refreshStaleLeagues({
    allowSearch: opts.allowSearch,
    maxLeagues:  opts.max,
    dryRun:      !opts.allowSearch,
    slugs:       opts.slugs || null
  });

  log("refresh:done", {
    batchSize:   result.batchSize,
    staleCount:  result.staleCount,
    dryRun:      result.dryRun,
    summaryByState: result.summary?.byState
  });

  console.log(JSON.stringify({
    ok: result.ok,
    batchSize:  result.batchSize,
    staleCount: result.staleCount,
    dryRun:     result.dryRun,
    results:    result.results,
    summary:    result.summary,
    guarantees: {
      canonicalWrites: 0,
      productionWrite: false,
      searchExecuted:  opts.allowSearch
    }
  }, null, 2));
}

// ─── Entry point guard ────────────────────────────────────────────────────────

const entryUrl = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : null;

if (entryUrl === import.meta.url) {
  main().catch(err => {
    console.error("[run-league-awareness] fatal", String(err?.message || err));
    process.exitCode = 1;
  });
}
