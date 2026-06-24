#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/configured-family-acceleration-board-2026-06-14/configured-family-acceleration-board-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/full-contract-candidate-batch-validator-plan-2026-06-14/full-contract-candidate-batch-validator-plan-2026-06-14.json";

const TARGET_BATCH_LANE = "full_contract_candidate_batch_validator_source_only";

const KNOWN_VALIDATOR_FILES = [
  "engine-v1/jobs/build-football-truth-reusable-adapter-family-contract-validator-engine-file.js",
  "engine-v1/jobs/build-football-truth-reusable-state-dependent-contract-validator-plan-file.js"
];

const REQUIRED_FAMILIES = ["laliga", "norway_ntf", "sportomedia"];
const REQUIRED_SLUGS = ["esp.1", "esp.2", "nor.1", "nor.2", "swe.1", "swe.2"];

const ROLE_TERMS = {
  route: ["route", "official", "provider", "adapter", "selector", "endpoint", "sourceurl", "source_url"],
  fixture: ["fixture", "fixtures", "match", "matches", "result", "results", "kickoff", "kick_off"],
  standings: ["standing", "standings", "table", "rank", "position", "played", "points", "pts"],
  seasonState: ["seasonstate", "season_state", "season-state", "active", "completed", "inactive", "restart", "startdate", "start_date"],
  validator: ["validator", "contract", "normalized", "normalizer", "evidence"]
};

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

function textHits(lower, terms) {
  return terms.filter((term) => lower.includes(String(term).toLowerCase()));
}

function roleHitsFor(lower) {
  const hits = {};
  for (const [role, terms] of Object.entries(ROLE_TERMS)) {
    hits[role] = textHits(lower, terms);
  }
  return hits;
}

function rolesFromHits(roleHits) {
  return Object.entries(roleHits)
    .filter(([, terms]) => terms.length > 0)
    .map(([role]) => role)
    .sort();
}

function inspectValidatorFiles(familyRows) {
  return KNOWN_VALIDATOR_FILES.map((filePath) => {
    const exists = fs.existsSync(filePath);
    const content = exists ? fs.readFileSync(filePath, "utf8") : "";
    const lower = content.toLowerCase();

    const familyHits = familyRows.map((familyRow) => {
      const family = familyRow.reusableFamily;
      const slugs = familyRow.competitionSlugs || [];
      const familyTerms = [family, ...slugs];

      const familyTermHits = textHits(lower, familyTerms);
      const roleHits = roleHitsFor(lower);

      return {
        reusableFamily: family,
        competitionSlugs: slugs,
        familyTermHits,
        familyTermHitCount: familyTermHits.length,
        roles: rolesFromHits(roleHits),
        roleHits,
        appearsInFile: familyTermHits.length > 0
      };
    });

    return {
      path: filePath,
      exists,
      sizeBytes: exists ? fs.statSync(filePath).size : 0,
      familyHitCount: familyHits.filter((hit) => hit.appearsInFile).length,
      familiesAppearing: uniqueSorted(familyHits.filter((hit) => hit.appearsInFile).map((hit) => hit.reusableFamily)),
      familyHits
    };
  });
}

function classifyFamilyReadiness(familyRow, validatorFileInspections) {
  const family = familyRow.reusableFamily;
  const slugs = familyRow.competitionSlugs || [];

  const matchingValidatorFiles = validatorFileInspections.filter((file) =>
    file.familyHits.some((hit) => hit.reusableFamily === family && hit.appearsInFile)
  );

  const roles = uniqueSorted(
    matchingValidatorFiles.flatMap((file) =>
      file.familyHits
        .filter((hit) => hit.reusableFamily === family && hit.appearsInFile)
        .flatMap((hit) => hit.roles)
    )
  );

  const hasCoreRoles =
    roles.includes("route") &&
    roles.includes("fixture") &&
    roles.includes("standings") &&
    roles.includes("seasonState") &&
    roles.includes("validator");

  if (matchingValidatorFiles.length > 0 && hasCoreRoles) {
    return {
      readinessClass: "generic_validator_engine_family_candidate_ready_for_source_only_batch_validation_plan",
      readinessReason: "family and competition slugs appear in known generic validator source files with route, fixture, standings, season-state, and validator roles",
      matchingValidatorFileCount: matchingValidatorFiles.length,
      rolesFound: roles
    };
  }

  if (matchingValidatorFiles.length > 0) {
    return {
      readinessClass: "generic_validator_engine_family_candidate_partial_roles_needs_template_review",
      readinessReason: "family appears in known validator source files but role coverage is incomplete",
      matchingValidatorFileCount: matchingValidatorFiles.length,
      rolesFound: roles
    };
  }

  return {
    readinessClass: "generic_validator_engine_family_not_found_needs_source_traceback",
    readinessReason: "family was accelerated by broad source scan but not found in known generic validator source files",
    matchingValidatorFileCount: 0,
    rolesFound: roles
  };
}

