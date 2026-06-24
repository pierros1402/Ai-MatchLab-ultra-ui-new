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

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function classifyBucket(row) {
  const bucket = row.actionBucket;
  const nextAllowedAction = row.sourceBasis?.nextAllowedAction || "";
  const coverage = row.sourceBasis?.canonicalCoverageStatus || "";

  if (bucket === "no_action_covered") {
    return {
      executionClass: "covered_no_action",
      actionableNow: false,
      reason: "Truth/Memory says coverage is sufficient for current state."
    };
  }

  if (bucket === "blocked_no_action") {
    return {
      executionClass: "blocked_memory",
      actionableNow: false,
      reason: "Known blocked lane; store as blocked memory and do not retry without changed strategy."
    };
  }

  if (bucket === "local_canonical_source_authority_review") {
    return {
      executionClass: "truth_memory_review_actionable",
      actionableNow: true,
      reason: "Local canonical data exists but source authority is weak/non-registry. This is a Truth/Memory task, not data acquisition."
    };
  }

  if (bucket === "standings_provider_batch_needed") {
    if (nextAllowedAction === "registry_only_review") {
      return {
        executionClass: "deferred_provider_parser_or_registry_repair",
        actionableNow: false,
        reason: "Standings are missing, but the board says registry/provider parser review first. Do not chase endpoint now."
      };
    }

    return {
      executionClass: "actionable_standings_provider_batch",
      actionableNow: true,
      reason: "Official standings are missing and the board does not block provider acquisition."
    };
  }

  if (bucket === "cup_winner_final_state_needed") {
    if (coverage === "local_canonical_coverage_source_unknown" || nextAllowedAction === "registry_only_review") {
      return {
        executionClass: "truth_memory_review_actionable",
        actionableNow: true,
        reason: "Cup final/winner state needs Truth/Memory authority review before any promotion."
      };
    }

    return {
      executionClass: "actionable_cup_state_batch",
      actionableNow: true,
      reason: "Cup winner/final state is missing and needs batch evidence."
    };
  }

  return {
    executionClass: "unknown_needs_intent_review",
    actionableNow: false,
    reason: "No safe execution policy for this bucket yet."
  };
}

