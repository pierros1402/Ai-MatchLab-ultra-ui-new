import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const proofPath = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-standings-proof-${today}`, `provider-api-standings-proof-${today}.json`);
const proofRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-standings-proof-${today}`, `provider-api-standings-proof-rows-${today}.jsonl`);

const outputDir = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-standings-proof-failure-review-${today}`);
const outputPath = path.join(outputDir, `provider-api-standings-proof-failure-review-${today}.json`);
const rowsOutputPath = path.join(outputDir, `provider-api-standings-proof-failure-review-rows-${today}.jsonl`);

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function failedGates(row) {
  const v = row.validation || {};
  const failures = [];

  if (row.proofStatus !== "standings_fetched_and_validated") failures.push("not_fetched_and_validated");
  if (v.expectedRowsPass !== true) failures.push("expected_rows");
  if (v.teamSignalPass !== true) failures.push("team_signals");
  if (v.playedArithmeticPass !== true) failures.push("played_arithmetic");
  if (v.pointsArithmeticPass !== true) failures.push("points_arithmetic");
  if (v.gdArithmeticPass !== true) failures.push("gd_arithmetic");
  if (v.nonTrivialPass !== true) failures.push("non_trivial");

  return failures;
}

function classifyRootCause(row) {
  const v = row.validation || {};
  const failures = failedGates(row);

  if (row.proofStatus !== "standings_fetched_and_validated") {
    return {
      rootCause: row.proofStatus || "not_fetched",
      nextAction: "inspect_fetch_error_or_provider_status"
    };
  }

  if ((row.mappedStandingRowCount || 0) === 0 && (row.rawStandingRowCount || 0) > 0) {
    return {
      rootCause: "row_mapping_failed_raw_rows_exist",
      nextAction: "fix_provider_row_mapping"
    };
  }

  if ((row.rawStandingRowCount || 0) === 0) {
    return {
      rootCause: "provider_returned_no_standings_rows",
      nextAction: "inspect_provider_season_param_or_league_endpoint"
    };
  }

  if (v.extractedRowCount > 0 && v.nonTrivialRows === 0) {
    return {
      rootCause: "provider_returned_empty_or_future_table",
      nextAction: "adjust seasonScope/seasonParam or reject as current_future_table"
    };
  }

  if (failures.includes("expected_rows") && v.extractedRowCount > 0) {
    return {
      rootCause: "expected_rows_or_competition_scope_mismatch",
      nextAction: "verify provider season/league includes same competition scope"
    };
  }

  if (failures.includes("team_signals") && v.extractedRowCount > 0) {
    return {
      rootCause: "team_identity_signal_mismatch",
      nextAction: "inspect teams and update mapping only if league identity is correct"
    };
  }

  if (
    failures.includes("played_arithmetic") ||
    failures.includes("points_arithmetic") ||
    failures.includes("gd_arithmetic")
  ) {
    return {
      rootCause: "field_mapping_or_provider_schema_mismatch",
      nextAction: "fix row mapping keys before any proof acceptance"
    };
  }

  return {
    rootCause: "unknown_validation_failure",
    nextAction: "manual_review_required"
  };
}

await fs.mkdir(outputDir, { recursive: true });

const proof = JSON.parse(await fs.readFile(proofPath, "utf8"));
const proofRows = parseJsonl(await fs.readFile(proofRowsPath, "utf8"));

const reviewRows = proofRows.map(row => {
  const v = row.validation || {};
  const failures = failedGates(row);
  const cause = classifyRootCause(row);

  return {
    slug: row.slug,
    league: row.league,
    country: row.country,
    providerFamily: row.providerFamily,
    providerLeagueId: row.providerLeagueId,
    providerLeagueName: row.providerLeagueName,
    providerSeasonParam: row.providerSeasonParam,
    seasonLabel: row.seasonLabel,
    seasonScope: row.seasonScope,
    proofStatus: row.proofStatus,
    httpStatus: row.httpStatus,
    rawStandingRowCount: row.rawStandingRowCount,
    mappedStandingRowCount: row.mappedStandingRowCount,
    expectedRows: row.expectedRows,
    extractedRowCount: v.extractedRowCount,
    expectedRowsPass: v.expectedRowsPass,
    teamSignalCount: v.teamSignalCount,
    teamSignalHits: v.teamSignalHits || [],
    teamSignalPass: v.teamSignalPass,
    playedArithmeticPassCount: v.playedArithmeticPassCount,
    playedArithmeticPass: v.playedArithmeticPass,
    pointsArithmeticPassCount: v.pointsArithmeticPassCount,
    pointsArithmeticPass: v.pointsArithmeticPass,
    gdArithmeticPassCount: v.gdArithmeticPassCount,
    gdArithmeticPass: v.gdArithmeticPass,
    nonTrivialRows: v.nonTrivialRows,
    nonTrivialPass: v.nonTrivialPass,
    validationPassed: v.validationPassed,
    failedGates: failures,
    rootCause: cause.rootCause,
    nextAction: cause.nextAction,
    rowPreview: row.rowPreview || [],
    acceptedNow: false,
    acceptanceAllowedNow: false,
    reviewOnly: true
  };
});

const byRootCause = {};
for (const row of reviewRows) {
  byRootCause[row.rootCause] ||= {
    count: 0,
    rows: []
  };
  byRootCause[row.rootCause].count += 1;
  byRootCause[row.rootCause].rows.push({
    slug: row.slug,
    providerFamily: row.providerFamily,
    providerLeagueId: row.providerLeagueId,
    providerSeasonParam: row.providerSeasonParam,
    rawStandingRowCount: row.rawStandingRowCount,
    mappedStandingRowCount: row.mappedStandingRowCount,
    expectedRows: row.expectedRows,
    extractedRowCount: row.extractedRowCount,
    failedGates: row.failedGates,
    nextAction: row.nextAction,
    rowPreview: row.rowPreview
  });
}

const report = {
  status: "passed",
  runner: "provider_api_standings_proof_failure_review",
  contractVersion: 1,
  purpose: "Review why provider standings proof fetched successfully but failed validation. No fetch/search/canonical/truth/production writes.",
  proofPath: path.relative(root, proofPath).replaceAll("\\", "/"),
  proofRowsPath: path.relative(root, proofRowsPath).replaceAll("\\", "/"),
  proofSha256: await sha256(proofPath),
  proofRowsSha256: await sha256(proofRowsPath),
  output: path.relative(root, outputPath).replaceAll("\\", "/"),
  rowsOutput: path.relative(root, rowsOutputPath).replaceAll("\\", "/"),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    providerFetchExecutedNowCount: 0,
    standingsFetchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  sourceProofSummary: proof.summary,
  summary: {
    proofRowCount: reviewRows.length,
    fetchedAndValidatedRowCount: reviewRows.filter(row => row.proofStatus === "standings_fetched_and_validated").length,
    validationPassedRowCount: reviewRows.filter(row => row.validationPassed === true).length,
    failedValidationRowCount: reviewRows.filter(row => row.validationPassed !== true).length,
    rootCauseCounts: Object.fromEntries(Object.entries(byRootCause).map(([key, value]) => [key, value.count])),
    byRootCause,
    acceptedNowCount: 0,
    recommendedNextLane: "Patch provider row mapping/season contract only for root causes that are deterministic; do not accept any standings rows yet."
  },
  rows: reviewRows
};

await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsOutputPath, reviewRows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  guardrails: report.guardrails,
  summary: report.summary
}, null, 2));
