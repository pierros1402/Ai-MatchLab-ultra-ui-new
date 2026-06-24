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

function nonEmptyObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;
}

function sourceCountsKnown(sourceBasis) {
  return (
    nonEmptyObject(sourceBasis?.canonicalFixtureSourceCounts) ||
    nonEmptyObject(sourceBasis?.canonicalStandingsSourceCounts)
  );
}

function hasUnknownStandingsSource(sourceBasis) {
  const counts = sourceBasis?.canonicalStandingsSourceCounts || {};
  return Object.keys(counts).some((key) => key === "unknown" || key.includes("unknown"));
}

function decideReviewTask(task) {
  const sourceBasis = task.sourceBasis || {};
  const fixtureSourcesKnown = nonEmptyObject(sourceBasis.canonicalFixtureSourceCounts);
  const standingsSourcesKnown = nonEmptyObject(sourceBasis.canonicalStandingsSourceCounts);
  const anySourcesKnown = sourceCountsKnown(sourceBasis);
  const unknownStandingsSource = hasUnknownStandingsSource(sourceBasis);
  const missingData = sourceBasis.missingData || [];

  if (task.reviewType === "local_canonical_source_authority") {
    if (unknownStandingsSource) {
      return {
        truthDecision: "defer_source_authority_repair",
        confidence: 0.7,
        decisionReason: "Local canonical coverage exists, but at least one canonical source is unknown; keep runtime coverage separate from provider/source promotion.",
        acceptedForRuntimeUse: true,
        approvedForPromotion: false,
        needsEvidence: ["source_authority_for_unknown_canonical_rows"],
        nextAction: "build source authority/memory repair plan for local canonical coverage",
        memoryUpdateIntent: "record local coverage as usable-but-nonpromoted until source authority is repaired"
      };
    }

    if (fixtureSourcesKnown && standingsSourcesKnown) {
      return {
        truthDecision: "accept_local_authority_memory_only",
        confidence: 0.75,
        decisionReason: "Local canonical coverage has explicit fixture and standings source counts; accept as memory-only authority, not provider promotion.",
        acceptedForRuntimeUse: true,
        approvedForPromotion: false,
        needsEvidence: [],
        nextAction: "build source-map memory normalization plan if provider promotion is later required",
        memoryUpdateIntent: "record local source authority as accepted for current runtime coverage"
      };
    }

    if (anySourcesKnown) {
      return {
        truthDecision: "partial_accept_defer_missing_source_authority",
        confidence: 0.65,
        decisionReason: "Some source authority exists, but coverage is not fully explained; accept current runtime coverage only with reduced confidence.",
        acceptedForRuntimeUse: true,
        approvedForPromotion: false,
        needsEvidence: ["complete_source_basis_for_all_canonical_rows"],
        nextAction: "defer provider promotion and schedule source-basis repair",
        memoryUpdateIntent: "record partial authority and missing source-basis gap"
      };
    }

    return {
      truthDecision: "defer_source_authority_repair",
      confidence: 0.55,
      decisionReason: "Local canonical coverage exists but source basis is insufficient; do not promote authority.",
      acceptedForRuntimeUse: false,
      approvedForPromotion: false,
      needsEvidence: ["canonical_source_basis"],
      nextAction: "source authority repair before acceptance",
      memoryUpdateIntent: "record local coverage as non-authoritative"
    };
  }

  if (task.reviewType === "cup_winner_final_truth_memory") {
    if (missingData.includes("cupWinnerFinalState")) {
      return {
        truthDecision: "needs_evidence_before_promotion",
        confidence: 0.7,
        decisionReason: "Cup winner/final state is still marked missing in Truth/Memory sourceBasis; do not promote without explicit final evidence and required independent confirmation.",
        acceptedForRuntimeUse: false,
        approvedForPromotion: false,
        needsEvidence: ["official_final_result_evidence", "independent_second_source_if_writer_requires"],
        nextAction: "build evidence-gap task, not writer plan",
        memoryUpdateIntent: "record cup state as missing evidence/deferred"
      };
    }

    return {
      truthDecision: "defer_until_writer_evidence_policy_check",
      confidence: 0.65,
      decisionReason: "Cup review requires writer policy validation before promotion.",
      acceptedForRuntimeUse: false,
      approvedForPromotion: false,
      needsEvidence: ["writer_policy_evidence_requirements"],
      nextAction: "verify writer evidence policy before promotion plan",
      memoryUpdateIntent: "record cup state review as pending policy check"
    };
  }

  return {
    truthDecision: "blocked_unknown_review_type",
    confidence: 0.4,
    decisionReason: `Unsupported review type: ${task.reviewType}`,
    acceptedForRuntimeUse: false,
    approvedForPromotion: false,
    needsEvidence: ["supported_review_policy"],
    nextAction: "add explicit review policy before action",
    memoryUpdateIntent: "record unsupported review type"
  };
}

