/**
 * accumulate-h2h.js
 *
 * Builds head-to-head history from ALL Flashscore completed matches — no league
 * filter, so even leagues we don't formally track accumulate H2H data over time.
 * Run daily; over weeks every team pair that has played fills its H2H file.
 *
 * Usage: node engine-v1/jobs/accumulate-h2h.js
 * Guardrails: canonicalWrites 0 (writes only to data/h2h/).
 */

import { pathToFileURL } from "node:url";
import { fetchFlashscoreFixtures } from "../odds/flashscore-fixtures-source.js";
import { resolveSlug } from "../odds/flashscore-league-map.js";
import { recordH2H } from "../storage/h2h-memory-db.js";

export async function accumulateH2H() {
  // Last 7 days of completed matches — same window as results accumulator.
  const feed = await fetchFlashscoreFixtures({ offsets: [-1, -2, -3, -4, -5, -6, -7] });

  const stats = { scanned: 0, finished: 0, stored: 0 };

  for (const m of feed.rows) {
    stats.scanned++;
    if (m.scoreHome == null || m.scoreAway == null) continue; // not played
    stats.finished++;

    const slug = resolveSlug(m.country, m.leagueName) || null;
    const changed = recordH2H({
      matchId:    m.matchId,
      homeTeam:   m.home,
      awayTeam:   m.away,
      scoreHome:  m.scoreHome,
      scoreAway:  m.scoreAway,
      date:       m.kickoffUtc ? m.kickoffUtc.slice(0, 10) : null,
      competition: m.leagueName || null,
      leagueSlug:  slug
    });
    if (changed) stats.stored++;
  }

  return { ok: true, ...stats };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  accumulateH2H().then(r => {
    console.log(JSON.stringify({ ...r, guarantees: { canonicalWrites: 0 } }, null, 2));
  }).catch(err => { console.error("fatal", String(err?.message || err)); process.exitCode = 1; });
}
