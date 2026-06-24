#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DEFAULTS = {
  date: "2026-06-14",
  reviewInput: "data/football-truth/_diagnostics/controlled-sportomedia-graphql-payload-acquisition-response-review-2026-06-14/controlled-sportomedia-graphql-payload-acquisition-response-review-2026-06-14.json",
  shapeInput: "data/football-truth/_diagnostics/no-write-sportomedia-official-standings-payload-shape-inspector-2026-06-14/no-write-sportomedia-official-standings-payload-shape-inspector-2026-06-14.json",
  targetedInput: "data/football-truth/_diagnostics/no-write-sportomedia-targeted-script-payload-parser-2026-06-14/no-write-sportomedia-targeted-script-payload-parser-2026-06-14.json",
  snapshotInput: "data/football-truth/_diagnostics/final-explicit-scoped-controlled-route-acquisition-run-2026-06-14/final-explicit-scoped-controlled-route-acquisition-run-2026-06-14.json",
  output: "data/football-truth/_diagnostics/no-write-sportomedia-graphql-query-body-recovery-plan-2026-06-14/no-write-sportomedia-graphql-query-body-recovery-plan-2026-06-14.json"
};

const EXPECTED_SLUGS = ["swe.1", "swe.2"];

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--review-input") args.reviewInput = argv[++i];
    else if (arg === "--shape-input") args.shapeInput = argv[++i];
    else if (arg === "--targeted-input") args.targetedInput = argv[++i];
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

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
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

function validateReview(input) {
  const s = input.summary || {};
  assertSummary(s, "controlledSportomediaGraphqlPayloadAcquisitionResponseReviewCompetitionCount", 2);
  assertSummary(s, "responseFetchedOkInputCount", 2);
  assertSummary(s, "responseHttp200InputCount", 2);
  assertSummary(s, "responseJsonInputCount", 2);
  assertSummary(s, "responseGraphqlKeywordInputCount", 2);
  assertSummary(s, "responseStandingKeywordInputCount", 0);
  assertSummary(s, "totalResponseRawTextLength", 178);
  assertSummary(s, "graphqlEndpointReachableButInsufficientPayloadCount", 2);
  assertSummary(s, "graphqlQueryBodyRecoveryNeededCount", 2);
  assertSummary(s, "payloadParserReadyNowCount", 0);
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
  assertSummary(s, "responseReviewTruthCount", 0);
  assertSummary(s, "canonicalWrites", 0);
  assertSummary(s, "productionWrite", false);
  assertSummary(s, "userHintUsedCount", 0);
  assertSummary(s, "hardcodedSeasonStateOverrideUsedCount", 0);

  const rows = Array.isArray(input.reviewRows) ? input.reviewRows : [];
  if (rows.length !== 2) throw new Error("Expected 2 reviewRows.");

  const slugs = uniqueSorted(rows.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Unexpected review slugs: " + slugs.join(", "));
  }

  return rows;
}

function validateShape(input) {
  const s = input.summary || {};
  assertSummary(s, "sportomediaPayloadShapeInspectorCompetitionCount", 2);
  assertSummary(s, "sportomediaOfficialStandingsSnapshotCount", 2);
  assertSummary(s, "scriptHydrationOrGraphqlLikeCount", 2);
  assertSummary(s, "totalScriptsWithGraphqlCount", 2);
  assertSummary(s, "totalLikelyJsonFragmentCount", 124);
  assertSummary(s, "fetchExecutedNowCount", 0);
  assertSummary(s, "searchExecutedNowCount", 0);
  assertSummary(s, "broadSearchExecutedNowCount", 0);
  assertSummary(s, "classifierExecutedNowCount", 0);
  assertSummary(s, "canonicalWriteExecutedNowCount", 0);
  assertSummary(s, "productionWriteExecutedNowCount", 0);
  assertSummary(s, "payloadShapeTruthCount", 0);

  const rows = Array.isArray(input.inspectorRows) ? input.inspectorRows : [];
  if (rows.length !== 2) throw new Error("Expected 2 inspectorRows.");
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

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function getRaw(snapshot) {
  return String(snapshot.rawText || snapshot.text || snapshot.body || snapshot.textPreview || "");
}

function extractScripts(raw) {
  const scripts = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  let scriptIndex = 0;

  while ((match = re.exec(String(raw || ""))) !== null && scripts.length < 200) {
    const attrs = String(match[1] || "");
    const body = decodeEntities(String(match[2] || "").trim());
    scripts.push({
      scriptIndex,
      attrs,
      body,
      bodyLength: body.length,
      hasGraphql: /graphql|GraphQL|gql|operationName|query\s+[A-Za-z0-9_]+/i.test(body),
      hasStandingTerms: /standing|standings|tabell|table|poäng|poang|points|pts|played|spelade|team|club|lag/i.test(body)
    });
    scriptIndex += 1;
  }

  return scripts;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(String(text || ""));
  } catch {
    return null;
  }
}

