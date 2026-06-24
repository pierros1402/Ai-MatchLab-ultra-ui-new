import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const sweepPath = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-season-param-sweep-${today}`, `provider-api-season-param-sweep-${today}.json`);
const sweepRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-season-param-sweep-${today}`, `provider-api-season-param-sweep-rows-${today}.jsonl`);

const proofPath = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-standings-proof-${today}`, `provider-api-standings-proof-${today}.json`);
const failureReviewPath = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-standings-proof-failure-review-${today}`, `provider-api-standings-proof-failure-review-${today}.json`);

const outputDir = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-season-scope-adjudication-board-${today}`);
const outputPath = path.join(outputDir, `provider-api-season-scope-adjudication-board-${today}.json`);
const rowsOutputPath = path.join(outputDir, `provider-api-season-scope-adjudication-board-rows-${today}.jsonl`);

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function expectedProviderSeasonParams(row) {
  const label = String(row.contractSeasonLabel || "");
  const years = [...label.matchAll(/\d{4}/g)].map(match => match[0]);

  if (row.providerFamily === "api_football") {
    if (years.length >= 1) return [years[0]];
    return [];
  }

  if (row.providerFamily === "thesportsdb") {
    if (years.length >= 2) return [label, years[0], `${years[0]}-${years[1]}`];
    if (years.length === 1) return [years[0], label];
    return [];
  }

  return [];
}

function classify(row) {
  const validationPassed = row.validation?.validationPassed === true;
  const expectedParams = expectedProviderSeasonParams(row);
  const seasonParamContractMatch = expectedParams.includes(String(row.providerSeasonParam));

  if (validationPassed && seasonParamContractMatch) {
    return {
      adjudicationStatus: "target_contract_validation_passed",
      targetContractEligible: true,
      rootCause: "none",
      nextAction: "eligible_for_provider_proof_candidate_board_after_explicit_approval_gate"
    };
  }

  if (validationPassed && !seasonParamContractMatch) {
    return {
      adjudicationStatus: "older_or_wrong_season_validation_passed",
      targetContractEligible: false,
      rootCause: "season_param_does_not_match_contract_season_label",
      nextAction: "do_not_accept; treat only as provider capability evidence"
    };
  }

  if ((row.rawStandingRowCount || 0) === 0) {
    return {
      adjudicationStatus: "target_or_sweep_season_returned_no_rows",
      targetContractEligible: false,
      rootCause: "provider_has_no_standings_rows_for_this_season_param",
      nextAction: "do_not_accept; inspect provider season availability before wider use"
    };
  }

  if ((row.rawStandingRowCount || 0) > 0 && row.validation?.expectedRowsPass !== true) {
    return {
      adjudicationStatus: "competition_scope_or_phase_mismatch",
      targetContractEligible: false,
      rootCause: "provider_row_count_does_not_match_expected_competition_scope",
      nextAction: "do_not_accept; requires governed phase parser or different provider endpoint"
    };
  }

  return {
    adjudicationStatus: "validation_failed_other_gate",
    targetContractEligible: false,
    rootCause: "non_season_validation_gate_failed",
    nextAction: "do_not_accept; inspect validation failure before any proof"
  };
}

await fs.mkdir(outputDir, { recursive: true });

const sweep = JSON.parse(await fs.readFile(sweepPath, "utf8"));
const sweepRows = parseJsonl(await fs.readFile(sweepRowsPath, "utf8"));
const proof = JSON.parse(await fs.readFile(proofPath, "utf8"));
const failureReview = JSON.parse(await fs.readFile(failureReviewPath, "utf8"));

const rows = sweepRows.map(row => {
  const expectedParams = expectedProviderSeasonParams(row);
  const adjudication = classify(row);

  return {
    slug: row.slug,
    league: row.league,
    country: row.country,
    providerFamily: row.providerFamily,
    providerLeagueId: row.providerLeagueId,
    providerLeagueName: row.providerLeagueName,
    providerSeasonParam: row.providerSeasonParam,
    expectedProviderSeasonParams: expectedParams,
    seasonParamContractMatch: expectedParams.includes(String(row.providerSeasonParam)),
    contractSeasonLabel: row.contractSeasonLabel,
    contractSeasonScope: row.contractSeasonScope,
    expectedRows: row.expectedRows,
    proofStatus: row.proofStatus,
    httpStatus: row.httpStatus,
    rawStandingRowCount: row.rawStandingRowCount,
    mappedStandingRowCount: row.mappedStandingRowCount,
    validationPassedBeforeSeasonAdjudication: row.validation?.validationPassed === true,
    validation: row.validation || null,
    rowPreview: row.rowPreview || [],
    ...adjudication,
    acceptedNow: false,
    acceptanceAllowedNow: false,
    reviewOnly: true
  };
});

const report = {
  status: "passed",
  runner: "provider_api_season_scope_adjudication_board",
  contractVersion: 1,
  purpose: "Adjudicate provider standings proof/sweep against explicit contract season scope. Prevents wrong-season rows from being counted as coverage.",
  sweepPath: path.relative(root, sweepPath).replaceAll("\\", "/"),
  sweepRowsPath: path.relative(root, sweepRowsPath).replaceAll("\\", "/"),
  proofPath: path.relative(root, proofPath).replaceAll("\\", "/"),
  failureReviewPath: path.relative(root, failureReviewPath).replaceAll("\\", "/"),
  sweepSha256: await sha256(sweepPath),
  sweepRowsSha256: await sha256(sweepRowsPath),
  proofSha256: await sha256(proofPath),
  failureReviewSha256: await sha256(failureReviewPath),
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
  sourceFailureReviewSummary: failureReview.summary,
  sourceSweepSummary: sweep.summary,
  summary: {
    sweepRowCount: rows.length,
    validationPassedBeforeSeasonAdjudicationCount: rows.filter(row => row.validationPassedBeforeSeasonAdjudication).length,
    targetContractValidationPassedCount: rows.filter(row => row.adjudicationStatus === "target_contract_validation_passed").length,
    wrongOrOlderSeasonValidationPassedCount: rows.filter(row => row.adjudicationStatus === "older_or_wrong_season_validation_passed").length,
    competitionScopeOrPhaseMismatchCount: rows.filter(row => row.adjudicationStatus === "competition_scope_or_phase_mismatch").length,
    noRowsCount: rows.filter(row => row.adjudicationStatus === "target_or_sweep_season_returned_no_rows").length,
    targetContractEligibleRows: rows
      .filter(row => row.targetContractEligible)
      .map(row => ({
        slug: row.slug,
        league: row.league,
        providerFamily: row.providerFamily,
        providerLeagueId: row.providerLeagueId,
        providerSeasonParam: row.providerSeasonParam,
        contractSeasonLabel: row.contractSeasonLabel,
        contractSeasonScope: row.contractSeasonScope,
        expectedRows: row.expectedRows,
        extractedRowCount: row.validation?.extractedRowCount,
        teamSignalCount: row.validation?.teamSignalCount
      })),
    wrongOrOlderSeasonCapabilityRows: rows
      .filter(row => row.adjudicationStatus === "older_or_wrong_season_validation_passed")
      .map(row => ({
        slug: row.slug,
        league: row.league,
        providerFamily: row.providerFamily,
        providerLeagueId: row.providerLeagueId,
        providerSeasonParam: row.providerSeasonParam,
        expectedProviderSeasonParams: row.expectedProviderSeasonParams,
        contractSeasonLabel: row.contractSeasonLabel,
        expectedRows: row.expectedRows,
        extractedRowCount: row.validation?.extractedRowCount,
        teamSignalCount: row.validation?.teamSignalCount
      })),
    phaseOrScopeMismatchRows: rows
      .filter(row => row.adjudicationStatus === "competition_scope_or_phase_mismatch")
      .map(row => ({
        slug: row.slug,
        league: row.league,
        providerFamily: row.providerFamily,
        providerLeagueId: row.providerLeagueId,
        providerSeasonParam: row.providerSeasonParam,
        rawStandingRowCount: row.rawStandingRowCount,
        expectedRows: row.expectedRows,
        teamSignalCount: row.validation?.teamSignalCount
      })),
    acceptedNowCount: 0,
    recommendedNextLane: "No provider standings rows are eligible unless targetContractValidationPassedCount is non-zero. For current output, treat passing rows as older-season capability evidence only."
  },
  rows
};

await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsOutputPath, rows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  guardrails: report.guardrails,
  summary: report.summary
}, null, 2));
