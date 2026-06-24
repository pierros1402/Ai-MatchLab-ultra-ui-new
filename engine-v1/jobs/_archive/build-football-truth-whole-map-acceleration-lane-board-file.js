#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_READINESS =
  "data/football-truth/_diagnostics/full-map-exploration-readiness-board-2026-06-14/full-map-exploration-readiness-board-2026-06-14.json";

const DEFAULT_ADAPTER =
  "data/football-truth/_diagnostics/generic-validator-batch-execution-adapter-2026-06-14/generic-validator-batch-execution-adapter-2026-06-14.json";

const DEFAULT_ACCELERATION =
  "data/football-truth/_diagnostics/configured-family-acceleration-board-2026-06-14/configured-family-acceleration-board-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/whole-map-acceleration-lane-board-2026-06-14/whole-map-acceleration-lane-board-2026-06-14.json";

const RETAINED_RAW_MAP_COUNT = 689;

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    readiness: DEFAULT_READINESS,
    adapter: DEFAULT_ADAPTER,
    acceleration: DEFAULT_ACCELERATION,
    output: DEFAULT_OUTPUT
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--readiness") args.readiness = argv[++i];
    else if (arg === "--adapter") args.adapter = argv[++i];
    else if (arg === "--acceleration") args.acceleration = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing JSON input: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
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

function assertIfPresent(summary, key, expected) {
  if (!summary || !(key in summary)) return;
  if (summary[key] !== expected) {
    throw new Error(`Guardrail failed for ${key}: expected ${expected}, got ${summary[key]}`);
  }
}

function sourceRowsFromReadiness(readiness) {
  if (Array.isArray(readiness.explorationRows)) return readiness.explorationRows;
  if (Array.isArray(readiness.rows)) return readiness.rows;
  if (Array.isArray(readiness.planRows)) return readiness.planRows;
  throw new Error("Could not locate full-map rows in readiness input");
}

function slugOf(row) {
  return String(row.competitionSlug || row.slug || row.normalizedCompetitionSlug || "").trim();
}

function prefixOf(slug) {
  const match = String(slug || "").match(/^([a-z]{2,3})\./i);
  return match ? match[1].toLowerCase() : "__missing_prefix__";
}

function safeText(value, fallback = "__missing__") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function lanePriority(lane) {
  const order = {
    generic_validator_engine_ready_config_only_no_contract_assertion: 10,
    configured_family_standings_first_not_full_contract: 20,
    priority1_full_contract_candidate_review_no_write: 30,
    priority1_family_repair_needed: 35,
    truth_review_existing_signals_batch: 40,
    cup_state_review_batch: 45,
    source_authority_template_grouping_batch: 50,
    policy_reduction_candidate_batch: 60,
    registry_gap_review_batch: 70,
    covered_no_action: 80,
    suppressed_low_value_no_active_work: 90,
    blocked_configured_family_needs_source_traceback_not_absence: 95,
    unknown_or_unclassified_whole_map_lane: 999
  };

  return order[lane] || 999;
}

