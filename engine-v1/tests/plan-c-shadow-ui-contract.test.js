import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function validPrediction(overrides = {}) {
  return {
    canonicalFixtureId: "cid_esp1_realmadrid_realsociedad_20260826",
    leagueSlug: "esp.1",
    kickoffUtc: "2026-08-26T19:00:00.000Z",
    snapshotRetrievedAt: "2026-08-24T16:52:48.310Z",
    predictionCreatedAt: "2026-08-25T09:11:20.484Z",
    homeTeam: "Real Madrid",
    awayTeam: "Real Sociedad",
    homeElo: 1949,
    awayElo: 1751,
    eloEdge: 0.495,
    identityCategory: "both",
    eloApplied: true,
    baseline: { lambdaHome: 1.536, lambdaAway: 1.2286, pOver25: 0.5221 },
    adjusted: { lambdaHome: 1.6544, lambdaAway: 1.1407, pOver25: 0.5294 },
    planCPick: false,
    predictionSignature: "a".repeat(64),
    ...overrides
  };
}

test("Plan C is rendered in a separate explicitly shadow-labelled panel", () => {
  const html = read("index.html");
  const source = read("assets/js/ui/plan-c-shadow.js");
  const css = read("assets/css/right-panels.css");

  assert.match(html, /class="intelligence-panel plan-c-shadow-panel"/);
  assert.match(html, /plan-c-shadow-header-badge">SHADOW/);
  assert.match(html, /assets\/js\/ui\/plan-c-shadow\.js\?v=1/);
  assert.match(source, /const ENDPOINT = "\/plan-c-shadow"/);
  assert.match(source, /Separate from official Value picks and alerts/);
  assert.match(source, /productionEligible !== false/);
  assert.doesNotMatch(source, /window\.emit\s*\(/);
  assert.match(css, /PLAN C SHADOW — EXPERIMENTAL, READ-ONLY OBSERVATION PANEL/);
});

test("Plan C UI validator accepts only the verified forward-only shadow cohort", async () => {
  const source = read("assets/js/ui/plan-c-shadow.js");
  const list = {
    innerHTML: "",
    addEventListener() {}
  };
  const root = {};
  const listeners = new Map();
  const unavailable = {
    schema: "ai-matchlab.plan-c-shadow-day.v1",
    ok: true,
    available: false,
    mode: "SHADOW",
    productionEligible: false,
    date: "2026-08-26",
    count: 0,
    pickCount: 0,
    entries: []
  };
  let fetchPayload = unavailable;
  const windowObject = {
    AIML_CONFIG: { BASE_URL: "http://engine.test" },
    addEventListener(name, handler) { listeners.set(name, handler); }
  };
  const context = vm.createContext({
    window: windowObject,
    document: {
      querySelector(selector) { return selector === ".plan-c-shadow-panel" ? root : null; },
      getElementById(id) { return id === "plan-c-shadow-list" ? list : null; }
    },
    fetch: async () => ({ ok: true, status: 200, json: async () => fetchPayload }),
    AbortController,
    Date,
    Intl,
    Number,
    Object,
    Array,
    String,
    RegExp,
    console
  });

  vm.runInContext(source, context, { filename: "plan-c-shadow.js" });
  await new Promise(resolve => setImmediate(resolve));

  const api = windowObject.AIML_PlanCShadow;
  assert.ok(api);
  assert.match(list.innerHTML, /SHADOW · EXPERIMENTAL/);

  const entry = {
    prediction: validPrediction(),
    settlement: { state: "PENDING", truth: null }
  };
  const payload = {
    ...unavailable,
    available: true,
    count: 1,
    pickCount: 0,
    entries: [entry]
  };
  const validation = api.validatePayload(payload);
  assert.equal(validation.ok, true);
  assert.equal(validation.errors.length, 0);
  assert.equal(validation.count, 1);
  assert.equal(validation.pickCount, 0);

  const unresolved = structuredClone(payload);
  unresolved.entries[0].prediction.identityCategory = "unresolved";
  assert.equal(api.validatePayload(unresolved).ok, false);

  const lookahead = structuredClone(payload);
  lookahead.entries[0].prediction.predictionCreatedAt = "2026-08-27T09:00:00.000Z";
  assert.equal(api.validatePayload(lookahead).ok, false);

  fetchPayload = JSON.parse(read("data/plan-c-shadow/2026-08-26.json"));
  const realValidation = api.validatePayload(fetchPayload);
  assert.equal(realValidation.ok, true);
  assert.equal(realValidation.count, 10);
  assert.equal(realValidation.pickCount, 6);
  await api.reload("2026-08-26");
  assert.match(list.innerHTML, /6<\/strong><span>shadow picks/);
  assert.match(list.innerHTML, /OVER 2\.5 · SHADOW PICK/);
  assert.match(list.innerHTML, /Verified ClubElo identities/);

  assert.ok(listeners.has("date:change"));
});
