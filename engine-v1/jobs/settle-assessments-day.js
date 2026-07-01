/**
 * settle-assessments-day.js
 *
 * Verifies our AI assessment against real results: for finished matches we priced,
 * record the final score + per-market hit (1X2 / O-U 2.5 / BTTS) onto the odds-memory
 * record. This is the "yes/no verification" the assessment export reports. Runs in
 * the daily cycle (recent Flashscore window of finished games).
 *
 * Usage: node engine-v1/jobs/settle-assessments-day.js
 * Guardrails: canonicalWrites 0 (writes only to odds-memory).
 */

import { pathToFileURL } from "node:url";
import { fetchFlashscoreFixtures } from "../odds/flashscore-fixtures-source.js";
import { recordSettlement, buildTeamDayIndex, getOddsSummary } from "../storage/odds-memory-db.js";
import { normalizeTeamKey } from "../core/normalize.js";
import { athensDayFromKickoff } from "../core/daykey.js";

export async function settleAssessments() {
  const feed = await fetchFlashscoreFixtures({ offsets: [-1, -2, -3, -4, -5, -6, -7] });
  const stats = { finished: 0, settled: 0, matchedByTeam: 0, matchedByFsId: 0, hits: { "1X2": 0, OU25: 0, BTTS: 0 }, total: 0 };

  // Most odds records are canonicalId-keyed, so resolve by normalized team + day
  // first; fall back to the legacy fs_<matchId> lookup for records keyed that way.
  const index = buildTeamDayIndex();

  for (const m of feed.rows) {
    if (m.scoreHome == null || m.scoreAway == null) continue;  // not played
    stats.finished++;

    const dayKey = athensDayFromKickoff(m.kickoffUtc);
    const key = `${normalizeTeamKey(m.home)}|${normalizeTeamKey(m.away)}|${dayKey}`;
    const canonicalId = index.get(key);

    let ok = false;
    if (canonicalId) {
      ok = recordSettlement(canonicalId, m.scoreHome, m.scoreAway);
      if (ok) stats.matchedByTeam++;
    }
    if (!ok) {
      ok = recordSettlement(`fs_${m.matchId}`, m.scoreHome, m.scoreAway);
      if (ok) stats.matchedByFsId++;
    }
    if (ok) stats.settled++;
  }

  return { ok: true, ...stats, odds: getOddsSummary() };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  settleAssessments().then(r => {
    console.log(JSON.stringify({ finished: r.finished, settled: r.settled, guarantees: { canonicalWrites: 0 } }, null, 2));
  }).catch(err => { console.error("fatal", String(err?.message || err)); process.exitCode = 1; });
}
