#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DEFAULTS = {
  date: "2026-06-14",
  finalApprovalInput: "data/football-truth/_diagnostics/final-explicit-controlled-sportomedia-graphql-payload-acquisition-execution-run-approval-2026-06-14/final-explicit-controlled-sportomedia-graphql-payload-acquisition-execution-run-approval-2026-06-14.json",
  planInput: "data/football-truth/_diagnostics/no-write-controlled-sportomedia-graphql-payload-acquisition-plan-2026-06-14/no-write-controlled-sportomedia-graphql-payload-acquisition-plan-2026-06-14.json",
  snapshotInput: "data/football-truth/_diagnostics/final-explicit-scoped-controlled-route-acquisition-run-2026-06-14/final-explicit-scoped-controlled-route-acquisition-run-2026-06-14.json",
  output: "data/football-truth/_diagnostics/controlled-sportomedia-graphql-payload-acquisition-execution-run-2026-06-14/controlled-sportomedia-graphql-payload-acquisition-execution-run-2026-06-14.json"
};

const EXPECTED_SLUGS = ["swe.1", "swe.2"];

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--final-approval-input") args.finalApprovalInput = argv[++i];
    else if (arg === "--plan-input") args.planInput = argv[++i];
    else if (arg === "--snapshot-input") args.snapshotInput = argv[++i];
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

