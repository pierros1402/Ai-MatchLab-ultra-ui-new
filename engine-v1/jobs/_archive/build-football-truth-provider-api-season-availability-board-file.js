import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const contractRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-source-contract-board-${today}`, `provider-api-source-contract-board-rows-${today}.jsonl`);
const mappingReviewPath = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-league-mapping-review-board-${today}`, `provider-api-league-mapping-review-board-${today}.json`);
const mappingReviewRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-league-mapping-review-board-${today}`, `provider-api-league-mapping-review-board-rows-${today}.jsonl`);
const sweepPath = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-season-param-sweep-${today}`, `provider-api-season-param-sweep-${today}.json`);
const adjudicationPath = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-season-scope-adjudication-board-${today}`, `provider-api-season-scope-adjudication-board-${today}.json`);

const outputDir = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-season-availability-board-${today}`);
const outputPath = path.join(outputDir, `provider-api-season-availability-board-${today}.json`);
const rowsOutputPath = path.join(outputDir, `provider-api-season-availability-board-rows-${today}.jsonl`);

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function expectedProviderSeasonParams(providerFamily, seasonLabel) {
  const label = String(seasonLabel || "");
  const years = [...label.matchAll(/\d{4}/g)].map(match => match[0]);

  if (providerFamily === "api_football") {
    if (years.length >= 1) return [years[0]];
    return [];
  }

  if (providerFamily === "thesportsdb") {
    if (years.length >= 2) return [label, years[0], `${years[0]}-${years[1]}`];
    if (years.length === 1) return [years[0], label];
    return [];
  }

  return [];
}

function unique(values) {
  return [...new Set(values.filter(value => value !== undefined && value !== null).map(String))].sort();
}

await fs.mkdir(outputDir, { recursive: true });

const contractRows = parseJsonl(await fs.readFile(contractRowsPath, "utf8"));
const mappingReview = JSON.parse(await fs.readFile(mappingReviewPath, "utf8"));
const mappingReviewRows = parseJsonl(await fs.readFile(mappingReviewRowsPath, "utf8"));
const sweep = JSON.parse(await fs.readFile(sweepPath, "utf8"));
const adjudication = JSON.parse(await fs.readFile(adjudicationPath, "utf8"));

const contractBySlugProvider = new Map(contractRows.map(row => [`${row.slug}|${row.providerFamily}`, row]));
const sweepRows = sweep.rows || [];
const adjudicationRows = adjudication.rows || [];

const strongMappings = mappingReview.summary?.strongMappingCandidates || [];

const rows = strongMappings.map(mapping => {
  const contract = contractBySlugProvider.get(`${mapping.slug}|${mapping.providerFamily}`);
  const reviewRow = mappingReviewRows.find(row => row.slug === mapping.slug && row.providerFamily === mapping.providerFamily);
  const selectedCandidate = reviewRow?.selectedMappingCandidate || null;

  const providerSeasonHints = unique(selectedCandidate?.providerSeasonHints || []);
  const expectedParams = expectedProviderSeasonParams(mapping.providerFamily, contract?.seasonLabel);

  const matchingSweepRows = sweepRows.filter(row =>
    row.slug === mapping.slug &&
    row.providerFamily === mapping.providerFamily &&
    String(row.providerLeagueId) === String(mapping.providerLeagueId)
  );

  const matchingAdjudicationRows = adjudicationRows.filter(row =>
    row.slug === mapping.slug &&
    row.providerFamily === mapping.providerFamily &&
    String(row.providerLeagueId) === String(mapping.providerLeagueId)
  );

  const nonZeroSeasonParams = unique(matchingSweepRows.filter(row => (row.rawStandingRowCount || 0) > 0).map(row => row.providerSeasonParam));
  const validationPassedSeasonParams = unique(matchingSweepRows.filter(row => row.validation?.validationPassed === true).map(row => row.providerSeasonParam));
  const targetEligibleSeasonParams = unique(matchingAdjudicationRows.filter(row => row.targetContractEligible === true).map(row => row.providerSeasonParam));
  const wrongOrOlderSeasonParams = unique(matchingAdjudicationRows.filter(row => row.adjudicationStatus === "older_or_wrong_season_validation_passed").map(row => row.providerSeasonParam));
  const phaseMismatchSeasonParams = unique(matchingAdjudicationRows.filter(row => row.adjudicationStatus === "competition_scope_or_phase_mismatch").map(row => row.providerSeasonParam));
  const noRowSeasonParams = unique(matchingAdjudicationRows.filter(row => row.adjudicationStatus === "target_or_sweep_season_returned_no_rows").map(row => row.providerSeasonParam));

  let availabilityStatus = "unknown";
  let nextAction = "do_not_use_for_coverage_until_target_season_proven";

  if (targetEligibleSeasonParams.length > 0) {
    availabilityStatus = "target_contract_season_available_and_validated";
    nextAction = "eligible_for_provider_proof_candidate_board_after_explicit_approval_gate";
  } else if (validationPassedSeasonParams.length > 0) {
    availabilityStatus = "provider_capable_but_target_contract_season_unavailable_or_wrong";
    nextAction = "use only as capability evidence; do not count as current target coverage";
  } else if (phaseMismatchSeasonParams.length > 0) {
    availabilityStatus = "provider_has_rows_but_scope_or_phase_mismatch";
    nextAction = "requires governed phase/scope parser before any acceptance";
  } else if (noRowSeasonParams.length > 0) {
    availabilityStatus = "provider_mapping_valid_but_no_standings_rows_for_swept_params";
    nextAction = "park for later provider availability refresh";
  }

  const targetProviderSeasonAvailableInHints = expectedParams.some(param => providerSeasonHints.includes(String(param)));

  return {
    slug: mapping.slug,
    league: mapping.league,
    providerFamily: mapping.providerFamily,
    providerLeagueId: mapping.providerLeagueId,
    providerLeagueName: mapping.providerLeagueName,
    providerCountry: mapping.providerCountry,
    contractSeasonLabel: contract?.seasonLabel || null,
    contractSeasonScope: contract?.seasonScope || null,
    expectedRows: contract?.expectedRows || null,
    expectedProviderSeasonParams: expectedParams,
    providerSeasonHints,
    targetProviderSeasonAvailableInHints,
    sweptSeasonParams: unique(matchingSweepRows.map(row => row.providerSeasonParam)),
    nonZeroSeasonParams,
    validationPassedSeasonParams,
    wrongOrOlderSeasonParams,
    phaseMismatchSeasonParams,
    noRowSeasonParams,
    targetEligibleSeasonParams,
    availabilityStatus,
    nextAction,
    acceptedNow: false,
    acceptanceAllowedNow: false,
    reviewOnly: true
  };
});

