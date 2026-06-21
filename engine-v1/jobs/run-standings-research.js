/**
 * run-standings-research.js
 *
 * Autonomous standings research for one or more leagues.
 * Token-free during development (AIML_AI_ENABLED unset → AI level returns needs_review).
 *
 * Usage:
 *   node engine-v1/jobs/run-standings-research.js --slug bol.1 --allow-search
 *   node engine-v1/jobs/run-standings-research.js --slug esp.2 --season 2025-26 --allow-search
 *   node engine-v1/jobs/run-standings-research.js --slug bol.1 --allow-search --show-rows
 *
 * Flags:
 *   --slug <slug>          league slug (required)
 *   --season <YYYY-YY>     season string (default 2025-26)
 *   --allow-search         enable web search (needed for Level 3)
 *   --show-rows            print the parsed standings rows
 *   --teams-min <n>        expected minimum teams (default 6)
 *   --teams-max <n>        expected maximum teams (default 30)
 *
 * Guardrails:
 *   canonicalWrites: 0   — never writes standings/fixtures/value
 *   productionWrite: false
 *   aiEnabled: only if AIML_AI_ENABLED=true
 */

import { pathToFileURL } from "node:url";
import { researchStandings } from "../source-discovery/standings-researcher.js";
import { getLeagueMeta } from "../source-discovery/league-awareness-service.js";

function parseArgs(argv) {
  const args = argv || [];
  const out = {
    slug: null,
    season: "2025-26",
    allowSearch: false,
    showRows: false,
    teamsMin: 6,
    teamsMax: 30
  };

  for (let i = 0; i < args.length; i++) {
    const a = String(args[i] || "").trim();
    if (a === "--allow-search") { out.allowSearch = true; continue; }
    if (a === "--show-rows")    { out.showRows    = true; continue; }
    if (a === "--slug" && args[i + 1])      { out.slug   = String(args[++i]).trim(); continue; }
    if (a === "--season" && args[i + 1])    { out.season = String(args[++i]).trim(); continue; }
    if (a === "--teams-min" && args[i + 1]) { out.teamsMin = parseInt(args[++i], 10) || 6; continue; }
    if (a === "--teams-max" && args[i + 1]) { out.teamsMax = parseInt(args[++i], 10) || 30; continue; }
  }

  return out;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!opts.slug) {
    console.error("[run-standings-research] missing --slug");
    process.exitCode = 1;
    return;
  }

  const meta = getLeagueMeta(opts.slug);

  console.log("[run-standings-research] start", {
    slug: opts.slug,
    leagueName: meta.name,
    country: meta.country,
    season: opts.season,
    allowSearch: opts.allowSearch,
    aiEnabled: String(process.env.AIML_AI_ENABLED || "").toLowerCase() === "true"
  });

  const result = await researchStandings(opts.slug, meta.name, meta.country, {
    season: opts.season,
    allowSearch: opts.allowSearch,
    expectedTeamsMin: opts.teamsMin,
    expectedTeamsMax: opts.teamsMax
  });

  // Compact summary
  console.log("[run-standings-research] done", {
    slug: result.slug,
    status: result.status,
    level: result.level,
    source: result.source,
    confidence: result.confidence,
    rowCount: result.rowCount,
    ms: result.ms
  });

  const output = {
    ok: result.ok,
    slug: result.slug,
    leagueName: result.leagueName,
    season: result.season,
    status: result.status,
    level: result.level,
    source: result.source,
    confidence: result.confidence,
    rowCount: result.rowCount,
    validation: result.validation,
    note: result.note,
    trail: result.trail,
    ms: result.ms,
    guarantees: result.guarantees
  };

  if (opts.showRows) {
    output.rows = result.rows.map(r => ({
      pos: r.position,
      team: r.teamName,
      pld: r.played,
      w: r.wins,
      d: r.draws,
      l: r.losses,
      gf: r.goalsFor,
      ga: r.goalsAgainst,
      gd: r.goalDifference,
      pts: r.points
    }));
  }

  console.log(JSON.stringify(output, null, 2));
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (entryUrl === import.meta.url) {
  main().catch(err => {
    console.error("[run-standings-research] fatal", String(err?.message || err));
    process.exitCode = 1;
  });
}
