/**
 * run-day.js
 *
 * The autonomous daily run — no ESPN, no odds API. Produces the picture the UI
 * shows for the day:
 *   1. refresh league awareness from the season calendar (active / offseason),
 *   2. capture today + next-days fixtures with REAL bookmaker odds (opening frozen,
 *      drift tracked) and attach our AI assessment for the details view.
 *
 * Standings (Part 1) are assumed already collected; run the standings jobs
 * separately to (re)fresh them.
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

function log(...a) { console.log("[run-day]", ...a); }

export async function runDay() {
  const today = athensDayKey();
  log("start", { today });

  // 1) Deterministic awareness refresh (which leagues are active today).
  const awareness = classifyAllByCalendar();
  log("awareness", { active: awareness.summary?.activeCount, offseason: awareness.summary?.finishedCount });

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
  runDay().catch(err => {
    console.error("[run-day] fatal", String(err?.message || err));
    process.exitCode = 1;
  });
}
