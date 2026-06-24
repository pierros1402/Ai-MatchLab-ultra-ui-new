#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DEFAULTS = {
  date: "2026-06-14",
  approvalInput: "data/football-truth/_diagnostics/final-explicit-controlled-sportomedia-graphql-query-body-recovery-refined-candidate-execution-run-approval-2026-06-14/final-explicit-controlled-sportomedia-graphql-query-body-recovery-refined-candidate-execution-run-approval-2026-06-14.json",
  output: "data/football-truth/_diagnostics/controlled-sportomedia-graphql-query-body-recovery-refined-candidate-execution-run-2026-06-14/controlled-sportomedia-graphql-query-body-recovery-refined-candidate-execution-run-2026-06-14.json",
  endpoint: "https://gql.sportomedia.se/graphql",
  timeoutMs: 20000
};

const EXPECTED_SLUGS = ["swe.1", "swe.2"];

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--approval-input") args.approvalInput = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else if (arg === "--endpoint") args.endpoint = argv[++i];
    else if (arg === "--timeout-ms") args.timeoutMs = Number(argv[++i]);
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

function validateApproval(input) {
  const s = input.summary || {};

  assertSummary(s, "finalExplicitControlledSportomediaGraphqlQueryBodyRecoveryRefinedCandidateExecutionRunApprovalCompetitionCount", 2);
  assertSummary(s, "finalExplicitControlledSportomediaGraphqlQueryBodyRecoveryRefinedCandidateExecutionRunApprovalApprovedCount", 2);
  assertSummary(s, "finalExplicitControlledSportomediaGraphqlQueryBodyRecoveryRefinedCandidateExecutionRunApprovalBlockedCount", 0);
  assertSummary(s, "approvedRunnerTargetCount", 2);
  assertSummary(s, "approvedPreviousPersistedQueryIdCandidateRejectedCount", 2);
  assertSummary(s, "approvedPreviousHttp400Count", 2);
  assertSummary(s, "approvedPreviousErrorResponseCount", 2);
  assertSummary(s, "approvedPreviousDataResponseCount", 0);
  assertSummary(s, "approvedPreviousPayloadCandidateResponseCount", 0);
  assertSummary(s, "approvedPrimaryRefinementCandidateCount", 2);
  assertSummary(s, "approvedPrimaryBodyLikeCandidateCount", 2);
  assertSummary(s, "approvedPrimaryPersistedQueryCandidateCount", 0);
  assertSummary(s, "approvedRemainingCandidateCount", 16);
  assertSummary(s, "approvedRemainingBodyLikeCandidateCount", 8);
  assertSummary(s, "approvedRemainingPersistedQueryCandidateCount", 8);
  assertSummary(s, "approvedRemainingHashLikePersistedCandidateCount", 0);
  assertSummary(s, "mayRunControlledRefinedCandidateQueryBodyRecoveryNextCount", 2);
  assertSummary(s, "finalRunWouldAllowControlledRefinedCandidateQueryBodyRecoveryCount", 2);
  assertSummary(s, "finalRunWouldAllowConfiguredGraphqlPayloadFetchCount", 2);
  assertSummary(s, "finalRunWouldAllowSearchCount", 0);
  assertSummary(s, "finalRunWouldAllowBroadSearchCount", 0);
  assertSummary(s, "finalRunWouldAllowClassifierCount", 0);
  assertSummary(s, "finalRunWouldAllowCanonicalWriteCount", 0);
  assertSummary(s, "finalRunWouldAllowProductionWriteCount", 0);
  assertSummary(s, "finalRunWouldAllowTruthAssertionCount", 0);

  assertSummary(s, "mayExecuteNowCount", 0);
  assertSummary(s, "mayFetchNowCount", 0);
  assertSummary(s, "maySearchNowCount", 0);
  assertSummary(s, "mayBroadSearchNowCount", 0);
  assertSummary(s, "mayClassifySeasonStateNowCount", 0);
  assertSummary(s, "mayWriteCanonicalNowCount", 0);
  assertSummary(s, "mayAssertTruthNowCount", 0);

  assertSummary(s, "executionApprovalPreparedNowCount", 2);
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
  assertSummary(s, "finalApprovalTruthCount", 0);
  assertSummary(s, "queryBodyCandidatesTruthCount", 0);
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
    if (row.finalApprovalStatus !== "approved_for_next_step_controlled_sportomedia_graphql_query_body_recovery_refined_candidate_execution") {
      throw new Error(row.competitionSlug + ": refined-candidate final approval is not approved.");
    }
    if (row.primaryRefinementCandidateType !== "graphqlBodyLikeObject") {
      throw new Error(row.competitionSlug + ": primary refinement candidate must be graphqlBodyLikeObject.");
    }
    if (!row.primaryRefinementCandidate) throw new Error(row.competitionSlug + ": missing primary refinement candidate.");
    if (row.previousRequestBodyVariant !== "persisted_query_id_candidate") {
      throw new Error(row.competitionSlug + ": previous request body variant must be persisted_query_id_candidate.");
    }
    if (Number(row.previousHttpStatus) !== 400) throw new Error(row.competitionSlug + ": previous HTTP status must be 400.");
    if (row.mayRunControlledRefinedCandidateQueryBodyRecoveryNext !== true) {
      throw new Error(row.competitionSlug + ": mayRunControlledRefinedCandidateQueryBodyRecoveryNext must be true.");
    }
    if (row.finalRunWouldAllowControlledRefinedCandidateQueryBodyRecovery !== true) {
      throw new Error(row.competitionSlug + ": controlled refined-candidate query/body recovery must be allowed for this run.");
    }
    if (row.finalRunWouldAllowConfiguredGraphqlPayloadFetch !== true) {
      throw new Error(row.competitionSlug + ": configured GraphQL payload fetch must be allowed for this run.");
    }
    if (row.finalRunWouldAllowSearch !== false || row.finalRunWouldAllowBroadSearch !== false) {
      throw new Error(row.competitionSlug + ": search/broad search must be disallowed.");
    }
    if (row.finalRunWouldAllowClassifier !== false || row.finalRunWouldAllowCanonicalWrite !== false) {
      throw new Error(row.competitionSlug + ": classifier/canonical write must be disallowed.");
    }
    if (row.finalRunWouldAllowProductionWrite !== false || row.finalRunWouldAllowTruthAssertion !== false) {
      throw new Error(row.competitionSlug + ": production write/truth assertion must be disallowed.");
    }
  }

  return rows;
}

