/**
 * accumulate-results-day.js
 *
 * Daily results accumulation — the autonomous FORM builder. Pulls the recent
 * Flashscore window (finished matches with scores), attributes each to one of our
 * leagues, and appends to append-only results memory. Run every day at rollover;
 * over a few weeks every active league fills its form window with no manual work.
 *
 * Usage: node engine-v1/jobs/accumulate-results-day.js
 * Guardrails: canonicalWrites 0 (writes only to league-memory/results).
 */

import { pathToFileURL } from "node:url";
import { fetchFlashscoreFixtures } from "../odds/flashscore-fixtures-source.js";
import { resolveSlug } from "../odds/flashscore-league-map.js";
import { recordMatchResult, getResultsSummary } from "../storage/results-memory-db.js";

export async function accumulateResults() {
  // Past week is finished; today's finished games are picked up next run.
  const feed = await fetchFlashscoreFixtures({ offsets: [-1, -2, -3, -4, -5, -6, -7] });

  const stats = { scanned: 0, finished: 0, attributed: 0, stored: 0, byLeague: {} };

  for (const m of feed.rows) {
    stats.scanned++;
    if (m.scoreHome == null || m.scoreAway == null) continue;  // not played
    stats.finished++;

    const slug = resolveSlug(m.country, m.leagueName);
    if (!slug) continue;                                       // not our league
    stats.attributed++;

    const changed = recordMatchResult(slug, m);
    if (changed) {
      stats.stored++;
      stats.byLeague[slug] = (stats.byLeague[slug] || 0) + 1;
    }
  }

  return { ok: true, ...stats, results: getResultsSummary() };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  accumulateResults().then(r => {
    console.log(JSON.stringify({
      scanned: r.scanned, finished: r.finished, attributed: r.attributed, stored: r.stored,
      leagues: Object.keys(r.byLeague).length, results: r.results,
      guarantees: { canonicalWrites: 0 }
    }, null, 2));
  }).catch(err => { console.error("fatal", String(err?.message || err)); process.exitCode = 1; });
}
