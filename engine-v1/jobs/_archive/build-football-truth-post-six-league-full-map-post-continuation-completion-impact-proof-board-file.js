import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const latestVerificationPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-post-continuation-completion-next-planning-execution-verification-2026-06-15",
  "post-six-league-full-map-post-continuation-completion-next-planning-execution-verification-2026-06-15.json"
);

const latestRunnerPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-post-continuation-completion-next-planning-execution-runner-2026-06-15",
  "post-six-league-full-map-post-continuation-completion-next-planning-execution-runner-2026-06-15.json"
);

const latestApprovalPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-post-continuation-completion-next-planning-execution-approval-gate-2026-06-15",
  "post-six-league-full-map-post-continuation-completion-next-planning-execution-approval-gate-2026-06-15.json"
);

const diagnosticsRoot = path.join("data", "football-truth", "_diagnostics");

const outDir = path.join(
  diagnosticsRoot,
  "post-six-league-full-map-post-continuation-completion-impact-proof-board-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-post-continuation-completion-impact-proof-board-2026-06-15.json"
);

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing required input file: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function maybeReadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function walkJsonFiles(dir, limit = 2000) {
  const out = [];
  if (!fs.existsSync(dir)) return out;

  const stack = [dir];

  while (stack.length > 0 && out.length < limit) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        out.push(full);
        if (out.length >= limit) break;
      }
    }
  }

  return out;
}

function safeSummary(input) {
  return input && typeof input === "object" && input.summary && typeof input.summary === "object"
    ? input.summary
    : {};
}

function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function countWhere(rows, predicate) {
  return rows.filter(predicate).length;
}

function assertZero(value, name) {
  if (value !== undefined && value !== null && value !== 0) {
    throw new Error(`Expected ${name}=0, got ${value}`);
  }
}

function assertFalse(value, name) {
  if (value !== undefined && value !== null && value !== false) {
    throw new Error(`Expected ${name}=false, got ${value}`);
  }
}

const latestVerification = readJson(latestVerificationPath);
const latestRunner = readJson(latestRunnerPath);
const latestApproval = readJson(latestApprovalPath);

const latestVerificationSummary = safeSummary(latestVerification);
const latestRunnerSummary = safeSummary(latestRunner);
const latestApprovalSummary = safeSummary(latestApproval);

if (latestVerificationSummary.verifiedPostContinuationCompletionNextPlanningExecutionRowCount !== 5) {
  throw new Error("Expected latest verified post-continuation-completion next-planning execution row count 5");
}

if (latestVerificationSummary.blockedPostContinuationCompletionNextPlanningExecutionVerificationCount !== 0) {
  throw new Error("Expected latest blocked execution verification count 0");
}

[
  "fetchExecutedNowCount",
  "searchExecutedNowCount",
  "broadSearchExecutedNowCount",
  "classifierExecutedNowCount",
  "canonicalWriteExecutedNowCount",
  "productionWriteExecutedNowCount",
  "truthAssertionExecutedNowCount",
  "canonicalWrites"
].forEach((key) => assertZero(latestVerificationSummary[key], `latestVerification.summary.${key}`));

assertFalse(latestVerification.productionWrite, "latestVerification.productionWrite");
assertFalse(latestVerification.sourceFetch?.executed, "latestVerification.sourceFetch.executed");
assertFalse(latestVerification.searchProviderUsed, "latestVerification.searchProviderUsed");
assertFalse(latestVerification.broadSearchUsed, "latestVerification.broadSearchUsed");
assertFalse(latestVerification.classifierExecuted, "latestVerification.classifierExecuted");

const diagnosticFiles = walkJsonFiles(diagnosticsRoot);
const diagnosticScanRows = [];

