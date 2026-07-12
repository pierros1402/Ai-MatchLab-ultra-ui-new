/**
 * run-day.js
 *
 * The autonomous daily run — self-contained, multi-source, self-learning:
 *   1. Calendar awareness (floor — observation will override when data exists)
 *   2. Accumulate yesterday's results, discipline, lineups, H2H
 *   3. Observation-driven league state (overrides calendar with real evidence)
 *   4. Verify yesterday's expected matches were actually collected (multi-source)
 *   5. Record today's expected matches (for tomorrow's verification)
 *   6. Derive standings from results (no Wikipedia needed for active leagues)
 *   7. Comprehensive fixtures snapshot + odds + AI assessment
 *   8. Coverage report (gaps stay explicit, not discovered late)
 *
 * Usage: node engine-v1/jobs/run-day.js [YYYY-MM-DD]
 */

import { pathToFileURL } from "node:url";
import { athensDayKey } from "../core/daykey.js";
import { classifyAllByCalendar } from "../source-discovery/league-awareness-service.js";
import { runOddsOpening } from "./run-odds-opening.js";
import { exportOddsSnapshotDay } from "./export-odds-snapshot-day.js";
import { buildValueDay } from "../core/build-value-day.js";
import { exportFixturesSnapshotDay } from "./export-fixtures-snapshot-day.js";
import { buildCoverageReport } from "./build-coverage-report.js";
import { accumulateResults } from "./accumulate-results-day.js";
import { accumulateResultsFromFixtures } from "./accumulate-results-from-fixtures-day.js";
import { buildHistoryArchiveFromResults } from "./build-history-archive-from-results.js";
import { buildModelPriors } from "./build-model-priors.js";
import { buildCurrentSeasonIndexes } from "./build-current-season-indexes.js";
import { currentSeason } from "../core/season.js";
import { resolveDataPath } from "../storage/data-root.js";
import fsNode from "node:fs";
import { accumulateDiscipline } from "./run-discipline-day.js";
import { deriveStandingsFromResults } from "./derive-standings-from-results.js";
import { refreshRefereeStats } from "./run-referee-stats.js";
import { buildTeamGeoSparql } from "./build-team-geo-sparql.js";
import { buildTeamAliasesSparql } from "./build-team-aliases-sparql.js";
import { settleAssessments } from "./settle-assessments-day.js";
import { accumulateLineups } from "./run-lineups-day.js";
import { accumulateH2H } from "./accumulate-h2h.js";
import { updateLeagueStateFromResults } from "./update-league-state-from-results.js";
import { recordExpectedDay } from "./record-expected-day.js";
import { verifyResultsDay } from "./verify-results-day.js";

function log(...a) { console.log("[run-day]", ...a); }

