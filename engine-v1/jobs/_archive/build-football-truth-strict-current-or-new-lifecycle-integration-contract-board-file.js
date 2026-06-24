import fs from "fs";
import path from "path";
import crypto from "crypto";
import { loadCurrentOrNewDiagnosticState } from "../lib/football-truth-current-or-new-diagnostic-state-loader.js";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = `data/football-truth/_diagnostics/strict-current-or-new-lifecycle-integration-contract-board-${DATE}`;
const OUT = `${OUT_DIR}/strict-current-or-new-lifecycle-integration-contract-board-${DATE}.json`;
const CONTRACT_OUT = "engine-v1/config/football-truth-current-or-new-lifecycle-integration-contract.json";

const CORE_JOBS = [
  {
    role: "season_lane_coverage_ledger",
    path: "engine-v1/jobs/build-football-truth-season-lane-coverage-ledger-file.js",
    requiredPatch: "load current_or_new diagnostic state and expose currentOrNewSeasonSatisfiedCount/currentOrNewDiagnosticStateVerifiedRowsCount"
  },
  {
    role: "permanent_season_lifecycle_plan",
    path: "engine-v1/jobs/build-football-truth-permanent-season-lifecycle-plan-file.js",
    requiredPatch: "treat current_or_new projectedKnownCurrentOrNewSlugs as satisfied current_or_new standings"
  },
  {
    role: "prioritized_lifecycle_execution_board",
    path: "engine-v1/jobs/build-football-truth-prioritized-lifecycle-execution-board-file.js",
    requiredPatch: "suppress current_or_new acquisition tasks for projectedKnownCurrentOrNewSlugs"
  }
];

function abs(p) {
  return path.join(ROOT, p);
}

function readTextIfExists(p) {
  if (!fs.existsSync(abs(p))) return null;
  return fs.readFileSync(abs(p), "utf8");
}

function readJsonIfExists(p) {
  if (!p || !fs.existsSync(abs(p))) return null;
  return JSON.parse(fs.readFileSync(abs(p), "utf8"));
}

function writeJson(p, v) {
  fs.mkdirSync(path.dirname(abs(p)), { recursive: true });
  fs.writeFileSync(abs(p), JSON.stringify(v, null, 2) + "\n");
}

