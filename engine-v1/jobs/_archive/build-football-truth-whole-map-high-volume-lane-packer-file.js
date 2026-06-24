#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/whole-map-acceleration-lane-board-2026-06-14/whole-map-acceleration-lane-board-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/whole-map-high-volume-lane-packer-2026-06-14/whole-map-high-volume-lane-packer-2026-06-14.json";

const RETAINED_RAW_MAP_COUNT = 689;

const SOURCE_AUTHORITY_PACK_SIZE = 80;
const TRUTH_REVIEW_PACK_SIZE = 50;

const PACK_PRIORITY = {
  source_authority_template_grouping_pack: 10,
  truth_review_existing_signals_pack: 20,
  generic_validator_ready_pack: 30,
  priority1_repair_and_full_contract_review_pack: 40,
  standings_first_pack: 45,
  cup_state_review_pack: 50,
  policy_reduction_pack: 55,
  blocked_source_traceback_pack: 60,
  covered_and_suppressed_no_action_pack: 90
};

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--input") args.input = argv[++i];
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

function assertSummary(summary, key, expected) {
  if (!(key in summary)) throw new Error(`Missing summary key: ${key}`);
  if (summary[key] !== expected) {
    throw new Error(`Guardrail failed for ${key}: expected ${expected}, got ${summary[key]}`);
  }
}

function chunkArray(values, size) {
  const chunks = [];
  for (let i = 0; i < values.length; i += size) chunks.push(values.slice(i, i + size));
  return chunks;
}

function prefixRegion(prefix) {
  const europe = new Set([
    "alb","and","arm","aut","aze","bel","bih","blr","bul","cro","cyp","cze","den","eng","esp","est",
    "fin","fra","fro","geo","ger","gib","gre","hun","irl","isl","isr","ita","kaz","kos","lie","ltu",
    "lux","lva","mda","mkd","mlt","mne","ned","nir","nor","pol","por","rou","rus","sco","smr","srb",
    "sui","svk","svn","swe","tur","ukr","wal"
  ]);

  const americas = new Set([
    "arg","aru","atg","bah","ber","blz","bol","bra","brb","can","cay","chi","col","crc","cub","cuw",
    "dma","dom","ecu","grn","gua","guy","hai","hon","jam","mex","nca","pan","par","per","pur","skn",
    "slv","sur","tca","tri","uru","usa","ven","vgb","vir"
  ]);

  const africa = new Set([
    "alg","ang","bdi","ben","bfa","bot","caf","cam","cgo","cha","civ","cmr","cod","com","cpv","cta",
    "dji","egy","eqg","eri","eth","gab","gam","gha","gnb","gui","ken","lbr","lby","les","mad","mar",
    "mli","moz","mri","mtn","mwi","nam","nga","nig","rsa","rwa","sen","sey","sle","som","ssd","stp",
    "sud","swz","tan","tog","tun","uga","zam","zim"
  ]);

  const asia = new Set([
    "afg","ban","bhr","bhu","bru","chn","hkg","idn","ind","irn","irq","jor","jpn","kgz","kor","ksa",
    "kuw","lao","lib","mac","mdv","mng","mya","mys","nep","oma","pak","phi","ple","prk","qat","sgp",
    "sri","syr","tha","tjk","tkm","tls","tpe","uae","uzb","vie","yem"
  ]);

  const oceania = new Set([
    "asa","aus","cok","fij","gum","ncl","nzl","ofc","png","sam","sol","tah","tga","van"
  ]);

  if (europe.has(prefix)) return "europe";
  if (americas.has(prefix)) return "americas";
  if (africa.has(prefix)) return "africa";
  if (asia.has(prefix)) return "asia";
  if (oceania.has(prefix)) return "oceania";
  if (prefix === "afc") return "continental_asia";
  return "unknown_region";
}