function main() {
  const args = parseArgs(process.argv);
  const acceleration = readJson(args.input);
  const summary = acceleration.summary || {};

  assertSummary(summary, "retainedRawMapCompetitionCount", 689);
  assertSummary(summary, "competitionCount", 689);
  assertSummary(summary, "currentEffectiveMapExactCountAsserted", false);
  assertSummary(summary, "currentEffectiveMapExactCount", null);
  assertSummary(summary, "sourceDiscoveryConfirmedActionableCompetitionCount", 0);
  assertSummary(summary, "configuredReusableFamilyApplyCompetitionCount", 31);
  assertSummary(summary, "configuredReusableFamilyApplyBatchCount", 5);
  assertSummary(summary, "blockedNotConfirmedFamilyCount", 1);
  assertSummary(summary, "blockedNotConfirmedCompetitionCount", 23);
  assertSummary(summary, "executableCandidateFamilyCount", 4);
  assertSummary(summary, "executableCandidateCompetitionCount", 8);
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

  const familyRows = Array.isArray(acceleration.familyRows) ? acceleration.familyRows : [];
  const targetRows = familyRows
    .filter((row) => row.batchLane === TARGET_BATCH_LANE)
    .sort((a, b) => a.reusableFamily.localeCompare(b.reusableFamily));

  const targetFamilies = uniqueSorted(targetRows.map((row) => row.reusableFamily));
  const targetSlugs = uniqueSorted(targetRows.flatMap((row) => row.competitionSlugs || []));

  if (JSON.stringify(targetFamilies) !== JSON.stringify(REQUIRED_FAMILIES)) {
    throw new Error(`Expected target families ${REQUIRED_FAMILIES.join(",")}, got ${targetFamilies.join(",")}`);
  }

  if (JSON.stringify(targetSlugs) !== JSON.stringify(REQUIRED_SLUGS)) {
    throw new Error(`Expected target slugs ${REQUIRED_SLUGS.join(",")}, got ${targetSlugs.join(",")}`);
  }

  const validatorFileInspections = inspectValidatorFiles(targetRows);

  const batchRows = targetRows.map((familyRow) => {
    const readiness = classifyFamilyReadiness(familyRow, validatorFileInspections);

    return {
      reusableFamily: familyRow.reusableFamily,
      competitionCount: familyRow.competitionCount,
      competitionSlugs: familyRow.competitionSlugs || [],
      sourceAccelerationDecision: familyRow.accelerationDecision,
      sourceBatchLane: familyRow.batchLane,
      readinessClass: readiness.readinessClass,
      readinessReason: readiness.readinessReason,
      matchingValidatorFileCount: readiness.matchingValidatorFileCount,
      rolesFoundInKnownValidatorFiles: readiness.rolesFound,
      plannedValidatorMode: "source_only_existing_generic_validator_plan_no_fetch_no_search_no_write",
      validationTarget: {
        routeContract: true,
        fixtureContract: true,
        standingsContract: true,
        seasonStateContract: true,
        canonicalPromotion: false,
        productionWrite: false
      },
      fetchAllowedNow: false,
      searchAllowedNow: false,
      broadSearchAllowedNow: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false
    };
  });

  const readyRows = batchRows.filter((row) =>
    row.readinessClass === "generic_validator_engine_family_candidate_ready_for_source_only_batch_validation_plan"
  );

  const partialRows = batchRows.filter((row) =>
    row.readinessClass === "generic_validator_engine_family_candidate_partial_roles_needs_template_review"
  );

  const missingRows = batchRows.filter((row) =>
    row.readinessClass === "generic_validator_engine_family_not_found_needs_source_traceback"
  );

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-full-contract-candidate-batch-validator-plan-file",
    mode: "source_only_generic_full_contract_candidate_batch_validator_plan_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      accelerationBoard: args.input,
      targetBatchLane: TARGET_BATCH_LANE,
      knownValidatorFiles: KNOWN_VALIDATOR_FILES
    },
    summary: {
      retainedRawMapCompetitionCount: summary.retainedRawMapCompetitionCount,
      competitionCount: summary.competitionCount,
      currentEffectiveMapExactCountAsserted: false,
      currentEffectiveMapExactCount: null,
      sourceDiscoveryConfirmedActionableCompetitionCount: 0,

      targetBatchLane: TARGET_BATCH_LANE,
      targetFamilyCount: targetRows.length,
      targetCompetitionCount: targetSlugs.length,
      targetFamilies,
      targetCompetitionSlugs: targetSlugs,

      readyForGenericValidatorPlanFamilyCount: readyRows.length,
      readyForGenericValidatorPlanCompetitionCount: uniqueSorted(readyRows.flatMap((row) => row.competitionSlugs)).length,
      partialTemplateReviewFamilyCount: partialRows.length,
      missingSourceTracebackFamilyCount: missingRows.length,

      knownValidatorFileCount: validatorFileInspections.length,
      existingKnownValidatorFileCount: validatorFileInspections.filter((file) => file.exists).length,
      validatorFileFamilyHitCount: validatorFileInspections.reduce((sum, file) => sum + file.familyHitCount, 0),

      contractConfirmedByThisPlanCount: 0,
      familyApplicabilityAssertedByThisPlanCount: 0,
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

      recommendedNextLane: "run_or_wrap_existing_generic_reusable_validator_engine_for_ready_families_source_only"
    },
    counts: {
      byReadinessClass: countBy(batchRows.map((row) => row.readinessClass)),
      byReusableFamily: countBy(batchRows.map((row) => row.reusableFamily))
    },
    guardrails: [
      "This is a batch validator plan, not a family mapper.",
      "It targets all full-contract candidate configured families together.",
      "It inspects known generic validator source files only.",
      "It does not run live fetch or search.",
      "It does not write canonical or production data.",
      "It does not confirm family applicability or contract validity.",
      "It does not assert active, inactive, completed, or actionable status.",
      "Any later validator execution must remain source-only unless a separate explicit fetch/search lane is approved."
    ],
    validatorFileInspections,
    readyRows,
    partialRows,
    missingRows,
    batchRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    retainedRawMapCompetitionCount: output.summary.retainedRawMapCompetitionCount,
    competitionCount: output.summary.competitionCount,
    currentEffectiveMapExactCountAsserted: output.summary.currentEffectiveMapExactCountAsserted,
    currentEffectiveMapExactCount: output.summary.currentEffectiveMapExactCount,
    sourceDiscoveryConfirmedActionableCompetitionCount: output.summary.sourceDiscoveryConfirmedActionableCompetitionCount,
    targetBatchLane: output.summary.targetBatchLane,
    targetFamilyCount: output.summary.targetFamilyCount,
    targetCompetitionCount: output.summary.targetCompetitionCount,
    targetFamilies: output.summary.targetFamilies,
    targetCompetitionSlugs: output.summary.targetCompetitionSlugs,
    readyForGenericValidatorPlanFamilyCount: output.summary.readyForGenericValidatorPlanFamilyCount,
    readyForGenericValidatorPlanCompetitionCount: output.summary.readyForGenericValidatorPlanCompetitionCount,
    partialTemplateReviewFamilyCount: output.summary.partialTemplateReviewFamilyCount,
    missingSourceTracebackFamilyCount: output.summary.missingSourceTracebackFamilyCount,
    knownValidatorFileCount: output.summary.knownValidatorFileCount,
    existingKnownValidatorFileCount: output.summary.existingKnownValidatorFileCount,
    validatorFileFamilyHitCount: output.summary.validatorFileFamilyHitCount,
    contractConfirmedByThisPlanCount: output.summary.contractConfirmedByThisPlanCount,
    familyApplicabilityAssertedByThisPlanCount: output.summary.familyApplicabilityAssertedByThisPlanCount,
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
