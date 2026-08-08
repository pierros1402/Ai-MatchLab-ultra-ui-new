import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OVERLAY_SOURCE = fs.readFileSync(
  path.join(REPO_ROOT, "assets/js/live/live-overlay.js"),
  "utf8"
);

async function runOverlay({
  todayMatches,
  activeMatches = [],
  workerMatches,
  subsequentWorkerMatches = null
}) {
  const events = [];
  const intervalCallbacks = [];
  let fetchCount = 0;
  let timerId = 0;

  const document = {
    readyState: "complete",
    addEventListener() {},
    dispatchEvent() {},
    querySelectorAll() { return []; }
  };

  const window = {
    AIML_CONFIG: { LIVE_WORKER_URL: "https://example.invalid/api/live" },
    AIML_OperationalDay: { getDay: () => "2026-08-07" },
    __AIML_LAST_TODAY: { date: "2026-08-07", matches: todayMatches },
    __AIML_LAST_ACTIVE: { date: "2026-08-07", matches: activeMatches },
    fetch: async () => ({
      ok: true,
      json: async () => ({
        matches:
          fetchCount++ === 0 || !Array.isArray(subsequentWorkerMatches)
            ? workerMatches
            : subsequentWorkerMatches
      })
    }),
    emit(event, payload) { events.push({ event, payload }); },
    setTimeout(callback, delay) {
      timerId += 1;
      if (Number(delay) <= 100) Promise.resolve().then(callback);
      return timerId;
    },
    clearTimeout() {},
    setInterval(callback) {
      intervalCallbacks.push(callback);
      return ++timerId;
    },
    clearInterval() {}
  };

  const context = vm.createContext({
    AbortController,
    CustomEvent: class CustomEvent {},
    Date,
    Promise,
    console,
    document,
    setInterval: window.setInterval,
    window
  });

  vm.runInContext(OVERLAY_SOURCE, context, { filename: "live-overlay.js" });
  for (let i = 0; i < 8; i += 1) await Promise.resolve();

  if (Array.isArray(subsequentWorkerMatches) && intervalCallbacks.length) {
    intervalCallbacks[0]();
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  }

  return events.filter(entry => entry.event === "live:update").at(-1)?.payload || null;
}

test("Flashscore worker source ID is emitted as the canonical Today ID", async () => {
  const payload = await runOverlay({
    todayMatches: [{
      id: "cid_col2_atletico_realsantander_20260807",
      canonicalId: "cid_col2_atletico_realsantander_20260807",
      sourceId: "AiEjXZZp",
      home: "Atletico",
      away: "Real Santander",
      kickoffUtc: "2026-08-07T17:00:00.000Z"
    }],
    workerMatches: [{
      matchId: "fs_AiEjXZZp",
      home: "Atletico",
      away: "Real Santander",
      kickoffUtc: "2026-08-07T17:00:00.000Z",
      status: "LIVE",
      scoreHome: 1,
      scoreAway: 0,
      minute: 52
    }]
  });

  assert.ok(payload);
  assert.equal(payload.matches.length, 1);
  assert.equal(payload.matches[0].id, "cid_col2_atletico_realsantander_20260807");
  assert.equal(payload.matches[0].matchId, "cid_col2_atletico_realsantander_20260807");
  assert.equal(payload.matches[0].providerMatchId, "fs_AiEjXZZp");
  assert.equal(payload.matches[0].minute, null);
  assert.equal(payload.matches[0].minuteSource, "unavailable");
});

test("cross-provider worker row uses unique ordered teams plus kickoff fallback", async () => {
  const payload = await runOverlay({
    todayMatches: [{
      id: "cid_example_home_away_20260807",
      canonicalId: "cid_example_home_away_20260807",
      sourceId: "401999999",
      home: "Example FC",
      away: "Away United",
      kickoffUtc: "2026-08-07T18:00:00.000Z"
    }],
    workerMatches: [{
      matchId: "fs_ZyXwVu12",
      home: "Example FC",
      away: "Away United",
      kickoffUtc: "2026-08-07T18:08:00.000Z",
      status: "LIVE",
      scoreHome: 0,
      scoreAway: 1,
      minute: 28
    }]
  });

  assert.equal(payload.matches[0].id, "cid_example_home_away_20260807");
});

test("ambiguous or time-mismatched fallback stays fail-closed on provider ID", async () => {
  const payload = await runOverlay({
    todayMatches: [{
      id: "cid_example_home_away_20260807",
      home: "Example FC",
      away: "Away United",
      kickoffUtc: "2026-08-07T18:00:00.000Z"
    }],
    workerMatches: [{
      matchId: "fs_ZyXwVu12",
      home: "Example FC",
      away: "Away United",
      kickoffUtc: "2026-08-07T20:00:00.000Z",
      status: "LIVE",
      scoreHome: 0,
      scoreAway: 1,
      minute: 28
    }]
  });

  assert.equal(payload.matches[0].id, "fs_ZyXwVu12");
  assert.equal(payload.matches[0].canonicalId, null);
});

test("worker FT is terminal-sticky when a later payload regresses to LIVE", async () => {
  const todayMatches = [{
    id: "cid_terminal_sticky_20260807",
    canonicalId: "cid_terminal_sticky_20260807",
    sourceId: "Sticky123",
    home: "Sticky Home",
    away: "Sticky Away",
    kickoffUtc: "2026-08-07T17:00:00.000Z"
  }];
  const payload = await runOverlay({
    todayMatches,
    workerMatches: [{
      matchId: "fs_Sticky123",
      home: "Sticky Home",
      away: "Sticky Away",
      kickoffUtc: "2026-08-07T17:00:00.000Z",
      status: "FT",
      scoreHome: 2,
      scoreAway: 1,
      minute: null
    }],
    subsequentWorkerMatches: [{
      matchId: "fs_Sticky123",
      home: "Sticky Home",
      away: "Sticky Away",
      kickoffUtc: "2026-08-07T17:00:00.000Z",
      status: "LIVE",
      scoreHome: 1,
      scoreAway: 1,
      minute: 77
    }]
  });

  assert.equal(payload.matches.length, 1);
  assert.equal(payload.matches[0].status, "FT");
  assert.equal(payload.matches[0].scoreHome, 2);
  assert.equal(payload.matches[0].scoreAway, 1);
  assert.equal(payload.matches[0].minute, null);
});

test("fixtures snapshot loader cannot write the authoritative browser live cache", () => {
  const loader = fs.readFileSync(
    path.join(REPO_ROOT, "assets/js/live/fixtures-loader.js"),
    "utf8"
  );

  assert.doesNotMatch(loader, /window\.__AIML_LAST_LIVE\s*=/u);
  assert.match(loader, /window\.__AIML_LAST_SNAPSHOT_LIVE\s*=/u);
  assert.match(OVERLAY_SOURCE, /window\.__AIML_LAST_LIVE\s*=\s*payload/u);
});
