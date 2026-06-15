#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const OUTPUT = "data/football-truth/_diagnostics/pilot-exit-whole-map-resumption-board-2026-06-14/pilot-exit-whole-map-resumption-board-2026-06-14.json";

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value = row[key] === null || row[key] === undefined || String(row[key]).trim() === "" ? "__missing__" : String(row[key]).trim();
    counts[value] = (counts[value] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

const pilotRows = [
  {
    competitionSlug: "esp.1",
    reusableFamily: "laliga",
    pilotStatus: "exit_ready_reusable_family_pattern_retained",
    wholeMapDisposition: "promote_family_pattern_to_full_map_reusable_lanes",
    reason: "LaLiga family reached structured/parser-ready reusable-family status during the pilot lane.",
    blocksWholeMapResumption: false
  },
  {
    competitionSlug: "esp.2",
    reusableFamily: "laliga",
    pilotStatus: "exit_ready_reusable_family_pattern_retained",
    wholeMapDisposition: "promote_family_pattern_to_full_map_reusable_lanes",
    reason: "LaLiga family reached structured/parser-ready reusable-family status during the pilot lane.",
    blocksWholeMapResumption: false
  },
  {
    competitionSlug: "nor.1",
    reusableFamily: "norway_ntf",
    pilotStatus: "exit_ready_reusable_family_pattern_retained",
    wholeMapDisposition: "promote_family_pattern_to_full_map_reusable_lanes",
    reason: "Norway NTF family produced structured standing-row candidates and is suitable for reusable-family acceleration.",
    blocksWholeMapResumption: false
  },
  {
    competitionSlug: "nor.2",
    reusableFamily: "norway_ntf",
    pilotStatus: "exit_ready_reusable_family_pattern_retained",
    wholeMapDisposition: "promote_family_pattern_to_full_map_reusable_lanes",
    reason: "Norway NTF family produced structured standing-row candidates and is suitable for reusable-family acceleration.",
    blocksWholeMapResumption: false
  },
  {
    competitionSlug: "swe.1",
    reusableFamily: "sportomedia",
    pilotStatus: "exit_deferred_provider_family_repair_lane",
    wholeMapDisposition: "defer_to_provider_family_repair_backlog_do_not_block_whole_map",
    reason: "Sportomedia endpoint is reachable and request body candidates build, but GraphQL returns HTTP 200 with errors and no data. This is a provider contract/runtime body-shape recovery lane, not a reason to hold the full-map pipeline.",
    blocksWholeMapResumption: false
  },
  {
    competitionSlug: "swe.2",
    reusableFamily: "sportomedia",
    pilotStatus: "exit_deferred_provider_family_repair_lane",
    wholeMapDisposition: "defer_to_provider_family_repair_backlog_do_not_block_whole_map",
    reason: "Sportomedia endpoint is reachable and request body candidates build, but GraphQL returns HTTP 200 with errors and no data. This is a provider contract/runtime body-shape recovery lane, not a reason to hold the full-map pipeline.",
    blocksWholeMapResumption: false
  }
];

const output = {
  generatedAt: new Date().toISOString(),
  job: "build-football-truth-pilot-exit-whole-map-resumption-board-file",
  mode: "no_write_pilot_exit_whole_map_resumption_board",
  sourceFetch: false,
  searchProviderUsed: false,
  broadSearchUsed: false,
  classifierExecuted: false,
  canonicalWrites: 0,
  productionWrite: false,
  dryRun: true,
  summary: {
    pilotCompetitionCount: pilotRows.length,
    reusableFamilyPatternRetainedCount: pilotRows.filter((row) => row.pilotStatus === "exit_ready_reusable_family_pattern_retained").length,
    providerFamilyRepairDeferredCount: pilotRows.filter((row) => row.pilotStatus === "exit_deferred_provider_family_repair_lane").length,
    wholeMapResumptionBlockedCount: pilotRows.filter((row) => row.blocksWholeMapResumption).length,
    mayResumeWholeMapExecutionPlanCount: 1,
    mayContinueSportomediaAsSeparateRepairLaneCount: 1,

    fetchExecutedNowCount: 0,
    searchExecutedNowCount: 0,
    broadSearchExecutedNowCount: 0,
    classifierExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    activeAssertedCount: 0,
    inactiveAssertedCount: 0,
    completedAssertedCount: 0,
    seasonStateTruthAssertedCount: 0,
    pilotExitTruthCount: 0,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsedCount: 0,
    hardcodedSeasonStateOverrideUsedCount: 0,

    recommendedNextLane: "resume_whole_map_execution_from_primary_manifest_and_followup_quality_gated_lanes"
  },
  counts: {
    byPilotStatus: countBy(pilotRows, "pilotStatus"),
    byReusableFamily: countBy(pilotRows, "reusableFamily"),
    byWholeMapDisposition: countBy(pilotRows, "wholeMapDisposition")
  },
  wholeMapResumptionPolicy: {
    resumeWholeMapNow: true,
    sportomediaBlocksWholeMap: false,
    sportomediaDisposition: "provider_family_repair_backlog",
    preservedReusableFamilyWins: ["laliga", "norway_ntf"],
    deferredRepairFamilies: ["sportomedia"],
    nextFullMapWorkShouldUse: [
      "primary batch runner manifest",
      "followup lane quality-gated pack",
      "family acceleration patterns",
      "strict no-write/no-truth gates unless explicitly approved"
    ]
  },
  guardrails: [
    "This board is a no-write decision artifact.",
    "It does not fetch.",
    "It does not search.",
    "It does not broad search.",
    "It does not classify season state.",
    "It does not assert truth.",
    "It does not write canonical data.",
    "It does not write production data.",
    "Sportomedia remains a separate provider-family repair lane and must not block whole-map resumption.",
    "Pilot rows are not truth assertions."
  ],
  pilotRows
};

writeJson(OUTPUT, output);

console.log(JSON.stringify({
  output: OUTPUT,
  pilotCompetitionCount: output.summary.pilotCompetitionCount,
  reusableFamilyPatternRetainedCount: output.summary.reusableFamilyPatternRetainedCount,
  providerFamilyRepairDeferredCount: output.summary.providerFamilyRepairDeferredCount,
  wholeMapResumptionBlockedCount: output.summary.wholeMapResumptionBlockedCount,
  mayResumeWholeMapExecutionPlanCount: output.summary.mayResumeWholeMapExecutionPlanCount,
  mayContinueSportomediaAsSeparateRepairLaneCount: output.summary.mayContinueSportomediaAsSeparateRepairLaneCount,
  fetchExecutedNowCount: output.summary.fetchExecutedNowCount,
  searchExecutedNowCount: output.summary.searchExecutedNowCount,
  broadSearchExecutedNowCount: output.summary.broadSearchExecutedNowCount,
  classifierExecutedNowCount: output.summary.classifierExecutedNowCount,
  canonicalWriteExecutedNowCount: output.summary.canonicalWriteExecutedNowCount,
  productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
  seasonStateTruthAssertedCount: output.summary.seasonStateTruthAssertedCount,
  pilotExitTruthCount: output.summary.pilotExitTruthCount,
  canonicalWrites: output.summary.canonicalWrites,
  productionWrite: output.summary.productionWrite,
  recommendedNextLane: output.summary.recommendedNextLane,
  counts: output.counts
}, null, 2));
