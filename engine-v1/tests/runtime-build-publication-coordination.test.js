import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { EventEmitter } from "node:events";

const source = fs.readFileSync(
  new URL("../index.js", import.meta.url), "utf8"
);

const first = source.indexOf("function latestRunningJob(");
const second = source.indexOf("function startOpsChildJob(", first);
const last = source.indexOf("function startBuildDetailsJob(", second);

assert.ok(first >= 0 && second > first && last > second);

const launcher = source.slice(first, last);

assert.match(launcher, /acquirePublicationReadLease/);
assert.match(launcher, /child\.once\("close", releaseBuildLease\)/);

const authMatches = [
  ...source.matchAll(
    /function authorizeCronRequest\(req, res\) \{[\s\S]*?\n\}/g
  )
];
assert.equal(authMatches.length, 1, "unique source authentication");

const routes = [
  ["/ops/build-details-async", "build-details"],
  ["/ops/value-build-async", "value-build"]
];

function handlerBody(route) {
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(
    'app\\.get\\("' + escaped +
    '", \\(req, res\\) => \\{([\\s\\S]*?)\\n\\}\\);',
    "g"
  );
  const matches = [...source.matchAll(expression)];
  assert.equal(matches.length, 1);
  return matches[0][1];
}

function harness({
  disabled = false,
  hold = false,
  spawnThrows = false,
  missingSecret = false
} = {}) {
  const jobs = new Map();
  const endpoints = new Map();
  const children = [];
  const events = [];
  let leases = 0;

  const context = {
    OPS_JOBS: jobs,
    nowIso: () => new Date().toISOString(),
    trimLog: value => value,
    resolveDataPath: () => "/isolated-test-root",
    athensDayKey: () => "2026-11-12",
    boolParam: () => false,
    runtimeBuildsDisabled: () => disabled,
    publicJob: job => job,
    process: {
      env: {
        CRON_SECRET: missingSecret ? "" : "V35_TEST_ONLY_SECRET"
      },
      stdout: { write() {} },
      stderr: { write() {} }
    },
    console: { error() {} },
    acquirePublicationReadLease() {
      if (hold) throw new Error("publication_read_guard_active");
      leases++;
      events.push("lease");
      let released = false;
      return () => {
        if (released) return;
        released = true;
        leases--;
        events.push("release");
      };
    },
    spawn() {
      events.push("spawn");
      if (spawnThrows) throw new Error("injected_spawn_failure");
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.pid = 12345;
      children.push(child);
      return child;
    },
    app: {
      get(route, fn) {
        endpoints.set(route, fn);
      }
    },
    rejectRuntimeBuild(res) {
      return res.status(403).json({
        ok: false,
        error: "runtime_build_disabled"
      });
    }
  };

  vm.runInNewContext(
    authMatches[0][0] + "\n" + launcher + "\nthis.launchJob = startOpsChildJob;",
    context,
    { timeout: 1000 }
  );

  function start(type, dayKey) {
    return context.launchJob({
      type,
      dayKey,
      command: "mock-only",
      args: [],
      cwd: "/sandbox"
    });
  }

  context.startBuildDetailsJob = day =>
    start("build-details", day);

  context.startValueBuildJob = day =>
    start("value-build", day);

  for (const [route] of routes) {
    vm.runInNewContext(
      `app.get(${JSON.stringify(route)}, (req, res) => {
${handlerBody(route)}
});`,
      context,
      { timeout: 1000 }
    );
  }

  function request(route, authHeader = "V35_TEST_ONLY_SECRET") {
    const res = {
      code: 200,
      payload: null,
      status(code) { this.code = code; return this; },
      json(payload) { this.payload = payload; return this; }
    };
    endpoints.get(route)(
      { query: { date: "2026-11-12" }, headers: { "x-cron-secret": authHeader } },
      res
    );
    return res;
  }

  return {
    request,
    start,
    children,
    events,
    jobs,
    get leases() { return leases; }
  };
}

for (const [route] of routes) {
  test(route + " missing CRON_SECRET returns 503 without launch", () => {
    const h = harness({ missingSecret: true });
    const r = h.request(route);
    assert.equal(r.code, 503);
    assert.equal(r.payload.error, "cron_secret_not_configured");
    assert.equal(h.children.length, 0);
    assert.equal(h.leases, 0);
  });

  test(route + " incorrect secret returns 401 without launch", () => {
    const h = harness();
    const r = h.request(route, "INCORRECT_SECRET");
    assert.equal(r.code, 401);
    assert.equal(r.payload.error, "unauthorized");
    assert.equal(h.children.length, 0);
    assert.equal(h.leases, 0);
  });

  test(route + " disabled returns 403 without launch", () => {
    const h = harness({ disabled: true });
    assert.equal(h.request(route).code, 403);
    assert.equal(h.children.length, 0);
    assert.equal(h.leases, 0);
  });

  test(route + " HOLD returns 503 without launch", () => {
    const h = harness({ hold: true });
    const r = h.request(route);
    assert.equal(r.code, 503);
    assert.equal(r.payload.status, "HOLD");
    assert.equal(h.children.length, 0);
    assert.equal(h.jobs.size, 0);
  });

  test(route + " lease spans child lifetime", () => {
    const h = harness();
    const r = h.request(route);
    assert.equal(r.code, 200);
    assert.equal(r.payload.accepted, true);
    assert.deepEqual(h.events, ["lease", "spawn"]);
    assert.equal(h.leases, 1);
    h.children[0].emit("close", 0, null);
    assert.equal(h.leases, 0);
  });

  test(route + " synchronous spawn error releases lease", () => {
    const h = harness({ spawnThrows: true });
    const r = h.request(route);
    assert.equal(r.code, 500);
    assert.equal(r.payload.error, "runtime_build_launcher_failed");
    assert.equal(h.leases, 0);
    assert.equal(h.jobs.size, 0);
  });
}

test("duplicate running job uses existing lease", () => {
  const h = harness();
  const a = h.request(routes[0][0]);
  const b = h.request(routes[0][0]);
  assert.equal(a.payload.created, true);
  assert.equal(b.payload.created, false);
  assert.equal(h.children.length, 1);
  assert.equal(h.leases, 1);
  h.children[0].emit("close", 0, null);
  assert.equal(h.leases, 0);
});

test("child error retains lease until close", () => {
  const h = harness();
  h.request(routes[0][0]);
  h.children[0].emit("error", new Error("injected"));
  assert.equal(h.leases, 1);
  h.children[0].emit("close", 1, null);
  assert.equal(h.leases, 0);
});

test("non-build job does not acquire build lease", () => {
  const h = harness();
  h.start("snapshot-sync", "2026-11-12");
  assert.equal(h.leases, 0);
  assert.deepEqual(h.events, ["spawn"]);
  h.children[0].emit("close", 0, null);
});

test("integration qualification scope", () => {
  assert.match(source, /runtime_build_publication_hold/);
  console.log("LOCAL_SOURCE_BOUND_INTEGRATION=TESTED");
  console.log("REAL_BUILD_PROCESSES_STARTED=ZERO");
  console.log("PARENT_CRASH_RECOVERY=NOT_QUALIFIED");
  console.log("PRODUCTION_ACTIVATION=HOLD");
});