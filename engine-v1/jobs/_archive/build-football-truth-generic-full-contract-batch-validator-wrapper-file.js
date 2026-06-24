#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/full-contract-candidate-batch-validator-plan-2026-06-14/full-contract-candidate-batch-validator-plan-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/generic-full-contract-batch-validator-wrapper-2026-06-14/generic-full-contract-batch-validator-wrapper-2026-06-14.json";

const EXPECTED_FAMILIES = ["laliga", "norway_ntf", "sportomedia"];
const EXPECTED_SLUGS = ["esp.1", "esp.2", "nor.1", "nor.2", "swe.1", "swe.2"];

const VALIDATOR_ENGINE_FILE =
  "engine-v1/jobs/build-football-truth-reusable-adapter-family-contract-validator-engine-file.js";

const STATE_DEPENDENT_PLAN_FILE =
  "engine-v1/jobs/build-football-truth-reusable-state-dependent-contract-validator-plan-file.js";

const CONTRACT_ROLES = [
  "route",
  "fixture",
  "standings",
  "season_state"
];

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

function readTextIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

function includesAllFamilies(content, families) {
  const lower = String(content || "").toLowerCase();
  return families.every((family) => lower.includes(family.toLowerCase()));
}

function includesAllSlugs(content, slugs) {
  const lower = String(content || "").toLowerCase();
  return slugs.every((slug) => lower.includes(slug.toLowerCase()));
}

function fileInspection(filePath, families, slugs) {
  const content = readTextIfExists(filePath);
  const lower = String(content || "").toLowerCase();

  const familyHits = families.filter((family) => lower.includes(family.toLowerCase()));
  const slugHits = slugs.filter((slug) => lower.includes(slug.toLowerCase()));

  return {
    path: filePath,
    exists: content !== null,
    sizeBytes: content === null ? 0 : Buffer.byteLength(content, "utf8"),
    familyHits,
    familyHitCount: familyHits.length,
    allTargetFamiliesPresent: familyHits.length === families.length,
    slugHits,
    slugHitCount: slugHits.length,
    allTargetSlugsPresent: slugHits.length === slugs.length,
    hasRouteRole: /route|official|provider|adapter|selector|endpoint|sourceurl|source_url/i.test(content || ""),
    hasFixtureRole: /fixture|fixtures|match|matches|result|results|kickoff|kick_off/i.test(content || ""),
    hasStandingsRole: /standing|standings|table|rank|position|played|points|pts/i.test(content || ""),
    hasSeasonStateRole: /seasonstate|season_state|season-state|active|completed|inactive|restart|startdate|start_date/i.test(content || ""),
    hasValidatorRole: /validator|contract|normalized|normalizer|evidence/i.test(content || ""),
    hasWriteRiskTerms: /writeFileSync|canonical|productionWrite|fixtures\.json|observations\.json|source-reliability\.json/i.test(content || "")
  };
}

function buildFamilyWrapperRow(batchRow, validatorEngineInspection, stateDependentInspection) {
  const family = batchRow.reusableFamily;
  const slugs = batchRow.competitionSlugs || [];

  const engineSupportsFamily = validatorEngineInspection.familyHits.includes(family);
  const statePlanSupportsFamily = stateDependentInspection.familyHits.includes(family);

  const engineSupportsAllSlugs = slugs.every((slug) => validatorEngineInspection.slugHits.includes(slug));
  const statePlanSupportsAllSlugs = slugs.every((slug) => stateDependentInspection.slugHits.includes(slug));

  const wrapperReadiness =
    engineSupportsFamily &&
    statePlanSupportsFamily &&
    engineSupportsAllSlugs &&
    statePlanSupportsAllSlugs
      ? "ready_for_generic_source_only_validator_wrapper"
      : "not_ready_missing_family_or_slug_in_known_validator_sources";

  return {
    reusableFamily: family,
    competitionSlugs: slugs,
    competitionCount: slugs.length,
    sourcePlanReadinessClass: batchRow.readinessClass,
    wrapperReadiness,
    wrapperReadinessReason:
      wrapperReadiness === "ready_for_generic_source_only_validator_wrapper"
        ? "family and slugs are present in both known generic validator source files"
        : "family or slugs are missing from one of the known generic validator source files",
    materializedValidatorInput: {
      reusableFamily: family,
      competitionSlugs: slugs,
      contractRolesRequired: CONTRACT_ROLES,
      validatorMode: "source_only_no_fetch_no_search_no_write",
      requireIndependentSeasonStateEvidence: true,
      prohibitMatchStatusAsSeasonState: true,
      prohibitNoMatchTodayAsInactive: true,
      requireRestartOrStartDateForCompletedInactiveOrNearSeasonEnd: true,
      allowCanonicalWrites: false,
      allowProductionWrites: false,
      allowFetch: false,
      allowSearch: false,
      allowBroadSearch: false
    },
    knownSourceSupport: {
      validatorEngine: {
        path: validatorEngineInspection.path,
        supportsFamily: engineSupportsFamily,
        supportsAllSlugs: engineSupportsAllSlugs
      },
      stateDependentPlan: {
        path: stateDependentInspection.path,
        supportsFamily: statePlanSupportsFamily,
        supportsAllSlugs: statePlanSupportsAllSlugs
      }
    },
    fetchAllowedNow: false,
    searchAllowedNow: false,
    broadSearchAllowedNow: false,
    canonicalWriteEligibleNow: false,
    productionWrite: false
  };
}

