#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/whole-map-high-volume-lane-packer-2026-06-14/whole-map-high-volume-lane-packer-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/whole-map-executable-pack-wave-board-2026-06-14/whole-map-executable-pack-wave-board-2026-06-14.json";

const RETAINED_RAW_MAP_COUNT = 689;

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

function waveForPack(pack) {
  const type = pack.packType;

  if (
    type === "truth_review_existing_signals_pack" ||
    type === "generic_validator_ready_pack" ||
    type === "priority1_repair_and_full_contract_review_pack" ||
    type === "standings_first_pack" ||
    type === "cup_state_review_pack"
  ) {
    return {
      executionWave: "wave_001_high_signal_existing_evidence_and_ready_lanes",
      executionWavePriority: 10,
      waveIntent: "process high-signal existing-evidence lanes together before opening source-authority discovery templates",
      allowedNextAction: "materialize_source_only_review_inputs_for_existing_evidence_and_ready_lanes"
    };
  }

  if (type === "source_authority_template_grouping_pack") {
    return {
      executionWave: "wave_002_source_authority_template_grouping_all_packs",
      executionWavePriority: 20,
      waveIntent: "process all source-authority template grouping packs as one large source-only lane, not one region pack at a time",
      allowedNextAction: "materialize_source_authority_template_inputs_for_all_372_rows"
    };
  }

  if (
    type === "policy_reduction_pack" ||
    type === "blocked_source_traceback_pack"
  ) {
    return {
      executionWave: "wave_003_policy_and_source_traceback_governance",
      executionWavePriority: 30,
      waveIntent: "handle policy-reduction candidates and blocked/source-traceback rows without treating them as absence",
      allowedNextAction: "materialize_policy_and_traceback_review_inputs_no_fetch_no_search"
    };
  }

  if (type === "covered_and_suppressed_no_action_pack") {
    return {
      executionWave: "wave_004_covered_suppressed_scope_accounting_no_action",
      executionWavePriority: 90,
      waveIntent: "preserve scope accounting for covered/suppressed rows without active execution",
      allowedNextAction: "keep_as_scope_accounting_no_active_execution"
    };
  }

  return {
    executionWave: "wave_999_unclassified_pack_review",
    executionWavePriority: 999,
    waveIntent: "unclassified pack requires manual source-only review",
    allowedNextAction: "manual_source_only_pack_classification"
  };
}

function buildWaveRows(packRows) {
  const annotated = packRows.map((pack) => {
    const wave = waveForPack(pack);

    return {
      ...pack,
      executionWave: wave.executionWave,
      executionWavePriority: wave.executionWavePriority,
      waveIntent: wave.waveIntent,
      allowedNextAction: wave.allowedNextAction,
      sourceOnly: true,
      fetchAllowedNow: false,
      searchAllowedNow: false,
      broadSearchAllowedNow: false,
      zeroResultMayImplyAbsence: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false
    };
  });

  const groups = new Map();

  for (const pack of annotated) {
    if (!groups.has(pack.executionWave)) groups.set(pack.executionWave, []);
    groups.get(pack.executionWave).push(pack);
  }

  return [...groups.entries()].map(([executionWave, packs]) => {
    const orderedPacks = packs.sort((a, b) => {
      if (a.executionWavePriority !== b.executionWavePriority) return a.executionWavePriority - b.executionWavePriority;
      if (a.packPriority !== b.packPriority) return a.packPriority - b.packPriority;
      return a.packId.localeCompare(b.packId);
    });

    const first = orderedPacks[0];

    return {
      executionWave,
      executionWavePriority: first.executionWavePriority,
      waveIntent: first.waveIntent,
      allowedNextAction: first.allowedNextAction,
      packCount: orderedPacks.length,
      competitionCount: uniqueSorted(orderedPacks.flatMap((pack) => pack.competitionSlugs || [])).length,
      packTypes: uniqueSorted(orderedPacks.map((pack) => pack.packType)),
      packIds: orderedPacks.map((pack) => pack.packId),
      regions: uniqueSorted(orderedPacks.flatMap((pack) => pack.regions || [])),
      slugPrefixes: uniqueSorted(orderedPacks.flatMap((pack) => pack.slugPrefixes || [])),
      competitionSlugs: uniqueSorted(orderedPacks.flatMap((pack) => pack.competitionSlugs || [])),
      sourceOnly: true,
      fetchAllowedNow: false,
      searchAllowedNow: false,
      broadSearchAllowedNow: false,
      zeroResultMayImplyAbsence: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false,
      recommendedMaterializerJob:
        executionWave === "wave_001_high_signal_existing_evidence_and_ready_lanes"
          ? "build_whole_map_high_signal_existing_evidence_wave_materializer"
          : executionWave === "wave_002_source_authority_template_grouping_all_packs"
            ? "build_whole_map_source_authority_template_wave_materializer"
            : executionWave === "wave_003_policy_and_source_traceback_governance"
              ? "build_whole_map_policy_and_traceback_wave_materializer"
              : "scope_accounting_no_action",
      packs: orderedPacks.map((pack) => ({
        packId: pack.packId,
        packType: pack.packType,
        competitionCount: pack.competitionCount,
        regions: pack.regions,
        slugPrefixes: pack.slugPrefixes,
        executionIntent: pack.executionIntent
      }))
    };
  }).sort((a, b) => {
    if (a.executionWavePriority !== b.executionWavePriority) return a.executionWavePriority - b.executionWavePriority;
    return a.executionWave.localeCompare(b.executionWave);
  });
}

