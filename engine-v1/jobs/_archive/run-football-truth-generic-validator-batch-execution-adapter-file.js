#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/generic-validator-execution-dry-run-2026-06-14/generic-validator-execution-dry-run-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/generic-validator-batch-execution-adapter-2026-06-14/generic-validator-batch-execution-adapter-2026-06-14.json";

const VALIDATOR_ENGINE_FILE =
  "engine-v1/jobs/build-football-truth-reusable-adapter-family-contract-validator-engine-file.js";

const EXPECTED_FAMILIES = ["laliga", "norway_ntf", "sportomedia"];
const EXPECTED_SLUGS = ["esp.1", "esp.2", "nor.1", "nor.2", "swe.1", "swe.2"];

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--input") args.input = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing JSON input: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
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
  if (!(key in summary)) throw new Error(`Missing summary key: ${key}`);
  if (summary[key] !== expected) {
    throw new Error(`Guardrail failed for ${key}: expected ${expected}, got ${summary[key]}`);
  }
}

function priorityForFamily(family) {
  if (family === "laliga") return 2;
  if (family === "norway_ntf") return 2;
  if (family === "sportomedia") return 2;
  return 99;
}

function materializeReusablePlanRows(dryRunRows) {
  return dryRunRows
    .map((row) => ({
      competitionSlug: row.competitionSlug,
      competitionName: "",
      adapterFamily: row.reusableFamily,
      familyBatchPriority: priorityForFamily(row.reusableFamily),
      reusableLaneStatus: "ready_for_generic_source_only_batch_execution_adapter",
      nextReusableStep: "invoke_existing_reusable_adapter_family_contract_validator_engine_config_only",
      blocksBespokeWork: true,
      sourceDryRunReadiness: row.dryRunReadiness,
      rawSourceAllowlistHints: [row.reusableFamily, row.competitionSlug],
      fetchAllowedNow: false,
      searchAllowedNow: false,
      broadSearchAllowedNow: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false
    }))
    .sort((a, b) => {
      if (a.familyBatchPriority !== b.familyBatchPriority) return a.familyBatchPriority - b.familyBatchPriority;
      if (a.adapterFamily !== b.adapterFamily) return a.adapterFamily.localeCompare(b.adapterFamily);
      return a.competitionSlug.localeCompare(b.competitionSlug);
    });
}

