import { athensDayKey, shiftDay } from "../core/daykey.js";
import { discoverWindow } from "./discover-window.js";
import { monitorActiveLeagues } from "./monitor-active-leagues.js";
import { finalizeDayIfSafe } from "./finalize-day.js";
import { appendFinalizedDayToHistory } from "./append-finalized-day-to-history.js";
import { rebuildIndexesForSeason } from "./rebuild-indexes-for-season.js";

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

  console.log("[daily-cycle] monitor:start", { dayKey });
  const monitor = await monitorActiveLeagues(dayKey);
  console.log("[daily-cycle] monitor:done");

  let finalize = null;
  let historyAppend = null;
  let indexesRebuild = null;

  if (doFinalize) {
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
    monitor,
    finalize,
    historyAppend,
    indexesRebuild
  };
}