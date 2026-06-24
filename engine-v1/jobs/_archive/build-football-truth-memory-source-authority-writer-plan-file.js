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

function makeRecord(row) {
  if (row.memoryActionType === "source_authority_gap_record") {
    return {
      recordType: "source_authority_gap",
      competitionSlug: row.competitionSlug,
      providerId: row.providerId,
      acceptedForRuntimeUse: row.acceptedForRuntimeUse,
      approvedForPromotion: false,
      authorityStatus: "runtime_usable_nonpromoted_source_gap",
      repairTarget: row.repairTarget,
      requiredEvidence: row.requiredEvidence || [],
      blocker: row.blocker,
      reason: row.rationale,
      sourceDecisionReason: row.sourceDecisionReason,
      sourceBasis: row.sourceBasis || {}
    };
  }

  if (row.memoryActionType === "evidence_gap_record") {
    return {
      recordType: "evidence_gap",
      competitionSlug: row.competitionSlug,
      providerId: row.providerId,
      acceptedForRuntimeUse: false,
      approvedForPromotion: false,
      authorityStatus: "promotion_blocked_missing_evidence",
      repairTarget: row.repairTarget,
      requiredEvidence: row.requiredEvidence || [],
      blocker: row.blocker,
      reason: row.rationale,
      sourceDecisionReason: row.sourceDecisionReason,
      sourceBasis: row.sourceBasis || {}
    };
  }

  if (row.memoryActionType === "runtime_authority_accept_record") {
    return {
      recordType: "runtime_authority_accept",
      competitionSlug: row.competitionSlug,
      providerId: row.providerId,
      acceptedForRuntimeUse: true,
      approvedForPromotion: false,
      authorityStatus: "runtime_authority_accepted_memory_only",
      repairTarget: row.repairTarget,
      requiredEvidence: row.requiredEvidence || [],
      blocker: row.blocker,
      reason: row.rationale,
      sourceDecisionReason: row.sourceDecisionReason,
      sourceBasis: row.sourceBasis || {}
    };
  }

  return {
    recordType: "unsupported_memory_action",
    competitionSlug: row.competitionSlug,
    providerId: row.providerId,
    acceptedForRuntimeUse: false,
    approvedForPromotion: false,
    authorityStatus: "unsupported_memory_action",
    repairTarget: row.repairTarget || "policy",
    requiredEvidence: row.requiredEvidence || ["supported_memory_action_policy"],
    blocker: row.blocker || "unsupported memory action",
    reason: row.rationale || `Unsupported memoryActionType: ${row.memoryActionType}`,
    sourceDecisionReason: row.sourceDecisionReason || "",
    sourceBasis: row.sourceBasis || {}
  };
}

function targetPathForRecord(record) {
  if (record.recordType === "source_authority_gap" || record.recordType === "runtime_authority_accept") {
    return "data/football-truth/source-authority-memory.json";
  }

  if (record.recordType === "evidence_gap") {
    return "data/football-truth/evidence-gap-memory.json";
  }

  return "data/football-truth/policy-review-memory.json";
}

