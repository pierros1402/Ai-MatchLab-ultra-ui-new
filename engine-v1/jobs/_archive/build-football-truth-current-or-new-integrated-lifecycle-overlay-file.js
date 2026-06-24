import fs from "fs";
import path from "path";
import { loadCurrentOrNewDiagnosticState } from "../lib/football-truth-current-or-new-diagnostic-state-loader.js";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = `data/football-truth/_diagnostics/current-or-new-integrated-lifecycle-overlay-${DATE}`;
const OUT = `${OUT_DIR}/current-or-new-integrated-lifecycle-overlay-${DATE}.json`;

function abs(p) {
  return path.join(ROOT, p);
}

function writeJson(p, v) {
  fs.mkdirSync(path.dirname(abs(p)), { recursive: true });
  fs.writeFileSync(abs(p), JSON.stringify(v, null, 2) + "\n");
}

function readJsonIfExists(p) {
  if (!p || !fs.existsSync(abs(p))) return null;
  return JSON.parse(fs.readFileSync(abs(p), "utf8"));
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

function latestDiagnostic(fragment) {
  const files = walk("data/football-truth/_diagnostics", p => p.endsWith(".json") && p.toLowerCase().includes(fragment.toLowerCase()));
  if (!files.length) return null;
  return files.map(p => ({ p, mtimeMs: fs.statSync(abs(p)).mtimeMs })).sort((a, b) => b.mtimeMs - a.mtimeMs)[0].p;
}

function pick(obj, keys) {
  const out = {};
  for (const key of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, key)) out[key] = obj[key];
  }
  return out;
}

const currentState = loadCurrentOrNewDiagnosticState({ root: ROOT, knownOutsideState: ["geo.1"] });

const latestSeasonLaneLedgerPath = latestDiagnostic("season-lane-coverage-ledger");
const latestPermanentLifecyclePath = latestDiagnostic("permanent-season-lifecycle");
const latestPrioritizedLifecyclePath = latestDiagnostic("prioritized-lifecycle");

const latestSeasonLaneLedger = readJsonIfExists(latestSeasonLaneLedgerPath);
const latestPermanentLifecycle = readJsonIfExists(latestPermanentLifecyclePath);
const latestPrioritizedLifecycle = readJsonIfExists(latestPrioritizedLifecyclePath);

const seasonLedgerSummary = latestSeasonLaneLedger?.summary ?? latestSeasonLaneLedger ?? {};
const permanentSummary = latestPermanentLifecycle?.summary ?? latestPermanentLifecycle ?? {};
const prioritizedSummary = latestPrioritizedLifecycle?.summary ?? latestPrioritizedLifecycle ?? {};

const existingLedgerCurrentOrNewCount =
  seasonLedgerSummary.currentOrNewSeasonSatisfiedCount ??
  seasonLedgerSummary.currentOrNewSatisfiedCount ??
  null;

const overlayCurrentOrNewSatisfiedCount = currentState.projectedKnownCurrentOrNewSlugCount;

const integratedSeasonLaneSummary = {
  ...pick(seasonLedgerSummary, [
    "routeConfiguredLeagueSlugCount",
    "previousCompletedSatisfiedCount",
    "previousCompletedVerifiedRowsCount",
    "nextSeasonStartDateSatisfiedCount",
    "missingPreviousCompletedCount",
    "missingNextSeasonStartDateCount",
    "startDateEvidenceTargetCount"
  ]),
  currentOrNewSeasonSatisfiedCount: overlayCurrentOrNewSatisfiedCount,
  currentOrNewDiagnosticStateSatisfiedCount: currentState.materializedDiagnosticCurrentOrNewSlugCount,
  currentOrNewDiagnosticStateVerifiedRowsCount: currentState.materializedDiagnosticCurrentOrNewRowCount,
  currentOrNewKnownOutsideDiagnosticStateSatisfiedCount: currentState.knownExistingCurrentOrNewOutsideThisState.length,
  currentOrNewProjectedKnownSlugs: currentState.projectedKnownCurrentOrNewSlugs
};

const integratedPermanentLifecycleSummary = {
  ...pick(permanentSummary, [
    "previousCompletedSatisfiedCount",
    "nextSeasonStartDateSatisfiedCount",
    "permanentDueTaskCount",
    "duePreviousCompletedStandingsCount",
    "dueNextSeasonStartDateCount"
  ]),
  currentOrNewSeasonSatisfiedCount: overlayCurrentOrNewSatisfiedCount,
  currentOrNewDiagnosticStateSatisfiedCount: currentState.materializedDiagnosticCurrentOrNewSlugCount
};

