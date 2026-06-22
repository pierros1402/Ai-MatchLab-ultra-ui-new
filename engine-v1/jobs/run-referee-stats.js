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
import { getLeagueMeta } from "../source-discovery/league-awareness-service.js";
import { currentSeasonLabel } from "../source-discovery/season-calendar.js";
import { readLeagueState } from "../storage/league-memory-db.js";

function log(...a) { console.log("[run-referee-stats]", ...a); }

// Transfermarkt saison_id = the starting year of the season. currentSeasonLabel
// already returns the in-progress season for ACTIVE leagues (so we get their data
// "up to now") and the just-finished one for OFF-SEASON leagues.
function saisonIdFor(slug) {
  const label = currentSeasonLabel(slug, getLeagueMeta(slug));
  const y = parseInt(String(label).slice(0, 4), 10);
  return Number.isFinite(y) ? y : 2025;
}

export async function refreshRefereeStats({ season } = {}) {
  const stats = { leagues: 0, stored: 0, byLeague: {} };

  let first = true;
  for (const slug of Object.keys(TM_COMPETITIONS)) {
    if (!first) await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500));
    first = false;
    stats.leagues++;

    // Try the current season and the previous one, keep the MORE COMPLETE table.
    // For active leagues this is the current season so far (or last season if richer);
    // for off-season leagues it lands on the last completed season's full table.
    const base = season || saisonIdFor(slug);
    let res = await fetchCompetitionReferees(slug, base);
    await new Promise(r => setTimeout(r, 700));
    const prev = await fetchCompetitionReferees(slug, base - 1);
    if (prev.ok && prev.referees.length > (res.referees?.length || 0)) res = prev;
    if (!res.ok) { log("league", { slug, ok: false, reason: res.reason }); continue; }

    const n = recordRefereeStats(slug, res.season, res.referees, res.competition);
    stats.stored += n;
    stats.byLeague[slug] = n;
    // competition NAME is logged so a wrong slug→code mapping is visible, not silent.
    log("league", { slug, code: res.tmCode, competition: res.competition, season: res.season, referees: n });
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
