#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

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

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function indexBy(rows, key) {
  return Object.fromEntries((rows || []).map((row) => [row[key], row]));
}

function providersByCompetition(providerContractBoard) {
  const out = {};

  for (const provider of providerContractBoard || []) {
    for (const competitionSlug of provider.competitions || []) {
      out[competitionSlug] = provider;
    }
  }

  return out;
}

function blockedProvidersById(blockedProviderBoard) {
  return new Set((blockedProviderBoard || []).map((row) => row.providerId).filter(Boolean));
}

function confidenceForDecision({ stateRow, missingRow, providerRow, actionBucket }) {
  if (actionBucket === "blocked_no_action") return 1;
  if (actionBucket === "no_action_covered") return 0.95;

  if (
    stateRow?.canonicalCoverageStatus === "local_canonical_coverage_from_non_registry_source" ||
    stateRow?.canonicalCoverageStatus === "local_canonical_coverage_source_unknown"
  ) {
    return 0.65;
  }

  if ((missingRow?.missingData || []).length > 0 && providerRow) return 0.8;
  if (stateRow?.seasonState && providerRow) return 0.75;

  return 0.4;
}

function decideRow({ stateRow, missingRow, providerRow, isBlockedProvider }) {
  const missingData = missingRow?.missingData || [];
  const nextAllowedAction = stateRow?.nextAllowedAction || missingRow?.nextAllowedAction || "";
  const seasonState = stateRow?.seasonState || "unknown";
  const coverage = stateRow?.canonicalCoverageStatus || "";
  const providerCapabilityStatus = stateRow?.providerCapabilityStatus || providerRow?.capabilityStatus || "";
  const providerPromotionStatus = stateRow?.providerPromotionStatus || providerRow?.promotionStatus || "";

  let actionBucket = "unknown_needs_state_evidence_batch";
  let intentNeed = "classify_season_state";
  let reason = "Competition needs season-state/source-confidence classification before acquisition.";
  let priority = 50;
  let allowedNow = true;

  if (isBlockedProvider || nextAllowedAction === "blocked_no_action") {
    actionBucket = "blocked_no_action";
    intentNeed = "blocked_memory";
    reason = "Provider/competition is known blocked; do not retry without changed strategy.";
    priority = 0;
    allowedNow = false;
  } else if (nextAllowedAction === "capability_scoped_blocked_review") {
    actionBucket = "capability_scoped_blocked_review";
    intentNeed = "repair_provider_capability";
    reason = "Provider has partial promoted coverage but a scoped capability is blocked.";
    priority = 30;
    allowedNow = false;
  } else if (nextAllowedAction === "no_action_covered" || (missingData.length === 0 && coverage.includes("provider_promoted"))) {
    actionBucket = "no_action_covered";
    intentNeed = "none";
    reason = "Competition is covered by current Truth/Memory board.";
    priority = 0;
    allowedNow = false;
  } else if (coverage === "local_canonical_coverage_from_non_registry_source") {
    actionBucket = "local_canonical_source_authority_review";
    intentNeed = "source_authority_validation";
    reason = "Local canonical coverage exists, but source is not promoted through provider contract; review authority, do not chase fixtures blindly.";
    priority = 40;
    allowedNow = true;
  } else if (missingData.includes("canonicalStandings")) {
    actionBucket = "standings_provider_batch_needed";
    intentNeed = "official_standings";
    reason = "State board shows fixtures/results context but canonical standings are missing.";
    priority = seasonState === "active" ? 80 : 60;
    allowedNow = nextAllowedAction !== "registry_only_review";
  } else if (missingData.includes("canonicalFixtures")) {
    actionBucket = "fixture_or_result_provider_batch_needed";
    intentNeed = "official_fixtures_or_results";
    reason = "State board shows canonical fixture/result gap after provider-aware classification.";
    priority = seasonState === "active" ? 85 : 45;
    allowedNow = true;
  } else if (missingData.includes("cupWinnerFinalState")) {
    actionBucket = "cup_winner_final_state_needed";
    intentNeed = "cup_winner_final_state";
    reason = "Cup needs winner/final/status evidence.";
    priority = 70;
    allowedNow = true;
  } else if (nextAllowedAction === "registry_only_review") {
    actionBucket = "registry_only_review";
    intentNeed = "provider_registry_or_memory_update";
    reason = "Coverage exists or partial coverage exists, but provider registry/memory needs normalization before new acquisition.";
    priority = 35;
    allowedNow = false;
  }

  const confidence = confidenceForDecision({
    stateRow,
    missingRow,
    providerRow,
    actionBucket
  });

  return {
    competitionSlug: stateRow.competitionSlug,
    providerId: stateRow.providerId,
    seasonState,
    intentNeed,
    actionBucket,
    priority,
    allowedNow,
    confidence,
    reason,
    sourceBasis: {
      seasonState: stateRow.seasonState,
      hasCanonicalFixtures: stateRow.hasCanonicalFixtures,
      canonicalFixtureRows: stateRow.canonicalFixtureRows,
      canonicalFixtureFinishedRows: stateRow.canonicalFixtureFinishedRows,
      canonicalFixtureScheduledRows: stateRow.canonicalFixtureScheduledRows,
      hasCanonicalStandings: stateRow.hasCanonicalStandings,
      canonicalStandingsRows: stateRow.canonicalStandingsRows,
      hasCupWinnerFinalState: stateRow.hasCupWinnerFinalState,
      canonicalCoverageStatus: coverage,
      canonicalFixtureSourceCounts: stateRow.canonicalFixtureSourceCounts || {},
      canonicalStandingsSourceCounts: stateRow.canonicalStandingsSourceCounts || {},
      missingData,
      nextAllowedAction,
      providerCapabilityStatus,
      providerPromotionStatus,
      allowedRunnerPolicy: providerRow?.allowedRunnerPolicy || ""
    },
    requiredData: deriveRequiredData({ seasonState, missingData, stateRow }),
    canonicalWrites: 0,
    productionWrite: false
  };
}