function replaceSingleQuotedStrings(input) {
  return String(input || "").replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, body) => JSON.stringify(body.replace(/\\'/g, "'")));
}

function quoteBareKeys(input) {
  return String(input || "").replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$-]*)(\s*:)/g, '$1"$2"$3');
}

function stripTrailingCommas(input) {
  return String(input || "").replace(/,\s*([}\]])/g, "$1");
}

function tryJsonParse(value) {
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return null;
  }
}

function findBalancedObjectCandidates(text) {
  const s = String(text || "");
  const out = [];
  const stack = [];
  let start = -1;
  let inString = false;
  let stringQuote = null;
  let escaped = false;

  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === stringQuote) {
        inString = false;
        stringQuote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringQuote = ch;
      escaped = false;
      continue;
    }

    if (ch === "{") {
      if (stack.length === 0) start = i;
      stack.push(ch);
    } else if (ch === "}") {
      if (stack.length > 0) stack.pop();
      if (stack.length === 0 && start >= 0) {
        const candidate = s.slice(start, i + 1);
        if (candidate.length >= 10 && /(query|variables|operationName|extensions|persisted|sha256|documentId|operationId|queryId|id|body|graphql)/i.test(candidate)) {
          out.push(candidate);
        }
        start = -1;
      }
    }
  }

  return out.slice(0, 200);
}

