/**
 * run-day.js
 *
 * The autonomous daily run — no ESPN, no odds API. One self-contained pass that
 * runs at day rollover and leaves no gaps / nothing manual:
 *   1. refresh league awareness from the season calendar (active / offseason),
 *   2. accumulate yesterday's results into form memory (history-index builder),
 *   3. comprehensive fixtures snapshot (display) for our coverage leagues,
 *   4. real bookmaker odds (opening frozen + drift) + our AI assessment,
 *   5. coverage report so any data gap is explicit.
 *
 * Usage: node engine-v1/jobs/run-day.js
 */

import { pathToFileURL } from "node:url";
import { athensDayKey } from "../core/daykey.js";
import { classifyAllByCalendar } from "../source-discovery/league-awareness-service.js";
import { runOddsOpening } from "./run-odds-opening.js";
import { exportOddsSnapshotDay } from "./export-odds-snapshot-day.js";
import { exportFixturesSnapshotDay } from "./export-fixtures-snapshot-day.js";
import { buildCoverageReport } from "./build-coverage-report.js";
import { accumulateResults } from "./accumulate-results-day.js";
import { accumulateDiscipline } from "./run-discipline-day.js";
import { deriveStandingsFromResults } from "./derive-standings-from-results.js";
import { refreshRefereeStats } from "./run-referee-stats.js";
import { buildTeamGeoSparql } from "./build-team-geo-sparql.js";
import { buildTeamAliasesSparql } from "./build-team-aliases-sparql.js";
import { settleAssessments } from "./settle-assessments-day.js";
import { accumulateLineups } from "./run-lineups-day.js";

function log(...a) { console.log("[run-day]", ...a); }

export async function runDay(dayKey) {
  const today = dayKey || athensDayKey();
  log("start", { today });

  // 1) Deterministic awareness refresh (which leagues are active today).
  const awareness = classifyAllByCalendar();
  log("awareness", { active: awareness.summary?.activeCount, offseason: awareness.summary?.finishedCount });

  // 2) Accumulate yesterday's finished results into form memory (no gaps over time).
  const results = await accumulateResults();
  log("results-accumulate", { stored: results.stored, leagues: Object.keys(results.byLeague).length, totalResults: results.results.results });

  // 2b) Accumulate yesterday's discipline (cards/fouls/penalties) for referee/value.
  const discipline = await accumulateDiscipline({ max: 300 });
  log("discipline-accumulate", { stored: discipline.stored, withStats: discipline.withStats, totalMatches: discipline.discipline.matches });

  // 2b2) Verify past assessments against final scores (yes/no per market).
  const settled = await settleAssessments();
  log("settle-assessments", { finished: settled.finished, settled: settled.settled });

  // 2b3) Accumulate starting XIs (player-usage / expected lineups).
  const lineups = await accumulateLineups({ max: 200 });
  log("lineups-accumulate", { stored: lineups.stored, withLineups: lineups.withLineups, totalMatches: lineups.lineups.matches });

  // 2c) Fill standings gaps (no-Wikipedia long-tail) by deriving a table from results.
  const derived = deriveStandingsFromResults();
  log("derive-standings", { derived: derived.derived, leagues: Object.keys(derived.byLeague) });

  // 2d) Weekly (Mondays): refresh per-referee tendencies — slow-changing, and TM
  // is reachable via the proxy. Done before odds so the enrichment uses fresh data.
  if (new Date(`${today}T12:00:00Z`).getUTCDay() === 1) {
    try {
      const refs = await refreshRefereeStats();
      log("referee-stats-refresh", { leagues: refs.leagues, referees: refs.referees?.referees });
    } catch (e) { log("referee-stats-refresh:skip", String(e?.message || e)); }
    try {
      const geo = await buildTeamGeoSparql();   // newly-promoted teams pick up coords
      log("team-geo-sparql", { matched: geo.matched, written: geo.written });
    } catch (e) { log("team-geo-sparql:skip", String(e?.message || e)); }
    try {
      const al = await buildTeamAliasesSparql();  // alternate names for cross-source matching
      log("team-aliases-sparql", { matched: al.matched, aliasesWritten: al.aliasesWritten });
    } catch (e) { log("team-aliases-sparql:skip", String(e?.message || e)); }
  }

  // 1b) Comprehensive fixtures snapshot (display) for our coverage leagues.
  const fxSnap = await exportFixturesSnapshotDay(today);
  log("fixtures-snapshot", { count: fxSnap.count });

  // 2) Fixtures + real odds + AI assessment for the Athens window.
  await runOddsOpening();

  // 3) Write the deployable odds artifact (data/deploy-snapshots/{day}/odds.json).
  const snap = exportOddsSnapshotDay(today);
  log("odds-snapshot", { count: snap.count, file: snap.file });

  // 4) Refresh the coverage report so data gaps stay explicit (not discovered late).
  const cov = buildCoverageReport(today);
  log("coverage", { ...cov.totals, missingStandingsForFixtures: cov.gaps.fixtureLeaguesMissingStandings.length });

  log("done", { today });
  return { ok: true, today, oddsCount: snap.count };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const arg = process.argv.slice(2).find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
  runDay(arg).catch(err => {
    console.error("[run-day] fatal", String(err?.message || err));
    process.exitCode = 1;
  });
}