for (const filePath of diagnosticFiles) {
  let parsed = null;
  try {
    parsed = maybeReadJson(filePath);
  } catch {
    continue;
  }

  const s = safeSummary(parsed);
  const relativePath = filePath.replaceAll("\\", "/");

  const row = {
    path: relativePath,
    job: parsed?.job || null,
    mode: parsed?.mode || null,
    canonicalWrites: numberValue(parsed?.canonicalWrites ?? s.canonicalWrites),
    productionWrite: parsed?.productionWrite === true || s.productionWrite === true,
    fetchExecutedNowCount: numberValue(s.fetchExecutedNowCount),
    searchExecutedNowCount: numberValue(s.searchExecutedNowCount),
    broadSearchExecutedNowCount: numberValue(s.broadSearchExecutedNowCount),
    classifierExecutedNowCount: numberValue(s.classifierExecutedNowCount),
    canonicalWriteExecutedNowCount: numberValue(s.canonicalWriteExecutedNowCount),
    productionWriteExecutedNowCount: numberValue(s.productionWriteExecutedNowCount),
    truthAssertionExecutedNowCount: numberValue(s.truthAssertionExecutedNowCount)
  };

  row.hasAnyRealSideEffectSignal =
    row.fetchExecutedNowCount > 0 ||
    row.searchExecutedNowCount > 0 ||
    row.broadSearchExecutedNowCount > 0 ||
    row.classifierExecutedNowCount > 0 ||
    row.canonicalWriteExecutedNowCount > 0 ||
    row.productionWriteExecutedNowCount > 0 ||
    row.truthAssertionExecutedNowCount > 0 ||
    row.canonicalWrites > 0 ||
    row.productionWrite === true;

  diagnosticScanRows.push(row);
}

const latestChainRealSideEffectCount =
  numberValue(latestVerificationSummary.fetchExecutedNowCount) +
  numberValue(latestVerificationSummary.searchExecutedNowCount) +
  numberValue(latestVerificationSummary.broadSearchExecutedNowCount) +
  numberValue(latestVerificationSummary.classifierExecutedNowCount) +
  numberValue(latestVerificationSummary.canonicalWriteExecutedNowCount) +
  numberValue(latestVerificationSummary.productionWriteExecutedNowCount) +
  numberValue(latestVerificationSummary.truthAssertionExecutedNowCount) +
  numberValue(latestVerificationSummary.canonicalWrites);

const historicalRealSideEffectRows = diagnosticScanRows.filter((row) => row.hasAnyRealSideEffectSignal);

const pipelineValueRows = [
  {
    proofArea: "orchestration_integrity",
    status: "proven",
    evidence: "5/5 post-continuation-completion next-planning execution rows verified",
    metricName: "verifiedPostContinuationCompletionNextPlanningExecutionRowCount",
    metricValue: latestVerificationSummary.verifiedPostContinuationCompletionNextPlanningExecutionRowCount
  },
  {
    proofArea: "guardrail_integrity",
    status: "proven",
    evidence: "latest verification has zero fetch/search/broadSearch/classifier/write/truth side effects",
    metricName: "latestChainRealSideEffectCount",
    metricValue: latestChainRealSideEffectCount
  },
  {
    proofArea: "lane_structure",
    status: "proven",
    evidence: "4 main-lane rows and 1 repair-backlog row verified",
    metricName: "main_plus_repair_verified_rows",
    metricValue:
      numberValue(latestVerificationSummary.verifiedMainLanePostContinuationCompletionNextPlanningExecutionCount) +
      numberValue(latestVerificationSummary.verifiedRepairBacklogPostContinuationCompletionNextPlanningExecutionCount)
  },
  {
    proofArea: "explicit_execution_control",
    status: latestRunnerSummary.allowExecuteFlagPresent === true ? "proven" : "blocked",
    evidence: "latest execution runner required explicit --allow-execute",
    metricName: "allowExecuteFlagPresent",
    metricValue: latestRunnerSummary.allowExecuteFlagPresent === true ? 1 : 0
  },
  {
    proofArea: "next_runner_side_effect_permissions",
    status:
      latestApprovalSummary.nextRunnerMayFetchCount === 0 &&
      latestApprovalSummary.nextRunnerMaySearchCount === 0 &&
      latestApprovalSummary.nextRunnerMayBroadSearchCount === 0 &&
      latestApprovalSummary.nextRunnerMayClassifyCount === 0 &&
      latestApprovalSummary.nextRunnerMayWriteCanonicalCount === 0 &&
      latestApprovalSummary.nextRunnerMayWriteProductionCount === 0 &&
      latestApprovalSummary.nextRunnerMayAssertTruthCount === 0
        ? "proven"
        : "blocked",
    evidence: "approval gate allowed diagnostics-only execution but did not allow fetch/search/classify/write/truth",
    metricName: "forbidden_next_runner_permissions",
    metricValue:
      numberValue(latestApprovalSummary.nextRunnerMayFetchCount) +
      numberValue(latestApprovalSummary.nextRunnerMaySearchCount) +
      numberValue(latestApprovalSummary.nextRunnerMayBroadSearchCount) +
      numberValue(latestApprovalSummary.nextRunnerMayClassifyCount) +
      numberValue(latestApprovalSummary.nextRunnerMayWriteCanonicalCount) +
      numberValue(latestApprovalSummary.nextRunnerMayWriteProductionCount) +
      numberValue(latestApprovalSummary.nextRunnerMayAssertTruthCount)
  }
];

