#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";
const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/generic-validator-no-write-local-executor-2026-06-14/generic-validator-no-write-local-executor-2026-06-14.json";
const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/generic-validator-no-write-local-executor-quality-gate-2026-06-14/generic-validator-no-write-local-executor-quality-gate-2026-06-14.json";

const EXPECTED_SLUGS = ["esp.1", "esp.2", "nor.1", "nor.2", "swe.1", "swe.2"];

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

function validateExecutorOutput(json) {
  const summary = json.summary || {};

  assertSummary(summary, "localExecutorCompetitionCount", 6);
  assertSummary(summary, "localExecutorReadyObservationCount", 6);
  assertSummary(summary, "localExecutorWeakObservationCount", 0);
  assertSummary(summary, "localExecutorBlockedObservationCount", 0);
  assertSummary(summary, "laligaObservationCount", 2);
  assertSummary(summary, "norwayNtfObservationCount", 2);
  assertSummary(summary, "sportomediaObservationCount", 2);
  assertSummary(summary, "localEvidenceFileReferenceCount", 24);
  assertSummary(summary, "localEvidenceFilesWithMatchesCount", 18);
  assertSummary(summary, "localEvidenceMatchedObjectCount", 38);
  assertSummary(summary, "concreteObservationRowsEmitted", 6);
  assertSummary(summary, "fetchAllowedNowCount", 0);
  assertSummary(summary, "searchAllowedNowCount", 0);
  assertSummary(summary, "broadSearchAllowedNowCount", 0);
  assertSummary(summary, "controlledDiscoveryAllowedNowCount", 0);
  assertSummary(summary, "canonicalPromotionAllowedNowCount", 0);
  assertSummary(summary, "canonicalWriteEligibleNowCount", 0);
  assertSummary(summary, "truthAssertionsAllowedNowCount", 0);
  assertSummary(summary, "activeAssertedCount", 0);
  assertSummary(summary, "inactiveAssertedCount", 0);
  assertSummary(summary, "completedAssertedCount", 0);
  assertSummary(summary, "canonicalWrites", 0);
  assertSummary(summary, "productionWrite", false);

  const rows = Array.isArray(json.observationRows) ? json.observationRows : [];
  if (rows.length !== 6) throw new Error("Expected 6 observationRows, got " + rows.length);

  const slugs = uniqueSorted(rows.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Observation slugs mismatch. Got " + slugs.join(", "));
  }

  return rows;
}