function main() {
  const args = parseArgs(process.argv);
  const packer = readJson(args.input);
  const summary = packer.summary || {};

  assertSummary(summary, "retainedRawMapCompetitionCount", RETAINED_RAW_MAP_COUNT);
  assertSummary(summary, "competitionCount", RETAINED_RAW_MAP_COUNT);
  assertSummary(summary, "packedUniqueCompetitionCount", RETAINED_RAW_MAP_COUNT);
  assertSummary(summary, "sourceDiscoveryConfirmedActionableCompetitionCount", 0);
  assertSummary(summary, "currentEffectiveMapExactCountAsserted", false);
  assertSummary(summary, "currentEffectiveMapExactCount", null);
  assertSummary(summary, "originalWholeMapBatchRowCount", 469);
  assertSummary(summary, "compactedPackCount", 16);
  assertSummary(summary, "sourceAuthorityTemplateGroupingCompetitionCount", 372);
  assertSummary(summary, "sourceAuthorityTemplateGroupingPackCount", 5);
  assertSummary(summary, "truthReviewCompetitionCount", 101);
  assertSummary(summary, "truthReviewPackCount", 3);
  assertSummary(summary, "genericValidatorReadyCompetitionCount", 6);
  assertSummary(summary, "priorityRepairAndFullContractReviewCompetitionCount", 6);
  assertSummary(summary, "standingsFirstCompetitionCount", 2);
  assertSummary(summary, "cupStateReviewCompetitionCount", 3);
  assertSummary(summary, "policyReductionCandidateCompetitionCount", 2);
  assertSummary(summary, "blockedSourceTracebackCompetitionCount", 23);
  assertSummary(summary, "coveredAndSuppressedNoActionCompetitionCount", 174);
  assertSummary(summary, "highVolumeActivePackCompetitionCount", 515);
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

  const packRows = Array.isArray(packer.packRows) ? packer.packRows : [];
  if (packRows.length !== 16) throw new Error(`Expected 16 pack rows, got ${packRows.length}`);

  const packedSlugs = uniqueSorted(packRows.flatMap((pack) => pack.competitionSlugs || []));
  if (packedSlugs.length !== RETAINED_RAW_MAP_COUNT) {
    throw new Error(`Expected ${RETAINED_RAW_MAP_COUNT} packed slugs, got ${packedSlugs.length}`);
  }

  const annotatedPackRows = packRows.map((pack) => {
    const wave = waveForPack(pack);

    return {
      packId: pack.packId,
      packType: pack.packType,
      packPriority: pack.packPriority,
      executionWave: wave.executionWave,
      executionWavePriority: wave.executionWavePriority,
      waveIntent: wave.waveIntent,
      allowedNextAction: wave.allowedNextAction,
      competitionCount: pack.competitionCount,
      competitionSlugs: pack.competitionSlugs || [],
      regions: pack.regions || [],
      slugPrefixes: pack.slugPrefixes || [],
      reusableFamilies: pack.reusableFamilies || [],
      originalExecutionIntent: pack.executionIntent,
      sourceOnly: true,
      fetchAllowedNow: false,
      searchAllowedNow: false,
      broadSearchAllowedNow: false,
      zeroResultMayImplyAbsence: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false
    };
  }).sort((a, b) => {
    if (a.executionWavePriority !== b.executionWavePriority) return a.executionWavePriority - b.executionWavePriority;
    if (a.packPriority !== b.packPriority) return a.packPriority - b.packPriority;
    return a.packId.localeCompare(b.packId);
  });

  const waveRows = buildWaveRows(packRows);

  const firstRecommendedWave = waveRows[0] || null;
  if (!firstRecommendedWave || firstRecommendedWave.executionWave !== "wave_001_high_signal_existing_evidence_and_ready_lanes") {
    throw new Error("Expected first recommended wave to be high-signal existing evidence and ready lanes");
  }

  const activeExecutionWaveRows = waveRows.filter((wave) =>
    wave.executionWave !== "wave_004_covered_suppressed_scope_accounting_no_action"
  );

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-whole-map-executable-pack-wave-board-file",
    mode: "source_only_whole_map_executable_pack_wave_board_reorders_16_packs_into_execution_waves_no_fetch_no_search_no_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      wholeMapHighVolumeLanePacker: args.input
    },
    summary: {
      retainedRawMapCompetitionCount: RETAINED_RAW_MAP_COUNT,
      competitionCount: summary.competitionCount,
      packedUniqueCompetitionCount: packedSlugs.length,
      compactedPackCount: packRows.length,
      executionWaveCount: waveRows.length,
      activeExecutionWaveCount: activeExecutionWaveRows.length,
      activeExecutionWaveCompetitionCount: uniqueSorted(activeExecutionWaveRows.flatMap((wave) => wave.competitionSlugs)).length,
      scopeAccountingNoActionCompetitionCount: (
        waveRows.find((wave) => wave.executionWave === "wave_004_covered_suppressed_scope_accounting_no_action")
          ?.competitionCount || 0
      ),

      highSignalExistingEvidenceAndReadyCompetitionCount: (
        waveRows.find((wave) => wave.executionWave === "wave_001_high_signal_existing_evidence_and_ready_lanes")
          ?.competitionCount || 0
      ),
      sourceAuthorityTemplateWaveCompetitionCount: (
        waveRows.find((wave) => wave.executionWave === "wave_002_source_authority_template_grouping_all_packs")
          ?.competitionCount || 0
      ),
      policyAndTracebackWaveCompetitionCount: (
        waveRows.find((wave) => wave.executionWave === "wave_003_policy_and_source_traceback_governance")
          ?.competitionCount || 0
      ),

      sourceDiscoveryConfirmedActionableCompetitionCount: 0,
      currentEffectiveMapExactCountAsserted: false,
      currentEffectiveMapExactCount: null,
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

      firstRecommendedWave: firstRecommendedWave.executionWave,
      firstRecommendedMaterializerJob: firstRecommendedWave.recommendedMaterializerJob,
      recommendedNextLane: "build_whole_map_high_signal_existing_evidence_wave_materializer_then_source_authority_template_wave_materializer"
    },
    counts: {
      byExecutionWave: countBy(annotatedPackRows, "executionWave"),
      byPackType: countBy(annotatedPackRows, "packType"),
      byAllowedNextAction: countBy(annotatedPackRows, "allowedNextAction")
    },
    guardrails: [
      "This board reorders the 16 compacted packs into whole-map execution waves.",
      "It prevents blindly starting with source_authority_template_grouping_pack_001 just because it sorts first.",
      "It covers all 689 retained raw map rows.",
      "689 remains retained raw map, not confirmed actionable scope.",
      "No fetch is allowed.",
      "No search is allowed.",
      "No broad search is allowed.",
      "No zero-result outcome may imply absence.",
      "No canonical or production data is written.",
      "No active, inactive, completed, actionable, route, fixture, standings, or season-state truth is asserted.",
      "The next materializer must operate at wave level, not one pack or one family at a time."
    ],
    firstRecommendedWave,
    activeExecutionWaveRows,
    waveRows,
    packRows: annotatedPackRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    retainedRawMapCompetitionCount: output.summary.retainedRawMapCompetitionCount,
    competitionCount: output.summary.competitionCount,
    packedUniqueCompetitionCount: output.summary.packedUniqueCompetitionCount,
    compactedPackCount: output.summary.compactedPackCount,
    executionWaveCount: output.summary.executionWaveCount,
    activeExecutionWaveCount: output.summary.activeExecutionWaveCount,
    activeExecutionWaveCompetitionCount: output.summary.activeExecutionWaveCompetitionCount,
    scopeAccountingNoActionCompetitionCount: output.summary.scopeAccountingNoActionCompetitionCount,
    highSignalExistingEvidenceAndReadyCompetitionCount: output.summary.highSignalExistingEvidenceAndReadyCompetitionCount,
    sourceAuthorityTemplateWaveCompetitionCount: output.summary.sourceAuthorityTemplateWaveCompetitionCount,
    policyAndTracebackWaveCompetitionCount: output.summary.policyAndTracebackWaveCompetitionCount,
    sourceDiscoveryConfirmedActionableCompetitionCount: output.summary.sourceDiscoveryConfirmedActionableCompetitionCount,
    currentEffectiveMapExactCountAsserted: output.summary.currentEffectiveMapExactCountAsserted,
    currentEffectiveMapExactCount: output.summary.currentEffectiveMapExactCount,
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
    firstRecommendedWave: output.summary.firstRecommendedWave,
    firstRecommendedMaterializerJob: output.summary.firstRecommendedMaterializerJob,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
