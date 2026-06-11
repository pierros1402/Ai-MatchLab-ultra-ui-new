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

function classifyExecution(row) {
  const bucket = row.memoryAwareActionBucket || row.actionBucket;
  const overlay = row.memoryOverlayStatus || "no_memory_overlay";

  if (bucket === "memory_recorded_no_review_repeat") {
    return {
      executionBucket: "memory_recorded_no_review_repeat",
      actionableNow: false,
      reason: "Memory already records this source-authority gap; suppress repeated review/acquisition unless source repair batch is explicitly selected."
    };
  }

  if (bucket === "memory_recorded_blocked_until_evidence") {
    return {
      executionBucket: "memory_recorded_blocked_until_evidence",
      actionableNow: false,
      reason: "Memory already records this evidence gap; suppress repeated review/promotion until evidence task is selected."
    };
  }

  if (bucket === "standings_provider_batch_needed") {
    return {
      executionBucket: "provider_repair_batch_candidate",
      actionableNow: true,
      reason: "Remaining gap requires provider/parser/registry repair planning as a batch, not repeated Truth/Memory review."
    };
  }

  if (bucket === "blocked_no_action") {
    return {
      executionBucket: "blocked_memory_or_provider_contract",
      actionableNow: false,
      reason: "Blocked provider/contract state remains blocked; do not retry blindly."
    };
  }

  if (bucket === "no_action_covered") {
    return {
      executionBucket: "covered_no_action",
      actionableNow: false,
      reason: "Coverage is already sufficient for this board."
    };
  }

  return {
    executionBucket: overlay === "no_memory_overlay" ? "unclassified_no_memory_overlay" : "unclassified_memory_overlay",
    actionableNow: false,
    reason: `No explicit memory-aware refinement rule for bucket: ${bucket}`
  };
}

