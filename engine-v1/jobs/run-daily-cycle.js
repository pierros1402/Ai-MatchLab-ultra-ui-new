import { athensDayKey } from "../core/daykey.js";
import { discoverActiveLeagues } from "./discover-active-leagues.js";
import { ingestDay } from "./ingest-day.js";
import { monitorActiveLeagues } from "./monitor-active-leagues.js";
import { finalizeDayIfSafe } from "./finalize-day.js";

export async function runDailyCycle(env, options = {}) {

  const {
    dayKey = athensDayKey(),
    doFinalize = false
  } = options;

  const startedAt = Date.now();

  const discovery = await discoverActiveLeagues(dayKey);
  const ingest = await ingestDay(dayKey, env);
  const monitor = await monitorActiveLeagues(dayKey);

  let finalize = null;

  if (doFinalize) {
    finalize = finalizeDayIfSafe(dayKey);
  }

  return {
    ok: true,
    dayKey,
    startedAt,
    finishedAt: Date.now(),
    ms: Date.now() - startedAt,
    discovery,
    ingest,
    monitor,
    finalize
  };
}