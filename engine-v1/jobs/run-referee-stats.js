/**
 * run-referee-stats.js
 *
 * Refreshes per-referee discipline tendencies (cards / penalties per game) for the
 * leagues mapped to Transfermarkt. Referee stats change slowly, so this runs
 * occasionally (not every day). Tries the most recent completed season, falling
 * back one year if it has no data yet.
 *
 * Usage: node engine-v1/jobs/run-referee-stats.js [--season 2025] [--summary]
 * Guardrails: canonicalWrites 0 (writes only to league-memory/referees).
 */

import { pathToFileURL } from "node:url";
import { fetchCompetitionReferees, TM_COMPETITIONS } from "../odds/transfermarkt-referee-source.js";
import { recordRefereeStats, getRefereeSummary } from "../storage/referee-memory-db.js";

function log(...a) { console.log("[run-referee-stats]", ...a); }

export async function refreshRefereeStats({ season } = {}) {
  // Default to the most recent completed season (June 2026 → 2025-26 = saison 2025).
  const base = season || 2025;
  const stats = { leagues: 0, stored: 0, byLeague: {} };

  let first = true;
  for (const slug of Object.keys(TM_COMPETITIONS)) {
    if (!first) await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500));
    first = false;
    stats.leagues++;

    let res = await fetchCompetitionReferees(slug, base);
    if (!res.ok) res = await fetchCompetitionReferees(slug, base - 1);   // fallback one year
    if (!res.ok) { log("league", { slug, ok: false, reason: res.reason }); continue; }

    const n = recordRefereeStats(slug, res.season, res.referees);
    stats.stored += n;
    stats.byLeague[slug] = n;
    log("league", { slug, season: res.season, referees: n });
  }

  return { ok: true, ...stats, referees: getRefereeSummary() };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const argv = process.argv.slice(2);
  if (argv.includes("--summary")) {
    console.log(JSON.stringify({ ok: true, referees: getRefereeSummary() }, null, 2));
  } else {
    const si = argv.indexOf("--season");
    const season = si >= 0 ? parseInt(argv[si + 1], 10) : undefined;
    refreshRefereeStats({ season }).then(r => {
      console.log(JSON.stringify({
        leagues: r.leagues, stored: r.stored, byLeague: r.byLeague,
        referees: r.referees, guarantees: { canonicalWrites: 0 }
      }, null, 2));
    }).catch(err => { console.error("fatal", String(err?.message || err)); process.exitCode = 1; });
  }
}