function buildWriterPlan(repairPlan) {
  const wouldWriteRows = (repairPlan.repairRows || []).map((row) => {
    const record = makeRecord(row);
    const targetPath = targetPathForRecord(record);

    return {
      competitionSlug: row.competitionSlug,
      providerId: row.providerId,
      memoryActionType: row.memoryActionType,
      recordType: record.recordType,
      targetPath,
      operation: "upsert_memory_record",
      dryRun: true,
      wouldWrite: true,
      record,
      canonicalWrites: 0,
      productionWrite: false
    };
  });

  const byTargetPath = wouldWriteRows.reduce((acc, row) => {
    acc[row.targetPath] ||= [];
    acc[row.targetPath].push(row.competitionSlug);
    return acc;
  }, {});

  const byRecordType = wouldWriteRows.reduce((acc, row) => {
    acc[row.recordType] ||= [];
    acc[row.recordType].push(row.competitionSlug);
    return acc;
  }, {});

  return {
    ok: true,
    job: "build-football-truth-memory-source-authority-writer-plan",
    generatedAt: new Date().toISOString(),
    inputSummary: repairPlan.summary || {},
    summary: {
      inputRepairRowCount: repairPlan.summary?.repairRowCount || wouldWriteRows.length,
      wouldWriteRowCount: wouldWriteRows.length,
      targetPathCount: Object.keys(byTargetPath).length,
      recordTypeCount: Object.keys(byRecordType).length,
      actualWrites: 0,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    byTargetPath,
    byRecordType,
    wouldWriteRows,
    policy: {
      purpose: "Build dry-run writer plan for memory/source-authority records.",
      noFetch: true,
      noSearch: true,
      noActualWrites: true,
      noCanonicalWrites: true,
      noPromotionWrites: true,
      noEndpointChasing: true,
      noSingleLeagueDrift: true,
      generatedDiagnosticsOnly: true
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
  const repairPlan = {
    summary: {
      repairRowCount: 3,
      canonicalWrites: 0,
      productionWrite: false
    },
    repairRows: [
      {
        competitionSlug: "esp.1",
        providerId: "laliga_official",
        memoryActionType: "source_authority_gap_record",
        acceptedForRuntimeUse: true,
        approvedForPromotion: false,
        repairTarget: "canonical source basis / provider source map",
        requiredEvidence: ["source_authority_for_unknown_canonical_rows"],
        blocker: "unknown canonical source rows",
        rationale: "Runtime use is allowed, provider promotion blocked.",
        sourceDecisionReason: "unknown source rows",
        sourceBasis: { canonicalStandingsSourceCounts: { unknown: 20 } }
      },
      {
        competitionSlug: "sco.challenge",
        providerId: "spfl_challenge_cup_official",
        memoryActionType: "evidence_gap_record",
        acceptedForRuntimeUse: false,
        approvedForPromotion: false,
        repairTarget: "cup final/winner evidence",
        requiredEvidence: ["official_final_result_evidence", "independent_second_source_if_writer_requires"],
        blocker: "missing final/winner evidence",
        rationale: "Promotion is blocked.",
        sourceDecisionReason: "missing cup evidence",
        sourceBasis: { missingData: ["cupWinnerFinalState"] }
      },
      {
        competitionSlug: "local.good",
        providerId: "provider_good",
        memoryActionType: "runtime_authority_accept_record",
        acceptedForRuntimeUse: true,
        approvedForPromotion: false,
        repairTarget: "source map normalization",
        requiredEvidence: [],
        blocker: "",
        rationale: "Runtime authority accepted memory-only.",
        sourceDecisionReason: "source known",
        sourceBasis: {}
      }
    ]
  };

  const report = buildWriterPlan(repairPlan);

  if (report.summary.wouldWriteRowCount !== 3) {
    throw new Error(`expected 3 would-write rows, got ${report.summary.wouldWriteRowCount}`);
  }
  if (report.summary.actualWrites !== 0 || report.summary.canonicalWrites !== 0 || report.summary.productionWrite !== false) {
    throw new Error("writer plan must not perform writes");
  }

  const bySlug = Object.fromEntries(report.wouldWriteRows.map((row) => [row.competitionSlug, row]));

  if (bySlug["esp.1"].recordType !== "source_authority_gap") {
    throw new Error("esp.1 should become source_authority_gap");
  }
  if (bySlug["sco.challenge"].recordType !== "evidence_gap") {
    throw new Error("sco.challenge should become evidence_gap");
  }
  if (bySlug["local.good"].recordType !== "runtime_authority_accept") {
    throw new Error("local.good should become runtime_authority_accept");
  }
  if (bySlug["esp.1"].targetPath !== "data/football-truth/source-authority-memory.json") {
    throw new Error("esp.1 target path mismatch");
  }
  if (bySlug["sco.challenge"].targetPath !== "data/football-truth/evidence-gap-memory.json") {
    throw new Error("sco.challenge target path mismatch");
  }

  console.log(JSON.stringify({
    ok: true,
    selfTest: "passed",
    summary: report.summary,
    byTargetPath: report.byTargetPath,
    byRecordType: report.byRecordType,
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

  const repairPlan = readJson(args.input);
  const report = buildWriterPlan(repairPlan);

  writeJson(args.output, report);

  console.log(JSON.stringify({
    output: args.output,
    summary: report.summary,
    byTargetPath: report.byTargetPath,
    byRecordType: report.byRecordType,
    guarantees: report.guarantees
  }, null, 2));
}

main();