function buildDecisionPlan(reviewBatch) {
  const decisions = (reviewBatch.reviewTasks || []).map((task) => {
    const decision = decideReviewTask(task);

    return {
      competitionSlug: task.competitionSlug,
      providerId: task.providerId,
      seasonState: task.seasonState,
      reviewType: task.reviewType,
      intentNeed: task.intentNeed,
      priority: task.priority,
      inputConfidence: task.confidence,
      truthDecision: decision.truthDecision,
      decisionConfidence: decision.confidence,
      decisionReason: decision.decisionReason,
      acceptedForRuntimeUse: decision.acceptedForRuntimeUse,
      approvedForPromotion: decision.approvedForPromotion,
      needsEvidence: decision.needsEvidence,
      nextAction: decision.nextAction,
      memoryUpdateIntent: decision.memoryUpdateIntent,
      inputDecisionQuestion: task.decisionQuestion,
      sourceReason: task.sourceReason,
      refinementReason: task.refinementReason,
      sourceBasis: task.sourceBasis,
      canonicalWrites: 0,
      productionWrite: false
    };
  });

  const byTruthDecision = decisions.reduce((acc, row) => {
    acc[row.truthDecision] ||= [];
    acc[row.truthDecision].push(row.competitionSlug);
    return acc;
  }, {});

  const acceptedRuntime = decisions.filter((row) => row.acceptedForRuntimeUse).map((row) => row.competitionSlug);
  const promotionReady = decisions.filter((row) => row.approvedForPromotion).map((row) => row.competitionSlug);
  const needsEvidence = decisions.filter((row) => row.needsEvidence.length > 0).map((row) => row.competitionSlug);

  return {
    ok: true,
    job: "build-football-truth-memory-review-decision-plan",
    generatedAt: new Date().toISOString(),
    inputSummary: reviewBatch.summary || {},
    summary: {
      reviewTaskCount: decisions.length,
      truthDecisionCount: Object.keys(byTruthDecision).length,
      acceptedForRuntimeUseCount: acceptedRuntime.length,
      approvedForPromotionCount: promotionReady.length,
      needsEvidenceCount: needsEvidence.length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    byTruthDecision,
    acceptedRuntime,
    promotionReady,
    needsEvidence,
    decisions: decisions.sort((a, b) => b.priority - a.priority || a.competitionSlug.localeCompare(b.competitionSlug)),
    nextRecommendedAction: {
      type: "memory_update_plan_not_acquisition",
      reason: "Decisions separate runtime acceptance from provider/source promotion; no endpoint acquisition is authorized here.",
      competitions: decisions.map((row) => row.competitionSlug)
    },
    policy: {
      purpose: "Convert Truth/Memory review tasks into explicit accept/defer/needs-evidence decisions.",
      inputContract: "Consumes review batch only.",
      noFetch: true,
      noSearch: true,
      noCanonicalWrites: true,
      noPromotionWrites: true,
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
  const reviewBatch = {
    summary: { reviewTaskCount: 3, canonicalWrites: 0, productionWrite: false },
    reviewTasks: [
      {
        competitionSlug: "esp.1",
        providerId: "laliga_official",
        seasonState: "active",
        intentNeed: "source_authority_validation",
        priority: 40,
        confidence: 0.65,
        reviewType: "local_canonical_source_authority",
        decisionQuestion: "Can existing local canonical coverage be trusted?",
        sourceReason: "local coverage",
        refinementReason: "authority review",
        sourceBasis: {
          canonicalFixtureSourceCounts: { espn: 29 },
          canonicalStandingsSourceCounts: { unknown: 20 },
          missingData: []
        }
      },
      {
        competitionSlug: "local.good",
        providerId: "provider_good",
        seasonState: "active",
        intentNeed: "source_authority_validation",
        priority: 30,
        confidence: 0.7,
        reviewType: "local_canonical_source_authority",
        decisionQuestion: "Can existing local canonical coverage be trusted?",
        sourceReason: "local coverage",
        refinementReason: "authority review",
        sourceBasis: {
          canonicalFixtureSourceCounts: { official_provider: 20 },
          canonicalStandingsSourceCounts: { official_provider: 10 },
          missingData: []
        }
      },
      {
        competitionSlug: "sco.challenge",
        providerId: "spfl_challenge_cup_official",
        seasonState: "unknown_or_partial",
        intentNeed: "cup_winner_final_state",
        priority: 70,
        confidence: 0.65,
        reviewType: "cup_winner_final_truth_memory",
        decisionQuestion: "Is cup final evidence sufficient?",
        sourceReason: "cup missing",
        refinementReason: "cup review",
        sourceBasis: {
          canonicalCoverageStatus: "local_canonical_coverage_source_unknown",
          missingData: ["cupWinnerFinalState"],
          nextAllowedAction: "registry_only_review"
        }
      }
    ]
  };

  const report = buildDecisionPlan(reviewBatch);
  const bySlug = Object.fromEntries(report.decisions.map((row) => [row.competitionSlug, row]));

  if (bySlug["esp.1"].truthDecision !== "defer_source_authority_repair") {
    throw new Error("esp.1 should defer source authority repair due unknown source");
  }
  if (bySlug["local.good"].truthDecision !== "accept_local_authority_memory_only") {
    throw new Error("local.good should be memory-only accepted");
  }
  if (bySlug["sco.challenge"].truthDecision !== "needs_evidence_before_promotion") {
    throw new Error("sco.challenge should need evidence before promotion");
  }
  if (report.summary.approvedForPromotionCount !== 0) {
    throw new Error("no row should be promotion-ready in this decision plan");
  }
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) {
    throw new Error("read-only guarantees failed");
  }

  console.log(JSON.stringify({
    ok: true,
    selfTest: "passed",
    byTruthDecision: report.byTruthDecision,
    summary: report.summary,
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

  const reviewBatch = readJson(args.input);
  const report = buildDecisionPlan(reviewBatch);

  writeJson(args.output, report);

  console.log(JSON.stringify({
    output: args.output,
    summary: report.summary,
    byTruthDecision: report.byTruthDecision,
    acceptedRuntime: report.acceptedRuntime,
    promotionReady: report.promotionReady,
    needsEvidence: report.needsEvidence,
    nextRecommendedAction: report.nextRecommendedAction,
    guarantees: report.guarantees
  }, null, 2));
}

main();
