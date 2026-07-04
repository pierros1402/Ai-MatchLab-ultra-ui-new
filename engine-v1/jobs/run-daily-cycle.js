import fs from "fs";
import path from "path";
import { spawnSync } from "node:child_process";
import { athensDayKey, shiftDay } from "../core/daykey.js";
import { discoverWindow } from "./discover-window.js";
import { discoverActiveLeagues } from "./discover-active-leagues.js";
import { monitorActiveLeagues } from "./monitor-active-leagues.js";
import { finalizeDayIfSafe } from "./finalize-day.js";
import { appendFinalizedDayToHistory } from "./append-finalized-day-to-history.js";
import { rebuildIndexesForSeason } from "./rebuild-indexes-for-season.js";
import { buildDetailsDay } from "./build-details-day.js";
import { buildStandingsDay } from "./build-standings-day.js";
import { buildTeamNewsDay } from "./build-team-news-day.js";
import { buildPlayerUsageWorksetDay } from "./build-player-usage-workset-day.js";
import { buildPlayerUsageDeterministicCandidatesDay } from "./build-player-usage-deterministic-candidates-day.js";
import { buildPlayerUsageAiCandidateReviewDay } from "./build-player-usage-ai-candidate-review-day.js";
import { promotePlayerUsageAiCandidatesDay } from "./promote-player-usage-ai-candidates-day.js";
import { applyPlayerUsageSeedsDay } from "./apply-player-usage-seeds-day.js";
import { validatePlayerUsageManualResultsDay } from "./validate-player-usage-manual-results-day.js";
import { buildPlayerUsageManualDraftsDay } from "./build-player-usage-manual-drafts-day.js";
import { buildPlayerUsageResearchTasksDay } from "./build-player-usage-research-tasks-day.js";
import { runPlayerUsageResearchTasksDay } from "./run-player-usage-research-tasks-day.js";
import { importPlayerUsageManualResultsDay } from "./import-player-usage-manual-results-day.js";
import { applyTeamGeoSeedsDay } from "./apply-team-geo-seeds-day.js";
import { buildTeamGeoDay } from "./build-team-geo-day.js";
import { buildTeamNewsWorksetDay } from "./build-team-news-workset-day.js";
import { buildTeamNewsResearchTasksDay } from "./build-team-news-research-tasks-day.js";
import { runTeamNewsResearchTasksDay } from "./run-team-news-research-tasks-day.js";
import { buildTeamNewsResearchReviewDay } from "./build-team-news-research-review-day.js";
import { buildTeamNewsSourceCoverageReportDay } from "./build-team-news-source-coverage-report-day.js";
import { normalizeTeamNewsSourceCoverageReportDay } from "./normalize-team-news-source-coverage-report-day.js";
import { buildTeamNewsSourceEnrichmentTasksDay } from "./build-team-news-source-enrichment-tasks-day.js";
import { applyTeamNewsSeedsDay } from "./apply-team-news-seeds-day.js";
import { validateTeamNewsSeedsDay } from "./validate-team-news-seeds-day.js";
import { buildValueDay } from "../core/build-value-day.js";
import { buildValueCoverageReportDay } from "./build-value-coverage-report-day.js";
import { exportDeploySnapshotDay } from "./export-deploy-snapshot-day.js";
import { deriveValueFromOdds } from "./derive-value-from-odds.js";
import { runSnapshotInvariantCheck } from "./run-snapshot-invariant-check.js";
import { buildLeagueGapReportDay } from "./build-league-gap-report-day.js";
import { recoverBrokenLeaguesDay } from "./recover-broken-leagues-day.js";
import { fetchMultiBookmakerOdds, prefetchUpcomingOdds } from "./fetch-multi-bookmaker-odds.js";
import { fetchOddsPortalGreekOdds } from "./fetch-oddsportal-greek-odds.js";
import { syncCanonicalFixturesToJsonDbDay } from "./sync-canonical-fixtures-to-json-db-day.js";
import { runLiveStatusRefreshDay } from "./run-live-status-refresh-day.js";
import { auditFinalizationReadinessDay } from "./audit-finalization-readiness-day.js";
import { resolveDataPath } from "../storage/data-root.js";

function readJsonIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return {
      ok: false,
      error: error?.message || String(error),
      filePath
    };
  }
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function writeBlockedValueFile(dayKey, reason, readinessSummary) {
  const file = resolveDataPath(`value/${dayKey}.json`);
  const payload = {
    date: dayKey,
    source: "daily-cycle-fixture-acquisition-v2-guard",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    count: 0,
    picks: [],
    blocked: true,
    reason,
    readinessSummary,
    guarantees: {
      fixtureAcquisitionV2Gate: true,
      espnOnlyIsUnsafeForValue: true,
      noValueFromUnverifiedFixtures: true
    }
  };

  writeJsonFile(file, payload);
  return { file, payload };
}

function fixtureAcquisitionReadyForValue(report) {
  const summary = report?.summary || {};
  return Boolean(report?.ok) &&
    Number(summary.blockedRows || 0) === 0 &&
    Number(summary.unsafeRows || 0) === 0;
}

function compactFixtureAcquisitionReadiness(report) {
  const summary = report?.summary || {};
  return {
    ok: Boolean(report?.ok),
    stage: report?.stage || null,
    dayKey: report?.dayKey || null,
    declaredLeagueCount: Number(summary.declaredLeagueCount || 0),
    canonicalLeagueCount: Number(summary.canonicalLeagueCount || 0),
    canonicalFixtureRows: Number(summary.canonicalFixtureRows || 0),
    readyRows: Number(summary.readyRows || 0),
    unsafeRows: Number(summary.unsafeRows || 0),
    blockedRows: Number(summary.blockedRows || 0),
    p0Rows: Number(summary.p0Rows || 0),
    p1Rows: Number(summary.p1Rows || 0),
    missingCanonicalFixtures: Number(summary.missingCanonicalFixtures || 0),
    espnOnlyCanonicalFixtures: Number(summary.espnOnlyCanonicalFixtures || 0),
    missingNonEspnProviderCapability: Number(summary.missingNonEspnProviderCapability || 0),
    guarantees: report?.guarantees || null
  };
}

function runDailyCycleNodeJob(args, label) {
  const result = spawnSync(globalThis.process.execPath, args, {
    cwd: globalThis.process.cwd(),
    encoding: "utf8",
    windowsHide: true
  });

  if (result.stdout) {
    for (const line of result.stdout.trim().split(/\r?\n/u).filter(Boolean)) {
      console.log(`[daily-cycle] ${label}:stdout`, line);
    }
  }

  if (result.stderr) {
    for (const line of result.stderr.trim().split(/\r?\n/u).filter(Boolean)) {
      console.warn(`[daily-cycle] ${label}:stderr`, line);
    }
  }

  if (result.status !== 0) {
    console.warn(`[daily-cycle] ${label}:failed exit code ${result.status} — skipping`);
    return { status: result.status, error: `exit code ${result.status}` };
  }

  return result;
}
function normalizePositiveIntegerOption(value, fallback) {
  if (value === Infinity) return Infinity;

  const n = Number(value);

  if (!Number.isFinite(n) || n <= 0) {
    return fallback;
  }

  return Math.floor(n);
}

function readCurrentDayFixtureCount(dayKey) {
  try {
    const file = resolveDataPath("fixtures.json");
    if (!fs.existsSync(file)) return 0;

    const payload = JSON.parse(fs.readFileSync(file, "utf8"));
    const fixtures = Array.isArray(payload?.fixtures) ? payload.fixtures : [];

    return fixtures.filter(row => String(row?.dayKey || "") === String(dayKey)).length;
  } catch {
    return 0;
  }
}

function countCanonicalFixtureRowsForDay(dayKey) {
  const dir = resolveDataPath("canonical-fixtures", dayKey);

  if (!fs.existsSync(dir)) return 0;

  let total = 0;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;

    try {
      const file = resolveDataPath("canonical-fixtures", dayKey, entry.name);
      const payload = JSON.parse(fs.readFileSync(file, "utf8"));
      const rows = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.fixtures)
          ? payload.fixtures
          : Array.isArray(payload?.matches)
            ? payload.matches
            : Array.isArray(payload?.rows)
              ? payload.rows
              : [];

      total += rows.length;
    } catch {
      // Keep the daily gate conservative: unreadable canonical fixture files are ignored.
    }
  }

  return total;
}

