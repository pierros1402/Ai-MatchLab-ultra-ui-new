/**
 * run-lineups-day.js
 *
 * Daily PLAYER-USAGE accumulation: pulls the recent Flashscore window of finished
 * matches, attributes each to one of our leagues, fetches the starting XIs and
 * appends them to lineups memory. Over time each team builds its regular XI (and
 * thus likely absences). Heavier than results (one feed per match), so capped/
 * rate-limited and deduped.
 *
 * Usage: node engine-v1/jobs/run-lineups-day.js [--max 120] [--summary]
 * Guardrails: canonicalWrites 0 (writes only to league-memory/lineups).
 */

import { pathToFileURL } from "node:url";
import { fetchFlashscoreFixtures } from "../odds/flashscore-fixtures-source.js";
import { resolveSlug } from "../odds/flashscore-league-map.js";
import { fetchMatchLineups } from "../odds/flashscore-lineups.js";
import { fetchEspnMatchData } from "../odds/espn-match-source.js";
import { recordMatchLineups, readLineups, getLineupsSummary } from "../storage/lineups-memory-db.js";

function alreadyHave(slug, matchId, home) {
  const list = readLineups(slug).teams?.[home];
  return Array.isArray(list) && list.some(e => e.matchId === String(matchId).replace(/^fs_/, ""));
}

export async function accumulateLineups({ max = 120 } = {}) {
  const feed = await fetchFlashscoreFixtures({ offsets: [-1, -2, -3, -4, -5, -6, -7] });
  const stats = { scanned: 0, finished: 0, attributed: 0, fetched: 0, withLineups: 0, stored: 0, byLeague: {} };

  for (const m of feed.rows) {
    if (stats.fetched >= max) break;
    stats.scanned++;
    if (m.scoreHome == null || m.scoreAway == null) continue;     // not played
    stats.finished++;

    const slug = resolveSlug(m.country, m.leagueName);
    if (!slug) continue;
    stats.attributed++;

    if (alreadyHave(slug, m.matchId, m.home)) continue;

    stats.fetched++;
    await new Promise(r => setTimeout(r, 400 + Math.random() * 500));

    // Cascade: primary Flashscore, else fill from ESPN (a fixture missing on one
    // source is found on the next).
    let lu = await fetchMatchLineups(m.matchId);
    if (!lu) {
      const dateYmd = (m.kickoffUtc || "").slice(0, 10);
      const e = await fetchEspnMatchData(slug, m.home, m.away, dateYmd);
      if (e && (e.lineups.home.length || e.lineups.away.length)) {
        lu = { home: { starters: e.lineups.home, formation: null }, away: { starters: e.lineups.away, formation: null } };
        stats.fromEspn = (stats.fromEspn || 0) + 1;
      }
    }
    if (!lu) continue;
    stats.withLineups++;

    if (recordMatchLineups(slug, m, lu)) {
      stats.stored++;
      stats.byLeague[slug] = (stats.byLeague[slug] || 0) + 1;
    }
  }

  return { ok: true, ...stats, lineups: getLineupsSummary() };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const argv = process.argv.slice(2);
  if (argv.includes("--summary")) {
    console.log(JSON.stringify({ ok: true, lineups: getLineupsSummary() }, null, 2));
  } else {
    const mi = argv.indexOf("--max");
    const max = mi >= 0 ? parseInt(argv[mi + 1], 10) || 120 : 120;
    accumulateLineups({ max }).then(r => {
      console.log(JSON.stringify({
        finished: r.finished, attributed: r.attributed, fetched: r.fetched,
        withLineups: r.withLineups, stored: r.stored, leagues: Object.keys(r.byLeague).length,
        lineups: r.lineups, guarantees: { canonicalWrites: 0 }
      }, null, 2));
    }).catch(err => { console.error("fatal", String(err?.message || err)); process.exitCode = 1; });
  }
}
