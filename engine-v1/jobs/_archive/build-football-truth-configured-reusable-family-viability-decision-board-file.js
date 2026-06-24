#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_CONFIGURED_BOARD =
  "data/football-truth/_diagnostics/configured-reusable-family-batch-review-board-2026-06-14/configured-reusable-family-batch-review-board-2026-06-14.json";

const DEFAULT_MAPPER =
  "data/football-truth/_diagnostics/trusted-fetch-review-route-family-contract-mapper-2026-06-14/trusted-fetch-review-route-family-contract-mapper-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/configured-reusable-family-viability-decision-board-2026-06-14/configured-reusable-family-viability-decision-board-2026-06-14.json";

const BLOCKED_FAMILY = "trusted_fetch_review_route";

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    configuredBoard: DEFAULT_CONFIGURED_BOARD,
    mapper: DEFAULT_MAPPER,
    output: DEFAULT_OUTPUT
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--configured-board") args.configuredBoard = argv[++i];
    else if (arg === "--mapper") args.mapper = argv[++i];
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

function reviewRows(configuredBoard) {
  if (!Array.isArray(configuredBoard.reviewRows)) {
    throw new Error("Configured reusable family board is missing reviewRows");
  }
  return configuredBoard.reviewRows;
}

function familyDecisionForRow(row, mapperSummary) {
  if (row.reusableFamily === BLOCKED_FAMILY) {
    return {
      reusableFamily: row.reusableFamily,
      sourceReviewBatchId: row.reviewBatchId,
      competitionCount: row.competitionCount,
      competitionSlugs: row.competitionSlugs || [],
      viabilityDecision: "blocked_not_confirmed_source_traceback_required_no_validator_no_fetch_no_search_no_write",
      decisionReason: "family mapper found zero source evidence files and zero mapper candidate competitions; all target competitions were diagnostic echo only",
      mapperEvidence: {
        sourceEvidenceFileCount: mapperSummary.sourceEvidenceFileCount,
        dataEvidenceFileCount: mapperSummary.dataEvidenceFileCount,
        diagnosticEchoEvidenceFileCount: mapperSummary.diagnosticEchoEvidenceFileCount,
        sourceFullContractMapperCandidateFileCount: mapperSummary.sourceFullContractMapperCandidateFileCount,
        sourceCoreMapperCandidateFileCount: mapperSummary.sourceCoreMapperCandidateFileCount,
        diagnosticEchoOnlyCompetitionCount: mapperSummary.diagnosticEchoOnlyCompetitionCount,
        mapperCandidateCompetitionCount: mapperSummary.mapperCandidateCompetitionCount
      },
      nextAllowedAction: "source_only_upstream_source_traceback_or_skip_to_next_configured_family",
      fetchAllowedNow: false,
      searchAllowedNow: false,
      broadSearchAllowedNow: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false
    };
  }

  return {
    reusableFamily: row.reusableFamily,
    sourceReviewBatchId: row.reviewBatchId,
    competitionCount: row.competitionCount,
    competitionSlugs: row.competitionSlugs || [],
    viabilityDecision: "pending_source_only_local_mapper_review_no_fetch_no_search_no_write",
    decisionReason: "family has not yet been mapped; keep in configured family queue",
    mapperEvidence: null,
    nextAllowedAction: "build_source_only_local_mapper_for_this_family",
    fetchAllowedNow: false,
    searchAllowedNow: false,
    broadSearchAllowedNow: false,
    canonicalWriteEligibleNow: false,
    productionWrite: false
  };
}

