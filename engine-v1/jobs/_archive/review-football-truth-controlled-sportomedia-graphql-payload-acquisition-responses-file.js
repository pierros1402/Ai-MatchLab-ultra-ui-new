#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULTS = {
  date: "2026-06-14",
  runInput: "data/football-truth/_diagnostics/controlled-sportomedia-graphql-payload-acquisition-execution-run-2026-06-14/controlled-sportomedia-graphql-payload-acquisition-execution-run-2026-06-14.json",
  targetedInput: "data/football-truth/_diagnostics/no-write-sportomedia-targeted-script-payload-parser-2026-06-14/no-write-sportomedia-targeted-script-payload-parser-2026-06-14.json",
  output: "data/football-truth/_diagnostics/controlled-sportomedia-graphql-payload-acquisition-response-review-2026-06-14/controlled-sportomedia-graphql-payload-acquisition-response-review-2026-06-14.json"
};

const EXPECTED_SLUGS = ["swe.1", "swe.2"];

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--run-input") args.runInput = argv[++i];
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

function uniqueSorted(values) {
  return [...new Set(values.filter((v) => v !== null && v !== undefined).map((v) => String(v).trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value = row[key] === null || row[key] === undefined || String(row[key]).trim() === "" ? "__missing__" : String(row[key]).trim();
    counts[value] = (counts[value] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function safeJsonParse(text) {
  try {
    return JSON.parse(String(text || ""));
  } catch {
    return null;
  }
}

function validateRun(input) {
  const s = input.summary || {};

  assertSummary(s, "controlledSportomediaGraphqlPayloadAcquisitionExecutionCompetitionCount", 2);
  assertSummary(s, "controlledPayloadAcquisitionExecutedCount", 2);
  assertSummary(s, "configuredGraphqlPayloadFetchExecutedCount", 2);
  assertSummary(s, "fetchedOkCount", 2);
  assertSummary(s, "httpNotOkCount", 0);
  assertSummary(s, "fetchErrorCount", 0);
  assertSummary(s, "totalResponseRawTextLength", 178);
  assertSummary(s, "jsonContentTypeCount", 2);
  assertSummary(s, "graphqlKeywordResponseCount", 2);
  assertSummary(s, "standingKeywordResponseCount", 0);
  assertSummary(s, "fetchExecutedNowCount", 2);

  assertSummary(s, "searchExecutedNowCount", 0);
  assertSummary(s, "broadSearchExecutedNowCount", 0);
  assertSummary(s, "classifierExecutedNowCount", 0);
  assertSummary(s, "canonicalWriteExecutedNowCount", 0);
  assertSummary(s, "productionWriteExecutedNowCount", 0);
  assertSummary(s, "activeAssertedCount", 0);
  assertSummary(s, "inactiveAssertedCount", 0);
  assertSummary(s, "completedAssertedCount", 0);
  assertSummary(s, "seasonStateTruthAssertedCount", 0);
  assertSummary(s, "payloadTruthCount", 0);
  assertSummary(s, "canonicalWrites", 0);
  assertSummary(s, "productionWrite", false);
  assertSummary(s, "userHintUsedCount", 0);
  assertSummary(s, "hardcodedSeasonStateOverrideUsedCount", 0);

  const rows = Array.isArray(input.acquisitionRows) ? input.acquisitionRows : [];
  if (rows.length !== 2) throw new Error("Expected 2 acquisitionRows.");

  const slugs = uniqueSorted(rows.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Unexpected acquisition slugs: " + slugs.join(", "));
  }

  return rows;
}

function validateTargeted(input) {
  const s = input.summary || {};
  assertSummary(s, "sportomediaTargetedScriptPayloadParserCompetitionCount", 2);
  assertSummary(s, "sportomediaEmbeddedStandingRowsExtractedCompetitionCount", 0);
  assertSummary(s, "sportomediaGraphqlRouteCandidateCompetitionCount", 2);
  assertSummary(s, "totalGraphqlRouteCandidateCount", 7);
  assertSummary(s, "controlledGraphqlPayloadAcquisitionCandidateCount", 2);
  assertSummary(s, "fetchExecutedNowCount", 0);
  assertSummary(s, "searchExecutedNowCount", 0);
  assertSummary(s, "broadSearchExecutedNowCount", 0);
  assertSummary(s, "classifierExecutedNowCount", 0);
  assertSummary(s, "canonicalWriteExecutedNowCount", 0);
  assertSummary(s, "productionWriteExecutedNowCount", 0);
  assertSummary(s, "graphqlRouteCandidatesTruthCount", 0);

  const rows = Array.isArray(input.targetedRows) ? input.targetedRows : [];
  if (rows.length !== 2) throw new Error("Expected 2 targetedRows.");
  return rows;
}

function responseText(row) {
  return String(row?.response?.rawTextPreview || "");
}

function classifyResponse(row) {
  const response = row.response || {};
  const text = responseText(row);
  const parsed = safeJsonParse(text);
  const normalizedText = text.toLowerCase();

  if (response.fetchStatus !== "fetched_ok") return "controlled_graphql_payload_fetch_not_ok_needs_fetch_status_review";
  if (response.rawTextLength <= 120 && response.hasJsonContentType && response.hasGraphqlKeyword && !response.hasStandingKeyword) {
    return "graphql_endpoint_reachable_but_query_or_operation_payload_missing";
  }
  if (response.hasStandingKeyword && response.rawTextLength > 500) return "graphql_payload_response_has_standings_candidate_needs_parser";
  if (parsed && parsed.errors && !parsed.data) return "graphql_error_response_needs_query_body_recovery";
  if (normalizedText.includes("must provide query") || normalizedText.includes("query") && normalizedText.includes("missing")) {
    return "graphql_missing_query_response_needs_post_body_recovery";
  }
  return "graphql_payload_response_needs_manual_review";
}

function extractResponseSignals(row) {
  const text = responseText(row);
  const parsed = safeJsonParse(text);
  const signals = [];

  if (parsed && typeof parsed === "object") {
    if (Array.isArray(parsed.errors)) {
      for (const error of parsed.errors.slice(0, 5)) {
        signals.push({
          kind: "graphql_error",
          message: String(error?.message || "").slice(0, 500),
          code: error?.extensions?.code || null
        });
      }
    }
    if (parsed.data) {
      signals.push({ kind: "graphql_data_key_present", message: "data key present" });
    }
    for (const key of Object.keys(parsed).slice(0, 10)) {
      signals.push({ kind: "json_top_level_key", message: key });
    }
  } else if (text) {
    signals.push({ kind: "raw_text_preview", message: text.slice(0, 500) });
  }

  return signals;
}

function buildReviewRow(acquisitionRow, targetedRow) {
  const status = classifyResponse(acquisitionRow);
  const response = acquisitionRow.response || {};
  const routeCandidates = Array.isArray(targetedRow?.graphqlRouteCandidates) ? targetedRow.graphqlRouteCandidates : [];

  const queryBodyRecoveryNeeded = [
    "graphql_endpoint_reachable_but_query_or_operation_payload_missing",
    "graphql_error_response_needs_query_body_recovery",
    "graphql_missing_query_response_needs_post_body_recovery"
  ].includes(status);

  const parserReady = status === "graphql_payload_response_has_standings_candidate_needs_parser";

  return {
    competitionSlug: acquisitionRow.competitionSlug,
    reusableFamily: acquisitionRow.reusableFamily,
    responseReviewStatus: status,

    fetchStatus: response.fetchStatus,
    httpStatus: response.status,
    contentType: response.contentType,
    rawTextLength: response.rawTextLength,
    rawTextSha256: response.rawTextSha256,
    responsePreview: response.rawTextPreview,
    hasJsonContentType: response.hasJsonContentType,
    hasGraphqlKeyword: response.hasGraphqlKeyword,
    hasStandingKeyword: response.hasStandingKeyword,
    resolvedFetchUrl: acquisitionRow.resolvedFetchUrl,

    responseSignals: extractResponseSignals(acquisitionRow),

    existingGraphqlRouteCandidateCount: routeCandidates.length,
    queryBodyRecoveryNeeded,
    payloadParserReadyNow: parserReady,
    endpointReachableButInsufficientPayload: queryBodyRecoveryNeeded,

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
    responseReviewIsTruth: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    zeroResultDoesNotImplyAbsence: true,
    missingStandingKeywordDoesNotProveAbsence: true,
    noMatchTodayDoesNotImplyInactive: true,

    nextAllowedStep:
      parserReady
        ? "build_no_write_sportomedia_graphql_payload_standings_parser"
        : queryBodyRecoveryNeeded
          ? "build_no_write_sportomedia_graphql_query_body_recovery_plan_from_existing_fragments"
          : "inspect_controlled_sportomedia_graphql_response_shape_deeper",
    nextBlockedStep: "classifier_canonical_write_production_write_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);

  const run = readJson(args.runInput);
  const acquisitionRows = validateRun(run);

  const targeted = readJson(args.targetedInput);
  const targetedRows = validateTargeted(targeted);

  const reviewRows = acquisitionRows
    .map((row) => {
      const targetedRow = targetedRows.find((target) => target.competitionSlug === row.competitionSlug);
      if (!targetedRow) throw new Error(row.competitionSlug + ": missing targeted parser row.");
      return buildReviewRow(row, targetedRow);
    })
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const parserReadyRows = reviewRows.filter((row) => row.payloadParserReadyNow);
  const queryBodyRecoveryRows = reviewRows.filter((row) => row.queryBodyRecoveryNeeded);
  const endpointReachableRows = reviewRows.filter((row) => row.endpointReachableButInsufficientPayload);

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "review-football-truth-controlled-sportomedia-graphql-payload-acquisition-responses-file",
    mode: "review_controlled_sportomedia_graphql_payload_acquisition_responses_no_fetch_no_search_no_classifier_no_truth_assertion_no_write",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      controlledSportomediaGraphqlPayloadAcquisitionExecutionRun: args.runInput,
      sportomediaTargetedScriptPayloadParser: args.targetedInput
    },
    summary: {
      controlledSportomediaGraphqlPayloadAcquisitionResponseReviewCompetitionCount: reviewRows.length,
      responseFetchedOkInputCount: reviewRows.filter((row) => row.fetchStatus === "fetched_ok").length,
      responseHttp200InputCount: reviewRows.filter((row) => row.httpStatus === 200).length,
      responseJsonInputCount: reviewRows.filter((row) => row.hasJsonContentType).length,
      responseGraphqlKeywordInputCount: reviewRows.filter((row) => row.hasGraphqlKeyword).length,
      responseStandingKeywordInputCount: reviewRows.filter((row) => row.hasStandingKeyword).length,
      totalResponseRawTextLength: reviewRows.reduce((sum, row) => sum + Number(row.rawTextLength || 0), 0),

      graphqlEndpointReachableButInsufficientPayloadCount: endpointReachableRows.length,
      graphqlQueryBodyRecoveryNeededCount: queryBodyRecoveryRows.length,
      payloadParserReadyNowCount: parserReadyRows.length,

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
      responseReviewTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        parserReadyRows.length === reviewRows.length
          ? "build_no_write_sportomedia_graphql_payload_standings_parser"
          : queryBodyRecoveryRows.length > 0
            ? "build_no_write_sportomedia_graphql_query_body_recovery_plan_from_existing_fragments"
            : "inspect_controlled_sportomedia_graphql_response_shape_deeper"
    },
    counts: {
      byResponseReviewStatus: countBy(reviewRows, "responseReviewStatus"),
      byNextAllowedStep: countBy(reviewRows, "nextAllowedStep")
    },
    guardrails: [
      "This response review reads the controlled Sportomedia GraphQL acquisition diagnostics only.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a season-state classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Response reviews are not truth assertions.",
      "HTTP 200 endpoint reachability is not standings truth.",
      "Missing standing keyword does not prove absence.",
      "No match today must not imply inactive.",
      "Zero result must not imply absence."
    ],
    reviewRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    controlledSportomediaGraphqlPayloadAcquisitionResponseReviewCompetitionCount: output.summary.controlledSportomediaGraphqlPayloadAcquisitionResponseReviewCompetitionCount,
    responseFetchedOkInputCount: output.summary.responseFetchedOkInputCount,
    responseHttp200InputCount: output.summary.responseHttp200InputCount,
    responseJsonInputCount: output.summary.responseJsonInputCount,
    responseGraphqlKeywordInputCount: output.summary.responseGraphqlKeywordInputCount,
    responseStandingKeywordInputCount: output.summary.responseStandingKeywordInputCount,
    totalResponseRawTextLength: output.summary.totalResponseRawTextLength,
    graphqlEndpointReachableButInsufficientPayloadCount: output.summary.graphqlEndpointReachableButInsufficientPayloadCount,
    graphqlQueryBodyRecoveryNeededCount: output.summary.graphqlQueryBodyRecoveryNeededCount,
    payloadParserReadyNowCount: output.summary.payloadParserReadyNowCount,
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
    responseReviewTruthCount: output.summary.responseReviewTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    userHintUsedCount: output.summary.userHintUsedCount,
    hardcodedSeasonStateOverrideUsedCount: output.summary.hardcodedSeasonStateOverrideUsedCount,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
