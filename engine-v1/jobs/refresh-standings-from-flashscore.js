/**
 * refresh-standings-from-flashscore.js
 *
 * Refresh league tables from Flashscore's OWN standings pages instead of stale
 * scrapes or derived guesses. Root cause this closes (2026-07-14): bra.2 served
 * a Wikipedia table fetched 06-20 (matchday 13) while Flashscore showed
 * matchday 17 — the "real"-source table blocked every refresh path and the UI
 * was 4 rounds behind. Systemic, not a one-off: any league whose scrape aged
 * out had the same failure.
 *
 * Mechanism (discovered from the site itself, no guessing):
 *   1. The day feed (f_1_*) labels every league section with ZE (tournamentId)
 *      and ZC (stageId) — parseFlashscoreFeed now surfaces both.
 *   2. https://www.flashscore.mobi/standings/{ZE}/{ZC}/ renders the CURRENT
 *      table as server-side HTML (odds/flashscore-standings-source.js parses it).
 *   3. Every fixture's leaguePath resolves to our canonical slug via the
 *      existing flashscore-league-map.
 *
 * Scope: leagues playing in the feed window whose path maps to a canonical
 * slug, skipping known non-league competitions (cups never get tables —
 * matchday-axis gate). Accepted via the normal standings flow with
 * confidence 1 (the live site table outranks any aged scrape; shouldReplace
 * lets same-season >= confidence through, so freshness wins).
 *
 * Usage:
 *   node engine-v1/jobs/refresh-standings-from-flashscore.js            # feed window
 *   node engine-v1/jobs/refresh-standings-from-flashscore.js --leagues=bra.2,uru.1
 */

import { pathToFileURL } from "node:url";
import { fetchFlashscoreFixtures } from "../odds/flashscore-fixtures-source.js";
import { fetchFlashscoreStandings } from "../odds/flashscore-standings-source.js";
import { resolveSlugFromPath, resolveSlug } from "../odds/flashscore-league-map.js";
import { recordStandingsResult } from "../storage/standings-memory-db.js";
import { maxPlayableGames, isKnownNonLeagueCompetition } from "../core/matchday-axis.js";
import { getLeagueMeta } from "../source-discovery/league-awareness-service.js";
import { currentSeasonLabel } from "../source-discovery/season-calendar.js";

const DELAY_MS = 1500; // politeness between standings page fetches

function log(...a) { console.log("[fs-standings]", ...a); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Sanity gate before accepting: a real current table has a plausible team
 * count, sequential-ish positions, and played counts inside a quadruple
 * round-robin bound. Anything else is refused (fail-closed, never "best guess").
 */
export function isPlausibleLeagueTable(rows) {
  const n = Array.isArray(rows) ? rows.length : 0;
  if (n < 6 || n > 40) return false;
  const maxPlayed = Math.max(...rows.map(r => Number(r.played) || 0));
  const bound = maxPlayableGames(n, 4);
  if (bound != null && maxPlayed > bound) return false;
  const positions = new Set(rows.map(r => r.position));
  return positions.size === n;
}

// Yesterday matters most: a league's table changes right AFTER its round, so
// the freshest signal comes from leagues that played on offset -1.
export async function refreshStandingsFromFlashscore({ leagues = null, offsets = [-1, 0, 1] } = {}) {
  const feed = await fetchFlashscoreFixtures({ offsets });
  const rows = feed?.rows || [];

  // One entry per league section that maps to a canonical slug and carries ids.
  const only = Array.isArray(leagues) && leagues.length ? new Set(leagues) : null;
  const targets = new Map(); // slug -> { tournamentId, stageId, leaguePath }
  for (const m of rows) {
    if (!m.tournamentId || !m.stageId) continue;
    const slug = resolveSlugFromPath(m.leaguePath) || resolveSlug(m.country, m.leagueName);
    if (!slug || slug.startsWith("fs.")) continue;          // canonical (UI) slugs only
    if (isKnownNonLeagueCompetition(slug)) continue;        // cups never get tables
    if (only && !only.has(slug)) continue;
    if (!targets.has(slug)) targets.set(slug, { tournamentId: m.tournamentId, stageId: m.stageId, leaguePath: m.leaguePath });
  }

  log(`feed leagues with ids: ${targets.size}${only ? ` (filtered to ${[...only].join(",")})` : ""}`);

  const results = { refreshed: [], unchangedKept: [], implausible: [], fetchFailed: [] };
  for (const [slug, t] of targets) {
    await sleep(DELAY_MS);
    const st = await fetchFlashscoreStandings(t.tournamentId, t.stageId);
    if (!st.ok) {
      results.fetchFailed.push({ slug, status: st.status, error: st.error || null });
      continue;
    }
    if (!isPlausibleLeagueTable(st.rows)) {
      results.implausible.push({ slug, rows: st.rows.length });
      continue;
    }

    const meta = getLeagueMeta(slug);
    const season = currentSeasonLabel(slug, meta);
    const rec = recordStandingsResult(slug, {
      status: "accepted",
      season,
      level: "flashscore_live_table",
      source: "flashscore.mobi",
      url: st.url,
      confidence: 1,
      rowCount: st.rows.length,
      rows: st.rows
    });
    const top = st.rows[0];
    if (rec.written) {
      results.refreshed.push({ slug, rows: st.rows.length, top: `${top.teamName} P${top.played} ${top.points}pts` });
      log(`refreshed ${slug}: ${st.rows.length} rows, top ${top.teamName} P${top.played} ${top.points}pts`);
    } else {
      results.unchangedKept.push({ slug, reason: rec.reason });
    }
  }

  return {
    ok: true,
    targets: targets.size,
    refreshedCount: results.refreshed.length,
    keptCount: results.unchangedKept.length,
    implausibleCount: results.implausible.length,
    failedCount: results.fetchFailed.length,
    ...results
  };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const arg = process.argv.find(a => a.startsWith("--leagues="));
  const leagues = arg ? arg.slice("--leagues=".length).split(",").map(s => s.trim()).filter(Boolean) : null;
  refreshStandingsFromFlashscore({ leagues })
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(e => { console.error("[fs-standings] fatal", String(e?.message || e)); process.exitCode = 1; });
}
