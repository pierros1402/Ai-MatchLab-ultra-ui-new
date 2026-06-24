import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DATE = "2026-06-15";
const ALLOW_EXECUTE = process.argv.includes("--allow-execute");
const ALLOW_FETCH = process.argv.includes("--allow-fetch");
const ALLOW_SEARCH = process.argv.includes("--allow-search");

const approvalPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-real-acquisition-execution-approval-gate-2026-06-15",
  "controlled-real-acquisition-execution-approval-gate-2026-06-15.json"
);

const qualityGatePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-real-acquisition-proof-lane-quality-gate-2026-06-15",
  "controlled-real-acquisition-proof-lane-quality-gate-2026-06-15.json"
);

const planPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-real-acquisition-proof-lane-plan-2026-06-15",
  "controlled-real-acquisition-proof-lane-plan-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-real-acquisition-smoke-runner-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "controlled-real-acquisition-smoke-runner-2026-06-15.json"
);

const CONTROLLED_ROUTE_BY_COMPETITION = {
  "esp.1": {
    providerFamily: "laliga",
    competitionName: "LaLiga EA Sports",
    fetchUrl: "https://www.laliga.com/en-GB/laliga-easports/standing",
    searchUrl: "https://www.laliga.com/en-GB/laliga-easports/results",
    evidenceMarkers: ["laliga", "easports", "standing", "clasificación", "classification"]
  },
  "esp.2": {
    providerFamily: "laliga",
    competitionName: "LaLiga Hypermotion",
    fetchUrl: "https://www.laliga.com/en-GB/laliga-hypermotion/standing",
    searchUrl: "https://www.laliga.com/en-GB/laliga-hypermotion/results",
    evidenceMarkers: ["laliga", "hypermotion", "standing", "clasificación", "classification"]
  },
  "nor.1": {
    providerFamily: "norway_ntf",
    competitionName: "Eliteserien",
    fetchUrl: "https://www.eliteserien.no/tabell",
    searchUrl: "https://www.eliteserien.no/terminliste",
    evidenceMarkers: ["eliteserien", "tabell", "terminliste", "kamper", "standings"]
  },
  "nor.2": {
    providerFamily: "norway_ntf",
    competitionName: "OBOS-ligaen",
    fetchUrl: "https://www.obos-ligaen.no/tabell",
    searchUrl: "https://www.obos-ligaen.no/terminliste",
    evidenceMarkers: ["obos", "ligaen", "tabell", "terminliste", "standings"]
  },
  "swe.1": {
    providerFamily: "sportomedia",
    competitionName: "Allsvenskan",
    fetchUrl: "https://www.allsvenskan.se/",
    searchUrl: "https://www.allsvenskan.se/tabell",
    evidenceMarkers: ["allsvenskan", "tabell", "matcher", "standings", "sportomedia"]
  },
  "swe.2": {
    providerFamily: "sportomedia",
    competitionName: "Superettan",
    fetchUrl: "https://www.superettan.se/",
    searchUrl: "https://www.superettan.se/tabell",
    evidenceMarkers: ["superettan", "tabell", "matcher", "standings", "sportomedia"]
  }
};

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing required input file: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertZero(value, name) {
  if (value !== undefined && value !== null && value !== 0) {
    throw new Error(`Expected ${name}=0, got ${value}`);
  }
}

function assertFalse(value, name) {
  if (value !== undefined && value !== null && value !== false) {
    throw new Error(`Expected ${name}=false, got ${value}`);
  }
}

function countWhere(rows, predicate) {
  return rows.filter(predicate).length;
}

function sha256(input) {
  return crypto.createHash("sha256").update(input || "").digest("hex");
}

function normalizeText(input) {
  return String(input || "").toLowerCase();
}

function markerHits(text, markers) {
  const normalized = normalizeText(text);
  return markers.filter((marker) => normalized.includes(String(marker).toLowerCase()));
}

function evidenceStatusFromAttempt(attempt, markers) {
  if (!attempt.responded) return "no_response";
  if (attempt.statusCode < 200 || attempt.statusCode >= 500) return "non_success_or_server_error_response";
  if (attempt.bodyCharCount < 100) return "response_too_small_for_evidence";
  if (markerHits(attempt.bodySample, markers).length === 0 && markerHits(attempt.bodyHashInput, markers).length === 0) {
    return "no_expected_marker_in_sample";
  }
  return "accepted_controlled_real_evidence";
}