function readCanonicalCoverageForDay(dayKey) {
  try {
    const file = resolveDataPath("coverage-reports", `${dayKey}.json`);

    if (fs.existsSync(file)) {
      const payload = JSON.parse(fs.readFileSync(file, "utf8"));
      const coverage = payload?.coverage || null;
      const fixtures = Number(coverage?.fixtures || 0);
      const leagues = Number(coverage?.leagues || 0);

      if (payload?.ok && fixtures > 0) {
        return {
          fixtures,
          leagues,
          source: "coverage_report",
          reportType: payload?.type || null,
          startedAt: payload?.startedAt || null,
          generatedAt: payload?.generatedAt || null,
          cursorComplete: Boolean(payload?.cursorComplete),
          nextCursor: payload?.nextCursor ?? null,
          leagueSeedCount: payload?.leagueSeedCount ?? null
        };
      }
    }

    const canonicalFixtureRows = countCanonicalFixtureRowsForDay(dayKey);

    if (canonicalFixtureRows > 0) {
      return {
        fixtures: canonicalFixtureRows,
        leagues: 0,
        source: "canonical_fixtures",
        reportType: "canonical_fixture_files",
        startedAt: null,
        generatedAt: null,
        cursorComplete: null,
        nextCursor: null,
        leagueSeedCount: null
      };
    }

    return null;
  } catch {
    return null;
  }
}
function resolveMinTargetFixtures({ staticMinTargetFixtures, canonicalCoverage }) {
  if (!canonicalCoverage?.fixtures) {
    return {
      minTargetFixtures: staticMinTargetFixtures,
      source: "static"
    };
  }

  const canonicalFixtures = Number(canonicalCoverage.fixtures || 0);
  const canonicalFloor = Math.max(1, Math.floor(canonicalFixtures * 0.95));

  return {
    minTargetFixtures: Math.min(staticMinTargetFixtures, canonicalFloor),
    source: "canonical_coverage"
  };
}

function getTargetIngestResult(discoveryWindow, dayKey) {
  const rows = Array.isArray(discoveryWindow?.results) ? discoveryWindow.results : [];
  return rows.find(row => String(row?.dayKey || "") === String(dayKey))?.ingest || null;
}

function buildTopWrongDayLeagues(ingest) {
  const byLeague = ingest?.byLeague || {};

  return Object.entries(byLeague)
    .map(([slug, row]) => ({
      slug,
      rawEvents: Number(row?.rawEvents || 0),
      normalized: Number(row?.normalized || 0),
      skippedWrongDay: Number(row?.skippedWrongDay || 0),
      inserted: Number(row?.inserted || 0),
      updated: Number(row?.updated || 0),
      unchanged: Number(row?.unchanged || 0)
    }))
    .filter(row => row.skippedWrongDay > 0 || row.normalized > 0 || row.rawEvents > 0)
    .sort((a, b) => b.skippedWrongDay - a.skippedWrongDay)
    .slice(0, 25);
}
function assertDailyIngestIsUsable({ dayKey, discoveryWindow }) {
  const ingest = getTargetIngestResult(discoveryWindow, dayKey);

  if (!ingest) {
    throw new Error(`daily_ingest_quality_failed: missing target-day ingest result for ${dayKey}`);
  }

  const rawEvents = Number(ingest.rawEvents || 0);
  const normalized = Number(ingest.normalized || 0);
  const inserted = Number(ingest.inserted || 0);
  const updated = Number(ingest.updated || 0);
  const unchanged = Number(ingest.unchanged || 0);
  const skippedWrongDay = Number(ingest.skippedWrongDay || 0);
  const skippedNull = Number(ingest.skippedNull || 0);
  const fixtureCount = readCurrentDayFixtureCount(dayKey);
  const canonicalCoverage = readCanonicalCoverageForDay(dayKey);

  const keptByIngest = inserted + updated + unchanged;
  const wrongDayRatio = normalized > 0 ? skippedWrongDay / normalized : 0;
  const keptRatioFromRaw = rawEvents > 0 ? keptByIngest / rawEvents : 1;

  const minRawForGate = Number(process.env.DAILY_INGEST_MIN_RAW_FOR_GATE || 50);
  const maxWrongDayRatio = Number(process.env.DAILY_INGEST_MAX_WRONG_DAY_RATIO || 0.4);
  const minKeptRatioFromRaw = Number(process.env.DAILY_INGEST_MIN_KEPT_RATIO_FROM_RAW || 0.5);
  const staticMinTargetFixtures = Number(process.env.DAILY_INGEST_MIN_TARGET_FIXTURES || 45);
  const targetFixtureGate = resolveMinTargetFixtures({
    staticMinTargetFixtures,
    canonicalCoverage
  });
  const minTargetFixtures = targetFixtureGate.minTargetFixtures;

  const summary = {
    dayKey,
    rawEvents,
    normalized,
    inserted,
    updated,
    unchanged,
    keptByIngest,
    fixtureCount,
    canonicalCoverage,
    skippedWrongDay,
    skippedNull,
    wrongDayRatio: Number(wrongDayRatio.toFixed(3)),
    keptRatioFromRaw: Number(keptRatioFromRaw.toFixed(3)),
    minRawForGate,
    maxWrongDayRatio,
    minKeptRatioFromRaw,
    staticMinTargetFixtures,
    minTargetFixtures,
    minTargetFixtureSource: targetFixtureGate.source,
    topWrongDayLeagues: buildTopWrongDayLeagues(ingest)
  };

  console.log("[daily-cycle] ingest-quality", JSON.stringify(summary, null, 2));

  const hasCanonicalFixtureTarget = Number(canonicalCoverage?.fixtures || 0) > 0;

  // Cross-midnight builds (evening pre-build of tomorrow, early-morning
  // catch-up of today) legitimately see many neighboring-day events from
  // sources still keyed to the adjacent day; those are skipped, not written.
  // The ratio checks are only a corruption signal when the target day's
  // absolute coverage is short — real mis-keying starves fixtureCount and
  // still fails the target-fixture check below.
  const coverageSatisfied = hasCanonicalFixtureTarget && fixtureCount >= minTargetFixtures;

  if (rawEvents >= minRawForGate && wrongDayRatio > maxWrongDayRatio) {
    if (coverageSatisfied) {
      console.warn(
        `[daily-cycle] ingest-quality warning: wrong-day ratio ${summary.wrongDayRatio} above ${maxWrongDayRatio} but coverage target met (${fixtureCount}/${minTargetFixtures}); continuing`
      );
    } else {
      throw new Error(
        `daily_ingest_quality_failed: excessive wrong-day skips for ${dayKey}; summary=${JSON.stringify(summary)}`
      );
    }
  }

  if (rawEvents >= minRawForGate && keptRatioFromRaw < minKeptRatioFromRaw) {
    if (coverageSatisfied) {
      console.warn(
        `[daily-cycle] ingest-quality warning: kept/raw ratio ${summary.keptRatioFromRaw} below ${minKeptRatioFromRaw} but coverage target met (${fixtureCount}/${minTargetFixtures}); continuing`
      );
    } else {
      throw new Error(
        `daily_ingest_quality_failed: low kept/raw ratio for ${dayKey}; summary=${JSON.stringify(summary)}`
      );
    }
  }

  if (
    (hasCanonicalFixtureTarget && fixtureCount < minTargetFixtures) ||
    (!hasCanonicalFixtureTarget && fixtureCount > 0 && fixtureCount < minTargetFixtures)
  ) {
    throw new Error(
      `daily_ingest_quality_failed: low target fixture count for ${dayKey}; summary=${JSON.stringify(summary)}`
    );
  }

  return summary;
}

function readPositiveIntegerEnv(name, fallback) {
  const raw = globalThis.process?.env?.[name];

  if (raw == null || raw === "") {
    return fallback;
  }

  if (String(raw).toLowerCase() === "all" || String(raw).toLowerCase() === "infinity") {
    return Infinity;
  }

  return normalizePositiveIntegerOption(raw, fallback);
}