function classifyWholeMapLane(row, overlays) {
  const slug = row.competitionSlug;
  const explorationLane = safeText(row.explorationLane);
  const inventoryBucket = safeText(row.inventoryBucket);
  const reusableFamily = safeText(row.reusableFamily, "");

  if (overlays.genericEngineReadySlugs.has(slug)) {
    return {
      wholeMapLane: "generic_validator_engine_ready_config_only_no_contract_assertion",
      executionSuperLane: "generic_validator_ready_batch",
      laneReason: "existing generic engine adapter marked this competition ready for reusable-family validator configuration, but no contract was validated yet"
    };
  }

  if (reusableFamily === "bundesliga") {
    return {
      wholeMapLane: "configured_family_standings_first_not_full_contract",
      executionSuperLane: "standings_first_contract_batch",
      laneReason: "Bundesliga family has standings-first candidates but is not a full fixture/standings/season-state contract"
    };
  }

  if (reusableFamily === "trusted_fetch_review_route") {
    return {
      wholeMapLane: "blocked_configured_family_needs_source_traceback_not_absence",
      executionSuperLane: "source_traceback_blocked_batch",
      laneReason: "trusted_fetch_review_route was proven to be diagnostic echo only; blocked here does not mean competition absence"
    };
  }

  if (explorationLane === "priority1_full_contract_candidate_no_canonical_write") {
    return {
      wholeMapLane: "priority1_full_contract_candidate_review_no_write",
      executionSuperLane: "priority1_full_contract_review_batch",
      laneReason: "priority-1 family has full diagnostic candidate but still needs separate strict contract/canonical gate"
    };
  }

  if (explorationLane === "priority1_reusable_repair_lane") {
    return {
      wholeMapLane: "priority1_family_repair_needed",
      executionSuperLane: "priority1_family_repair_batch",
      laneReason: "configured priority-1 reusable family has missing contract part and needs family-level repair"
    };
  }

  if (explorationLane === "truth_review_lane" || inventoryBucket === "truth_review_batch_candidate" || inventoryBucket === "signals_available_needs_truth_review") {
    return {
      wholeMapLane: "truth_review_existing_signals_batch",
      executionSuperLane: "truth_review_batch",
      laneReason: "existing signals require truth review, not broad search"
    };
  }

  if (explorationLane === "cup_winner_or_cup_state_review_lane" || inventoryBucket === "cup_final_winner_evidence_batch_candidate") {
    return {
      wholeMapLane: "cup_state_review_batch",
      executionSuperLane: "cup_state_batch",
      laneReason: "cup/final/winner state needs cup-specific evidence review"
    };
  }

  if (explorationLane === "registry_gap_review_lane" || inventoryBucket === "registry_gap_review_candidate") {
    return {
      wholeMapLane: "registry_gap_review_batch",
      executionSuperLane: "registry_gap_batch",
      laneReason: "registry/type gap must be resolved before validator or discovery execution"
    };
  }

  if (
    explorationLane === "source_discovery_planning_lane" ||
    explorationLane === "league_full_contract_exploration_lane" ||
    inventoryBucket === "provider_discovery_validation_batch_candidate" ||
    inventoryBucket === "full_map_missing_required_data"
  ) {
    return {
      wholeMapLane: "source_authority_template_grouping_batch",
      executionSuperLane: "source_authority_grouping_batch",
      laneReason: "requires source-authority/provider-family template grouping before any controlled search/fetch"
    };
  }

  if (
    explorationLane === "full_map_manual_classification_avoid_bespoke_execution" ||
    inventoryBucket === "future_policy_reduction_candidate" ||
    inventoryBucket === "manual_classification_candidate"
  ) {
    return {
      wholeMapLane: "policy_reduction_candidate_batch",
      executionSuperLane: "policy_reduction_batch",
      laneReason: "candidate for policy reduction/no-market/no-product-value/non-existent review"
    };
  }

  if (explorationLane === "covered_no_action" || inventoryBucket === "covered_no_action") {
    return {
      wholeMapLane: "covered_no_action",
      executionSuperLane: "covered_no_action_batch",
      laneReason: "already covered/no immediate action"
    };
  }

  if (explorationLane === "suppressed_low_value_no_active_work" || inventoryBucket === "suppressed_low_value_no_active_work") {
    return {
      wholeMapLane: "suppressed_low_value_no_active_work",
      executionSuperLane: "suppressed_no_active_work_batch",
      laneReason: "suppressed by current low-value policy; not deleted and not absence"
    };
  }

  return {
    wholeMapLane: "unknown_or_unclassified_whole_map_lane",
    executionSuperLane: "unclassified_review_batch",
    laneReason: "no high-confidence lane matched; keep source-only and classify later"
  };
}

function buildBatchRows(laneRows) {
  const groups = new Map();

  for (const row of laneRows) {
    const groupKey = [
      row.executionSuperLane,
      row.reusableFamily || "__no_family__",
      row.slugPrefix || "__no_prefix__"
    ].join("::");

    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(row);
  }

  return [...groups.entries()]
    .map(([groupKey, rows], index) => {
      const lane = rows[0].wholeMapLane;
      const superLane = rows[0].executionSuperLane;

      return {
        batchId: `whole_map_${String(index + 1).padStart(3, "0")}_${superLane}_${rows[0].reusableFamily || rows[0].slugPrefix}`,
        groupKey,
        wholeMapLane: lane,
        executionSuperLane: superLane,
        competitionCount: rows.length,
        competitionSlugs: uniqueSorted(rows.map((row) => row.competitionSlug)),
        reusableFamilies: uniqueSorted(rows.map((row) => row.reusableFamily).filter((value) => value !== "__missing__")),
        slugPrefixes: uniqueSorted(rows.map((row) => row.slugPrefix)),
        fetchAllowedNow: false,
        searchAllowedNow: false,
        broadSearchAllowedNow: false,
        zeroResultMayImplyAbsence: false,
        canonicalWriteEligibleNow: false,
        productionWrite: false,
        sampleRows: rows.slice(0, 25).map((row) => ({
          competitionSlug: row.competitionSlug,
          wholeMapLane: row.wholeMapLane,
          explorationLane: row.explorationLane,
          inventoryBucket: row.inventoryBucket,
          reusableFamily: row.reusableFamily
        }))
      };
    })
    .sort((a, b) => {
      const pa = lanePriority(a.wholeMapLane);
      const pb = lanePriority(b.wholeMapLane);
      if (pa !== pb) return pa - pb;
      if (b.competitionCount !== a.competitionCount) return b.competitionCount - a.competitionCount;
      return a.groupKey.localeCompare(b.groupKey);
    });
}

