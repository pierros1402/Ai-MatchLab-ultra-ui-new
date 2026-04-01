import { athensDayKey, shiftDay } from "../core/daykey.js";
import { ingestDay } from "./ingest-day.js";

export async function discoverWindow(options = {}) {
  const {
    baseDay = athensDayKey(),
    daysBack = 0,
    daysForward = 3
  } = options;

  const startedAt = Date.now();

  const days = [];
  for (let i = daysBack; i > 0; i--) {
    days.push(shiftDay(baseDay, -i));
  }
  days.push(baseDay);
  for (let i = 1; i <= daysForward; i++) {
    days.push(shiftDay(baseDay, i));
  }

  const results = [];

  for (const dayKey of days) {
    const ingest = await ingestDay(dayKey);
    results.push({
      dayKey,
      ingest
    });
  }

  return {
    ok: true,
    baseDay,
    days,
    startedAt,
    finishedAt: Date.now(),
    ms: Date.now() - startedAt,
    results
  };
}