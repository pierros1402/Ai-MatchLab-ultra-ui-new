/**
 * bootstrap-league-history.js
 *
 * ONE-TIME job that records which seasons have existed for each league.
 * Builds league-memory/history/{slug}.json with:
 *   - seasons list (last 5-10 known)
 *   - typical season start/end months
 *   - hemisphere (northern / southern)
 *   - competition type
 *
 * This is STATIC embedded knowledge — not fetched from anywhere.
 * After this runs once, the engine knows the historical context for every league.
 * Future seasons are appended by the awareness service as they are discovered.
 *
 * Usage:
 *   node engine-v1/jobs/bootstrap-league-history.js
 *     [--slug eng.1]   bootstrap only one league
 *     [--force]        overwrite existing history files
 *
 * Guardrails:
 *   canonicalWrites: 0   — no fixture / standings / value writes
 *   productionWrite: false
 *   searchExecuted:  false  (pure static data)
 */

import { pathToFileURL } from "node:url";
import { writeLeagueHistory, hasLeagueHistory } from "../storage/league-memory-db.js";

// ─── Static season knowledge ──────────────────────────────────────────────────
// Format: { seasons, startMonth (1-12), endMonth, hemisphere, tier, type }

const LEAGUE_HISTORY = {
  "eng.1": {
    name: "Premier League", country: "England", hemisphere: "northern",
    tier: 1, type: "domestic_league",
    startMonth: 8, endMonth: 5,
    seasons: ["2020-21","2021-22","2022-23","2023-24","2024-25","2025-26"]
  },
  "eng.2": {
    name: "Championship", country: "England", hemisphere: "northern",
    tier: 2, type: "domestic_league",
    startMonth: 8, endMonth: 5,
    seasons: ["2020-21","2021-22","2022-23","2023-24","2024-25","2025-26"]
  },
  "eng.3": {
    name: "League One", country: "England", hemisphere: "northern",
    tier: 3, type: "domestic_league",
    startMonth: 8, endMonth: 5,
    seasons: ["2021-22","2022-23","2023-24","2024-25","2025-26"]
  },
  "esp.1": {
    name: "La Liga", country: "Spain", hemisphere: "northern",
    tier: 1, type: "domestic_league",
    startMonth: 8, endMonth: 5,
    seasons: ["2020-21","2021-22","2022-23","2023-24","2024-25","2025-26"]
  },
  "esp.2": {
    name: "Segunda Division", country: "Spain", hemisphere: "northern",
    tier: 2, type: "domestic_league",
    startMonth: 8, endMonth: 6,
    seasons: ["2021-22","2022-23","2023-24","2024-25","2025-26"]
  },
  "ger.1": {
    name: "Bundesliga", country: "Germany", hemisphere: "northern",
    tier: 1, type: "domestic_league",
    startMonth: 8, endMonth: 5,
    seasons: ["2020-21","2021-22","2022-23","2023-24","2024-25","2025-26"]
  },
  "ger.2": {
    name: "2. Bundesliga", country: "Germany", hemisphere: "northern",
    tier: 2, type: "domestic_league",
    startMonth: 8, endMonth: 5,
    seasons: ["2021-22","2022-23","2023-24","2024-25","2025-26"]
  },
  "ita.1": {
    name: "Serie A", country: "Italy", hemisphere: "northern",
    tier: 1, type: "domestic_league",
    startMonth: 8, endMonth: 5,
    seasons: ["2020-21","2021-22","2022-23","2023-24","2024-25","2025-26"]
  },
  "ita.2": {
    name: "Serie B", country: "Italy", hemisphere: "northern",
    tier: 2, type: "domestic_league",
    startMonth: 8, endMonth: 6,
    seasons: ["2021-22","2022-23","2023-24","2024-25","2025-26"]
  },
  "fra.1": {
    name: "Ligue 1", country: "France", hemisphere: "northern",
    tier: 1, type: "domestic_league",
    startMonth: 8, endMonth: 5,
    seasons: ["2020-21","2021-22","2022-23","2023-24","2024-25","2025-26"]
  },
  "fra.2": {
    name: "Ligue 2", country: "France", hemisphere: "northern",
    tier: 2, type: "domestic_league",
    startMonth: 8, endMonth: 5,
    seasons: ["2021-22","2022-23","2023-24","2024-25","2025-26"]
  },
  "ned.1": {
    name: "Eredivisie", country: "Netherlands", hemisphere: "northern",
    tier: 1, type: "domestic_league",
    startMonth: 8, endMonth: 5,
    seasons: ["2020-21","2021-22","2022-23","2023-24","2024-25","2025-26"]
  },
  "por.1": {
    name: "Primeira Liga", country: "Portugal", hemisphere: "northern",
    tier: 1, type: "domestic_league",
    startMonth: 8, endMonth: 5,
    seasons: ["2020-21","2021-22","2022-23","2023-24","2024-25","2025-26"]
  },
  "bel.1": {
    name: "First Division A", country: "Belgium", hemisphere: "northern",
    tier: 1, type: "domestic_league",
    startMonth: 7, endMonth: 5,
    seasons: ["2021-22","2022-23","2023-24","2024-25","2025-26"]
  },
  "sco.1": {
    name: "Scottish Premiership", country: "Scotland", hemisphere: "northern",
    tier: 1, type: "domestic_league",
    startMonth: 7, endMonth: 5,
    seasons: ["2021-22","2022-23","2023-24","2024-25","2025-26"]
  },
  "tur.1": {
    name: "Süper Lig", country: "Turkey", hemisphere: "northern",
    tier: 1, type: "domestic_league",
    startMonth: 8, endMonth: 5,
    seasons: ["2021-22","2022-23","2023-24","2024-25","2025-26"]
  },
  "gre.1": {
    name: "Super League Greece", country: "Greece", hemisphere: "northern",
    tier: 1, type: "domestic_league",
    startMonth: 9, endMonth: 5,
    seasons: ["2021-22","2022-23","2023-24","2024-25","2025-26"]
  },
  "swe.1": {
    name: "Allsvenskan", country: "Sweden", hemisphere: "northern",
    tier: 1, type: "domestic_league",
    startMonth: 4, endMonth: 11,
    seasons: ["2021","2022","2023","2024","2025"]
  },
  "nor.1": {
    name: "Eliteserien", country: "Norway", hemisphere: "northern",
    tier: 1, type: "domestic_league",
    startMonth: 4, endMonth: 11,
    seasons: ["2021","2022","2023","2024","2025"]
  },
  "den.1": {
    name: "Superliga", country: "Denmark", hemisphere: "northern",
    tier: 1, type: "domestic_league",
    startMonth: 7, endMonth: 5,
    seasons: ["2021-22","2022-23","2023-24","2024-25","2025-26"]
  },
  "pol.1": {
    name: "Ekstraklasa", country: "Poland", hemisphere: "northern",
    tier: 1, type: "domestic_league",
    startMonth: 7, endMonth: 5,
    seasons: ["2021-22","2022-23","2023-24","2024-25","2025-26"]
  },
  "usa.1": {
    name: "MLS", country: "USA", hemisphere: "northern",
    tier: 1, type: "domestic_league",
    startMonth: 2, endMonth: 11,
    seasons: ["2021","2022","2023","2024","2025"]
  },
  "mex.1": {
    name: "Liga MX", country: "Mexico", hemisphere: "northern",
    tier: 1, type: "domestic_league",
    startMonth: 1, endMonth: 12,
    note: "Two tournaments per year: Apertura (Jul-Dec) and Clausura (Jan-May)",
    seasons: ["2021-22","2022-23","2023-24","2024-25","2025-26"]
  },
  "bra.1": {
    name: "Brasileirao Serie A", country: "Brazil", hemisphere: "southern",
    tier: 1, type: "domestic_league",
    startMonth: 4, endMonth: 12,
    seasons: ["2021","2022","2023","2024","2025"]
  },
  "bra.2": {
    name: "Brasileirao Serie B", country: "Brazil", hemisphere: "southern",
    tier: 2, type: "domestic_league",
    startMonth: 4, endMonth: 11,
    seasons: ["2021","2022","2023","2024","2025"]
  },
  "arg.1": {
    name: "Primera Division Argentina", country: "Argentina", hemisphere: "southern",
    tier: 1, type: "domestic_league",
    startMonth: 1, endMonth: 12,
    note: "Torneo and Copa de la Liga format — runs most of the year",
    seasons: ["2021","2022","2023","2024","2025"]
  },
  "col.1": {
    name: "Liga BetPlay", country: "Colombia", hemisphere: "southern",
    tier: 1, type: "domestic_league",
    startMonth: 1, endMonth: 12,
    seasons: ["2021","2022","2023","2024","2025"]
  },
  "chi.1": {
    name: "Primera Division Chile", country: "Chile", hemisphere: "southern",
    tier: 1, type: "domestic_league",
    startMonth: 2, endMonth: 11,
    seasons: ["2021","2022","2023","2024","2025"]
  },
  "can.1": {
    name: "Canadian Premier League", country: "Canada", hemisphere: "northern",
    tier: 1, type: "domestic_league",
    startMonth: 4, endMonth: 10,
    seasons: ["2021","2022","2023","2024","2025"]
  },
  "UEFA.CL": {
    name: "Champions League", country: "Europe", hemisphere: "northern",
    tier: 1, type: "european_cup",
    startMonth: 9, endMonth: 6,
    seasons: ["2021-22","2022-23","2023-24","2024-25","2025-26"]
  },
  "UEFA.EL": {
    name: "Europa League", country: "Europe", hemisphere: "northern",
    tier: 1, type: "european_cup",
    startMonth: 9, endMonth: 5,
    seasons: ["2021-22","2022-23","2023-24","2024-25","2025-26"]
  },
  "UEFA.ECL": {
    name: "Conference League", country: "Europe", hemisphere: "northern",
    tier: 2, type: "european_cup",
    startMonth: 9, endMonth: 5,
    seasons: ["2021-22","2022-23","2023-24","2024-25","2025-26"]
  }
};

