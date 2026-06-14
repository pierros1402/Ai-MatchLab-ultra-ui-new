#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";
const DEFAULT_GAP =
  "data/football-truth/_diagnostics/generic-validator-season-state-evidence-gap-plan-2026-06-14/generic-validator-season-state-evidence-gap-plan-2026-06-14.json";
const DEFAULT_EXECUTOR =
  "data/football-truth/_diagnostics/generic-validator-no-write-local-executor-2026-06-14/generic-validator-no-write-local-executor-2026-06-14.json";
const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/configured-family-season-state-source-evidence-probe-plan-2026-06-14/configured-family-season-state-source-evidence-probe-plan-2026-06-14.json";

const EXPECTED_SLUGS = ["esp.1", "esp.2", "nor.1", "nor.2", "swe.1", "swe.2"];

const FAMILY_PROBES = {
  laliga: {
    probeFamily: "laliga",
    probeMode: "no_write_official_route_season_state_probe",
    requiredProbeSections: [
      "official competition season/calendar page",
      "standings/table season marker",
      "latest result or next fixture window",
      "next-season restart/start date if completed or inactive"
    ],
    allowedEvidenceSources: [
      "existing local diagnostics",
      "configured official route only after explicit controlled approval"
    ],
    disallowedEvidenceSources: [
      "user hint",
      "broad search",
      "zero-result inference",
      "match status alone"
    ]
  },
  norway_ntf: {
    probeFamily: "norway_ntf",
    probeMode: "no_write_configured_family_season_state_probe",
    requiredProbeSections: [
      "current fixture/result window",
      "current standings/table with season marker",
      "competition season status marker"
    ],
    allowedEvidenceSources: [
      "existing local diagnostics",
      "configured NTF route only after explicit controlled approval"
    ],
    disallowedEvidenceSources: [
      "user hint",
      "broad search",
      "zero-result inference",
      "match status alone"
    ]
  },
  sportomedia: {
    probeFamily: "sportomedia",
    probeMode: "no_write_configured_family_payload_season_state_probe",
    requiredProbeSections: [
      "current fixture/result payload",
      "current standings/table payload",
      "round/match-volume evidence from payload",
      "competition season marker when available"
    ],
    allowedEvidenceSources: [
      "existing local diagnostics",
      "configured Sportomedia route only after explicit controlled approval"
    ],
    disallowedEvidenceSources: [
      "user hint",
      "broad search",
      "zero-result inference",
      "match status alone"
    ]
  }
};