const realCoverageImpactRows = [
  {
    impactArea: "new_real_league_fetch_from_latest_chain",
    status: "not_started_in_latest_chain",
    evidence: "latest verified chain has fetchExecutedNowCount=0",
    metricName: "fetchExecutedNowCount",
    metricValue: numberValue(latestVerificationSummary.fetchExecutedNowCount)
  },
  {
    impactArea: "new_real_search_discovery_from_latest_chain",
    status: "not_started_in_latest_chain",
    evidence: "latest verified chain has searchExecutedNowCount=0 and broadSearchExecutedNowCount=0",
    metricName: "search_plus_broad_search_executed_now",
    metricValue:
      numberValue(latestVerificationSummary.searchExecutedNowCount) +
      numberValue(latestVerificationSummary.broadSearchExecutedNowCount)
  },
  {
    impactArea: "new_classification_from_latest_chain",
    status: "not_started_in_latest_chain",
    evidence: "latest verified chain has classifierExecutedNowCount=0",
    metricName: "classifierExecutedNowCount",
    metricValue: numberValue(latestVerificationSummary.classifierExecutedNowCount)
  },
  {
    impactArea: "new_canonical_updates_from_latest_chain",
    status: "not_started_in_latest_chain",
    evidence: "latest verified chain has canonicalWrites=0 and canonicalWriteExecutedNowCount=0",
    metricName: "canonical_write_signal",
    metricValue:
      numberValue(latestVerificationSummary.canonicalWrites) +
      numberValue(latestVerificationSummary.canonicalWriteExecutedNowCount)
  },
  {
    impactArea: "trusted_truth_assertions_from_latest_chain",
    status: "not_started_in_latest_chain",
    evidence: "latest verified chain has truthAssertionExecutedNowCount=0",
    metricName: "truthAssertionExecutedNowCount",
    metricValue: numberValue(latestVerificationSummary.truthAssertionExecutedNowCount)
  }
];

const nextDecisionRows = [
  {
    decisionId: "impact_board_decision_01",
    decision: "stop_blind_diagnostics_looping",
    status: "required",
    reason: "the latest chain is verified, but real coverage impact remains zero in the latest chain"
  },
  {
    decisionId: "impact_board_decision_02",
    decision: "move_to_controlled_real_acquisition_proof_lane",
    status: "recommended_next",
    reason: "real value will be visible only after controlled fetch/search/evidence/classification produces accepted evidence"
  },
  {
    decisionId: "impact_board_decision_03",
    decision: "keep_canonical_writes_blocked_until_evidence_acceptance",
    status: "required",
    reason: "canonical writes should only follow trusted evidence acceptance and explicit write approval"
  }
];

