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