const output = {
  status: currentState.validationStatus === "passed" ? "passed" : "blocked",
  runner: "current_or_new_integrated_lifecycle_overlay",
  generatedAtUtc: new Date().toISOString(),
  purpose: "central reusable loader and lifecycle overlay for diagnostic current_or_new standings state; no canonical/truth/production write",
  loaderModule: "engine-v1/lib/football-truth-current-or-new-diagnostic-state-loader.js",
  currentState: {
    stateDir: currentState.stateDir,
    stateRowsFiles: currentState.stateRowsFiles,
    materializedDiagnosticCurrentOrNewSlugCount: currentState.materializedDiagnosticCurrentOrNewSlugCount,
    materializedDiagnosticCurrentOrNewRowCount: currentState.materializedDiagnosticCurrentOrNewRowCount,
    materializedDiagnosticCurrentOrNewSlugs: currentState.materializedDiagnosticCurrentOrNewSlugs,
    knownExistingCurrentOrNewOutsideThisState: currentState.knownExistingCurrentOrNewOutsideThisState,
    projectedKnownCurrentOrNewSlugCount: currentState.projectedKnownCurrentOrNewSlugCount,
    projectedKnownCurrentOrNewSlugs: currentState.projectedKnownCurrentOrNewSlugs,
    groupSummaries: currentState.groupSummaries,
    validationStatus: currentState.validationStatus,
    blocks: currentState.blocks
  },
  lifecycleInputs: {
    latestSeasonLaneLedgerPath,
    latestPermanentLifecyclePath,
    latestPrioritizedLifecyclePath,
    existingLedgerCurrentOrNewCount,
    seasonLedgerSummary: pick(seasonLedgerSummary, [
      "routeConfiguredLeagueSlugCount",
      "previousCompletedSatisfiedCount",
      "previousCompletedVerifiedRowsCount",
      "currentOrNewSeasonSatisfiedCount",
      "currentOrNewSatisfiedCount",
      "nextSeasonStartDateSatisfiedCount",
      "missingPreviousCompletedCount",
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
      "dueNextSeasonStartDateCount"
    ]),
    prioritizedSummary: pick(prioritizedSummary, [
      "inputDueTaskCount",
      "acceptedExecutableTaskCount",
      "standingsExpansionTargetCount",
      "currentOrNewSeasonTargetCount",
      "startDateEvidenceTargetCount"
    ])
  },
  integratedOverlay: {
    integratedSeasonLaneSummary,
    integratedPermanentLifecycleSummary,
    lifecycleIntegrationMode: "diagnostic_overlay_pending_core_job_patch",
    exactCorePatchRequirement: [
      "Import loadCurrentOrNewDiagnosticState from engine-v1/lib/football-truth-current-or-new-diagnostic-state-loader.js",
      "Season-lane ledger must set currentOrNewSeasonSatisfiedCount from loader.projectedKnownCurrentOrNewSlugCount",
      "Permanent lifecycle planner must treat loader.projectedKnownCurrentOrNewSlugs as satisfied current_or_new standings",
      "Prioritized lifecycle board must stop scheduling current_or_new tasks for those slugs"
    ]
  },
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
  recommendedNextLane: {
    lane: "patch_core_lifecycle_jobs_to_use_current_or_new_loader",
    expectedResult: `core lifecycle currentOrNewSeasonSatisfiedCount becomes at least ${overlayCurrentOrNewSatisfiedCount}`,
    safePatchBase: "loader module now exists and overlay proves exact expected counts"
  },
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
  loaderModule: output.loaderModule,
  currentState: {
    materializedDiagnosticCurrentOrNewSlugCount: output.currentState.materializedDiagnosticCurrentOrNewSlugCount,
    materializedDiagnosticCurrentOrNewRowCount: output.currentState.materializedDiagnosticCurrentOrNewRowCount,
    materializedDiagnosticCurrentOrNewSlugs: output.currentState.materializedDiagnosticCurrentOrNewSlugs,
    projectedKnownCurrentOrNewSlugCount: output.currentState.projectedKnownCurrentOrNewSlugCount,
    projectedKnownCurrentOrNewSlugs: output.currentState.projectedKnownCurrentOrNewSlugs
  },
  lifecycleInputs: output.lifecycleInputs,
  integratedOverlay: output.integratedOverlay,
  blockersStillOpen: output.blockersStillOpen,
  recommendedNextLane: output.recommendedNextLane,
  output: OUT,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
}, null, 2));

if (output.status !== "passed") process.exit(1);
