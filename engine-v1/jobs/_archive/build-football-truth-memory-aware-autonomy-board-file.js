#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    selfTest: false,
    input: "",
    sourceAuthorityMemory: "",
    evidenceGapMemory: "",
    output: ""
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++i];
    else if (arg === "--source-authority-memory") args.sourceAuthorityMemory = argv[++i];
    else if (arg === "--evidence-gap-memory") args.evidenceGapMemory = argv[++i];
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

function indexRecords(memoryFile) {
  const map = new Map();

  for (const record of memoryFile.records || []) {
    if (!record.competitionSlug) continue;
    const rows = map.get(record.competitionSlug) || [];
    rows.push(record);
    map.set(record.competitionSlug, rows);
  }

  return map;
}

function memoryOverlayForRow(row, sourceAuthorityBySlug, evidenceGapBySlug) {
  const sourceAuthorityRecords = sourceAuthorityBySlug.get(row.competitionSlug) || [];
  const evidenceGapRecords = evidenceGapBySlug.get(row.competitionSlug) || [];

  const hasSourceAuthorityGap = sourceAuthorityRecords.some((record) => {
    return record.recordType === "source_authority_gap" &&
      record.authorityStatus === "runtime_usable_nonpromoted_source_gap";
  });

  const hasEvidenceGap = evidenceGapRecords.some((record) => {
    return record.recordType === "evidence_gap" &&
      record.authorityStatus === "promotion_blocked_missing_evidence";
  });

  if (hasSourceAuthorityGap) {
    return {
      memoryOverlayStatus: "source_authority_gap_recorded",
      memoryAwareActionBucket: "memory_recorded_no_review_repeat",
      memoryAwareAllowedNow: false,
      memoryAwareReason: "Source-authority gap is already recorded in memory; do not repeat Truth/Memory review or acquisition unless a repair batch is selected.",
      memoryRecords: sourceAuthorityRecords.map((record) => ({
        recordType: record.recordType,
        authorityStatus: record.authorityStatus,
        acceptedForRuntimeUse: record.acceptedForRuntimeUse,
        approvedForPromotion: record.approvedForPromotion,
        requiredEvidence: record.requiredEvidence,
        blocker: record.blocker
      }))
    };
  }

  if (hasEvidenceGap) {
    return {
      memoryOverlayStatus: "evidence_gap_recorded",
      memoryAwareActionBucket: "memory_recorded_blocked_until_evidence",
      memoryAwareAllowedNow: false,
      memoryAwareReason: "Evidence gap is already recorded in memory; do not repeat review or promote until explicit evidence task satisfies requirements.",
      memoryRecords: evidenceGapRecords.map((record) => ({
        recordType: record.recordType,
        authorityStatus: record.authorityStatus,
        acceptedForRuntimeUse: record.acceptedForRuntimeUse,
        approvedForPromotion: record.approvedForPromotion,
        requiredEvidence: record.requiredEvidence,
        blocker: record.blocker
      }))
    };
  }

  return {
    memoryOverlayStatus: "no_memory_overlay",
    memoryAwareActionBucket: row.actionBucket,
    memoryAwareAllowedNow: row.allowedNow,
    memoryAwareReason: "No matching memory overlay record.",
    memoryRecords: []
  };
}