function tryDecodeQuotedString(text) {
  const parsed = safeJsonParse(text);
  if (typeof parsed === "string") return parsed;
  return null;
}

function collectCandidateTexts({ snapshot, inspectorRow }) {
  const raw = getRaw(snapshot);
  const texts = [];

  for (const script of extractScripts(raw)) {
    if (script.hasGraphql || script.hasStandingTerms) {
      texts.push({ source: "script_" + script.scriptIndex, text: script.body });
    }
  }

  for (const frag of inspectorRow?.likelyJsonFragments || []) {
    if (frag?.fragment) texts.push({ source: "inspector_fragment_" + frag.source + "_" + frag.keyword, text: decodeEntities(frag.fragment) });
  }

  for (const ctx of inspectorRow?.keywordContexts || []) {
    if (ctx?.context) texts.push({ source: "inspector_keyword_context_" + ctx.keyword, text: decodeEntities(ctx.context) });
  }

  const expanded = [];
  for (const item of texts) {
    expanded.push(item);

    const quoted = String(item.text || "").match(/"(?:\\.|[^"\\]){40,}"/g) || [];
    for (const q of quoted.slice(0, 150)) {
      const decoded = tryDecodeQuotedString(q);
      if (decoded && /(graphql|operationName|query|standing|standings|tabell|table|league|season|competition)/i.test(decoded)) {
        expanded.push({ source: item.source + "_decoded_string", text: decoded });
      }
    }
  }

  return expanded.filter((x) => x.text && x.text.length > 20).slice(0, 500);
}

function extractOperationCandidates(text, source) {
  const candidates = [];
  const s = String(text || "");

  const operationNameRe = /operationName["']?\s*[:=]\s*["']([A-Za-z0-9_]+)["']/g;
  let match;
  while ((match = operationNameRe.exec(s)) !== null) {
    candidates.push({
      candidateType: "operationName",
      operationName: match[1],
      query: null,
      variables: null,
      source,
      sourceIndex: match.index,
      rawSnippet: s.slice(Math.max(0, match.index - 400), match.index + 1000)
    });
  }

  const queryRe = /\b(query|mutation)\s+([A-Za-z0-9_]+)?\s*(\([^{}]*\))?\s*\{[\s\S]{40,5000}?\n?\}/g;
  while ((match = queryRe.exec(s)) !== null) {
    const queryText = match[0];
    if (!/(standing|standings|table|tabell|competition|season|team|club|points|matches|fixtures|result|match)/i.test(queryText)) continue;

    candidates.push({
      candidateType: "graphqlQueryText",
      operationType: match[1],
      operationName: match[2] || null,
      query: queryText,
      variables: null,
      source,
      sourceIndex: match.index,
      rawSnippet: s.slice(Math.max(0, match.index - 400), match.index + queryText.length + 400)
    });
  }

  const persistedRe = /(queryId|operationId|documentId|hash|sha256Hash|id)["']?\s*[:=]\s*["']([A-Za-z0-9_-]{16,})["']/g;
  while ((match = persistedRe.exec(s)) !== null) {
    candidates.push({
      candidateType: "persistedQueryOrDocumentId",
      operationName: null,
      query: null,
      persistedKey: match[1],
      persistedValue: match[2],
      variables: null,
      source,
      sourceIndex: match.index,
      rawSnippet: s.slice(Math.max(0, match.index - 400), match.index + 1000)
    });
  }

  const bodyLikeRe = /\{[\s\S]{0,1200}?(operationName|query|variables)[\s\S]{0,3000}?\}/g;
  while ((match = bodyLikeRe.exec(s)) !== null && candidates.length < 200) {
    const body = match[0];
    if (!/(standing|standings|tabell|table|competition|season|team|club|points|matches|fixtures|result|match|operationName|query)/i.test(body)) continue;

    candidates.push({
      candidateType: "graphqlBodyLikeObject",
      operationName: null,
      query: null,
      variables: null,
      source,
      sourceIndex: match.index,
      rawSnippet: body.slice(0, 2500)
    });
  }

  return candidates;
}

