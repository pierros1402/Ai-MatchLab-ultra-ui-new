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
import { buildValueDay } from "../core/build-value-day.js";

export async function runDailyCycle(options = {}) {
  const {
    dayKey = athensDayKey(),
    doFinalize = true,
    daysForward = 2,
    detailsRebuild = false
  } = options;

  const startedAt = Date.now();
  const finalizeDayKey = shiftDay(dayKey, -1);

  console.log("[daily-cycle] start", {
    dayKey,
    finalizeDayKey,
    doFinalize,
    daysForward
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

  console.log("[daily-cycle] standings-build:done", standingsBuild);

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
    teamNewsBuild,
    detailsBuild,
    valueBuild,
    finalizeValueBuild,
    finalize,
    historyAppend,
    indexesRebuild
  };
}