import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const previousCandidateBoardPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-previous-completed-candidate-files-${today}`, `sportomedia-sef-previous-completed-candidate-files-${today}.json`);
const previousCandidateVerificationPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-previous-completed-candidate-files-verification-${today}`, `sportomedia-sef-previous-completed-candidate-files-verification-${today}.json`);
const graphqlContractPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-graphql-request-contract-${today}`, `sportomedia-sef-graphql-request-contract-${today}.json`);

const outputDir = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-current-active-restart-proof-plan-${today}`);
const outputPath = path.join(outputDir, `sportomedia-sef-current-active-restart-proof-plan-${today}.json`);
const rowsOutputPath = path.join(outputDir, `sportomedia-sef-current-active-restart-proof-plan-rows-${today}.jsonl`);

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

await fs.mkdir(outputDir, { recursive: true });

const blocks = [];

const previousCandidateBoard = JSON.parse(await fs.readFile(previousCandidateBoardPath, "utf8"));
const previousCandidateVerification = JSON.parse(await fs.readFile(previousCandidateVerificationPath, "utf8"));
const graphqlContract = JSON.parse(await fs.readFile(graphqlContractPath, "utf8"));

if (previousCandidateBoard.status !== "passed") blocks.push("previous_candidate_board_status_not_passed");
if (previousCandidateVerification.status !== "passed") blocks.push("previous_candidate_verification_status_not_passed");
if (previousCandidateBoard.summary?.currentActiveFollowupRequired !== true) blocks.push("previous_candidate_missing_current_active_followup_requirement");
if (!(previousCandidateBoard.summary?.nextRequiredProofLanes || []).includes("current_active_season_standings")) blocks.push("missing_current_active_standings_lane");
if (!(previousCandidateBoard.summary?.nextRequiredProofLanes || []).includes("current_active_season_fixtures_or_matchdays")) blocks.push("missing_current_active_fixtures_lane");
if (!(previousCandidateBoard.summary?.nextRequiredProofLanes || []).includes("restart_date_after_world_cup_break")) blocks.push("missing_restart_date_lane");

if (graphqlContract.status !== "passed") blocks.push("graphql_contract_status_not_passed");
if (!graphqlContract.graphqlEndpointCandidates?.includes("https://gql.sportomedia.se/graphql")) blocks.push("sportomedia_graphql_endpoint_missing");
if (graphqlContract.summary?.readyToImplementDiagnosticOnlyWrapper !== true) blocks.push("graphql_contract_not_ready");

const targets = [
  {
    slug: "swe.1",
    league: "Allsvenskan",
    country: "Sweden",
    sourceFamily: "sportomedia_sef",
    currentSeasonScope: "current_active",
    currentSeasonLabel: "2026",
    configLeagueName: "allsvenskan",
    officialTableUrl: "https://allsvenskan.se/tabell",
    expectedTeams: 16,
    teamSignalTerms: ["Malmö FF", "Hammarby", "AIK", "Djurgården", "Mjällby", "Elfsborg"],
    requiredProofLanes: [
      "current_active_season_standings",
      "current_active_season_fixtures_or_matchdays",
      "restart_date_after_world_cup_break"
    ]
  },
  {
    slug: "swe.2",
    league: "Superettan",
    country: "Sweden",
    sourceFamily: "sportomedia_sef",
    currentSeasonScope: "current_active",
    currentSeasonLabel: "2026",
    configLeagueName: "superettan",
    officialTableUrl: "https://superettan.se/tabell",
    expectedTeams: 16,
    teamSignalTerms: ["Degerfors", "Öster", "Landskrona", "Helsingborg", "Sandviken", "Brage"],
    requiredProofLanes: [
      "current_active_season_standings",
      "current_active_season_fixtures_or_matchdays",
      "restart_date_after_world_cup_break"
    ]
  }
];

const requiredCurrentActiveGates = [
  "source_family_identity_must_be_sportomedia_sef",
  "slug_must_match_target",
  "seasonScope_must_equal_current_active",
  "seasonLabel_must_equal_2026",
  "expected_team_count_must_match_16",
  "current_table_must_be_non_empty",
  "played_values_must_be_non_negative",
  "played_arithmetic_must_pass_for_all_rows",
  "points_arithmetic_must_pass_for_all_rows",
  "goal_difference_arithmetic_must_pass_for_all_rows",
  "team_signal_minimum_must_pass",
  "fixture_or_matchday_rows_must_exist_for_2026",
  "restart_date_must_be_selected_from_official_future_fixture_after_current_break",
  "restart_date_must_not_be_article_date_or_fetch_date",
  "no_canonical_write_without_explicit_approval",
  "no_lifecycle_production_write",
  "no_truth_assertion",
  "raw_payload_must_not_be_committed"
];

