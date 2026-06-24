import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = `data/football-truth/_diagnostics/previous-completed-proof-lifecycle-loader-patch-verification-${DATE}`;
const OUT = `${OUT_DIR}/previous-completed-proof-lifecycle-loader-patch-verification-${DATE}.json`;

function abs(p) { return path.join(ROOT, p); }
function readJson(p) { return JSON.parse(fs.readFileSync(abs(p), "utf8")); }
function readJsonl(p) { if (!fs.existsSync(abs(p))) return []; return fs.readFileSync(abs(p), "utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }
function writeJson(p, v) { fs.mkdirSync(path.dirname(abs(p)), { recursive: true }); fs.writeFileSync(abs(p), JSON.stringify(v, null, 2) + "\n"); }

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

function summaryOf(obj) { return obj?.summary ?? obj ?? {}; }
function integrationStatus(obj) { return obj?.previousCompletedLifecycleIntegration?.status ?? null; }
function hasEng1PreviousCompletedTask(row) {
  const text = JSON.stringify(row ?? {}).toLowerCase();
  return text.includes("eng.1") && (text.includes("previous_completed") || text.includes("previous-completed") || text.includes("acquire_previous_completed_standings"));
}

const targets = [
  "engine-v1/jobs/build-football-truth-season-lane-coverage-ledger-file.js",
  "engine-v1/jobs/build-football-truth-permanent-season-lifecycle-plan-file.js",
  "engine-v1/jobs/build-football-truth-prioritized-lifecycle-execution-board-file.js"
];

const sourceChecks = targets.map(target => {
  const text = fs.readFileSync(abs(target), "utf8");
  return {
    path: target,
    importsLoader: text.includes("football-truth-previous-completed-diagnostic-proof-loader.js"),
    hasOverlayMarker: text.includes("PREVIOUS_COMPLETED_PROOF_LIFECYCLE_OVERLAY_START"),
    hasOverlayFunction: text.includes("applyPreviousCompletedDiagnosticProofLifecycleOverlay"),
    hasPostRunCall: text.includes("applyPreviousCompletedDiagnosticProofLifecycleOverlay(")
  };
});

const latestSeasonLaneLedgerPath = latestExact(/^season-lane-coverage-ledger-\d{4}-\d{2}-\d{2}\.json$/);
const latestPermanentLifecyclePath = latestExact(/^permanent-season-lifecycle-plan-\d{4}-\d{2}-\d{2}\.json$/);
const latestPrioritizedLifecyclePath = latestExact(/^prioritized-lifecycle-execution-board-\d{4}-\d{2}-\d{2}\.json$/);
const latestPermanentDueTasksPath = latestExact(/^permanent-season-lifecycle-due-tasks-\d{4}-\d{2}-\d{2}\.jsonl$/);
const latestAcceptedTasksPath = latestExact(/^accepted-prioritized-lifecycle-tasks-\d{4}-\d{2}-\d{2}\.jsonl$/);
const latestSourceFamilyBoardPath = latestExact(/^source-family-expansion-board-\d{4}-\d{2}-\d{2}\.jsonl$/);

const season = latestSeasonLaneLedgerPath ? readJson(latestSeasonLaneLedgerPath) : null;
const permanent = latestPermanentLifecyclePath ? readJson(latestPermanentLifecyclePath) : null;
const prioritized = latestPrioritizedLifecyclePath ? readJson(latestPrioritizedLifecyclePath) : null;

const seasonSummary = summaryOf(season);
const permanentSummary = summaryOf(permanent);
const prioritizedSummary = summaryOf(prioritized);

const permanentDueTasks = latestPermanentDueTasksPath ? readJsonl(latestPermanentDueTasksPath) : [];
const acceptedTasks = latestAcceptedTasksPath ? readJsonl(latestAcceptedTasksPath) : [];
const sourceFamilyRows = latestSourceFamilyBoardPath ? readJsonl(latestSourceFamilyBoardPath) : [];

const blocks = [];

for (const check of sourceChecks) {
  if (!check.importsLoader) blocks.push(`${check.path}_missing_loader_import`);
  if (!check.hasOverlayMarker) blocks.push(`${check.path}_missing_overlay_marker`);
  if (!check.hasOverlayFunction) blocks.push(`${check.path}_missing_overlay_function`);
  if (!check.hasPostRunCall) blocks.push(`${check.path}_missing_post_run_call`);
}

if ((seasonSummary.previousCompletedSatisfiedCount ?? 0) < 12) blocks.push(`season_previous_completed_${seasonSummary.previousCompletedSatisfiedCount}_below_12`);
if ((seasonSummary.previousCompletedVerifiedRowsCount ?? 0) < 200) blocks.push(`season_previous_completed_rows_${seasonSummary.previousCompletedVerifiedRowsCount}_below_200`);
if ((permanentSummary.previousCompletedSatisfiedCount ?? 0) < 12) blocks.push(`permanent_previous_completed_${permanentSummary.previousCompletedSatisfiedCount}_below_12`);
if ((permanentSummary.duePreviousCompletedStandingsCount ?? 9999) > 439) blocks.push(`permanent_due_previous_completed_${permanentSummary.duePreviousCompletedStandingsCount}_above_439`);
if ((prioritizedSummary.standingsExpansionTargetCount ?? 9999) > 432) blocks.push(`prioritized_standings_expansion_${prioritizedSummary.standingsExpansionTargetCount}_above_432`);

if (integrationStatus(season) !== "applied") blocks.push("season_previous_completed_integration_not_applied");
if (integrationStatus(permanent) !== "applied") blocks.push("permanent_previous_completed_integration_not_applied");
if (integrationStatus(prioritized) !== "applied") blocks.push("prioritized_previous_completed_integration_not_applied");

if (permanentDueTasks.some(hasEng1PreviousCompletedTask)) blocks.push("eng1_previous_completed_still_in_permanent_due_tasks");
if (acceptedTasks.some(hasEng1PreviousCompletedTask)) blocks.push("eng1_previous_completed_still_in_prioritized_accepted_tasks");
if (sourceFamilyRows.some(row => JSON.stringify(row).includes("eng.1") && JSON.stringify(row).toLowerCase().includes("previous_completed"))) blocks.push("eng1_previous_completed_still_in_source_family_board");

const output = {
  status: blocks.length ? "blocked" : "passed",
  runner: "previous_completed_proof_lifecycle_loader_patch_verification",
  generatedAtUtc: new Date().toISOString(),
  sourceChecks,
  artifacts: {
    latestSeasonLaneLedgerPath,
    latestPermanentLifecyclePath,
    latestPrioritizedLifecyclePath,
    latestPermanentDueTasksPath,
    latestAcceptedTasksPath,
    latestSourceFamilyBoardPath
  },
  counts: {
    seasonPreviousCompletedSatisfiedCount: seasonSummary.previousCompletedSatisfiedCount ?? null,
    seasonPreviousCompletedVerifiedRowsCount: seasonSummary.previousCompletedVerifiedRowsCount ?? null,
    seasonMissingPreviousCompletedCount: seasonSummary.missingPreviousCompletedCount ?? null,
    permanentPreviousCompletedSatisfiedCount: permanentSummary.previousCompletedSatisfiedCount ?? null,
    permanentDueTaskCount: permanentSummary.permanentDueTaskCount ?? null,
    permanentDuePreviousCompletedStandingsCount: permanentSummary.duePreviousCompletedStandingsCount ?? null,
    prioritizedInputDueTaskCount: prioritizedSummary.inputDueTaskCount ?? null,
    prioritizedAcceptedExecutableTaskCount: prioritizedSummary.acceptedExecutableTaskCount ?? null,
    prioritizedStandingsExpansionTargetCount: prioritizedSummary.standingsExpansionTargetCount ?? null,
    permanentDueTaskRows: permanentDueTasks.length,
    acceptedTaskRows: acceptedTasks.length,
    sourceFamilyRows: sourceFamilyRows.length
  },
  expected: {
    previousCompletedSatisfiedCountAtLeast: 12,
    previousCompletedVerifiedRowsCountAtLeast: 200,
    duePreviousCompletedStandingsCountAtMost: 439,
    standingsExpansionTargetCountAtMost: 432,
    eng1PreviousCompletedTaskSuppressed: true
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
  counts: output.counts,
  expected: output.expected,
  blocks,
  output: OUT,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
}, null, 2));

if (blocks.length) process.exit(1);
