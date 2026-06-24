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

function classifyMemoryAction(decision) {
  if (decision.truthDecision === "defer_source_authority_repair") {
    return {
      memoryActionType: "source_authority_gap_record",
      writeClass: "plan_only_no_write",
      canonicalAction: "none",
      promotionAction: "none",
      memoryIntent: "Record runtime-usable local canonical coverage as non-promoted until unknown source rows are explained.",
      repairTarget: "canonical source basis / provider source map",
      requiredEvidence: decision.needsEvidence || ["source_authority_for_unknown_canonical_rows"],
      blocker: "unknown canonical source rows",
      nextSafeJobType: "source_authority_memory_repair_writer_plan_dry_run",
      rationale: "Runtime use is allowed, but provider/source promotion is blocked by incomplete source authority."
    };
  }

  if (decision.truthDecision === "needs_evidence_before_promotion") {
    return {
      memoryActionType: "evidence_gap_record",
      writeClass: "plan_only_no_write",
      canonicalAction: "none",
      promotionAction: "none",
      memoryIntent: "Record cup winner/final state as evidence-gap/deferred until official final evidence and required independent confirmation exist.",
      repairTarget: "cup final/winner evidence",
      requiredEvidence: decision.needsEvidence || ["official_final_result_evidence", "independent_second_source_if_writer_requires"],
      blocker: "missing final/winner evidence in Truth/Memory source basis",
      nextSafeJobType: "cup_winner_final_evidence_gap_plan",
      rationale: "Promotion is blocked until evidence requirements are satisfied."
    };
  }

  if (decision.truthDecision === "accept_local_authority_memory_only") {
    return {
      memoryActionType: "runtime_authority_accept_record",
      writeClass: "plan_only_no_write",
      canonicalAction: "none",
      promotionAction: "none",
      memoryIntent: "Record local source authority as accepted for runtime coverage only.",
      repairTarget: "source map normalization if provider promotion is later required",
      requiredEvidence: [],
      blocker: "",
      nextSafeJobType: "memory_authority_accept_writer_plan_dry_run",
      rationale: "Coverage has explicit sources but this plan does not perform provider promotion."
    };
  }

  return {
    memoryActionType: "unsupported_decision_record",
    writeClass: "plan_only_no_write",
    canonicalAction: "none",
    promotionAction: "none",
    memoryIntent: `Record unsupported truth decision for policy expansion: ${decision.truthDecision}`,
    repairTarget: "review policy",
    requiredEvidence: ["supported_truth_decision_policy"],
    blocker: "unsupported truth decision",
    nextSafeJobType: "policy_expansion_required",
    rationale: "No write/action policy exists for this decision."
  };
}

