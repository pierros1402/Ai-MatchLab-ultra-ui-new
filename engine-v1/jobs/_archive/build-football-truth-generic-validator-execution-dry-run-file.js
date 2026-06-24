#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/generic-full-contract-batch-validator-wrapper-2026-06-14/generic-full-contract-batch-validator-wrapper-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/generic-validator-execution-dry-run-2026-06-14/generic-validator-execution-dry-run-2026-06-14.json";

const EXPECTED_FAMILIES = ["laliga", "norway_ntf", "sportomedia"];
const EXPECTED_SLUGS = ["esp.1", "esp.2", "nor.1", "nor.2", "swe.1", "swe.2"];

const VALIDATOR_ENGINE_FILE =
  "engine-v1/jobs/build-football-truth-reusable-adapter-family-contract-validator-engine-file.js";

const STATE_DEPENDENT_PLAN_FILE =
  "engine-v1/jobs/build-football-truth-reusable-state-dependent-contract-validator-plan-file.js";

const REQUIRED_ROLES = ["route", "fixture", "standings", "season_state"];

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

function countBy(values) {
  const counts = {};
  for (const value of values) {
    const key = String(value || "__missing__").trim() || "__missing__";
    counts[key] = (counts[key] || 0) + 1;
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

function inspectSourceFile(filePath, families, slugs) {
  if (!fs.existsSync(filePath)) {
    return {
      path: filePath,
      exists: false,
      familyHits: [],
      slugHits: [],
      roleCoverage: {},
      allFamiliesPresent: false,
      allSlugsPresent: false,
      allRolesPresent: false
    };
  }

  const text = fs.readFileSync(filePath, "utf8");
  const lower = text.toLowerCase();

  const roleCoverage = {
    route: /route|official|provider|adapter|selector|endpoint|sourceurl|source_url/i.test(text),
    fixture: /fixture|fixtures|match|matches|result|results|kickoff|kick_off/i.test(text),
    standings: /standing|standings|table|rank|position|played|points|pts/i.test(text),
    season_state: /seasonstate|season_state|season-state|active|completed|inactive|restart|startdate|start_date/i.test(text)
  };

  const familyHits = families.filter((family) => lower.includes(family.toLowerCase()));
  const slugHits = slugs.filter((slug) => lower.includes(slug.toLowerCase()));

  return {
    path: filePath,
    exists: true,
    sizeBytes: Buffer.byteLength(text, "utf8"),
    familyHits,
    slugHits,
    roleCoverage,
    allFamiliesPresent: familyHits.length === families.length,
    allSlugsPresent: slugHits.length === slugs.length,
    allRolesPresent: REQUIRED_ROLES.every((role) => roleCoverage[role] === true),
    hasWriteRiskTerms: /writeFileSync|canonicalWrites|productionWrite|fixtures\.json|observations\.json|source-reliability\.json/i.test(text)
  };
}

function buildDryRunRow(materializedRow, sourceInspections) {
  const allSourceFilesPresent = sourceInspections.every((inspection) => inspection.exists);
  const allFamiliesPresentInSources = sourceInspections.every((inspection) =>
    inspection.familyHits.includes(materializedRow.reusableFamily)
  );
  const allSlugPresentInSources = sourceInspections.every((inspection) =>
    inspection.slugHits.includes(materializedRow.competitionSlug)
  );
  const allRolesPresentInSources = sourceInspections.every((inspection) => inspection.allRolesPresent);

  const dryRunReadiness =
    allSourceFilesPresent &&
    allFamiliesPresentInSources &&
    allSlugPresentInSources &&
    allRolesPresentInSources &&
    materializedRow.wrapperReadiness === "ready_for_generic_source_only_validator_wrapper"
      ? "source_only_execution_dry_run_ready_no_contract_assertion"
      : "source_only_execution_dry_run_not_ready_missing_source_support";

  return {
    competitionSlug: materializedRow.competitionSlug,
    reusableFamily: materializedRow.reusableFamily,
    wrapperReadiness: materializedRow.wrapperReadiness,
    dryRunReadiness,
    dryRunReadinessReason:
      dryRunReadiness === "source_only_execution_dry_run_ready_no_contract_assertion"
        ? "materialized input is present in both generic validator source files with required role terms"
        : "materialized input is missing family/slug/role support in one or more generic validator source files",
    requiredContractRoles: REQUIRED_ROLES,
    sourceSupport: sourceInspections.map((inspection) => ({
      path: inspection.path,
      exists: inspection.exists,
      supportsFamily: inspection.familyHits.includes(materializedRow.reusableFamily),
      supportsSlug: inspection.slugHits.includes(materializedRow.competitionSlug),
      allRolesPresent: inspection.allRolesPresent,
      roleCoverage: inspection.roleCoverage
    })),
    executionSimulation: {
      wouldInvokeGenericValidatorEngine: dryRunReadiness === "source_only_execution_dry_run_ready_no_contract_assertion",
      wouldInvokeStateDependentPlan: dryRunReadiness === "source_only_execution_dry_run_ready_no_contract_assertion",
      fetchAllowed: false,
      searchAllowed: false,
      broadSearchAllowed: false,
      canonicalWriteAllowed: false,
      productionWriteAllowed: false
    },
    validationAssertionsMade: {
      routeContractValidated: false,
      fixtureContractValidated: false,
      standingsContractValidated: false,
      seasonStateContractValidated: false,
      activeAsserted: false,
      inactiveAsserted: false,
      completedAsserted: false,
      canonicalWriteEligible: false
    }
  };
}

function main() {
  const args = parseArgs(process.argv);
  const wrapper = readJson(args.input);
  const summary = wrapper.summary || {};

  assertSummary(summary, "retainedRawMapCompetitionCount", 689);
  assertSummary(summary, "competitionCount", 689);
  assertSummary(summary, "currentEffectiveMapExactCountAsserted", false);
  assertSummary(summary, "currentEffectiveMapExactCount", null);
  assertSummary(summary, "sourceDiscoveryConfirmedActionableCompetitionCount", 0);
  assertSummary(summary, "targetFamilyCount", 3);
  assertSummary(summary, "targetCompetitionCount", 6);
  assertSummary(summary, "wrapperReadyFamilyCount", 3);
  assertSummary(summary, "wrapperReadyCompetitionCount", 6);
  assertSummary(summary, "wrapperNotReadyFamilyCount", 0);
  assertSummary(summary, "materializedValidatorInputFamilyCount", 3);
  assertSummary(summary, "materializedValidatorInputCompetitionCount", 6);
  assertSummary(summary, "contractConfirmedByThisWrapperCount", 0);
  assertSummary(summary, "familyApplicabilityAssertedByThisWrapperCount", 0);
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

  const targetFamilies = uniqueSorted(summary.targetFamilies || []);
  const targetSlugs = uniqueSorted(summary.targetCompetitionSlugs || []);

  if (JSON.stringify(targetFamilies) !== JSON.stringify(EXPECTED_FAMILIES)) {
    throw new Error(`Expected target families ${EXPECTED_FAMILIES.join(",")}, got ${targetFamilies.join(",")}`);
  }

  if (JSON.stringify(targetSlugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error(`Expected target slugs ${EXPECTED_SLUGS.join(",")}, got ${targetSlugs.join(",")}`);
  }

  const materializedRows = Array.isArray(wrapper.materializedCompetitionRows)
    ? wrapper.materializedCompetitionRows
    : [];

  if (materializedRows.length !== 6) {
    throw new Error(`Expected 6 materialized competition rows, got ${materializedRows.length}`);
  }

  const sourceInspections = [
    inspectSourceFile(VALIDATOR_ENGINE_FILE, targetFamilies, targetSlugs),
    inspectSourceFile(STATE_DEPENDENT_PLAN_FILE, targetFamilies, targetSlugs)
  ];

  const dryRunRows = materializedRows
    .map((row) => buildDryRunRow(row, sourceInspections))
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const readyRows = dryRunRows.filter((row) =>
    row.dryRunReadiness === "source_only_execution_dry_run_ready_no_contract_assertion"
  );

  const notReadyRows = dryRunRows.filter((row) =>
    row.dryRunReadiness !== "source_only_execution_dry_run_ready_no_contract_assertion"
  );

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-generic-validator-execution-dry-run-file",
    mode: "source_only_generic_validator_execution_dry_run_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      genericFullContractBatchValidatorWrapper: args.input,
      validatorEngineFile: VALIDATOR_ENGINE_FILE,
      stateDependentPlanFile: STATE_DEPENDENT_PLAN_FILE
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

      dryRunReadyCompetitionCount: readyRows.length,
      dryRunNotReadyCompetitionCount: notReadyRows.length,
      dryRunReadyFamilyCount: uniqueSorted(readyRows.map((row) => row.reusableFamily)).length,
      dryRunNotReadyFamilyCount: uniqueSorted(notReadyRows.map((row) => row.reusableFamily)).length,

      validatorEngineFileExists: sourceInspections[0].exists,
      stateDependentPlanFileExists: sourceInspections[1].exists,
      allTargetFamiliesPresentInValidatorEngine: sourceInspections[0].allFamiliesPresent,
      allTargetSlugsPresentInValidatorEngine: sourceInspections[0].allSlugsPresent,
      allRequiredRolesPresentInValidatorEngine: sourceInspections[0].allRolesPresent,
      allTargetFamiliesPresentInStateDependentPlan: sourceInspections[1].allFamiliesPresent,
      allTargetSlugsPresentInStateDependentPlan: sourceInspections[1].allSlugsPresent,
      allRequiredRolesPresentInStateDependentPlan: sourceInspections[1].allRolesPresent,

      contractConfirmedByThisDryRunCount: 0,
      familyApplicabilityAssertedByThisDryRunCount: 0,
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

      recommendedNextLane: "inspect_existing_generic_validator_engine_cli_or_add_batch_execution_adapter_source_only"
    },
    counts: {
      byDryRunReadiness: countBy(dryRunRows.map((row) => row.dryRunReadiness)),
      byReusableFamily: countBy(dryRunRows.map((row) => row.reusableFamily))
    },
    guardrails: [
      "This is an execution dry-run only.",
      "It does not call live provider endpoints.",
      "It does not run search.",
      "It does not write canonical or production data.",
      "It does not validate route, fixture, standings, or season-state contracts.",
      "It does not assert active, inactive, completed, or actionable status.",
      "It only confirms the materialized inputs are ready for a source-only generic execution adapter.",
      "Next step must inspect or add a batch execution adapter without enabling fetch/search/write."
    ],
    sourceInspections,
    readyRows,
    notReadyRows,
    dryRunRows
  };

  if (output.summary.dryRunReadyCompetitionCount !== 6) {
    throw new Error(`Expected 6 dry-run-ready competitions, got ${output.summary.dryRunReadyCompetitionCount}`);
  }

  if (output.summary.dryRunNotReadyCompetitionCount !== 0) {
    throw new Error(`Expected 0 not-ready competitions, got ${output.summary.dryRunNotReadyCompetitionCount}`);
  }

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    retainedRawMapCompetitionCount: output.summary.retainedRawMapCompetitionCount,
    competitionCount: output.summary.competitionCount,
    currentEffectiveMapExactCountAsserted: output.summary.currentEffectiveMapExactCountAsserted,
    currentEffectiveMapExactCount: output.summary.currentEffectiveMapExactCount,
    sourceDiscoveryConfirmedActionableCompetitionCount: output.summary.sourceDiscoveryConfirmedActionableCompetitionCount,
    targetFamilyCount: output.summary.targetFamilyCount,
    targetCompetitionCount: output.summary.targetCompetitionCount,
    targetFamilies: output.summary.targetFamilies,
    targetCompetitionSlugs: output.summary.targetCompetitionSlugs,
    dryRunReadyCompetitionCount: output.summary.dryRunReadyCompetitionCount,
    dryRunNotReadyCompetitionCount: output.summary.dryRunNotReadyCompetitionCount,
    dryRunReadyFamilyCount: output.summary.dryRunReadyFamilyCount,
    dryRunNotReadyFamilyCount: output.summary.dryRunNotReadyFamilyCount,
    validatorEngineFileExists: output.summary.validatorEngineFileExists,
    stateDependentPlanFileExists: output.summary.stateDependentPlanFileExists,
    allTargetFamiliesPresentInValidatorEngine: output.summary.allTargetFamiliesPresentInValidatorEngine,
    allTargetSlugsPresentInValidatorEngine: output.summary.allTargetSlugsPresentInValidatorEngine,
    allRequiredRolesPresentInValidatorEngine: output.summary.allRequiredRolesPresentInValidatorEngine,
    allTargetFamiliesPresentInStateDependentPlan: output.summary.allTargetFamiliesPresentInStateDependentPlan,
    allTargetSlugsPresentInStateDependentPlan: output.summary.allTargetSlugsPresentInStateDependentPlan,
    allRequiredRolesPresentInStateDependentPlan: output.summary.allRequiredRolesPresentInStateDependentPlan,
    contractConfirmedByThisDryRunCount: output.summary.contractConfirmedByThisDryRunCount,
    familyApplicabilityAssertedByThisDryRunCount: output.summary.familyApplicabilityAssertedByThisDryRunCount,
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
