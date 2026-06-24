#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";
const TARGET_FAMILY = "trusted_fetch_review_route";

const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/trusted-fetch-review-route-local-contract-review-2026-06-14/trusted-fetch-review-route-local-contract-review-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/trusted-fetch-review-route-family-contract-mapper-2026-06-14/trusted-fetch-review-route-family-contract-mapper-2026-06-14.json";

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

function prefixOf(slug) {
  const match = String(slug || "").match(/^([a-z]{2,3})\./i);
  return match ? match[1].toLowerCase() : "__missing_prefix__";
}

function assertSummary(summary, key, expected) {
  if (!(key in summary)) throw new Error(`Missing local review summary key: ${key}`);
  if (summary[key] !== expected) {
    throw new Error(`Local review guardrail failed: ${key} expected ${expected}, got ${summary[key]}`);
  }
}

function normalizePath(filePath) {
  return String(filePath || "").replaceAll("\\", "/");
}

function classifyPath(filePath) {
  const p = normalizePath(filePath).toLowerCase();

  if (p.includes("/_diagnostics/")) {
    if (
      p.includes("full-map") ||
      p.includes("inventory") ||
      p.includes("readiness") ||
      p.includes("batch-review") ||
      p.includes("local-contract-review") ||
      p.includes("reusable-family")
    ) {
      return "generated_planning_or_inventory_diagnostic_context";
    }

    return "generated_diagnostic_context";
  }

  if (p.startsWith("engine-v1/jobs/")) return "source_job_candidate";
  if (p.startsWith("engine-v1/lib/")) return "source_library_candidate";
  if (p.startsWith("engine-v1/src/")) return "source_runtime_candidate";
  if (p.startsWith("engine-v1/config/")) return "source_config_candidate";
  if (p.startsWith("engine-v1/_shared/")) return "source_shared_candidate";

  if (p.startsWith("data/football-truth/")) return "football_truth_data_candidate";
  if (p.startsWith("data/")) return "data_file_candidate";

  return "other_local_file_candidate";
}

function isDiagnosticClass(pathClass) {
  return pathClass === "generated_diagnostic_context" ||
    pathClass === "generated_planning_or_inventory_diagnostic_context";
}

function isSourceClass(pathClass) {
  return pathClass === "source_job_candidate" ||
    pathClass === "source_library_candidate" ||
    pathClass === "source_runtime_candidate" ||
    pathClass === "source_config_candidate" ||
    pathClass === "source_shared_candidate";
}

function isDataClass(pathClass) {
  return pathClass === "football_truth_data_candidate" ||
    pathClass === "data_file_candidate";
}

function evidenceRoles(hit) {
  const roles = [];
  if (hit.hasRouteTerms) roles.push("route");
  if (hit.hasFixtureTerms) roles.push("fixture");
  if (hit.hasStandingsTerms) roles.push("standings");
  if (hit.hasSeasonStateTerms) roles.push("season_state");
  return roles;
}

function scoreEvidenceFile(fileSummary) {
  let score = 0;

  if (fileSummary.roles.includes("route")) score += 5;
  if (fileSummary.roles.includes("fixture")) score += 4;
  if (fileSummary.roles.includes("standings")) score += 4;
  if (fileSummary.roles.includes("season_state")) score += 3;

  score += Math.min(fileSummary.totalOccurrenceCount, 25);

  if (isSourceClass(fileSummary.pathClass)) score += 12;
  if (isDataClass(fileSummary.pathClass)) score += 6;

  if (fileSummary.pathClass === "generated_diagnostic_context") score -= 6;
  if (fileSummary.pathClass === "generated_planning_or_inventory_diagnostic_context") score -= 14;

  if (fileSummary.supportedCompetitionCount >= 16) score -= 10;
  else if (fileSummary.supportedCompetitionCount >= 8) score -= 5;

  return score;
}

