#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    selfTest: false,
    input: "",
    output: ""
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function inferGapTypes(row) {
  const requiredData = Array.isArray(row.requiredData) ? row.requiredData : [];
  const missingData = Array.isArray(row.sourceBasis?.missingData) ? row.sourceBasis.missingData : [];

  const gapTypes = [];

  for (const value of [...requiredData, ...missingData]) {
    const text = String(value).toLowerCase();

    if (text.includes("standing")) gapTypes.push("standings");
    else if (text.includes("fixture")) gapTypes.push("fixtures");
    else if (text.includes("result")) gapTypes.push("results");
    else if (text.includes("winner") || text.includes("final")) gapTypes.push("cup_winner_final");
    else if (text.includes("contract") || text.includes("provider")) gapTypes.push("provider_contract");
    else gapTypes.push("other");
  }

  if (gapTypes.length === 0 && row.memoryAwareActionBucket === "standings_provider_batch_needed") {
    gapTypes.push("standings");
  }

  return unique(gapTypes).sort();
}

function inferRepairLane(row) {
  const gapTypes = inferGapTypes(row);

  if (gapTypes.includes("standings")) return "standings_provider_parser_or_registry_repair";
  if (gapTypes.includes("fixtures") || gapTypes.includes("results")) return "fixture_result_provider_parser_or_registry_repair";
  if (gapTypes.includes("provider_contract")) return "provider_contract_repair";
  if (gapTypes.includes("cup_winner_final")) return "cup_winner_final_evidence_or_provider_repair";

  return "provider_parser_or_registry_repair";
}

function buildRepairRow(row) {
  const gapTypes = inferGapTypes(row);
  const repairLane = inferRepairLane(row);

  return {
    competitionSlug: row.competitionSlug,
    providerId: row.providerId || "unknown",
    seasonState: row.seasonState || "unknown",
    repairLane,
    gapTypes,
    executionBucket: row.executionBucket,
    actionableNow: row.actionableNow === true,
    repairScope: "all_map_batch",
    recommendedMode: "plan_first_no_fetch",
    repairTarget: gapTypes.includes("standings")
      ? "official standings source authority / parser / registry readiness"
      : "official provider parser / registry readiness",
    requiredInputs: [
      "current provider contract row",
      "current competition state row",
      "existing canonical/source-basis evidence",
      "memory records if present"
    ],
    forbiddenActions: [
      "single-league endpoint chasing",
      "blind fetch loops",
      "canonical writes",
      "production writes",
      "generated diagnostics commit"
    ],
    nextSafeJobType: "provider_repair_contract_plan_dry_run",
    reason: row.executionReason || "Provider/parser/registry repair candidate from memory-aware refinement.",
    sourceBasis: row.sourceBasis || {},
    memoryOverlayStatus: row.memoryOverlayStatus || "no_memory_overlay",
    memoryAwareActionBucket: row.memoryAwareActionBucket || "",
    canonicalWrites: 0,
    productionWrite: false
  };
}