function sha256Text(text) {
  return crypto.createHash("sha256").update(String(text ?? "")).digest("hex");
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

function latestExactDiagnostic(fileNameRegex) {
  const files = walk("data/football-truth/_diagnostics", p => fileNameRegex.test(path.basename(p)));
  if (!files.length) return null;
  return files
    .map(p => ({ p, mtimeMs: fs.statSync(abs(p)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0].p;
}

function pick(obj, keys) {
  const out = {};
  for (const key of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, key)) out[key] = obj[key];
  }
  return out;
}

const currentState = loadCurrentOrNewDiagnosticState({ root: ROOT, knownOutsideState: ["geo.1"] });

const strictArtifacts = {
  latestSeasonLaneLedgerPath: latestExactDiagnostic(/^season-lane-coverage-ledger-\d{4}-\d{2}-\d{2}\.json$/),
  latestPermanentLifecyclePath: latestExactDiagnostic(/^permanent-season-lifecycle-plan-\d{4}-\d{2}-\d{2}\.json$/),
  latestPrioritizedLifecyclePath: latestExactDiagnostic(/^prioritized-lifecycle-execution-board-\d{4}-\d{2}-\d{2}\.json$/),
  latestCurrentOrNewCoverageBoardPath: latestExactDiagnostic(/^current-or-new-diagnostic-state-coverage-board-\d{4}-\d{2}-\d{2}\.json$/),
  latestCurrentOrNewOverlayPath: latestExactDiagnostic(/^current-or-new-integrated-lifecycle-overlay-\d{4}-\d{2}-\d{2}\.json$/)
};

const seasonLedger = readJsonIfExists(strictArtifacts.latestSeasonLaneLedgerPath);
const permanentLifecycle = readJsonIfExists(strictArtifacts.latestPermanentLifecyclePath);
const prioritizedLifecycle = readJsonIfExists(strictArtifacts.latestPrioritizedLifecyclePath);

const seasonSummary = seasonLedger?.summary ?? seasonLedger ?? {};
const permanentSummary = permanentLifecycle?.summary ?? permanentLifecycle ?? {};
const prioritizedSummary = prioritizedLifecycle?.summary ?? prioritizedLifecycle ?? {};

const coreJobStatus = CORE_JOBS.map(job => {
  const text = readTextIfExists(job.path);
  return {
    ...job,
    exists: text !== null,
    fileSha256: text ? sha256Text(text) : null,
    importsCurrentOrNewLoader: text ? text.includes("football-truth-current-or-new-diagnostic-state-loader") : false,
    mentionsCurrentOrNewSeasonSatisfiedCount: text ? text.includes("currentOrNewSeasonSatisfiedCount") : false,
    mentionsCurrentOrNewSatisfiedCount: text ? text.includes("currentOrNewSatisfiedCount") : false,
    mentionsCurrentOrNewTasks: text ? /current[_-]?or[_-]?new/i.test(text) : false,
    sizeBytes: text ? Buffer.byteLength(text) : 0,
    patchReadiness: text === null
      ? "blocked_missing_core_job"
      : text.includes("football-truth-current-or-new-diagnostic-state-loader")
        ? "already_imports_loader"
        : "ready_for_guarded_patch"
  };
});

const blocks = [];
if (currentState.validationStatus !== "passed") blocks.push("current_or_new_diagnostic_state_validation_failed");
if (currentState.projectedKnownCurrentOrNewSlugCount < 9) blocks.push(`projected_current_or_new_count_${currentState.projectedKnownCurrentOrNewSlugCount}_below_9`);
for (const job of coreJobStatus) {
  if (!job.exists) blocks.push(`${job.role}_core_job_missing_${job.path}`);
}

const existingLedgerCurrentOrNewCount =
  seasonSummary.currentOrNewSeasonSatisfiedCount ??
  seasonSummary.currentOrNewSatisfiedCount ??
  permanentSummary.currentOrNewSeasonSatisfiedCount ??
  permanentSummary.currentOrNewSatisfiedCount ??
  null;

const patchTargets = coreJobStatus.filter(job => job.patchReadiness === "ready_for_guarded_patch").map(job => job.path);

const contract = {
  contractVersion: 1,
  generatedAtUtc: new Date().toISOString(),
  loaderModule: "engine-v1/lib/football-truth-current-or-new-diagnostic-state-loader.js",
  currentOrNewDiagnosticState: {
    materializedDiagnosticCurrentOrNewSlugCount: currentState.materializedDiagnosticCurrentOrNewSlugCount,
    materializedDiagnosticCurrentOrNewRowCount: currentState.materializedDiagnosticCurrentOrNewRowCount,
    materializedDiagnosticCurrentOrNewSlugs: currentState.materializedDiagnosticCurrentOrNewSlugs,
    projectedKnownCurrentOrNewSlugCount: currentState.projectedKnownCurrentOrNewSlugCount,
    projectedKnownCurrentOrNewSlugs: currentState.projectedKnownCurrentOrNewSlugs
  },
  corePatchRequirements: [
    {
      jobRole: "season_lane_coverage_ledger",
      summaryFieldsRequired: {
        currentOrNewSeasonSatisfiedCount: currentState.projectedKnownCurrentOrNewSlugCount,
        currentOrNewDiagnosticStateSatisfiedCount: currentState.materializedDiagnosticCurrentOrNewSlugCount,
        currentOrNewDiagnosticStateVerifiedRowsCount: currentState.materializedDiagnosticCurrentOrNewRowCount,
        currentOrNewProjectedKnownSlugs: currentState.projectedKnownCurrentOrNewSlugs
      }
    },
    {
      jobRole: "permanent_season_lifecycle_plan",
      summaryFieldsRequired: {
        currentOrNewSeasonSatisfiedCount: currentState.projectedKnownCurrentOrNewSlugCount,
        currentOrNewDiagnosticStateSatisfiedCount: currentState.materializedDiagnosticCurrentOrNewSlugCount
      }
    },
    {
      jobRole: "prioritized_lifecycle_execution_board",
      taskSuppressionRequiredForSlugs: currentState.projectedKnownCurrentOrNewSlugs,
      note: "do not schedule current_or_new acquisition for diagnostic-state satisfied slugs"
    }
  ],
  blockersStillOpen: [
    {
      competitionSlug: "nor.2",
      status: "blocked",
      reason: "Åsane points arithmetic failed; likely deduction but governed evidence missing"
    },
    {
      competitionSlug: "cyp.2",
      status: "blocked",
      reason: "adult Β΄ Κατηγορίας route has phase/carryover points that fail plain 3W+D; youth false positives rejected"
    }
  ],
  policy: {
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0
  }
};

writeJson(CONTRACT_OUT, contract);

const output = {
  status: blocks.length ? "blocked" : "passed_ready_for_guarded_core_patch",
  runner: "strict_current_or_new_lifecycle_integration_contract_board",
  generatedAtUtc: new Date().toISOString(),
  strictArtifacts,
  contractOutput: CONTRACT_OUT,
  currentState: {
    materializedDiagnosticCurrentOrNewSlugCount: currentState.materializedDiagnosticCurrentOrNewSlugCount,
    materializedDiagnosticCurrentOrNewRowCount: currentState.materializedDiagnosticCurrentOrNewRowCount,
    materializedDiagnosticCurrentOrNewSlugs: currentState.materializedDiagnosticCurrentOrNewSlugs,
    projectedKnownCurrentOrNewSlugCount: currentState.projectedKnownCurrentOrNewSlugCount,
    projectedKnownCurrentOrNewSlugs: currentState.projectedKnownCurrentOrNewSlugs,
    validationStatus: currentState.validationStatus,
    blocks: currentState.blocks
  },
  lifecycleInputSummaries: {
    existingLedgerCurrentOrNewCount,
    seasonSummary: pick(seasonSummary, [
      "routeConfiguredLeagueSlugCount",
      "previousCompletedSatisfiedCount",
      "previousCompletedVerifiedRowsCount",
      "currentOrNewSeasonSatisfiedCount",
      "currentOrNewSatisfiedCount",
      "nextSeasonStartDateSatisfiedCount",
      "missingPreviousCompletedCount",
      "missingCurrentOrNewSeasonCount",
      "missingNextSeasonStartDateCount",
      "startDateEvidenceTargetCount"
    ]),
    permanentSummary: pick(permanentSummary, [
      "previousCompletedSatisfiedCount",
      "currentOrNewSeasonSatisfiedCount",
      "currentOrNewSatisfiedCount",
      "nextSeasonStartDateSatisfiedCount",
      "permanentDueTaskCount",
      "duePreviousCompletedStandingsCount",
      "dueCurrentOrNewSeasonStandingsCount",
      "dueNextSeasonStartDateCount"
    ]),
    prioritizedSummary: pick(prioritizedSummary, [
      "inputDueTaskCount",
      "acceptedExecutableTaskCount",
      "standingsExpansionTargetCount",
      "currentOrNewSeasonTargetCount",
      "startDateEvidenceTargetCount",
      "highValueAcceptedTaskCount",
      "uefaLikeAcceptedTaskCount"
    ])
  },
  coreJobStatus,
  patchPlan: {
    readyPatchCount: patchTargets.length,
    patchTargets,
    blockedPatchCount: coreJobStatus.filter(job => job.patchReadiness === "blocked_missing_core_job").length,
    alreadyImportsLoaderCount: coreJobStatus.filter(job => job.patchReadiness === "already_imports_loader").length,
    nextLane: patchTargets.length
      ? "apply_guarded_core_lifecycle_patch_to_ready_targets"
      : "inspect_missing_or_already_patched_core_lifecycle_jobs",
    expectedResult: `core lifecycle currentOrNewSeasonSatisfiedCount should become at least ${currentState.projectedKnownCurrentOrNewSlugCount}`
  },
  blocks,
  warnings: strictArtifacts.latestSeasonLaneLedgerPath ? [] : ["strict_season_lane_ledger_artifact_not_found"],
  policy: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    browserExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    stateLaneWriteExecutedNowCount: 0
  },
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
};

writeJson(OUT, output);

console.log(JSON.stringify({
  status: output.status,
  strictArtifacts,
  contractOutput: CONTRACT_OUT,
  currentState: output.currentState,
  lifecycleInputSummaries: output.lifecycleInputSummaries,
  coreJobStatus,
  patchPlan: output.patchPlan,
  blocks,
  warnings: output.warnings,
  output: OUT,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
}, null, 2));

if (output.status !== "passed_ready_for_guarded_core_patch") process.exit(1);