function main() {
  const args = parseArgs(process.argv);
  const readiness = readJson(args.readiness);
  const adapter = readJson(args.adapter);
  const acceleration = readJson(args.acceleration);

  const readinessSummary = readiness.summary || {};
  const adapterSummary = adapter.summary || {};
  const accelerationSummary = acceleration.summary || {};

  assertIfPresent(readinessSummary, "retainedRawMapCompetitionCount", RETAINED_RAW_MAP_COUNT);
  assertIfPresent(readinessSummary, "competitionCount", RETAINED_RAW_MAP_COUNT);
  assertIfPresent(readinessSummary, "currentEffectiveMapExactCountAsserted", false);
  assertIfPresent(readinessSummary, "currentEffectiveMapExactCount", null);
  assertIfPresent(readinessSummary, "sourceDiscoveryConfirmedActionableCompetitionCount", 0);
  assertIfPresent(readinessSummary, "fetchAllowedNowCount", 0);
  assertIfPresent(readinessSummary, "searchAllowedNowCount", 0);
  assertIfPresent(readinessSummary, "broadSearchAllowedNowCount", 0);
  assertIfPresent(readinessSummary, "canonicalWriteEligibleNowCount", 0);

  assertIfPresent(adapterSummary, "targetFamilyCount", 3);
  assertIfPresent(adapterSummary, "targetCompetitionCount", 6);
  assertIfPresent(adapterSummary, "engineReadyRowCount", 6);
  assertIfPresent(adapterSummary, "engineValidationRunPerformed", false);
  assertIfPresent(adapterSummary, "fetchAllowedNowCount", 0);
  assertIfPresent(adapterSummary, "searchAllowedNowCount", 0);
  assertIfPresent(adapterSummary, "canonicalWriteEligibleNowCount", 0);
  assertIfPresent(adapterSummary, "canonicalWrites", 0);
  assertIfPresent(adapterSummary, "productionWrite", false);

  assertIfPresent(accelerationSummary, "configuredReusableFamilyApplyCompetitionCount", 31);
  assertIfPresent(accelerationSummary, "blockedNotConfirmedCompetitionCount", 23);
  assertIfPresent(accelerationSummary, "executableCandidateCompetitionCount", 8);
  assertIfPresent(accelerationSummary, "fetchAllowedNowCount", 0);
  assertIfPresent(accelerationSummary, "searchAllowedNowCount", 0);
  assertIfPresent(accelerationSummary, "canonicalWriteEligibleNowCount", 0);

  const rawRows = sourceRowsFromReadiness(readiness);
  const deduped = new Map();

  for (const rawRow of rawRows) {
    const slug = slugOf(rawRow);
    if (!slug || deduped.has(slug)) continue;

    deduped.set(slug, {
      ...rawRow,
      competitionSlug: slug,
      slugPrefix: prefixOf(slug),
      competitionType: safeText(rawRow.competitionType, "unknown"),
      explorationLane: safeText(rawRow.explorationLane),
      inventoryBucket: safeText(rawRow.inventoryBucket),
      reusableFamily: safeText(rawRow.reusableFamily, "")
    });
  }

  const rows = [...deduped.values()].sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  if (rows.length !== RETAINED_RAW_MAP_COUNT) {
    throw new Error(`Expected ${RETAINED_RAW_MAP_COUNT} full-map rows, got ${rows.length}`);
  }

  const engineRows = Array.isArray(adapter.engineRows) ? adapter.engineRows : [];
  const genericEngineReadySlugs = new Set(
    engineRows
      .filter((row) => row.engineAction === "ready_for_reusable_family_validator")
      .map((row) => String(row.competitionSlug || "").trim())
      .filter(Boolean)
  );

  const overlays = { genericEngineReadySlugs };

  const laneRows = rows.map((row) => {
    const classification = classifyWholeMapLane(row, overlays);

    return {
      competitionSlug: row.competitionSlug,
      slugPrefix: row.slugPrefix,
      competitionType: row.competitionType,
      inventoryBucket: row.inventoryBucket,
      explorationLane: row.explorationLane,
      reusableFamily: row.reusableFamily || "__missing__",
      wholeMapLane: classification.wholeMapLane,
      executionSuperLane: classification.executionSuperLane,
      laneReason: classification.laneReason,
      actionableConfirmedNow: false,
      contractConfirmedNow: false,
      familyApplicabilityAssertedNow: false,
      validatedRouteMapNow: false,
      validatedFixtureContractNow: false,
      validatedStandingsContractNow: false,
      validatedSeasonStateContractNow: false,
      activeAssertedNow: false,
      inactiveAssertedNow: false,
      completedAssertedNow: false,
      fetchAllowedNow: false,
      searchAllowedNow: false,
      broadSearchAllowedNow: false,
      zeroResultMayImplyAbsence: false,
      canonicalWriteEligibleNow: false,
      canonicalWrites: 0,
      productionWrite: false
    };
  }).sort((a, b) => {
    const pa = lanePriority(a.wholeMapLane);
    const pb = lanePriority(b.wholeMapLane);
    if (pa !== pb) return pa - pb;
    return a.competitionSlug.localeCompare(b.competitionSlug);
  });

  const batchRows = buildBatchRows(laneRows);

  const highVolumeLaneRows = laneRows.filter((row) =>
    [
      "truth_review_existing_signals_batch",
      "source_authority_template_grouping_batch",
      "policy_reduction_candidate_batch",
      "registry_gap_review_batch",
      "cup_state_review_batch"
    ].includes(row.wholeMapLane)
  );

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-whole-map-acceleration-lane-board-file",
    mode: "source_only_whole_map_acceleration_lane_board_all_689_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      fullMapReadinessBoard: args.readiness,
      genericValidatorBatchExecutionAdapter: args.adapter,
      configuredFamilyAccelerationBoard: args.acceleration
    },
    summary: {
      retainedRawMapCompetitionCount: RETAINED_RAW_MAP_COUNT,
      competitionCount: rows.length,
      wholeMapLaneRowCount: laneRows.length,
      currentEffectiveMapExactCountAsserted: false,
      currentEffectiveMapExactCount: null,
      sourceDiscoveryConfirmedActionableCompetitionCount: 0,

      genericValidatorReadyCompetitionCount: laneRows.filter((row) =>
        row.wholeMapLane === "generic_validator_engine_ready_config_only_no_contract_assertion"
      ).length,
      standingsFirstCompetitionCount: laneRows.filter((row) =>
        row.wholeMapLane === "configured_family_standings_first_not_full_contract"
      ).length,
      blockedConfiguredFamilyCompetitionCount: laneRows.filter((row) =>
        row.wholeMapLane === "blocked_configured_family_needs_source_traceback_not_absence"
      ).length,
      priority1FullContractCandidateReviewCompetitionCount: laneRows.filter((row) =>
        row.wholeMapLane === "priority1_full_contract_candidate_review_no_write"
      ).length,
      priority1FamilyRepairCompetitionCount: laneRows.filter((row) =>
        row.wholeMapLane === "priority1_family_repair_needed"
      ).length,
      truthReviewCompetitionCount: laneRows.filter((row) =>
        row.wholeMapLane === "truth_review_existing_signals_batch"
      ).length,
      cupStateReviewCompetitionCount: laneRows.filter((row) =>
        row.wholeMapLane === "cup_state_review_batch"
      ).length,
      sourceAuthorityTemplateGroupingCompetitionCount: laneRows.filter((row) =>
        row.wholeMapLane === "source_authority_template_grouping_batch"
      ).length,
      policyReductionCandidateCompetitionCount: laneRows.filter((row) =>
        row.wholeMapLane === "policy_reduction_candidate_batch"
      ).length,
      registryGapReviewCompetitionCount: laneRows.filter((row) =>
        row.wholeMapLane === "registry_gap_review_batch"
      ).length,
      coveredNoActionCompetitionCount: laneRows.filter((row) =>
        row.wholeMapLane === "covered_no_action"
      ).length,
      suppressedLowValueCompetitionCount: laneRows.filter((row) =>
        row.wholeMapLane === "suppressed_low_value_no_active_work"
      ).length,
      unclassifiedCompetitionCount: laneRows.filter((row) =>
        row.wholeMapLane === "unknown_or_unclassified_whole_map_lane"
      ).length,

      highVolumeLaneCompetitionCount: highVolumeLaneRows.length,
      batchRowCount: batchRows.length,

      actionableConfirmedNowCount: 0,
      contractConfirmedNowCount: 0,
      familyApplicabilityAssertedNowCount: 0,
      validatedRouteMapCount: 0,
      validatedFixtureContractCount: 0,
      validatedStandingsContractCount: 0,
      validatedSeasonStateContractCount: 0,

      fetchAllowedNowCount: 0,
      searchAllowedNowCount: 0,
      broadSearchAllowedNowCount: 0,
      zeroResultMayImplyAbsenceCount: 0,
      canonicalWriteEligibleNowCount: 0,
      activeAssertedCount: 0,
      inactiveAssertedCount: 0,
      completedAssertedCount: 0,
      canonicalWrites: 0,
      productionWrite: false,

      recommendedNextLane: "execute_whole_map_high_volume_lanes_source_only_policy_reduction_and_source_authority_template_batches_before_more_small_validator_steps"
    },
    counts: {
      byWholeMapLane: countBy(laneRows, "wholeMapLane"),
      byExecutionSuperLane: countBy(laneRows, "executionSuperLane"),
      byInventoryBucket: countBy(laneRows, "inventoryBucket"),
      byExplorationLane: countBy(laneRows, "explorationLane"),
      byReusableFamily: countBy(laneRows, "reusableFamily"),
      bySlugPrefix: countBy(laneRows, "slugPrefix")
    },
    guardrails: [
      "This board covers the entire retained raw map of 689 competitions.",
      "The 689 count remains retained raw map, not confirmed actionable scope.",
      "This board replaces tiny per-family progression with whole-map lane execution planning.",
      "No fetch is allowed in this board.",
      "No search is allowed in this board.",
      "No broad search is allowed in this board.",
      "No zero-result outcome may imply competition absence.",
      "No canonical or production data is written.",
      "No active, inactive, completed, actionable, route, fixture, standings, or season-state truth is asserted.",
      "Blocked configured-family rows are not absence; they require upstream source traceback or lane reassignment.",
      "The next step should operate on high-volume whole-map lanes, not another 2-competition or 6-competition bespoke mapper."
    ],
    topBatches: batchRows.slice(0, 30),
    batchRows,
    laneRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    retainedRawMapCompetitionCount: output.summary.retainedRawMapCompetitionCount,
    competitionCount: output.summary.competitionCount,
    wholeMapLaneRowCount: output.summary.wholeMapLaneRowCount,
    currentEffectiveMapExactCountAsserted: output.summary.currentEffectiveMapExactCountAsserted,
    currentEffectiveMapExactCount: output.summary.currentEffectiveMapExactCount,
    sourceDiscoveryConfirmedActionableCompetitionCount: output.summary.sourceDiscoveryConfirmedActionableCompetitionCount,
    genericValidatorReadyCompetitionCount: output.summary.genericValidatorReadyCompetitionCount,
    standingsFirstCompetitionCount: output.summary.standingsFirstCompetitionCount,
    blockedConfiguredFamilyCompetitionCount: output.summary.blockedConfiguredFamilyCompetitionCount,
    priority1FullContractCandidateReviewCompetitionCount: output.summary.priority1FullContractCandidateReviewCompetitionCount,
    priority1FamilyRepairCompetitionCount: output.summary.priority1FamilyRepairCompetitionCount,
    truthReviewCompetitionCount: output.summary.truthReviewCompetitionCount,
    cupStateReviewCompetitionCount: output.summary.cupStateReviewCompetitionCount,
    sourceAuthorityTemplateGroupingCompetitionCount: output.summary.sourceAuthorityTemplateGroupingCompetitionCount,
    policyReductionCandidateCompetitionCount: output.summary.policyReductionCandidateCompetitionCount,
    registryGapReviewCompetitionCount: output.summary.registryGapReviewCompetitionCount,
    coveredNoActionCompetitionCount: output.summary.coveredNoActionCompetitionCount,
    suppressedLowValueCompetitionCount: output.summary.suppressedLowValueCompetitionCount,
    unclassifiedCompetitionCount: output.summary.unclassifiedCompetitionCount,
    highVolumeLaneCompetitionCount: output.summary.highVolumeLaneCompetitionCount,
    batchRowCount: output.summary.batchRowCount,
    actionableConfirmedNowCount: output.summary.actionableConfirmedNowCount,
    contractConfirmedNowCount: output.summary.contractConfirmedNowCount,
    validatedRouteMapCount: output.summary.validatedRouteMapCount,
    validatedFixtureContractCount: output.summary.validatedFixtureContractCount,
    validatedStandingsContractCount: output.summary.validatedStandingsContractCount,
    validatedSeasonStateContractCount: output.summary.validatedSeasonStateContractCount,
    fetchAllowedNowCount: output.summary.fetchAllowedNowCount,
    searchAllowedNowCount: output.summary.searchAllowedNowCount,
    broadSearchAllowedNowCount: output.summary.broadSearchAllowedNowCount,
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