function main() {
  const args = parseArgs(process.argv);
  const configured = readJson(args.configuredBoard);
  const mapper = readJson(args.mapper);

  const configuredSummary = configured.summary || {};
  const mapperSummary = mapper.summary || {};

  assertSummary(configuredSummary, "retainedRawMapCompetitionCount", 689);
  assertSummary(configuredSummary, "competitionCount", 689);
  assertSummary(configuredSummary, "currentEffectiveMapExactCountAsserted", false);
  assertSummary(configuredSummary, "currentEffectiveMapExactCount", null);
  assertSummary(configuredSummary, "sourceDiscoveryConfirmedActionableCompetitionCount", 0);
  assertSummary(configuredSummary, "configuredReusableFamilyApplyCompetitionCount", 31);
  assertSummary(configuredSummary, "fetchAllowedNowCount", 0);
  assertSummary(configuredSummary, "searchAllowedNowCount", 0);
  assertSummary(configuredSummary, "broadSearchAllowedNowCount", 0);
  assertSummary(configuredSummary, "zeroResultMayImplyAbsenceCount", 0);
  assertSummary(configuredSummary, "canonicalWriteEligibleNowCount", 0);
  assertSummary(configuredSummary, "activeAssertedCount", 0);
  assertSummary(configuredSummary, "inactiveAssertedCount", 0);
  assertSummary(configuredSummary, "completedAssertedCount", 0);
  assertSummary(configuredSummary, "canonicalWrites", 0);
  assertSummary(configuredSummary, "productionWrite", false);

  assertSummary(mapperSummary, "targetCompetitionCount", 23);
  assertSummary(mapperSummary, "sourceEvidenceFileCount", 0);
  assertSummary(mapperSummary, "sourceFullContractMapperCandidateFileCount", 0);
  assertSummary(mapperSummary, "sourceCoreMapperCandidateFileCount", 0);
  assertSummary(mapperSummary, "diagnosticEchoOnlyCompetitionCount", 23);
  assertSummary(mapperSummary, "mapperCandidateCompetitionCount", 0);
  assertSummary(mapperSummary, "contractConfirmedByThisMapperCount", 0);
  assertSummary(mapperSummary, "familyApplicabilityAssertedByThisMapperCount", 0);
  assertSummary(mapperSummary, "fetchAllowedNowCount", 0);
  assertSummary(mapperSummary, "searchAllowedNowCount", 0);
  assertSummary(mapperSummary, "broadSearchAllowedNowCount", 0);
  assertSummary(mapperSummary, "zeroResultMayImplyAbsenceCount", 0);
  assertSummary(mapperSummary, "canonicalWriteEligibleNowCount", 0);
  assertSummary(mapperSummary, "activeAssertedCount", 0);
  assertSummary(mapperSummary, "inactiveAssertedCount", 0);
  assertSummary(mapperSummary, "completedAssertedCount", 0);
  assertSummary(mapperSummary, "canonicalWrites", 0);
  assertSummary(mapperSummary, "productionWrite", false);

  if (mapperSummary.reusableFamily !== BLOCKED_FAMILY) {
    throw new Error(`Expected mapper for ${BLOCKED_FAMILY}, got ${mapperSummary.reusableFamily}`);
  }

  const rows = reviewRows(configured)
    .map((row) => familyDecisionForRow(row, mapperSummary))
    .sort((a, b) => {
      if (a.viabilityDecision.startsWith("pending") && b.viabilityDecision.startsWith("blocked")) return -1;
      if (a.viabilityDecision.startsWith("blocked") && b.viabilityDecision.startsWith("pending")) return 1;
      if (b.competitionCount !== a.competitionCount) return b.competitionCount - a.competitionCount;
      return a.reusableFamily.localeCompare(b.reusableFamily);
    });

  const blockedRows = rows.filter((row) => row.viabilityDecision.startsWith("blocked"));
  const pendingRows = rows.filter((row) => row.viabilityDecision.startsWith("pending"));
  const nextRecommendedFamily = pendingRows[0] || null;

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-configured-reusable-family-viability-decision-board-file",
    mode: "source_only_configured_reusable_family_viability_decision_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      configuredReusableFamilyBatchReviewBoard: args.configuredBoard,
      blockedFamilyMapper: args.mapper,
      blockedFamily: BLOCKED_FAMILY
    },
    summary: {
      retainedRawMapCompetitionCount: configuredSummary.retainedRawMapCompetitionCount,
      competitionCount: configuredSummary.competitionCount,
      currentEffectiveMapExactCountAsserted: false,
      currentEffectiveMapExactCount: null,
      sourceDiscoveryConfirmedActionableCompetitionCount: 0,

      configuredReusableFamilyApplyCompetitionCount: configuredSummary.configuredReusableFamilyApplyCompetitionCount,
      configuredReusableFamilyApplyBatchCount: configuredSummary.configuredReusableFamilyApplyBatchCount,
      blockedNotConfirmedFamilyCount: blockedRows.length,
      blockedNotConfirmedCompetitionCount: uniqueSorted(blockedRows.flatMap((row) => row.competitionSlugs)).length,
      pendingFamilyMapperReviewCount: pendingRows.length,
      pendingFamilyMapperCompetitionCount: uniqueSorted(pendingRows.flatMap((row) => row.competitionSlugs)).length,

      nextRecommendedReusableFamily: nextRecommendedFamily ? nextRecommendedFamily.reusableFamily : null,
      nextRecommendedCompetitionCount: nextRecommendedFamily ? nextRecommendedFamily.competitionCount : 0,
      nextRecommendedCompetitionSlugs: nextRecommendedFamily ? nextRecommendedFamily.competitionSlugs : [],
      nextRecommendedSourceReviewBatchId: nextRecommendedFamily ? nextRecommendedFamily.sourceReviewBatchId : null,

      contractConfirmedByThisBoardCount: 0,
      familyApplicabilityAssertedByThisBoardCount: 0,
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

      recommendedNextLane: "build_source_only_local_mapper_for_next_recommended_configured_reusable_family"
    },
    counts: {
      byViabilityDecision: countBy(rows.map((row) => row.viabilityDecision)),
      byReusableFamily: countBy(rows.map((row) => row.reusableFamily))
    },
    guardrails: [
      "This board makes only source-only viability decisions from existing mapper diagnostics.",
      "trusted_fetch_review_route is blocked/not-confirmed because there is no source-level contract evidence.",
      "Blocked/not-confirmed does not mean the competitions are absent or invalid.",
      "This board does not run fetch or search.",
      "This board does not write canonical or production data.",
      "This board does not assert active, inactive, completed, or actionable status.",
      "No match today must not imply inactive.",
      "Match status must not be used as season state."
    ],
    blockedRows,
    pendingRows,
    nextRecommendedFamily,
    decisionRows: rows
  };

  if (output.summary.blockedNotConfirmedFamilyCount !== 1) {
    throw new Error(`Expected exactly one blocked family, got ${output.summary.blockedNotConfirmedFamilyCount}`);
  }

  if (output.summary.blockedNotConfirmedCompetitionCount !== 23) {
    throw new Error(`Expected 23 blocked/not-confirmed competitions for ${BLOCKED_FAMILY}, got ${output.summary.blockedNotConfirmedCompetitionCount}`);
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
    configuredReusableFamilyApplyCompetitionCount: output.summary.configuredReusableFamilyApplyCompetitionCount,
    configuredReusableFamilyApplyBatchCount: output.summary.configuredReusableFamilyApplyBatchCount,
    blockedNotConfirmedFamilyCount: output.summary.blockedNotConfirmedFamilyCount,
    blockedNotConfirmedCompetitionCount: output.summary.blockedNotConfirmedCompetitionCount,
    pendingFamilyMapperReviewCount: output.summary.pendingFamilyMapperReviewCount,
    pendingFamilyMapperCompetitionCount: output.summary.pendingFamilyMapperCompetitionCount,
    nextRecommendedReusableFamily: output.summary.nextRecommendedReusableFamily,
    nextRecommendedCompetitionCount: output.summary.nextRecommendedCompetitionCount,
    nextRecommendedCompetitionSlugs: output.summary.nextRecommendedCompetitionSlugs,
    contractConfirmedByThisBoardCount: output.summary.contractConfirmedByThisBoardCount,
    familyApplicabilityAssertedByThisBoardCount: output.summary.familyApplicabilityAssertedByThisBoardCount,
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
