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

function requiredReviewFor(row) {
  const slug = row.competitionSlug;
  const intentNeed = row.intentNeed;
  const originalActionBucket = row.originalActionBucket;
  const sourceBasis = row.sourceBasis || {};
  const coverage = sourceBasis.canonicalCoverageStatus || "";
  const missingData = sourceBasis.missingData || [];
  const nextAllowedAction = sourceBasis.nextAllowedAction || "";

  if (originalActionBucket === "local_canonical_source_authority_review") {
    return {
      reviewType: "local_canonical_source_authority",
      decisionQuestion: "Can existing local canonical coverage be trusted/promoted into provider/source memory without re-acquiring data?",
      requiredChecks: [
        "verify canonical data has enough sourceBasis/sourceCounts to explain origin",
        "verify source is acceptable for current competition state",
        "decide whether provider contract/source map needs update",
        "do not fetch replacement data unless a later acquisition policy explicitly allows it"
      ],
      expectedOutcome: "authority_accept_or_defer",
      ifAccepted: "mark source authority/memory as acceptable for current canonical coverage",
      ifRejected: "keep local canonical coverage as non-registry and schedule provider contract repair, not endpoint chasing"
    };
  }

  if (originalActionBucket === "cup_winner_final_state_needed" || missingData.includes("cupWinnerFinalState")) {
    return {
      reviewType: "cup_winner_final_truth_memory",
      decisionQuestion: "Is existing cup final/winner evidence strong enough for winner/final state promotion, or does it remain missing/deferred?",
      requiredChecks: [
        "verify official final result evidence exists",
        "verify independent/second-source requirement if writer policy requires it",
        "verify winner/final date/status confidence",
        "do not promote until Truth/Memory confidence is sufficient"
      ],
      expectedOutcome: "promotion_ready_or_missing_second_source",
      ifAccepted: "build a later writer-compatible promotion plan with explicit evidence",
      ifRejected: "store missing/blocked reason in memory and do not retry blindly"
    };
  }

  return {
    reviewType: "generic_truth_memory_review",
    decisionQuestion: `Review ${slug} for source authority and confidence before action.`,
    requiredChecks: [
      "verify state, sourceBasis, confidence, missingData, and nextAllowedAction",
      "classify as authority accepted, deferred, blocked, or acquisition needed"
    ],
    expectedOutcome: "authority_accept_defer_or_block",
    ifAccepted: "update memory/source-map path in a later controlled source job",
    ifRejected: "store reason and stop"
  };
}

