import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";
const ALLOW_FETCH = process.argv.includes("--allow-fetch");

const inputPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "six-league-controlled-evidence-acquisition-approval-gate-2026-06-15",
  "six-league-controlled-evidence-acquisition-approval-gate-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "six-league-controlled-evidence-acquisition-execution-runner-2026-06-15"
);

const rawOutDir = path.join(outDir, "raw-payloads");

const outputPath = path.join(
  outDir,
  "six-league-controlled-evidence-acquisition-execution-runner-2026-06-15.json"
);

const routePlan = [
  {
    executionGroup: "group_01_laliga_restart_dates_only",
    family: "laliga",
    targetCompetitions: ["esp.1", "esp.2"],
    requiredEvidenceTypes: ["next_active_restart_date"],
    routes: [
      {
        competitionSlug: "esp.1",
        routePurpose: "next_active_restart_date",
        url: "https://www.laliga.com/en-GB/laliga-easports/calendar",
        allowedHost: "www.laliga.com"
      },
      {
        competitionSlug: "esp.2",
        routePurpose: "next_active_restart_date",
        url: "https://www.laliga.com/en-GB/laliga-hypermotion/calendar",
        allowedHost: "www.laliga.com"
      }
    ]
  },
  {
    executionGroup: "group_02_norway_ntf_full_truth_capture",
    family: "norway_ntf",
    targetCompetitions: ["nor.1", "nor.2"],
    requiredEvidenceTypes: [
      "standings_statistics",
      "fixtures_results",
      "season_state",
      "next_active_restart_date"
    ],
    routes: [
      {
        competitionSlug: "nor.1",
        routePurpose: "standings_statistics",
        url: "https://www.eliteserien.no/tabell",
        allowedHost: "www.eliteserien.no"
      },
      {
        competitionSlug: "nor.1",
        routePurpose: "fixtures_results_season_state_next_active_restart_date",
        url: "https://www.eliteserien.no/terminliste",
        allowedHost: "www.eliteserien.no"
      },
      {
        competitionSlug: "nor.2",
        routePurpose: "standings_statistics",
        url: "https://www.obos-ligaen.no/tabell",
        allowedHost: "www.obos-ligaen.no"
      },
      {
        competitionSlug: "nor.2",
        routePurpose: "fixtures_results_season_state_next_active_restart_date",
        url: "https://www.obos-ligaen.no/terminliste",
        allowedHost: "www.obos-ligaen.no"
      }
    ]
  },
  {
    executionGroup: "group_03_sportomedia_full_truth_capture",
    family: "sportomedia",
    targetCompetitions: ["swe.1", "swe.2"],
    requiredEvidenceTypes: [
      "standings_statistics",
      "fixtures_results",
      "season_state",
      "next_active_restart_date"
    ],
    routes: [
      {
        competitionSlug: "swe.1",
        routePurpose: "standings_statistics",
        url: "https://allsvenskan.se/tabell",
        allowedHost: "allsvenskan.se"
      },
      {
        competitionSlug: "swe.1",
        routePurpose: "fixtures_results_season_state_next_active_restart_date",
        url: "https://allsvenskan.se/matcher",
        allowedHost: "allsvenskan.se"
      },
      {
        competitionSlug: "swe.2",
        routePurpose: "standings_statistics",
        url: "https://superettan.se/tabell",
        allowedHost: "superettan.se"
      },
      {
        competitionSlug: "swe.2",
        routePurpose: "fixtures_results_season_state_next_active_restart_date",
        url: "https://superettan.se/matcher",
        allowedHost: "superettan.se"
      }
    ]
  }
];

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required input file: ${filePath}`);
  }
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

function assertApprovalGuardrails(input) {
  const s = input.summary || {};

  [
    "approvalIsExecutionPermissionNowCount",
    "approvalIsFetchPermissionNowCount",
    "approvalIsSearchPermissionNowCount",
    "approvalIsBroadSearchPermissionNowCount",
    "approvalIsClassifierPermissionNowCount",
    "approvalIsCanonicalWritePermissionNowCount",
    "approvalIsProductionWritePermissionNowCount",
    "approvalIsTruthAssertionPermissionNowCount",
    "mayExecuteRunnerNowCount",
    "mayFetchNowCount",
    "maySearchNowCount",
    "mayBroadSearchNowCount",
    "mayClassifySeasonStateNowCount",
    "mayWriteCanonicalNowCount",
    "mayAssertTruthNowCount",
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "seasonStateTruthAssertedCount",
    "sixLeagueControlledEvidenceAcquisitionApprovalGateTruthCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `summary.${key}`));

  assertZero(input.canonicalWrites, "canonicalWrites");
  assertFalse(input.productionWrite, "productionWrite");
  assertFalse(input.sourceFetch?.executed, "sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "searchProviderUsed");
  assertFalse(input.broadSearchUsed, "broadSearchUsed");
  assertFalse(input.classifierExecuted, "classifierExecuted");
}

function uniq(values) {
  return [...new Set(values)];
}

function normalizeHost(host) {
  return String(host || "").toLowerCase().replace(/^www\./, "");
}

function validateRoute(route) {
  const parsed = new URL(route.url);
  const routeHost = normalizeHost(parsed.hostname);
  const allowedHost = normalizeHost(route.allowedHost);

  if (parsed.protocol !== "https:") {
    throw new Error(`Blocked non-HTTPS route: ${route.url}`);
  }

  if (routeHost !== allowedHost) {
    throw new Error(`Route host mismatch: ${route.url} allowed=${route.allowedHost}`);
  }
}

function detectEvidenceSignals(text) {
  const lower = text.toLowerCase();

  return {
    hasStandingsSignal:
      lower.includes("standing") ||
      lower.includes("standings") ||
      lower.includes("tabell") ||
      lower.includes("table") ||
      lower.includes("points"),
    hasFixturesResultsSignal:
      lower.includes("fixture") ||
      lower.includes("fixtures") ||
      lower.includes("terminliste") ||
      lower.includes("match") ||
      lower.includes("matcher") ||
      lower.includes("result"),
    hasSeasonStateSignal:
      lower.includes("season") ||
      lower.includes("2026") ||
      lower.includes("matchday") ||
      lower.includes("round") ||
      lower.includes("omgång") ||
      lower.includes("runde"),
    hasNextActiveRestartDateSignal:
      /\b20[2-9][0-9][-/.][0-1]?[0-9][-/.][0-3]?[0-9]\b/.test(text) ||
      /\b[0-3]?[0-9][-/.][0-1]?[0-9][-/.]20[2-9][0-9]\b/.test(text) ||
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(text)
  };
}

function snippet(text) {
  return String(text || "")
    .slice(0, 4000)
    .replace(/\s+/g, " ")
    .trim();
}

function safeName(value) {
  return String(value)
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function fetchWithTimeout(route, rawPayloadPath, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(route.url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Ai-MatchLab-Football-Truth-Controlled-Evidence-Acquisition/1.1 (+no-search; diagnostics-only; raw-payload-capture)",
        "accept": "text/html,application/json,text/plain;q=0.9,*/*;q=0.8"
      }
    });

    const rawText = await response.text();
    fs.writeFileSync(rawPayloadPath, rawText, "utf8");

    return {
      fetchedOk: true,
      fetchError: null,
      httpStatus: response.status,
      httpOk: response.ok,
      contentType: response.headers.get("content-type") || null,
      responseRawTextLength: rawText.length,
      rawPayloadPath: rawPayloadPath.replace(/\\/g, "/"),
      rawPayloadPersisted: true,
      responseSnippet: snippet(rawText),
      evidenceSignals: detectEvidenceSignals(rawText)
    };
  } catch (error) {
    return {
      fetchedOk: false,
      fetchError: String(error?.message || error),
      httpStatus: null,
      httpOk: false,
      contentType: null,
      responseRawTextLength: 0,
      rawPayloadPath: rawPayloadPath.replace(/\\/g, "/"),
      rawPayloadPersisted: false,
      responseSnippet: null,
      evidenceSignals: {
        hasStandingsSignal: false,
        hasFixturesResultsSignal: false,
        hasSeasonStateSignal: false,
        hasNextActiveRestartDateSignal: false
      }
    };
  } finally {
    clearTimeout(timer);
  }
}

const approval = readJson(inputPath);
assertApprovalGuardrails(approval);

const approvalRows = Array.isArray(approval.approvalRows) ? approval.approvalRows : [];
const approvedRows = approvalRows.filter(
  (row) => row.approvalStatus === "approved_to_build_controlled_evidence_acquisition_execution_runner"
);

if (approvalRows.length !== 3) {
  throw new Error(`Expected 3 approval rows, got ${approvalRows.length}`);
}

if (approvedRows.length !== 3) {
  throw new Error(`Expected 3 approved rows, got ${approvedRows.length}`);
}

if (!ALLOW_FETCH) {
  throw new Error("Refusing to execute controlled fetches without explicit --allow-fetch");
}

for (const group of routePlan) {
  for (const route of group.routes) {
    validateRoute(route);
  }
}

const approvedExecutionGroups = uniq(approvedRows.map((row) => row.executionGroup)).sort();
const routeExecutionGroups = uniq(routePlan.map((row) => row.executionGroup)).sort();

if (JSON.stringify(approvedExecutionGroups) !== JSON.stringify(routeExecutionGroups)) {
  throw new Error(
    `Approved execution groups do not match route plan. approved=${JSON.stringify(approvedExecutionGroups)} routes=${JSON.stringify(routeExecutionGroups)}`
  );
}

fs.mkdirSync(rawOutDir, { recursive: true });

const fetchRows = [];

for (const group of routePlan) {
  const approvedRow = approvedRows.find((row) => row.executionGroup === group.executionGroup);

  if (!approvedRow) {
    throw new Error(`Missing approved row for execution group ${group.executionGroup}`);
  }

  for (const route of group.routes) {
    const rawPayloadPath = path.join(
      rawOutDir,
      `${String(fetchRows.length + 1).padStart(2, "0")}-${safeName(route.competitionSlug)}-${safeName(route.routePurpose)}.txt`
    );

    const result = await fetchWithTimeout(route, rawPayloadPath);

    fetchRows.push({
      fetchRowId: `six_league_controlled_evidence_fetch_${String(fetchRows.length + 1).padStart(2, "0")}`,
      executionGroup: group.executionGroup,
      family: group.family,
      competitionSlug: route.competitionSlug,
      routePurpose: route.routePurpose,
      url: route.url,
      allowedHost: route.allowedHost,
      approvedRunnerTargetId: approvedRow.runnerTargetId || null,
      approvedWorkPackageId: approvedRow.workPackageId || null,
      approvedSourceCompletionPlanRowCount: approvedRow.sourceCompletionPlanRowCount,
      fetchExecutedNow: true,
      ...result
    });
  }
}

function countWhere(rows, predicate) {
  return rows.filter(predicate).length;
}

const persistedRawPayloadRows = fetchRows.filter((row) => row.rawPayloadPersisted);

const summary = {
  sixLeagueControlledEvidenceAcquisitionExecutionRunnerReadCount: 1,
  approvedRunnerTargetCount: approvedRows.length,
  approvedExecutionGroupCount: approvedExecutionGroups.length,
  approvedCompetitionTargetCount: uniq(approvedRows.flatMap((row) => row.targetCompetitions || [])).length,
  approvedCompletionPlanRowCount: approvedRows.reduce(
    (sum, row) => sum + Number(row.sourceCompletionPlanRowCount || 0),
    0
  ),

  controlledRoutePlanGroupCount: routePlan.length,
  controlledRoutePlanFetchTargetCount: routePlan.flatMap((row) => row.routes).length,

  executionRunnerMayFetchNowCount: 1,
  mayFetchApprovedControlledRoutesNowCount: 1,
  fetchAttemptCount: fetchRows.length,
  fetchExecutedNowCount: fetchRows.length,
  fetchOkCount: countWhere(fetchRows, (row) => row.fetchedOk),
  fetchErrorCount: countWhere(fetchRows, (row) => !row.fetchedOk),
  httpOkCount: countWhere(fetchRows, (row) => row.httpOk),
  httpNotOkCount: countWhere(fetchRows, (row) => row.fetchedOk && !row.httpOk),

  rawPayloadPersistedCount: persistedRawPayloadRows.length,
  rawPayloadMissingCount: fetchRows.length - persistedRawPayloadRows.length,

  laligaFetchExecutedCount: countWhere(fetchRows, (row) => row.family === "laliga"),
  norwayNtfFetchExecutedCount: countWhere(fetchRows, (row) => row.family === "norway_ntf"),
  sportomediaFetchExecutedCount: countWhere(fetchRows, (row) => row.family === "sportomedia"),

  evidenceSignalStandingCount: countWhere(fetchRows, (row) => row.evidenceSignals.hasStandingsSignal),
  evidenceSignalFixturesResultsCount: countWhere(fetchRows, (row) => row.evidenceSignals.hasFixturesResultsSignal),
  evidenceSignalSeasonStateCount: countWhere(fetchRows, (row) => row.evidenceSignals.hasSeasonStateSignal),
  evidenceSignalNextActiveRestartDateCount: countWhere(fetchRows, (row) => row.evidenceSignals.hasNextActiveRestartDateSignal),

  searchExecutedNowCount: 0,
  broadSearchExecutedNowCount: 0,
  classifierExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  seasonStateTruthAssertedCount: 0,
  sixLeagueControlledEvidenceAcquisitionExecutionRunnerTruthCount: 0,
  canonicalWrites: 0,
  productionWrite: false,

  maySearchNowCount: 0,
  mayBroadSearchNowCount: 0,
  mayClassifySeasonStateNowCount: 0,
  mayWriteCanonicalNowCount: 0,
  mayAssertTruthNowCount: 0
};

const artifact = {
  job: "run-football-truth-six-league-controlled-evidence-acquisition-execution-runner-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "actual_controlled_fetch_execution_diagnostics_only_with_raw_payload_capture",
  dryRun: false,
  inputs: {
    sixLeagueControlledEvidenceAcquisitionApprovalGate: inputPath
  },
  policy: {
    approvedTargetsOnly: true,
    explicitAllowFetchFlagRequired: true,
    persistFullRawPayloadsToDiagnosticsOnly: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true,
    diagnosticsOnly: true
  },
  routePlan,
  summary,
  fetchRows,
  rawPayloadDirectory: rawOutDir.replace(/\\/g, "/"),
  blockedRows: [],
  guardrails: [
    { name: "fetch_only_approved_controlled_routes", allowed: true, executed: true },
    { name: "persist_raw_payloads_diagnostics_only", allowed: true, executed: true },
    { name: "no_search", allowed: false, executed: false },
    { name: "no_broad_search", allowed: false, executed: false },
    { name: "no_classifier", allowed: false, executed: false },
    { name: "no_canonical_write", allowed: false, executed: false },
    { name: "no_production_write", allowed: false, executed: false },
    { name: "no_truth_assertion", allowed: false, executed: false }
  ],
  sourceFetch: { allowed: true, executed: true },
  searchProviderUsed: false,
  broadSearchUsed: false,
  classifierExecuted: false,
  canonicalWrites: 0,
  productionWrite: false
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

console.log(JSON.stringify({ output: outputPath, ...summary }, null, 2));