function buildRepairPlan(decisionPlan) {
  const repairRows = (decisionPlan.decisions || []).map((decision) => {
    const action = classifyMemoryAction(decision);

    return {
      competitionSlug: decision.competitionSlug,
      providerId: decision.providerId,
      seasonState: decision.seasonState,
      reviewType: decision.reviewType,
      truthDecision: decision.truthDecision,
      decisionConfidence: decision.decisionConfidence,
      acceptedForRuntimeUse: decision.acceptedForRuntimeUse,
      approvedForPromotion: decision.approvedForPromotion,
      memoryActionType: action.memoryActionType,
      writeClass: action.writeClass,
      canonicalAction: action.canonicalAction,
      promotionAction: action.promotionAction,
      memoryIntent: action.memoryIntent,
      repairTarget: action.repairTarget,
      requiredEvidence: action.requiredEvidence,
      blocker: action.blocker,
      nextSafeJobType: action.nextSafeJobType,
      rationale: action.rationale,
      sourceDecisionReason: decision.decisionReason,
      sourceBasis: decision.sourceBasis,
      canonicalWrites: 0,
      productionWrite: false
    };
  });

  const byMemoryActionType = repairRows.reduce((acc, row) => {
    acc[row.memoryActionType] ||= [];
    acc[row.memoryActionType].push(row.competitionSlug);
    return acc;
  }, {});

  const noWriteRows = repairRows.filter((row) => {
    return row.writeClass === "plan_only_no_write" &&
      row.canonicalAction === "none" &&
      row.promotionAction === "none";
  });

  return {
    ok: true,
    job: "build-football-truth-memory-source-authority-repair-plan",
    generatedAt: new Date().toISOString(),
    inputSummary: decisionPlan.summary || {},
    summary: {
      inputDecisionCount: decisionPlan.summary?.reviewTaskCount || repairRows.length,
      repairRowCount: repairRows.length,
      memoryActionTypeCount: Object.keys(byMemoryActionType).length,
      planOnlyNoWriteCount: noWriteRows.length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    byMemoryActionType,
    repairRows,
    nextRecommendedAction: {
      type: "controlled_memory_writer_plan_dry_run",
      reason: "This plan is still read-only; next step should be a writer-plan dry-run for memory/source-authority records, not data acquisition.",
      competitions: repairRows.map((row) => row.competitionSlug)
    },
    policy: {
      purpose: "Convert Truth/Memory review decisions into explicit memory/source-authority repair plan rows.",
      inputContract: "Consumes review decision plan only.",
      noFetch: true,
      noSearch: true,
      noCanonicalWrites: true,
      noPromotionWrites: true,
      noEndpointChasing: true,
      noSingleLeagueDrift: true,
      noRuntimeDataMutation: true
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
  const decisionPlan = {
    summary: {
      reviewTaskCount: 3,
      canonicalWrites: 0,
      productionWrite: false
    },
    decisions: [
      {
        competitionSlug: "esp.1",
        providerId: "laliga_official",
        seasonState: "active",
        reviewType: "local_canonical_source_authority",
        truthDecision: "defer_source_authority_repair",
        decisionConfidence: 0.7,
        acceptedForRuntimeUse: true,
        approvedForPromotion: false,
        needsEvidence: ["source_authority_for_unknown_canonical_rows"],
        decisionReason: "unknown source rows",
        sourceBasis: { canonicalStandingsSourceCounts: { unknown: 20 } }
      },
      {
        competitionSlug: "sco.challenge",
        providerId: "spfl_challenge_cup_official",
        seasonState: "unknown_or_partial",
        reviewType: "cup_winner_final_truth_memory",
        truthDecision: "needs_evidence_before_promotion",
        decisionConfidence: 0.7,
        acceptedForRuntimeUse: false,
        approvedForPromotion: false,
        needsEvidence: ["official_final_result_evidence", "independent_second_source_if_writer_requires"],
        decisionReason: "cup evidence missing",
        sourceBasis: { missingData: ["cupWinnerFinalState"] }
      },
      {
        competitionSlug: "local.good",
        providerId: "provider_good",
        seasonState: "active",
        reviewType: "local_canonical_source_authority",
        truthDecision: "accept_local_authority_memory_only",
        decisionConfidence: 0.75,
        acceptedForRuntimeUse: true,
        approvedForPromotion: false,
        needsEvidence: [],
        decisionReason: "source known",
        sourceBasis: { canonicalFixtureSourceCounts: { official: 1 }, canonicalStandingsSourceCounts: { official: 1 } }
      }
    ]
  };

  const report = buildRepairPlan(decisionPlan);
  const bySlug = Object.fromEntries(report.repairRows.map((row) => [row.competitionSlug, row]));

  if (bySlug["esp.1"].memoryActionType !== "source_authority_gap_record") {
    throw new Error("esp.1 should be source_authority_gap_record");
  }
  if (bySlug["sco.challenge"].memoryActionType !== "evidence_gap_record") {
    throw new Error("sco.challenge should be evidence_gap_record");
  }
  if (bySlug["local.good"].memoryActionType !== "runtime_authority_accept_record") {
    throw new Error("local.good should be runtime_authority_accept_record");
  }
  if (report.summary.planOnlyNoWriteCount !== 3) {
    throw new Error(`expected 3 plan-only rows, got ${report.summary.planOnlyNoWriteCount}`);
  }
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) {
    throw new Error("read-only guarantees failed");
  }

  console.log(JSON.stringify({
    ok: true,
    selfTest: "passed",
    byMemoryActionType: report.byMemoryActionType,
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

  const decisionPlan = readJson(args.input);
  const report = buildRepairPlan(decisionPlan);

  writeJson(args.output, report);

  console.log(JSON.stringify({
    output: args.output,
    summary: report.summary,
    byMemoryActionType: report.byMemoryActionType,
    nextRecommendedAction: report.nextRecommendedAction,
    guarantees: report.guarantees
  }, null, 2));
}

main();