function packRows({
  packType,
  laneRows,
  chunkSize,
  sortBy = "region_prefix_slug",
  executionIntent
}) {
  const sortedRows = [...laneRows].sort((a, b) => {
    if (sortBy === "region_prefix_slug") {
      const ra = prefixRegion(a.slugPrefix);
      const rb = prefixRegion(b.slugPrefix);
      if (ra !== rb) return ra.localeCompare(rb);
      if (a.slugPrefix !== b.slugPrefix) return a.slugPrefix.localeCompare(b.slugPrefix);
      return a.competitionSlug.localeCompare(b.competitionSlug);
    }

    return a.competitionSlug.localeCompare(b.competitionSlug);
  });

  return chunkArray(sortedRows, chunkSize).map((rows, index) => {
    const regions = uniqueSorted(rows.map((row) => prefixRegion(row.slugPrefix)));
    const slugPrefixes = uniqueSorted(rows.map((row) => row.slugPrefix));
    const reusableFamilies = uniqueSorted(rows.map((row) => row.reusableFamily).filter((value) =>
      value && value !== "__missing__"
    ));

    return {
      packId: `${packType}_${String(index + 1).padStart(3, "0")}`,
      packType,
      packPriority: PACK_PRIORITY[packType] || 999,
      executionIntent,
      competitionCount: rows.length,
      competitionSlugs: uniqueSorted(rows.map((row) => row.competitionSlug)),
      regions,
      slugPrefixes,
      reusableFamilies,
      wholeMapLanes: uniqueSorted(rows.map((row) => row.wholeMapLane)),
      executionSuperLanes: uniqueSorted(rows.map((row) => row.executionSuperLane)),
      sourceOnly: true,
      fetchAllowedNow: false,
      searchAllowedNow: false,
      broadSearchAllowedNow: false,
      zeroResultMayImplyAbsence: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false,
      actionAllowedNow: "materialize_source_only_pack_inputs_no_truth_assertion",
      blockedActions: [
        "live_fetch",
        "search",
        "broad_search",
        "canonical_write",
        "production_write",
        "zero_result_as_absence",
        "match_status_as_season_state",
        "no_match_today_as_inactive"
      ],
      sampleRows: rows.slice(0, 25).map((row) => ({
        competitionSlug: row.competitionSlug,
        slugPrefix: row.slugPrefix,
        reusableFamily: row.reusableFamily,
        wholeMapLane: row.wholeMapLane,
        inventoryBucket: row.inventoryBucket,
        explorationLane: row.explorationLane
      }))
    };
  });
}

