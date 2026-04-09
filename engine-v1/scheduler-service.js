import { athensDayKey, shiftDay } from "./core/daykey.js";
import { ingestDay } from "./jobs/ingest-day.js";
import { finalizeDayIfSafe } from "./jobs/finalize-day.js";
import { discoverActiveLeagues } from "./jobs/discover-active-leagues.js";
import { monitorActiveLeagues } from "./jobs/monitor-active-leagues.js";
import { runDailyCycle } from "./jobs/run-daily-cycle.js";

const STARTUP_DELAY_MS = 10 * 1000;
const TICK_MS = 2 * 60 * 1000;
const FULL_DAILY_CYCLE_EVERY_TICKS = 15; // κάθε ~30 λεπτά

let running = false;
let timer = null;
let tickCount = 0;
let lastRun = null;
let lastSeenToday = null;
let rolloverBootstrapDoneForDay = null;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function log(...args) {
  console.log("[scheduler-service]", ...args);
}

async function safeStep(label, fn) {
  const started = Date.now();

  try {
    const result = await fn();
    log(label, "ok", {
      ms: Date.now() - started
    });
    return result;
  } catch (err) {
    log(label, "failed", {
      ms: Date.now() - started,
      error: String(err?.message || err)
    });
    return null;
  }
}

async function monitorWithRecovery(dayKey) {
  let result = await monitorActiveLeagues(dayKey);

  if (!result?.ok && result?.reason === "no_active_leagues_file") {
    log("monitor recovery:no_active_leagues_file", { dayKey });

    await discoverActiveLeagues(dayKey);
    result = await monitorActiveLeagues(dayKey);
  }

  if (!result?.ok && result?.reason === "active_leagues_day_mismatch") {
    log("monitor recovery:active_leagues_day_mismatch", {
      requestedDay: dayKey,
      activeDay: result?.activeDay
    });

    await discoverActiveLeagues(dayKey);
    result = await monitorActiveLeagues(dayKey);
  }

  return result;
}

async function forcedBootstrapForDay(dayKey) {
  const yesterday = shiftDay(dayKey, -1);

  log("forced-bootstrap:start", {
    now: nowIso(),
    dayKey,
    yesterday
  });

  await safeStep(`forced-discover:${dayKey}`, async () =>
    discoverActiveLeagues(dayKey)
  );

  await safeStep(`forced-monitor:${dayKey}`, async () =>
    monitorWithRecovery(dayKey)
  );

  await safeStep(`forced-finalize:${yesterday}`, async () =>
    finalizeDayIfSafe(yesterday)
  );

  await safeStep(`forced-daily-cycle:${dayKey}`, async () =>
    runDailyCycle({
      dayKey,
      doFinalize: true,
      daysForward: 2
    })
  );

  rolloverBootstrapDoneForDay = dayKey;

  log("forced-bootstrap:done", {
    dayKey
  });
}

async function runTick() {
  if (running) {
    log("tick skipped: previous tick still running");
    return;
  }

  running = true;
  const started = Date.now();

  try {
    const today = athensDayKey();
    const yesterday = shiftDay(today, -1);

    const dayChanged = lastSeenToday !== null && lastSeenToday !== today;

    log("tick:start", {
      now: nowIso(),
      today,
      yesterday,
      tickCount,
      lastSeenToday,
      dayChanged
    });

    if (dayChanged) {
      log("day rollover detected", {
        from: lastSeenToday,
        to: today
      });

      await forcedBootstrapForDay(today);
    } else if (rolloverBootstrapDoneForDay !== today && tickCount === 0) {
      // extra προστασία για την πρώτη κανονική εκτέλεση μετά το startup
      await forcedBootstrapForDay(today);
    }

    // 1) βασικό ingest σήμερα
    await safeStep(`ingest:${today}`, async () => ingestDay(today));

    // 2) monitor με auto-recovery
    await safeStep(`monitor:${today}`, async () => monitorWithRecovery(today));

    // 3) finalize χθεσινής μόνο αν είναι safe
    await safeStep(`finalize:${yesterday}`, async () => finalizeDayIfSafe(yesterday));

    // 4) ανά λίγα ticks, πλήρες daily cycle
    if (tickCount % FULL_DAILY_CYCLE_EVERY_TICKS === 0) {
      await safeStep(`daily-cycle:${today}`, async () =>
        runDailyCycle({
          dayKey: today,
          doFinalize: true,
          daysForward: 2
        })
      );
    }

    lastSeenToday = today;

    lastRun = {
      ok: true,
      ts: Date.now(),
      iso: nowIso(),
      ms: Date.now() - started,
      today,
      yesterday,
      tickCount,
      rolloverBootstrapDoneForDay
    };

    log("tick:done", lastRun);
  } catch (err) {
    lastRun = {
      ok: false,
      ts: Date.now(),
      iso: nowIso(),
      ms: Date.now() - started,
      error: String(err?.message || err),
      tickCount,
      lastSeenToday,
      rolloverBootstrapDoneForDay
    };

    log("tick:error", lastRun);
  } finally {
    tickCount += 1;
    running = false;
  }
}

async function bootstrap() {
  const today = athensDayKey();
  const yesterday = shiftDay(today, -1);

  log("bootstrap:start", {
    now: nowIso(),
    today,
    yesterday
  });

  await sleep(STARTUP_DELAY_MS);

  await safeStep(`bootstrap-ingest:${today}`, async () => ingestDay(today));

  await safeStep(`bootstrap-discover:${today}`, async () =>
    discoverActiveLeagues(today)
  );

  await safeStep(`bootstrap-monitor:${today}`, async () =>
    monitorWithRecovery(today)
  );

  await safeStep(`bootstrap-finalize:${yesterday}`, async () =>
    finalizeDayIfSafe(yesterday)
  );

  await safeStep(`bootstrap-daily-cycle:${today}`, async () =>
    runDailyCycle({
      dayKey: today,
      doFinalize: true,
      daysForward: 2
    })
  );

  lastSeenToday = today;
  rolloverBootstrapDoneForDay = today;

  log("bootstrap:done", {
    today
  });
}

async function main() {
  log("service starting");

  await bootstrap();
  await runTick();

  timer = setInterval(() => {
    runTick().catch(err => {
      log("interval tick fatal", String(err?.message || err));
    });
  }, TICK_MS);

  log("service ready", {
    tickEveryMs: TICK_MS
  });
}

function shutdown(signal) {
  log("shutdown", signal);

  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main().catch(err => {
  log("service fatal", String(err?.message || err));
  process.exit(1);
});