function buildMemoryAwareRefinement(memoryAwareBoard) {
  const rows = (memoryAwareBoard.rows || []).map((row) => {
    const execution = classifyExecution(row);

    return {
      competitionSlug: row.competitionSlug,
      providerId: row.providerId,
      seasonState: row.seasonState,
      originalActionBucket: row.originalActionBucket || row.actionBucket,
      memoryOverlayStatus: row.memoryOverlayStatus,
      memoryAwareActionBucket: row.memoryAwareActionBucket,
      memoryAwareAllowedNow: row.memoryAwareAllowedNow,
      executionBucket: execution.executionBucket,
      actionableNow: execution.actionableNow,
      executionReason: execution.reason,
      memoryAwareReason: row.memoryAwareReason,
      memoryRecords: row.memoryRecords || [],
      requiredData: row.requiredData || [],
      sourceBasis: row.sourceBasis || {},
      canonicalWrites: 0,
      productionWrite: false
    };
  });

  const executionBuckets = rows.reduce((acc, row) => {
    acc[row.executionBucket] ||= [];
    acc[row.executionBucket].push(row.competitionSlug);
    return acc;
  }, {});

  const actionableRows = rows.filter((row) => row.actionableNow);
  const memorySuppressedRows = rows.filter((row) => {
    return row.executionBucket === "memory_recorded_no_review_repeat" ||
      row.executionBucket === "memory_recorded_blocked_until_evidence";
  });

  const nextRecommendedBatch = (() => {
    const providerRepair = rows
      .filter((row) => row.executionBucket === "provider_repair_batch_candidate")
      .map((row) => row.competitionSlug);

    if (providerRepair.length > 0) {
      return {
        first: "provider_repair_batch_candidate",
        reason: "After committed memory suppression, the remaining non-covered work is provider/parser/registry repair planning for standings gaps as a batch.",
        competitions: providerRepair
      };
    }

    return {
      first: "none",
      reason: "No actionable batch remains after memory-aware refinement.",
      competitions: []
    };
  })();

  return {
    ok: true,
    job: "build-football-truth-memory-aware-bucket-refinement",
    generatedAt: new Date().toISOString(),
    inputSummary: memoryAwareBoard.summary || {},
    summary: {
      competitionCount: rows.length,
      executionBucketCount: Object.keys(executionBuckets).length,
      actionableNowCount: actionableRows.length,
      memorySuppressedCount: memorySuppressedRows.length,
      providerRepairBatchCandidateCount: executionBuckets.provider_repair_batch_candidate?.length || 0,
      coveredNoActionCount: executionBuckets.covered_no_action?.length || 0,
      blockedMemoryOrProviderContractCount: executionBuckets.blocked_memory_or_provider_contract?.length || 0,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    executionBuckets,
    nextRecommendedBatch,
    rows,
    policy: {
      purpose: "Refine memory-aware autonomy board into execution buckets so recorded memory gaps are not selected repeatedly.",
      inputContract: "Consumes memory-aware autonomy board only.",
      noFetch: true,
      noSearch: true,
      noActualWrites: true,
      noCanonicalWrites: true,
      noPromotionWrites: true,
      noEndpointChasing: true,
      noSingleLeagueDrift: true
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
  const memoryAwareBoard = {
    summary: { competitionCount: 6 },
    rows: [
      {
        competitionSlug: "esp.1",
        memoryOverlayStatus: "source_authority_gap_recorded",
        memoryAwareActionBucket: "memory_recorded_no_review_repeat"
      },
      {
        competitionSlug: "esp.2",
        memoryOverlayStatus: "source_authority_gap_recorded",
        memoryAwareActionBucket: "memory_recorded_no_review_repeat"
      },
      {
        competitionSlug: "sco.challenge",
        memoryOverlayStatus: "evidence_gap_recorded",
        memoryAwareActionBucket: "memory_recorded_blocked_until_evidence"
      },
      {
        competitionSlug: "fin.1",
        memoryOverlayStatus: "no_memory_overlay",
        memoryAwareActionBucket: "standings_provider_batch_needed"
      },
      {
        competitionSlug: "nor.1",
        memoryOverlayStatus: "no_memory_overlay",
        memoryAwareActionBucket: "no_action_covered"
      },
      {
        competitionSlug: "sco.1",
        memoryOverlayStatus: "no_memory_overlay",
        memoryAwareActionBucket: "blocked_no_action"
      }
    ]
  };

  const report = buildMemoryAwareRefinement(memoryAwareBoard);
  const bySlug = Object.fromEntries(report.rows.map((row) => [row.competitionSlug, row]));

  if (bySlug["esp.1"].executionBucket !== "memory_recorded_no_review_repeat") {
    throw new Error("esp.1 should be memory suppressed");
  }
  if (bySlug["sco.challenge"].executionBucket !== "memory_recorded_blocked_until_evidence") {
    throw new Error("sco.challenge should be evidence-gap suppressed");
  }
  if (bySlug["fin.1"].executionBucket !== "provider_repair_batch_candidate") {
    throw new Error("fin.1 should be provider repair candidate");
  }
  if (bySlug["nor.1"].executionBucket !== "covered_no_action") {
    throw new Error("nor.1 should remain covered");
  }
  if (bySlug["sco.1"].executionBucket !== "blocked_memory_or_provider_contract") {
    throw new Error("sco.1 should remain blocked");
  }
  if (report.nextRecommendedBatch.first !== "provider_repair_batch_candidate") {
    throw new Error("next recommended batch should be provider repair");
  }
  if (report.summary.memorySuppressedCount !== 3) {
    throw new Error(`expected 3 suppressed rows, got ${report.summary.memorySuppressedCount}`);
  }
  if (report.guarantees.actualWrites !== 0 || report.guarantees.canonicalWrites !== 0) {
    throw new Error("read-only guarantees failed");
  }

  console.log(JSON.stringify({
    ok: true,
    selfTest: "passed",
    summary: report.summary,
    executionBuckets: report.executionBuckets,
    nextRecommendedBatch: report.nextRecommendedBatch,
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

  const memoryAwareBoard = readJson(args.input);
  const report = buildMemoryAwareRefinement(memoryAwareBoard);

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