export async function runDailyCycle(options = {}) {
  const {
    dayKey = athensDayKey(),
    doFinalize = true,
    daysForward = 2,
    detailsRebuild = true,
    teamNewsMaxTeams = readPositiveIntegerEnv("TEAM_NEWS_MAX_TEAMS", Infinity),
    teamNewsResearchMaxTasks = readPositiveIntegerEnv("TEAM_NEWS_RESEARCH_MAX_TASKS", 24),
    playerUsageResearchMaxTasks = readPositiveIntegerEnv("PLAYER_USAGE_RESEARCH_MAX_TASKS", 24),
    playerUsageManualDraftLimit = readPositiveIntegerEnv("PLAYER_USAGE_MANUAL_DRAFT_LIMIT", 12)
  } = options;

  const normalizedTeamNewsMaxTeams = normalizePositiveIntegerOption(
    teamNewsMaxTeams,
    Infinity
  );

  const normalizedTeamNewsResearchMaxTasks = normalizePositiveIntegerOption(
    teamNewsResearchMaxTasks,
    24
  );

  const normalizedPlayerUsageResearchMaxTasks = normalizePositiveIntegerOption(
    playerUsageResearchMaxTasks,
    24
  );

  const normalizedPlayerUsageManualDraftLimit = normalizePositiveIntegerOption(
    playerUsageManualDraftLimit,
    12
  );

  const startedAt = Date.now();
  const finalizeDayKey = shiftDay(dayKey, -1);

  console.log("[daily-cycle] start", {
    dayKey,
    finalizeDayKey,
    doFinalize,
    daysForward,
    teamNewsMaxTeams: normalizedTeamNewsMaxTeams,
    teamNewsResearchMaxTasks: normalizedTeamNewsResearchMaxTasks,
    playerUsageResearchMaxTasks: normalizedPlayerUsageResearchMaxTasks,
    playerUsageManualDraftLimit: normalizedPlayerUsageManualDraftLimit
  });


  // Self-heal: re-acquire leagues that have expected matches but zero canonical
  // fixtures (season-calendar false negatives / provider zero-events) BEFORE
  // anything downstream consumes fixtures, so recovered matches get standings,
  // details and value like any other. No human intervention required.
  try {
    const recovery = await recoverBrokenLeaguesDay(dayKey);
    console.log("[daily-cycle] broken-league-recovery:done", {
      dayKey,
      recovered: (recovery?.recovered || []).map(r => `${r.slug}(${r.fixtures})`),
      stillBroken: (recovery?.stillBroken || []).map(s => s.slug)
    });
  } catch (e) {
    console.error("[daily-cycle] broken-league-recovery:error", e?.message);
  }

  console.log("[daily-cycle] canonical-fixtures-sync:start", { dayKey });

  const canonicalFixturesSync = syncCanonicalFixturesToJsonDbDay(dayKey, {
    write: true
  });

  console.log("[daily-cycle] canonical-fixtures-sync:done", {
    ok: canonicalFixturesSync?.ok,
    dayKey: canonicalFixturesSync?.dayKey,
    fileCount: canonicalFixturesSync?.fileCount ?? 0,
    rawRows: canonicalFixturesSync?.rawRows ?? 0,
    acceptedRows: canonicalFixturesSync?.acceptedRows ?? 0,
    inserted: canonicalFixturesSync?.inserted ?? 0,
    updated: canonicalFixturesSync?.updated ?? 0,
    unchanged: canonicalFixturesSync?.unchanged ?? 0,
    skippedRows: canonicalFixturesSync?.skippedRows ?? 0
  });

  console.log("[daily-cycle] discover-active-leagues:start", { dayKey });
  const activeLeagues = await discoverActiveLeagues(dayKey);
  console.log("[daily-cycle] discover-active-leagues:done", {
    ok: activeLeagues?.ok,
    dayKey: activeLeagues?.dayKey,
    activeLeagueCount: activeLeagues?.activeLeagueCount ?? 0,
    totalMatches: activeLeagues?.totalMatches ?? 0
  });

  console.log("[daily-cycle] discoverWindow:start");
  const discoveryWindow = await discoverWindow({
    baseDay: dayKey,
    daysBack: 1,
    daysForward
  });
  console.log("[daily-cycle] discoverWindow:done");

  console.log("[daily-cycle] ingest-quality:start", { dayKey });
  const ingestQuality = assertDailyIngestIsUsable({
    dayKey,
    discoveryWindow
  });
  console.log("[daily-cycle] ingest-quality:done", ingestQuality);

  console.log("[daily-cycle] monitor:start", { dayKey });
  const monitor = await monitorActiveLeagues(dayKey);
  console.log("[daily-cycle] monitor:done", monitor);

  let teamGeoSeeds = null;
  let teamGeoBuild = null;
  let playerUsageWorkset = null;
  let playerUsageDeterministicCandidates = null;
  let playerUsageAiCandidateReview = null;
  let playerUsageAiCandidatePromotion = null;
  let playerUsageManualValidation = null;
  let playerUsageSeeds = null;
  let playerUsageManualDrafts = null;
  let playerUsageResearchTasks = null;
  let playerUsageManualImport = null;
  let playerUsageResearchRun = null;
  let playerUsageDetailsRefresh = null;
  let teamNewsWorkset = null;
  let teamNewsSeedValidation = null;
  let teamNewsSeeds = null;
  let teamNewsResearchTasks = null;
  let teamNewsResearchRun = null;
  let teamNewsSourceCoverage = null;
  let teamNewsSourceEnrichmentTasks = null;
  let teamNewsResearchReview = null;
  let teamNewsBuild = null;
  let finalDetailsSync = null;
  let valueBuild = null;
  let fixtureAcquisitionReadiness = null;
  let valueCoverageReport = null;
  let valueSettlementReport = null;
  let valueSettlementSummary = null;
  let valueSettlementStatistics = null;
  let deploySnapshot = null;
  let finalizedDeploySnapshot = null;
  let finalizeValueBuild = null;
  let finalizeReadiness = null;
  let finalize = null;
  let historyAppend = null;
  let indexesRebuild = null;

  console.log("[daily-cycle] standings-build:start", { dayKey });

  const standingsBuild = await buildStandingsDay(
    dayKey,
    activeLeagues?.leagues || activeLeagues?.activeLeagues || []
  );

  console.log("[daily-cycle] standings-build:done", {
    ok: standingsBuild?.ok,
    dayKey: standingsBuild?.dayKey,
    leagueCount: standingsBuild?.leagueCount ?? 0,
    built: standingsBuild?.built ?? 0,
    skipped: standingsBuild?.skipped ?? 0
  });

  console.log("[daily-cycle] team-geo-seeds:start", { dayKey });

  teamGeoSeeds = await applyTeamGeoSeedsDay(dayKey);

  console.log("[daily-cycle] team-geo-seeds:done", {
    ok: teamGeoSeeds?.ok,
    dayKey: teamGeoSeeds?.dayKey,
    seedCount: teamGeoSeeds?.seedCount ?? 0,
    appliedCount: teamGeoSeeds?.appliedCount ?? 0,
    unresolvedCount: teamGeoSeeds?.unresolvedCount ?? 0,
    beforeCoveragePct: teamGeoSeeds?.before?.coveragePct ?? 0,
    afterCoveragePct: teamGeoSeeds?.after?.coveragePct ?? 0,
    afterMissingCount: teamGeoSeeds?.after?.missingCount ?? 0
  });

  console.log("[daily-cycle] team-geo-build:start", { dayKey });

  teamGeoBuild = await buildTeamGeoDay(dayKey);

  console.log("[daily-cycle] team-geo-build:done", {
    ok: teamGeoBuild?.ok,
    dayKey: teamGeoBuild?.dayKey,
    totalTeams: teamGeoBuild?.totalTeams ?? 0,
    existingCount: teamGeoBuild?.existingCount ?? 0,
    missingCount: teamGeoBuild?.missingCount ?? 0,
    coveragePct: teamGeoBuild?.coveragePct ?? 0,
    file: teamGeoBuild?.file || null
  });

  console.log("[daily-cycle] details-build:start", {
    dayKey,
    rebuild: detailsRebuild
  });

  const detailsBuild = await buildDetailsDay(dayKey, {
    rebuild: detailsRebuild
  });

  console.log("[daily-cycle] details-build:done", {
    ok: detailsBuild?.ok,
    dayKey: detailsBuild?.dayKey,
    rebuild: detailsRebuild,
    built: detailsBuild?.built ?? 0,
    skipped: detailsBuild?.skipped ?? 0
  });

  // ── Enrichment block: player-usage + team-news ───────────────────────────────
  // These steps depend on details/canonical fixtures existing for the day.
  // On World Cup days (or any day with no canonical fixtures), they skip gracefully.
  try {

  console.log("[daily-cycle] player-usage-workset:start", { dayKey });

  playerUsageWorkset = await buildPlayerUsageWorksetDay(dayKey);

  console.log("[daily-cycle] player-usage-workset:done", {
    ok: playerUsageWorkset?.ok,
    dayKey: playerUsageWorkset?.dayKey,
    teamCount: playerUsageWorkset?.teamCount ?? 0,
    missingCount: playerUsageWorkset?.missingCount ?? 0,
    insufficientCount: playerUsageWorkset?.insufficientCount ?? 0,
    okCount: playerUsageWorkset?.okCount ?? 0,
    file: playerUsageWorkset?.file || null
  });

  console.log("[daily-cycle] player-usage-deterministic-candidates:start", { dayKey });

  playerUsageDeterministicCandidates = await buildPlayerUsageDeterministicCandidatesDay(dayKey, {
    write: true
  });

  console.log("[daily-cycle] player-usage-deterministic-candidates:done", {
    ok: playerUsageDeterministicCandidates?.ok,
    dayKey: playerUsageDeterministicCandidates?.dayKey,
    dryRun: playerUsageDeterministicCandidates?.dryRun,
    detailsFileCount: playerUsageDeterministicCandidates?.detailsFileCount ?? 0,
    candidateReadyCount: playerUsageDeterministicCandidates?.candidateReadyCount ?? 0,
    candidateWrittenCount: playerUsageDeterministicCandidates?.candidateWrittenCount ?? 0,
    skippedExistingManualSeedCount: playerUsageDeterministicCandidates?.skippedExistingManualSeedCount ?? 0,
    failedValidationCount: playerUsageDeterministicCandidates?.failedValidationCount ?? 0,
    skippedInsufficientPlayersCount: playerUsageDeterministicCandidates?.skippedInsufficientPlayersCount ?? 0,
    file: playerUsageDeterministicCandidates?.file || null
  });

  console.log("[daily-cycle] player-usage-ai-candidate-review:start", { dayKey });

  playerUsageAiCandidateReview = await buildPlayerUsageAiCandidateReviewDay(dayKey);

  console.log("[daily-cycle] player-usage-ai-candidate-review:done", {
    ok: playerUsageAiCandidateReview?.ok,
    dayKey: playerUsageAiCandidateReview?.dayKey,
    candidateCount: playerUsageAiCandidateReview?.candidateCount ?? 0,
    needsReviewCount: playerUsageAiCandidateReview?.needsReviewCount ?? 0,
    approvedReadyForPromotionCount: playerUsageAiCandidateReview?.approvedReadyForPromotionCount ?? 0,
    invalidCandidateCount: playerUsageAiCandidateReview?.invalidCandidateCount ?? 0,
    notInWorksetCount: playerUsageAiCandidateReview?.notInWorksetCount ?? 0,
    promotableCount: playerUsageAiCandidateReview?.promotableCount ?? 0,
    reviewRequiredCount: playerUsageAiCandidateReview?.reviewRequiredCount ?? 0,
    file: playerUsageAiCandidateReview?.file || null
  });

  console.log("[daily-cycle] player-usage-ai-candidate-promotion:start", { dayKey });

  playerUsageAiCandidatePromotion = await promotePlayerUsageAiCandidatesDay(dayKey, {
    write: true
  });

  console.log("[daily-cycle] player-usage-ai-candidate-promotion:done", {
    ok: playerUsageAiCandidatePromotion?.ok,
    dayKey: playerUsageAiCandidatePromotion?.dayKey,
    dryRun: playerUsageAiCandidatePromotion?.dryRun,
    inputFileCount: playerUsageAiCandidatePromotion?.inputFileCount ?? 0,
    promotedCount: playerUsageAiCandidatePromotion?.promotedCount ?? 0,
    rejectedCount: playerUsageAiCandidatePromotion?.rejectedCount ?? 0,
    reviewRequiredCount: playerUsageAiCandidatePromotion?.reviewRequiredCount ?? 0,
    notInWorksetCount: playerUsageAiCandidatePromotion?.notInWorksetCount ?? 0,
    invalidRejectedCount: playerUsageAiCandidatePromotion?.invalidRejectedCount ?? 0,
    file: playerUsageAiCandidatePromotion?.file || null
  });

  console.log("[daily-cycle] player-usage-manual-validation:start", { dayKey });

  playerUsageManualValidation = await validatePlayerUsageManualResultsDay(dayKey);

  console.log("[daily-cycle] player-usage-manual-validation:done", {
    ok: playerUsageManualValidation?.ok,
    dayKey: playerUsageManualValidation?.dayKey,
    recordCount: playerUsageManualValidation?.recordCount ?? 0,
    acceptedCount: playerUsageManualValidation?.acceptedCount ?? 0,
    readyCount: playerUsageManualValidation?.readyCount ?? 0,
    partialCount: playerUsageManualValidation?.partialCount ?? 0,
    rejectedCount: playerUsageManualValidation?.rejectedCount ?? 0,
    notInWorksetCount: playerUsageManualValidation?.notInWorksetCount ?? 0,
    invalidJsonCount: playerUsageManualValidation?.invalidJsonCount ?? 0,
    file: playerUsageManualValidation?.file || null
  });

  console.log("[daily-cycle] player-usage-seeds:start", { dayKey });

  playerUsageSeeds = await applyPlayerUsageSeedsDay(dayKey);

  console.log("[daily-cycle] player-usage-seeds:done", {
    ok: playerUsageSeeds?.ok,
    dayKey: playerUsageSeeds?.dayKey,
    seedCount: playerUsageSeeds?.seedCount ?? 0,
    checkedCount: playerUsageSeeds?.checkedCount ?? 0,
    canonicalWriteCount: playerUsageSeeds?.canonicalWriteCount ?? 0,
    unresolvedCount: playerUsageSeeds?.unresolvedCount ?? 0,
    file: playerUsageSeeds?.file || null
  });

  if ((playerUsageSeeds?.canonicalWriteCount ?? 0) > 0) {
    console.log("[daily-cycle] player-usage-workset-refresh:start", { dayKey });

    playerUsageWorkset = await buildPlayerUsageWorksetDay(dayKey);

    console.log("[daily-cycle] player-usage-workset-refresh:done", {
      ok: playerUsageWorkset?.ok,
      dayKey: playerUsageWorkset?.dayKey,
      teamCount: playerUsageWorkset?.teamCount ?? 0,
      missingCount: playerUsageWorkset?.missingCount ?? 0,
      insufficientCount: playerUsageWorkset?.insufficientCount ?? 0,
      okCount: playerUsageWorkset?.okCount ?? 0,
      file: playerUsageWorkset?.file || null
    });
  }

  console.log("[daily-cycle] player-usage-manual-drafts:start", {
    dayKey,
    limit: normalizedPlayerUsageManualDraftLimit
  });

  playerUsageManualDrafts = await buildPlayerUsageManualDraftsDay(dayKey, {
    limit: normalizedPlayerUsageManualDraftLimit
  });

  console.log("[daily-cycle] player-usage-manual-drafts:done", {
    ok: playerUsageManualDrafts?.ok,
    dayKey: playerUsageManualDrafts?.dayKey,
    worksetTeamCount: playerUsageManualDrafts?.worksetTeamCount ?? 0,
    existingManualCount: playerUsageManualDrafts?.existingManualCount ?? 0,
    draftCount: playerUsageManualDrafts?.draftCount ?? 0,
    draftDir: playerUsageManualDrafts?.draftDir || null,
    file: playerUsageManualDrafts?.file || null
  });

  console.log("[daily-cycle] player-usage-research-tasks:start", { dayKey });

  playerUsageResearchTasks = await buildPlayerUsageResearchTasksDay(dayKey);

  console.log("[daily-cycle] player-usage-research-tasks:done", {
    ok: playerUsageResearchTasks?.ok,
    dayKey: playerUsageResearchTasks?.dayKey,
    taskCount: playerUsageResearchTasks?.taskCount ?? 0,
    file: playerUsageResearchTasks?.file || null
  });

  console.log("[daily-cycle] player-usage-manual-import:start", { dayKey });

  playerUsageManualImport = await importPlayerUsageManualResultsDay(dayKey);

  console.log("[daily-cycle] player-usage-manual-import:done", {
    ok: playerUsageManualImport?.ok,
    dayKey: playerUsageManualImport?.dayKey,
    inputFileCount: playerUsageManualImport?.inputFileCount ?? 0,
    importedCount: playerUsageManualImport?.importedCount ?? 0,
    rejectedCount: playerUsageManualImport?.rejectedCount ?? 0,
    file: playerUsageManualImport?.file || null
  });

  console.log("[daily-cycle] player-usage-research-run:start", {
    dayKey,
    maxTasks: normalizedPlayerUsageResearchMaxTasks
  });

  playerUsageResearchRun = await runPlayerUsageResearchTasksDay(dayKey, {
    maxTasks: normalizedPlayerUsageResearchMaxTasks
  });

  console.log("[daily-cycle] player-usage-research-run:done", {
    ok: playerUsageResearchRun?.ok,
    dayKey: playerUsageResearchRun?.dayKey,
    taskCount: playerUsageResearchRun?.taskCount ?? 0,
    acceptedPlayerUsageCount: playerUsageResearchRun?.acceptedPlayerUsageCount ?? 0,
    unresolvedPlayerUsageCount: playerUsageResearchRun?.unresolvedPlayerUsageCount ?? 0,
    canonicalWriteCount: playerUsageResearchRun?.canonicalWriteCount ?? 0,
    file: playerUsageResearchRun?.file || null
  });

  if (((playerUsageSeeds?.canonicalWriteCount ?? 0) + (playerUsageManualImport?.importedCount ?? 0) + (playerUsageResearchRun?.canonicalWriteCount ?? 0)) > 0) {
    console.log("[daily-cycle] player-usage-details-refresh:start", { dayKey });

    playerUsageDetailsRefresh = await buildDetailsDay(dayKey, {
      rebuild: true
    });

    console.log("[daily-cycle] player-usage-details-refresh:done", {
      ok: playerUsageDetailsRefresh?.ok,
      dayKey: playerUsageDetailsRefresh?.dayKey,
      built: playerUsageDetailsRefresh?.built ?? 0,
      skipped: playerUsageDetailsRefresh?.skipped ?? 0
    });
  }

  console.log("[daily-cycle] team-news-workset:start", { dayKey });

  teamNewsWorkset = await buildTeamNewsWorksetDay(dayKey);

  console.log("[daily-cycle] team-news-workset:done", {
    ok: teamNewsWorkset?.ok,
    dayKey: teamNewsWorkset?.dayKey,
    taskCount: teamNewsWorkset?.taskCount ?? 0,
    existingCanonicalCount: teamNewsWorkset?.existingCanonicalCount ?? 0,
    missingCanonicalCount: teamNewsWorkset?.missingCanonicalCount ?? 0,
    file: teamNewsWorkset?.file || null
  });

  console.log("[daily-cycle] team-news-seeds-validation:start", { dayKey });

  teamNewsSeedValidation = validateTeamNewsSeedsDay(dayKey);

  console.log("[daily-cycle] team-news-seeds-validation:done", {
    ok: teamNewsSeedValidation?.ok,
    dayKey: teamNewsSeedValidation?.dayKey,
    recordCount: teamNewsSeedValidation?.recordCount ?? 0,
    acceptedCount: teamNewsSeedValidation?.acceptedCount ?? 0,
    rejectedCount: teamNewsSeedValidation?.rejectedCount ?? 0
  });

  console.log("[daily-cycle] team-news-seeds-apply:start", { dayKey });

  teamNewsSeeds = applyTeamNewsSeedsDay(dayKey);

  console.log("[daily-cycle] team-news-seeds-apply:done", {
    ok: teamNewsSeeds?.ok,
    dayKey: teamNewsSeeds?.dayKey,
    seedCount: teamNewsSeeds?.seedCount ?? 0,
    acceptedCount: teamNewsSeeds?.acceptedCount ?? 0,
    rejectedCount: teamNewsSeeds?.rejectedCount ?? 0,
    canonicalWriteCount: teamNewsSeeds?.canonicalWriteCount ?? 0
  });

  if ((teamNewsSeeds?.canonicalWriteCount ?? 0) > 0) {
    console.log("[daily-cycle] team-news-workset-refresh-after-seeds:start", { dayKey });

    teamNewsWorkset = await buildTeamNewsWorksetDay(dayKey);

    console.log("[daily-cycle] team-news-workset-refresh-after-seeds:done", {
      ok: teamNewsWorkset?.ok,
      teamsCount: teamNewsWorkset?.teamsCount ?? 0,
      existingCount: teamNewsWorkset?.existingCount ?? 0,
      missingCount: teamNewsWorkset?.missingCount ?? 0,
      needsAcquisitionCount: teamNewsWorkset?.needsAcquisitionCount ?? 0
    });
  }

  console.log("[daily-cycle] team-news-research-tasks:start", { dayKey });

  teamNewsResearchTasks = await buildTeamNewsResearchTasksDay(dayKey, {
    maxTeams: normalizedTeamNewsMaxTeams
  });

  console.log("[daily-cycle] team-news-research-tasks:done", {
    ok: teamNewsResearchTasks?.ok,
    dayKey: teamNewsResearchTasks?.dayKey,
    taskCount: teamNewsResearchTasks?.taskCount ?? 0,
    file: teamNewsResearchTasks?.file || null
  });

  console.log("[daily-cycle] team-news-research-run:start", { dayKey });

  teamNewsResearchRun = await runTeamNewsResearchTasksDay(dayKey, {
    maxTasks: normalizedTeamNewsResearchMaxTasks
  });

  console.log("[daily-cycle] team-news-research-run:done", {
    ok: teamNewsResearchRun?.ok,
    dayKey: teamNewsResearchRun?.dayKey,
    taskCount: teamNewsResearchRun?.taskCount ?? 0,
    acceptedCandidateCount: teamNewsResearchRun?.acceptedCandidateCount ?? 0,
    unresolvedCandidateCount: teamNewsResearchRun?.unresolvedCandidateCount ?? 0,
    canonicalWriteCount: teamNewsResearchRun?.canonicalWriteCount ?? 0,
    promoteCanonical: teamNewsResearchRun?.promoteCanonical === true,
    candidateOnly: teamNewsResearchRun?.candidateOnly === true,
    file: teamNewsResearchRun?.file || null
  });

  console.log("[daily-cycle] team-news-source-coverage:start", { dayKey });

  teamNewsSourceCoverage = await buildTeamNewsSourceCoverageReportDay(dayKey);
  teamNewsSourceCoverage = normalizeTeamNewsSourceCoverageReportDay(dayKey);

  console.log("[daily-cycle] team-news-source-coverage:done", {
    ok: teamNewsSourceCoverage?.ok,
    dayKey: teamNewsSourceCoverage?.dayKey,
    changedRows: teamNewsSourceCoverage?.changedRows ?? 0,
    missingOfficialSourceCoverageCount: teamNewsSourceCoverage?.missingOfficialSourceCoverageCount ?? 0,
    file: teamNewsSourceCoverage?.file || null,
    backlogFile: teamNewsSourceCoverage?.backlog?.file || null,
    backlogTotalRows: teamNewsSourceCoverage?.backlog?.totalRows ?? 0
  });

  console.log("[daily-cycle] team-news-source-enrichment-tasks:start", { dayKey });

  teamNewsSourceEnrichmentTasks = buildTeamNewsSourceEnrichmentTasksDay(dayKey);

  console.log("[daily-cycle] team-news-source-enrichment-tasks:done", {
    ok: teamNewsSourceEnrichmentTasks?.ok,
    dayKey: teamNewsSourceEnrichmentTasks?.dayKey,
    totalTasks: teamNewsSourceEnrichmentTasks?.totalTasks ?? 0,
    file: teamNewsSourceEnrichmentTasks?.file || null
  });

  console.log("[daily-cycle] team-news-research-review:start", { dayKey });

  teamNewsResearchReview = await buildTeamNewsResearchReviewDay(dayKey);

  console.log("[daily-cycle] team-news-research-review:done", {
    ok: teamNewsResearchReview?.ok,
    dayKey: teamNewsResearchReview?.dayKey,
    reviewRowCount: teamNewsResearchReview?.reviewRowCount ?? 0,
    needsReviewCount: teamNewsResearchReview?.needsReviewCount ?? 0,
    approvedReadyForPromotionCount: teamNewsResearchReview?.approvedReadyForPromotionCount ?? 0,
    invalidCandidateCount: teamNewsResearchReview?.invalidCandidateCount ?? 0,
    unresolvedCandidateCount: teamNewsResearchReview?.unresolvedCandidateCount ?? 0,
    promotableCount: teamNewsResearchReview?.promotableCount ?? 0,
    reviewRequiredCount: teamNewsResearchReview?.reviewRequiredCount ?? 0,
    file: teamNewsResearchReview?.file || null
  });

  console.log("[daily-cycle] team-news-build:start", { dayKey });

  teamNewsBuild = await buildTeamNewsDay(dayKey);

  console.log("[daily-cycle] team-news-build:done", {
    ok: teamNewsBuild?.ok,
    dayKey: teamNewsBuild?.dayKey,
    totalTeams: teamNewsBuild?.totalTeams ?? 0,
    existingCount: teamNewsBuild?.existingCount ?? 0,
    missingCount: teamNewsBuild?.missingCount ?? 0,
    coveragePct: teamNewsBuild?.coveragePct ?? 0
  });

  } catch (enrichErr) {
    console.warn("[daily-cycle] enrichment-block:skipped", enrichErr?.message || enrichErr);
  }
  // ── End enrichment block ─────────────────────────────────────────────────────

  console.log("[daily-cycle] fixture-acquisition-v2-readiness:start", { dayKey });

  const fixtureAcquisitionReadinessPath = resolveDataPath(
    `football-truth/_diagnostics/fixture-acquisition-v2-readiness/${dayKey}.fixture-acquisition-v2-readiness.json`
  );

  const fixtureAcquisitionReadinessRun = runDailyCycleNodeJob(
    [
      "engine-v1/jobs/build-fixture-acquisition-v2-readiness.js",
      "--date",
      dayKey,
      "--output",
      fixtureAcquisitionReadinessPath
    ],
    "fixture-acquisition-v2-readiness"
  );

  fixtureAcquisitionReadiness = readJsonIfExists(fixtureAcquisitionReadinessPath) || {
    ok: false,
    stage: "fixture_acquisition_v2_readiness_missing_output",
    dayKey,
    summary: {},
    error: fixtureAcquisitionReadinessRun?.error || null
  };

  const fixtureAcquisitionReadinessSummary = compactFixtureAcquisitionReadiness(
    fixtureAcquisitionReadiness
  );

  console.log("[daily-cycle] fixture-acquisition-v2-readiness:done", {
    ok: fixtureAcquisitionReadinessSummary.ok,
    dayKey: fixtureAcquisitionReadinessSummary.dayKey,
    canonicalFixtureRows: fixtureAcquisitionReadinessSummary.canonicalFixtureRows,
    readyRows: fixtureAcquisitionReadinessSummary.readyRows,
    unsafeRows: fixtureAcquisitionReadinessSummary.unsafeRows,
    blockedRows: fixtureAcquisitionReadinessSummary.blockedRows,
    espnOnlyCanonicalFixtures: fixtureAcquisitionReadinessSummary.espnOnlyCanonicalFixtures,
    missingNonEspnProviderCapability: fixtureAcquisitionReadinessSummary.missingNonEspnProviderCapability
  });

  // VALUE IS PURE-STATS AND ODDS-FREE (hard firewall). buildValueDay derives
  // picks ONLY from history/priors/standings/form via evaluateMatchValue — it
  // never reads odds. The fixture-acquisition-v2 readiness report above is kept
  // for DIAGNOSTICS only; it must NOT gate value. Its "verified fixture provider"
  // predicate is unachievable (no league ever has a configured verified provider,
  // so readyRows is permanently 0) and was silently zeroing the pure-stats value
  // panel every day. A fixture with no statistical backing already yields no pick
  // from the engine, which is the correct, stats-based guard.
  console.log("[daily-cycle] value-build:start", {
    dayKey,
    readinessOk: fixtureAcquisitionReadinessSummary.ok
  });

  valueBuild = await buildValueDay(dayKey, { rebuild: true });

  console.log("[daily-cycle] value-build:done", {
    ok: valueBuild?.ok,
    date: valueBuild?.date,
    count: valueBuild?.count ?? 0
  });

  console.log("[daily-cycle] value-coverage-report:start", { dayKey });

  valueCoverageReport = await buildValueCoverageReportDay(dayKey);

  console.log("[daily-cycle] value-coverage-report:done", {
    ok: valueCoverageReport?.ok,
    dayKey: valueCoverageReport?.dayKey,
    file: valueCoverageReport?.file || null,
    valueReturned: valueCoverageReport?.counts?.valueReturned ?? 0,
    valueNull: valueCoverageReport?.counts?.valueNull ?? 0,
    minimumRecentSampleNull: valueCoverageReport?.counts?.minimumRecentSampleNull ?? 0,
    nullByClass: valueCoverageReport?.breakdown?.nullByClass || {}
  });

  console.log("[daily-cycle] value-settlement-summary:start", { dayKey });

  const valueSettlementReportPath = `data/football-truth/_diagnostics/value-settlement-daily-cycle/${dayKey}.value-settlement-report.json`;
  const valueSettlementSummaryPath = `data/football-truth/_settlement-summaries/${dayKey}.value-settlement-summary.json`;
  const valueSettlementStatisticsPath = `data/football-truth/_settlement-statistics/value-settlement-statistics-${dayKey}_to_${dayKey}.json`;

  try {
    runDailyCycleNodeJob([
      "./engine-v1/jobs/build-value-settlement-from-final-results-day.js",
      "--date",
      dayKey,
      "--output",
      valueSettlementReportPath
    ], "value-settlement-report");

    valueSettlementReport = readJsonIfExists(valueSettlementReportPath);

    runDailyCycleNodeJob([
      "./engine-v1/jobs/export-value-settlement-summary-file.js",
      "--input",
      valueSettlementReportPath,
      "--output",
      valueSettlementSummaryPath
    ], "value-settlement-summary-export");

    valueSettlementSummary = readJsonIfExists(valueSettlementSummaryPath);

    runDailyCycleNodeJob([
      "./engine-v1/jobs/build-value-settlement-statistics-range.js",
      "--start",
      dayKey,
      "--end",
      dayKey,
      "--output",
      valueSettlementStatisticsPath
    ], "value-settlement-statistics");

    valueSettlementStatistics = readJsonIfExists(valueSettlementStatisticsPath);

    console.log("[daily-cycle] value-settlement-summary:done", {
      ok: valueSettlementSummary?.ok === true && valueSettlementStatistics?.ok === true,
      dayKey,
      settlementReport: valueSettlementReportPath,
      settlementSummary: valueSettlementSummaryPath,
      settlementStatistics: valueSettlementStatisticsPath,
      settledRows: valueSettlementSummary?.summary?.settledRows ?? 0,
      winRows: valueSettlementSummary?.summary?.winRows ?? 0,
      lossRows: valueSettlementSummary?.summary?.lossRows ?? 0,
      statisticsWinRate: valueSettlementStatistics?.summary?.winRate ?? null,
      valueWrites: false,
      fixtureWrites: false,
      historyWrites: false,
      detailsWrites: false
    });
  } catch (error) {
    valueSettlementReport = {
      ok: false,
      dayKey,
      error: error?.message || String(error),
      valueWrites: false,
      fixtureWrites: false,
      historyWrites: false,
      detailsWrites: false
    };

    console.warn("[daily-cycle] value-settlement-summary:warn", {
      ok: false,
      dayKey,
      error: valueSettlementReport.error,
      valueWrites: false,
      fixtureWrites: false,
      historyWrites: false,
      detailsWrites: false
    });
  }
  console.log("[daily-cycle] final-details-sync:start", { dayKey });

  finalDetailsSync = await buildDetailsDay(dayKey, {
    rebuild: true
  });

  console.log("[daily-cycle] final-details-sync:done", {
    ok: finalDetailsSync?.ok,
    dayKey: finalDetailsSync?.dayKey,
    built: finalDetailsSync?.built ?? 0,
    skipped: finalDetailsSync?.skipped ?? 0
  });

  console.log("[daily-cycle] deploy-snapshot-export:start", { dayKey });

  // ODDS↔VALUE FIREWALL: value is already built (pure-stats buildValueDay above)
  // and written to data/value/<day>.json, which the deploy snapshot export copies
  // to snapshot value.json. The old deriveValueFromOdds bridge was REMOVED here —
  // odds must not participate in any value computation, not even as a transport
  // artifact. Odds live only in the middle + two right panels (opening→current
  // drift), never in value.

  deploySnapshot = await Promise.resolve(exportDeploySnapshotDay(dayKey));

  console.log("[daily-cycle] deploy-snapshot-export:done", {
    ok: deploySnapshot?.ok,
    date: deploySnapshot?.date,
    hash: deploySnapshot?.hash,
    counts: deploySnapshot?.counts,
    coverage: deploySnapshot?.coverage
  });

  // Invariant check — runs after deploy snapshot so all artifacts exist
  try {
    const invariant = await runSnapshotInvariantCheck(dayKey);
    console.log("[daily-cycle] invariant-check:done", {
      blocked: invariant.blocked?.length ?? 0,
      autoFixed: invariant.autoFixed?.length ?? 0,
      warnings: invariant.warnings?.length ?? 0,
      valueSafe: invariant.valueSafe
    });
  } catch (e) {
    console.error("[daily-cycle] invariant-check:error", e?.message);
  }

  // League gap report — per-slug declared→expected→canonical→snapshot→value
  // readiness so coverage losses (season-calendar cuts, provider zero-events)
  // are visible instead of silently shrinking the day's fixture count.
  try {
    const gapReport = buildLeagueGapReportDay(dayKey);
    console.log("[daily-cycle] league-gap-report:done", {
      byStatus: gapReport?.summary?.byStatus,
      lostExpectedMatches: gapReport?.summary?.lostExpectedMatches,
      broken: (gapReport?.broken || []).map(b => b.slug)
    });
  } catch (e) {
    console.error("[daily-cycle] league-gap-report:error", e?.message);
  }

  // Per-bookmaker odds (EU/Asian/Betfair panels + partial Greek via OddsPapi).
  // Runs after deploy snapshot so our match list is available for team matching.
  try {
    const multiOdds = await fetchMultiBookmakerOdds(dayKey);
    console.log("[daily-cycle] multi-bookmaker-odds", { fetched: multiOdds.fetched, total: multiOdds.total });
  } catch (e) { console.log("[daily-cycle] multi-bookmaker-odds:skip", String(e?.message || e)); }

  // Prefetch odds for the next 6 days so "opening" is captured days before the match.
  // Uses canonical-fixtures (available for future dates). First capture per match = open{}.
  try {
    const prefetch = await prefetchUpcomingOdds(dayKey, 6);
    console.log("[daily-cycle] prefetch-upcoming-odds", { fetched: prefetch.fetched });
  } catch (e) { console.log("[daily-cycle] prefetch-upcoming-odds:skip", String(e?.message || e)); }

  // Greek panel supplement via OddsPortal (stoiximan/vistabet).
  // Geo-blocked from GR IPs — silently skips when not on Render.
  try {
    const opOdds = await fetchOddsPortalGreekOdds(dayKey);
    console.log("[daily-cycle] oddsportal-greek-odds", { fetched: opOdds.fetched });
  } catch (e) { console.log("[daily-cycle] oddsportal-greek-odds:skip", String(e?.message || e)); }

  if (doFinalize) {
    console.log("[daily-cycle] finalize-live-status-refresh:start", { finalizeDayKey });

    const finalizeLiveStatusRefresh = await runLiveStatusRefreshDay(finalizeDayKey, {
      includeAllOpenStates: true,
      reason: "previous_day_finalization"
    });

    console.log("[daily-cycle] finalize-live-status-refresh:done", {
      ok: finalizeLiveStatusRefresh?.ok,
      dayKey: finalizeLiveStatusRefresh?.dayKey,
      targetLeagueCount: finalizeLiveStatusRefresh?.targetLeagueCount ?? 0,
      fetchedLeagueCount: finalizeLiveStatusRefresh?.fetchedLeagueCount ?? 0,
      failedLeagueCount: finalizeLiveStatusRefresh?.failedLeagueCount ?? 0,
      matchedRows: finalizeLiveStatusRefresh?.matchedRows ?? 0,
      changedRows: finalizeLiveStatusRefresh?.changedRows ?? 0,
      writtenLeagueCount: finalizeLiveStatusRefresh?.writtenLeagueCount ?? 0
    });

    console.log("[daily-cycle] finalize-canonical-sync:start", { finalizeDayKey });

    const finalizeCanonicalSync = syncCanonicalFixturesToJsonDbDay(finalizeDayKey);

    console.log("[daily-cycle] finalize-canonical-sync:done", {
      ok: finalizeCanonicalSync?.ok,
      dayKey: finalizeCanonicalSync?.dayKey,
      canonicalRows: finalizeCanonicalSync?.canonicalRows ?? finalizeCanonicalSync?.rows ?? null,
      written: finalizeCanonicalSync?.written ?? null,
      output: finalizeCanonicalSync?.output || null
    });

    console.log("[daily-cycle] finalization-readiness:start", { finalizeDayKey });

    finalizeReadiness = auditFinalizationReadinessDay(finalizeDayKey);

    console.log("[daily-cycle] finalization-readiness:done", {
      ok: finalizeReadiness?.ok,
      dayKey: finalizeReadiness?.dayKey,
      fixtures: finalizeReadiness?.fixtures ?? 0,
      terminal: finalizeReadiness?.terminal ?? 0,
      terminalMissingScore: finalizeReadiness?.terminalMissingScore ?? 0,
      open: finalizeReadiness?.open ?? 0,
      duplicateIdCount: finalizeReadiness?.duplicateIdCount ?? 0,
      safeToFinalizeStats: Boolean(finalizeReadiness?.safeToFinalizeStats),
      openByStatus: finalizeReadiness?.openByStatus || {},
      openByLeague: finalizeReadiness?.openByLeague || {}
    });

    console.log("[daily-cycle] finalize-value-build:start", { finalizeDayKey });
    finalizeValueBuild = await buildValueDay(finalizeDayKey, { rebuild: false });
    console.log("[daily-cycle] finalize-value-build:done", {
      ok: finalizeValueBuild?.ok,
      date: finalizeValueBuild?.date,
      count: finalizeValueBuild?.count ?? 0
    });

    console.log("[daily-cycle] finalize:start", { finalizeDayKey });
    finalize = await finalizeDayIfSafe(finalizeDayKey);
    console.log("[daily-cycle] finalize:done", finalize);

    if (finalize?.ok) {
      console.log("[daily-cycle] finalized-deploy-snapshot-export:start", { finalizeDayKey });

      finalizedDeploySnapshot = await Promise.resolve(exportDeploySnapshotDay(finalizeDayKey, {
        updateLatest: false
      }));

      console.log("[daily-cycle] finalized-deploy-snapshot-export:done", {
        ok: finalizedDeploySnapshot?.ok,
        date: finalizedDeploySnapshot?.date,
        hash: finalizedDeploySnapshot?.hash,
        counts: finalizedDeploySnapshot?.counts,
        coverage: finalizedDeploySnapshot?.coverage,
        latestUpdated: finalizedDeploySnapshot?.latestUpdated
      });

      if (finalizeReadiness?.safeToFinalizeStats) {
        console.log("[daily-cycle] history-append:start", { finalizeDayKey });
        historyAppend = await appendFinalizedDayToHistory(finalizeDayKey);
        console.log("[daily-cycle] history-append:done", historyAppend);

        console.log("[daily-cycle] indexes-rebuild:start", { finalizeDayKey });
        indexesRebuild = await rebuildIndexesForSeason(finalizeDayKey);
        console.log("[daily-cycle] indexes-rebuild:done", {
          ok: indexesRebuild?.ok,
          season: indexesRebuild?.season
        });
      } else {
        historyAppend = {
          ok: false,
          skipped: true,
          reason: "unsafe_finalization_readiness",
          dayKey: finalizeDayKey,
          readiness: finalizeReadiness
            ? {
                fixtures: finalizeReadiness.fixtures,
                terminal: finalizeReadiness.terminal,
                terminalMissingScore: finalizeReadiness.terminalMissingScore,
                open: finalizeReadiness.open,
                duplicateIdCount: finalizeReadiness.duplicateIdCount,
                safeToFinalizeStats: finalizeReadiness.safeToFinalizeStats,
                openByStatus: finalizeReadiness.openByStatus,
                openByLeague: finalizeReadiness.openByLeague
              }
            : null
        };

        indexesRebuild = {
          ok: false,
          skipped: true,
          reason: "history_append_skipped",
          dayKey: finalizeDayKey
        };

        console.warn("[daily-cycle] history-append:skipped", historyAppend);
        console.warn("[daily-cycle] indexes-rebuild:skipped", indexesRebuild);
      }
    }
  }

  const finishedAt = Date.now();

  console.log("[daily-cycle] done", {
    ms: finishedAt - startedAt
  });

  return {
    ok: true,
    dayKey,
    finalizeDayKey,
    detailsRebuild,
    startedAt,
    finishedAt,
    ms: finishedAt - startedAt,
    canonicalFixturesSync,
    fixtureAcquisitionReadiness,
    discoveryWindow,
    activeLeagues,
    monitor,
    standingsBuild,
    teamGeoSeeds,
    teamGeoBuild,
    detailsBuild,
    playerUsageWorkset,
    playerUsageDeterministicCandidates,
    playerUsageAiCandidateReview,
    playerUsageAiCandidatePromotion,
    playerUsageManualValidation,
    playerUsageSeeds,
    playerUsageManualDrafts,
    playerUsageResearchTasks,
    playerUsageManualImport,
    playerUsageResearchRun,
    playerUsageDetailsRefresh,
    teamNewsWorkset,
    teamNewsSeedValidation,
    teamNewsSeeds,
    teamNewsResearchTasks,
    teamNewsResearchRun,
    teamNewsResearchReview,
    teamNewsBuild,
    valueBuild,
    valueCoverageReport,
    valueSettlementReport,
    valueSettlementSummary,
    valueSettlementStatistics,
    finalizeReadiness,
    finalDetailsSync,
    deploySnapshot,
    finalizedDeploySnapshot,
    finalizeValueBuild,
    finalize,
    historyAppend,
    indexesRebuild
  };
}