function scoreCandidate(candidate) {
  const joined = [
    candidate.candidateType,
    candidate.operationName,
    candidate.query,
    candidate.persistedKey,
    candidate.persistedValue,
    candidate.rawSnippet
  ].map((x) => String(x || "")).join(" ").toLowerCase();

  let score = 0;
  if (candidate.candidateType === "graphqlQueryText") score += 80;
  if (candidate.candidateType === "graphqlBodyLikeObject") score += 45;
  if (candidate.candidateType === "operationName") score += 25;
  if (candidate.candidateType === "persistedQueryOrDocumentId") score += 20;

  if (joined.includes("standing") || joined.includes("standings") || joined.includes("table") || joined.includes("tabell")) score += 60;
  if (joined.includes("competition")) score += 20;
  if (joined.includes("season")) score += 20;
  if (joined.includes("team") || joined.includes("club") || joined.includes("lag")) score += 15;
  if (joined.includes("point") || joined.includes("poäng") || joined.includes("poang")) score += 15;
  if (joined.includes("match") || joined.includes("fixture") || joined.includes("result")) score -= 10;

  return score;
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  const out = [];

  for (const candidate of candidates) {
    const key = [
      candidate.candidateType,
      candidate.operationName || "",
      candidate.query ? sha256(candidate.query) : "",
      candidate.persistedKey || "",
      candidate.persistedValue || "",
      sha256(candidate.rawSnippet || "")
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      ...candidate,
      candidateScore: scoreCandidate(candidate),
      candidateIsTruth: false
    });
  }

  return out.sort((a, b) => b.candidateScore - a.candidateScore || String(a.operationName || "").localeCompare(String(b.operationName || ""))).slice(0, 80);
}