function main() {
  const args = parseArgs(process.argv);
  const plan = readJson(args.input);
  const summary = plan.summary || {};

  assertSummary(summary, "retainedRawMapCompetitionCount", 689);
  assertSummary(summary, "competitionCount", 689);
  assertSummary(summary, "currentEffectiveMapExactCountAsserted", false);
  assertSummary(summary, "currentEffectiveMapExactCount", null);
  assertSummary(summary, "sourceDiscoveryConfirmedActionableCompetitionCount", 0);
  assertSummary(summary, "targetFamilyCount", 3);
  assertSummary(summary, "targetCompetitionCount", 6);
  assertSummary(summary, "readyForGenericValidatorPlanFamilyCount", 3);
  assertSummary(summary, "readyForGenericValidatorPlanCompetitionCount", 6);
  assertSummary(summary, "partialTemplateReviewFamilyCount", 0);
  assertSummary(summary, "missingSourceTracebackFamilyCount", 0);
  assertSummary(summary, "knownValidatorFileCount", 2);
  assertSummary(summary, "existingKnownValidatorFileCount", 2);
  assertSummary(summary, "contractConfirmedByThisPlanCount", 0);
  assertSummary(summary, "familyApplicabilityAssertedByThisPlanCount", 0);
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
    throw new Error(`Expected families ${EXPECTED_FAMILIES.join(",")}, got ${targetFamilies.join(",")}`);
  }

  if (JSON.stringify(targetSlugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error(`Expected slugs ${EXPECTED_SLUGS.join(",")}, got ${targetSlugs.join(",")}`);
  }

  const batchRows = Array.isArray(plan.batchRows) ? plan.batchRows : [];
  if (batchRows.length !== 3) throw new Error(`Expected 3 batch rows, got ${batchRows.length}`);

  const validatorEngineInspection = fileInspection(VALIDATOR_ENGINE_FILE, targetFamilies, targetSlugs);
  const stateDependentInspection = fileInspection(STATE_DEPENDENT_PLAN_FILE, targetFamilies, targetSlugs);

  if (!validatorEngineInspection.exists) throw new Error(`Missing validator engine file: ${VALIDATOR_ENGINE_FILE}`);
  if (!stateDependentInspection.exists) throw new Error(`Missing state-dependent plan file: ${STATE_DEPENDENT_PLAN_FILE}`);

  const wrapperRows = batchRows
    .sort((a, b) => a.reusableFamily.localeCompare(b.reusableFamily))
    .map((batchRow) => buildFamilyWrapperRow(batchRow, validatorEngineInspection, stateDependentInspection));

  const readyRows = wrapperRows.filter((row) =>
    row.wrapperReadiness === "ready_for_generic_source_only_validator_wrapper"
  );

  const notReadyRows = wrapperRows.filter((row) =>
    row.wrapperReadiness !== "ready_for_generic_source_only_validator_wrapper"
  );

  const materializedCompetitionRows = wrapperRows.flatMap((row) =>
    row.competitionSlugs.map((slug) => ({
      competitionSlug: slug,
      reusableFamily: row.reusableFamily,
      wrapperReadiness: row.wrapperReadiness,
      contractRolesRequired: CONTRACT_ROLES,
      fetchAllowedNow: false,
      searchAllowedNow: false,
      broadSearchAllowedNow: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false
    }))
  ).sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-generic-full-contract-batch-validator-wrapper-file",
    mode: "source_only_generic_full_contract_batch_validator_wrapper_materializer_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      fullContractCandidateBatchValidatorPlan: args.input,
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

      wrapperReadyFamilyCount: readyRows.length,
      wrapperReadyCompetitionCount: uniqueSorted(readyRows.flatMap((row) => row.competitionSlugs)).length,
      wrapperNotReadyFamilyCount: notReadyRows.length,
      materializedValidatorInputFamilyCount: wrapperRows.length,
      materializedValidatorInputCompetitionCount: materializedCompetitionRows.length,

      validatorEngineFileExists: validatorEngineInspection.exists,
      stateDependentPlanFileExists: stateDependentInspection.exists,
      validatorEngineAllTargetFamiliesPresent: validatorEngineInspection.allTargetFamiliesPresent,
      stateDependentPlanAllTargetFamiliesPresent: stateDependentInspection.allTargetFamiliesPresent,
      validatorEngineAllTargetSlugsPresent: validatorEngineInspection.allTargetSlugsPresent,
      stateDependentPlanAllTargetSlugsPresent: stateDependentInspection.allTargetSlugsPresent,

      contractConfirmedByThisWrapperCount: 0,
      familyApplicabilityAssertedByThisWrapperCount: 0,
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

      recommendedNextLane: "build_source_only_generic_validator_execution_dry_run_for_materialized_inputs"
    },
    counts: {
      byWrapperReadiness: countBy(wrapperRows.map((row) => row.wrapperReadiness)),
      byReusableFamily: countBy(wrapperRows.map((row) => row.reusableFamily)),
      byCompetitionWrapperReadiness: countBy(materializedCompetitionRows.map((row) => row.wrapperReadiness))
    },
    guardrails: [
      "This wrapper materializes one generic batch for all ready full-contract candidate families.",
      "It does not create family-specific mapper jobs.",
      "It does not run live fetch or search.",
      "It does not write canonical or production data.",
      "It does not assert active, inactive, completed, or actionable status.",
      "It does not confirm contract validity; it only materializes source-only validator inputs.",
      "Any later execution dry-run must keep fetch/search/write disabled."
    ],
    sourceFileInspections: {
      validatorEngineInspection,
      stateDependentInspection
    },
    readyRows,
    notReadyRows,
    wrapperRows,
    materializedCompetitionRows
  };

  if (output.summary.wrapperReadyFamilyCount !== 3) {
    throw new Error(`Expected 3 wrapper-ready families, got ${output.summary.wrapperReadyFamilyCount}`);
  }

  if (output.summary.wrapperReadyCompetitionCount !== 6) {
    throw new Error(`Expected 6 wrapper-ready competitions, got ${output.summary.wrapperReadyCompetitionCount}`);
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
    wrapperReadyFamilyCount: output.summary.wrapperReadyFamilyCount,
    wrapperReadyCompetitionCount: output.summary.wrapperReadyCompetitionCount,
    wrapperNotReadyFamilyCount: output.summary.wrapperNotReadyFamilyCount,
    materializedValidatorInputFamilyCount: output.summary.materializedValidatorInputFamilyCount,
    materializedValidatorInputCompetitionCount: output.summary.materializedValidatorInputCompetitionCount,
    validatorEngineFileExists: output.summary.validatorEngineFileExists,
    stateDependentPlanFileExists: output.summary.stateDependentPlanFileExists,
    validatorEngineAllTargetFamiliesPresent: output.summary.validatorEngineAllTargetFamiliesPresent,
    stateDependentPlanAllTargetFamiliesPresent: output.summary.stateDependentPlanAllTargetFamiliesPresent,
    validatorEngineAllTargetSlugsPresent: output.summary.validatorEngineAllTargetSlugsPresent,
    stateDependentPlanAllTargetSlugsPresent: output.summary.stateDependentPlanAllTargetSlugsPresent,
    contractConfirmedByThisWrapperCount: output.summary.contractConfirmedByThisWrapperCount,
    familyApplicabilityAssertedByThisWrapperCount: output.summary.familyApplicabilityAssertedByThisWrapperCount,
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