function sha256(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
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

function validateFinalApproval(input) {
  const s = input.summary || {};

  assertSummary(s, "finalExplicitControlledSportomediaGraphqlPayloadAcquisitionExecutionRunApprovalCompetitionCount", 2);
  assertSummary(s, "finalExplicitControlledSportomediaGraphqlPayloadAcquisitionExecutionRunApprovalApprovedCount", 2);
  assertSummary(s, "finalExplicitControlledSportomediaGraphqlPayloadAcquisitionExecutionRunApprovalBlockedCount", 0);
  assertSummary(s, "approvedRunnerTargetCount", 2);
  assertSummary(s, "approvedPrimaryRouteCandidateCount", 2);
  assertSummary(s, "approvedRouteCandidateReferenceCount", 7);
  assertSummary(s, "mayRunControlledPayloadAcquisitionNextCount", 2);
  assertSummary(s, "finalRunWouldAllowControlledPayloadAcquisitionCount", 2);
  assertSummary(s, "finalRunWouldAllowConfiguredGraphqlPayloadFetchCount", 2);

  assertSummary(s, "finalRunWouldAllowSearchCount", 0);
  assertSummary(s, "finalRunWouldAllowBroadSearchCount", 0);
  assertSummary(s, "finalRunWouldAllowClassifierCount", 0);
  assertSummary(s, "finalRunWouldAllowCanonicalWriteCount", 0);
  assertSummary(s, "finalRunWouldAllowProductionWriteCount", 0);
  assertSummary(s, "finalRunWouldAllowTruthAssertionCount", 0);

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
  assertSummary(s, "graphqlRouteCandidatesTruthCount", 0);
  assertSummary(s, "finalApprovalTruthCount", 0);
  assertSummary(s, "canonicalWrites", 0);
  assertSummary(s, "productionWrite", false);
  assertSummary(s, "userHintUsedCount", 0);
  assertSummary(s, "hardcodedSeasonStateOverrideUsedCount", 0);

  const rows = Array.isArray(input.finalApprovalRows) ? input.finalApprovalRows : [];
  if (rows.length !== 2) throw new Error("Expected 2 finalApprovalRows.");

  const slugs = uniqueSorted(rows.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Unexpected final approval slugs: " + slugs.join(", "));
  }

  for (const row of rows) {
    if (row.finalApprovalStatus !== "approved_for_next_step_controlled_sportomedia_graphql_payload_acquisition_execution") {
      throw new Error(row.competitionSlug + ": final approval is not approved.");
    }
    if (row.finalRunWouldAllowSearch !== false) throw new Error(row.competitionSlug + ": search must be forbidden.");
    if (row.finalRunWouldAllowBroadSearch !== false) throw new Error(row.competitionSlug + ": broad search must be forbidden.");
    if (row.finalRunWouldAllowClassifier !== false) throw new Error(row.competitionSlug + ": classifier must be forbidden.");
    if (row.finalRunWouldAllowCanonicalWrite !== false) throw new Error(row.competitionSlug + ": canonical write must be forbidden.");
    if (row.finalRunWouldAllowProductionWrite !== false) throw new Error(row.competitionSlug + ": production write must be forbidden.");
    if (row.finalRunWouldAllowTruthAssertion !== false) throw new Error(row.competitionSlug + ": truth assertion must be forbidden.");
  }

  return rows;
}

function validatePlan(input) {
  const s = input.summary || {};
  assertSummary(s, "controlledSportomediaGraphqlPayloadAcquisitionPlanCompetitionCount", 2);
  assertSummary(s, "controlledSportomediaGraphqlPayloadAcquisitionPlanReadyCount", 2);
  assertSummary(s, "controlledSportomediaGraphqlPayloadAcquisitionPlanBlockedCount", 0);
  assertSummary(s, "totalRouteCandidateCount", 7);
  assertSummary(s, "totalPrimaryRouteCandidateCount", 2);
  assertSummary(s, "totalFallbackRouteCandidateCount", 5);
  assertSummary(s, "fetchExecutedNowCount", 0);
  assertSummary(s, "searchExecutedNowCount", 0);
  assertSummary(s, "broadSearchExecutedNowCount", 0);
  assertSummary(s, "classifierExecutedNowCount", 0);
  assertSummary(s, "canonicalWriteExecutedNowCount", 0);
  assertSummary(s, "productionWriteExecutedNowCount", 0);
  assertSummary(s, "graphqlRouteCandidatesTruthCount", 0);

  const rows = Array.isArray(input.planRows) ? input.planRows : [];
  if (rows.length !== 2) throw new Error("Expected 2 planRows.");
  return rows;
}

function validateSnapshots(input) {
  const s = input.summary || {};
  assertSummary(s, "finalScopedControlledRouteAcquisitionRunCompetitionCount", 6);
  assertSummary(s, "finalScopedControlledRouteAcquisitionRunTargetCount", 18);
  assertSummary(s, "fetchedSourceSnapshotCount", 18);
  assertSummary(s, "fetchedOkSnapshotCount", 18);
  assertSummary(s, "searchExecutedCount", 0);
  assertSummary(s, "broadSearchExecutedCount", 0);
  assertSummary(s, "classifierExecutedCount", 0);
  assertSummary(s, "canonicalWriteExecutedCount", 0);
  assertSummary(s, "productionWriteExecutedCount", 0);
  assertSummary(s, "seasonStateTruthAssertedCount", 0);
  assertSummary(s, "canonicalWrites", 0);
  assertSummary(s, "productionWrite", false);

  const rows = Array.isArray(input.fetchedSourceSnapshots) ? input.fetchedSourceSnapshots : [];
  if (rows.length !== 18) throw new Error("Expected 18 fetchedSourceSnapshots.");
  return rows;
}

function candidateScore(candidate) {
  const value = String(candidate.value || "").toLowerCase();
  const kind = String(candidate.kind || "").toLowerCase();
  let score = 0;

  if (kind === "absolute_url") score += 50;
  if (kind === "relative_path") score += 45;
  if (value.includes("graphql")) score += 50;
  if (value.includes("api")) score += 20;
  if (value.includes("standing") || value.includes("standings") || value.includes("table")) score += 20;
  if (value.includes("match") || value.includes("fixture") || value.includes("result")) score -= 15;
  if (kind === "graphql_operation" || kind === "operationName") score -= 20;

  return score;
}

function selectExecutableCandidate(planRow, finalApprovalRow) {
  const candidates = [
    ...(Array.isArray(planRow.primaryRouteCandidates) ? planRow.primaryRouteCandidates : []),
    ...(Array.isArray(planRow.fallbackRouteCandidates) ? planRow.fallbackRouteCandidates : []),
    finalApprovalRow.primaryRouteCandidate
  ].filter(Boolean);

  const executable = candidates
    .filter((candidate) => {
      const kind = String(candidate.kind || "");
      const value = String(candidate.value || "").trim();
      return value && (kind === "absolute_url" || kind === "relative_path");
    })
    .map((candidate) => ({ ...candidate, executionCandidateScore: candidateScore(candidate) }))
    .sort((a, b) => b.executionCandidateScore - a.executionCandidateScore || String(a.value).localeCompare(String(b.value)));

  return executable[0] || null;
}

function resolveUrl(candidate, officialSnapshot) {
  const value = String(candidate?.value || "").trim();
  if (!value) throw new Error("Missing route candidate value.");

  if (/^https?:\/\//i.test(value)) return value;

  const baseUrl = officialSnapshot.finalUrl || officialSnapshot.sourceUrl;
  if (!baseUrl) throw new Error("Cannot resolve relative route without official standings snapshot URL.");

  return new URL(value, baseUrl).toString();
}

async function fetchWithTimeout(url, timeoutMs = 25000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "accept": "application/json,text/plain,*/*",
        "user-agent": "Ai-MatchLab-FootballTruth-ControlledDiagnostics/1.0",
        "x-ai-matchlab-purpose": "diagnostics-only-no-canonical-write"
      }
    });

    const text = await response.text();

    return {
      fetchStatus: response.ok ? "fetched_ok" : "http_not_ok",
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      finalUrl: response.url,
      contentType: response.headers.get("content-type"),
      rawTextLength: text.length,
      rawTextSha256: sha256(text),
      rawTextPreview: text.slice(0, 5000),
      hasJsonContentType: /json/i.test(response.headers.get("content-type") || ""),
      hasGraphqlKeyword: /graphql|__typename|operationName|query/i.test(text),
      hasStandingKeyword: /standing|standings|tabell|table|poäng|poang|points|pts|played|spelade|team|club|lag/i.test(text)
    };
  } catch (error) {
    return {
      fetchStatus: "fetch_error",
      ok: false,
      status: null,
      statusText: null,
      finalUrl: url,
      contentType: null,
      rawTextLength: 0,
      rawTextSha256: null,
      rawTextPreview: "",
      hasJsonContentType: false,
      hasGraphqlKeyword: false,
      hasStandingKeyword: false,
      errorName: error?.name || "Error",
      errorMessage: error?.message || String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const args = parseArgs(process.argv);

  const finalApproval = readJson(args.finalApprovalInput);
  const finalApprovalRows = validateFinalApproval(finalApproval);

  const plan = readJson(args.planInput);
  const planRows = validatePlan(plan);

  const snapshotsRun = readJson(args.snapshotInput);
  const snapshots = validateSnapshots(snapshotsRun);

  const acquisitionRows = [];

  for (const approvalRow of finalApprovalRows.sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug))) {
    const planRow = planRows.find((row) => row.competitionSlug === approvalRow.competitionSlug);
    if (!planRow) throw new Error(approvalRow.competitionSlug + ": missing plan row.");

    const officialSnapshot = snapshots.find((row) => row.competitionSlug === approvalRow.competitionSlug && row.routeKind === "official_standings");
    if (!officialSnapshot) throw new Error(approvalRow.competitionSlug + ": missing official_standings source snapshot.");

    const candidate = selectExecutableCandidate(planRow, approvalRow);
    if (!candidate) throw new Error(approvalRow.competitionSlug + ": no executable absolute/relative route candidate.");

    const url = resolveUrl(candidate, officialSnapshot);
    const response = await fetchWithTimeout(url);

    acquisitionRows.push({
      competitionSlug: approvalRow.competitionSlug,
      reusableFamily: approvalRow.reusableFamily,
      runnerTargetId: approvalRow.runnerTargetId,
      approvedExecutionScope: approvalRow.finalApprovedExecutionScope,
      approvedExecutionMode: approvalRow.finalApprovedExecutionMode,

      selectedRouteCandidate: candidate,
      resolvedFetchUrl: url,
      officialStandingsSnapshotFinalUrl: officialSnapshot.finalUrl || officialSnapshot.sourceUrl,

      controlledPayloadAcquisitionExecuted: true,
      configuredGraphqlPayloadFetchExecuted: true,
      fetchExecutedNow: true,
      searchExecutedNow: false,
      broadSearchExecutedNow: false,
      classifierExecutedNow: false,
      canonicalWriteExecutedNow: false,
      productionWriteExecutedNow: false,
      activeAssertedNow: false,
      inactiveAssertedNow: false,
      completedAssertedNow: false,
      seasonStateTruthAssertedNow: false,
      payloadIsTruth: false,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsed: false,
      hardcodedSeasonStateOverrideUsed: false,

      response,

      nextAllowedStep:
        response.fetchStatus === "fetched_ok"
          ? "review_controlled_sportomedia_graphql_payload_acquisition_response"
          : "review_controlled_sportomedia_graphql_payload_fetch_error_or_http_status",
      nextBlockedStep: "classifier_canonical_write_production_write_truth_assertions_blocked"
    });
  }

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "run-football-truth-controlled-sportomedia-graphql-payload-acquisition-execution-file",
    mode: "controlled_sportomedia_graphql_payload_acquisition_execution_diagnostics_only_no_search_no_classifier_no_truth_assertion_no_canonical_write",
    sourceFetch: true,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: false,
    inputs: {
      finalExplicitControlledSportomediaGraphqlPayloadAcquisitionExecutionRunApproval: args.finalApprovalInput,
      controlledSportomediaGraphqlPayloadAcquisitionPlan: args.planInput,
      finalScopedControlledRouteAcquisitionRun: args.snapshotInput
    },
    summary: {
      controlledSportomediaGraphqlPayloadAcquisitionExecutionCompetitionCount: acquisitionRows.length,
      controlledPayloadAcquisitionExecutedCount: acquisitionRows.filter((row) => row.controlledPayloadAcquisitionExecuted).length,
      configuredGraphqlPayloadFetchExecutedCount: acquisitionRows.filter((row) => row.configuredGraphqlPayloadFetchExecuted).length,

      fetchedOkCount: acquisitionRows.filter((row) => row.response.fetchStatus === "fetched_ok").length,
      httpNotOkCount: acquisitionRows.filter((row) => row.response.fetchStatus === "http_not_ok").length,
      fetchErrorCount: acquisitionRows.filter((row) => row.response.fetchStatus === "fetch_error").length,
      totalResponseRawTextLength: acquisitionRows.reduce((sum, row) => sum + row.response.rawTextLength, 0),
      jsonContentTypeCount: acquisitionRows.filter((row) => row.response.hasJsonContentType).length,
      graphqlKeywordResponseCount: acquisitionRows.filter((row) => row.response.hasGraphqlKeyword).length,
      standingKeywordResponseCount: acquisitionRows.filter((row) => row.response.hasStandingKeyword).length,

      fetchExecutedNowCount: acquisitionRows.filter((row) => row.fetchExecutedNow).length,
      searchExecutedNowCount: 0,
      broadSearchExecutedNowCount: 0,
      classifierExecutedNowCount: 0,
      canonicalWriteExecutedNowCount: 0,
      productionWriteExecutedNowCount: 0,
      activeAssertedCount: 0,
      inactiveAssertedCount: 0,
      completedAssertedCount: 0,
      seasonStateTruthAssertedCount: 0,
      payloadTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane: "review_controlled_sportomedia_graphql_payload_acquisition_responses_and_build_no_write_payload_parser"
    },
    counts: {
      byFetchStatus: countBy(acquisitionRows.map((row) => ({ fetchStatus: row.response.fetchStatus })), "fetchStatus"),
      byNextAllowedStep: countBy(acquisitionRows, "nextAllowedStep")
    },
    guardrails: [
      "This execution is scoped only to swe.1 and swe.2 Sportomedia official standings GraphQL payload candidates.",
      "It performs controlled configured GraphQL payload fetch only.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a season-state classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Fetched payloads are diagnostics only and are not truth assertions.",
      "HTTP failure or empty payload does not prove absence.",
      "No match today must not imply inactive.",
      "Zero result must not imply absence."
    ],
    acquisitionRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    controlledSportomediaGraphqlPayloadAcquisitionExecutionCompetitionCount: output.summary.controlledSportomediaGraphqlPayloadAcquisitionExecutionCompetitionCount,
    controlledPayloadAcquisitionExecutedCount: output.summary.controlledPayloadAcquisitionExecutedCount,
    configuredGraphqlPayloadFetchExecutedCount: output.summary.configuredGraphqlPayloadFetchExecutedCount,
    fetchedOkCount: output.summary.fetchedOkCount,
    httpNotOkCount: output.summary.httpNotOkCount,
    fetchErrorCount: output.summary.fetchErrorCount,
    totalResponseRawTextLength: output.summary.totalResponseRawTextLength,
    jsonContentTypeCount: output.summary.jsonContentTypeCount,
    graphqlKeywordResponseCount: output.summary.graphqlKeywordResponseCount,
    standingKeywordResponseCount: output.summary.standingKeywordResponseCount,
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
    payloadTruthCount: output.summary.payloadTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    userHintUsedCount: output.summary.userHintUsedCount,
    hardcodedSeasonStateOverrideUsedCount: output.summary.hardcodedSeasonStateOverrideUsedCount,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