function scoreObservation(row) {
  const signals = row.signals || {};
  const status = row.observationStatus;

  let score = 0;
  const reasons = [];

  if (status === "local_validation_observation_ready_no_write") {
    score += 3;
    reasons.push("ready_observation_status");
  }

  if ((row.filesWithSlugMatchesCount || 0) >= 3) {
    score += 2;
    reasons.push("slug_matches_in_at_least_3_local_files");
  }

  if ((row.totalMatchedObjectCount || 0) >= 4) {
    score += 2;
    reasons.push("at_least_4_matched_objects");
  }

  if (signals.mentionsReusableFamily === true) {
    score += 1;
    reasons.push("mentions_reusable_family");
  }

  if (signals.mentionsValidator === true) {
    score += 1;
    reasons.push("mentions_validator");
  }

  if (signals.mentionsContract === true) {
    score += 1;
    reasons.push("mentions_contract");
  }

  if (signals.mentionsReady === true) {
    score += 1;
    reasons.push("mentions_ready");
  }

  const blockingReasons = [];

  if (row.fetchAllowedNow !== false) blockingReasons.push("fetch_flag_not_false");
  if (row.searchAllowedNow !== false) blockingReasons.push("search_flag_not_false");
  if (row.canonicalWriteEligibleNow !== false) blockingReasons.push("canonical_write_eligible_not_false");
  if (row.canonicalWrites !== 0) blockingReasons.push("canonical_writes_not_zero");
  if (row.productionWrite !== false) blockingReasons.push("production_write_not_false");
  if (row.truthAssertionsAllowedNow !== false) blockingReasons.push("truth_assertions_not_false");
  if ((row.filesWithSlugMatchesCount || 0) < 1) blockingReasons.push("no_local_file_slug_match");
  if ((row.totalMatchedObjectCount || 0) < 1) blockingReasons.push("no_matched_objects");

  let qualityGateStatus = "passed_ready_for_controlled_dry_run_validator_no_write";
  if (blockingReasons.length > 0) qualityGateStatus = "blocked_quality_gate";
  else if (score < 8) qualityGateStatus = "passed_with_weak_observation_strength_review_required";

  return {
    competitionSlug: row.competitionSlug,
    reusableFamily: row.reusableFamily,
    observationStatus: row.observationStatus,
    qualityGateStatus,
    observationStrengthScore: score,
    observationStrengthReasons: reasons,
    blockingReasons,
    existingLocalEvidenceFileCount: row.existingLocalEvidenceFileCount,
    filesWithSlugMatchesCount: row.filesWithSlugMatchesCount,
    totalMatchedObjectCount: row.totalMatchedObjectCount,
    signalMentionsReusableFamily: signals.mentionsReusableFamily === true,
    signalMentionsValidator: signals.mentionsValidator === true,
    signalMentionsContract: signals.mentionsContract === true,
    signalMentionsReady: signals.mentionsReady === true,
    sampleMatchedEvidence: (row.fileObservations || [])
      .filter((file) => (file.matchedObjectCount || 0) > 0)
      .slice(0, 3)
      .map((file) => ({
        filePath: file.filePath,
        matchedObjectCount: file.matchedObjectCount,
        sample: (file.matchedObjects || []).slice(0, 2)
      })),
    fetchAllowedNow: false,
    searchAllowedNow: false,
    broadSearchAllowedNow: false,
    controlledDiscoveryAllowedNow: false,
    canonicalPromotionAllowedNow: false,
    canonicalWriteEligibleNow: false,
    truthAssertionsAllowedNow: false,
    activeAssertedNow: false,
    inactiveAssertedNow: false,
    completedAssertedNow: false,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function main() {
  const args = parseArgs(process.argv);
  const executor = readJson(args.input);
  const observations = validateExecutorOutput(executor);

  const gateRows = observations.map(scoreObservation);
  const passedRows = gateRows.filter((row) => row.qualityGateStatus.startsWith("passed_"));
  const strongRows = gateRows.filter((row) => row.qualityGateStatus === "passed_ready_for_controlled_dry_run_validator_no_write");
  const weakRows = gateRows.filter((row) => row.qualityGateStatus === "passed_with_weak_observation_strength_review_required");
  const blockedRows = gateRows.filter((row) => row.qualityGateStatus === "blocked_quality_gate");

  if (passedRows.length !== 6) {
    throw new Error("Expected all 6 rows to pass no-write quality gate, got " + passedRows.length);
  }

  if (blockedRows.length !== 0) {
    throw new Error("Expected 0 blocked rows, got " + blockedRows.length);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "run-football-truth-generic-validator-no-write-local-executor-quality-gate-file",
    mode: "quality_gate_and_observation_strength_review_for_no_write_generic_validator_local_executor",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      genericValidatorNoWriteLocalExecutor: args.input
    },
    summary: {
      qualityGateCompetitionCount: gateRows.length,
      qualityGatePassedCompetitionCount: passedRows.length,
      qualityGateStrongCompetitionCount: strongRows.length,
      qualityGateWeakCompetitionCount: weakRows.length,
      qualityGateBlockedCompetitionCount: blockedRows.length,

      laligaQualityGateCompetitionCount: gateRows.filter((row) => row.reusableFamily === "laliga").length,
      norwayNtfQualityGateCompetitionCount: gateRows.filter((row) => row.reusableFamily === "norway_ntf").length,
      sportomediaQualityGateCompetitionCount: gateRows.filter((row) => row.reusableFamily === "sportomedia").length,

      localEvidenceFileReferenceCount: gateRows.reduce((sum, row) => sum + row.existingLocalEvidenceFileCount, 0),
      localEvidenceFilesWithMatchesCount: gateRows.reduce((sum, row) => sum + row.filesWithSlugMatchesCount, 0),
      localEvidenceMatchedObjectCount: gateRows.reduce((sum, row) => sum + row.totalMatchedObjectCount, 0),
      minimumObservationStrengthScore: Math.min(...gateRows.map((row) => row.observationStrengthScore)),
      maximumObservationStrengthScore: Math.max(...gateRows.map((row) => row.observationStrengthScore)),

      fetchAllowedNowCount: 0,
      searchAllowedNowCount: 0,
      broadSearchAllowedNowCount: 0,
      controlledDiscoveryAllowedNowCount: 0,
      canonicalPromotionAllowedNowCount: 0,
      canonicalWriteEligibleNowCount: 0,
      truthAssertionsAllowedNowCount: 0,
      activeAssertedCount: 0,
      inactiveAssertedCount: 0,
      completedAssertedCount: 0,
      canonicalWrites: 0,
      productionWrite: false,

      recommendedNextLane:
        weakRows.length === 0
          ? "build_controlled_dry_run_generic_validator_for_6_competitions_no_write"
          : "review_weak_observation_rows_before_controlled_dry_run_validator"
    },
    counts: {
      byReusableFamily: countBy(gateRows, "reusableFamily"),
      byQualityGateStatus: countBy(gateRows, "qualityGateStatus"),
      byObservationStatus: countBy(gateRows, "observationStatus")
    },
    guardrails: [
      "This quality gate reviews no-write local executor observations only.",
      "It does not fetch.",
      "It does not search.",
      "It does not write canonical data.",
      "It does not assert active/inactive/completed truth.",
      "It does not update production.",
      "It decides whether controlled dry-run validation can be prepared."
    ],
    qualityGateRows: gateRows,
    weakRows,
    blockedRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    qualityGateCompetitionCount: output.summary.qualityGateCompetitionCount,
    qualityGatePassedCompetitionCount: output.summary.qualityGatePassedCompetitionCount,
    qualityGateStrongCompetitionCount: output.summary.qualityGateStrongCompetitionCount,
    qualityGateWeakCompetitionCount: output.summary.qualityGateWeakCompetitionCount,
    qualityGateBlockedCompetitionCount: output.summary.qualityGateBlockedCompetitionCount,
    laligaQualityGateCompetitionCount: output.summary.laligaQualityGateCompetitionCount,
    norwayNtfQualityGateCompetitionCount: output.summary.norwayNtfQualityGateCompetitionCount,
    sportomediaQualityGateCompetitionCount: output.summary.sportomediaQualityGateCompetitionCount,
    localEvidenceFileReferenceCount: output.summary.localEvidenceFileReferenceCount,
    localEvidenceFilesWithMatchesCount: output.summary.localEvidenceFilesWithMatchesCount,
    localEvidenceMatchedObjectCount: output.summary.localEvidenceMatchedObjectCount,
    minimumObservationStrengthScore: output.summary.minimumObservationStrengthScore,
    maximumObservationStrengthScore: output.summary.maximumObservationStrengthScore,
    fetchAllowedNowCount: output.summary.fetchAllowedNowCount,
    searchAllowedNowCount: output.summary.searchAllowedNowCount,
    broadSearchAllowedNowCount: output.summary.broadSearchAllowedNowCount,
    controlledDiscoveryAllowedNowCount: output.summary.controlledDiscoveryAllowedNowCount,
    canonicalPromotionAllowedNowCount: output.summary.canonicalPromotionAllowedNowCount,
    canonicalWriteEligibleNowCount: output.summary.canonicalWriteEligibleNowCount,
    truthAssertionsAllowedNowCount: output.summary.truthAssertionsAllowedNowCount,
    activeAssertedCount: output.summary.activeAssertedCount,
    inactiveAssertedCount: output.summary.inactiveAssertedCount,
    completedAssertedCount: output.summary.completedAssertedCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