// ─── Main ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv || [];
  const out = { slug: null, force: false };

  for (let i = 0; i < args.length; i++) {
    const a = String(args[i] || "").trim();
    if (a === "--force") { out.force = true; continue; }
    if (a === "--slug" && args[i + 1]) { out.slug = String(args[++i]).trim(); continue; }
  }

  return out;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const slugs = opts.slug
    ? [opts.slug]
    : Object.keys(LEAGUE_HISTORY);

  let written = 0;
  let skipped = 0;
  const results = [];

  for (const slug of slugs) {
    const data = LEAGUE_HISTORY[slug];
    if (!data) {
      results.push({ slug, ok: false, reason: "not_in_static_knowledge" });
      continue;
    }

    if (!opts.force && hasLeagueHistory(slug)) {
      results.push({ slug, ok: true, skipped: true, reason: "already_exists" });
      skipped++;
      continue;
    }

    writeLeagueHistory(slug, data);
    results.push({ slug, ok: true, written: true, seasons: data.seasons.length });
    written++;
  }

  const output = {
    ok: true,
    written,
    skipped,
    total: slugs.length,
    results,
    guarantees: {
      canonicalWrites: 0,
      productionWrite: false,
      searchExecuted:  false
    }
  };

  console.log(JSON.stringify(output, null, 2));
  return output;
}

// ─── Entry point guard ────────────────────────────────────────────────────────

const entryUrl = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : null;

if (entryUrl === import.meta.url) {
  try {
    main();
  } catch (err) {
    console.error("[bootstrap-league-history] fatal", String(err?.message || err));
    process.exitCode = 1;
  }
}

export { main as bootstrapLeagueHistory, LEAGUE_HISTORY };