function parseJsonishObject(text) {
  const candidates = [String(text || ""), ...findBalancedObjectCandidates(text)];

  for (const candidate of candidates) {
    const direct = tryJsonParse(candidate);
    if (direct && typeof direct === "object" && !Array.isArray(direct)) return direct;

    const normalized = stripTrailingCommas(quoteBareKeys(replaceSingleQuotedStrings(candidate)));
    const parsed = tryJsonParse(normalized);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  }

  return null;
}

function findNestedGraphqlBody(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 6) return null;

  if (
    Object.prototype.hasOwnProperty.call(value, "query") ||
    Object.prototype.hasOwnProperty.call(value, "variables") ||
    Object.prototype.hasOwnProperty.call(value, "operationName") ||
    Object.prototype.hasOwnProperty.call(value, "extensions") ||
    Object.prototype.hasOwnProperty.call(value, "id") ||
    Object.prototype.hasOwnProperty.call(value, "queryId") ||
    Object.prototype.hasOwnProperty.call(value, "documentId") ||
    Object.prototype.hasOwnProperty.call(value, "operationId")
  ) {
    return value;
  }

  for (const key of Object.keys(value)) {
    const nested = value[key];

    if (typeof nested === "string" && /(query|variables|operationName|extensions|persisted|sha256|documentId|operationId|queryId|id|graphql)/i.test(nested)) {
      const parsed = parseJsonishObject(nested);
      const found = findNestedGraphqlBody(parsed, depth + 1);
      if (found) return found;
    }

    if (nested && typeof nested === "object") {
      const found = findNestedGraphqlBody(nested, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

function sanitizeGraphqlBody(body) {
  const allowed = {};
  const source = body && typeof body === "object" ? body : {};

  for (const key of [
    "operationName",
    "query",
    "variables",
    "extensions",
    "id",
    "queryId",
    "documentId",
    "operationId",
    "hash",
    "sha256Hash"
  ]) {
    if (Object.prototype.hasOwnProperty.call(source, key)) allowed[key] = source[key];
  }

  if (!Object.prototype.hasOwnProperty.call(allowed, "variables")) allowed.variables = {};
  if (allowed.variables === null || typeof allowed.variables !== "object") allowed.variables = {};

  return allowed;
}

function candidateStringSources(value, depth = 0, path = "candidate") {
  if (value === null || value === undefined || depth > 5) return [];

  if (typeof value === "string") {
    return /(query|variables|operationName|extensions|persisted|sha256|documentId|operationId|queryId|id|body|graphql)/i.test(value)
      ? [{ path, value }]
      : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => candidateStringSources(item, depth + 1, `${path}[${index}]`));
  }

  if (typeof value === "object") {
    return Object.keys(value).flatMap((key) => candidateStringSources(value[key], depth + 1, `${path}.${key}`));
  }

  return [];
}

function candidateObjectSources(candidate) {
  const sources = [];
  const seen = new Set();

  function add(value, sourcePath) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const key = sha256(JSON.stringify(value));
    if (seen.has(key)) return;
    seen.add(key);
    sources.push({ sourcePath, value });
  }

  add(candidate, "candidate");

  for (const key of [
    "body",
    "value",
    "parsedValue",
    "parsedObject",
    "bodyLikeObject",
    "graphqlBody",
    "requestBody",
    "request",
    "payload",
    "object",
    "json",
    "candidateValue",
    "rawObject"
  ]) {
    if (candidate && typeof candidate === "object" && candidate[key] && typeof candidate[key] === "object") {
      add(candidate[key], `candidate.${key}`);
    }
  }

  for (const source of candidateStringSources(candidate)) {
    const parsed = parseJsonishObject(source.value);
    if (parsed) add(parsed, `${source.path}::parsed`);

    for (const balanced of findBalancedObjectCandidates(source.value)) {
      const parsedBalanced = parseJsonishObject(balanced);
      if (parsedBalanced) add(parsedBalanced, `${source.path}::balanced`);
    }
  }

  return sources;
}

function valueLooksLikeGraphqlBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;

  if (typeof body.query === "string" && body.query.trim()) return true;
  if (body.extensions && typeof body.extensions === "object") return true;
  if (typeof body.id === "string" && body.id.trim()) return true;
  if (typeof body.queryId === "string" && body.queryId.trim()) return true;
  if (typeof body.documentId === "string" && body.documentId.trim()) return true;
  if (typeof body.operationId === "string" && body.operationId.trim()) return true;
  if (typeof body.operationName === "string" && body.operationName.trim()) return true;
  if (body.hash || body.sha256Hash) return true;

  const nonEmptyKeys = Object.keys(body).filter((key) => {
    if (key !== "variables") return true;
    return body.variables && typeof body.variables === "object" && Object.keys(body.variables).length > 0;
  });

  return nonEmptyKeys.length > 0 && !(
    nonEmptyKeys.length === 1 &&
    nonEmptyKeys[0] === "variables"
  );
}