function deriveRequiredData({ seasonState, missingData, stateRow }) {
  if (seasonState === "completed_cup") return ["cupWinnerFinalState"];
  if (seasonState === "blocked") return [];
  if (seasonState === "active") return ["fixturesOrResults", "standings", "seasonState"];
  if (seasonState === "completed_or_results_only") return ["results", "standings", "seasonState"];
  if (missingData.includes("cupWinnerFinalState")) return ["cupWinnerFinalState"];
  if (stateRow.hasCanonicalStandings && !stateRow.hasCanonicalFixtures) return ["seasonState"];
  return ["seasonState"];
}

function buildDecisionBoard(board) {
  const providerContractBoard = board.providerContractBoard || [];
  const competitionStateBoard = board.competitionStateBoard || [];
  const missingDataBoard = board.missingDataBoard || [];
  const blockedProviderBoard = board.blockedProviderBoard || [];

  const missingByCompetition = indexBy(missingDataBoard, "competitionSlug");
  const providerByCompetition = providersByCompetition(providerContractBoard);
  const blockedProviderIds = blockedProvidersById(blockedProviderBoard);

  const rows = competitionStateBoard.map((stateRow) => {
    const missingRow = missingByCompetition[stateRow.competitionSlug] || { missingData: [] };
    const providerRow = providerByCompetition[stateRow.competitionSlug] || null;
    const isBlockedProvider = blockedProviderIds.has(stateRow.providerId);

    return decideRow({
      stateRow,
      missingRow,
      providerRow,
      isBlockedProvider
    });
  });

  const actionBuckets = rows.reduce((acc, row) => {
    acc[row.actionBucket] ||= [];
    acc[row.actionBucket].push(row.competitionSlug);
    return acc;
  }, {});

  const sortedRows = rows.sort((a, b) => b.priority - a.priority || a.competitionSlug.localeCompare(b.competitionSlug));

  return {
    ok: true,
    job: "build-football-truth-autonomy-decision-board",
    generatedAt: new Date().toISOString(),
    inputSummary: board.summary || {},
    summary: {
      competitionCount: sortedRows.length,
      actionBucketCount: Object.keys(actionBuckets).length,
      noActionCoveredCount: (actionBuckets.no_action_covered || []).length,
      blockedNoActionCount: (actionBuckets.blocked_no_action || []).length,
      sourceAuthorityReviewCount: (actionBuckets.local_canonical_source_authority_review || []).length,
      standingsProviderBatchNeededCount: (actionBuckets.standings_provider_batch_needed || []).length,
      fixtureOrResultProviderBatchNeededCount: (actionBuckets.fixture_or_result_provider_batch_needed || []).length,
      cupWinnerFinalStateNeededCount: (actionBuckets.cup_winner_final_state_needed || []).length,
      registryOnlyReviewCount: (actionBuckets.registry_only_review || []).length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    actionBuckets,
    rows: sortedRows,
    policy: {
      intentLayer: "Classify what data is needed before searching.",
      truthLayer: "Use competitionStateBoard/missingDataBoard/providerContractBoard as Truth/Memory snapshot.",
      noFilesystemGuessing: true,
      noFixtureChasingFromMissingFile: true,
      noSingleLeagueDrift: true,
      outputContract: "Every decision includes state, intentNeed, confidence, reason, sourceBasis, and next action bucket."
    },
    guarantees: {
      noFetch: true,
      noSearch: true,
      noCanonicalWrites: true,
      canonicalWrites: 0,
      productionWrite: false,
      sourceFetch: false
    }
  };
}

function runSelfTest() {
  const mock = {
    summary: { canonicalWrites: 0, productionWrite: false },
    providerContractBoard: [
      {
        providerId: "provider_a",
        competitions: ["covered.1"],
        capabilityStatus: "proven_promoted",
        promotionStatus: "canonical_written",
        allowedRunnerPolicy: "no_action"
      },
      {
        providerId: "provider_b",
        competitions: ["local.1"],
        capabilityStatus: "partial_evidence_not_promoted",
        promotionStatus: "not_promoted",
        allowedRunnerPolicy: "review"
      },
      {
        providerId: "provider_c",
        competitions: ["active_missing_standings.1"],
        capabilityStatus: "partial_promoted",
        promotionStatus: "fixtures_written",
        allowedRunnerPolicy: "registry_only"
      },
      {
        providerId: "provider_blocked",
        competitions: ["blocked.1"],
        capabilityStatus: "blocked",
        promotionStatus: "blocked",
        allowedRunnerPolicy: "blocked"
      }
    ],
    competitionStateBoard: [
      {
        competitionSlug: "covered.1",
        providerId: "provider_a",
        seasonState: "active",
        hasCanonicalFixtures: true,
        canonicalFixtureRows: 240,
        canonicalFixtureFinishedRows: 100,
        canonicalFixtureScheduledRows: 140,
        hasCanonicalStandings: true,
        canonicalStandingsRows: 16,
        hasCupWinnerFinalState: false,
        canonicalCoverageStatus: "provider_promoted_or_partially_promoted_with_local_coverage",
        nextAllowedAction: "no_action_covered"
      },
      {
        competitionSlug: "local.1",
        providerId: "provider_b",
        seasonState: "active",
        hasCanonicalFixtures: true,
        canonicalFixtureRows: 29,
        canonicalFixtureFinishedRows: 10,
        canonicalFixtureScheduledRows: 19,
        hasCanonicalStandings: true,
        canonicalStandingsRows: 20,
        hasCupWinnerFinalState: false,
        canonicalCoverageStatus: "local_canonical_coverage_from_non_registry_source",
        nextAllowedAction: "local_canonical_coverage_review"
      },
      {
        competitionSlug: "active_missing_standings.1",
        providerId: "provider_c",
        seasonState: "active",
        hasCanonicalFixtures: true,
        canonicalFixtureRows: 132,
        canonicalFixtureFinishedRows: 58,
        canonicalFixtureScheduledRows: 74,
        hasCanonicalStandings: false,
        canonicalStandingsRows: 0,
        hasCupWinnerFinalState: false,
        canonicalCoverageStatus: "provider_promoted_or_partially_promoted_with_local_coverage",
        nextAllowedAction: "registry_only_review"
      },
      {
        competitionSlug: "blocked.1",
        providerId: "provider_blocked",
        seasonState: "blocked",
        hasCanonicalFixtures: false,
        canonicalFixtureRows: 0,
        hasCanonicalStandings: false,
        canonicalStandingsRows: 0,
        hasCupWinnerFinalState: false,
        canonicalCoverageStatus: "blocked",
        nextAllowedAction: "blocked_no_action"
      }
    ],
    missingDataBoard: [
      { competitionSlug: "covered.1", providerId: "provider_a", missingData: [], nextAllowedAction: "no_action_covered" },
      { competitionSlug: "local.1", providerId: "provider_b", missingData: [], nextAllowedAction: "local_canonical_coverage_review" },
      { competitionSlug: "active_missing_standings.1", providerId: "provider_c", missingData: ["canonicalStandings"], nextAllowedAction: "registry_only_review" },
      { competitionSlug: "blocked.1", providerId: "provider_blocked", missingData: ["contractRepairOrUnblock"], nextAllowedAction: "blocked_no_action" }
    ],
    blockedProviderBoard: [
      { providerId: "provider_blocked", competitions: ["blocked.1"] }
    ]
  };

  const report = buildDecisionBoard(mock);
  const bySlug = Object.fromEntries(report.rows.map((row) => [row.competitionSlug, row]));

  if (bySlug["covered.1"].actionBucket !== "no_action_covered") {
    throw new Error("covered.1 should be no_action_covered");
  }
  if (bySlug["local.1"].actionBucket !== "local_canonical_source_authority_review") {
    throw new Error("local.1 should be source authority review, not fixture chase");
  }
  if (bySlug["active_missing_standings.1"].actionBucket !== "standings_provider_batch_needed") {
    throw new Error("active_missing_standings.1 should need standings batch");
  }
  if (bySlug["blocked.1"].actionBucket !== "blocked_no_action") {
    throw new Error("blocked.1 should remain blocked");
  }
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) {
    throw new Error("read-only guarantees failed");
  }

  console.log(JSON.stringify({
    ok: true,
    selfTest: "passed",
    checked: {
      covered: bySlug["covered.1"].actionBucket,
      local: bySlug["local.1"].actionBucket,
      activeMissingStandings: bySlug["active_missing_standings.1"].actionBucket,
      blocked: bySlug["blocked.1"].actionBucket
    },
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

  const board = readJson(args.input);
  const report = buildDecisionBoard(board);

  writeJson(args.output, report);

  console.log(JSON.stringify({
    output: args.output,
    summary: report.summary,
    actionBuckets: report.actionBuckets,
    guarantees: report.guarantees
  }, null, 2));
}

main();