function buildMemoryAwareBoard(autonomyBoard, sourceAuthorityMemory, evidenceGapMemory) {
  const sourceAuthorityBySlug = indexRecords(sourceAuthorityMemory);
  const evidenceGapBySlug = indexRecords(evidenceGapMemory);

  const rows = (autonomyBoard.rows || []).map((row) => {
    const overlay = memoryOverlayForRow(row, sourceAuthorityBySlug, evidenceGapBySlug);

    return {
      ...row,
      memoryOverlayStatus: overlay.memoryOverlayStatus,
      originalActionBucket: row.actionBucket,
      originalAllowedNow: row.allowedNow,
      memoryAwareActionBucket: overlay.memoryAwareActionBucket,
      memoryAwareAllowedNow: overlay.memoryAwareAllowedNow,
      memoryAwareReason: overlay.memoryAwareReason,
      memoryRecords: overlay.memoryRecords
    };
  });

  const byMemoryOverlayStatus = rows.reduce((acc, row) => {
    acc[row.memoryOverlayStatus] ||= [];
    acc[row.memoryOverlayStatus].push(row.competitionSlug);
    return acc;
  }, {});

  const byMemoryAwareActionBucket = rows.reduce((acc, row) => {
    acc[row.memoryAwareActionBucket] ||= [];
    acc[row.memoryAwareActionBucket].push(row.competitionSlug);
    return acc;
  }, {});

  const memorySuppressedReview = rows.filter((row) => {
    return row.memoryOverlayStatus !== "no_memory_overlay";
  }).map((row) => row.competitionSlug);

  return {
    ok: true,
    job: "build-football-truth-memory-aware-autonomy-board",
    generatedAt: new Date().toISOString(),
    inputSummary: autonomyBoard.summary || {},
    summary: {
      competitionCount: rows.length,
      memoryOverlayCompetitionCount: memorySuppressedReview.length,
      sourceAuthorityMemoryRecordCount: sourceAuthorityMemory.records?.length || 0,
      evidenceGapMemoryRecordCount: evidenceGapMemory.records?.length || 0,
      memoryAwareActionBucketCount: Object.keys(byMemoryAwareActionBucket).length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    byMemoryOverlayStatus,
    byMemoryAwareActionBucket,
    memorySuppressedReview,
    rows,
    policy: {
      purpose: "Apply committed Truth/Memory records to autonomy decisions so recorded gaps are not repeatedly re-reviewed.",
      inputContract: "Consumes autonomy board plus source-authority/evidence-gap memory files.",
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
  const autonomyBoard = {
    summary: { competitionCount: 4, canonicalWrites: 0, productionWrite: false },
    rows: [
      {
        competitionSlug: "esp.1",
        actionBucket: "local_canonical_source_authority_review",
        allowedNow: true
      },
      {
        competitionSlug: "esp.2",
        actionBucket: "local_canonical_source_authority_review",
        allowedNow: true
      },
      {
        competitionSlug: "sco.challenge",
        actionBucket: "cup_winner_final_state_needed",
        allowedNow: true
      },
      {
        competitionSlug: "nor.1",
        actionBucket: "no_action_covered",
        allowedNow: false
      }
    ]
  };

  const sourceAuthorityMemory = {
    records: [
      {
        recordType: "source_authority_gap",
        competitionSlug: "esp.1",
        providerId: "laliga_official",
        authorityStatus: "runtime_usable_nonpromoted_source_gap",
        acceptedForRuntimeUse: true,
        approvedForPromotion: false
      },
      {
        recordType: "source_authority_gap",
        competitionSlug: "esp.2",
        providerId: "laliga_official",
        authorityStatus: "runtime_usable_nonpromoted_source_gap",
        acceptedForRuntimeUse: true,
        approvedForPromotion: false
      }
    ]
  };

  const evidenceGapMemory = {
    records: [
      {
        recordType: "evidence_gap",
        competitionSlug: "sco.challenge",
        providerId: "spfl_challenge_cup_official",
        authorityStatus: "promotion_blocked_missing_evidence",
        acceptedForRuntimeUse: false,
        approvedForPromotion: false
      }
    ]
  };

  const report = buildMemoryAwareBoard(autonomyBoard, sourceAuthorityMemory, evidenceGapMemory);
  const bySlug = Object.fromEntries(report.rows.map((row) => [row.competitionSlug, row]));

  if (bySlug["esp.1"].memoryAwareActionBucket !== "memory_recorded_no_review_repeat") {
    throw new Error("esp.1 memory overlay failed");
  }
  if (bySlug["esp.2"].memoryAwareActionBucket !== "memory_recorded_no_review_repeat") {
    throw new Error("esp.2 memory overlay failed");
  }
  if (bySlug["sco.challenge"].memoryAwareActionBucket !== "memory_recorded_blocked_until_evidence") {
    throw new Error("sco.challenge memory overlay failed");
  }
  if (bySlug["nor.1"].memoryAwareActionBucket !== "no_action_covered") {
    throw new Error("nor.1 should remain unchanged");
  }
  if (report.summary.memoryOverlayCompetitionCount !== 3) {
    throw new Error(`expected 3 memory overlays, got ${report.summary.memoryOverlayCompetitionCount}`);
  }
  if (report.guarantees.actualWrites !== 0 || report.guarantees.canonicalWrites !== 0) {
    throw new Error("read-only guarantees failed");
  }

  console.log(JSON.stringify({
    ok: true,
    selfTest: "passed",
    summary: report.summary,
    byMemoryOverlayStatus: report.byMemoryOverlayStatus,
    byMemoryAwareActionBucket: report.byMemoryAwareActionBucket,
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
  if (!args.sourceAuthorityMemory) throw new Error("Missing required --source-authority-memory");
  if (!args.evidenceGapMemory) throw new Error("Missing required --evidence-gap-memory");
  if (!args.output) throw new Error("Missing required --output");

  const autonomyBoard = readJson(args.input);
  const sourceAuthorityMemory = readJson(args.sourceAuthorityMemory);
  const evidenceGapMemory = readJson(args.evidenceGapMemory);

  const report = buildMemoryAwareBoard(autonomyBoard, sourceAuthorityMemory, evidenceGapMemory);

  writeJson(args.output, report);

  console.log(JSON.stringify({
    output: args.output,
    summary: report.summary,
    byMemoryOverlayStatus: report.byMemoryOverlayStatus,
    byMemoryAwareActionBucket: report.byMemoryAwareActionBucket,
    memorySuppressedReview: report.memorySuppressedReview,
    guarantees: report.guarantees
  }, null, 2));
}

main();