function buildRequestBodyFromBodyLikeCandidate(candidate) {
  const sources = candidateObjectSources(candidate);

  for (const source of sources) {
    const direct = findNestedGraphqlBody(source.value) || source.value;
    const sanitized = sanitizeGraphqlBody(direct);

    if (valueLooksLikeGraphqlBody(sanitized)) {
      return {
        body: sanitized,
        bodyBuildStatus: "built_from_refined_graphql_body_like_candidate",
        requestBodyVariant: "refined_graphql_body_like_candidate",
        requestBodySourcePath: source.sourcePath
      };
    }
  }

  return {
    body: null,
    bodyBuildStatus: "blocked_unable_to_build_request_body_from_refined_body_like_candidate",
    requestBodyVariant: "none",
    requestBodySourcePath: null
  };
}
function hasKeyword(text, re) {
  return re.test(String(text || ""));
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const rawText = await response.text();
    return {
      fetchStatus: "fetched_ok",
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get("content-type") || "",
      rawText
    };
  } catch (error) {
    return {
      fetchStatus: "fetch_error",
      status: null,
      statusText: null,
      contentType: "",
      rawText: "",
      fetchErrorName: error?.name || "Error",
      fetchErrorMessage: error?.message || String(error)
    };
  } finally {
    clearTimeout(timer);
  }
}