function main() {
  const args = parseArgs(process.argv);
  const board = readJson(args.input);
  const summary = board.summary || {};

  assertSummary(summary, "retainedRawMapCompetitionCount", RETAINED_RAW_MAP_COUNT);
  assertSummary(summary, "competitionCount", RETAINED_RAW_MAP_COUNT);
  assertSummary(summary, "wholeMapLaneRowCount", RETAINED_RAW_MAP_COUNT);
  assertSummary(summary, "currentEffectiveMapExactCountAsserted", false);
  assertSummary(summary, "currentEffectiveMapExactCount", null);
  assertSummary(summary, "sourceDiscoveryConfirmedActionableCompetitionCount", 0);
  assertSummary(summary, "genericValidatorReadyCompetitionCount", 6);
  assertSummary(summary, "standingsFirstCompetitionCount", 2);
  assertSummary(summary, "blockedConfiguredFamilyCompetitionCount", 23);
  assertSummary(summary, "truthReviewCompetitionCount", 101);
  assertSummary(summary, "sourceAuthorityTemplateGroupingCompetitionCount", 372);
  assertSummary(summary, "highVolumeLaneCompetitionCount", 478);
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

  const laneRows = Array.isArray(board.laneRows) ? board.laneRows : [];
  if (laneRows.length !== RETAINED_RAW_MAP_COUNT) {
    throw new Error(`Expected ${RETAINED_RAW_MAP_COUNT} lane rows, got ${laneRows.length}`);
  }

  const byLane = (lane) => laneRows.filter((row) => row.wholeMapLane === lane);

  const sourceAuthorityRows = byLane("source_authority_template_grouping_batch");
  const truthReviewRows = byLane("truth_review_existing_signals_batch");

  const genericValidatorRows = byLane("generic_validator_engine_ready_config_only_no_contract_assertion");
  const standingsFirstRows = byLane("configured_family_standings_first_not_full_contract");
  const priority1Rows = [
    ...byLane("priority1_full_contract_candidate_review_no_write"),
    ...byLane("priority1_family_repair_needed")
  ];
  const cupRows = byLane("cup_state_review_batch");
  const policyRows = byLane("policy_reduction_candidate_batch");
  const blockedRows = byLane("blocked_configured_family_needs_source_traceback_not_absence");
  const coveredSuppressedRows = [
    ...byLane("covered_no_action"),
    ...byLane("suppressed_low_value_no_active_work")
  ];

  const sourceAuthorityPacks = packRows({
    packType: "source_authority_template_grouping_pack",
    laneRows: sourceAuthorityRows,
    chunkSize: SOURCE_AUTHORITY_PACK_SIZE,
    executionIntent: "group_by_region_prefix_and_prepare_source_authority_templates_before_controlled_discovery"
  });

  const truthReviewPacks = packRows({
    packType: "truth_review_existing_signals_pack",
    laneRows: truthReviewRows,
    chunkSize: TRUTH_REVIEW_PACK_SIZE,
    executionIntent: "review_existing_signals_in_large_batches_before_any_new_discovery"
  });

  const genericValidatorPacks = packRows({
    packType: "generic_validator_ready_pack",
    laneRows: genericValidatorRows,
    chunkSize: 50,
    executionIntent: "run_generic_validator_ready_pack_only_after source-only selector inputs exist"
  });

  const priorityRepairPacks = packRows({
    packType: "priority1_repair_and_full_contract_review_pack",
    laneRows: priority1Rows,
    chunkSize: 50,
    executionIntent: "repair_priority1_reusable_families_and_full_contract_candidates_as_group"
  });

  const standingsFirstPacks = packRows({
    packType: "standings_first_pack",
    laneRows: standingsFirstRows,
    chunkSize: 50,
    executionIntent: "validate_standings_first_contracts_separately_from_fixture_and_season_state"
  });

  const cupPacks = packRows({
    packType: "cup_state_review_pack",
    laneRows: cupRows,
    chunkSize: 50,
    executionIntent: "review_cup_final_winner_or_cup_state_evidence"
  });

  const policyPacks = packRows({
    packType: "policy_reduction_pack",
    laneRows: policyRows,
    chunkSize: 50,
    executionIntent: "review_policy_reduction_or_exclusion_candidates_without_deleting_scope"
  });

  const blockedPacks = packRows({
    packType: "blocked_source_traceback_pack",
    laneRows: blockedRows,
    chunkSize: 50,
    executionIntent: "trace_upstream_source_for_blocked_configured_family_rows_not_absence"
  });

  const coveredSuppressedPacks = packRows({
    packType: "covered_and_suppressed_no_action_pack",
    laneRows: coveredSuppressedRows,
    chunkSize: 120,
    executionIntent: "keep_no_action_rows_out_of_active_execution_but_preserve_scope_accounting"
  });

  const packRowsAll = [
    ...sourceAuthorityPacks,
    ...truthReviewPacks,
    ...genericValidatorPacks,
    ...priorityRepairPacks,
    ...standingsFirstPacks,
    ...cupPacks,
    ...policyPacks,
    ...blockedPacks,
    ...coveredSuppressedPacks
  ].sort((a, b) => {
    if (a.packPriority !== b.packPriority) return a.packPriority - b.packPriority;
    if (b.competitionCount !== a.competitionCount) return b.competitionCount - a.competitionCount;
    return a.packId.localeCompare(b.packId);
  });

  const packedSlugSet = new Set(packRowsAll.flatMap((pack) => pack.competitionSlugs));
  if (packedSlugSet.size !== RETAINED_RAW_MAP_COUNT) {
    throw new Error(`Expected packed unique slug count ${RETAINED_RAW_MAP_COUNT}, got ${packedSlugSet.size}`);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-whole-map-high-volume-lane-packer-file",
    mode: "source_only_whole_map_high_volume_lane_packer_compacts_689_into_large_execution_packs_no_fetch_no_search_no_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      wholeMapAccelerationLaneBoard: args.input
    },
    packConfig: {
      sourceAuthorityPackSize: SOURCE_AUTHORITY_PACK_SIZE,
      truthReviewPackSize: TRUTH_REVIEW_PACK_SIZE
    },
    summary: {
      retainedRawMapCompetitionCount: RETAINED_RAW_MAP_COUNT,
      competitionCount: laneRows.length,
      packedUniqueCompetitionCount: packedSlugSet.size,
      sourceDiscoveryConfirmedActionableCompetitionCount: 0,
      currentEffectiveMapExactCountAsserted: false,
      currentEffectiveMapExactCount: null,

      originalWholeMapBatchRowCount: summary.batchRowCount,
      compactedPackCount: packRowsAll.length,

      sourceAuthorityTemplateGroupingCompetitionCount: sourceAuthorityRows.length,
      sourceAuthorityTemplateGroupingPackCount: sourceAuthorityPacks.length,
      truthReviewCompetitionCount: truthReviewRows.length,
      truthReviewPackCount: truthReviewPacks.length,
      genericValidatorReadyCompetitionCount: genericValidatorRows.length,
      genericValidatorPackCount: genericValidatorPacks.length,
      priorityRepairAndFullContractReviewCompetitionCount: priority1Rows.length,
      priorityRepairAndFullContractReviewPackCount: priorityRepairPacks.length,
      standingsFirstCompetitionCount: standingsFirstRows.length,
      standingsFirstPackCount: standingsFirstPacks.length,
      cupStateReviewCompetitionCount: cupRows.length,
      cupStateReviewPackCount: cupPacks.length,
      policyReductionCandidateCompetitionCount: policyRows.length,
      policyReductionPackCount: policyPacks.length,
      blockedSourceTracebackCompetitionCount: blockedRows.length,
      blockedSourceTracebackPackCount: blockedPacks.length,
      coveredAndSuppressedNoActionCompetitionCount: coveredSuppressedRows.length,
      coveredAndSuppressedNoActionPackCount: coveredSuppressedPacks.length,

      highVolumeActivePackCompetitionCount:
        sourceAuthorityRows.length +
        truthReviewRows.length +
        genericValidatorRows.length +
        priority1Rows.length +
        standingsFirstRows.length +
        cupRows.length +
        policyRows.length +
        blockedRows.length,

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

      recommendedNextLane: "run_source_only_source_authority_template_pack_001_then_pack_002_not_small_validator_groups"
    },
    counts: {
      byPackType: countBy(packRowsAll, "packType"),
      byExecutionIntent: countBy(packRowsAll, "executionIntent")
    },
    guardrails: [
      "This packer compacts whole-map execution planning from hundreds of small batches into high-volume packs.",
      "It covers all 689 retained raw map rows.",
      "689 remains retained raw map, not confirmed actionable scope.",
      "No fetch is allowed.",
      "No search is allowed.",
      "No broad search is allowed.",
      "No zero-result outcome may imply absence.",
      "No canonical or production data is written.",
      "No active, inactive, completed, actionable, route, fixture, standings, or season-state truth is asserted.",
      "The next step must start with large source-authority template packs, not bespoke 2-row or 6-row validators."
    ],
    firstRecommendedPack: packRowsAll[0] || null,
    sourceAuthorityPacks,
    truthReviewPacks,
    genericValidatorPacks,
    priorityRepairPacks,
    standingsFirstPacks,
    cupPacks,
    policyPacks,
    blockedPacks,
    coveredSuppressedPacks,
    packRows: packRowsAll
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    retainedRawMapCompetitionCount: output.summary.retainedRawMapCompetitionCount,
    competitionCount: output.summary.competitionCount,
    packedUniqueCompetitionCount: output.summary.packedUniqueCompetitionCount,
    sourceDiscoveryConfirmedActionableCompetitionCount: output.summary.sourceDiscoveryConfirmedActionableCompetitionCount,
    currentEffectiveMapExactCountAsserted: output.summary.currentEffectiveMapExactCountAsserted,
    currentEffectiveMapExactCount: output.summary.currentEffectiveMapExactCount,
    originalWholeMapBatchRowCount: output.summary.originalWholeMapBatchRowCount,
    compactedPackCount: output.summary.compactedPackCount,
    sourceAuthorityTemplateGroupingCompetitionCount: output.summary.sourceAuthorityTemplateGroupingCompetitionCount,
    sourceAuthorityTemplateGroupingPackCount: output.summary.sourceAuthorityTemplateGroupingPackCount,
    truthReviewCompetitionCount: output.summary.truthReviewCompetitionCount,
    truthReviewPackCount: output.summary.truthReviewPackCount,
    genericValidatorReadyCompetitionCount: output.summary.genericValidatorReadyCompetitionCount,
    genericValidatorPackCount: output.summary.genericValidatorPackCount,
    priorityRepairAndFullContractReviewCompetitionCount: output.summary.priorityRepairAndFullContractReviewCompetitionCount,
    priorityRepairAndFullContractReviewPackCount: output.summary.priorityRepairAndFullContractReviewPackCount,
    standingsFirstCompetitionCount: output.summary.standingsFirstCompetitionCount,
    standingsFirstPackCount: output.summary.standingsFirstPackCount,
    cupStateReviewCompetitionCount: output.summary.cupStateReviewCompetitionCount,
    cupStateReviewPackCount: output.summary.cupStateReviewPackCount,
    policyReductionCandidateCompetitionCount: output.summary.policyReductionCandidateCompetitionCount,
    policyReductionPackCount: output.summary.policyReductionPackCount,
    blockedSourceTracebackCompetitionCount: output.summary.blockedSourceTracebackCompetitionCount,
    blockedSourceTracebackPackCount: output.summary.blockedSourceTracebackPackCount,
    coveredAndSuppressedNoActionCompetitionCount: output.summary.coveredAndSuppressedNoActionCompetitionCount,
    coveredAndSuppressedNoActionPackCount: output.summary.coveredAndSuppressedNoActionPackCount,
    highVolumeActivePackCompetitionCount: output.summary.highVolumeActivePackCompetitionCount,
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