export async function runDay(dayKey) {
  const today = dayKey || athensDayKey();
  log("start", { today });

  // yesterday's date — used for verification (accumulate always runs for yesterday)
  const yesterdayDate = new Date(`${today}T12:00:00Z`);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = yesterdayDate.toISOString().slice(0, 10);

  // 1) Calendar awareness — floor classification (observation will upgrade/override below).
  const awareness = classifyAllByCalendar();
  log("awareness:calendar", { active: awareness.summary?.activeCount, offseason: awareness.summary?.finishedCount });

  // 2) Accumulate yesterday's finished results into form memory (no gaps over time).
  const results = await accumulateResults();
  log("results-accumulate", { stored: results.stored, leagues: Object.keys(results.byLeague).length, totalResults: results.results.results });

  // 2a) Also persist the FINAL scores we DISPLAYED (ESPN-canonical fixtures
  //     snapshot) into the SAME results memory — so what the app showed as
  //     finished is remembered and flows into archive→priors, even when the
  //     Flashscore feed missed it. Fixture-identity deduped: only adds results
  //     not already present (never manufactures cross-source duplicates).
  const fxResults = accumulateResultsFromFixtures(yesterday);
  log("results-accumulate-fixtures", {
    stored: fxResults.stored,
    alreadyPresent: fxResults.alreadyPresent,
    final: fxResults.final,
    leagues: Object.keys(fxResults.byLeague).length,
  });

  // 2b) Accumulate yesterday's discipline (cards/fouls/penalties) for referee/value.
  const discipline = await accumulateDiscipline({ max: 300 });
  log("discipline-accumulate", { stored: discipline.stored, withStats: discipline.withStats, totalMatches: discipline.discipline.matches });

  // 2b2) Verify past assessments against final scores (yes/no per market).
  const settled = await settleAssessments();
  log("settle-assessments", { finished: settled.finished, settled: settled.settled });

  // 2b3) Accumulate starting XIs (player-usage / expected lineups).
  const lineups = await accumulateLineups({ max: 200 });
  log("lineups-accumulate", { stored: lineups.stored, withLineups: lineups.withLineups, totalMatches: lineups.lineups.matches });

  // 2b4) Accumulate H2H for ALL completed matches (no league filter) — builds
  //      head-to-head history even for leagues without standings coverage.
  const h2h = await accumulateH2H();
  log("h2h-accumulate", { stored: h2h.stored, finished: h2h.finished, scanned: h2h.scanned });

  // 2c) Observation-driven league state — overrides calendar with real evidence.
  //     Runs AFTER accumulation so yesterday's results are already in league-memory.
  //     Leagues with a result in the last 14 days → "active" regardless of calendar.
  const observed = updateLeagueStateFromResults();
  log("awareness:observation", {
    updated: observed.updated,
    overriddenCalendar: observed.overriddenCalendar,
    active: observed.byObservedState?.active?.length,
    break: observed.byObservedState?.break?.length,
    finished: observed.byObservedState?.finished?.length,
  });

  // 2d) Verify yesterday's expected matches were actually collected (multi-source check).
  //     Primary: league-memory/results (Flashscore).  Secondary: ESPN fixtures.json.
  //     Exits with a non-zero summary (but does NOT abort the day) — the workflow
  //     reads the exit code separately to decide whether to send an alert.
  const verification = verifyResultsDay(yesterday);
  log("verify-results", {
    date: yesterday,
    expected: verification.expectedInScope,
    foundPrimary: verification.foundPrimary,
    foundSecondary: verification.foundSecondary,
    missing: verification.missing,
    missingByLeague: verification.missingByLeague,
    ok: verification.ok,
  });

  // 2e) Record TODAY's scheduled matches now (before they kick off) so that
  //     tomorrow's verification cycle can check them.
  const expected = recordExpectedDay(today);
  log("record-expected", { date: today, matchCount: expected.matchCount });

  // 2f) Fill standings gaps (no-Wikipedia long-tail) by deriving a table from results.
  const derived = deriveStandingsFromResults();
  log("derive-standings", { derived: derived.derived, leagues: Object.keys(derived.byLeague) });

  // 2g) Roll fresh results into the value history-archive (current season kept
  //     live, completed seasons frozen) and rebuild model-priors ONLY when the
  //     season set actually changed — i.e. a season just rolled over (the new
  //     current season has no priors file yet) or a league gained a completed
  //     season of depth. Otherwise the past-season priors are unchanged, so we
  //     skip the rebuild (no daily churn). Fully automatic — no manual runs.
  try {
    const arch = buildHistoryArchiveFromResults();
    const priorsFile = resolveDataPath("model-priors", `${currentSeason()}.json`);
    const rollover = !fsNode.existsSync(priorsFile);   // new season → priors not built yet
    const newDepth = arch.pastSeasonsWritten > 0;      // a completed season newly archived
    log("history-archive-refresh", {
      seasons: arch.seasons,
      currentFilesWritten: arch.currentSeasonFilesWritten,
      pastSeasonsWritten: arch.pastSeasonsWritten,
    });
    if (rollover || newDepth) {
      const priors = await buildModelPriors();
      log("model-priors-rebuild", {
        reason: rollover ? "season_rollover" : "new_coverage",
        target: priors.targetSeason,
        sources: Array.isArray(priors.sourceSeasons) ? priors.sourceSeasons.join(",") : priors.sourceSeasons,
        teamPriors: priors.teamPriors,
        leaguePriors: priors.leaguePriors,
      });
    } else {
      log("model-priors", { rebuilt: false, reason: "season_set_unchanged" });
    }
  } catch (e) {
    log("history-archive-priors:skip", String(e?.message || e));
  }

  // 2h) Rebuild the CURRENT-season form indexes (team/league/matchup) from the
  //     season history, so value form stays fresh and — at rollover — the new
  //     season's index is created automatically (season derived from season.js).
  try {
    await buildCurrentSeasonIndexes();
    log("current-season-indexes", { season: currentSeason() });
  } catch (e) {
    log("current-season-indexes:skip", String(e?.message || e));
  }

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

  // 3b) Value picks — PURE STATS, ODDS-FREE (hard firewall). buildValueDay derives
  //     picks ONLY from history/priors/standings/form via evaluateMatchValue; odds
  //     never enter value, not even as a transport artifact. (Replaces the old
  //     deriveValueFromOdds bridge that read the assessment out of odds.json.)
  const value = await buildValueDay(today, { rebuild: true });
  log("value-build", { count: value.count });

  // 4) Refresh the coverage report so data gaps stay explicit (not discovered late).
  const cov = buildCoverageReport(today);
  log("coverage", { ...cov.totals, missingStandingsForFixtures: cov.gaps.fixtureLeaguesMissingStandings.length });

  const verificationOk = verification.skipped || verification.ok;
  log("done", { today, oddsCount: snap.count, valuePicks: value.count, verificationOk, missingResults: verification.missing ?? 0 });
  return { ok: true, today, oddsCount: snap.count, valuePicks: value.count, verificationOk, missingResults: verification.missing ?? 0 };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const arg = process.argv.slice(2).find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
  runDay(arg).catch(err => {
    console.error("[run-day] fatal", String(err?.message || err));
    process.exitCode = 1;
  });
}