function parseArgs(argv) {
  const args = { date: DEFAULT_DATE, gap: DEFAULT_GAP, executor: DEFAULT_EXECUTOR, output: DEFAULT_OUTPUT };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--gap") args.gap = argv[++i];
    else if (arg === "--executor") args.executor = argv[++i];
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

function validateGap(gap) {
  const summary = gap.summary || {};

  assertSummary(summary, "evidenceGapCompetitionCount", 6);
  assertSummary(summary, "unknownNeedsEvidenceCompetitionCount", 6);
  assertSummary(summary, "activeClassifiableNowCount", 0);
  assertSummary(summary, "completedOrInactiveClassifiableNowCount", 0);
  assertSummary(summary, "evidenceMustRemainUnknownNowCount", 6);
  assertSummary(summary, "laligaEvidenceGapCompetitionCount", 2);
  assertSummary(summary, "norwayNtfEvidenceGapCompetitionCount", 2);
  assertSummary(summary, "sportomediaEvidenceGapCompetitionCount", 2);
  assertSummary(summary, "userHintUsedCount", 0);
  assertSummary(summary, "hardcodedSeasonStateOverrideUsedCount", 0);
  assertSummary(summary, "validatorReadinessDoesNotImplyActiveCount", 6);
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

  const rows = Array.isArray(gap.gapRows) ? gap.gapRows : [];
  if (rows.length !== 6) throw new Error("Expected 6 gap rows, got " + rows.length);

  const slugs = uniqueSorted(rows.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Gap row slugs mismatch: " + slugs.join(", "));
  }

  for (const row of rows) {
    if (row.seasonStateEvidenceGapStatus !== "season_state_unknown_needs_source_evidence") {
      throw new Error(row.competitionSlug + ": expected unknown evidence gap status");
    }
    if (row.evidenceMustRemainUnknownNow !== true) {
      throw new Error(row.competitionSlug + ": evidenceMustRemainUnknownNow must be true");
    }
    if (row.userHintUsed !== false || row.hardcodedSeasonStateOverrideUsed !== false) {
      throw new Error(row.competitionSlug + ": hints/overrides must be false");
    }
  }

  return rows;
}

function validateExecutor(executor) {
  const summary = executor.summary || {};
  assertSummary(summary, "localExecutorCompetitionCount", 6);
  assertSummary(summary, "localExecutorReadyObservationCount", 6);
  assertSummary(summary, "localExecutorBlockedObservationCount", 0);
  assertSummary(summary, "localEvidenceFileReferenceCount", 24);
  assertSummary(summary, "localEvidenceFilesWithMatchesCount", 18);
  assertSummary(summary, "localEvidenceMatchedObjectCount", 38);
  assertSummary(summary, "fetchAllowedNowCount", 0);
  assertSummary(summary, "searchAllowedNowCount", 0);
  assertSummary(summary, "canonicalWrites", 0);
  assertSummary(summary, "productionWrite", false);

  const rows = Array.isArray(executor.observationRows) ? executor.observationRows : [];
  if (rows.length !== 6) throw new Error("Expected 6 executor observation rows, got " + rows.length);

  return rows;
}

function matchedEvidenceFromExecutor(row) {
  const files = Array.isArray(row.fileObservations) ? row.fileObservations : [];
  return files
    .filter((file) => (file.matchedObjectCount || 0) > 0)
    .map((file) => ({
      filePath: file.filePath,
      matchedObjectCount: file.matchedObjectCount || 0,
      sampleMatchCount: Array.isArray(file.matchedObjects) ? Math.min(file.matchedObjects.length, 3) : 0
    }));
}

function buildProbeRow(gapRow, executorRow) {
  const familyProbe = FAMILY_PROBES[gapRow.reusableFamily];
  if (!familyProbe) throw new Error("Missing family probe template for " + gapRow.reusableFamily);

  const matchedEvidenceFiles = matchedEvidenceFromExecutor(executorRow);
  const localProbeInputFileCount = matchedEvidenceFiles.length;
  const localProbeMatchedObjectCount = matchedEvidenceFiles.reduce((sum, file) => sum + file.matchedObjectCount, 0);

  return {
    competitionSlug: gapRow.competitionSlug,
    reusableFamily: gapRow.reusableFamily,
    sourceSeasonStateEvidenceGapStatus: gapRow.seasonStateEvidenceGapStatus,
    sourceEvidenceMustRemainUnknownNow: gapRow.evidenceMustRemainUnknownNow,

    sourceEvidenceProbePlanStatus:
      localProbeInputFileCount > 0
        ? "source_evidence_probe_plan_ready_from_existing_local_evidence"
        : "source_evidence_probe_plan_blocked_missing_local_probe_inputs",

    probeFamily: familyProbe.probeFamily,
    probeMode: familyProbe.probeMode,
    requiredProbeSections: familyProbe.requiredProbeSections,
    allowedEvidenceSources: familyProbe.allowedEvidenceSources,
    disallowedEvidenceSources: familyProbe.disallowedEvidenceSources,

    existingLocalProbeInputFiles: matchedEvidenceFiles,
    existingLocalProbeInputFileCount: localProbeInputFileCount,
    existingLocalProbeMatchedObjectCount: localProbeMatchedObjectCount,

    sourceEvidenceProbeCanRunLocalNoWriteNow: localProbeInputFileCount > 0,
    sourceEvidenceProbeCanClassifySeasonStateNow: false,
    sourceEvidenceProbeMustOnlyEmitEvidenceSignals: true,
    nextAllowedStep:
      localProbeInputFileCount > 0
        ? "run_no_write_local_source_evidence_probe_for_configured_family_season_state_signals"
        : "repair_local_probe_inputs_before_source_evidence_probe",

    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,
    validatorReadinessDoesNotImplyActive: true,
    noMatchTodayDoesNotImplyInactive: true,
    matchStatusIsNotSeasonStateTruth: true,

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
  const gap = readJson(args.gap);
  const executor = readJson(args.executor);

  const gapRows = validateGap(gap);
  const executorRows = validateExecutor(executor);
  const executorBySlug = new Map(executorRows.map((row) => [row.competitionSlug, row]));

  const probeRows = gapRows
    .map((gapRow) => {
      const executorRow = executorBySlug.get(gapRow.competitionSlug);
      if (!executorRow) throw new Error("Missing executor observation row for " + gapRow.competitionSlug);
      return buildProbeRow(gapRow, executorRow);
    })
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const readyRows = probeRows.filter((row) =>
    row.sourceEvidenceProbePlanStatus === "source_evidence_probe_plan_ready_from_existing_local_evidence"
  );
  const blockedRows = probeRows.filter((row) =>
    row.sourceEvidenceProbePlanStatus !== "source_evidence_probe_plan_ready_from_existing_local_evidence"
  );

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-configured-family-season-state-source-evidence-probe-plan-file",
    mode: "no_write_configured_family_season_state_source_evidence_probe_plan_no_fetch_no_search_no_writes_no_truth_assertions",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      seasonStateEvidenceGapPlan: args.gap,
      genericValidatorNoWriteLocalExecutor: args.executor
    },
    summary: {
      sourceEvidenceProbePlanCompetitionCount: probeRows.length,
      sourceEvidenceProbePlanReadyCompetitionCount: readyRows.length,
      sourceEvidenceProbePlanBlockedCompetitionCount: blockedRows.length,

      laligaProbePlanCompetitionCount: probeRows.filter((row) => row.reusableFamily === "laliga").length,
      norwayNtfProbePlanCompetitionCount: probeRows.filter((row) => row.reusableFamily === "norway_ntf").length,
      sportomediaProbePlanCompetitionCount: probeRows.filter((row) => row.reusableFamily === "sportomedia").length,

      existingLocalProbeInputFileCount: probeRows.reduce((sum, row) => sum + row.existingLocalProbeInputFileCount, 0),
      existingLocalProbeMatchedObjectCount: probeRows.reduce((sum, row) => sum + row.existingLocalProbeMatchedObjectCount, 0),

      sourceEvidenceProbeCanRunLocalNoWriteNowCount: probeRows.filter((row) => row.sourceEvidenceProbeCanRunLocalNoWriteNow).length,
      sourceEvidenceProbeCanClassifySeasonStateNowCount: probeRows.filter((row) => row.sourceEvidenceProbeCanClassifySeasonStateNow).length,

      userHintUsedCount: probeRows.filter((row) => row.userHintUsed).length,
      hardcodedSeasonStateOverrideUsedCount: probeRows.filter((row) => row.hardcodedSeasonStateOverrideUsed).length,
      validatorReadinessDoesNotImplyActiveCount: probeRows.filter((row) => row.validatorReadinessDoesNotImplyActive).length,

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
        blockedRows.length === 0
          ? "run_no_write_configured_family_season_state_source_evidence_probe_from_existing_local_files"
          : "repair_source_evidence_probe_inputs_before_no_write_probe"
    },
    counts: {
      byReusableFamily: countBy(probeRows, "reusableFamily"),
      byProbeMode: countBy(probeRows, "probeMode"),
      bySourceEvidenceProbePlanStatus: countBy(probeRows, "sourceEvidenceProbePlanStatus"),
      byNextAllowedStep: countBy(probeRows, "nextAllowedStep")
    },
    guardrails: [
      "This is a probe plan only; it does not classify season state.",
      "It identifies local/configured-family evidence inputs for season-state probing.",
      "It uses no user-provided season-state hints.",
      "It uses no hardcoded season-state overrides.",
      "Validator readiness must not imply active season state.",
      "No match today must not imply inactive.",
      "Match status must not be used as season-state truth.",
      "This plan does not fetch.",
      "This plan does not search.",
      "This plan does not write canonical data.",
      "This plan does not assert active/inactive/completed truth.",
      "This plan does not update production."
    ],
    probeRows,
    blockedRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    sourceEvidenceProbePlanCompetitionCount: output.summary.sourceEvidenceProbePlanCompetitionCount,
    sourceEvidenceProbePlanReadyCompetitionCount: output.summary.sourceEvidenceProbePlanReadyCompetitionCount,
    sourceEvidenceProbePlanBlockedCompetitionCount: output.summary.sourceEvidenceProbePlanBlockedCompetitionCount,
    laligaProbePlanCompetitionCount: output.summary.laligaProbePlanCompetitionCount,
    norwayNtfProbePlanCompetitionCount: output.summary.norwayNtfProbePlanCompetitionCount,
    sportomediaProbePlanCompetitionCount: output.summary.sportomediaProbePlanCompetitionCount,
    existingLocalProbeInputFileCount: output.summary.existingLocalProbeInputFileCount,
    existingLocalProbeMatchedObjectCount: output.summary.existingLocalProbeMatchedObjectCount,
    sourceEvidenceProbeCanRunLocalNoWriteNowCount: output.summary.sourceEvidenceProbeCanRunLocalNoWriteNowCount,
    sourceEvidenceProbeCanClassifySeasonStateNowCount: output.summary.sourceEvidenceProbeCanClassifySeasonStateNowCount,
    userHintUsedCount: output.summary.userHintUsedCount,
    hardcodedSeasonStateOverrideUsedCount: output.summary.hardcodedSeasonStateOverrideUsedCount,
    validatorReadinessDoesNotImplyActiveCount: output.summary.validatorReadinessDoesNotImplyActiveCount,
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