const report = {
  status: "passed",
  runner: "provider_api_season_availability_board",
  contractVersion: 1,
  purpose: "Summarize provider season availability after mapping/proof/sweep/adjudication. No fetch/search/canonical/truth/production writes.",
  contractRowsPath: path.relative(root, contractRowsPath).replaceAll("\\", "/"),
  mappingReviewPath: path.relative(root, mappingReviewPath).replaceAll("\\", "/"),
  mappingReviewRowsPath: path.relative(root, mappingReviewRowsPath).replaceAll("\\", "/"),
  sweepPath: path.relative(root, sweepPath).replaceAll("\\", "/"),
  adjudicationPath: path.relative(root, adjudicationPath).replaceAll("\\", "/"),
  contractRowsSha256: await sha256(contractRowsPath),
  mappingReviewSha256: await sha256(mappingReviewPath),
  mappingReviewRowsSha256: await sha256(mappingReviewRowsPath),
  sweepSha256: await sha256(sweepPath),
  adjudicationSha256: await sha256(adjudicationPath),
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
  sourceMappingSummary: mappingReview.summary,
  sourceSweepSummary: sweep.summary,
  sourceAdjudicationSummary: adjudication.summary,
  summary: {
    strongMappingCount: rows.length,
    targetContractSeasonAvailableAndValidatedCount: rows.filter(row => row.availabilityStatus === "target_contract_season_available_and_validated").length,
    providerCapableButTargetSeasonUnavailableOrWrongCount: rows.filter(row => row.availabilityStatus === "provider_capable_but_target_contract_season_unavailable_or_wrong").length,
    providerRowsButScopeOrPhaseMismatchCount: rows.filter(row => row.availabilityStatus === "provider_has_rows_but_scope_or_phase_mismatch").length,
    providerNoRowsForSweptParamsCount: rows.filter(row => row.availabilityStatus === "provider_mapping_valid_but_no_standings_rows_for_swept_params").length,
    targetProviderSeasonAvailableInHintsCount: rows.filter(row => row.targetProviderSeasonAvailableInHints).length,
    availabilityRows: rows.map(row => ({
      slug: row.slug,
      league: row.league,
      providerFamily: row.providerFamily,
      providerLeagueId: row.providerLeagueId,
      contractSeasonLabel: row.contractSeasonLabel,
      expectedProviderSeasonParams: row.expectedProviderSeasonParams,
      providerSeasonHints: row.providerSeasonHints,
      targetProviderSeasonAvailableInHints: row.targetProviderSeasonAvailableInHints,
      nonZeroSeasonParams: row.nonZeroSeasonParams,
      validationPassedSeasonParams: row.validationPassedSeasonParams,
      availabilityStatus: row.availabilityStatus,
      nextAction: row.nextAction
    })),
    acceptedNowCount: 0,
    recommendedNextLane: "If target contract seasons are unavailable, do not pursue provider canonicalization. Use provider lane only for season availability refresh or older-season backfill with explicitly corrected season contracts."
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