const rows = targets.map(target => ({
  ...target,
  endpoint: "https://gql.sportomedia.se/graphql",
  plannedGraphqlOperations: [
    {
      purpose: "current_active_standings",
      operationName: "StandingsForLeague",
      variables: {
        configLeagueName: target.configLeagueName,
        configSeasonStartYear: 2026,
        type: "total"
      },
      expectedShape: "data.standingsForLeague.standings[]"
    },
    {
      purpose: "current_active_fixtures_or_matchdays_and_restart_date",
      operationName: "to_be_extracted_from_existing_sportomedia_runner_or_page_runtime",
      variables: {
        configLeagueName: target.configLeagueName,
        configSeasonStartYear: 2026
      },
      expectedShape: "official future fixture/matchday rows with startDate"
    }
  ],
  requiredValidationGates: requiredCurrentActiveGates,
  proofPlanStatus: "planned_not_executed",
  currentActiveFollowupFromPreviousCompletedCandidate: true,
  restartDateRequired: true,
  restartDatePolicy: {
    mustComeFromOfficialFixtureOrMatchday: true,
    mustBeFutureRestartAfterWorldCupBreak: true,
    mustNotUseFetchDate: true,
    mustNotUseArticleDate: true
  },
  mayFetchNextWithExplicitAllowFetch: true,
  mayWriteCanonicalNow: false,
  mayWriteLifecycleNow: false,
  mayWriteProductionNow: false,
  mayAssertTruthNow: false,
  acceptedNow: false,
  acceptanceAllowedNow: false,
  reviewOnly: true
}));

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "sportomedia_sef_current_active_restart_proof_plan",
  contractVersion: 1,
  purpose: "Plan current-active 2026 Sportomedia/SEF proof for swe.1/swe.2: current standings, current fixtures/matchdays, and restart date after World Cup break. No fetch/search/canonical/lifecycle/production/truth writes.",
  previousCandidateBoardPath: rel(previousCandidateBoardPath),
  previousCandidateBoardSha256: await sha256(previousCandidateBoardPath),
  previousCandidateVerificationPath: rel(previousCandidateVerificationPath),
  previousCandidateVerificationSha256: await sha256(previousCandidateVerificationPath),
  graphqlContractPath: rel(graphqlContractPath),
  graphqlContractSha256: await sha256(graphqlContractPath),
  output: rel(outputPath),
  rowsOutput: rel(rowsOutputPath),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    providerFetchExecutedNowCount: 0,
    standingsFetchExecutedNowCount: 0,
    fixtureFetchExecutedNowCount: 0,
    restartDateFetchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    targetCount: rows.length,
    targetSlugs: rows.map(row => row.slug),
    sourceFamily: "sportomedia_sef",
    currentSeasonScope: "current_active",
    currentSeasonLabel: "2026",
    expectedTeamsPerTarget: 16,
    previousCompletedCandidateAlreadyWrittenCount: previousCandidateBoard.summary?.candidateFileCount || 0,
    currentActiveFollowupRequired: true,
    requiredProofLanes: [
      "current_active_season_standings",
      "current_active_season_fixtures_or_matchdays",
      "restart_date_after_world_cup_break"
    ],
    restartDateRequired: true,
    plannedFetchAllowedOnlyInNextRunnerWithAllowFetch: true,
    canonicalWriteAllowedNow: false,
    lifecycleWriteAllowedNow: false,
    productionWriteAllowedNow: false,
    truthAssertionAllowedNow: false,
    acceptedNowCount: 0,
    recommendedNextLane: "build bounded diagnostic-only current-active proof runner for Sportomedia swe.1/swe.2 2026; fetch official standings plus fixture/matchday data and verify restart date"
  },
  rows,
  blocks
};

await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsOutputPath, rows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  guardrails: report.guardrails,
  summary: report.summary,
  rows: report.rows.map(row => ({
    slug: row.slug,
    league: row.league,
    currentSeasonScope: row.currentSeasonScope,
    currentSeasonLabel: row.currentSeasonLabel,
    requiredProofLanes: row.requiredProofLanes,
    restartDateRequired: row.restartDateRequired,
    plannedGraphqlOperations: row.plannedGraphqlOperations,
    mayFetchNextWithExplicitAllowFetch: row.mayFetchNextWithExplicitAllowFetch
  })),
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