const summary = {
  postSixLeagueFullMapPostContinuationCompletionImpactProofBoardReadCount: 3,
  scannedDiagnosticJsonFileCount: diagnosticScanRows.length,

  pipelineValueProofRowCount: pipelineValueRows.length,
  provenPipelineValueProofRowCount: countWhere(pipelineValueRows, (row) => row.status === "proven"),
  blockedPipelineValueProofRowCount: countWhere(pipelineValueRows, (row) => row.status === "blocked"),

  realCoverageImpactRowCount: realCoverageImpactRows.length,
  latestChainRealCoverageImpactStartedCount: countWhere(
    realCoverageImpactRows,
    (row) => row.metricValue > 0
  ),
  latestChainRealCoverageImpactNotStartedCount: countWhere(
    realCoverageImpactRows,
    (row) => row.metricValue === 0
  ),

  latestVerifiedPostContinuationCompletionNextPlanningExecutionRowCount:
    latestVerificationSummary.verifiedPostContinuationCompletionNextPlanningExecutionRowCount,

  latestBlockedPostContinuationCompletionNextPlanningExecutionVerificationCount:
    latestVerificationSummary.blockedPostContinuationCompletionNextPlanningExecutionVerificationCount,

  latestDiagnosticsOnlyPostContinuationCompletionNextPlanningExecutionVerifiedCount:
    latestVerificationSummary.diagnosticsOnlyPostContinuationCompletionNextPlanningExecutionVerifiedCount,

  latestMainLaneVerifiedCount:
    latestVerificationSummary.verifiedMainLanePostContinuationCompletionNextPlanningExecutionCount,

  latestRepairBacklogVerifiedCount:
    latestVerificationSummary.verifiedRepairBacklogPostContinuationCompletionNextPlanningExecutionCount,

  latestSportomediaRepairVerifiedCount:
    latestVerificationSummary.verifiedSportomediaRepairPostContinuationCompletionNextPlanningExecutionCount,

  latestChainFetchExecutedNowCount: numberValue(latestVerificationSummary.fetchExecutedNowCount),
  latestChainSearchExecutedNowCount: numberValue(latestVerificationSummary.searchExecutedNowCount),
  latestChainBroadSearchExecutedNowCount: numberValue(latestVerificationSummary.broadSearchExecutedNowCount),
  latestChainClassifierExecutedNowCount: numberValue(latestVerificationSummary.classifierExecutedNowCount),
  latestChainCanonicalWriteExecutedNowCount: numberValue(latestVerificationSummary.canonicalWriteExecutedNowCount),
  latestChainProductionWriteExecutedNowCount: numberValue(latestVerificationSummary.productionWriteExecutedNowCount),
  latestChainTruthAssertionExecutedNowCount: numberValue(latestVerificationSummary.truthAssertionExecutedNowCount),
  latestChainCanonicalWrites: numberValue(latestVerificationSummary.canonicalWrites),
  latestChainRealSideEffectCount,

  historicalDiagnosticRowsWithAnyRealSideEffectSignalCount: historicalRealSideEffectRows.length,
  historicalCanonicalWriteSignalCount: countWhere(historicalRealSideEffectRows, (row) => row.canonicalWrites > 0 || row.canonicalWriteExecutedNowCount > 0),
  historicalFetchOrSearchSignalCount: countWhere(historicalRealSideEffectRows, (row) => row.fetchExecutedNowCount > 0 || row.searchExecutedNowCount > 0 || row.broadSearchExecutedNowCount > 0),

  impactVerdictPipelineHasPaidOffAsControlSystemCount: 1,
  impactVerdictLatestChainHasProducedNewRealCoverageCount: latestChainRealSideEffectCount > 0 ? 1 : 0,
  impactVerdictMustMoveToControlledRealAcquisitionCount: latestChainRealSideEffectCount === 0 ? 1 : 0,

  mayBuildControlledRealAcquisitionProofLanePlanCount: 1,

  fetchExecutedNowCount: 0,
  searchExecutedNowCount: 0,
  broadSearchExecutedNowCount: 0,
  classifierExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  canonicalWrites: 0,
  productionWrite: false
};

const artifact = {
  job: "build-football-truth-post-six-league-full-map-post-continuation-completion-impact-proof-board-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_continuation_completion_impact_proof_board",
  dryRun: true,
  inputs: {
    latestPostContinuationCompletionNextPlanningExecutionVerification: latestVerificationPath,
    latestPostContinuationCompletionNextPlanningExecutionRunner: latestRunnerPath,
    latestPostContinuationCompletionNextPlanningExecutionApprovalGate: latestApprovalPath,
    diagnosticsRoot
  },
  policy: {
    impactProofBoardOnly: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true,
    nextStepShouldProveRealValueWithControlledAcquisitionNotMoreBlindDiagnostics: true
  },
  verdict: {
    hasTheWorkPaidOffAsPipeline: true,
    hasTheLatestChainProducedNewRealCoverage: latestChainRealSideEffectCount > 0,
    why: latestChainRealSideEffectCount > 0
      ? "latest verified chain contains real side-effect signals"
      : "latest verified chain is diagnostics-only; it proves safety and orchestration, not new football coverage",
    recommendedNextLane: "controlled_real_acquisition_proof_lane_plan",
    recommendedNextGoal: "produce accepted evidence for a small controlled target set, then measure standings/season-state/canonical delta impact"
  },
  summary,
  pipelineValueRows,
  realCoverageImpactRows,
  nextDecisionRows,
  historicalRealSideEffectRows: historicalRealSideEffectRows.slice(0, 50),
  sourceFetch: { allowed: false, executed: false },
  searchProviderUsed: false,
  broadSearchUsed: false,
  classifierExecuted: false,
  canonicalWrites: 0,
  productionWrite: false
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

console.log(JSON.stringify({ output: outputPath, ...summary }, null, 2));