function classifyEvidenceFamily(fileSummary) {
  const hasCoreRoles =
    fileSummary.roles.includes("route") &&
    fileSummary.roles.includes("fixture") &&
    fileSummary.roles.includes("standings");

  const hasFullRoles = hasCoreRoles && fileSummary.roles.includes("season_state");

  if (fileSummary.pathClass === "generated_planning_or_inventory_diagnostic_context") {
    return "planning_or_inventory_echo_not_contract";
  }

  if (fileSummary.pathClass === "generated_diagnostic_context") {
    return "diagnostic_echo_needs_source_traceback";
  }

  if (isSourceClass(fileSummary.pathClass) && hasFullRoles) {
    return "source_file_full_contract_mapper_candidate_no_write";
  }

  if (isSourceClass(fileSummary.pathClass) && hasCoreRoles) {
    return "source_file_fixture_standings_mapper_candidate_needs_season_state_source_no_write";
  }

  if (isSourceClass(fileSummary.pathClass) && fileSummary.roles.includes("route")) {
    return "source_file_route_mapper_candidate_needs_contract_role_split_no_write";
  }

  if (isDataClass(fileSummary.pathClass) && hasFullRoles) {
    return "data_file_full_contract_candidate_needs_source_authority_trace_no_write";
  }

  if (isDataClass(fileSummary.pathClass) && hasCoreRoles) {
    return "data_file_fixture_standings_candidate_needs_season_state_source_no_write";
  }

  return "local_reference_candidate_not_contract";
}

function classifyCompetitionRow(row, sourceCandidateFiles, diagnosticFiles) {
  const sourceFull = sourceCandidateFiles.filter((file) =>
    file.evidenceFamilyCandidate === "source_file_full_contract_mapper_candidate_no_write"
  );

  const dataFull = sourceCandidateFiles.filter((file) =>
    file.evidenceFamilyCandidate === "data_file_full_contract_candidate_needs_source_authority_trace_no_write"
  );

  const coreSource = sourceCandidateFiles.filter((file) =>
    file.evidenceFamilyCandidate === "source_file_fixture_standings_mapper_candidate_needs_season_state_source_no_write" ||
    file.evidenceFamilyCandidate === "source_file_route_mapper_candidate_needs_contract_role_split_no_write"
  );

  if (sourceFull.length > 0) {
    return "source_full_contract_mapper_candidate_needs_human_contract_validation_no_write";
  }

  if (dataFull.length > 0 && coreSource.length > 0) {
    return "source_plus_data_contract_candidate_needs_authority_trace_no_write";
  }

  if (coreSource.length > 0) {
    return "source_core_route_candidate_needs_fixture_standings_season_state_mapping_no_write";
  }

  if (dataFull.length > 0) {
    return "data_only_full_candidate_needs_source_traceback_no_write";
  }

  if (diagnosticFiles.length > 0) {
    return "diagnostic_echo_only_needs_upstream_source_traceback_no_write";
  }

  return "no_mapper_candidate_after_noise_filter_no_write";
}

function compactFile(fileSummary) {
  return {
    path: fileSummary.path,
    pathClass: fileSummary.pathClass,
    evidenceFamilyCandidate: fileSummary.evidenceFamilyCandidate,
    evidenceScore: fileSummary.evidenceScore,
    supportedCompetitionCount: fileSummary.supportedCompetitionCount,
    supportedCompetitionSlugs: fileSummary.supportedCompetitionSlugs,
    roles: fileSummary.roles,
    totalOccurrenceCount: fileSummary.totalOccurrenceCount
  };
}