async function buildExecutionRow(row, args) {
  const candidate = row.primaryRefinementCandidate || {};
  const built = buildRequestBodyFromBodyLikeCandidate(candidate);

  const base = {
    competitionSlug: row.competitionSlug,
    reusableFamily: row.reusableFamily,
    runnerTargetId: row.runnerTargetId,
    finalApprovalStatus: row.finalApprovalStatus,
    approvedExecutionScope: row.finalApprovedExecutionScope,
    approvedExecutionMode: row.finalApprovedExecutionMode,

    previousHttpStatus: row.previousHttpStatus,
    previousRequestBodyVariant: row.previousRequestBodyVariant,
    previousResponseHasErrorsKey: row.previousResponseHasErrorsKey,
    previousResponseHasDataKey: row.previousResponseHasDataKey,
    previousQueryBodyRecoveryResponseCandidate: row.previousQueryBodyRecoveryResponseCandidate,

    primaryRefinementCandidateType: row.primaryRefinementCandidateType,
    primaryRefinementCandidateScore: row.primaryRefinementCandidateScore,
    primaryRefinementCandidateSource: row.primaryRefinementCandidateSource,
    primaryRefinementCandidateSha256: row.primaryRefinementCandidateSha256,
    requestBodyBuildStatus: built.bodyBuildStatus,
    requestBodyVariant: built.requestBodyVariant,
    requestBodySha256: built.body ? sha256(JSON.stringify(built.body)) : null,
    requestBodyPreview: built.body ? JSON.stringify(built.body).slice(0, 1200) : null,

    finalRunWouldAllowControlledRefinedCandidateQueryBodyRecovery: row.finalRunWouldAllowControlledRefinedCandidateQueryBodyRecovery,
    finalRunWouldAllowConfiguredGraphqlPayloadFetch: row.finalRunWouldAllowConfiguredGraphqlPayloadFetch,
    finalRunWouldAllowSearch: row.finalRunWouldAllowSearch,
    finalRunWouldAllowBroadSearch: row.finalRunWouldAllowBroadSearch,
    finalRunWouldAllowClassifier: row.finalRunWouldAllowClassifier,
    finalRunWouldAllowCanonicalWrite: row.finalRunWouldAllowCanonicalWrite,
    finalRunWouldAllowProductionWrite: row.finalRunWouldAllowProductionWrite,
    finalRunWouldAllowTruthAssertion: row.finalRunWouldAllowTruthAssertion,

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
    refinedCandidateResponseIsTruth: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    zeroResultDoesNotImplyAbsence: true,
    missingStandingKeywordDoesNotProveAbsence: true,
    noMatchTodayDoesNotImplyInactive: true
  };

  if (!built.body) {
    return {
      ...base,
      executionStatus: "blocked_refined_candidate_request_body_build_failed",
      fetchStatus: "not_attempted",
      status: null,
      contentType: "",
      rawTextLength: 0,
      rawTextSha256: null,
      rawTextPreview: "",
      hasJsonContentType: false,
      responseJsonParsed: false,
      responseHasDataKey: false,
      responseHasErrorsKey: false,
      hasGraphqlKeyword: false,
      hasStandingKeyword: false,
      refinedCandidateResponseCandidate: false,
      nextAllowedStep: "inspect_refined_body_like_candidate_shape_and_repair_builder",
      nextBlockedStep: "classifier_canonical_write_production_write_truth_assertions_blocked"
    };
  }

  const fetchResult = await fetchWithTimeout(args.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept": "application/json, text/plain, */*",
      "origin": "https://www.svenskfotboll.se",
      "referer": "https://www.svenskfotboll.se/"
    },
    body: JSON.stringify(built.body)
  }, args.timeoutMs);

  const rawText = fetchResult.rawText || "";
  const parsed = (() => {
    try { return JSON.parse(rawText); } catch { return null; }
  })();

  const hasJsonContentType = /json/i.test(fetchResult.contentType || "");
  const responseHasDataKey = Boolean(parsed && typeof parsed === "object" && Object.prototype.hasOwnProperty.call(parsed, "data"));
  const responseHasErrorsKey = Boolean(parsed && typeof parsed === "object" && Object.prototype.hasOwnProperty.call(parsed, "errors"));
  const hasGraphqlKeyword = hasKeyword(rawText, /graphql|operationName|errors|data/i);
  const hasStandingKeyword = hasKeyword(rawText, /standing|standings|tabell|table|poäng|poang|points|pts|played|spelade|team|club|lag/i);

  const refinedCandidateResponseCandidate =
    fetchResult.fetchStatus === "fetched_ok" &&
    fetchResult.status >= 200 &&
    fetchResult.status < 300 &&
    (responseHasDataKey || hasStandingKeyword) &&
    !responseHasErrorsKey;

  const executionStatus =
    fetchResult.fetchStatus !== "fetched_ok"
      ? "refined_candidate_query_body_recovery_fetch_error"
      : fetchResult.status < 200 || fetchResult.status >= 300
        ? "refined_candidate_query_body_recovery_http_not_ok"
        : refinedCandidateResponseCandidate
          ? "refined_candidate_query_body_recovery_candidate_response_received"
          : responseHasErrorsKey
            ? "refined_candidate_query_body_recovery_graphql_error_response"
            : "refined_candidate_query_body_recovery_response_received_but_not_payload_ready";

  return {
    ...base,
    executionStatus,
    fetchStatus: fetchResult.fetchStatus,
    status: fetchResult.status,
    statusText: fetchResult.statusText,
    contentType: fetchResult.contentType,
    resolvedFetchUrl: args.endpoint,
    rawTextLength: rawText.length,
    rawTextSha256: rawText ? sha256(rawText) : null,
    rawTextPreview: rawText.slice(0, 2500),
    fetchErrorName: fetchResult.fetchErrorName || null,
    fetchErrorMessage: fetchResult.fetchErrorMessage || null,
    hasJsonContentType,
    responseJsonParsed: Boolean(parsed),
    responseJsonTopLevelKeys: parsed && typeof parsed === "object" ? Object.keys(parsed).slice(0, 20) : [],
    responseHasDataKey,
    responseHasErrorsKey,
    hasGraphqlKeyword,
    hasStandingKeyword,
    refinedCandidateResponseCandidate,
    fetchExecutedNow: true,
    nextAllowedStep:
      refinedCandidateResponseCandidate
        ? "review_refined_candidate_response_and_build_no_write_sportomedia_payload_parser"
        : "review_refined_candidate_response_and_prepare_next_query_body_refinement",
    nextBlockedStep: "classifier_canonical_write_production_write_truth_assertions_blocked"
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const approval = readJson(args.approvalInput);
  const finalApprovalRows = validateApproval(approval);

  const executionRows = [];
  for (const row of finalApprovalRows.sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug))) {
    executionRows.push(await buildExecutionRow(row, args));
  }

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "run-football-truth-controlled-sportomedia-graphql-query-body-recovery-refined-candidate-execution-file",
    mode: "controlled_diagnostics_only_sportomedia_graphql_query_body_recovery_refined_candidate_execution_fetch_allowed_for_approved_targets_only",
    sourceFetch: true,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: false,
    endpoint: args.endpoint,
    inputs: {
      finalExplicitControlledSportomediaGraphqlQueryBodyRecoveryRefinedCandidateExecutionRunApproval: args.approvalInput
    },
    summary: {
      controlledSportomediaGraphqlQueryBodyRecoveryRefinedCandidateExecutionCompetitionCount: executionRows.length,
      controlledRefinedCandidateQueryBodyRecoveryExecutedCount: executionRows.filter((row) => row.fetchExecutedNow).length,
      configuredGraphqlPayloadFetchExecutedCount: executionRows.filter((row) => row.fetchExecutedNow).length,
      requestBodyBuiltCount: executionRows.filter((row) => row.requestBodyBuildStatus !== "blocked_unable_to_build_request_body_from_refined_body_like_candidate").length,
      requestBodyBuildBlockedCount: executionRows.filter((row) => row.requestBodyBuildStatus === "blocked_unable_to_build_request_body_from_refined_body_like_candidate").length,

      fetchedOkCount: executionRows.filter((row) => row.fetchStatus === "fetched_ok").length,
      httpOkCount: executionRows.filter((row) => row.fetchStatus === "fetched_ok" && row.status >= 200 && row.status < 300).length,
      httpNotOkCount: executionRows.filter((row) => row.fetchStatus === "fetched_ok" && !(row.status >= 200 && row.status < 300)).length,
      fetchErrorCount: executionRows.filter((row) => row.fetchStatus === "fetch_error").length,

      totalResponseRawTextLength: executionRows.reduce((sum, row) => sum + Number(row.rawTextLength || 0), 0),
      jsonContentTypeCount: executionRows.filter((row) => row.hasJsonContentType).length,
      responseJsonParsedCount: executionRows.filter((row) => row.responseJsonParsed).length,
      responseHasDataKeyCount: executionRows.filter((row) => row.responseHasDataKey).length,
      responseHasErrorsKeyCount: executionRows.filter((row) => row.responseHasErrorsKey).length,
      graphqlKeywordResponseCount: executionRows.filter((row) => row.hasGraphqlKeyword).length,
      standingKeywordResponseCount: executionRows.filter((row) => row.hasStandingKeyword).length,
      refinedCandidateResponseCandidateCount: executionRows.filter((row) => row.refinedCandidateResponseCandidate).length,

      fetchExecutedNowCount: executionRows.filter((row) => row.fetchExecutedNow).length,
      searchExecutedNowCount: 0,
      broadSearchExecutedNowCount: 0,
      classifierExecutedNowCount: 0,
      canonicalWriteExecutedNowCount: 0,
      productionWriteExecutedNowCount: 0,
      activeAssertedCount: 0,
      inactiveAssertedCount: 0,
      completedAssertedCount: 0,
      seasonStateTruthAssertedCount: 0,
      refinedCandidateResponseTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        executionRows.some((row) => row.refinedCandidateResponseCandidate)
          ? "review_refined_candidate_response_and_build_no_write_sportomedia_payload_parser"
          : "review_refined_candidate_response_and_prepare_next_query_body_refinement"
    },
    counts: {
      byExecutionStatus: countBy(executionRows, "executionStatus"),
      byFetchStatus: countBy(executionRows, "fetchStatus"),
      byHttpStatus: countBy(executionRows, "status"),
      byRequestBodyBuildStatus: countBy(executionRows, "requestBodyBuildStatus"),
      byRequestBodyVariant: countBy(executionRows, "requestBodyVariant"),
      byNextAllowedStep: countBy(executionRows, "nextAllowedStep")
    },
    guardrails: [
      "This runner executes only the final-approved Sportomedia GraphQL refined body-like query/body recovery targets for swe.1 and swe.2.",
      "It may fetch only the configured Sportomedia GraphQL endpoint for approved refined-candidate query/body recovery targets.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a season-state classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Refined-candidate responses are diagnostic candidates only.",
      "Endpoint reachability is not standings truth.",
      "Response data is not canonical truth until later parser/evidence gates pass.",
      "Missing standing keyword does not prove absence.",
      "No match today must not imply inactive.",
      "Zero result must not imply absence."
    ],
    executionRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    controlledSportomediaGraphqlQueryBodyRecoveryRefinedCandidateExecutionCompetitionCount: output.summary.controlledSportomediaGraphqlQueryBodyRecoveryRefinedCandidateExecutionCompetitionCount,
    controlledRefinedCandidateQueryBodyRecoveryExecutedCount: output.summary.controlledRefinedCandidateQueryBodyRecoveryExecutedCount,
    configuredGraphqlPayloadFetchExecutedCount: output.summary.configuredGraphqlPayloadFetchExecutedCount,
    requestBodyBuiltCount: output.summary.requestBodyBuiltCount,
    requestBodyBuildBlockedCount: output.summary.requestBodyBuildBlockedCount,
    fetchedOkCount: output.summary.fetchedOkCount,
    httpOkCount: output.summary.httpOkCount,
    httpNotOkCount: output.summary.httpNotOkCount,
    fetchErrorCount: output.summary.fetchErrorCount,
    totalResponseRawTextLength: output.summary.totalResponseRawTextLength,
    jsonContentTypeCount: output.summary.jsonContentTypeCount,
    responseJsonParsedCount: output.summary.responseJsonParsedCount,
    responseHasDataKeyCount: output.summary.responseHasDataKeyCount,
    responseHasErrorsKeyCount: output.summary.responseHasErrorsKeyCount,
    graphqlKeywordResponseCount: output.summary.graphqlKeywordResponseCount,
    standingKeywordResponseCount: output.summary.standingKeywordResponseCount,
    refinedCandidateResponseCandidateCount: output.summary.refinedCandidateResponseCandidateCount,
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
    refinedCandidateResponseTruthCount: output.summary.refinedCandidateResponseTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    userHintUsedCount: output.summary.userHintUsedCount,
    hardcodedSeasonStateOverrideUsedCount: output.summary.hardcodedSeasonStateOverrideUsedCount,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