function buildProviderRepairPlan(refinementBoard) {
  const rows = refinementBoard.rows || [];
  const candidateRows = rows.filter((row) => row.executionBucket === "provider_repair_batch_candidate");

  const repairRows = candidateRows.map(buildRepairRow);

  const byRepairLane = repairRows.reduce((acc, row) => {
    acc[row.repairLane] ||= [];
    acc[row.repairLane].push(row.competitionSlug);
    return acc;
  }, {});

  const byProviderId = repairRows.reduce((acc, row) => {
    acc[row.providerId] ||= [];
    acc[row.providerId].push(row.competitionSlug);
    return acc;
  }, {});

  const blockedByMemoryRows = rows
    .filter((row) => row.executionBucket === "memory_recorded_no_review_repeat" || row.executionBucket === "memory_recorded_blocked_until_evidence")
    .map((row) => row.competitionSlug);

  const blockedContractRows = rows
    .filter((row) => row.executionBucket === "blocked_memory_or_provider_contract")
    .map((row) => row.competitionSlug);

  const coveredRows = rows
    .filter((row) => row.executionBucket === "covered_no_action")
    .map((row) => row.competitionSlug);

  return {
    ok: true,
    job: "build-football-truth-provider-repair-plan",
    generatedAt: new Date().toISOString(),
    inputSummary: refinementBoard.summary || {},
    summary: {
      inputCompetitionCount: rows.length,
      repairCandidateCount: repairRows.length,
      repairLaneCount: Object.keys(byRepairLane).length,
      providerCount: Object.keys(byProviderId).length,
      memorySuppressedCount: blockedByMemoryRows.length,
      blockedContractCount: blockedContractRows.length,
      coveredNoActionCount: coveredRows.length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    byRepairLane,
    byProviderId,
    repairRows,
    excludedRows: {
      memorySuppressed: blockedByMemoryRows,
      blockedProviderOrContract: blockedContractRows,
      coveredNoAction: coveredRows
    },
    nextRecommendedAction: repairRows.length > 0
      ? {
          type: "provider_repair_contract_plan_dry_run",
          reason: "Build a provider-level repair contract plan for every all-map provider repair candidate, grouped by provider/lane before any fetch or canonical write.",
          competitions: repairRows.map((row) => row.competitionSlug)
        }
      : {
          type: "none",
          reason: "No provider repair candidates remain.",
          competitions: []
        },
    policy: {
      purpose: "Create all-map provider/parser/registry repair plan from memory-aware execution buckets.",
      inputContract: "Consumes memory-aware bucket refinement; never hardcodes real competition slugs.",
      noFetch: true,
      noSearch: true,
      noActualWrites: true,
      noCanonicalWrites: true,
      noPromotionWrites: true,
      noEndpointChasing: true,
      noSingleLeagueDrift: true,
      planCoversAllCurrentMapCandidates: true
    },
    guarantees: {
      noFetch: true,
      noSearch: true,
      noActualWrites: true,
      actualWrites: 0,
      noCanonicalWrites: true,
      canonicalWrites: 0,
      productionWrite: false,
      sourceFetch: false
    }
  };
}

function runSelfTest() {
  const refinementBoard = {
    summary: { competitionCount: 7 },
    rows: [
      {
        competitionSlug: "league.a",
        providerId: "provider_a",
        seasonState: "active",
        executionBucket: "provider_repair_batch_candidate",
        actionableNow: true,
        memoryAwareActionBucket: "standings_provider_batch_needed",
        requiredData: ["canonicalStandings"],
        sourceBasis: { missingData: ["canonicalStandings"] }
      },
      {
        competitionSlug: "league.b",
        providerId: "provider_a",
        seasonState: "active",
        executionBucket: "provider_repair_batch_candidate",
        actionableNow: true,
        memoryAwareActionBucket: "standings_provider_batch_needed",
        requiredData: ["canonicalStandings"],
        sourceBasis: { missingData: ["canonicalStandings"] }
      },
      {
        competitionSlug: "league.c",
        providerId: "provider_b",
        seasonState: "active",
        executionBucket: "provider_repair_batch_candidate",
        actionableNow: true,
        memoryAwareActionBucket: "fixtures_provider_batch_needed",
        requiredData: ["canonicalFixtures"],
        sourceBasis: { missingData: ["canonicalFixtures"] }
      },
      {
        competitionSlug: "esp.1",
        providerId: "laliga_official",
        executionBucket: "memory_recorded_no_review_repeat"
      },
      {
        competitionSlug: "sco.challenge",
        providerId: "spfl_challenge_cup_official",
        executionBucket: "memory_recorded_blocked_until_evidence"
      },
      {
        competitionSlug: "sco.1",
        providerId: "spfl_opta_official",
        executionBucket: "blocked_memory_or_provider_contract"
      },
      {
        competitionSlug: "nor.1",
        providerId: "norway_ntf_official",
        executionBucket: "covered_no_action"
      }
    ]
  };

  const report = buildProviderRepairPlan(refinementBoard);

  if (report.summary.repairCandidateCount !== 3) {
    throw new Error(`expected 3 repair candidates, got ${report.summary.repairCandidateCount}`);
  }
  if (report.byProviderId.provider_a.join(",") !== "league.a,league.b") {
    throw new Error("provider grouping failed");
  }
  if (!report.byRepairLane.standings_provider_parser_or_registry_repair?.includes("league.a")) {
    throw new Error("standings lane failed");
  }
  if (!report.byRepairLane.fixture_result_provider_parser_or_registry_repair?.includes("league.c")) {
    throw new Error("fixture/result lane failed");
  }
  if (!report.excludedRows.memorySuppressed.includes("esp.1") || !report.excludedRows.memorySuppressed.includes("sco.challenge")) {
    throw new Error("memory suppressed exclusions failed");
  }
  if (report.guarantees.actualWrites !== 0 || report.guarantees.canonicalWrites !== 0) {
    throw new Error("read-only guarantees failed");
  }

  console.log(JSON.stringify({
    ok: true,
    selfTest: "passed",
    summary: report.summary,
    byRepairLane: report.byRepairLane,
    byProviderId: report.byProviderId,
    excludedRows: report.excludedRows,
    nextRecommendedAction: report.nextRecommendedAction,
    guarantees: report.guarantees
  }, null, 2));
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    runSelfTest();
    return;
  }

  if (!args.input) throw new Error("Missing required --input");
  if (!args.output) throw new Error("Missing required --output");

  const refinementBoard = readJson(args.input);
  const report = buildProviderRepairPlan(refinementBoard);

  writeJson(args.output, report);

  console.log(JSON.stringify({
    output: args.output,
    summary: report.summary,
    byRepairLane: report.byRepairLane,
    byProviderId: report.byProviderId,
    nextRecommendedAction: report.nextRecommendedAction,
    guarantees: report.guarantees
  }, null, 2));
}

main();