function main() {
  const args = parseArgs(process.argv);
  const localReview = readJson(args.input);
  const summary = localReview.summary || {};

  assertSummary(summary, "retainedRawMapCompetitionCount", 689);
  assertSummary(summary, "competitionCount", 689);
  assertSummary(summary, "currentEffectiveMapExactCountAsserted", false);
  assertSummary(summary, "currentEffectiveMapExactCount", null);
  assertSummary(summary, "sourceDiscoveryConfirmedActionableCompetitionCount", 0);
  assertSummary(summary, "targetCompetitionCount", 23);
  assertSummary(summary, "contractConfirmedByThisBoardCount", 0);
  assertSummary(summary, "familyApplicabilityAssertedByThisBoardCount", 0);
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

  if (summary.reusableFamily !== TARGET_FAMILY) {
    throw new Error(`Expected reusable family ${TARGET_FAMILY}, got ${summary.reusableFamily}`);
  }

  const sourceRows = Array.isArray(localReview.reviewRows) ? localReview.reviewRows : [];
  const targetSlugs = uniqueSorted(sourceRows.map((row) => row.competitionSlug));

  if (targetSlugs.length !== 23) {
    throw new Error(`Expected 23 review rows, got ${targetSlugs.length}`);
  }

  const fileMap = new Map();

  for (const row of sourceRows) {
    const slug = String(row.competitionSlug || "").trim();
    const hits = Array.isArray(row.topLocalEvidenceFiles) ? row.topLocalEvidenceFiles : [];

    for (const hit of hits) {
      const filePath = normalizePath(hit.path);
      if (!filePath) continue;

      if (!fileMap.has(filePath)) {
        fileMap.set(filePath, {
          path: filePath,
          pathClass: classifyPath(filePath),
          supportedCompetitionSlugs: [],
          rolesSet: new Set(),
          totalOccurrenceCount: 0,
          perCompetition: []
        });
      }

      const fileSummary = fileMap.get(filePath);
      fileSummary.supportedCompetitionSlugs.push(slug);
      fileSummary.totalOccurrenceCount += Number(hit.occurrenceCount || 0);

      for (const role of evidenceRoles(hit)) {
        fileSummary.rolesSet.add(role);
      }

      fileSummary.perCompetition.push({
        competitionSlug: slug,
        occurrenceCount: Number(hit.occurrenceCount || 0),
        roles: evidenceRoles(hit),
        matchedTermGroups: hit.matchedTermGroups || {}
      });
    }
  }

  const fileSummaries = [...fileMap.values()]
    .map((fileSummary) => {
      const normalized = {
        path: fileSummary.path,
        pathClass: fileSummary.pathClass,
        supportedCompetitionSlugs: uniqueSorted(fileSummary.supportedCompetitionSlugs),
        roles: [...fileSummary.rolesSet].sort(),
        totalOccurrenceCount: fileSummary.totalOccurrenceCount,
        perCompetition: fileSummary.perCompetition
      };

      normalized.supportedCompetitionCount = normalized.supportedCompetitionSlugs.length;
      normalized.evidenceFamilyCandidate = classifyEvidenceFamily(normalized);
      normalized.evidenceScore = scoreEvidenceFile(normalized);
      return normalized;
    })
    .sort((a, b) => {
      if (b.evidenceScore !== a.evidenceScore) return b.evidenceScore - a.evidenceScore;
      if (b.supportedCompetitionCount !== a.supportedCompetitionCount) return b.supportedCompetitionCount - a.supportedCompetitionCount;
      return a.path.localeCompare(b.path);
    });

  const competitionRows = sourceRows.map((row) => {
    const slug = String(row.competitionSlug || "").trim();

    const filesForSlug = fileSummaries
      .filter((file) => file.supportedCompetitionSlugs.includes(slug))
      .sort((a, b) => {
        if (b.evidenceScore !== a.evidenceScore) return b.evidenceScore - a.evidenceScore;
        return a.path.localeCompare(b.path);
      });

    const sourceCandidateFiles = filesForSlug.filter((file) =>
      isSourceClass(file.pathClass) || isDataClass(file.pathClass)
    );

    const diagnosticFiles = filesForSlug.filter((file) => isDiagnosticClass(file.pathClass));

    const mapperCandidateClass = classifyCompetitionRow(row, sourceCandidateFiles, diagnosticFiles);

    return {
      competitionSlug: slug,
      slugPrefix: prefixOf(slug),
      reusableFamily: TARGET_FAMILY,
      inputLocalContractShapeCandidate: row.localContractShapeCandidate,
      mapperCandidateClass,
      sourceCandidateFileCount: sourceCandidateFiles.length,
      diagnosticContextFileCount: diagnosticFiles.length,
      planningOrInventoryEchoFileCount: filesForSlug.filter((file) =>
        file.pathClass === "generated_planning_or_inventory_diagnostic_context"
      ).length,
      topSourceCandidateFiles: sourceCandidateFiles.slice(0, 8).map(compactFile),
      topDiagnosticContextFiles: diagnosticFiles.slice(0, 5).map(compactFile),
      contractConfirmedByThisMapper: false,
      familyApplicabilityAssertedByThisMapper: false,
      fetchAllowedNow: false,
      searchAllowedNow: false,
      broadSearchAllowedNow: false,
      canonicalWriteEligibleNow: false,
      activeAssertedByThisMapper: false,
      inactiveAssertedByThisMapper: false,
      completedAssertedByThisMapper: false
    };
  }).sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const reusableEvidenceFamilyRows = fileSummaries.map((fileSummary) => ({
    path: fileSummary.path,
    pathClass: fileSummary.pathClass,
    evidenceFamilyCandidate: fileSummary.evidenceFamilyCandidate,
    evidenceScore: fileSummary.evidenceScore,
    supportedCompetitionCount: fileSummary.supportedCompetitionCount,
    supportedCompetitionSlugs: fileSummary.supportedCompetitionSlugs,
    roles: fileSummary.roles,
    totalOccurrenceCount: fileSummary.totalOccurrenceCount,
    contractConfirmedByThisMapper: false,
    familyApplicabilityAssertedByThisMapper: false,
    fetchAllowedNow: false,
    searchAllowedNow: false,
    broadSearchAllowedNow: false,
    canonicalWriteEligibleNow: false
  }));

  const topNonDiagnosticEvidenceFamilies = reusableEvidenceFamilyRows
    .filter((row) => !isDiagnosticClass(row.pathClass))
    .slice(0, 30);

  const topDiagnosticEchoFamilies = reusableEvidenceFamilyRows
    .filter((row) => isDiagnosticClass(row.pathClass))
    .slice(0, 30);

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-trusted-fetch-review-route-family-contract-mapper-file",
    mode: "source_only_family_contract_mapper_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      trustedFetchReviewRouteLocalContractReview: args.input,
      sourceJob: localReview.job || null,
      reusableFamily: TARGET_FAMILY
    },
    summary: {
      retainedRawMapCompetitionCount: summary.retainedRawMapCompetitionCount,
      competitionCount: summary.competitionCount,
      currentEffectiveMapExactCountAsserted: false,
      currentEffectiveMapExactCount: null,
      sourceDiscoveryConfirmedActionableCompetitionCount: 0,

      reusableFamily: TARGET_FAMILY,
      targetCompetitionCount: targetSlugs.length,
      inputLocalThreeSignalCandidateCompetitionCount: summary.localThreeSignalCandidateCompetitionCount,

      mappedEvidenceFileCount: reusableEvidenceFamilyRows.length,
      nonDiagnosticEvidenceFileCount: reusableEvidenceFamilyRows.filter((row) => !isDiagnosticClass(row.pathClass)).length,
      sourceEvidenceFileCount: reusableEvidenceFamilyRows.filter((row) => isSourceClass(row.pathClass)).length,
      dataEvidenceFileCount: reusableEvidenceFamilyRows.filter((row) => isDataClass(row.pathClass)).length,
      diagnosticEchoEvidenceFileCount: reusableEvidenceFamilyRows.filter((row) => isDiagnosticClass(row.pathClass)).length,

      sourceFullContractMapperCandidateFileCount: reusableEvidenceFamilyRows.filter((row) =>
        row.evidenceFamilyCandidate === "source_file_full_contract_mapper_candidate_no_write"
      ).length,
      sourceCoreMapperCandidateFileCount: reusableEvidenceFamilyRows.filter((row) =>
        row.evidenceFamilyCandidate === "source_file_fixture_standings_mapper_candidate_needs_season_state_source_no_write" ||
        row.evidenceFamilyCandidate === "source_file_route_mapper_candidate_needs_contract_role_split_no_write"
      ).length,
      diagnosticEchoOnlyCompetitionCount: competitionRows.filter((row) =>
        row.mapperCandidateClass === "diagnostic_echo_only_needs_upstream_source_traceback_no_write"
      ).length,
      mapperCandidateCompetitionCount: competitionRows.filter((row) =>
        row.mapperCandidateClass !== "diagnostic_echo_only_needs_upstream_source_traceback_no_write" &&
        row.mapperCandidateClass !== "no_mapper_candidate_after_noise_filter_no_write"
      ).length,

      contractConfirmedByThisMapperCount: 0,
      familyApplicabilityAssertedByThisMapperCount: 0,
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

      recommendedNextLane: "inspect_top_non_diagnostic_evidence_families_then_build_scoped_reusable_contract_validator"
    },
    counts: {
      byMapperCandidateClass: countBy(competitionRows.map((row) => row.mapperCandidateClass)),
      byPathClass: countBy(reusableEvidenceFamilyRows.map((row) => row.pathClass)),
      byEvidenceFamilyCandidate: countBy(reusableEvidenceFamilyRows.map((row) => row.evidenceFamilyCandidate)),
      bySlugPrefix: countBy(competitionRows.map((row) => row.slugPrefix))
    },
    guardrails: [
      "This mapper only reorganizes local evidence candidates from the local contract review.",
      "It does not run live fetch.",
      "It does not run search.",
      "It does not write canonical or production data.",
      "It does not confirm family applicability.",
      "It does not validate route, fixture, standings, or season-state contracts.",
      "It separates diagnostic/planning echoes from source/data candidates.",
      "No match today must not imply inactive.",
      "Match status must not be used as season state.",
      "Any later validator must remain scoped and source-only unless an explicit fetch/search lane is approved separately."
    ],
    targetCompetitionSlugs: targetSlugs,
    topNonDiagnosticEvidenceFamilies,
    topDiagnosticEchoFamilies,
    competitionRows,
    reusableEvidenceFamilyRows
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
    reusableFamily: output.summary.reusableFamily,
    targetCompetitionCount: output.summary.targetCompetitionCount,
    inputLocalThreeSignalCandidateCompetitionCount: output.summary.inputLocalThreeSignalCandidateCompetitionCount,
    mappedEvidenceFileCount: output.summary.mappedEvidenceFileCount,
    nonDiagnosticEvidenceFileCount: output.summary.nonDiagnosticEvidenceFileCount,
    sourceEvidenceFileCount: output.summary.sourceEvidenceFileCount,
    dataEvidenceFileCount: output.summary.dataEvidenceFileCount,
    diagnosticEchoEvidenceFileCount: output.summary.diagnosticEchoEvidenceFileCount,
    sourceFullContractMapperCandidateFileCount: output.summary.sourceFullContractMapperCandidateFileCount,
    sourceCoreMapperCandidateFileCount: output.summary.sourceCoreMapperCandidateFileCount,
    diagnosticEchoOnlyCompetitionCount: output.summary.diagnosticEchoOnlyCompetitionCount,
    mapperCandidateCompetitionCount: output.summary.mapperCandidateCompetitionCount,
    contractConfirmedByThisMapperCount: output.summary.contractConfirmedByThisMapperCount,
    familyApplicabilityAssertedByThisMapperCount: output.summary.familyApplicabilityAssertedByThisMapperCount,
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
