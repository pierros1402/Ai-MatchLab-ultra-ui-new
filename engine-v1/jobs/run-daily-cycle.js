import { athensDayKey, shiftDay } from "../core/daykey.js";
import { discoverWindow } from "./discover-window.js";
import { discoverActiveLeagues } from "./discover-active-leagues.js";
import { monitorActiveLeagues } from "./monitor-active-leagues.js";
import { finalizeDayIfSafe } from "./finalize-day.js";
import { appendFinalizedDayToHistory } from "./append-finalized-day-to-history.js";
import { rebuildIndexesForSeason } from "./rebuild-indexes-for-season.js";
import { buildDetailsDay } from "./build-details-day.js";
import { buildValueDay } from "../core/build-value-day.js";

export async function runDailyCycle(options = {}) {
  const {
    dayKey = athensDayKey(),
    doFinalize = true,
    daysForward = 2
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

// -------------------------------------
// VALUE BUILD (FIRST)
// -------------------------------------
console.log("[daily-cycle] value-build:start", { dayKey });

const valueBuild = await buildValueDay(dayKey, { rebuild: true });

console.log("[daily-cycle] value-build:done", {
  ok: valueBuild?.ok,
  date: valueBuild?.date,
  count: valueBuild?.count ?? 0
});

// -------------------------------------
// DETAILS BUILD (AFTER VALUE)
// -------------------------------------
console.log("[daily-cycle] details-build:start", { dayKey });

const detailsBuild = await buildDetailsDay(dayKey, { rebuild: false });

console.log("[daily-cycle] details-build:done", detailsBuild);

  let finalizeValueBuild = null;
  let finalize = null;
  let historyAppend = null;
  let indexesRebuild = null;

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
    startedAt,
    finishedAt,
    ms: finishedAt - startedAt,
    discoveryWindow,
    activeLeagues,
    monitor,
    detailsBuild,
    valueBuild,
    finalizeValueBuild,
    finalize,
    historyAppend,
    indexesRebuild
  };
}