/**
 * run-discipline-day.js
 *
 * Daily DISCIPLINE accumulation (cards / fouls / penalties) — the autonomous
 * builder behind referee/discipline value. Pulls the recent Flashscore window of
 * finished matches, attributes each to one of our leagues, fetches the per-match
 * detail (statistics + incidents), and appends to append-only discipline memory.
 *
 * Heavier than results accumulation (2 detail feeds per match), so it is rate-
 * limited and capped per run; resumable via per-match dedup.
 *
 * Usage: node engine-v1/jobs/run-discipline-day.js [--max 120] [--summary]
 * Guardrails: canonicalWrites 0 (writes only to league-memory/discipline).
 */

import { pathToFileURL } from "node:url";
import { fetchFlashscoreFixtures } from "../odds/flashscore-fixtures-source.js";
import { resolveSlug } from "../odds/flashscore-league-map.js";
import { fetchMatchDiscipline } from "../odds/flashscore-match-detail.js";
import {
  recordMatchDiscipline, readDiscipline, getDisciplineSummary
} from "../storage/discipline-memory-db.js";

function alreadyHave(slug, matchId, home) {
  const data = readDiscipline(slug);
  const list = data.teams?.[home];
  return Array.isArray(list) && list.some(e => e.matchId === String(matchId).replace(/^fs_/, ""));
}

export async function accumulateDiscipline({ max = 120 } = {}) {
  const feed = await fetchFlashscoreFixtures({ offsets: [-1, -2, -3, -4, -5, -6, -7] });
  const stats = { scanned: 0, finished: 0, attributed: 0, fetched: 0, withStats: 0, stored: 0, byLeague: {} };

  for (const m of feed.rows) {
    if (stats.fetched >= max) break;
    stats.scanned++;
    if (m.scoreHome == null || m.scoreAway == null) continue;     // not played
    stats.finished++;

    const slug = resolveSlug(m.country, m.leagueName);
    if (!slug) continue;                                          // not our league
    stats.attributed++;

    if (alreadyHave(slug, m.matchId, m.home)) continue;          // dedup → skip refetch

    stats.fetched++;
    await new Promise(r => setTimeout(r, 400 + Math.random() * 500));

    const d = await fetchMatchDiscipline(m.matchId);
    if (!d || !d.hasStats) continue;                             // no full-stat coverage
    stats.withStats++;

    if (recordMatchDiscipline(slug, m, d)) {
      stats.stored++;
      stats.byLeague[slug] = (stats.byLeague[slug] || 0) + 1;
    }
  }

  return { ok: true, ...stats, discipline: getDisciplineSummary() };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const argv = process.argv.slice(2);
  if (argv.includes("--summary")) {
    console.log(JSON.stringify({ ok: true, discipline: getDisciplineSummary() }, null, 2));
  } else {
    const mi = argv.indexOf("--max");
    const max = mi >= 0 ? parseInt(argv[mi + 1], 10) || 120 : 120;
    accumulateDiscipline({ max }).then(r => {
      console.log(JSON.stringify({
        scanned: r.scanned, finished: r.finished, attributed: r.attributed,
        fetched: r.fetched, withStats: r.withStats, stored: r.stored,
        leagues: Object.keys(r.byLeague).length, discipline: r.discipline,
        guarantees: { canonicalWrites: 0 }
      }, null, 2));
    }).catch(err => { console.error("fatal", String(err?.message || err)); process.exitCode = 1; });
  }
}
