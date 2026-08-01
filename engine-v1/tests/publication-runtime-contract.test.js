import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

test("web process never performs boot or request-time GitHub synchronization", () => {
  const index = read("engine-v1/index.js");

  assert.doesNotMatch(index, /syncDeploySnapshotFromGithub\(/);
  assert.doesNotMatch(index, /syncValueComparisonFromGithub\(/);
  assert.match(index, /boot sync disabled/);
  assert.match(index, /startSnapshotSyncJob/);
  assert.match(index, /immutable_ref_required/);
  assert.match(index, /app\.post\("\/ops\/sync-snapshot"/);
  assert.match(index, /app\.get\("\/ops\/sync-snapshot"/);
  assert.match(index, /method_not_allowed/);
});

test("public snapshot runtime never executes live or truth overlays inside requests", () => {
  const index = read("engine-v1/index.js");
  const policy = read("engine-v1/core/runtime-display-policy.js");
  const flashscore = read("engine-v1/odds/flashscore-fixtures-source.js");
  const verifier = read("engine-v1/core/live-ft-verifier.js");

  assert.match(index, /runtimeRequestOverlaysEnabled/);
  assert.match(index, /if \(!overlaysEnabled\)/);
  assert.match(index, /requestTimeTruthScan: false/);
  assert.match(index, /cacheContract: "manifest-revision"/);
  assert.doesNotMatch(index, /DISPLAY_UNIVERSE_TTL_MS/);
  assert.match(policy, /return !renderRuntime && !snapshotOnly/);
  assert.match(index, /controller\.abort/);
  assert.match(index, /signal => overlayFlashscoreLive/);
  assert.match(index, /signal => verifyStuckLiveFinals/);
  assert.match(flashscore, /AbortSignal\.any/);
  assert.match(verifier, /Promise\.all/);
  assert.match(verifier, /options\.signal/);
});

test("release and readiness endpoints expose public deployment truth", () => {
  const index = read("engine-v1/index.js");

  assert.match(index, /app\.get\("\/release"/);
  assert.match(index, /RENDER_GIT_COMMIT/);
  assert.match(index, /app\.get\("\/ready"/);
  assert.match(index, /latest_pointer_mismatch/);
  assert.match(index, /app\.get\("\/system-health-alerts"/);
});

test("deploy workflows verify sustained public runtime rather than hook acceptance", () => {
  const engine = read(".github/workflows/engine-only-render-deploy.yml");
  const wait = read("tools/wait-for-render-engine-release.sh");
  const stability = read("tools/verify-public-engine-runtime.mjs");
  const ui = read(".github/workflows/ui-only-render-deploy.yml");

  assert.match(engine, /actions\/checkout@v4/);
  assert.match(engine, /wait-for-render-engine-release\.sh/);
  assert.match(wait, /verify-public-engine-runtime\.mjs/);
  assert.match(stability, /fixtures-runtime\?mode=active/);
  assert.match(stability, /value-comparison/);
  assert.match(stability, /post_load_health_not_ok/);
  assert.match(stability, /request_time_overlays_not_disabled/);
  assert.match(ui, /actions\/checkout@v4/);
  assert.match(ui, /verify-public-ui-release\.sh/);
});


test("UI readiness requires current-day snapshot and latest-pointer hash parity", () => {
  const authority = read("assets/js/live/operational-day.js");

  assert.match(authority, /latestDay === state\.day/);
  assert.match(authority, /latestHash === snapshotHash/);
  assert.match(authority, /snapshot\?\.manifest\?\.hash/);
});

test("date navigation aborts obsolete requests before they can overwrite a newer selection", () => {
  const loader = read("assets/js/live/date-nav-loader.js");

  assert.match(loader, /activeController\.abort/);
  assert.match(loader, /generation !== requestGeneration/);
  assert.match(loader, /activeDate !== requestedDate/);
  assert.doesNotMatch(loader, /if \(loading\) return/);
});

test("value panel follows selected day and never falls back to stale static release data", () => {
  const adapter = read("assets/js/live/value-adapter.js");
  const html = read("index.html");

  assert.doesNotMatch(adapter, /data\/value-comparison/);
  assert.match(adapter, /on\("date:change"/);
  assert.match(adapter, /engine-release-unavailable/);
  assert.match(adapter, /AbortController/);
  assert.match(html, /value-adapter\.js\?v=3/);
});

test("odds requests are bound to the selected match day and obsolete requests are aborted", () => {
  const loader = read("assets/js/live/odds-loader.js");

  assert.match(loader, /match\?\.date \|\| window\.__AIML_SELECTED_DATE/);
  assert.match(loader, /encodeURIComponent\(day\)/);
  assert.match(loader, /controller\?\.abort/);
  assert.match(loader, /generation !== requestGeneration/);
  assert.doesNotMatch(loader, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\);\s*const url/);
});

test("live worker overlay is bounded and labeled with the shared operational day", () => {
  const overlay = read("assets/js/live/live-overlay.js");

  assert.match(overlay, /AIML_OperationalDay/);
  assert.match(overlay, /AbortController/);
  assert.match(overlay, /var inFlight = false/);
  assert.match(overlay, /date: operationalDay\(\)/);
});

test("UI aborts are terminal and are not retried as fetch failures", () => {
  const app = read("assets/js/ui/app.js");
  const fixtures = read("assets/js/live/fixtures-loader.js");
  const value = read("assets/js/live/value-adapter.js");
  const html = read("index.html");

  assert.match(app, /err\?\.name === 'AbortError'/);
  assert.match(app, /finally \{\s*if \(timeout\) clearTimeout\(timeout\)/s);
  assert.match(fixtures, /if \(!isAbortError\(e\)\)/);
  assert.match(value, /if \(!isAbortError\(err\)\)/);
  assert.match(html, /app\.js\?v=3/);
  assert.match(html, /fixtures-loader\.js\?v=8/);
  assert.match(html, /value-adapter\.js\?v=3/);
});

test("engine package and lock dependencies are synchronized", () => {
  const packageJson = JSON.parse(read("engine-v1/package.json"));
  const lock = JSON.parse(read("engine-v1/package-lock.json"));

  assert.deepEqual(lock.packages[""].dependencies, packageJson.dependencies);
  assert.equal(lock.packages["node_modules/dotenv"].version, "17.4.2");
});


test("Value export keeps four plans separate and computes range rates from accumulated settlements", () => {
  const index = read("engine-v1/index.js");
  const report = read("engine-v1/core/value-export-report.js");

  assert.match(index, /VALUE_EXPORT_PLAN_ORDER/);
  assert.match(index, /Daily Summary/);
  assert.match(index, /Selected Range Summary/);
  assert.match(index, /Market Breakdown/);
  assert.match(report, /wins \/ decided/);
  assert.doesNotMatch(report, /INSUFFICIENT_SAMPLE/);
  assert.match(report, /A2/);
  assert.match(report, /B2/);
  assert.match(report, /VALUE_EXPORT_CLOSED_DAY_UNRESOLVED/);
});