export function parseDailyCycleCliArgs(argv = []) {
  const args = Array.isArray(argv) ? argv : [];
  const out = {
    dayKey: athensDayKey()
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = String(args[i] || "").trim();

    if (!arg) continue;

    if ((arg === "--date" || arg === "--day" || arg === "--dayKey") && args[i + 1]) {
      out.dayKey = String(args[++i] || "").trim();
      continue;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
      out.dayKey = arg;
      continue;
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(out.dayKey || ""))) {
    throw new Error(`invalid daily-cycle dayKey: ${out.dayKey}`);
  }

  return out;
}
const { pathToFileURL } = await import("node:url");

const entryUrl = globalThis.process?.argv?.[1]
  ? pathToFileURL(globalThis.process.argv[1]).href
  : null;

if (entryUrl === import.meta.url) {
  const cliOptions = parseDailyCycleCliArgs(globalThis.process?.argv?.slice(2) || []);

  try {
    const result = await runDailyCycle({
      dayKey: cliOptions.dayKey
    });

    console.log("[daily-cycle] cli:done", {
      ok: result?.ok,
      dayKey: result?.dayKey,
      ms: result?.ms,
      teamGeoAppliedCount: result?.teamGeoSeeds?.appliedCount ?? 0,
      teamGeoMissingCount: result?.teamGeoSeeds?.after?.missingCount ?? 0,
      teamGeoExistingCount: result?.teamGeoBuild?.existingCount ?? 0,
      teamGeoCoveragePct: result?.teamGeoBuild?.coveragePct ?? 0,
      playerUsageDeterministicCandidateWrittenCount: result?.playerUsageDeterministicCandidates?.candidateWrittenCount ?? 0,
      playerUsageDeterministicCandidateReadyCount: result?.playerUsageDeterministicCandidates?.candidateReadyCount ?? 0,
      playerUsageAiCandidateReviewCount: result?.playerUsageAiCandidateReview?.candidateCount ?? 0,
      playerUsageAiCandidateNeedsReviewCount: result?.playerUsageAiCandidateReview?.needsReviewCount ?? 0,
      playerUsageAiCandidateReadyForPromotionCount: result?.playerUsageAiCandidateReview?.approvedReadyForPromotionCount ?? 0,
      playerUsageAiCandidatePromotedCount: result?.playerUsageAiCandidatePromotion?.promotedCount ?? 0,
      playerUsageAiCandidateReviewRequiredCount: result?.playerUsageAiCandidatePromotion?.reviewRequiredCount ?? 0,
      playerUsageManualAcceptedCount: result?.playerUsageManualValidation?.acceptedCount ?? 0,
      playerUsageManualRejectedCount: result?.playerUsageManualValidation?.rejectedCount ?? 0,
      playerUsageSeedWriteCount: result?.playerUsageSeeds?.canonicalWriteCount ?? 0,
      playerUsageManualDraftCount: result?.playerUsageManualDrafts?.draftCount ?? 0,
      playerUsageManualImportCount: result?.playerUsageManualImport?.importedCount ?? 0,
      playerUsageTaskCount: result?.playerUsageResearchTasks?.taskCount ?? 0,
      playerUsageCanonicalWriteCount: result?.playerUsageResearchRun?.canonicalWriteCount ?? 0,
      playerUsageUnresolvedCount: result?.playerUsageResearchRun?.unresolvedPlayerUsageCount ?? 0,
      teamNewsSeedAcceptedCount: result?.teamNewsSeedValidation?.acceptedCount ?? 0,
      teamNewsSeedRejectedCount: result?.teamNewsSeedValidation?.rejectedCount ?? 0,
      teamNewsSeedWriteCount: result?.teamNewsSeeds?.canonicalWriteCount ?? 0,
      teamNewsResearchTaskCount: result?.teamNewsResearchRun?.taskCount ?? 0,
      teamNewsAcceptedCandidateCount: result?.teamNewsResearchRun?.acceptedCandidateCount ?? 0,
      teamNewsCanonicalWriteCount: result?.teamNewsResearchRun?.canonicalWriteCount ?? 0,
      teamNewsResearchCandidateOnly: result?.teamNewsResearchRun?.candidateOnly === true,
      teamNewsReviewRowCount: result?.teamNewsResearchReview?.reviewRowCount ?? 0,
      teamNewsNeedsReviewCount: result?.teamNewsResearchReview?.needsReviewCount ?? 0,
      teamNewsReadyForPromotionCount: result?.teamNewsResearchReview?.approvedReadyForPromotionCount ?? 0,
      teamNewsPromotableCount: result?.teamNewsResearchReview?.promotableCount ?? 0,
      valueCount: result?.valueBuild?.count ?? 0,
      valueCoverageReturnedCount: result?.valueCoverageReport?.counts?.valueReturned ?? 0,
      valueCoverageNullCount: result?.valueCoverageReport?.counts?.valueNull ?? 0,
      valueCoverageMinimumSampleNullCount: result?.valueCoverageReport?.counts?.minimumRecentSampleNull ?? 0,
      valueSettlementSummaryOk: result?.valueSettlementSummary?.ok === true,
      valueSettlementSettledRows: result?.valueSettlementSummary?.summary?.settledRows ?? 0,
      valueSettlementWinRows: result?.valueSettlementSummary?.summary?.winRows ?? 0,
      valueSettlementLossRows: result?.valueSettlementSummary?.summary?.lossRows ?? 0,
      valueSettlementStatisticsWinRate: result?.valueSettlementStatistics?.summary?.winRate ?? null,
      valueSettlementValueWrites: false,
      snapshotHash: result?.deploySnapshot?.hash || null,
      snapshotDetailsCount: result?.deploySnapshot?.counts?.details ?? 0
    });
  } catch (error) {
    console.error("[daily-cycle] cli:fatal", error);
    globalThis.process.exitCode = 1;
  }
}