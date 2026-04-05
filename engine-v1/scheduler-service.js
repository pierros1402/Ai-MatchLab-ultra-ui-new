import { athensDayKey, shiftDay } from "./core/daykey.js";
import { ingestDay } from "./jobs/ingest-day.js";
import { finalizeDayIfSafe } from "./jobs/finalize-day.js";
import { monitorActiveLeagues } from "./jobs/monitor-active-leagues.js";
import { runDailyCycle } from "./jobs/run-daily-cycle.js";

const STARTUP_DELAY_MS = 10 * 1000;
const TICK_MS = 2 * 60 * 1000;
const DISCOVER_EVERY_TICKS = 5; // κάθε ~10 λεπτά
const FULL_DAILY_CYCLE_EVERY_TICKS = 15; // κάθε ~30 λεπτά

let running = false;
let timer = null;
let tickCount = 0;
let lastRun = null;

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

    log("tick:start", {
      now: nowIso(),
      today,
      yesterday,
      tickCount
    });

    // 1) βασικό ingest σήμερα
    await safeStep(`ingest:${today}`, async () => ingestDay(today));

    // 2) προαιρετικά monitor για live/active λίγκες
    await safeStep(`monitor:${today}`, async () => monitorActiveLeagues(today));

    // 3) finalize χθεσινής μόνο αν είναι safe
    await safeStep(`finalize:${yesterday}`, async () => finalizeDayIfSafe(yesterday));

    // 4) ανά λίγα ticks, πιο πλήρης daily cycle για να μη μένουν κενά
    if (tickCount % FULL_DAILY_CYCLE_EVERY_TICKS === 0) {
      await safeStep(`daily-cycle:${today}`, async () =>
        runDailyCycle({
          dayKey: today,
          doFinalize: true,
          daysForward: 2
        })
      );
    }

    lastRun = {
      ok: true,
      ts: Date.now(),
      iso: nowIso(),
      ms: Date.now() - started,
      today,
      yesterday,
      tickCount
    };

    log("tick:done", lastRun);
  } catch (err) {
    lastRun = {
      ok: false,
      ts: Date.now(),
      iso: nowIso(),
      ms: Date.now() - started,
      error: String(err?.message || err),
      tickCount
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

  // μικρή αναμονή στην αρχή για να σταθεροποιηθεί το process
  await sleep(STARTUP_DELAY_MS);

  // αρχικό γέμισμα
  await safeStep(`bootstrap-ingest:${today}`, async () => ingestDay(today));
  await safeStep(`bootstrap-monitor:${today}`, async () => monitorActiveLeagues(today));
  await safeStep(`bootstrap-finalize:${yesterday}`, async () => finalizeDayIfSafe(yesterday));

  // πλήρες cycle μια φορά στην αρχή
  await safeStep(`bootstrap-daily-cycle:${today}`, async () =>
    runDailyCycle({
      dayKey: today,
      doFinalize: true,
      daysForward: 2
    })
  );

  log("bootstrap:done");
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