function buildPlanRow({ reviewRow, inspectorRow, targetedRow, snapshot }) {
  const texts = collectCandidateTexts({ snapshot, inspectorRow });
  const operationCandidates = dedupeCandidates(texts.flatMap((item) => extractOperationCandidates(item.text, item.source)));
  const highConfidenceCandidates = operationCandidates.filter((candidate) => candidate.candidateScore >= 60);
  const queryTextCandidates = operationCandidates.filter((candidate) => candidate.candidateType === "graphqlQueryText");
  const bodyLikeCandidates = operationCandidates.filter((candidate) => candidate.candidateType === "graphqlBodyLikeObject");
  const operationNameCandidates = operationCandidates.filter((candidate) => candidate.candidateType === "operationName");
  const persistedCandidates = operationCandidates.filter((candidate) => candidate.candidateType === "persistedQueryOrDocumentId");

  const planStatus =
    highConfidenceCandidates.length > 0
      ? "ready_for_no_write_sportomedia_graphql_query_body_recovery_approval_gate"
      : operationCandidates.length > 0
        ? "needs_query_body_candidate_refinement_from_existing_fragments"
        : "blocked_no_query_body_candidate_found_in_existing_fragments";

  return {
    competitionSlug: reviewRow.competitionSlug,
    reusableFamily: reviewRow.reusableFamily,
    responseReviewStatus: reviewRow.responseReviewStatus,

    queryBodyRecoveryPlanStatus: planStatus,
    endpointReachableButInsufficientPayload: reviewRow.endpointReachableButInsufficientPayload,
    queryBodyRecoveryNeeded: reviewRow.queryBodyRecoveryNeeded,

    sourceTextCandidateCount: texts.length,
    operationCandidateCount: operationCandidates.length,
    highConfidenceOperationCandidateCount: highConfidenceCandidates.length,
    graphqlQueryTextCandidateCount: queryTextCandidates.length,
    graphqlBodyLikeCandidateCount: bodyLikeCandidates.length,
    operationNameCandidateCount: operationNameCandidates.length,
    persistedQueryCandidateCount: persistedCandidates.length,
    existingGraphqlRouteCandidateCount: targetedRow.graphqlRouteCandidateCount || (targetedRow.graphqlRouteCandidates || []).length,

    recommendedPrimaryOperationCandidate: highConfidenceCandidates[0] || operationCandidates[0] || null,
    operationCandidateSamples: operationCandidates.slice(0, 25),

    mayPrepareQueryBodyRecoveryApprovalGate: planStatus === "ready_for_no_write_sportomedia_graphql_query_body_recovery_approval_gate",
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
    queryBodyCandidatesAreTruth: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    zeroResultDoesNotImplyAbsence: true,
    missingStandingKeywordDoesNotProveAbsence: true,
    noMatchTodayDoesNotImplyInactive: true,

    nextAllowedStep:
      planStatus === "ready_for_no_write_sportomedia_graphql_query_body_recovery_approval_gate"
        ? "prepare_no_write_sportomedia_graphql_query_body_recovery_approval_gate"
        : planStatus === "needs_query_body_candidate_refinement_from_existing_fragments"
          ? "refine_sportomedia_graphql_query_body_candidates_from_existing_fragments"
          : "inspect_sportomedia_client_bundle_runtime_graphql_body_construction",
    nextBlockedStep: "controlled_graphql_payload_refetch_classifier_canonical_write_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);

  const review = readJson(args.reviewInput);
  const reviewRows = validateReview(review);

  const shape = readJson(args.shapeInput);
  const inspectorRows = validateShape(shape);

  const targeted = readJson(args.targetedInput);
  const targetedRows = validateTargeted(targeted);

  const snapshotsRun = readJson(args.snapshotInput);
  const snapshots = validateSnapshots(snapshotsRun);

  const planRows = reviewRows.map((reviewRow) => {
    const inspectorRow = inspectorRows.find((row) => row.competitionSlug === reviewRow.competitionSlug);
    const targetedRow = targetedRows.find((row) => row.competitionSlug === reviewRow.competitionSlug);
    const snapshot = snapshots.find((row) => row.competitionSlug === reviewRow.competitionSlug && row.routeKind === "official_standings");

    if (!inspectorRow) throw new Error(reviewRow.competitionSlug + ": missing inspector row.");
    if (!targetedRow) throw new Error(reviewRow.competitionSlug + ": missing targeted parser row.");
    if (!snapshot) throw new Error(reviewRow.competitionSlug + ": missing official standings snapshot.");

    return buildPlanRow({ reviewRow, inspectorRow, targetedRow, snapshot });
  }).sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const readyRows = planRows.filter((row) => row.queryBodyRecoveryPlanStatus === "ready_for_no_write_sportomedia_graphql_query_body_recovery_approval_gate");
  const refinementRows = planRows.filter((row) => row.queryBodyRecoveryPlanStatus === "needs_query_body_candidate_refinement_from_existing_fragments");
  const blockedRows = planRows.filter((row) => row.queryBodyRecoveryPlanStatus === "blocked_no_query_body_candidate_found_in_existing_fragments");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-no-write-sportomedia-graphql-query-body-recovery-plan-file",
    mode: "build_no_write_sportomedia_graphql_query_body_recovery_plan_from_existing_fragments_no_fetch_no_search_no_classifier_no_truth_assertion_no_write",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      sportomediaGraphqlPayloadResponseReview: args.reviewInput,
      sportomediaPayloadShapeInspector: args.shapeInput,
      sportomediaTargetedScriptPayloadParser: args.targetedInput,
      finalScopedControlledRouteAcquisitionRun: args.snapshotInput
    },
    summary: {
      sportomediaGraphqlQueryBodyRecoveryPlanCompetitionCount: planRows.length,
      queryBodyRecoveryPlanReadyCount: readyRows.length,
      queryBodyRecoveryPlanNeedsRefinementCount: refinementRows.length,
      queryBodyRecoveryPlanBlockedCount: blockedRows.length,

      endpointReachableButInsufficientPayloadCount: planRows.filter((row) => row.endpointReachableButInsufficientPayload).length,
      queryBodyRecoveryNeededCount: planRows.filter((row) => row.queryBodyRecoveryNeeded).length,

      totalSourceTextCandidateCount: planRows.reduce((sum, row) => sum + row.sourceTextCandidateCount, 0),
      totalOperationCandidateCount: planRows.reduce((sum, row) => sum + row.operationCandidateCount, 0),
      totalHighConfidenceOperationCandidateCount: planRows.reduce((sum, row) => sum + row.highConfidenceOperationCandidateCount, 0),
      totalGraphqlQueryTextCandidateCount: planRows.reduce((sum, row) => sum + row.graphqlQueryTextCandidateCount, 0),
      totalGraphqlBodyLikeCandidateCount: planRows.reduce((sum, row) => sum + row.graphqlBodyLikeCandidateCount, 0),
      totalOperationNameCandidateCount: planRows.reduce((sum, row) => sum + row.operationNameCandidateCount, 0),
      totalPersistedQueryCandidateCount: planRows.reduce((sum, row) => sum + row.persistedQueryCandidateCount, 0),

      mayPrepareQueryBodyRecoveryApprovalGateCount: planRows.filter((row) => row.mayPrepareQueryBodyRecoveryApprovalGate).length,

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
      queryBodyCandidatesTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        readyRows.length === planRows.length
          ? "prepare_no_write_sportomedia_graphql_query_body_recovery_approval_gate"
          : refinementRows.length > 0
            ? "refine_sportomedia_graphql_query_body_candidates_from_existing_fragments"
            : "inspect_sportomedia_client_bundle_runtime_graphql_body_construction"
    },
    counts: {
      byQueryBodyRecoveryPlanStatus: countBy(planRows, "queryBodyRecoveryPlanStatus"),
      byNextAllowedStep: countBy(planRows, "nextAllowedStep")
    },
    guardrails: [
      "This recovery plan reads existing Sportomedia diagnostics, fragments, scripts, and snapshots only.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a season-state classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Query/body candidates are not truth assertions.",
      "Endpoint reachability is not standings truth.",
      "Missing standing keyword does not prove absence.",
      "No match today must not imply inactive.",
      "Zero result must not imply absence."
    ],
    planRows,
    blockedRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    sportomediaGraphqlQueryBodyRecoveryPlanCompetitionCount: output.summary.sportomediaGraphqlQueryBodyRecoveryPlanCompetitionCount,
    queryBodyRecoveryPlanReadyCount: output.summary.queryBodyRecoveryPlanReadyCount,
    queryBodyRecoveryPlanNeedsRefinementCount: output.summary.queryBodyRecoveryPlanNeedsRefinementCount,
    queryBodyRecoveryPlanBlockedCount: output.summary.queryBodyRecoveryPlanBlockedCount,
    endpointReachableButInsufficientPayloadCount: output.summary.endpointReachableButInsufficientPayloadCount,
    queryBodyRecoveryNeededCount: output.summary.queryBodyRecoveryNeededCount,
    totalSourceTextCandidateCount: output.summary.totalSourceTextCandidateCount,
    totalOperationCandidateCount: output.summary.totalOperationCandidateCount,
    totalHighConfidenceOperationCandidateCount: output.summary.totalHighConfidenceOperationCandidateCount,
    totalGraphqlQueryTextCandidateCount: output.summary.totalGraphqlQueryTextCandidateCount,
    totalGraphqlBodyLikeCandidateCount: output.summary.totalGraphqlBodyLikeCandidateCount,
    totalOperationNameCandidateCount: output.summary.totalOperationNameCandidateCount,
    totalPersistedQueryCandidateCount: output.summary.totalPersistedQueryCandidateCount,
    mayPrepareQueryBodyRecoveryApprovalGateCount: output.summary.mayPrepareQueryBodyRecoveryApprovalGateCount,
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
    queryBodyCandidatesTruthCount: output.summary.queryBodyCandidatesTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    userHintUsedCount: output.summary.userHintUsedCount,
    hardcodedSeasonStateOverrideUsedCount: output.summary.hardcodedSeasonStateOverrideUsedCount,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