function buildRefinement(autonomy) {
  const refinedRows = (autonomy.rows || []).map((row) => {
    const refined = classifyBucket(row);

    return {
      competitionSlug: row.competitionSlug,
      providerId: row.providerId,
      seasonState: row.seasonState,
      intentNeed: row.intentNeed,
      originalActionBucket: row.actionBucket,
      executionClass: refined.executionClass,
      actionableNow: refined.actionableNow,
      priority: row.priority,
      confidence: row.confidence,
      reason: refined.reason,
      sourceReason: row.reason,
      sourceBasis: row.sourceBasis,
      requiredData: row.requiredData || [],
      canonicalWrites: 0,
      productionWrite: false
    };
  });

  const executionBuckets = refinedRows.reduce((acc, row) => {
    acc[row.executionClass] ||= [];
    acc[row.executionClass].push(row.competitionSlug);
    return acc;
  }, {});

  const sortedRows = refinedRows.sort((a, b) => {
    if (a.actionableNow !== b.actionableNow) return a.actionableNow ? -1 : 1;
    return b.priority - a.priority || a.competitionSlug.localeCompare(b.competitionSlug);
  });

  const nextRecommendedBatch = {
    first: "truth_memory_review_actionable",
    reason: "Advance the foundation without endpoint chasing: validate source authority/confidence for existing local canonical data and cup state.",
    competitions: executionBuckets.truth_memory_review_actionable || []
  };

  return {
    ok: true,
    job: "build-football-truth-autonomy-bucket-refinement",
    generatedAt: new Date().toISOString(),
    inputSummary: autonomy.summary || {},
    summary: {
      competitionCount: sortedRows.length,
      executionBucketCount: Object.keys(executionBuckets).length,
      actionableNowCount: sortedRows.filter((row) => row.actionableNow).length,
      coveredNoActionCount: sortedRows.filter((row) => row.executionClass === "covered_no_action").length,
      blockedMemoryCount: sortedRows.filter((row) => row.executionClass === "blocked_memory").length,
      deferredProviderParserOrRegistryRepairCount: sortedRows.filter((row) => row.executionClass === "deferred_provider_parser_or_registry_repair").length,
      truthMemoryReviewActionableCount: sortedRows.filter((row) => row.executionClass === "truth_memory_review_actionable").length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    executionBuckets,
    rows: sortedRows,
    nextRecommendedBatch,
    policy: {
      inputContract: "Consumes autonomy decision board; does not infer coverage from filesystem.",
      executionLayer: "Refines autonomous decisions into covered/deferred/blocked/actionable classes.",
      noFetch: true,
      noSearch: true,
      noCanonicalWrites: true,
      noEndpointChasing: true,
      noSingleLeagueDrift: true
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
  const autonomy = {
    summary: { canonicalWrites: 0, productionWrite: false },
    rows: [
      {
        competitionSlug: "covered.1",
        providerId: "provider_a",
        seasonState: "active",
        intentNeed: "none",
        actionBucket: "no_action_covered",
        priority: 0,
        confidence: 0.95,
        reason: "covered",
        sourceBasis: { nextAllowedAction: "no_action_covered", canonicalCoverageStatus: "provider_promoted_or_partially_promoted_with_local_coverage" }
      },
      {
        competitionSlug: "local.1",
        providerId: "provider_b",
        seasonState: "active",
        intentNeed: "source_authority_validation",
        actionBucket: "local_canonical_source_authority_review",
        priority: 40,
        confidence: 0.65,
        reason: "authority review",
        sourceBasis: { nextAllowedAction: "local_canonical_coverage_review", canonicalCoverageStatus: "local_canonical_coverage_from_non_registry_source" }
      },
      {
        competitionSlug: "standings.deferred",
        providerId: "provider_c",
        seasonState: "active",
        intentNeed: "official_standings",
        actionBucket: "standings_provider_batch_needed",
        priority: 80,
        confidence: 0.8,
        reason: "standings missing",
        sourceBasis: { nextAllowedAction: "registry_only_review", canonicalCoverageStatus: "provider_promoted_or_partially_promoted_with_local_coverage" }
      },
      {
        competitionSlug: "blocked.1",
        providerId: "provider_d",
        seasonState: "blocked",
        intentNeed: "blocked_memory",
        actionBucket: "blocked_no_action",
        priority: 0,
        confidence: 1,
        reason: "blocked",
        sourceBasis: { nextAllowedAction: "blocked_no_action", canonicalCoverageStatus: "blocked" }
      },
      {
        competitionSlug: "cup.1",
        providerId: "provider_e",
        seasonState: "unknown_or_partial",
        intentNeed: "cup_winner_final_state",
        actionBucket: "cup_winner_final_state_needed",
        priority: 70,
        confidence: 0.65,
        reason: "cup state",
        sourceBasis: { nextAllowedAction: "registry_only_review", canonicalCoverageStatus: "local_canonical_coverage_source_unknown" }
      }
    ]
  };

  const report = buildRefinement(autonomy);
  const bySlug = Object.fromEntries(report.rows.map((row) => [row.competitionSlug, row]));

  if (bySlug["covered.1"].executionClass !== "covered_no_action") {
    throw new Error("covered.1 should be covered_no_action");
  }
  if (bySlug["local.1"].executionClass !== "truth_memory_review_actionable") {
    throw new Error("local.1 should be truth_memory_review_actionable");
  }
  if (bySlug["standings.deferred"].executionClass !== "deferred_provider_parser_or_registry_repair") {
    throw new Error("standings.deferred should be deferred");
  }
  if (bySlug["blocked.1"].executionClass !== "blocked_memory") {
    throw new Error("blocked.1 should be blocked_memory");
  }
  if (bySlug["cup.1"].executionClass !== "truth_memory_review_actionable") {
    throw new Error("cup.1 should be truth_memory_review_actionable before promotion");
  }
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) {
    throw new Error("read-only guarantees failed");
  }

  console.log(JSON.stringify({
    ok: true,
    selfTest: "passed",
    checked: {
      covered: bySlug["covered.1"].executionClass,
      local: bySlug["local.1"].executionClass,
      deferred: bySlug["standings.deferred"].executionClass,
      blocked: bySlug["blocked.1"].executionClass,
      cup: bySlug["cup.1"].executionClass
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

  const autonomy = readJson(args.input);
  const report = buildRefinement(autonomy);

  writeJson(args.output, report);

  console.log(JSON.stringify({
    output: args.output,
    summary: report.summary,
    executionBuckets: report.executionBuckets,
    nextRecommendedBatch: report.nextRecommendedBatch,
    guarantees: report.guarantees
  }, null, 2));
}

main();