function buildReviewBatch(refinement) {
  const actionableRows = (refinement.rows || []).filter((row) => {
    return row.executionClass === "truth_memory_review_actionable" && row.actionableNow === true;
  });

  const reviewTasks = actionableRows.map((row) => {
    const review = requiredReviewFor(row);

    return {
      competitionSlug: row.competitionSlug,
      providerId: row.providerId,
      seasonState: row.seasonState,
      intentNeed: row.intentNeed,
      executionClass: row.executionClass,
      originalActionBucket: row.originalActionBucket,
      priority: row.priority,
      confidence: row.confidence,
      reviewType: review.reviewType,
      decisionQuestion: review.decisionQuestion,
      requiredChecks: review.requiredChecks,
      expectedOutcome: review.expectedOutcome,
      ifAccepted: review.ifAccepted,
      ifRejected: review.ifRejected,
      sourceReason: row.sourceReason,
      refinementReason: row.reason,
      sourceBasis: row.sourceBasis,
      canonicalWrites: 0,
      productionWrite: false
    };
  });

  const byReviewType = reviewTasks.reduce((acc, task) => {
    acc[task.reviewType] ||= [];
    acc[task.reviewType].push(task.competitionSlug);
    return acc;
  }, {});

  const nextManualReviewOrder = [...reviewTasks]
    .sort((a, b) => b.priority - a.priority || a.competitionSlug.localeCompare(b.competitionSlug))
    .map((task) => task.competitionSlug);

  return {
    ok: true,
    job: "build-football-truth-memory-review-batch",
    generatedAt: new Date().toISOString(),
    inputSummary: refinement.summary || {},
    summary: {
      inputCompetitionCount: refinement.summary?.competitionCount || 0,
      reviewTaskCount: reviewTasks.length,
      reviewTypeCount: Object.keys(byReviewType).length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    byReviewType,
    nextManualReviewOrder,
    reviewTasks,
    policy: {
      purpose: "Turn actionable Truth/Memory rows into review tasks; do not perform acquisition.",
      noFetch: true,
      noSearch: true,
      noCanonicalWrites: true,
      noEndpointChasing: true,
      noSingleLeagueDrift: true,
      onlyConsumesRefinementBoard: true
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
  const refinement = {
    summary: { competitionCount: 5, canonicalWrites: 0, productionWrite: false },
    rows: [
      {
        competitionSlug: "esp.1",
        providerId: "laliga_official",
        seasonState: "active",
        intentNeed: "source_authority_validation",
        originalActionBucket: "local_canonical_source_authority_review",
        executionClass: "truth_memory_review_actionable",
        actionableNow: true,
        priority: 40,
        confidence: 0.65,
        reason: "review local source",
        sourceReason: "local canonical exists",
        sourceBasis: {
          canonicalCoverageStatus: "local_canonical_coverage_from_non_registry_source",
          missingData: [],
          nextAllowedAction: "local_canonical_coverage_review"
        }
      },
      {
        competitionSlug: "sco.challenge",
        providerId: "spfl_challenge_cup_official",
        seasonState: "unknown_or_partial",
        intentNeed: "cup_winner_final_state",
        originalActionBucket: "cup_winner_final_state_needed",
        executionClass: "truth_memory_review_actionable",
        actionableNow: true,
        priority: 70,
        confidence: 0.65,
        reason: "review cup state",
        sourceReason: "cup state missing",
        sourceBasis: {
          canonicalCoverageStatus: "local_canonical_coverage_source_unknown",
          missingData: ["cupWinnerFinalState"],
          nextAllowedAction: "registry_only_review"
        }
      },
      {
        competitionSlug: "fin.1",
        providerId: "palloliitto_torneopal_official",
        seasonState: "active",
        intentNeed: "official_standings",
        originalActionBucket: "standings_provider_batch_needed",
        executionClass: "deferred_provider_parser_or_registry_repair",
        actionableNow: false,
        priority: 80,
        confidence: 0.8,
        reason: "deferred",
        sourceReason: "standings missing",
        sourceBasis: {
          canonicalCoverageStatus: "provider_promoted_or_partially_promoted_with_local_coverage",
          missingData: ["canonicalStandings"],
          nextAllowedAction: "registry_only_review"
        }
      }
    ]
  };

  const report = buildReviewBatch(refinement);
  const slugs = report.reviewTasks.map((task) => task.competitionSlug).sort();

  if (report.reviewTaskCount === 0) {
    throw new Error("reviewTaskCount should not be zero");
  }
  if (report.summary.reviewTaskCount !== 2) {
    throw new Error(`expected 2 review tasks, got ${report.summary.reviewTaskCount}`);
  }
  if (!slugs.includes("esp.1") || !slugs.includes("sco.challenge")) {
    throw new Error(`expected esp.1 and sco.challenge review tasks, got ${slugs.join(",")}`);
  }
  if (slugs.includes("fin.1")) {
    throw new Error("fin.1 is deferred and must not be included in Truth/Memory review batch");
  }
  if (!report.byReviewType.local_canonical_source_authority?.includes("esp.1")) {
    throw new Error("esp.1 should be local_canonical_source_authority");
  }
  if (!report.byReviewType.cup_winner_final_truth_memory?.includes("sco.challenge")) {
    throw new Error("sco.challenge should be cup_winner_final_truth_memory");
  }
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) {
    throw new Error("read-only guarantees failed");
  }

  console.log(JSON.stringify({
    ok: true,
    selfTest: "passed",
    reviewTasks: slugs,
    byReviewType: report.byReviewType,
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

  const refinement = readJson(args.input);
  const report = buildReviewBatch(refinement);

  writeJson(args.output, report);

  console.log(JSON.stringify({
    output: args.output,
    summary: report.summary,
    byReviewType: report.byReviewType,
    nextManualReviewOrder: report.nextManualReviewOrder,
    guarantees: report.guarantees
  }, null, 2));
}

main();
