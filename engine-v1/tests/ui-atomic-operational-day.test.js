import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(
  new URL("../../assets/js/live/operational-day.js", import.meta.url),
  "utf8"
);

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; }
  };
}

function fixedDateClass(dayKey) {
  const fixedMs = Date.parse(`${dayKey}T12:00:00Z`);
  return class FixedDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [fixedMs]));
    }
    static now() { return fixedMs; }
  };
}

async function loadOperationalDay({
  calendarDay = "2026-08-22",
  storedDay = "2026-08-21",
  currentSnapshot = null,
  latest = null,
  fallbackSnapshots = {},
  failAll = false
} = {}) {
  const storage = new Map();
  if (storedDay) storage.set("aiml.atomicPublishedDay.v1", storedDay);

  const events = [];
  const FixedDate = fixedDateClass(calendarDay);

  const window = {
    location: { hostname: "localhost" },
    AIML_CONFIG: { BASE_URL: "http://engine.test" },
    AIML: {
      emit(name, detail) {
        events.push({ name, detail, via: "bus" });
      }
    },
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); }
    },
    dispatchEvent(event) {
      events.push({ name: event.type, detail: event.detail, via: "dom" });
      return true;
    },
    setTimeout,
    clearTimeout,
    setInterval() { return 1; }
  };

  async function fetchStub(url) {
    if (failAll) throw new Error("engine unavailable");

    const u = new URL(url);
    if (u.pathname === "/deploy-snapshot/latest") {
      return jsonResponse(latest || { ok: false });
    }

    if (u.pathname === "/deploy-snapshot") {
      const day = u.searchParams.get("date");
      if (day === calendarDay) {
        return jsonResponse(currentSnapshot || { ok: false, date: day });
      }
      return jsonResponse(
        fallbackSnapshots[day] || { ok: false, date: day }
      );
    }

    return jsonResponse({ ok: false }, 404);
  }

  class CustomEventStub {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  }

  const context = vm.createContext({
    window,
    fetch: fetchStub,
    AbortController,
    CustomEvent: CustomEventStub,
    Intl,
    Date: FixedDate,
    URL,
    console,
    setTimeout,
    clearTimeout
  });

  vm.runInContext(source, context, { filename: "operational-day.js" });
  const state = await window.AIML_OperationalDay.ready;

  return {
    window,
    state,
    events,
    storage
  };
}

test("atomic rollover stays on last verified release when calendar day is not promoted", async () => {
  const result = await loadOperationalDay({
    currentSnapshot: {
      ok: true,
      date: "2026-08-22",
      manifest: { hash: "candidate-22" }
    },
    latest: {
      ok: true,
      date: "2026-08-21",
      hash: "release-21"
    },
    fallbackSnapshots: {
      "2026-08-21": {
        ok: true,
        date: "2026-08-21",
        manifest: { hash: "release-21" }
      }
    }
  });

  assert.equal(result.window.AIML_OperationalDay.getCalendarDay(), "2026-08-22");
  assert.equal(result.window.AIML_OperationalDay.getDay(), "2026-08-21");
  assert.equal(result.state.engineSnapshotReady, false);
});

test("atomic rollover advances only after current day matches authoritative latest", async () => {
  const result = await loadOperationalDay({
    currentSnapshot: {
      ok: true,
      date: "2026-08-22",
      manifest: { hash: "release-22" }
    },
    latest: {
      ok: true,
      date: "2026-08-22",
      hash: "release-22"
    }
  });

  assert.equal(result.window.AIML_OperationalDay.getDay(), "2026-08-22");
  assert.equal(result.state.engineSnapshotReady, true);
  assert.equal(
    result.storage.get("aiml.atomicPublishedDay.v1"),
    "2026-08-22"
  );
  assert.ok(
    result.events.some(event =>
      event.name === "operational-day:change" &&
      event.detail?.day === "2026-08-22"
    )
  );
});

test("future pre-published latest never moves UI ahead of Athens calendar day", async () => {
  const result = await loadOperationalDay({
    storedDay: "2026-08-22",
    currentSnapshot: {
      ok: true,
      date: "2026-08-22",
      manifest: { hash: "release-22" }
    },
    latest: {
      ok: true,
      date: "2026-08-23",
      hash: "release-23"
    }
  });

  assert.equal(result.window.AIML_OperationalDay.getDay(), "2026-08-22");
  assert.equal(result.state.engineSnapshotReady, true);
  assert.equal(result.state.engineLatestDay, "2026-08-23");
});

test("engine/network failure cannot roll operational day forward", async () => {
  const result = await loadOperationalDay({
    storedDay: "2026-08-21",
    failAll: true
  });

  assert.equal(result.window.AIML_OperationalDay.getDay(), "2026-08-21");
  assert.equal(result.state.engineSnapshotReady, false);
});
