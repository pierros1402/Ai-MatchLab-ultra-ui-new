import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = `data/football-truth/_diagnostics/current-or-new-core-lifecycle-loader-patch-verification-${DATE}`;
const OUT = `${OUT_DIR}/current-or-new-core-lifecycle-loader-patch-verification-${DATE}.json`;

const TARGETS = [
  "engine-v1/jobs/build-football-truth-season-lane-coverage-ledger-file.js",
  "engine-v1/jobs/build-football-truth-permanent-season-lifecycle-plan-file.js",
  "engine-v1/jobs/build-football-truth-prioritized-lifecycle-execution-board-file.js"
];

function abs(p) {
  return path.join(ROOT, p);
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(abs(p), "utf8"));
}

function writeJson(p, v) {
  fs.mkdirSync(path.dirname(abs(p)), { recursive: true });
  fs.writeFileSync(abs(p), JSON.stringify(v, null, 2) + "\n");
}

function walk(dir, predicate, out = []) {
  const full = abs(dir);
  if (!fs.existsSync(full)) return out;
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    const rel = path.posix.join(dir.replace(/\\/g, "/"), entry.name);
    if (entry.isDirectory()) walk(rel, predicate, out);
    else if (predicate(rel)) out.push(rel);
  }
  return out;
}

function latestExact(fileRegex) {
  const files = walk("data/football-truth/_diagnostics", p => fileRegex.test(path.basename(p)));
  if (!files.length) return null;
  return files.map(p => ({ p, mtimeMs: fs.statSync(abs(p)).mtimeMs })).sort((a, b) => b.mtimeMs - a.mtimeMs)[0].p;
}

function currentCount(obj) {
  const summary = obj?.summary ?? obj ?? {};
  return summary.currentOrNewSeasonSatisfiedCount ?? summary.currentOrNewSatisfiedCount ?? null;
}

function integrationStatus(obj) {
  return obj?.currentOrNewLifecycleIntegration?.status ?? null;
}

const sourceChecks = TARGETS.map(target => {
  const text = fs.readFileSync(abs(target), "utf8");
  return {
    path: target,
    importsLoader: text.includes("football-truth-current-or-new-diagnostic-state-loader.js"),
    hasOverlayMarker: text.includes("CURRENT_OR_NEW_LIFECYCLE_OVERLAY_START"),
    hasOverlayFunction: text.includes("applyCurrentOrNewDiagnosticLifecycleOverlay"),
    hasPostRunCall: text.includes("applyCurrentOrNewDiagnosticLifecycleOverlay(")
  };
});

const latestSeasonLaneLedgerPath = latestExact(/^season-lane-coverage-ledger-\d{4}-\d{2}-\d{2}\.json$/);
const latestPermanentLifecyclePath = latestExact(/^permanent-season-lifecycle-plan-\d{4}-\d{2}-\d{2}\.json$/);
const latestPrioritizedLifecyclePath = latestExact(/^prioritized-lifecycle-execution-board-\d{4}-\d{2}-\d{2}\.json$/);

const seasonLedger = latestSeasonLaneLedgerPath ? readJson(latestSeasonLaneLedgerPath) : null;
const permanentLifecycle = latestPermanentLifecyclePath ? readJson(latestPermanentLifecyclePath) : null;
const prioritizedLifecycle = latestPrioritizedLifecyclePath ? readJson(latestPrioritizedLifecyclePath) : null;

const seasonCount = currentCount(seasonLedger);
const permanentCount = currentCount(permanentLifecycle);
const prioritizedCount = currentCount(prioritizedLifecycle);

const blocks = [];

for (const check of sourceChecks) {
  if (!check.importsLoader) blocks.push(`${check.path}_missing_loader_import`);
  if (!check.hasOverlayMarker) blocks.push(`${check.path}_missing_overlay_marker`);
  if (!check.hasOverlayFunction) blocks.push(`${check.path}_missing_overlay_function`);
  if (!check.hasPostRunCall) blocks.push(`${check.path}_missing_post_run_call`);
}

if (seasonCount !== 9) blocks.push(`season_lane_current_count_${seasonCount}_expected_9`);
if (permanentCount !== 9) blocks.push(`permanent_lifecycle_current_count_${permanentCount}_expected_9`);
if (prioritizedCount !== 9) blocks.push(`prioritized_lifecycle_current_count_${prioritizedCount}_expected_9`);

if (integrationStatus(seasonLedger) !== "applied") blocks.push("season_lane_integration_not_applied");
if (integrationStatus(permanentLifecycle) !== "applied") blocks.push("permanent_lifecycle_integration_not_applied");
if (integrationStatus(prioritizedLifecycle) !== "applied") blocks.push("prioritized_lifecycle_integration_not_applied");

const output = {
  status: blocks.length ? "blocked" : "passed",
  runner: "current_or_new_core_lifecycle_loader_patch_verification",
  generatedAtUtc: new Date().toISOString(),
  sourceChecks,
  artifacts: {
    latestSeasonLaneLedgerPath,
    latestPermanentLifecyclePath,
    latestPrioritizedLifecyclePath,
    seasonCount,
    permanentCount,
    prioritizedCount,
    seasonIntegrationStatus: integrationStatus(seasonLedger),
    permanentIntegrationStatus: integrationStatus(permanentLifecycle),
    prioritizedIntegrationStatus: integrationStatus(prioritizedLifecycle)
  },
  expected: {
    currentOrNewSeasonSatisfiedCount: 9,
    materializedDiagnosticCurrentOrNewSlugCount: 8,
    materializedDiagnosticCurrentOrNewRowCount: 108
  },
  blocks,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
};

writeJson(OUT, output);

console.log(JSON.stringify({
  status: output.status,
  sourceChecks,
  artifacts: output.artifacts,
  expected: output.expected,
  blocks,
  output: OUT,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
}, null, 2));

if (blocks.length) process.exit(1);
