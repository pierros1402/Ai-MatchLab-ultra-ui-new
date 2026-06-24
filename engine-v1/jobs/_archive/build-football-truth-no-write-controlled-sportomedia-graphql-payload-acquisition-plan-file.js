#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULTS = {
  date: "2026-06-14",
  targetedInput: "data/football-truth/_diagnostics/no-write-sportomedia-targeted-script-payload-parser-2026-06-14/no-write-sportomedia-targeted-script-payload-parser-2026-06-14.json",
  output: "data/football-truth/_diagnostics/no-write-controlled-sportomedia-graphql-payload-acquisition-plan-2026-06-14/no-write-controlled-sportomedia-graphql-payload-acquisition-plan-2026-06-14.json"
};

const SPORTOMEDIA_SLUGS = ["swe.1", "swe.2"];

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--targeted-input") args.targetedInput = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error("Unknown argument: " + arg);
  }
  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error("Missing JSON input: " + filePath);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function assertSummary(summary, key, expected) {
  if (!(key in summary)) throw new Error("Missing summary key: " + key);
  if (summary[key] !== expected) {
    throw new Error("Guardrail failed for " + key + ": expected " + expected + ", got " + summary[key]);
  }
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value = row[key] === null || row[key] === undefined || String(row[key]).trim() === "" ? "__missing__" : String(row[key]).trim();
    counts[value] = (counts[value] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function uniqueSorted(values) {
  return [...new Set(values.filter((v) => v !== null && v !== undefined).map((v) => String(v).trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function validateTargetedParser(input) {
  const s = input.summary || {};

  assertSummary(s, "sportomediaTargetedScriptPayloadParserCompetitionCount", 2);
  assertSummary(s, "sportomediaEmbeddedStandingRowsExtractedCompetitionCount", 0);
  assertSummary(s, "sportomediaGraphqlRouteCandidateCompetitionCount", 2);
  assertSummary(s, "sportomediaDeeperPayloadShapeReviewCompetitionCount", 0);
  assertSummary(s, "totalParsedStandingRowCandidateCount", 0);
  assertSummary(s, "totalGraphqlRouteCandidateCount", 7);
  assertSummary(s, "controlledGraphqlPayloadAcquisitionCandidateCount", 2);
  assertSummary(s, "integrateEmbeddedParserCandidateCount", 0);

  assertSummary(s, "fetchExecutedNowCount", 0);
  assertSummary(s, "searchExecutedNowCount", 0);
  assertSummary(s, "broadSearchExecutedNowCount", 0);
  assertSummary(s, "classifierExecutedNowCount", 0);
  assertSummary(s, "canonicalWriteExecutedNowCount", 0);
  assertSummary(s, "productionWriteExecutedNowCount", 0);
  assertSummary(s, "activeAssertedCount", 0);
  assertSummary(s, "inactiveAssertedCount", 0);
  assertSummary(s, "completedAssertedCount", 0);
  assertSummary(s, "seasonStateTruthAssertedCount", 0);
  assertSummary(s, "parsedRowsTruthCount", 0);
  assertSummary(s, "graphqlRouteCandidatesTruthCount", 0);
  assertSummary(s, "canonicalWrites", 0);
  assertSummary(s, "productionWrite", false);
  assertSummary(s, "userHintUsedCount", 0);
  assertSummary(s, "hardcodedSeasonStateOverrideUsedCount", 0);

  const rows = Array.isArray(input.targetedRows) ? input.targetedRows : [];
  if (rows.length !== 2) throw new Error("Expected 2 targetedRows.");

  const slugs = uniqueSorted(rows.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(SPORTOMEDIA_SLUGS)) {
    throw new Error("Unexpected Sportomedia slugs: " + slugs.join(", "));
  }

  for (const row of rows) {
    if (row.targetedParserStatus !== "sportomedia_targeted_parser_found_graphql_route_candidates_needs_controlled_payload_acquisition") {
      throw new Error(row.competitionSlug + ": expected GraphQL route candidate status.");
    }
    if (row.embeddedStandingRowsExtracted !== false) throw new Error(row.competitionSlug + ": embedded rows must be false.");
    if (row.needsControlledGraphqlPayloadAcquisitionCandidate !== true) {
      throw new Error(row.competitionSlug + ": expected controlled GraphQL acquisition candidate.");
    }
    if (!Array.isArray(row.graphqlRouteCandidates) || row.graphqlRouteCandidates.length < 1) {
      throw new Error(row.competitionSlug + ": missing GraphQL route candidates.");
    }
    if (row.fetchExecutedNow !== false || row.searchExecutedNow !== false || row.broadSearchExecutedNow !== false) {
      throw new Error(row.competitionSlug + ": fetch/search flags must remain false.");
    }
    if (row.classifierExecutedNow !== false || row.canonicalWriteExecutedNow !== false || row.productionWriteExecutedNow !== false) {
      throw new Error(row.competitionSlug + ": classifier/write flags must remain false.");
    }
    if (row.activeAssertedNow !== false || row.inactiveAssertedNow !== false || row.completedAssertedNow !== false || row.seasonStateTruthAssertedNow !== false) {
      throw new Error(row.competitionSlug + ": truth assertion flags must remain false.");
    }
    if (row.userHintUsed !== false || row.hardcodedSeasonStateOverrideUsed !== false) {
      throw new Error(row.competitionSlug + ": hints/overrides must remain false.");
    }
  }

  return rows;
}

function classifyRouteCandidate(candidate) {
  const kind = String(candidate.kind || "");
  const value = String(candidate.value || "");

  if (kind === "absolute_url" && /^https:\/\//i.test(value)) return "https_absolute_url_candidate";
  if (kind === "relative_path" && value.startsWith("/")) return "relative_path_candidate";
  if (kind === "graphql_operation" || kind === "operationName") return "graphql_operation_candidate";
  return "unknown_candidate";
}

function routePriority(candidate) {
  const value = String(candidate.value || "").toLowerCase();
  const kind = String(candidate.kind || "").toLowerCase();

  let score = 0;
  if (value.includes("graphql")) score += 50;
  if (value.includes("standing") || value.includes("standings") || value.includes("table")) score += 40;
  if (value.includes("competition") || value.includes("season")) score += 15;
  if (kind.includes("operation")) score += 10;
  if (value.includes("match") || value.includes("fixture") || value.includes("result")) score -= 5;

  return score;
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  const out = [];

  for (const candidate of candidates) {
    const normalized = {
      kind: candidate.kind || "unknown",
      value: String(candidate.value || "").trim(),
      operationType: candidate.operationType || null,
      source: candidate.source || null,
      index: candidate.index ?? null,
      routeCandidateClass: classifyRouteCandidate(candidate),
      routeCandidatePriority: routePriority(candidate),
      routeCandidateIsTruth: false
    };

    if (!normalized.value) continue;

    const key = normalized.kind + "|" + normalized.value;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }

  return out.sort((a, b) => b.routeCandidatePriority - a.routeCandidatePriority || a.value.localeCompare(b.value));
}

function buildPlanRow(targetedRow) {
  const candidates = dedupeCandidates(targetedRow.graphqlRouteCandidates || []);
  const primaryCandidates = candidates.filter((candidate) => candidate.routeCandidatePriority > 0).slice(0, 6);
  const fallbackCandidates = candidates.filter((candidate) => candidate.routeCandidatePriority <= 0).slice(0, 4);

  const planStatus =
    primaryCandidates.length > 0
      ? "ready_for_no_write_controlled_sportomedia_graphql_payload_acquisition_approval_gate"
      : "blocked_no_high_confidence_graphql_payload_route_candidate";

  const blockingReasons = [];
  if (primaryCandidates.length === 0) blockingReasons.push("no_high_confidence_graphql_route_candidate");

  return {
    competitionSlug: targetedRow.competitionSlug,
    reusableFamily: targetedRow.reusableFamily,
    targetedParserStatus: targetedRow.targetedParserStatus,

    controlledGraphqlPayloadAcquisitionPlanStatus: planStatus,
    blockingReasons,

    routeCandidateCount: candidates.length,
    primaryRouteCandidateCount: primaryCandidates.length,
    fallbackRouteCandidateCount: fallbackCandidates.length,
    primaryRouteCandidates: primaryCandidates,
    fallbackRouteCandidates: fallbackCandidates,

    plannedAcquisitionScope: "sportomedia_official_standings_graphql_payload_only",
    plannedAcquisitionPurpose: "recover_row_level_standings_candidates_for_existing_sportomedia_official_standings_gap",
    plannedAllowedMethod: "controlled_configured_graphql_payload_fetch_after_explicit_approval_only",
    plannedDisallowedMethods: [
      "broad_search",
      "unscoped_search",
      "canonical_write",
      "production_write",
      "season_state_classifier",
      "truth_assertion"
    ],

    mayPrepareApprovalGate: planStatus === "ready_for_no_write_controlled_sportomedia_graphql_payload_acquisition_approval_gate",
    mayExecuteNow: false,
    mayFetchNow: false,
    maySearchNow: false,
    mayBroadSearchNow: false,
    mayClassifySeasonStateNow: false,
    mayWriteCanonicalNow: false,
    mayAssertTruthNow: false,

    fetchExecutedNow: false,
    searchExecutedNow: false,
    broadSearchExecutedNow: false,
    classifierExecutedNow: false,
    canonicalWriteExecutedNow: false,
    productionWriteExecutedNow: false,
    activeAssertedNow: false,
    inactiveAssertedNow: false,
    completedAssertedNow: false,
    seasonStateTruthAssertedNow: false,
    graphqlRouteCandidatesAreTruth: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    zeroResultDoesNotImplyAbsence: true,
    missingEmbeddedRowsDoesNotProveAbsence: true,
    noMatchTodayDoesNotImplyInactive: true,

    nextAllowedStep:
      planStatus === "ready_for_no_write_controlled_sportomedia_graphql_payload_acquisition_approval_gate"
        ? "prepare_explicit_no_write_controlled_sportomedia_graphql_payload_acquisition_approval_gate"
        : "inspect_sportomedia_graphql_route_candidates_manually_from_existing_diagnostics",
    nextBlockedStep: "controlled_graphql_payload_fetch_classifier_canonical_write_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const targeted = readJson(args.targetedInput);
  const targetedRows = validateTargetedParser(targeted);

  const planRows = targetedRows
    .map(buildPlanRow)
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const readyRows = planRows.filter((row) => row.controlledGraphqlPayloadAcquisitionPlanStatus === "ready_for_no_write_controlled_sportomedia_graphql_payload_acquisition_approval_gate");
  const blockedRows = planRows.filter((row) => row.controlledGraphqlPayloadAcquisitionPlanStatus !== "ready_for_no_write_controlled_sportomedia_graphql_payload_acquisition_approval_gate");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-no-write-controlled-sportomedia-graphql-payload-acquisition-plan-file",
    mode: "build_no_write_controlled_sportomedia_graphql_payload_acquisition_plan_no_fetch_no_search_no_classifier_no_truth_assertion_no_write",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      sportomediaTargetedScriptPayloadParser: args.targetedInput
    },
    summary: {
      controlledSportomediaGraphqlPayloadAcquisitionPlanCompetitionCount: planRows.length,
      controlledSportomediaGraphqlPayloadAcquisitionPlanReadyCount: readyRows.length,
      controlledSportomediaGraphqlPayloadAcquisitionPlanBlockedCount: blockedRows.length,

      totalRouteCandidateCount: planRows.reduce((sum, row) => sum + row.routeCandidateCount, 0),
      totalPrimaryRouteCandidateCount: planRows.reduce((sum, row) => sum + row.primaryRouteCandidateCount, 0),
      totalFallbackRouteCandidateCount: planRows.reduce((sum, row) => sum + row.fallbackRouteCandidateCount, 0),

      mayPrepareApprovalGateCount: planRows.filter((row) => row.mayPrepareApprovalGate).length,
      mayExecuteNowCount: 0,
      mayFetchNowCount: 0,
      maySearchNowCount: 0,
      mayBroadSearchNowCount: 0,
      mayClassifySeasonStateNowCount: 0,
      mayWriteCanonicalNowCount: 0,
      mayAssertTruthNowCount: 0,

      fetchExecutedNowCount: 0,
      searchExecutedNowCount: 0,
      broadSearchExecutedNowCount: 0,
      classifierExecutedNowCount: 0,
      canonicalWriteExecutedNowCount: 0,
      productionWriteExecutedNowCount: 0,
      activeAssertedCount: 0,
      inactiveAssertedCount: 0,
      completedAssertedCount: 0,
      seasonStateTruthAssertedCount: 0,
      graphqlRouteCandidatesTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        blockedRows.length === 0
          ? "prepare_explicit_no_write_controlled_sportomedia_graphql_payload_acquisition_approval_gate"
          : "inspect_sportomedia_graphql_route_candidates_manually_from_existing_diagnostics"
    },
    counts: {
      byPlanStatus: countBy(planRows, "controlledGraphqlPayloadAcquisitionPlanStatus"),
      byNextAllowedStep: countBy(planRows, "nextAllowedStep")
    },
    guardrails: [
      "This plan reads targeted Sportomedia GraphQL route candidates only.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a season-state classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "GraphQL route candidates are not truth assertions.",
      "Missing embedded rows does not prove absence.",
      "No match today must not imply inactive.",
      "Zero result must not imply absence.",
      "Passing this plan only allows a separate explicit approval gate; it does not execute controlled acquisition."
    ],
    planRows,
    blockedRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    controlledSportomediaGraphqlPayloadAcquisitionPlanCompetitionCount: output.summary.controlledSportomediaGraphqlPayloadAcquisitionPlanCompetitionCount,
    controlledSportomediaGraphqlPayloadAcquisitionPlanReadyCount: output.summary.controlledSportomediaGraphqlPayloadAcquisitionPlanReadyCount,
    controlledSportomediaGraphqlPayloadAcquisitionPlanBlockedCount: output.summary.controlledSportomediaGraphqlPayloadAcquisitionPlanBlockedCount,
    totalRouteCandidateCount: output.summary.totalRouteCandidateCount,
    totalPrimaryRouteCandidateCount: output.summary.totalPrimaryRouteCandidateCount,
    totalFallbackRouteCandidateCount: output.summary.totalFallbackRouteCandidateCount,
    mayPrepareApprovalGateCount: output.summary.mayPrepareApprovalGateCount,
    mayExecuteNowCount: output.summary.mayExecuteNowCount,
    mayFetchNowCount: output.summary.mayFetchNowCount,
    maySearchNowCount: output.summary.maySearchNowCount,
    mayBroadSearchNowCount: output.summary.mayBroadSearchNowCount,
    mayClassifySeasonStateNowCount: output.summary.mayClassifySeasonStateNowCount,
    mayWriteCanonicalNowCount: output.summary.mayWriteCanonicalNowCount,
    mayAssertTruthNowCount: output.summary.mayAssertTruthNowCount,
    fetchExecutedNowCount: output.summary.fetchExecutedNowCount,
    searchExecutedNowCount: output.summary.searchExecutedNowCount,
    broadSearchExecutedNowCount: output.summary.broadSearchExecutedNowCount,
    classifierExecutedNowCount: output.summary.classifierExecutedNowCount,
    canonicalWriteExecutedNowCount: output.summary.canonicalWriteExecutedNowCount,
    productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
    activeAssertedCount: output.summary.activeAssertedCount,
    inactiveAssertedCount: output.summary.inactiveAssertedCount,
    completedAssertedCount: output.summary.completedAssertedCount,
    seasonStateTruthAssertedCount: output.summary.seasonStateTruthAssertedCount,
    graphqlRouteCandidatesTruthCount: output.summary.graphqlRouteCandidatesTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    userHintUsedCount: output.summary.userHintUsedCount,
    hardcodedSeasonStateOverrideUsedCount: output.summary.hardcodedSeasonStateOverrideUsedCount,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
