import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const inputPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "six-league-truth-readiness-audit-2026-06-15",
  "six-league-truth-readiness-audit-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "six-league-evidence-completion-plan-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "six-league-evidence-completion-plan-2026-06-15.json"
);

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

function assertAuditGuardrails(input) {
  const s = input.summary || {};

  [
    "auditIsExecutionPermissionNowCount",
    "auditIsFetchPermissionNowCount",
    "auditIsSearchPermissionNowCount",
    "auditIsBroadSearchPermissionNowCount",
    "auditIsClassifierPermissionNowCount",
    "auditIsCanonicalWritePermissionNowCount",
    "auditIsProductionWritePermissionNowCount",
    "auditIsTruthAssertionPermissionNowCount",
    "mayExecuteFurtherNowCount",
    "mayFetchNowCount",
    "maySearchNowCount",
    "mayBroadSearchNowCount",
    "mayClassifySeasonStateNowCount",
    "mayWriteCanonicalNowCount",
    "mayAssertTruthNowCount",
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "seasonStateTruthAssertedCount",
    "sixLeagueStrictTruthReadinessAuditTruthCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `summary.${key}`));

  assertZero(input.canonicalWrites, "canonicalWrites");
  assertFalse(input.productionWrite, "productionWrite");
  assertFalse(input.sourceFetch?.executed, "sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "searchProviderUsed");
  assertFalse(input.broadSearchUsed, "broadSearchUsed");
  assertFalse(input.classifierExecuted, "classifierExecuted");
}

function requiredEvidenceForMissingArea(area) {
  if (area === "standingsStats") {
    return {
      requiredEvidenceType: "standings_statistics",
      requiredTrustedEvidence: [
        "official standings/table source route",
        "team rows with played/won/drawn/lost/goals/points or provider-equivalent statistics",
        "source timestamp or season context"
      ],
      proposedCompletionLane: "trusted_standings_statistics_capture"
    };
  }

  if (area === "fixturesResults") {
    return {
      requiredEvidenceType: "fixtures_results",
      requiredTrustedEvidence: [
        "official fixture/results source route",
        "recent completed matches and upcoming fixtures",
        "date/time normalization evidence"
      ],
      proposedCompletionLane: "trusted_fixtures_results_capture"
    };
  }

  if (area === "seasonState") {
    return {
      requiredEvidenceType: "season_state",
      requiredTrustedEvidence: [
        "official active/completed/break evidence",
        "fixture/result window evidence",
        "no assertion from match status alone"
      ],
      proposedCompletionLane: "trusted_season_state_evidence_capture"
    };
  }

  if (area === "nextActiveRestartDate") {
    return {
      requiredEvidenceType: "next_active_restart_date",
      requiredTrustedEvidence: [
        "official next scheduled matchday or restart fixture",
        "league calendar/date source",
        "date must be competition-specific"
      ],
      proposedCompletionLane: "trusted_next_active_restart_date_capture"
    };
  }

  return {
    requiredEvidenceType: area,
    requiredTrustedEvidence: ["manual review required"],
    proposedCompletionLane: "manual_evidence_completion_review"
  };
}

function buildCompletionRows(auditRow) {
  const missingAreas = Array.isArray(auditRow.missingStrictTruthAreas)
    ? auditRow.missingStrictTruthAreas
    : [];

  if (missingAreas.length === 0) {
    return [];
  }

  return missingAreas.map((area, index) => {
    const evidence = requiredEvidenceForMissingArea(area);

    return {
      completionPlanRowId: `${auditRow.slug}_six_league_evidence_completion_${String(index + 1).padStart(2, "0")}`,
      competitionSlug: auditRow.slug,
      label: auditRow.label,
      family: auditRow.family,
      strictTruthReadinessStatus: auditRow.strictTruthReadinessStatus,
      missingStrictTruthArea: area,
      requiredEvidenceType: evidence.requiredEvidenceType,
      proposedCompletionLane: evidence.proposedCompletionLane,
      requiredTrustedEvidence: evidence.requiredTrustedEvidence,
      currentStrictProductionDirectAreaCounts: auditRow.strictProductionDirectAreaCounts || {},
      currentDiagnosticOrSnapshotDirectAreaCounts: auditRow.diagnosticOrSnapshotDirectAreaCounts || {},
      currentDirectProductionOrCanonicalCandidateFileCount:
        auditRow.directProductionOrCanonicalCandidateFileCount || 0,
      currentDirectDiagnosticCandidateFileCount:
        auditRow.directDiagnosticCandidateFileCount || 0,
      currentDirectSnapshotCandidateFileCount:
        auditRow.directSnapshotCandidateFileCount || 0,
      completionReason:
        auditRow.strictTruthReadinessStatus === "diagnostic_or_snapshot_only_not_project_truth"
          ? "diagnostics_or_snapshots_do_not_count_as_project_truth"
          : "production_or_canonical_candidate_is_partial",
      mayBuildControlledEvidenceAcquisitionPlan: true,
      isExecutionPermissionNow: false,
      isFetchPermissionNow: false,
      isSearchPermissionNow: false,
      isBroadSearchPermissionNow: false,
      isClassifierPermissionNow: false,
      isCanonicalWritePermissionNow: false,
      isProductionWritePermissionNow: false,
      isTruthAssertionPermissionNow: false
    };
  });
}

function countWhere(rows, predicate) {
  return rows.filter(predicate).length;
}

const audit = readJson(inputPath);
assertAuditGuardrails(audit);

const auditRows = Array.isArray(audit.competitionAuditRows)
  ? audit.competitionAuditRows
  : [];

if (auditRows.length !== 6) {
  throw new Error(`Expected 6 strict audit competition rows, got ${auditRows.length}`);
}

const completionPlanRows = auditRows.flatMap(buildCompletionRows);

const byCompetition = completionPlanRows.reduce((acc, row) => {
  acc[row.competitionSlug] = (acc[row.competitionSlug] || 0) + 1;
  return acc;
}, {});

const byFamily = completionPlanRows.reduce((acc, row) => {
  acc[row.family] = (acc[row.family] || 0) + 1;
  return acc;
}, {});

const byEvidenceType = completionPlanRows.reduce((acc, row) => {
  acc[row.requiredEvidenceType] = (acc[row.requiredEvidenceType] || 0) + 1;
  return acc;
}, {});

const diagnosticOnlyCompetitionCount = countWhere(
  auditRows,
  (row) => row.strictTruthReadinessStatus === "diagnostic_or_snapshot_only_not_project_truth"
);

const partialProductionCompetitionCount = countWhere(
  auditRows,
  (row) => row.strictTruthReadinessStatus === "production_candidate_partial_truth_incomplete"
);

const summary = {
  sixLeagueEvidenceCompletionPlanReadCount: 1,
  sourceStrictAuditCompetitionCount: auditRows.length,
  evidenceCompletionPlanRowCount: completionPlanRows.length,
  affectedCompetitionCount: Object.keys(byCompetition).length,

  productionCandidatePartialTruthIncompleteCompetitionCount: partialProductionCompetitionCount,
  diagnosticOrSnapshotOnlyNotProjectTruthCompetitionCount: diagnosticOnlyCompetitionCount,

  espNextActiveRestartDateCompletionNeededCount: countWhere(
    completionPlanRows,
    (row) =>
      (row.competitionSlug === "esp.1" || row.competitionSlug === "esp.2") &&
      row.requiredEvidenceType === "next_active_restart_date"
  ),

  norwayFullTrustedCaptureNeededCount: countWhere(
    completionPlanRows,
    (row) => row.family === "norway_ntf"
  ),

  sportomediaFullTrustedCaptureNeededCount: countWhere(
    completionPlanRows,
    (row) => row.family === "sportomedia"
  ),

  standingsStatisticsCompletionNeededCount: byEvidenceType.standings_statistics || 0,
  fixturesResultsCompletionNeededCount: byEvidenceType.fixtures_results || 0,
  seasonStateCompletionNeededCount: byEvidenceType.season_state || 0,
  nextActiveRestartDateCompletionNeededCount: byEvidenceType.next_active_restart_date || 0,

  mayBuildSixLeagueControlledEvidenceAcquisitionPlanCount:
    completionPlanRows.length > 0 ? 1 : 0,

  planIsExecutionPermissionNowCount: 0,
  planIsFetchPermissionNowCount: 0,
  planIsSearchPermissionNowCount: 0,
  planIsBroadSearchPermissionNowCount: 0,
  planIsClassifierPermissionNowCount: 0,
  planIsCanonicalWritePermissionNowCount: 0,
  planIsProductionWritePermissionNowCount: 0,
  planIsTruthAssertionPermissionNowCount: 0,

  mayExecuteFurtherNowCount: 0,
  mayFetchNowCount: 0,
  maySearchNowCount: 0,
  mayBroadSearchNowCount: 0,
  mayClassifySeasonStateNowCount: 0,
  mayWriteCanonicalNowCount: 0,
  mayAssertTruthNowCount: 0,

  fetchExecutedNowCount: 0,
  searchExecutedNowCount: 0,
  broadSearchExecutedNowCount: 0,
  classifierExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  seasonStateTruthAssertedCount: 0,
  sixLeagueEvidenceCompletionPlanTruthCount: 0,
  canonicalWrites: 0,
  productionWrite: false
};

const artifact = {
  job: "build-football-truth-six-league-evidence-completion-plan-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_evidence_completion_planning_artifact",
  dryRun: true,
  inputs: {
    strictSixLeagueTruthReadinessAudit: inputPath
  },
  policy: {
    pauseFullMapMaterializationUntilSixLeagueTruthGapsArePlanned: true,
    diagnosticsDoNotCountAsProjectTruth: true,
    snapshotsDoNotCountAsProjectTruth: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  summary,
  counts: {
    byCompetition,
    byFamily,
    byEvidenceType
  },
  completionPlanRows,
  blockedRows: [],
  guardrails: [
    { name: "no_fetch", allowed: false, executed: false },
    { name: "no_search", allowed: false, executed: false },
    { name: "no_broad_search", allowed: false, executed: false },
    { name: "no_classifier", allowed: false, executed: false },
    { name: "no_canonical_write", allowed: false, executed: false },
    { name: "no_production_write", allowed: false, executed: false },
    { name: "no_truth_assertion", allowed: false, executed: false },
    { name: "planning_artifact_only", allowed: true, executed: true }
  ],
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
