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
import { applyPlayerUsageSeedsDay } from "./apply-player-usage-seeds-day.js";
import { buildPlayerUsageResearchTasksDay } from "./build-player-usage-research-tasks-day.js";
import { buildPlayerUsageAiRequestsDay } from "./build-player-usage-ai-requests-day.js";
import { runPlayerUsageAiExecutorDay } from "./run-player-usage-ai-executor-day.js";
import { runPlayerUsageResearchTasksDay } from "./run-player-usage-research-tasks-day.js";
import { importPlayerUsageManualResultsDay } from "./import-player-usage-manual-results-day.js";
import { applyTeamGeoSeedsDay } from "./apply-team-geo-seeds-day.js";
import { buildTeamNewsWorksetDay } from "./build-team-news-workset-day.js";
import { buildTeamNewsResearchTasksDay } from "./build-team-news-research-tasks-day.js";
import { runTeamNewsResearchTasksDay } from "./run-team-news-research-tasks-day.js";
import { buildValueDay } from "../core/build-value-day.js";
import { exportDeploySnapshotDay } from "./export-deploy-snapshot-day.js";

function normalizePositiveIntegerOption(value, fallback) {
  if (value === Infinity) return Infinity;

  const n = Number(value);

  if (!Number.isFinite(n) || n <= 0) {
    return fallback;
  }

  return Math.floor(n);
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
    playerUsageAiExecutorMode = process.env.PLAYER_USAGE_AI_EXECUTOR_MODE || "disabled"
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
    playerUsageAiExecutorMode
  });

  console.log("[daily-cycle] discoverWindow:start");
  const discoveryWindow = await discoverWindow({
    baseDay: dayKey,
    daysBack: 1,
    daysForward
  });
  console.log("[daily-cycle] discoverWindow:done");

  console.log("[daily-cycle] discover-active-leagues:start", { dayKey });
  const activeLeagues = await discoverActiveLeagues(dayKey);
  console.log("[daily-cycle] discover-active-leagues:done", {
    ok: activeLeagues?.ok,
    dayKey: activeLeagues?.dayKey,
    activeLeagueCount: activeLeagues?.activeLeagueCount ?? 0,
    totalMatches: activeLeagues?.totalMatches ?? 0
  });

  console.log("[daily-cycle] monitor:start", { dayKey });
  const monitor = await monitorActiveLeagues(dayKey);
  console.log("[daily-cycle] monitor:done", monitor);

  let teamGeoSeeds = null;
  let playerUsageWorkset = null;
  let playerUsageSeeds = null;
  let playerUsageResearchTasks = null;
  let playerUsageAiRequests = null;
  let playerUsageAiExecutor = null;
  let playerUsageManualImport = null;
  let playerUsageResearchRun = null;
  let playerUsageDetailsRefresh = null;
  let teamNewsWorkset = null;
  let teamNewsResearchTasks = null;
  let teamNewsResearchRun = null;
  let teamNewsBuild = null;
  let finalDetailsSync = null;
  let deploySnapshot = null;
  let finalizeValueBuild = null;
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

  console.log("[daily-cycle] player-usage-research-tasks:start", { dayKey });

  playerUsageResearchTasks = await buildPlayerUsageResearchTasksDay(dayKey);

  console.log("[daily-cycle] player-usage-research-tasks:done", {
    ok: playerUsageResearchTasks?.ok,
    dayKey: playerUsageResearchTasks?.dayKey,
    taskCount: playerUsageResearchTasks?.taskCount ?? 0,
    file: playerUsageResearchTasks?.file || null
  });

  console.log("[daily-cycle] player-usage-ai-requests:start", { dayKey });

  playerUsageAiRequests = await buildPlayerUsageAiRequestsDay(dayKey);

  console.log("[daily-cycle] player-usage-ai-requests:done", {
    ok: playerUsageAiRequests?.ok,
    dayKey: playerUsageAiRequests?.dayKey,
    requestCount: playerUsageAiRequests?.requestCount ?? 0,
    indexFile: playerUsageAiRequests?.indexFile || null
  });

  console.log("[daily-cycle] player-usage-ai-executor:start", {
    dayKey,
    mode: playerUsageAiExecutorMode
  });

  playerUsageAiExecutor = await runPlayerUsageAiExecutorDay(dayKey, {
    mode: playerUsageAiExecutorMode
  });

  console.log("[daily-cycle] player-usage-ai-executor:done", {
    ok: playerUsageAiExecutor?.ok,
    dayKey: playerUsageAiExecutor?.dayKey,
    mode: playerUsageAiExecutor?.mode,
    requestCount: playerUsageAiExecutor?.requestCount ?? 0,
    selectedCount: playerUsageAiExecutor?.selectedCount ?? 0,
    bundleCount: playerUsageAiExecutor?.bundleCount ?? 0,
    canonicalWriteCount: playerUsageAiExecutor?.canonicalWriteCount ?? 0,
    researchResultWriteCount: playerUsageAiExecutor?.researchResultWriteCount ?? 0,
    file: playerUsageAiExecutor?.file || null,
    reason: playerUsageAiExecutor?.reason || null
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
    file: teamNewsResearchRun?.file || null
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

  console.log("[daily-cycle] value-build:start", { dayKey });

  const valueBuild = await buildValueDay(dayKey, { rebuild: true });

  console.log("[daily-cycle] value-build:done", {
    ok: valueBuild?.ok,
    date: valueBuild?.date,
    count: valueBuild?.count ?? 0
  });
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

  deploySnapshot = await Promise.resolve(exportDeploySnapshotDay(dayKey));

  console.log("[daily-cycle] deploy-snapshot-export:done", {
    ok: deploySnapshot?.ok,
    date: deploySnapshot?.date,
    hash: deploySnapshot?.hash,
    counts: deploySnapshot?.counts,
    coverage: deploySnapshot?.coverage
  });


  if (doFinalize) {
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
      console.log("[daily-cycle] history-append:start", { finalizeDayKey });
      historyAppend = await appendFinalizedDayToHistory(finalizeDayKey);
      console.log("[daily-cycle] history-append:done", historyAppend);

      console.log("[daily-cycle] indexes-rebuild:start", { finalizeDayKey });
      indexesRebuild = await rebuildIndexesForSeason(finalizeDayKey);
      console.log("[daily-cycle] indexes-rebuild:done", {
        ok: indexesRebuild?.ok,
        season: indexesRebuild?.season
      });
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
    discoveryWindow,
    activeLeagues,
    monitor,
    standingsBuild,
    teamGeoSeeds,
    detailsBuild,
    playerUsageWorkset,
    playerUsageSeeds,
    playerUsageResearchTasks,
    playerUsageAiRequests,
    playerUsageAiExecutor,
    playerUsageManualImport,
    playerUsageResearchRun,
    playerUsageDetailsRefresh,
    teamNewsWorkset,
    teamNewsResearchTasks,
    teamNewsResearchRun,
    teamNewsBuild,
    valueBuild,
    finalDetailsSync,
    deploySnapshot,
    finalizeValueBuild,
    finalize,
    historyAppend,
    indexesRebuild
  };
}

const { pathToFileURL } = await import("node:url");

const entryUrl = globalThis.process?.argv?.[1]
  ? pathToFileURL(globalThis.process.argv[1]).href
  : null;

if (entryUrl === import.meta.url) {
  const cliDayKey = globalThis.process?.argv?.[2] || athensDayKey();

  try {
    const result = await runDailyCycle({
      dayKey: cliDayKey
    });

    console.log("[daily-cycle] cli:done", {
      ok: result?.ok,
      dayKey: result?.dayKey,
      ms: result?.ms,
      teamGeoAppliedCount: result?.teamGeoSeeds?.appliedCount ?? 0,
      teamGeoMissingCount: result?.teamGeoSeeds?.after?.missingCount ?? 0,
      playerUsageSeedWriteCount: result?.playerUsageSeeds?.canonicalWriteCount ?? 0,
      playerUsageExecutorBundleCount: result?.playerUsageAiExecutor?.bundleCount ?? 0,
      playerUsageManualImportCount: result?.playerUsageManualImport?.importedCount ?? 0,
      playerUsageTaskCount: result?.playerUsageResearchTasks?.taskCount ?? 0,
      playerUsageCanonicalWriteCount: result?.playerUsageResearchRun?.canonicalWriteCount ?? 0,
      playerUsageUnresolvedCount: result?.playerUsageResearchRun?.unresolvedPlayerUsageCount ?? 0,
      teamNewsResearchTaskCount: result?.teamNewsResearchRun?.taskCount ?? 0,
      teamNewsAcceptedCandidateCount: result?.teamNewsResearchRun?.acceptedCandidateCount ?? 0,
      teamNewsCanonicalWriteCount: result?.teamNewsResearchRun?.canonicalWriteCount ?? 0,
      valueCount: result?.valueBuild?.count ?? 0,
      snapshotHash: result?.deploySnapshot?.hash || null,
      snapshotDetailsCount: result?.deploySnapshot?.counts?.details ?? 0
    });
  } catch (error) {
    console.error("[daily-cycle] cli:fatal", error);
    globalThis.process.exitCode = 1;
  }
}