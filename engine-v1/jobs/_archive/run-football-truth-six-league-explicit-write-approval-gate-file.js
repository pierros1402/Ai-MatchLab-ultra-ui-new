import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const previewPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "six-league-controlled-promotion-preview-runner-2026-06-15",
  "six-league-controlled-promotion-preview-runner-2026-06-15.json"
);

const candidatePlanPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "six-league-controlled-promotion-candidate-plan-2026-06-15",
  "six-league-controlled-promotion-candidate-plan-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "six-league-explicit-write-approval-gate-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "six-league-explicit-write-approval-gate-2026-06-15.json"
);

const expectedCounts = {
  promotionPreviewRowCount: 18,
  competitionPromotionPreviewRowCount: 6,
  familyPromotionPreviewRowCount: 3,
  laligaPromotionPreviewCount: 2,
  norwayNtfPromotionPreviewCount: 8,
  sportomediaPromotionPreviewCount: 8,
  standingsStatisticsPromotionPreviewCount: 4,
  fixturesResultsPromotionPreviewCount: 4,
  seasonStatePromotionPreviewCount: 4,
  nextActiveRestartDatePromotionPreviewCount: 6
};

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required input file: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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

function countWhere(rows, predicate) {
  return rows.filter(predicate).length;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function assertPreviewArtifact(preview) {
  const s = preview.summary || {};

  for (const [key, expected] of Object.entries(expectedCounts)) {
    if (s[key] !== expected) {
      throw new Error(`Expected preview.summary.${key}=${expected}, got ${s[key]}`);
    }
  }

  if (s.blockedPromotionPreviewRowCount !== 0) {
    throw new Error(`Expected blockedPromotionPreviewRowCount=0, got ${s.blockedPromotionPreviewRowCount}`);
  }

  if (s.allCompetitionPromotionPreviewsReadyCount !== 6) {
    throw new Error(`Expected allCompetitionPromotionPreviewsReadyCount=6, got ${s.allCompetitionPromotionPreviewsReadyCount}`);
  }

  if (s.blockedCompetitionPromotionPreviewCount !== 0) {
    throw new Error(`Expected blockedCompetitionPromotionPreviewCount=0, got ${s.blockedCompetitionPromotionPreviewCount}`);
  }

  if (s.mayBuildSixLeagueExplicitWriteApprovalGateCount !== 1) {
    throw new Error("Expected mayBuildSixLeagueExplicitWriteApprovalGateCount=1");
  }

  [
    "previewRunnerIsExecutionPermissionNowCount",
    "previewRunnerIsFetchPermissionNowCount",
    "previewRunnerIsSearchPermissionNowCount",
    "previewRunnerIsBroadSearchPermissionNowCount",
    "previewRunnerIsClassifierPermissionNowCount",
    "previewRunnerIsCanonicalWritePermissionNowCount",
    "previewRunnerIsProductionWritePermissionNowCount",
    "previewRunnerIsTruthAssertionPermissionNowCount",
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "seasonStateTruthAssertedCount",
    "sixLeagueControlledPromotionPreviewTruthCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `preview.summary.${key}`));

  assertZero(preview.canonicalWrites, "preview.canonicalWrites");
  assertFalse(preview.productionWrite, "preview.productionWrite");
  assertFalse(preview.sourceFetch?.executed, "preview.sourceFetch.executed");
  assertFalse(preview.searchProviderUsed, "preview.searchProviderUsed");
  assertFalse(preview.broadSearchUsed, "preview.broadSearchUsed");
  assertFalse(preview.classifierExecuted, "preview.classifierExecuted");
}

function assertCandidatePlan(candidatePlan) {
  const s = candidatePlan.summary || {};

  if (s.promotionCandidateRowCount !== 18) throw new Error(`Expected promotionCandidateRowCount=18, got ${s.promotionCandidateRowCount}`);
  if (s.competitionPromotionPackageCount !== 6) throw new Error(`Expected competitionPromotionPackageCount=6, got ${s.competitionPromotionPackageCount}`);
  if (s.familyPromotionPackageCount !== 3) throw new Error(`Expected familyPromotionPackageCount=3, got ${s.familyPromotionPackageCount}`);
  if (s.blockedPromotionCandidateRowCount !== 0) throw new Error(`Expected blockedPromotionCandidateRowCount=0, got ${s.blockedPromotionCandidateRowCount}`);
  if (s.allCompetitionPromotionPackagesReadyCount !== 6) throw new Error(`Expected allCompetitionPromotionPackagesReadyCount=6, got ${s.allCompetitionPromotionPackagesReadyCount}`);

  [
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "seasonStateTruthAssertedCount",
    "sixLeagueControlledPromotionCandidatePlanTruthCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `candidatePlan.summary.${key}`));

  assertZero(candidatePlan.canonicalWrites, "candidatePlan.canonicalWrites");
  assertFalse(candidatePlan.productionWrite, "candidatePlan.productionWrite");
  assertFalse(candidatePlan.sourceFetch?.executed, "candidatePlan.sourceFetch.executed");
  assertFalse(candidatePlan.searchProviderUsed, "candidatePlan.searchProviderUsed");
  assertFalse(candidatePlan.broadSearchUsed, "candidatePlan.broadSearchUsed");
  assertFalse(candidatePlan.classifierExecuted, "candidatePlan.classifierExecuted");
}

function validatePreviewRow(row) {
  const failures = [];

  if (!row.previewRowId) failures.push("missing_preview_row_id");
  if (!row.promotionCandidateRowId) failures.push("missing_promotion_candidate_row_id");
  if (!row.competitionSlug) failures.push("missing_competition_slug");
  if (!row.family) failures.push("missing_family");
  if (!row.evidenceArea) failures.push("missing_evidence_area");
  if (!row.canonicalTargetArea) failures.push("missing_canonical_target_area");
  if (!row.controlledPromotionLane) failures.push("missing_controlled_promotion_lane");
  if (!row.sourceRawPayloadFile) failures.push("missing_source_raw_payload_file");
  if (!fs.existsSync(row.sourceRawPayloadFile)) failures.push("source_raw_payload_file_missing_on_disk");

  if (row.previewStatus !== "ready_for_explicit_write_approval_gate") {
    failures.push(`unexpected_preview_status:${row.previewStatus}`);
  }

  if (row.previewOperation !== "would_stage_canonical_truth_promotion_if_explicit_write_approval_is_granted") {
    failures.push(`unexpected_preview_operation:${row.previewOperation}`);
  }

  if (row.routeBackedCandidate !== true) failures.push("not_route_backed_candidate");
  if (row.canonicalWriteRequiresExplicitApproval !== true) failures.push("canonical_write_approval_not_required");
  if (row.truthAssertionRequiresExplicitApproval !== true) failures.push("truth_assertion_approval_not_required");

  [
    "isExecutionPermissionNow",
    "isFetchPermissionNow",
    "isSearchPermissionNow",
    "isBroadSearchPermissionNow",
    "isClassifierPermissionNow",
    "isCanonicalWritePermissionNow",
    "isProductionWritePermissionNow",
    "isTruthAssertionPermissionNow",
    "canonicalWriteExecutedNow",
    "productionWriteExecutedNow",
    "truthAssertedNow"
  ].forEach((key) => {
    if (row[key] !== false) failures.push(`preview_guardrail_not_false:${key}`);
  });

  return failures;
}

const preview = readJson(previewPath);
const candidatePlan = readJson(candidatePlanPath);

assertPreviewArtifact(preview);
assertCandidatePlan(candidatePlan);

const previewRows = Array.isArray(preview.previewRows) ? preview.previewRows : [];
const competitionPreviewRows = Array.isArray(preview.competitionPreviewRows) ? preview.competitionPreviewRows : [];
const familyPreviewRows = Array.isArray(preview.familyPreviewRows) ? preview.familyPreviewRows : [];

if (previewRows.length !== 18) throw new Error(`Expected 18 preview rows, got ${previewRows.length}`);
if (competitionPreviewRows.length !== 6) throw new Error(`Expected 6 competition preview rows, got ${competitionPreviewRows.length}`);
if (familyPreviewRows.length !== 3) throw new Error(`Expected 3 family preview rows, got ${familyPreviewRows.length}`);

const writeApprovalRows = previewRows.map((row, index) => {
  const failures = validatePreviewRow(row);

  return {
    writeApprovalRowId: `six_league_explicit_write_approval_${String(index + 1).padStart(2, "0")}`,
    previewRowId: row.previewRowId,
    promotionCandidateRowId: row.promotionCandidateRowId,
    competitionSlug: row.competitionSlug,
    family: row.family,
    evidenceArea: row.evidenceArea,
    canonicalTargetArea: row.canonicalTargetArea,
    controlledPromotionLane: row.controlledPromotionLane,
    sourceRawPayloadFile: row.sourceRawPayloadFile,
    sourceRoutePurpose: row.sourceRoutePurpose,
    approvalStatus:
      failures.length === 0
        ? "approved_to_build_controlled_write_runner"
        : "blocked_from_controlled_write_runner",
    failures,
    mayBuildControlledWriteRunnerForRow: failures.length === 0,

    approvalIsExecutionPermissionNow: false,
    approvalIsFetchPermissionNow: false,
    approvalIsSearchPermissionNow: false,
    approvalIsBroadSearchPermissionNow: false,
    approvalIsClassifierPermissionNow: false,
    approvalIsCanonicalWritePermissionNow: false,
    approvalIsProductionWritePermissionNow: false,
    approvalIsTruthAssertionPermissionNow: false,

    nextRunnerMayStageCanonicalWrite: failures.length === 0,
    nextRunnerMayStageTruthAssertion: failures.length === 0,
    nextRunnerRequiresExplicitAllowWriteFlag: true
  };
});

const approvedRows = writeApprovalRows.filter((row) => row.failures.length === 0);
const blockedRows = writeApprovalRows.filter((row) => row.failures.length > 0);

const competitionWriteApprovalRows = competitionPreviewRows.map((row) => {
  const rows = writeApprovalRows.filter((approvalRow) => approvalRow.competitionSlug === row.competitionSlug);
  const approvedAreas = unique(
    rows
      .filter((approvalRow) => approvalRow.approvalStatus === "approved_to_build_controlled_write_runner")
      .map((approvalRow) => approvalRow.evidenceArea)
  ).sort();

  const previewAreas = Array.isArray(row.previewAreas) ? row.previewAreas : [];
  const missingApprovedPreviewAreas = previewAreas.filter((area) => !approvedAreas.includes(area));

  return {
    competitionSlug: row.competitionSlug,
    family: row.family,
    previewAreas,
    approvedAreas,
    missingApprovedPreviewAreas,
    writeApprovalRowCount: rows.length,
    competitionWriteApprovalStatus:
      missingApprovedPreviewAreas.length === 0
        ? "approved_to_build_controlled_write_runner_for_competition"
        : "blocked_from_controlled_write_runner_for_competition",
    approvalIsCanonicalWritePermissionNow: false,
    approvalIsTruthAssertionPermissionNow: false
  };
});

const familyWriteApprovalRows = familyPreviewRows.map((row) => {
  const rows = writeApprovalRows.filter((approvalRow) => approvalRow.family === row.family);

  return {
    family: row.family,
    targetCompetitions: row.targetCompetitions,
    previewAreas: row.previewAreas,
    writeApprovalRowCount: rows.length,
    familyWriteApprovalStatus: "approved_to_build_controlled_write_runner_for_family",
    approvalIsCanonicalWritePermissionNow: false,
    approvalIsTruthAssertionPermissionNow: false
  };
});

const summary = {
  sixLeagueExplicitWriteApprovalGateReadCount: 1,
  sourcePromotionPreviewRowCount: previewRows.length,
  sourceCompetitionPreviewRowCount: competitionPreviewRows.length,
  sourceFamilyPreviewRowCount: familyPreviewRows.length,

  writeApprovalRowCount: writeApprovalRows.length,
  approvedWriteApprovalRowCount: approvedRows.length,
  blockedWriteApprovalRowCount: blockedRows.length,

  approvedLaligaWriteApprovalCount: countWhere(approvedRows, (row) => row.family === "laliga"),
  approvedNorwayNtfWriteApprovalCount: countWhere(approvedRows, (row) => row.family === "norway_ntf"),
  approvedSportomediaWriteApprovalCount: countWhere(approvedRows, (row) => row.family === "sportomedia"),

  approvedStandingsStatisticsWriteApprovalCount: countWhere(approvedRows, (row) => row.evidenceArea === "standings_statistics"),
  approvedFixturesResultsWriteApprovalCount: countWhere(approvedRows, (row) => row.evidenceArea === "fixtures_results"),
  approvedSeasonStateWriteApprovalCount: countWhere(approvedRows, (row) => row.evidenceArea === "season_state"),
  approvedNextActiveRestartDateWriteApprovalCount: countWhere(approvedRows, (row) => row.evidenceArea === "next_active_restart_date"),

  competitionWriteApprovalRowCount: competitionWriteApprovalRows.length,
  familyWriteApprovalRowCount: familyWriteApprovalRows.length,
  allCompetitionWriteApprovalsReadyCount: countWhere(
    competitionWriteApprovalRows,
    (row) => row.competitionWriteApprovalStatus === "approved_to_build_controlled_write_runner_for_competition"
  ),
  blockedCompetitionWriteApprovalCount: countWhere(
    competitionWriteApprovalRows,
    (row) => row.competitionWriteApprovalStatus !== "approved_to_build_controlled_write_runner_for_competition"
  ),

  mayBuildSixLeagueControlledWriteRunnerCount: blockedRows.length === 0 ? 1 : 0,

  writeApprovalIsExecutionPermissionNowCount: 0,
  writeApprovalIsFetchPermissionNowCount: 0,
  writeApprovalIsSearchPermissionNowCount: 0,
  writeApprovalIsBroadSearchPermissionNowCount: 0,
  writeApprovalIsClassifierPermissionNowCount: 0,
  writeApprovalIsCanonicalWritePermissionNowCount: 0,
  writeApprovalIsProductionWritePermissionNowCount: 0,
  writeApprovalIsTruthAssertionPermissionNowCount: 0,

  nextRunnerMayStageCanonicalWriteCount: approvedRows.length,
  nextRunnerMayStageTruthAssertionCount: approvedRows.length,

  fetchExecutedNowCount: 0,
  searchExecutedNowCount: 0,
  broadSearchExecutedNowCount: 0,
  classifierExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  seasonStateTruthAssertedCount: 0,
  sixLeagueExplicitWriteApprovalGateTruthCount: 0,
  canonicalWrites: 0,
  productionWrite: false
};

const artifact = {
  job: "run-football-truth-six-league-explicit-write-approval-gate-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_explicit_write_approval_gate_artifact",
  dryRun: true,
  inputs: {
    sixLeagueControlledPromotionPreview: previewPath,
    sixLeagueControlledPromotionCandidatePlan: candidatePlanPath
  },
  policy: {
    approvalGateOnly: true,
    approvalDoesNotWriteCanonical: true,
    approvalDoesNotAssertTruth: true,
    controlledWriteRunnerRequiredAfterApproval: true,
    actualWriteRunnerMustRequireExplicitAllowWriteFlag: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  summary,
  writeApprovalRows,
  competitionWriteApprovalRows,
  familyWriteApprovalRows,
  blockedRows,
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

if (blockedRows.length > 0) {
  throw new Error(`Explicit write approval gate blocked ${blockedRows.length} rows`);
}
