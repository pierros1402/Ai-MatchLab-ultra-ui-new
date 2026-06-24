#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/whole-map-executable-pack-wave-board-2026-06-14/whole-map-executable-pack-wave-board-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/whole-map-active-execution-wave-materializer-2026-06-14/whole-map-active-execution-wave-materializer-2026-06-14.json";

const RETAINED_RAW_MAP_COUNT = 689;
const ACTIVE_WAVES = [
  "wave_001_high_signal_existing_evidence_and_ready_lanes",
  "wave_002_source_authority_template_grouping_all_packs",
  "wave_003_policy_and_source_traceback_governance"
];

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

function prefixOf(slug) {
  const match = String(slug || "").match(/^([a-z]{2,3})\./i);
  return match ? match[1].toLowerCase() : "__missing_prefix__";
}

function workstreamForPack(packType, executionWave) {
  if (executionWave === "wave_002_source_authority_template_grouping_all_packs") {
    return "source_authority_template_materialization";
  }

  if (executionWave === "wave_003_policy_and_source_traceback_governance") {
    if (packType === "blocked_source_traceback_pack") return "blocked_configured_family_source_traceback";
    if (packType === "policy_reduction_pack") return "policy_reduction_candidate_review";
    return "policy_or_traceback_review";
  }

  if (packType === "truth_review_existing_signals_pack") return "existing_signal_truth_review";
  if (packType === "generic_validator_ready_pack") return "generic_validator_ready_config_only_followup";
  if (packType === "priority1_repair_and_full_contract_review_pack") return "priority1_reusable_family_repair_and_contract_review";
  if (packType === "standings_first_pack") return "standings_first_contract_review";
  if (packType === "cup_state_review_pack") return "cup_state_or_final_winner_review";

  return "unclassified_active_wave_workstream";
}

function materializedActionForWorkstream(workstream) {
  const map = {
    existing_signal_truth_review:
      "materialize_existing_signal_review_rows_before_any_new_discovery",
    generic_validator_ready_config_only_followup:
      "materialize_generic_validator_ready_rows_without_contract_assertion",
    priority1_reusable_family_repair_and_contract_review:
      "materialize_priority1_family_repair_rows_grouped_by_reusable_family",
    standings_first_contract_review:
      "materialize_standings_first_review_rows_without_fixture_or_season_state_assertion",
    cup_state_or_final_winner_review:
      "materialize_cup_state_review_rows_without_new_canonical_write",
    source_authority_template_materialization:
      "materialize_source_authority_template_rows_by_region_prefix_and_competition_type",
    blocked_configured_family_source_traceback:
      "materialize_source_traceback_rows_for_blocked_configured_family_not_absence",
    policy_reduction_candidate_review:
      "materialize_policy_reduction_rows_without_deleting_scope"
  };

  return map[workstream] || "materialize_source_only_rows_no_truth_assertion";
}

function buildPackLookup(packRows) {
  const lookup = new Map();

  for (const pack of packRows) {
    for (const slug of pack.competitionSlugs || []) {
      if (lookup.has(slug)) {
        throw new Error(`Duplicate slug across packs: ${slug}`);
      }

      lookup.set(slug, pack);
    }
  }

  return lookup;
}

function materializeRows(waveRows, packLookup) {
  const activeRows = [];

  for (const wave of waveRows.filter((row) => ACTIVE_WAVES.includes(row.executionWave))) {
    for (const slug of wave.competitionSlugs || []) {
      const pack = packLookup.get(slug);
      if (!pack) throw new Error(`Missing pack lookup for slug ${slug}`);

      const workstream = workstreamForPack(pack.packType, wave.executionWave);

      activeRows.push({
        competitionSlug: slug,
        slugPrefix: prefixOf(slug),
        executionWave: wave.executionWave,
        waveIntent: wave.waveIntent,
        packId: pack.packId,
        packType: pack.packType,
        workstream,
        materializedAction: materializedActionForWorkstream(workstream),
        sourceOnly: true,
        fetchAllowedNow: false,
        searchAllowedNow: false,
        broadSearchAllowedNow: false,
        zeroResultMayImplyAbsence: false,
        canonicalWriteEligibleNow: false,
        productionWrite: false,
        truthAssertionsAllowedNow: false,
        blockedTruthShortcuts: [
          "zero_result_as_absence",
          "match_status_as_season_state",
          "no_match_today_as_inactive",
          "active_without_trusted_state_evidence",
          "completed_without_trusted_final_or_restart_evidence"
        ]
      });
    }
  }

  return activeRows.sort((a, b) => {
    if (a.executionWave !== b.executionWave) return a.executionWave.localeCompare(b.executionWave);
    if (a.workstream !== b.workstream) return a.workstream.localeCompare(b.workstream);
    return a.competitionSlug.localeCompare(b.competitionSlug);
  });
}