async function fetchControlledUrl({ url, competitionSlug, providerFamily, attemptKind, timeoutMs = 20000, maxChars = 250000 }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = new Date().toISOString();

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Ai-MatchLab-FootballTruth-ControlledEvidenceSmoke/1.0",
        "accept": "text/html,application/json;q=0.9,text/plain;q=0.8,*/*;q=0.5"
      }
    });

    const text = await response.text();
    const clipped = text.slice(0, maxChars);

    return {
      attemptKind,
      competitionSlug,
      providerFamily,
      url,
      startedAt,
      completedAt: new Date().toISOString(),
      responded: true,
      ok: response.ok,
      statusCode: response.status,
      statusText: response.statusText,
      finalUrl: response.url,
      contentType: response.headers.get("content-type") || null,
      bodyCharCount: text.length,
      clippedBodyCharCount: clipped.length,
      bodySha256: sha256(clipped),
      bodySample: clipped.slice(0, 2000),
      bodyHashInput: clipped,
      errorName: null,
      errorMessage: null
    };
  } catch (error) {
    return {
      attemptKind,
      competitionSlug,
      providerFamily,
      url,
      startedAt,
      completedAt: new Date().toISOString(),
      responded: false,
      ok: false,
      statusCode: null,
      statusText: null,
      finalUrl: null,
      contentType: null,
      bodyCharCount: 0,
      clippedBodyCharCount: 0,
      bodySha256: null,
      bodySample: "",
      bodyHashInput: "",
      errorName: error?.name || "Error",
      errorMessage: error?.message || String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function validateApproval(input) {
  const s = input.summary || {};

  if (s.controlledRealAcquisitionExecutionApprovalGateReadCount !== 2) throw new Error("Expected approval gate read count 2");
  if (s.controlledRealAcquisitionExecutionApprovalRowCount !== 6) throw new Error("Expected approval rows 6");
  if (s.approvedControlledRealAcquisitionExecutionApprovalRowCount !== 6) throw new Error("Expected approved rows 6");
  if (s.blockedControlledRealAcquisitionExecutionApprovalRowCount !== 0) throw new Error("Expected blocked approval rows 0");
  if (s.mayRunControlledRealAcquisitionSmokeRunnerCount !== 1) throw new Error("Expected mayRunControlledRealAcquisitionSmokeRunnerCount 1");

  if (s.nextRunnerMayExecuteControlledRealAcquisitionCount !== 6) throw new Error("Expected next runner execute permission for 6 targets");
  if (s.nextRunnerMayFetchControlledRealEvidenceCount !== 6) throw new Error("Expected next runner fetch permission for 6 targets");
  if (s.nextRunnerMaySearchControlledRealEvidenceCount !== 6) throw new Error("Expected next runner search permission for 6 targets");

  [
    "currentGateIsExecutionPermissionNowCount",
    "currentGateIsFetchPermissionNowCount",
    "currentGateIsSearchPermissionNowCount",
    "currentGateIsBroadSearchPermissionNowCount",
    "currentGateIsClassifierPermissionNowCount",
    "currentGateIsCanonicalWritePermissionNowCount",
    "currentGateIsProductionWritePermissionNowCount",
    "currentGateIsTruthAssertionPermissionNowCount",
    "nextRunnerMayBroadSearchCount",
    "nextRunnerMayClassifyCount",
    "nextRunnerMayWriteCanonicalCount",
    "nextRunnerMayWriteProductionCount",
    "nextRunnerMayAssertTruthCount",
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "truthAssertionExecutedNowCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `approval.summary.${key}`));

  assertFalse(input.productionWrite, "approval.productionWrite");
  assertFalse(input.sourceFetch?.executed, "approval.sourceFetch.executed");
  assertFalse(input.broadSearchUsed, "approval.broadSearchUsed");
  assertFalse(input.classifierExecuted, "approval.classifierExecuted");
}

function validateQualityGate(input) {
  const s = input.summary || {};

  if (s.passedProofTargetQualityGateRowCount !== 6) throw new Error("Expected passed target quality gate rows 6");
  if (s.passedProofLaneQualityGateRowCount !== 3) throw new Error("Expected passed lane quality gate rows 3");
  if (s.passedSuccessCriteriaQualityGateRowCount !== 5) throw new Error("Expected passed success criteria rows 5");
  if (s.mayBuildControlledRealAcquisitionExecutionApprovalGateCount !== 1) throw new Error("Expected may build execution approval gate 1");

  [
    "mayFetchControlledRealAcquisitionNowCount",
    "maySearchControlledRealAcquisitionNowCount",
    "mayClassifyControlledRealAcquisitionNowCount",
    "mayWriteCanonicalControlledRealAcquisitionNowCount",
    "mayWriteProductionControlledRealAcquisitionNowCount",
    "mayAssertTruthControlledRealAcquisitionNowCount",
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "truthAssertionExecutedNowCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `qualityGate.summary.${key}`));

  assertFalse(input.productionWrite, "qualityGate.productionWrite");
  assertFalse(input.sourceFetch?.executed, "qualityGate.sourceFetch.executed");
  assertFalse(input.broadSearchUsed, "qualityGate.broadSearchUsed");
  assertFalse(input.classifierExecuted, "qualityGate.classifierExecuted");
}

function validatePlan(input) {
  const s = input.summary || {};

  if (s.proofTargetRowCount !== 6) throw new Error("Expected proof targets 6");
  if (s.proofLaneRowCount !== 3) throw new Error("Expected proof lanes 3");
  if (s.successCriteriaRowCount !== 5) throw new Error("Expected success criteria 5");

  [
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "truthAssertionExecutedNowCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `plan.summary.${key}`));

  assertFalse(input.productionWrite, "plan.productionWrite");
}

if (!ALLOW_EXECUTE) throw new Error("Refusing smoke runner without --allow-execute");
if (!ALLOW_FETCH) throw new Error("Refusing smoke runner without --allow-fetch");
if (!ALLOW_SEARCH) throw new Error("Refusing smoke runner without --allow-search");

const approval = readJson(approvalPath);
const qualityGate = readJson(qualityGatePath);
const plan = readJson(planPath);

validateApproval(approval);
validateQualityGate(qualityGate);
validatePlan(plan);

const approvalRows = Array.isArray(approval.approvalRows) ? approval.approvalRows : [];

if (approvalRows.length !== 6) throw new Error(`Expected 6 approval rows, got ${approvalRows.length}`);

for (const row of approvalRows) {
  if (row.approvalStatus !== "approved_for_explicit_controlled_real_acquisition_smoke_runner") {
    throw new Error(`Non-approved row found: ${row.controlledRealAcquisitionExecutionApprovalRowId}`);
  }
  if (row.nextRunnerMayExecuteControlledRealAcquisition !== true) throw new Error(`Missing execute permission for ${row.competitionSlug}`);
  if (row.nextRunnerMayFetchControlledRealEvidence !== true) throw new Error(`Missing fetch permission for ${row.competitionSlug}`);
  if (row.nextRunnerMaySearchControlledRealEvidence !== true) throw new Error(`Missing search permission for ${row.competitionSlug}`);
  if (row.nextRunnerMayBroadSearch !== false) throw new Error(`Broad search unexpectedly allowed for ${row.competitionSlug}`);
  if (row.nextRunnerMayClassify !== false) throw new Error(`Classifier unexpectedly allowed for ${row.competitionSlug}`);
  if (row.nextRunnerMayWriteCanonical !== false) throw new Error(`Canonical write unexpectedly allowed for ${row.competitionSlug}`);
  if (row.nextRunnerMayWriteProduction !== false) throw new Error(`Production write unexpectedly allowed for ${row.competitionSlug}`);
  if (row.nextRunnerMayAssertTruth !== false) throw new Error(`Truth assertion unexpectedly allowed for ${row.competitionSlug}`);
}

const controlledFetchAttemptRows = [];
const controlledSearchAttemptRows = [];

for (const approvalRow of approvalRows) {
  const route = CONTROLLED_ROUTE_BY_COMPETITION[approvalRow.competitionSlug];

  if (!route) {
    controlledFetchAttemptRows.push({
      attemptKind: "controlled_provider_fetch",
      competitionSlug: approvalRow.competitionSlug,
      providerFamily: approvalRow.providerFamily,
      url: null,
      responded: false,
      ok: false,
      statusCode: null,
      bodyCharCount: 0,
      bodySha256: null,
      bodySample: "",
      errorName: "MissingControlledRoute",
      errorMessage: `No controlled route configured for ${approvalRow.competitionSlug}`
    });
    controlledSearchAttemptRows.push({
      attemptKind: "controlled_provider_search",
      competitionSlug: approvalRow.competitionSlug,
      providerFamily: approvalRow.providerFamily,
      url: null,
      responded: false,
      ok: false,
      statusCode: null,
      bodyCharCount: 0,
      bodySha256: null,
      bodySample: "",
      errorName: "MissingControlledRoute",
      errorMessage: `No controlled search route configured for ${approvalRow.competitionSlug}`
    });
    continue;
  }

  if (route.providerFamily !== approvalRow.providerFamily) {
    throw new Error(`Provider mismatch for ${approvalRow.competitionSlug}: approval=${approvalRow.providerFamily} route=${route.providerFamily}`);
  }

  const fetchAttempt = await fetchControlledUrl({
    url: route.fetchUrl,
    competitionSlug: approvalRow.competitionSlug,
    providerFamily: approvalRow.providerFamily,
    attemptKind: "controlled_provider_fetch"
  });

  controlledFetchAttemptRows.push(fetchAttempt);

  const searchAttempt = await fetchControlledUrl({
    url: route.searchUrl,
    competitionSlug: approvalRow.competitionSlug,
    providerFamily: approvalRow.providerFamily,
    attemptKind: "controlled_provider_search"
  });

  controlledSearchAttemptRows.push(searchAttempt);
}

const acceptedEvidenceRows = [];

for (const attempt of [...controlledFetchAttemptRows, ...controlledSearchAttemptRows]) {
  const route = CONTROLLED_ROUTE_BY_COMPETITION[attempt.competitionSlug];
  const markers = route?.evidenceMarkers || [];
  const hits = markerHits(`${attempt.bodySample}\n${attempt.bodyHashInput}`, markers);
  const evidenceStatus = evidenceStatusFromAttempt(attempt, markers);

  if (evidenceStatus === "accepted_controlled_real_evidence") {
    acceptedEvidenceRows.push({
      controlledRealAcquisitionAcceptedEvidenceRowId: `controlled_real_acquisition_accepted_evidence_${String(acceptedEvidenceRows.length + 1).padStart(2, "0")}`,
      attemptKind: attempt.attemptKind,
      competitionSlug: attempt.competitionSlug,
      providerFamily: attempt.providerFamily,
      url: attempt.url,
      finalUrl: attempt.finalUrl,
      statusCode: attempt.statusCode,
      contentType: attempt.contentType,
      bodyCharCount: attempt.bodyCharCount,
      clippedBodyCharCount: attempt.clippedBodyCharCount,
      bodySha256: attempt.bodySha256,
      markerHits: hits,
      evidenceStatus,
      acceptedEvidenceKind:
        attempt.attemptKind === "controlled_provider_fetch"
          ? "controlled_real_provider_page_fetch_evidence"
          : "controlled_real_provider_route_search_evidence",
      standingsOrSeasonStateDeltaCandidate: true,
      canonicalWriteCandidateOnly: true,
      canonicalWriteExecutedNow: false,
      productionWriteExecutedNow: false,
      truthAssertionExecutedNow: false
    });
  }
}

const evidenceAttemptRows = [...controlledFetchAttemptRows, ...controlledSearchAttemptRows].map((attempt) => {
  const route = CONTROLLED_ROUTE_BY_COMPETITION[attempt.competitionSlug];
  const markers = route?.evidenceMarkers || [];
  const hits = markerHits(`${attempt.bodySample}\n${attempt.bodyHashInput}`, markers);

  return {
    attemptKind: attempt.attemptKind,
    competitionSlug: attempt.competitionSlug,
    providerFamily: attempt.providerFamily,
    url: attempt.url,
    finalUrl: attempt.finalUrl,
    responded: attempt.responded,
    ok: attempt.ok,
    statusCode: attempt.statusCode,
    statusText: attempt.statusText,
    contentType: attempt.contentType,
    bodyCharCount: attempt.bodyCharCount,
    clippedBodyCharCount: attempt.clippedBodyCharCount,
    bodySha256: attempt.bodySha256,
    markerHits: hits,
    evidenceStatus: evidenceStatusFromAttempt(attempt, markers),
    errorName: attempt.errorName,
    errorMessage: attempt.errorMessage
  };
});

const summary = {
  controlledRealAcquisitionSmokeRunnerReadCount: 3,
  allowExecuteFlagPresent: true,
  allowFetchFlagPresent: true,
  allowSearchFlagPresent: true,

  sourceExecutionApprovalRowCount: approvalRows.length,
  approvedExecutionApprovalRowCount: approvalRows.length,

  controlledFetchAttemptCount: controlledFetchAttemptRows.length,
  controlledSearchAttemptCount: controlledSearchAttemptRows.length,
  controlledRealAcquisitionAttemptCount: controlledFetchAttemptRows.length + controlledSearchAttemptRows.length,

  respondedControlledFetchAttemptCount: countWhere(controlledFetchAttemptRows, (row) => row.responded === true),
  respondedControlledSearchAttemptCount: countWhere(controlledSearchAttemptRows, (row) => row.responded === true),

  okControlledFetchAttemptCount: countWhere(controlledFetchAttemptRows, (row) => row.ok === true),
  okControlledSearchAttemptCount: countWhere(controlledSearchAttemptRows, (row) => row.ok === true),

  acceptedEvidenceRowCount: acceptedEvidenceRows.length,
  acceptedEvidenceCompetitionCount: new Set(acceptedEvidenceRows.map((row) => row.competitionSlug)).size,
  standingsOrSeasonStateDeltaCandidateCount: countWhere(
    acceptedEvidenceRows,
    (row) => row.standingsOrSeasonStateDeltaCandidate === true
  ),
  canonicalWriteCandidateOnlyCount: countWhere(
    acceptedEvidenceRows,
    (row) => row.canonicalWriteCandidateOnly === true
  ),

  laligaAcceptedEvidenceCount: countWhere(acceptedEvidenceRows, (row) => row.providerFamily === "laliga"),
  norwayNtfAcceptedEvidenceCount: countWhere(acceptedEvidenceRows, (row) => row.providerFamily === "norway_ntf"),
  sportomediaAcceptedEvidenceCount: countWhere(acceptedEvidenceRows, (row) => row.providerFamily === "sportomedia"),

  controlledRealAcquisitionProducedEvidenceCount: acceptedEvidenceRows.length > 0 ? 1 : 0,
  mayVerifyControlledRealAcquisitionSmokeRunnerCount: 1,

  fetchExecutedNowCount: controlledFetchAttemptRows.length,
  searchExecutedNowCount: controlledSearchAttemptRows.length,
  broadSearchExecutedNowCount: 0,
  classifierExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  canonicalWrites: 0,
  productionWrite: false
};

const artifact = {
  job: "run-football-truth-controlled-real-acquisition-smoke-runner-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "controlled_real_acquisition_smoke_runner_explicit_execute_fetch_search_no_broad_no_classifier_no_write",
  dryRun: false,
  inputs: {
    controlledRealAcquisitionExecutionApprovalGate: approvalPath,
    controlledRealAcquisitionProofLaneQualityGate: qualityGatePath,
    controlledRealAcquisitionProofLanePlan: planPath
  },
  policy: {
    explicitAllowExecuteRequired: true,
    explicitAllowFetchRequired: true,
    explicitAllowSearchRequired: true,
    boundedTargetsOnly: ["esp.1", "esp.2", "nor.1", "nor.2", "swe.1", "swe.2"],
    controlledProviderRoutesOnly: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  verdict: {
    controlledSmokeRunnerExecuted: true,
    realFetchAttempted: controlledFetchAttemptRows.length > 0,
    realSearchAttempted: controlledSearchAttemptRows.length > 0,
    acceptedEvidenceProduced: acceptedEvidenceRows.length > 0,
    acceptedEvidenceRowCount: acceptedEvidenceRows.length,
    firstVisibleValue:
      acceptedEvidenceRows.length > 0
        ? "accepted evidence rows and standings_or_season_state_delta candidates produced"
        : "real controlled attempts executed but accepted evidence was not produced; inspect response statuses and markers",
    recommendedNextStep: "verify controlled real acquisition smoke runner and decide whether to promote accepted evidence candidates or repair blocked provider routes"
  },
  summary,
  evidenceAttemptRows,
  acceptedEvidenceRows,
  sourceFetch: { allowed: true, executed: true },
  searchProviderUsed: true,
  controlledSearchUsed: true,
  broadSearchUsed: false,
  classifierExecuted: false,
  canonicalWrites: 0,
  productionWrite: false
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

console.log(JSON.stringify({ output: outputPath, ...summary }, null, 2));
