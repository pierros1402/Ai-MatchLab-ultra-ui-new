#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_PRIMARY_GATE =
  "data/football-truth/_diagnostics/primary-batch-runner-manifest-quality-gate-2026-06-14/primary-batch-runner-manifest-quality-gate-2026-06-14.json";

const DEFAULT_MASTER_BUNDLE =
  "data/football-truth/_diagnostics/master-compiler-lane-bundle-2026-06-14/master-compiler-lane-bundle-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/followup-lane-batch-plan-bundle-2026-06-14/followup-lane-batch-plan-bundle-2026-06-14.json";

const RETAINED_RAW_MAP_COUNT = 689;
const ACTIVE_COMPETITION_COUNT = 515;
const SCOPE_ACCOUNTING_NO_ACTION_COUNT = 174;
const PRIMARY_COMPETITION_COUNT = 473;
const FOLLOWUP_COMPETITION_COUNT = 42;
const FOLLOWUP_BATCH_ROW_COUNT = 8;

const EXPECTED_FOLLOWUP_LANES = {
  blocked_source_traceback_compiler_lane: {
    outputBatchPlanLane: "blocked_source_traceback_followup_batch_plan",
    expectedRows: 1,
    expectedCompetitions: 23,
    batchPlanStatus: "followup_batch_plan_ready_for_source_traceback_review_no_fetch",
    followupIntent: "review_blocked_configured_family_source_traceback_without_fetch_or_search"
  },
  generic_validator_ready_followup_lane: {
    outputBatchPlanLane: "generic_validator_ready_followup_batch_plan",
    expectedRows: 3,
    expectedCompetitions: 6,
    batchPlanStatus: "followup_batch_plan_ready_for_generic_validator_planning_no_execution",
    followupIntent: "prepare_generic_validator_ready_followup_without_execution"
  },
  priority1_reusable_family_repair_lane: {
    outputBatchPlanLane: "priority1_reusable_family_repair_followup_batch_plan",
    expectedRows: 1,
    expectedCompetitions: 6,
    batchPlanStatus: "followup_batch_plan_ready_for_priority1_reusable_family_repair_no_fetch",
    followupIntent: "prepare_priority1_reusable_family_repair_without_fetch_or_truth_assertion"
  },
  standings_first_contract_review_lane: {
    outputBatchPlanLane: "standings_first_contract_review_followup_batch_plan",
    expectedRows: 1,
    expectedCompetitions: 2,
    batchPlanStatus: "followup_batch_plan_ready_for_standings_first_contract_review_no_write",
    followupIntent: "prepare_standings_first_contract_review_without_canonical_write"
  },
  cup_state_final_winner_review_lane: {
    outputBatchPlanLane: "cup_state_final_winner_review_followup_batch_plan",
    expectedRows: 1,
    expectedCompetitions: 3,
    batchPlanStatus: "followup_batch_plan_ready_for_cup_state_final_winner_review_no_write",
    followupIntent: "prepare_cup_state_final_winner_review_without_truth_assertion"
  },
  policy_reduction_governance_lane: {
    outputBatchPlanLane: "policy_reduction_governance_followup_batch_plan",
    expectedRows: 1,
    expectedCompetitions: 2,
    batchPlanStatus: "followup_batch_plan_ready_for_policy_reduction_governance_no_suppression_write",
    followupIntent: "prepare_policy_reduction_governance_without_suppression_mutation"
  }
};

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    primaryGate: DEFAULT_PRIMARY_GATE,
    masterBundle: DEFAULT_MASTER_BUNDLE,
    output: DEFAULT_OUTPUT
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--primary-gate") args.primaryGate = argv[++i];
    else if (arg === "--master-bundle") args.masterBundle = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error("Unknown argument: " + arg);
  }

  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error("Missing JSON input: " + filePath);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function stableJson(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

function uniqueSorted(values) {
  return [...new Set(
    values
      .filter((value) => value !== null && value !== undefined)
      .map((value) => String(value).trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value =
      row[key] === null || row[key] === undefined || String(row[key]).trim() === ""
        ? "__missing__"
        : String(row[key]).trim();

    counts[value] = (counts[value] || 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
  );
}

function assertSummary(summary, key, expected) {
  if (!(key in summary)) throw new Error("Missing summary key: " + key);
  if (summary[key] !== expected) {
    throw new Error("Guardrail failed for " + key + ": expected " + expected + ", got " + summary[key]);
  }
}

function validatePrimaryGate(primaryGate) {
  const summary = primaryGate.summary || {};

  assertSummary(summary, "retainedRawMapCompetitionCount", RETAINED_RAW_MAP_COUNT);
  assertSummary(summary, "competitionCount", RETAINED_RAW_MAP_COUNT);
  assertSummary(summary, "activeExecutionWaveCompetitionCount", ACTIVE_COMPETITION_COUNT);
  assertSummary(summary, "scopeAccountingNoActionCompetitionCount", SCOPE_ACCOUNTING_NO_ACTION_COUNT);
  assertSummary(summary, "primaryRunnerManifestQualityGateLaneCount", 2);
  assertSummary(summary, "primaryRunnerManifestQualityGatePassedLaneCount", 2);
  assertSummary(summary, "primaryRunnerManifestQualityGateBlockedLaneCount", 0);
  assertSummary(summary, "primaryRunnerManifestQualityGateRowCount", 13);
  assertSummary(summary, "primaryRunnerManifestQualityGateExecutorRowCount", 273);
  assertSummary(summary, "primaryRunnerManifestQualityGateCompetitionReferenceCount", PRIMARY_COMPETITION_COUNT);
  assertSummary(summary, "remainingFollowupLaneCompetitionCount", FOLLOWUP_COMPETITION_COUNT);
  assertSummary(summary, "currentEffectiveMapExactCountAsserted", false);
  assertSummary(summary, "currentEffectiveMapExactCount", null);
  assertSummary(summary, "sourceDiscoveryConfirmedActionableCompetitionCount", 0);
  assertSummary(summary, "actionableConfirmedNowCount", 0);
  assertSummary(summary, "contractConfirmedNowCount", 0);
  assertSummary(summary, "validatedRouteMapCount", 0);
  assertSummary(summary, "validatedFixtureContractCount", 0);
  assertSummary(summary, "validatedStandingsContractCount", 0);
  assertSummary(summary, "validatedSeasonStateContractCount", 0);
  assertSummary(summary, "runnerManifestExecutionAllowedNowCount", 0);
  assertSummary(summary, "fetchAllowedNowCount", 0);
  assertSummary(summary, "searchAllowedNowCount", 0);
  assertSummary(summary, "broadSearchAllowedNowCount", 0);
  assertSummary(summary, "controlledDiscoveryAllowedNowCount", 0);
  assertSummary(summary, "canonicalPromotionAllowedNowCount", 0);
  assertSummary(summary, "zeroResultMayImplyAbsenceCount", 0);
  assertSummary(summary, "canonicalWriteEligibleNowCount", 0);
  assertSummary(summary, "activeAssertedCount", 0);
  assertSummary(summary, "inactiveAssertedCount", 0);
  assertSummary(summary, "completedAssertedCount", 0);
  assertSummary(summary, "canonicalWrites", 0);
  assertSummary(summary, "productionWrite", false);
}

function collectObjects(value, output = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectObjects(item, output);
    return output;
  }

  if (value && typeof value === "object") {
    output.push(value);
    for (const child of Object.values(value)) collectObjects(child, output);
  }

  return output;
}

function objectLaneValue(obj) {
  return (
    obj.compilerLane ||
    obj.primaryCompilerLane ||
    obj.lane ||
    obj.workstreamLane ||
    obj.outputLane ||
    obj.compilerOutputLane ||
    obj.executorLane ||
    obj.batchLane ||
    null
  );
}

function objectOutputFile(obj) {
  return obj.outputFile || obj.file || obj.path || obj.inputFile || null;
}

function findCompilerOutputFile(masterBundle, lane) {
  const objects = collectObjects(masterBundle);
  const directMatches = objects.filter((obj) => objectLaneValue(obj) === lane && objectOutputFile(obj));

  for (const match of directMatches) {
    const file = objectOutputFile(match);
    if (file && fs.existsSync(file)) {
      return { bundleRow: match, outputFile: file };
    }
  }

  const masterDir = path.dirname(DEFAULT_MASTER_BUNDLE);
  const conventionalCandidates = [
    path.join(masterDir, "master-compiler-output-" + lane + "-" + DEFAULT_DATE + ".json"),
    path.join(masterDir, "master-compiler-lane-output-" + lane + "-" + DEFAULT_DATE + ".json"),
    path.join(masterDir, "compiler-output-" + lane + "-" + DEFAULT_DATE + ".json"),
    path.join(masterDir, lane + "-" + DEFAULT_DATE + ".json")
  ].map((file) => file.replaceAll("\\", "/"));

  for (const file of conventionalCandidates) {
    if (fs.existsSync(file)) {
      return {
        bundleRow: {
          compilerLane: lane,
          outputFile: file,
          lookupFallback: "conventional_master_bundle_output_path"
        },
        outputFile: file
      };
    }
  }

  const directoryCandidates = fs.existsSync(masterDir)
    ? fs.readdirSync(masterDir)
        .filter((name) => name.endsWith(".json") && name.includes(lane))
        .map((name) => path.join(masterDir, name).replaceAll("\\", "/"))
    : [];

  if (directoryCandidates.length === 1) {
    return {
      bundleRow: {
        compilerLane: lane,
        outputFile: directoryCandidates[0],
        lookupFallback: "single_directory_filename_match"
      },
      outputFile: directoryCandidates[0]
    };
  }

  if (directoryCandidates.length > 1) {
    const preferred = directoryCandidates.find((file) => file.includes("master-compiler-output")) || directoryCandidates[0];
    return {
      bundleRow: {
        compilerLane: lane,
        outputFile: preferred,
        lookupFallback: "multi_directory_filename_match_preferred"
      },
      outputFile: preferred
    };
  }

  throw new Error(
    "Could not find compiler output file for follow-up lane: " +
      lane +
      ". Checked direct bundle rows, conventional paths, and directory filename matches under " +
      masterDir
  );
}

function firstArray(json, keys) {
  for (const key of keys) {
    if (Array.isArray(json[key])) return json[key];
  }

  return null;
}

function extractRows(json, lane) {
  const rows = firstArray(json, ["compiledRows", "compilerRows", "rows", "groupingRows", "workRows"]);
  if (!rows) throw new Error("Could not find row array for " + lane);
  return rows;
}

function extractSlugs(row) {
  if (Array.isArray(row.competitionSlugs)) return uniqueSorted(row.competitionSlugs);
  if (Array.isArray(row.slugs)) return uniqueSorted(row.slugs);
  if (Array.isArray(row.competitions)) {
    return uniqueSorted(row.competitions.map((item) => {
      if (typeof item === "string") return item;
      return item.slug || item.competitionSlug || item.id || null;
    }));
  }
  if (row.competitionSlug) return uniqueSorted([row.competitionSlug]);
  if (row.slug) return uniqueSorted([row.slug]);
  return [];
}

function slugPrefix(slug) {
  const parts = String(slug).split(".");
  return parts.length > 1 ? parts[0] : "unknown_prefix";
}

function extractSlugPrefixes(row, slugs) {
  if (Array.isArray(row.slugPrefixes)) return uniqueSorted(row.slugPrefixes);
  if (Array.isArray(row.prefixes)) return uniqueSorted(row.prefixes);
  if (row.slugPrefix) return uniqueSorted([row.slugPrefix]);
  if (row.countryPrefix) return uniqueSorted([row.countryPrefix]);
  return uniqueSorted(slugs.map(slugPrefix));
}

function extractRegions(row) {
  if (Array.isArray(row.regions)) return uniqueSorted(row.regions);
  if (row.region) return uniqueSorted([row.region]);
  if (row.sourceAuthorityRegion) return uniqueSorted([row.sourceAuthorityRegion]);
  return ["unknown_region"];
}

function extractEvidenceRoles(row, lane) {
  if (Array.isArray(row.requiredEvidenceRoles)) return uniqueSorted(row.requiredEvidenceRoles);
  if (Array.isArray(row.evidenceRoles)) return uniqueSorted(row.evidenceRoles);

  if (lane === "blocked_source_traceback_compiler_lane") {
    return ["source_traceback", "configured_family_block_reason", "safe_recovery_policy"];
  }
  if (lane === "generic_validator_ready_followup_lane") {
    return ["generic_validator_contract", "route_candidate", "safe_validator_plan"];
  }
  if (lane === "priority1_reusable_family_repair_lane") {
    return ["reusable_family_repair", "adapter_contract", "safe_repair_plan"];
  }
  if (lane === "standings_first_contract_review_lane") {
    return ["standings_contract", "source_authority_trace", "canonical_write_gate"];
  }
  if (lane === "cup_state_final_winner_review_lane") {
    return ["cup_final_winner_evidence", "season_state_evidence", "canonical_write_gate"];
  }
  if (lane === "policy_reduction_governance_lane") {
    return ["policy_reduction_evidence", "scope_governance", "suppression_write_gate"];
  }

  return ["followup_evidence_review"];
}

function compilerGroupingKey(row, lane, index) {
  return (
    row.compilerGroupingKey ||
    row.groupingKey ||
    row.batchGroupKey ||
    row.workstreamGroupingKey ||
    row.key ||
    lane + "::row_" + String(index + 1).padStart(3, "0")
  );
}

function assertNoUnsafeInput(row, lane, key) {
  const unsafeTrueFields = [
    "fetchAllowedNow",
    "searchAllowedNow",
    "broadSearchAllowedNow",
    "controlledDiscoveryAllowedNow",
    "canonicalPromotionAllowedNow",
    "zeroResultMayImplyAbsence",
    "canonicalWriteEligibleNow",
    "productionWrite",
    "truthAssertionsAllowedNow",
    "activeAssertedNow",
    "inactiveAssertedNow",
    "completedAssertedNow"
  ];

  for (const field of unsafeTrueFields) {
    if (row[field] === true) {
      throw new Error(lane + "/" + key + ": unsafe true input flag found: " + field);
    }
  }

  if (typeof row.canonicalWrites === "number" && row.canonicalWrites !== 0) {
    throw new Error(lane + "/" + key + ": canonicalWrites must be 0 when present");
  }
}

function validateMasterBundle(masterBundle) {
  const summary = masterBundle.summary || {};

  assertSummary(summary, "retainedRawMapCompetitionCount", RETAINED_RAW_MAP_COUNT);
  assertSummary(summary, "competitionCount", RETAINED_RAW_MAP_COUNT);
  assertSummary(summary, "activeExecutionWaveCompetitionCount", ACTIVE_COMPETITION_COUNT);
  assertSummary(summary, "scopeAccountingNoActionCompetitionCount", SCOPE_ACCOUNTING_NO_ACTION_COUNT);

  if (summary.sourceAuthorityTemplateCompilerCompetitionCount !== 372) {
    throw new Error("master bundle sourceAuthorityTemplateCompilerCompetitionCount mismatch");
  }
  if (summary.existingSignalTruthReviewCompilerCompetitionCount !== 101) {
    throw new Error("master bundle existingSignalTruthReviewCompilerCompetitionCount mismatch");
  }
  if (summary.blockedSourceTracebackCompilerCompetitionCount !== 23) {
    throw new Error("master bundle blockedSourceTracebackCompilerCompetitionCount mismatch");
  }
  if (summary.genericValidatorReadyFollowupCompilerCompetitionCount !== 6) {
    throw new Error("master bundle genericValidatorReadyFollowupCompilerCompetitionCount mismatch");
  }
  if (summary.priority1RepairCompilerCompetitionCount !== 6) {
    throw new Error("master bundle priority1RepairCompilerCompetitionCount mismatch");
  }
  if (summary.standingsFirstCompilerCompetitionCount !== 2) {
    throw new Error("master bundle standingsFirstCompilerCompetitionCount mismatch");
  }
  if (summary.cupStateCompilerCompetitionCount !== 3) {
    throw new Error("master bundle cupStateCompilerCompetitionCount mismatch");
  }
  if (summary.policyReductionCompilerCompetitionCount !== 2) {
    throw new Error("master bundle policyReductionCompilerCompetitionCount mismatch");
  }

  assertSummary(summary, "fetchAllowedNowCount", 0);
  assertSummary(summary, "searchAllowedNowCount", 0);
  assertSummary(summary, "broadSearchAllowedNowCount", 0);
  assertSummary(summary, "zeroResultMayImplyAbsenceCount", 0);
  assertSummary(summary, "canonicalWriteEligibleNowCount", 0);
  assertSummary(summary, "activeAssertedCount", 0);
  assertSummary(summary, "inactiveAssertedCount", 0);
  assertSummary(summary, "completedAssertedCount", 0);
  assertSummary(summary, "canonicalWrites", 0);
  assertSummary(summary, "productionWrite", false);
}

function loadFollowupLane(masterBundle, lane) {
  const expected = EXPECTED_FOLLOWUP_LANES[lane];
  const outputRef = findCompilerOutputFile(masterBundle, lane);
  const file = readJson(outputRef.outputFile);
  const rows = extractRows(file, lane);

  if (rows.length !== expected.expectedRows) {
    throw new Error(lane + ": expected " + expected.expectedRows + " rows, got " + rows.length);
  }

  const normalizedRows = rows.map((row, index) => {
    const slugs = extractSlugs(row);
    const key = compilerGroupingKey(row, lane, index);
    assertNoUnsafeInput(row, lane, key);

    if (slugs.length < 1) {
      throw new Error(lane + "/" + key + ": competition slugs must be non-empty");
    }

    return {
      sourceCompilerLane: lane,
      sourceCompilerOutputFile: outputRef.outputFile,
      sourceCompilerGroupingKey: key,
      sourceCompilerRowIndex: index + 1,
      competitionSlugs: slugs,
      competitionCount: slugs.length,
      slugPrefixes: extractSlugPrefixes(row, slugs),
      regions: extractRegions(row),
      requiredEvidenceRoles: extractEvidenceRoles(row, lane),
      sourceRowStatus:
        row.compilerStatus ||
        row.workstreamStatus ||
        row.status ||
        "source_only_followup_compiler_row_loaded"
    };
  });

  const uniqueSlugs = uniqueSorted(normalizedRows.flatMap((row) => row.competitionSlugs));
  if (uniqueSlugs.length !== expected.expectedCompetitions) {
    throw new Error(lane + ": expected " + expected.expectedCompetitions + " unique competitions, got " + uniqueSlugs.length);
  }

  return {
    lane,
    expected,
    outputFile: outputRef.outputFile,
    rows: normalizedRows,
    uniqueSlugs
  };
}

function buildBatchPlanRows(loadedLane) {
  const lane = loadedLane.lane;
  const expected = loadedLane.expected;

  return loadedLane.rows.map((row, index) => ({
    followupBatchPlanLane: expected.outputBatchPlanLane,
    sourceCompilerLane: lane,
    sourceCompilerOutputFile: row.sourceCompilerOutputFile,
    followupBatchPlanStatus: expected.batchPlanStatus,
    followupBatchPlanIndex: index + 1,
    followupBatchGroupKey: expected.outputBatchPlanLane + "::" + row.sourceCompilerGroupingKey,
    followupIntent: expected.followupIntent,
    sourceCompilerGroupingKey: row.sourceCompilerGroupingKey,
    sourceCompilerRowIndex: row.sourceCompilerRowIndex,
    competitionCount: row.competitionCount,
    competitionSlugs: row.competitionSlugs,
    slugPrefixes: row.slugPrefixes,
    regions: row.regions,
    requiredEvidenceRoles: row.requiredEvidenceRoles,
    sourceRowStatus: row.sourceRowStatus,
    followupExecutionMode: "source_only_followup_batch_plan_not_executed",
    sourceOnly: true,
    followupExecutionAllowedNow: false,
    fetchAllowedNow: false,
    searchAllowedNow: false,
    broadSearchAllowedNow: false,
    controlledDiscoveryAllowedNow: false,
    canonicalPromotionAllowedNow: false,
    suppressionWriteAllowedNow: false,
    zeroResultMayImplyAbsence: false,
    canonicalWriteEligibleNow: false,
    productionWrite: false,
    truthAssertionsAllowedNow: false,
    activeAssertedNow: false,
    inactiveAssertedNow: false,
    completedAssertedNow: false,
    followupGuardrails: [
      "source_only",
      "not_executed",
      "no_fetch",
      "no_search",
      "no_broad_search",
      "controlled_discovery_disabled",
      "canonical_promotion_disabled",
      "suppression_write_disabled",
      "zero_result_not_absence",
      "no_canonical_write",
      "no_production_write",
      "no_active_inactive_completed_assertion",
      "no_route_fixture_standings_season_state_truth_assertion"
    ]
  }));
}

function writeLaneOutput({ outputDir, date, lane, rows }) {
  const uniqueSlugs = uniqueSorted(rows.flatMap((row) => row.competitionSlugs));
  const filePath = path.join(
    outputDir,
    "followup-lane-batch-plan-output-" + lane + "-" + date + ".json"
  ).replaceAll("\\", "/");

  const output = {
    generatedAt: new Date().toISOString(),
    date,
    job: "build-football-truth-followup-lane-batch-plan-bundle-file",
    mode: "source_only_followup_lane_batch_plan_output_no_fetch_no_search_no_writes_no_truth_assertions",
    followupBatchPlanLane: lane,
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    summary: {
      followupBatchPlanLane: lane,
      followupBatchPlanRowCount: rows.length,
      followupBatchPlanCompetitionCount: uniqueSlugs.length,
      followupBatchPlanUniqueCompetitionCount: uniqueSlugs.length,
      slugPrefixCount: uniqueSorted(rows.flatMap((row) => row.slugPrefixes)).length,
      regionCount: uniqueSorted(rows.flatMap((row) => row.regions)).length,
      requiredEvidenceRoleCount: uniqueSorted(rows.flatMap((row) => row.requiredEvidenceRoles)).length,
      followupExecutionAllowedNowCount: 0,
      fetchAllowedNowCount: 0,
      searchAllowedNowCount: 0,
      broadSearchAllowedNowCount: 0,
      controlledDiscoveryAllowedNowCount: 0,
      canonicalPromotionAllowedNowCount: 0,
      suppressionWriteAllowedNowCount: 0,
      zeroResultMayImplyAbsenceCount: 0,
      canonicalWriteEligibleNowCount: 0,
      activeAssertedCount: 0,
      inactiveAssertedCount: 0,
      completedAssertedCount: 0,
      canonicalWrites: 0,
      productionWrite: false
    },
    counts: {
      byRegion: countBy(rows.flatMap((row) => row.regions.map((region) => ({ region }))), "region"),
      byFollowupIntent: countBy(rows, "followupIntent"),
      byFollowupExecutionMode: countBy(rows, "followupExecutionMode")
    },
    guardrails: [
      "This is a source-only follow-up batch plan output.",
      "It is not an execution run.",
      "No fetch/search/write/truth assertion is performed.",
      "Controlled discovery remains disabled.",
      "Canonical promotion remains disabled.",
      "Suppression writes remain disabled.",
      "Zero result must not imply absence.",
      "No match today must not imply inactive.",
      "Match status must not be used as season-state truth."
    ],
    rows
  };

  fs.writeFileSync(filePath, stableJson(output));

  return {
    followupBatchPlanLane: lane,
    outputFile: filePath,
    followupBatchPlanRowCount: output.summary.followupBatchPlanRowCount,
    followupBatchPlanCompetitionCount: output.summary.followupBatchPlanCompetitionCount,
    followupBatchPlanUniqueCompetitionCount: output.summary.followupBatchPlanUniqueCompetitionCount,
    slugPrefixCount: output.summary.slugPrefixCount,
    regionCount: output.summary.regionCount,
    followupExecutionAllowedNow: false,
    fetchAllowedNow: false,
    searchAllowedNow: false,
    broadSearchAllowedNow: false,
    controlledDiscoveryAllowedNow: false,
    canonicalPromotionAllowedNow: false,
    suppressionWriteAllowedNow: false,
    zeroResultMayImplyAbsence: false,
    canonicalWriteEligibleNow: false,
    productionWrite: false
  };
}

function main() {
  const args = parseArgs(process.argv);
  const primaryGate = readJson(args.primaryGate);
  const masterBundle = readJson(args.masterBundle);

  validatePrimaryGate(primaryGate);
  validateMasterBundle(masterBundle);

  const outputDir = path.dirname(args.output);
  fs.mkdirSync(outputDir, { recursive: true });

  const loadedLanes = Object.keys(EXPECTED_FOLLOWUP_LANES).map((lane) =>
    loadFollowupLane(masterBundle, lane)
  );

  const allBatchRows = [];
  const followupBatchPlanOutputFiles = [];

  for (const loadedLane of loadedLanes) {
    const batchRows = buildBatchPlanRows(loadedLane);
    const expected = loadedLane.expected;

    if (batchRows.length !== expected.expectedRows) {
      throw new Error(loadedLane.lane + ": batch rows mismatch");
    }

    const uniqueSlugs = uniqueSorted(batchRows.flatMap((row) => row.competitionSlugs));
    if (uniqueSlugs.length !== expected.expectedCompetitions) {
      throw new Error(loadedLane.lane + ": batch unique competition mismatch");
    }

    allBatchRows.push(...batchRows);

    followupBatchPlanOutputFiles.push(writeLaneOutput({
      outputDir,
      date: args.date,
      lane: expected.outputBatchPlanLane,
      rows: batchRows
    }));
  }

  const allFollowupSlugs = uniqueSorted(allBatchRows.flatMap((row) => row.competitionSlugs));

  if (allBatchRows.length !== FOLLOWUP_BATCH_ROW_COUNT) {
    throw new Error("Expected " + FOLLOWUP_BATCH_ROW_COUNT + " follow-up batch rows, got " + allBatchRows.length);
  }

  if (allFollowupSlugs.length !== FOLLOWUP_COMPETITION_COUNT) {
    throw new Error("Expected " + FOLLOWUP_COMPETITION_COUNT + " unique follow-up competitions, got " + allFollowupSlugs.length);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-followup-lane-batch-plan-bundle-file",
    mode: "source_only_followup_lane_batch_plan_bundle_for_remaining_42_competitions_no_fetch_no_search_no_writes_no_truth_assertions",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      primaryBatchRunnerManifestQualityGate: args.primaryGate,
      masterCompilerLaneBundle: args.masterBundle
    },
    summary: {
      retainedRawMapCompetitionCount: RETAINED_RAW_MAP_COUNT,
      competitionCount: RETAINED_RAW_MAP_COUNT,
      activeExecutionWaveCompetitionCount: ACTIVE_COMPETITION_COUNT,
      scopeAccountingNoActionCompetitionCount: SCOPE_ACCOUNTING_NO_ACTION_COUNT,
      primaryRunnerManifestQualityGateCompetitionReferenceCount: PRIMARY_COMPETITION_COUNT,

      followupBatchPlanLaneCount: followupBatchPlanOutputFiles.length,
      followupBatchPlanOutputFileCount: followupBatchPlanOutputFiles.length,
      followupBatchPlanRowCount: allBatchRows.length,
      followupBatchPlanCompetitionReferenceCount: allFollowupSlugs.length,
      followupBatchPlanUniqueCompetitionCount: allFollowupSlugs.length,
      remainingFollowupLaneCompetitionCount: FOLLOWUP_COMPETITION_COUNT,

      blockedSourceTracebackFollowupCompetitionCount: 23,
      genericValidatorReadyFollowupCompetitionCount: 6,
      priority1ReusableFamilyRepairFollowupCompetitionCount: 6,
      standingsFirstContractReviewFollowupCompetitionCount: 2,
      cupStateFinalWinnerReviewFollowupCompetitionCount: 3,
      policyReductionGovernanceFollowupCompetitionCount: 2,

      currentEffectiveMapExactCountAsserted: false,
      currentEffectiveMapExactCount: null,
      sourceDiscoveryConfirmedActionableCompetitionCount: 0,
      actionableConfirmedNowCount: 0,
      contractConfirmedNowCount: 0,
      validatedRouteMapCount: 0,
      validatedFixtureContractCount: 0,
      validatedStandingsContractCount: 0,
      validatedSeasonStateContractCount: 0,

      followupExecutionAllowedNowCount: 0,
      runnerManifestExecutionAllowedNowCount: 0,
      fetchAllowedNowCount: 0,
      searchAllowedNowCount: 0,
      broadSearchAllowedNowCount: 0,
      controlledDiscoveryAllowedNowCount: 0,
      canonicalPromotionAllowedNowCount: 0,
      suppressionWriteAllowedNowCount: 0,
      zeroResultMayImplyAbsenceCount: 0,
      canonicalWriteEligibleNowCount: 0,
      activeAssertedCount: 0,
      inactiveAssertedCount: 0,
      completedAssertedCount: 0,
      canonicalWrites: 0,
      productionWrite: false,

      recommendedNextLane: "run_source_only_followup_lane_batch_plan_quality_gate_then_build_followup_runner_manifest_bundle_without_fetch"
    },
    counts: {
      byFollowupBatchPlanLane: countBy(allBatchRows, "followupBatchPlanLane"),
      bySourceCompilerLane: countBy(allBatchRows, "sourceCompilerLane"),
      byFollowupIntent: countBy(allBatchRows, "followupIntent"),
      byFollowupExecutionMode: countBy(allBatchRows, "followupExecutionMode"),
      byRegion: countBy(allBatchRows.flatMap((row) => row.regions.map((region) => ({ region }))), "region")
    },
    guardrails: [
      "This bundle builds all follow-up lane batch plans together.",
      "It covers the 42 non-primary active competitions after the 473 primary competition manifest gate passed.",
      "It does not execute fetch/search/write.",
      "Runner execution remains disabled.",
      "Controlled discovery remains disabled.",
      "Canonical promotion remains disabled.",
      "Suppression writes remain disabled.",
      "It does not assert source discovery, actionable scope, contracts, route, fixture, standings, season-state, active, inactive, or completed truth.",
      "Zero result must not imply absence.",
      "No match today must not imply inactive.",
      "Match status must not be used as season-state truth."
    ],
    followupBatchPlanOutputFiles,
    followupBatchRows: allBatchRows
  };

  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    retainedRawMapCompetitionCount: output.summary.retainedRawMapCompetitionCount,
    competitionCount: output.summary.competitionCount,
    activeExecutionWaveCompetitionCount: output.summary.activeExecutionWaveCompetitionCount,
    scopeAccountingNoActionCompetitionCount: output.summary.scopeAccountingNoActionCompetitionCount,
    primaryRunnerManifestQualityGateCompetitionReferenceCount: output.summary.primaryRunnerManifestQualityGateCompetitionReferenceCount,
    followupBatchPlanLaneCount: output.summary.followupBatchPlanLaneCount,
    followupBatchPlanOutputFileCount: output.summary.followupBatchPlanOutputFileCount,
    followupBatchPlanRowCount: output.summary.followupBatchPlanRowCount,
    followupBatchPlanCompetitionReferenceCount: output.summary.followupBatchPlanCompetitionReferenceCount,
    followupBatchPlanUniqueCompetitionCount: output.summary.followupBatchPlanUniqueCompetitionCount,
    remainingFollowupLaneCompetitionCount: output.summary.remainingFollowupLaneCompetitionCount,
    blockedSourceTracebackFollowupCompetitionCount: output.summary.blockedSourceTracebackFollowupCompetitionCount,
    genericValidatorReadyFollowupCompetitionCount: output.summary.genericValidatorReadyFollowupCompetitionCount,
    priority1ReusableFamilyRepairFollowupCompetitionCount: output.summary.priority1ReusableFamilyRepairFollowupCompetitionCount,
    standingsFirstContractReviewFollowupCompetitionCount: output.summary.standingsFirstContractReviewFollowupCompetitionCount,
    cupStateFinalWinnerReviewFollowupCompetitionCount: output.summary.cupStateFinalWinnerReviewFollowupCompetitionCount,
    policyReductionGovernanceFollowupCompetitionCount: output.summary.policyReductionGovernanceFollowupCompetitionCount,
    currentEffectiveMapExactCountAsserted: output.summary.currentEffectiveMapExactCountAsserted,
    currentEffectiveMapExactCount: output.summary.currentEffectiveMapExactCount,
    sourceDiscoveryConfirmedActionableCompetitionCount: output.summary.sourceDiscoveryConfirmedActionableCompetitionCount,
    actionableConfirmedNowCount: output.summary.actionableConfirmedNowCount,
    contractConfirmedNowCount: output.summary.contractConfirmedNowCount,
    validatedRouteMapCount: output.summary.validatedRouteMapCount,
    validatedFixtureContractCount: output.summary.validatedFixtureContractCount,
    validatedStandingsContractCount: output.summary.validatedStandingsContractCount,
    validatedSeasonStateContractCount: output.summary.validatedSeasonStateContractCount,
    followupExecutionAllowedNowCount: output.summary.followupExecutionAllowedNowCount,
    runnerManifestExecutionAllowedNowCount: output.summary.runnerManifestExecutionAllowedNowCount,
    fetchAllowedNowCount: output.summary.fetchAllowedNowCount,
    searchAllowedNowCount: output.summary.searchAllowedNowCount,
    broadSearchAllowedNowCount: output.summary.broadSearchAllowedNowCount,
    controlledDiscoveryAllowedNowCount: output.summary.controlledDiscoveryAllowedNowCount,
    canonicalPromotionAllowedNowCount: output.summary.canonicalPromotionAllowedNowCount,
    suppressionWriteAllowedNowCount: output.summary.suppressionWriteAllowedNowCount,
    zeroResultMayImplyAbsenceCount: output.summary.zeroResultMayImplyAbsenceCount,
    canonicalWriteEligibleNowCount: output.summary.canonicalWriteEligibleNowCount,
    activeAssertedCount: output.summary.activeAssertedCount,
    inactiveAssertedCount: output.summary.inactiveAssertedCount,
    completedAssertedCount: output.summary.completedAssertedCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