function buildWorkstreamRows(materializedRows) {
  const groups = new Map();

  for (const row of materializedRows) {
    const key = `${row.executionWave}::${row.workstream}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  return [...groups.entries()].map(([groupKey, rows]) => {
    const first = rows[0];

    return {
      workstreamId: groupKey.replaceAll("::", "__"),
      executionWave: first.executionWave,
      workstream: first.workstream,
      materializedAction: first.materializedAction,
      competitionCount: rows.length,
      competitionSlugs: uniqueSorted(rows.map((row) => row.competitionSlug)),
      slugPrefixes: uniqueSorted(rows.map((row) => row.slugPrefix)),
      packIds: uniqueSorted(rows.map((row) => row.packId)),
      packTypes: uniqueSorted(rows.map((row) => row.packType)),
      sourceOnly: true,
      fetchAllowedNow: false,
      searchAllowedNow: false,
      broadSearchAllowedNow: false,
      zeroResultMayImplyAbsence: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false,
      recommendedNextSourceOnlyJob:
        first.executionWave === "wave_001_high_signal_existing_evidence_and_ready_lanes"
          ? "build_high_signal_existing_evidence_source_only_review_inputs"
          : first.executionWave === "wave_002_source_authority_template_grouping_all_packs"
            ? "build_source_authority_template_grouping_source_only_inputs"
            : "build_policy_and_source_traceback_source_only_inputs"
    };
  }).sort((a, b) => {
    if (a.executionWave !== b.executionWave) return a.executionWave.localeCompare(b.executionWave);
    if (b.competitionCount !== a.competitionCount) return b.competitionCount - a.competitionCount;
    return a.workstream.localeCompare(b.workstream);
  });
}

function main() {
  const args = parseArgs(process.argv);
  const board = readJson(args.input);
  const summary = board.summary || {};

  assertSummary(summary, "retainedRawMapCompetitionCount", RETAINED_RAW_MAP_COUNT);
  assertSummary(summary, "competitionCount", RETAINED_RAW_MAP_COUNT);
  assertSummary(summary, "packedUniqueCompetitionCount", RETAINED_RAW_MAP_COUNT);
  assertSummary(summary, "compactedPackCount", 16);
  assertSummary(summary, "executionWaveCount", 4);
  assertSummary(summary, "activeExecutionWaveCount", 3);
  assertSummary(summary, "activeExecutionWaveCompetitionCount", 515);
  assertSummary(summary, "scopeAccountingNoActionCompetitionCount", 174);
  assertSummary(summary, "highSignalExistingEvidenceAndReadyCompetitionCount", 118);
  assertSummary(summary, "sourceAuthorityTemplateWaveCompetitionCount", 372);
  assertSummary(summary, "policyAndTracebackWaveCompetitionCount", 25);
  assertSummary(summary, "sourceDiscoveryConfirmedActionableCompetitionCount", 0);
  assertSummary(summary, "currentEffectiveMapExactCountAsserted", false);
  assertSummary(summary, "currentEffectiveMapExactCount", null);
  assertSummary(summary, "actionableConfirmedNowCount", 0);
  assertSummary(summary, "contractConfirmedNowCount", 0);
  assertSummary(summary, "validatedRouteMapCount", 0);
  assertSummary(summary, "validatedFixtureContractCount", 0);
  assertSummary(summary, "validatedStandingsContractCount", 0);
  assertSummary(summary, "validatedSeasonStateContractCount", 0);
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

  const waveRows = Array.isArray(board.waveRows) ? board.waveRows : [];
  const packRows = Array.isArray(board.packRows) ? board.packRows : [];

  if (waveRows.length !== 4) throw new Error(`Expected 4 wave rows, got ${waveRows.length}`);
  if (packRows.length !== 16) throw new Error(`Expected 16 pack rows, got ${packRows.length}`);

  const packLookup = buildPackLookup(packRows);
  const materializedRows = materializeRows(waveRows, packLookup);
  const workstreamRows = buildWorkstreamRows(materializedRows);

  const allMaterializedSlugs = uniqueSorted(materializedRows.map((row) => row.competitionSlug));
  if (allMaterializedSlugs.length !== 515) {
    throw new Error(`Expected 515 active materialized slugs, got ${allMaterializedSlugs.length}`);
  }

  const wave001Rows = materializedRows.filter((row) =>
    row.executionWave === "wave_001_high_signal_existing_evidence_and_ready_lanes"
  );
  const wave002Rows = materializedRows.filter((row) =>
    row.executionWave === "wave_002_source_authority_template_grouping_all_packs"
  );
  const wave003Rows = materializedRows.filter((row) =>
    row.executionWave === "wave_003_policy_and_source_traceback_governance"
  );

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-whole-map-active-execution-wave-materializer-file",
    mode: "source_only_materializes_all_active_execution_waves_515_competitions_no_fetch_no_search_no_writes_no_truth_assertions",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      wholeMapExecutablePackWaveBoard: args.input
    },
    summary: {
      retainedRawMapCompetitionCount: RETAINED_RAW_MAP_COUNT,
      competitionCount: RETAINED_RAW_MAP_COUNT,
      activeExecutionWaveCount: 3,
      activeExecutionWaveCompetitionCount: materializedRows.length,
      scopeAccountingNoActionCompetitionCount: 174,
      materializedActiveCompetitionCount: materializedRows.length,
      materializedActiveUniqueCompetitionCount: allMaterializedSlugs.length,
      materializedWorkstreamCount: workstreamRows.length,

      highSignalExistingEvidenceAndReadyCompetitionCount: wave001Rows.length,
      sourceAuthorityTemplateWaveCompetitionCount: wave002Rows.length,
      policyAndTracebackWaveCompetitionCount: wave003Rows.length,

      currentEffectiveMapExactCountAsserted: false,
      currentEffectiveMapExactCount: null,
      sourceDiscoveryConfirmedActionableCompetitionCount: 0,
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

      recommendedNextLane: "run_source_only_high_signal_and_source_authority_workstream_materializers_as_large_batches_not_small_families"
    },
    counts: {
      byExecutionWave: countBy(materializedRows, "executionWave"),
      byWorkstream: countBy(materializedRows, "workstream"),
      byPackType: countBy(materializedRows, "packType"),
      bySlugPrefix: countBy(materializedRows, "slugPrefix")
    },
    guardrails: [
      "This materializer covers all active execution waves together: 515 competitions.",
      "It does not process a single pack, family, or tiny group.",
      "The retained raw map remains 689 and is not treated as confirmed actionable scope.",
      "The 174 no-action/suppressed rows remain scope accounting only.",
      "No fetch is allowed.",
      "No search is allowed.",
      "No broad search is allowed.",
      "No zero-result outcome may imply absence.",
      "No canonical or production data is written.",
      "No active, inactive, completed, actionable, route, fixture, standings, or season-state truth is asserted."
    ],
    workstreamRows,
    materializedRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    retainedRawMapCompetitionCount: output.summary.retainedRawMapCompetitionCount,
    competitionCount: output.summary.competitionCount,
    activeExecutionWaveCount: output.summary.activeExecutionWaveCount,
    activeExecutionWaveCompetitionCount: output.summary.activeExecutionWaveCompetitionCount,
    scopeAccountingNoActionCompetitionCount: output.summary.scopeAccountingNoActionCompetitionCount,
    materializedActiveCompetitionCount: output.summary.materializedActiveCompetitionCount,
    materializedActiveUniqueCompetitionCount: output.summary.materializedActiveUniqueCompetitionCount,
    materializedWorkstreamCount: output.summary.materializedWorkstreamCount,
    highSignalExistingEvidenceAndReadyCompetitionCount: output.summary.highSignalExistingEvidenceAndReadyCompetitionCount,
    sourceAuthorityTemplateWaveCompetitionCount: output.summary.sourceAuthorityTemplateWaveCompetitionCount,
    policyAndTracebackWaveCompetitionCount: output.summary.policyAndTracebackWaveCompetitionCount,
    currentEffectiveMapExactCountAsserted: output.summary.currentEffectiveMapExactCountAsserted,
    currentEffectiveMapExactCount: output.summary.currentEffectiveMapExactCount,
    sourceDiscoveryConfirmedActionableCompetitionCount: output.summary.sourceDiscoveryConfirmedActionableCompetitionCount,
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
