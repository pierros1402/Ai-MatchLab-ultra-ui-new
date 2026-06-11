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

function effectiveActionBucket(row) {
  return row.memoryAwareActionBucket || row.actionBucket || row.originalActionBucket || "unknown";
}

function classifyExecution(row) {
  const bucket = effectiveActionBucket(row);
  const overlay = row.memoryOverlayStatus || "no_memory_overlay";
  const allowedNow = row.memoryAwareAllowedNow ?? row.allowedNow ?? true;

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
      actionableNow: Boolean(allowedNow),
      reason: "Trusted standings provider/source signal exists; route to provider/parser/registry repair planning as a full-map batch."
    };
  }

  if (bucket === "standings_discovery_or_provider_validation_needed") {
    return {
      executionBucket: "provider_discovery_validation_batch_candidate",
      actionableNow: Boolean(allowedNow),
      reason: "Canonical standings are missing but provider signals are absent or untrusted/noisy; route to provider discovery/validation before parser repair."
    };
  }

  if (bucket === "fixture_or_result_provider_batch_needed") {
    return {
      executionBucket: "provider_repair_batch_candidate",
      actionableNow: Boolean(allowedNow),
      reason: "Fixture/result provider gap requires provider/parser/registry repair planning as a batch."
    };
  }

  if (bucket === "cup_winner_final_state_needed") {
    return {
      executionBucket: "cup_final_winner_evidence_batch_candidate",
      actionableNow: Boolean(allowedNow),
      reason: "Cup final/winner state needs evidence acquisition and validation before promotion."
    };
  }

  if (bucket === "registry_gap_review_needed") {
    return {
      executionBucket: "registry_gap_review_candidate",
      actionableNow: Boolean(allowedNow),
      reason: "Registry gap requires league discovery map / registry review, not standings provider repair."
    };
  }

  if (bucket === "truth_review_signal_batch_needed") {
    return {
      executionBucket: "truth_review_batch_candidate",
      actionableNow: Boolean(allowedNow),
      reason: "Competition has signals but not enough trusted canonical coverage; route to Truth review batch."
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

  if (bucket === "discovered_no_actionable_signal") {
    return {
      executionBucket: "discovered_no_action",
      actionableNow: false,
      reason: "Competition is discovered but has no actionable signal in this pass."
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
    const actionBucket = effectiveActionBucket(row);
    const execution = classifyExecution(row);

    return {
      competitionSlug: row.competitionSlug,
      competitionType: row.competitionType,
      providerId: row.providerId,
      providers: row.providers || [],
      trustedProviderIds: row.trustedProviderIds || [],
      noisyProviderSignals: row.noisyProviderSignals || [],
      rawProviderSignals: row.rawProviderSignals || [],
      seasonState: row.seasonState,
      priority: row.priority,
      confidence: row.confidence,
      actionBucket,
      originalActionBucket: row.originalActionBucket || row.actionBucket || actionBucket,
      memoryOverlayStatus: row.memoryOverlayStatus || "no_memory_overlay",
      memoryAwareActionBucket: row.memoryAwareActionBucket || actionBucket,
      memoryAwareAllowedNow: row.memoryAwareAllowedNow ?? row.allowedNow ?? true,
      executionBucket: execution.executionBucket,
      actionableNow: execution.actionableNow,
      executionReason: execution.reason,
      memoryAwareReason: row.memoryAwareReason || row.reason,
      memoryRecords: row.memoryRecords || [],
      requiredData: row.requiredData || [],
      intentNeed: row.intentNeed,
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

  const executionPriority = [
    {
      bucket: "provider_discovery_validation_batch_candidate",
      reason: "Start with full-map provider discovery/validation for missing standings where current signals are absent or untrusted/noisy."
    },
    {
      bucket: "provider_repair_batch_candidate",
      reason: "Trusted provider/source signals exist; plan provider/parser/registry repair as a full-map batch."
    },
    {
      bucket: "truth_review_batch_candidate",
      reason: "Run Truth review over competitions with signals but insufficient trusted canonical coverage."
    },
    {
      bucket: "registry_gap_review_candidate",
      reason: "Resolve registry gaps through League Discovery Map / registry review."
    },
    {
      bucket: "cup_final_winner_evidence_batch_candidate",
      reason: "Acquire and validate final/winner evidence for cup competitions."
    }
  ];

  const nextRecommendedBatch = (() => {
    for (const candidate of executionPriority) {
      const competitions = rows
        .filter((row) => row.executionBucket === candidate.bucket && row.actionableNow)
        .map((row) => row.competitionSlug);

      if (competitions.length > 0) {
        return {
          first: candidate.bucket,
          reason: candidate.reason,
          competitions
        };
      }
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
      providerDiscoveryValidationBatchCandidateCount: executionBuckets.provider_discovery_validation_batch_candidate?.length || 0,
      providerRepairBatchCandidateCount: executionBuckets.provider_repair_batch_candidate?.length || 0,
      truthReviewBatchCandidateCount: executionBuckets.truth_review_batch_candidate?.length || 0,
      registryGapReviewCandidateCount: executionBuckets.registry_gap_review_candidate?.length || 0,
      cupFinalWinnerEvidenceBatchCandidateCount: executionBuckets.cup_final_winner_evidence_batch_candidate?.length || 0,
      coveredNoActionCount: executionBuckets.covered_no_action?.length || 0,
      blockedMemoryOrProviderContractCount: executionBuckets.blocked_memory_or_provider_contract?.length || 0,
      unclassifiedCount: (executionBuckets.unclassified_no_memory_overlay?.length || 0) + (executionBuckets.unclassified_memory_overlay?.length || 0),
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    executionBuckets,
    nextRecommendedBatch,
    rows,
    policy: {
      purpose: "Refine memory-aware/full-map autonomy board into execution buckets so recorded memory gaps and full-map action lanes are selected as coherent batches.",
      inputContract: "Consumes memory-aware or full-map autonomy board rows.",
      noFetch: true,
      noSearch: true,
      noActualWrites: true,
      noCanonicalWrites: true,
      noPromotionWrites: true,
      noEndpointChasing: true,
      noSingleLeagueDrift: true,
      fullMapScope: true
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
    summary: { competitionCount: 11 },
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
        actionBucket: "standings_provider_batch_needed"
      },
      {
        competitionSlug: "nor.2",
        memoryOverlayStatus: "no_memory_overlay",
        actionBucket: "standings_discovery_or_provider_validation_needed"
      },
      {
        competitionSlug: "bbb.cup",
        memoryOverlayStatus: "no_memory_overlay",
        actionBucket: "cup_winner_final_state_needed"
      },
      {
        competitionSlug: "ggg.gap",
        memoryOverlayStatus: "no_memory_overlay",
        actionBucket: "registry_gap_review_needed"
      },
      {
        competitionSlug: "fff.cup",
        memoryOverlayStatus: "no_memory_overlay",
        actionBucket: "truth_review_signal_batch_needed"
      },
      {
        competitionSlug: "zzz.1",
        memoryOverlayStatus: "no_memory_overlay",
        actionBucket: "discovered_no_actionable_signal"
      },
      {
        competitionSlug: "nor.1",
        memoryOverlayStatus: "no_memory_overlay",
        actionBucket: "no_action_covered"
      },
      {
        competitionSlug: "sco.1",
        memoryOverlayStatus: "no_memory_overlay",
        actionBucket: "blocked_no_action"
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
  if (bySlug["nor.2"].executionBucket !== "provider_discovery_validation_batch_candidate") {
    throw new Error("nor.2 should be provider discovery/validation candidate");
  }
  if (bySlug["bbb.cup"].executionBucket !== "cup_final_winner_evidence_batch_candidate") {
    throw new Error("bbb.cup should be cup final/winner evidence candidate");
  }
  if (bySlug["ggg.gap"].executionBucket !== "registry_gap_review_candidate") {
    throw new Error("ggg.gap should be registry gap review candidate");
  }
  if (bySlug["fff.cup"].executionBucket !== "truth_review_batch_candidate") {
    throw new Error("fff.cup should be truth review candidate");
  }
  if (bySlug["zzz.1"].executionBucket !== "discovered_no_action") {
    throw new Error("zzz.1 should be discovered no-action");
  }
  if (bySlug["nor.1"].executionBucket !== "covered_no_action") {
    throw new Error("nor.1 should remain covered");
  }
  if (bySlug["sco.1"].executionBucket !== "blocked_memory_or_provider_contract") {
    throw new Error("sco.1 should remain blocked");
  }
  if (report.nextRecommendedBatch.first !== "provider_discovery_validation_batch_candidate") {
    throw new Error("next recommended batch should be provider discovery/validation");
  }
  if (report.summary.memorySuppressedCount !== 3) {
    throw new Error(`expected 3 suppressed rows, got ${report.summary.memorySuppressedCount}`);
  }
  if (report.summary.unclassifiedCount !== 0) {
    throw new Error(`expected 0 unclassified rows in self-test, got ${report.summary.unclassifiedCount}`);
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