function runValidatorEngine(reusablePlanPath, engineOutputPath) {
  const result = spawnSync(
    process.execPath,
    [
      VALIDATOR_ENGINE_FILE,
      "--reusable-plan",
      reusablePlanPath,
      "--output",
      engineOutputPath
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  return {
    command: [
      process.execPath,
      VALIDATOR_ENGINE_FILE,
      "--reusable-plan",
      reusablePlanPath,
      "--output",
      engineOutputPath
    ],
    status: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
    ok: result.status === 0
  };
}

function main() {
  const args = parseArgs(process.argv);
  const dryRun = readJson(args.input);
  const summary = dryRun.summary || {};

  assertSummary(summary, "retainedRawMapCompetitionCount", 689);
  assertSummary(summary, "competitionCount", 689);
  assertSummary(summary, "currentEffectiveMapExactCountAsserted", false);
  assertSummary(summary, "currentEffectiveMapExactCount", null);
  assertSummary(summary, "sourceDiscoveryConfirmedActionableCompetitionCount", 0);
  assertSummary(summary, "targetFamilyCount", 3);
  assertSummary(summary, "targetCompetitionCount", 6);
  assertSummary(summary, "dryRunReadyCompetitionCount", 6);
  assertSummary(summary, "dryRunNotReadyCompetitionCount", 0);
  assertSummary(summary, "dryRunReadyFamilyCount", 3);
  assertSummary(summary, "dryRunNotReadyFamilyCount", 0);
  assertSummary(summary, "validatorEngineFileExists", true);
  assertSummary(summary, "stateDependentPlanFileExists", true);
  assertSummary(summary, "allTargetFamiliesPresentInValidatorEngine", true);
  assertSummary(summary, "allTargetSlugsPresentInValidatorEngine", true);
  assertSummary(summary, "allRequiredRolesPresentInValidatorEngine", true);
  assertSummary(summary, "allTargetFamiliesPresentInStateDependentPlan", true);
  assertSummary(summary, "allTargetSlugsPresentInStateDependentPlan", true);
  assertSummary(summary, "allRequiredRolesPresentInStateDependentPlan", true);
  assertSummary(summary, "contractConfirmedByThisDryRunCount", 0);
  assertSummary(summary, "familyApplicabilityAssertedByThisDryRunCount", 0);
  assertSummary(summary, "validatedRouteMapCount", 0);
  assertSummary(summary, "validatedFixtureContractCount", 0);
  assertSummary(summary, "validatedStandingsContractCount", 0);
  assertSummary(summary, "validatedSeasonStateContractCount", 0);
  assertSummary(summary, "fetchAllowedNowCount", 0);
  assertSummary(summary, "searchAllowedNowCount", 0);
  assertSummary(summary, "broadSearchAllowedNowCount", 0);
  assertSummary(summary, "zeroResultMayImplyAbsenceCount", 0);
  assertSummary(summary, "canonicalWriteEligibleNowCount", 0);
  assertSummary(summary, "activeAssertedCount", 0);
  assertSummary(summary, "inactiveAssertedCount", 0);
  assertSummary(summary, "completedAssertedCount", 0);
  assertSummary(summary, "canonicalWrites", 0);
  assertSummary(summary, "productionWrite", false);

  if (!fs.existsSync(VALIDATOR_ENGINE_FILE)) {
    throw new Error(`Missing validator engine file: ${VALIDATOR_ENGINE_FILE}`);
  }

  const targetFamilies = uniqueSorted(summary.targetFamilies || []);
  const targetSlugs = uniqueSorted(summary.targetCompetitionSlugs || []);

  if (JSON.stringify(targetFamilies) !== JSON.stringify(EXPECTED_FAMILIES)) {
    throw new Error(`Expected target families ${EXPECTED_FAMILIES.join(",")}, got ${targetFamilies.join(",")}`);
  }

  if (JSON.stringify(targetSlugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error(`Expected target slugs ${EXPECTED_SLUGS.join(",")}, got ${targetSlugs.join(",")}`);
  }

  const dryRunRows = Array.isArray(dryRun.dryRunRows) ? dryRun.dryRunRows : [];
  if (dryRunRows.length !== 6) throw new Error(`Expected 6 dry-run rows, got ${dryRunRows.length}`);

  const reusablePlanRows = materializeReusablePlanRows(dryRunRows);
  const reusablePlanFamilies = uniqueSorted(reusablePlanRows.map((row) => row.adapterFamily));
  const reusablePlanSlugs = uniqueSorted(reusablePlanRows.map((row) => row.competitionSlug));

  if (JSON.stringify(reusablePlanFamilies) !== JSON.stringify(EXPECTED_FAMILIES)) {
    throw new Error(`Materialized plan families mismatch: ${reusablePlanFamilies.join(",")}`);
  }

  if (JSON.stringify(reusablePlanSlugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error(`Materialized plan slugs mismatch: ${reusablePlanSlugs.join(",")}`);
  }

  const outputDir = path.dirname(args.output);
  fs.mkdirSync(outputDir, { recursive: true });

  const materializedReusablePlanPath = path.join(
    outputDir,
    `generic-validator-batch-execution-adapter-reusable-plan-${args.date}.json`
  ).replaceAll("\\", "/");

  const engineOutputPath = path.join(
    outputDir,
    `generic-validator-batch-execution-adapter-engine-output-${args.date}.json`
  ).replaceAll("\\", "/");

  const materializedReusablePlan = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "run-football-truth-generic-validator-batch-execution-adapter-file",
    mode: "source_only_materialized_reusable_plan_for_existing_generic_validator_engine_no_fetch_no_search_no_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      genericValidatorExecutionDryRun: args.input
    },
    summary: {
      reusablePlanRowCount: reusablePlanRows.length,
      adapterFamilyCount: reusablePlanFamilies.length,
      competitionCount: reusablePlanSlugs.length,
      adapterFamilies: reusablePlanFamilies,
      competitionSlugs: reusablePlanSlugs,
      fetchAllowedNowCount: 0,
      searchAllowedNowCount: 0,
      broadSearchAllowedNowCount: 0,
      canonicalWriteEligibleNowCount: 0,
      canonicalWrites: 0,
      productionWrite: false
    },
    reusablePlanRows
  };

  fs.writeFileSync(materializedReusablePlanPath, stableJson(materializedReusablePlan));

  const engineRun = runValidatorEngine(materializedReusablePlanPath, engineOutputPath);
  if (!engineRun.ok) {
    throw new Error(`Validator engine execution failed with status ${engineRun.status}: ${engineRun.stderr || engineRun.stdout}`);
  }

  const engineOutput = readJson(engineOutputPath);
  const engineSummary = engineOutput.summary || {};

  assertSummary(engineSummary, "engineRowCount", 6);
  assertSummary(engineSummary, "configuredFamilyRowCount", 6);
  assertSummary(engineSummary, "routeClassificationRequiredRowCount", 0);
  assertSummary(engineSummary, "blockedMissingFamilyConfigRowCount", 0);
  assertSummary(engineSummary, "fullContractSatisfiedNowCount", 0);
  assertSummary(engineSummary, "validationRunPerformed", false);
  assertSummary(engineSummary, "activeAssertedCount", 0);
  assertSummary(engineSummary, "inactiveAssertedCount", 0);
  assertSummary(engineSummary, "completedAssertedCount", 0);
  assertSummary(engineSummary, "fetchAllowedNowCount", 0);
  assertSummary(engineSummary, "searchAllowedNowCount", 0);
  assertSummary(engineSummary, "canonicalWriteEligibleNowCount", 0);
  assertSummary(engineSummary, "canonicalWrites", 0);
  assertSummary(engineSummary, "productionWrite", false);

  const engineRows = Array.isArray(engineOutput.engineRows) ? engineOutput.engineRows : [];
  const engineFamilies = uniqueSorted(engineRows.map((row) => row.adapterFamily));
  const engineSlugs = uniqueSorted(engineRows.map((row) => row.competitionSlug));
  const readyEngineRows = engineRows.filter((row) => row.engineAction === "ready_for_reusable_family_validator");

  if (JSON.stringify(engineFamilies) !== JSON.stringify(EXPECTED_FAMILIES)) {
    throw new Error(`Engine output families mismatch: ${engineFamilies.join(",")}`);
  }

  if (JSON.stringify(engineSlugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error(`Engine output slugs mismatch: ${engineSlugs.join(",")}`);
  }

  if (readyEngineRows.length !== 6) {
    throw new Error(`Expected 6 ready engine rows, got ${readyEngineRows.length}`);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "run-football-truth-generic-validator-batch-execution-adapter-file",
    mode: "source_only_generic_validator_batch_execution_adapter_invokes_existing_engine_config_only_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      genericValidatorExecutionDryRun: args.input,
      materializedReusablePlan: materializedReusablePlanPath,
      validatorEngineFile: VALIDATOR_ENGINE_FILE,
      engineOutput: engineOutputPath
    },
    engineRun: {
      command: engineRun.command,
      status: engineRun.status,
      signal: engineRun.signal,
      ok: engineRun.ok,
      stdoutPreview: String(engineRun.stdout || "").slice(0, 4000),
      stderrPreview: String(engineRun.stderr || "").slice(0, 4000)
    },
    summary: {
      retainedRawMapCompetitionCount: summary.retainedRawMapCompetitionCount,
      competitionCount: summary.competitionCount,
      currentEffectiveMapExactCountAsserted: false,
      currentEffectiveMapExactCount: null,
      sourceDiscoveryConfirmedActionableCompetitionCount: 0,

      targetFamilyCount: targetFamilies.length,
      targetCompetitionCount: targetSlugs.length,
      targetFamilies,
      targetCompetitionSlugs: targetSlugs,

      materializedReusablePlanRowCount: reusablePlanRows.length,
      materializedReusablePlanFamilyCount: reusablePlanFamilies.length,
      materializedReusablePlanCompetitionCount: reusablePlanSlugs.length,

      engineExecuted: true,
      engineRowCount: engineSummary.engineRowCount,
      engineConfiguredFamilyRowCount: engineSummary.configuredFamilyRowCount,
      engineReadyRowCount: readyEngineRows.length,
      engineBlockedMissingFamilyConfigRowCount: engineSummary.blockedMissingFamilyConfigRowCount,
      engineRouteClassificationRequiredRowCount: engineSummary.routeClassificationRequiredRowCount,
      engineValidationRunPerformed: engineSummary.validationRunPerformed,
      engineFullContractSatisfiedNowCount: engineSummary.fullContractSatisfiedNowCount,

      contractConfirmedByThisAdapterCount: 0,
      familyApplicabilityAssertedByThisAdapterCount: 0,
      validatedRouteMapCount: 0,
      validatedFixtureContractCount: 0,
      validatedStandingsContractCount: 0,
      validatedSeasonStateContractCount: 0,

      fetchAllowedNowCount: 0,
      searchAllowedNowCount: 0,
      broadSearchAllowedNowCount: 0,
      zeroResultMayImplyAbsenceCount: 0,
      canonicalWriteEligibleNowCount: 0,
      activeAssertedCount: 0,
      inactiveAssertedCount: 0,
      completedAssertedCount: 0,
      canonicalWrites: 0,
      productionWrite: false,

      recommendedNextLane: "build_source_only_real_validation_runner_or_selector_probe_for_ready_engine_rows_without_fetch_search_write"
    },
    counts: {
      byAdapterFamily: countBy(engineRows, "adapterFamily"),
      byEngineAction: countBy(engineRows, "engineAction"),
      byFamilyPriority: countBy(engineRows, "familyPriority")
    },
    guardrails: [
      "This adapter invokes the existing generic validator engine only in config-only dry-run mode.",
      "The engine outputStatusNow remains engine_config_only_no_validation_run.",
      "No live fetch is performed.",
      "No search is performed.",
      "No canonical or production data is written.",
      "No route, fixture, standings, or season-state contract is validated by this adapter.",
      "No active, inactive, completed, or actionable truth is asserted.",
      "Next step must execute source-only selector validation over existing/raw adapter-normalized local inputs, or report the precise missing input source layer."
    ],
    materializedReusablePlan,
    engineSummary,
    engineRows
  };

  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    materializedReusablePlan: materializedReusablePlanPath,
    engineOutput: engineOutputPath,
    retainedRawMapCompetitionCount: output.summary.retainedRawMapCompetitionCount,
    competitionCount: output.summary.competitionCount,
    currentEffectiveMapExactCountAsserted: output.summary.currentEffectiveMapExactCountAsserted,
    currentEffectiveMapExactCount: output.summary.currentEffectiveMapExactCount,
    sourceDiscoveryConfirmedActionableCompetitionCount: output.summary.sourceDiscoveryConfirmedActionableCompetitionCount,
    targetFamilyCount: output.summary.targetFamilyCount,
    targetCompetitionCount: output.summary.targetCompetitionCount,
    targetFamilies: output.summary.targetFamilies,
    targetCompetitionSlugs: output.summary.targetCompetitionSlugs,
    materializedReusablePlanRowCount: output.summary.materializedReusablePlanRowCount,
    engineExecuted: output.summary.engineExecuted,
    engineRowCount: output.summary.engineRowCount,
    engineConfiguredFamilyRowCount: output.summary.engineConfiguredFamilyRowCount,
    engineReadyRowCount: output.summary.engineReadyRowCount,
    engineBlockedMissingFamilyConfigRowCount: output.summary.engineBlockedMissingFamilyConfigRowCount,
    engineRouteClassificationRequiredRowCount: output.summary.engineRouteClassificationRequiredRowCount,
    engineValidationRunPerformed: output.summary.engineValidationRunPerformed,
    engineFullContractSatisfiedNowCount: output.summary.engineFullContractSatisfiedNowCount,
    contractConfirmedByThisAdapterCount: output.summary.contractConfirmedByThisAdapterCount,
    familyApplicabilityAssertedByThisAdapterCount: output.summary.familyApplicabilityAssertedByThisAdapterCount,
    validatedRouteMapCount: output.summary.validatedRouteMapCount,
    validatedFixtureContractCount: output.summary.validatedFixtureContractCount,
    validatedStandingsContractCount: output.summary.validatedStandingsContractCount,
    validatedSeasonStateContractCount: output.summary.validatedSeasonStateContractCount,
    fetchAllowedNowCount: output.summary.fetchAllowedNowCount,
    searchAllowedNowCount: output.summary.searchAllowedNowCount,
    broadSearchAllowedNowCount: output.summary.broadSearchAllowedNowCount,
    zeroResultMayImplyAbsenceCount: output.summary.zeroResultMayImplyAbsenceCount,
    canonicalWriteEligibleNowCount: output.summary.canonicalWriteEligibleNowCount,
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
