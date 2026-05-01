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
import { applyTeamGeoSeedsDay } from "./apply-team-geo-seeds-day.js";
import { buildTeamNewsWorksetDay } from "./build-team-news-workset-day.js";
import { buildTeamNewsResearchTasksDay } from "./build-team-news-research-tasks-day.js";
import { runTeamNewsResearchTasksDay } from "./run-team-news-research-tasks-day.js";
import { buildValueDay } from "../core/build-value-day.js";

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
    teamNewsResearchMaxTasks = readPositiveIntegerEnv("TEAM_NEWS_RESEARCH_MAX_TASKS", 24)
  } = options;

  const normalizedTeamNewsMaxTeams = normalizePositiveIntegerOption(
    teamNewsMaxTeams,
    Infinity
  );

  const normalizedTeamNewsResearchMaxTasks = normalizePositiveIntegerOption(
    teamNewsResearchMaxTasks,
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
    teamNewsResearchMaxTasks: normalizedTeamNewsResearchMaxTasks
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
  let teamNewsWorkset = null;
  let teamNewsResearchTasks = null;
  let teamNewsResearchRun = null;
  let teamNewsBuild = null;
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
    teamNewsWorkset,
    teamNewsResearchTasks,
    teamNewsResearchRun,
    teamNewsBuild,
    valueBuild,
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
      teamNewsResearchTaskCount: result?.teamNewsResearchRun?.taskCount ?? 0,
      teamNewsAcceptedCandidateCount: result?.teamNewsResearchRun?.acceptedCandidateCount ?? 0,
      teamNewsCanonicalWriteCount: result?.teamNewsResearchRun?.canonicalWriteCount ?? 0,
      valueCount: result?.valueBuild?.count ?? 0
    });
  } catch (error) {
    console.error("[daily-cycle] cli:fatal", error);
    globalThis.process.exitCode = 1;
  }
}