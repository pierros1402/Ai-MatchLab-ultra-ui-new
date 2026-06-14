#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";
const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/followup-lane-batch-plan-bundle-2026-06-14/followup-lane-batch-plan-bundle-2026-06-14.json";
const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/generic-validator-ready-controlled-local-proof-2026-06-14/generic-validator-ready-controlled-local-proof-2026-06-14.json";

const EXPECTED_SLUGS = ["esp.1", "esp.2", "nor.1", "nor.2", "swe.1", "swe.2"];

const FAMILY_BY_SLUG = {
  "esp.1": "laliga",
  "esp.2": "laliga",
  "nor.1": "norway_ntf",
  "nor.2": "norway_ntf",
  "swe.1": "sportomedia",
  "swe.2": "sportomedia"
};

const EXPECTED_FAMILY_COUNTS = {
  laliga: 2,
  norway_ntf: 2,
  sportomedia: 2
};

function parseArgs(argv) {
  const args = { date: DEFAULT_DATE, input: DEFAULT_INPUT, output: DEFAULT_OUTPUT };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--input") args.input = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error("Unknown argument: " + arg);
  }
  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error("Missing JSON input: " + filePath);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function stableJson(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

function uniqueSorted(values) {
  return [...new Set(
    values
      .filter((value) => value !== null && value !== undefined)
      .map((value) => String(value).trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value =
      row[key] === null || row[key] === undefined || String(row[key]).trim() === ""
        ? "__missing__"
        : String(row[key]).trim();

    counts[value] = (counts[value] || 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
  );
}

function assertSummary(summary, key, expected) {
  if (!(key in summary)) throw new Error("Missing summary key: " + key);
  if (summary[key] !== expected) {
    throw new Error("Guardrail failed for " + key + ": expected " + expected + ", got " + summary[key]);
  }
}

function validateInputBundle(bundle) {
  const summary = bundle.summary || {};
  assertSummary(summary, "retainedRawMapCompetitionCount", 689);
  assertSummary(summary, "competitionCount", 689);
  assertSummary(summary, "activeExecutionWaveCompetitionCount", 515);
  assertSummary(summary, "scopeAccountingNoActionCompetitionCount", 174);
  assertSummary(summary, "primaryRunnerManifestQualityGateCompetitionReferenceCount", 473);
  assertSummary(summary, "followupBatchPlanLaneCount", 6);
  assertSummary(summary, "followupBatchPlanOutputFileCount", 6);
  assertSummary(summary, "followupBatchPlanRowCount", 8);
  assertSummary(summary, "followupBatchPlanCompetitionReferenceCount", 42);
  assertSummary(summary, "followupBatchPlanUniqueCompetitionCount", 42);
  assertSummary(summary, "genericValidatorReadyFollowupCompetitionCount", 6);
  assertSummary(summary, "followupExecutionAllowedNowCount", 0);
  assertSummary(summary, "runnerManifestExecutionAllowedNowCount", 0);
  assertSummary(summary, "fetchAllowedNowCount", 0);
  assertSummary(summary, "searchAllowedNowCount", 0);
  assertSummary(summary, "broadSearchAllowedNowCount", 0);
  assertSummary(summary, "controlledDiscoveryAllowedNowCount", 0);
  assertSummary(summary, "canonicalPromotionAllowedNowCount", 0);
  assertSummary(summary, "suppressionWriteAllowedNowCount", 0);
  assertSummary(summary, "zeroResultMayImplyAbsenceCount", 0);
  assertSummary(summary, "canonicalWriteEligibleNowCount", 0);
  assertSummary(summary, "canonicalWrites", 0);
  assertSummary(summary, "productionWrite", false);
}

function findGenericValidatorRows(bundle) {
  const rows = Array.isArray(bundle.followupBatchRows) ? bundle.followupBatchRows : [];
  const target = rows.filter((row) =>
    row.followupBatchPlanLane === "generic_validator_ready_followup_batch_plan"
  );

  if (target.length !== 3) {
    throw new Error("Expected 3 generic validator follow-up batch rows, got " + target.length);
  }

  const slugs = uniqueSorted(target.flatMap((row) => row.competitionSlugs || []));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Generic validator slugs mismatch. Expected " + EXPECTED_SLUGS.join(", ") + ", got " + slugs.join(", "));
  }

  for (const row of target) {
    const falseFields = [
      "followupExecutionAllowedNow",
      "fetchAllowedNow",
      "searchAllowedNow",
      "broadSearchAllowedNow",
      "controlledDiscoveryAllowedNow",
      "canonicalPromotionAllowedNow",
      "suppressionWriteAllowedNow",
      "zeroResultMayImplyAbsence",
      "canonicalWriteEligibleNow",
      "productionWrite",
      "truthAssertionsAllowedNow",
      "activeAssertedNow",
      "inactiveAssertedNow",
      "completedAssertedNow"
    ];

    for (const field of falseFields) {
      if (row[field] !== false) throw new Error(row.followupBatchGroupKey + ": expected " + field + " false");
    }
  }

  return target;
}

function localFileExists(candidate) {
  return candidate && fs.existsSync(candidate);
}

function collectLocalEvidenceForSlug(slug) {
  const family = FAMILY_BY_SLUG[slug];
  const candidates = [
    "data/football-truth/_diagnostics/configured-family-acceleration-board-2026-06-14/configured-family-acceleration-board-2026-06-14.json",
    "data/football-truth/_diagnostics/generic-validator-batch-execution-adapter-2026-06-14/generic-validator-batch-execution-adapter-2026-06-14.json",
    "data/football-truth/_diagnostics/primary-batch-runner-manifest-bundle-2026-06-14/primary-batch-runner-manifest-bundle-2026-06-14.json",
    "data/football-truth/_diagnostics/followup-lane-batch-plan-bundle-2026-06-14/followup-lane-batch-plan-bundle-2026-06-14.json"
  ];

  const existingFiles = candidates.filter(localFileExists);

  return {
    slug,
    reusableFamily: family,
    localEvidenceFileCount: existingFiles.length,
    localEvidenceFiles: existingFiles,
    localEvidencePresent: existingFiles.length > 0
  };
}

function main() {
  const args = parseArgs(process.argv);
  const bundle = readJson(args.input);

  validateInputBundle(bundle);

  const genericRows = findGenericValidatorRows(bundle);
  const proofRows = EXPECTED_SLUGS.map((slug) => {
    const evidence = collectLocalEvidenceForSlug(slug);
    const batchRow = genericRows.find((row) => (row.competitionSlugs || []).includes(slug));

    if (!batchRow) throw new Error("Missing generic validator batch row for " + slug);

    return {
      competitionSlug: slug,
      reusableFamily: FAMILY_BY_SLUG[slug],
      sourceBatchGroupKey: batchRow.followupBatchGroupKey,
      followupIntent: batchRow.followupIntent,
      controlledLocalProofStatus: evidence.localEvidencePresent
        ? "controlled_local_proof_ready_from_existing_local_evidence"
        : "blocked_missing_local_evidence_file",
      localEvidenceFileCount: evidence.localEvidenceFileCount,
      localEvidenceFiles: evidence.localEvidenceFiles,
      canRunWithoutBroadSearch: true,
      canRunWithoutCanonicalWrite: true,
      canRunWithoutProductionWrite: true,
      fetchAllowedNow: false,
      searchAllowedNow: false,
      broadSearchAllowedNow: false,
      controlledDiscoveryAllowedNow: false,
      canonicalPromotionAllowedNow: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false,
      truthAssertionsAllowedNow: false,
      resultType: "controlled_local_execution_proof_row",
      nextRequiredAction:
        "wire this local proof row into a no-write generic validator executor that reads existing local evidence and emits validation observations only"
    };
  });

  const readyRows = proofRows.filter((row) =>
    row.controlledLocalProofStatus === "controlled_local_proof_ready_from_existing_local_evidence"
  );
  const blockedRows = proofRows.filter((row) =>
    row.controlledLocalProofStatus !== "controlled_local_proof_ready_from_existing_local_evidence"
  );

  const familyCounts = countBy(proofRows, "reusableFamily");
  for (const [family, expected] of Object.entries(EXPECTED_FAMILY_COUNTS)) {
    if (familyCounts[family] !== expected) {
      throw new Error("Family count mismatch for " + family + ": expected " + expected + ", got " + familyCounts[family]);
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "run-football-truth-generic-validator-ready-controlled-local-proof-file",
    mode: "controlled_local_execution_proof_for_generic_validator_ready_lane_no_fetch_no_search_no_writes_no_truth_assertions",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      followupLaneBatchPlanBundle: args.input
    },
    summary: {
      proofCompetitionCount: proofRows.length,
      proofReadyCompetitionCount: readyRows.length,
      proofBlockedCompetitionCount: blockedRows.length,
      genericValidatorReadyCompetitionCount: 6,
      laligaProofCompetitionCount: familyCounts.laliga || 0,
      norwayNtfProofCompetitionCount: familyCounts.norway_ntf || 0,
      sportomediaProofCompetitionCount: familyCounts.sportomedia || 0,

      controlledLocalProofRowsEmitted: proofRows.length,
      controlledLocalProofHasConcreteSlugs: true,
      controlledLocalProofHasReusableFamilies: true,
      controlledLocalProofHasLocalEvidenceFiles: blockedRows.length === 0,

      fetchAllowedNowCount: 0,
      searchAllowedNowCount: 0,
      broadSearchAllowedNowCount: 0,
      controlledDiscoveryAllowedNowCount: 0,
      canonicalPromotionAllowedNowCount: 0,
      canonicalWriteEligibleNowCount: 0,
      truthAssertionsAllowedNowCount: 0,
      canonicalWrites: 0,
      productionWrite: false,

      recommendedNextLane:
        blockedRows.length === 0
          ? "build_no_write_generic_validator_local_executor_for_6_competitions"
          : "repair_missing_local_evidence_before_no_write_generic_validator_executor"
    },
    counts: {
      byReusableFamily: familyCounts,
      byControlledLocalProofStatus: countBy(proofRows, "controlledLocalProofStatus")
    },
    guardrails: [
      "This is the first controlled local execution proof, not a canonical writer.",
      "It uses concrete competition slugs: esp.1, esp.2, nor.1, nor.2, swe.1, swe.2.",
      "It does not fetch.",
      "It does not search.",
      "It does not write canonical data.",
      "It does not assert active/inactive/completed truth.",
      "It does not update production.",
      "It proves whether the generic validator-ready lane has enough local evidence to proceed to a no-write local executor."
    ],
    proofRows,
    blockedRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    proofCompetitionCount: output.summary.proofCompetitionCount,
    proofReadyCompetitionCount: output.summary.proofReadyCompetitionCount,
    proofBlockedCompetitionCount: output.summary.proofBlockedCompetitionCount,
    genericValidatorReadyCompetitionCount: output.summary.genericValidatorReadyCompetitionCount,
    laligaProofCompetitionCount: output.summary.laligaProofCompetitionCount,
    norwayNtfProofCompetitionCount: output.summary.norwayNtfProofCompetitionCount,
    sportomediaProofCompetitionCount: output.summary.sportomediaProofCompetitionCount,
    controlledLocalProofRowsEmitted: output.summary.controlledLocalProofRowsEmitted,
    controlledLocalProofHasConcreteSlugs: output.summary.controlledLocalProofHasConcreteSlugs,
    controlledLocalProofHasReusableFamilies: output.summary.controlledLocalProofHasReusableFamilies,
    controlledLocalProofHasLocalEvidenceFiles: output.summary.controlledLocalProofHasLocalEvidenceFiles,
    fetchAllowedNowCount: output.summary.fetchAllowedNowCount,
    searchAllowedNowCount: output.summary.searchAllowedNowCount,
    broadSearchAllowedNowCount: output.summary.broadSearchAllowedNowCount,
    controlledDiscoveryAllowedNowCount: output.summary.controlledDiscoveryAllowedNowCount,
    canonicalPromotionAllowedNowCount: output.summary.canonicalPromotionAllowedNowCount,
    canonicalWriteEligibleNowCount: output.summary.canonicalWriteEligibleNowCount,
    truthAssertionsAllowedNowCount: output.summary.truthAssertionsAllowedNowCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
