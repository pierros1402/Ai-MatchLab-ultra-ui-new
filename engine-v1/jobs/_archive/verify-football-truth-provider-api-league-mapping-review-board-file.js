import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const discoveryPath = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-league-mapping-discovery-${today}`, `provider-api-league-mapping-discovery-${today}.json`);
const discoveryRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-league-mapping-discovery-${today}`, `provider-api-league-mapping-discovery-rows-${today}.jsonl`);
const reviewPath = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-league-mapping-review-board-${today}`, `provider-api-league-mapping-review-board-${today}.json`);
const reviewRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-league-mapping-review-board-${today}`, `provider-api-league-mapping-review-board-rows-${today}.jsonl`);

const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-league-mapping-review-board-verification-${today}`);
const verificationPath = path.join(verificationDir, `provider-api-league-mapping-review-board-verification-${today}.json`);

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

function sameStrongCandidate(actual, expected) {
  return actual.slug === expected.slug &&
    actual.providerFamily === expected.providerFamily &&
    String(actual.providerLeagueId) === String(expected.providerLeagueId) &&
    actual.providerLeagueName === expected.providerLeagueName &&
    actual.providerCountry === expected.providerCountry;
}

const blocks = [];

const discovery = JSON.parse(await fs.readFile(discoveryPath, "utf8"));
const discoveryRows = parseJsonl(await fs.readFile(discoveryRowsPath, "utf8"));
const review = JSON.parse(await fs.readFile(reviewPath, "utf8"));
const reviewRows = parseJsonl(await fs.readFile(reviewRowsPath, "utf8"));

if (discovery.status !== "passed") blocks.push("discovery_status_not_passed");
if (discovery.contractVersion !== 1) blocks.push("discovery_contract_version_not_1");
if (discovery.summary?.inputContractRowCount !== 12) blocks.push("discovery_input_contract_row_count_not_12");
if (discovery.summary?.mappingDiscoveryRowCount !== 12) blocks.push("discovery_mapping_row_count_not_12");
if (discoveryRows.length !== 12) blocks.push("discovery_rows_length_not_12");
if (discovery.summary?.providerFetchExecutedNowCount !== 12) blocks.push("provider_fetch_count_not_12");
if (discovery.summary?.failedFetchCount !== 0) blocks.push("failed_fetch_count_not_zero");
if (discovery.summary?.skippedNoKeyCount !== 0) blocks.push("skipped_no_key_count_not_zero");
if (discovery.summary?.fetchedCandidateRowCount !== 12) blocks.push("fetched_candidate_row_count_not_12");
if (discovery.summary?.selectedMappingCandidateRowCount !== 7) blocks.push("selected_mapping_candidate_row_count_not_7");
if (discovery.summary?.selectedMappingCandidateCount !== 55) blocks.push("selected_mapping_candidate_count_not_55");
if (discovery.summary?.acceptedNowCount !== 0) blocks.push("discovery_accepted_now_not_zero");

if (review.status !== "passed") blocks.push("review_status_not_passed");
if (review.contractVersion !== 1) blocks.push("review_contract_version_not_1");
if (review.summary?.reviewRowCount !== 12) blocks.push("review_row_count_not_12");
if (reviewRows.length !== 12) blocks.push("review_rows_length_not_12");
if (review.summary?.singleStrongMappingCandidateRowCount !== 5) blocks.push("strong_mapping_count_not_5");
if (review.summary?.ambiguousMappingCandidateRowCount !== 3) blocks.push("ambiguous_mapping_count_not_3");
if (review.summary?.weakMappingCandidateRowCount !== 2) blocks.push("weak_mapping_count_not_2");
if (review.summary?.noCandidateRowCount !== 2) blocks.push("no_candidate_count_not_2");
if (review.summary?.acceptedNowCount !== 0) blocks.push("review_accepted_now_not_zero");

const expectedStrong = [
  { slug: "eng.1", league: "Premier League", providerFamily: "api_football", providerLeagueId: 39, providerLeagueName: "Premier League", providerCountry: "England" },
  { slug: "ger.1", league: "Bundesliga", providerFamily: "api_football", providerLeagueId: 78, providerLeagueName: "Bundesliga", providerCountry: "Germany" },
  { slug: "swe.1", league: "Allsvenskan", providerFamily: "api_football", providerLeagueId: 113, providerLeagueName: "Allsvenskan", providerCountry: "Sweden" },
  { slug: "fin.1", league: "Veikkausliiga", providerFamily: "api_football", providerLeagueId: 244, providerLeagueName: "Veikkausliiga", providerCountry: "Finland" },
  { slug: "fin.1", league: "Veikkausliiga", providerFamily: "thesportsdb", providerLeagueId: "4636", providerLeagueName: "Finnish Veikkausliiga", providerCountry: "Finland" }
];

const actualStrong = review.summary?.strongMappingCandidates || [];
if (actualStrong.length !== expectedStrong.length) blocks.push("strong_mapping_candidates_length_mismatch");

for (const expected of expectedStrong) {
  if (!actualStrong.some(actual => sameStrongCandidate(actual, expected))) {
    blocks.push(`missing_strong_mapping_${expected.slug}_${expected.providerFamily}_${expected.providerLeagueId}`);
  }
}

for (const row of reviewRows) {
  if (row.acceptanceAllowedNow !== false) blocks.push(`review_row_acceptance_allowed_${row.slug}_${row.providerFamily}`);
  if (row.reviewOnly !== true) blocks.push(`review_row_not_review_only_${row.slug}_${row.providerFamily}`);
  if (row.mappingAcceptedNow !== false) blocks.push(`review_row_mapping_accepted_now_${row.slug}_${row.providerFamily}`);
  if (row.providerLeagueIdAcceptedNow !== null) blocks.push(`review_row_provider_league_id_accepted_now_${row.slug}_${row.providerFamily}`);
}

const discoveryGuardrails = discovery.guardrails || {};
if (discoveryGuardrails.searchExecutedNowCount !== 0) blocks.push("discovery_search_not_zero");
if (discoveryGuardrails.providerFetchExecutedNowCount !== 12) blocks.push("discovery_provider_fetch_not_12");
if (discoveryGuardrails.standingsFetchExecutedNowCount !== 0) blocks.push("discovery_standings_fetch_not_zero");
if (discoveryGuardrails.canonicalWriteExecutedNowCount !== 0) blocks.push("discovery_canonical_not_zero");
if (discoveryGuardrails.productionWriteExecutedNowCount !== 0) blocks.push("discovery_production_not_zero");
if (discoveryGuardrails.truthAssertionExecutedNowCount !== 0) blocks.push("discovery_truth_not_zero");
if (discoveryGuardrails.rawPayloadCommitted !== false) blocks.push("discovery_raw_payload_not_false");
if (discoveryGuardrails.fullRawPayloadWritten !== false) blocks.push("discovery_full_raw_payload_not_false");

const reviewGuardrails = review.guardrails || {};
for (const key of ["searchExecutedNowCount", "fetchExecutedNowCount", "providerFetchExecutedNowCount", "standingsFetchExecutedNowCount", "canonicalWriteExecutedNowCount", "productionWriteExecutedNowCount", "truthAssertionExecutedNowCount"]) {
  if (reviewGuardrails[key] !== 0) blocks.push(`review_guardrail_${key}_not_zero`);
}
if (reviewGuardrails.rawPayloadCommitted !== false) blocks.push("review_raw_payload_not_false");
if (reviewGuardrails.fullRawPayloadWritten !== false) blocks.push("review_full_raw_payload_not_false");

await fs.mkdir(verificationDir, { recursive: true });

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_provider_api_league_mapping_review_board",
  contractVersion: 1,
  discoveryPath: path.relative(root, discoveryPath).replaceAll("\\", "/"),
  discoveryRowsPath: path.relative(root, discoveryRowsPath).replaceAll("\\", "/"),
  reviewPath: path.relative(root, reviewPath).replaceAll("\\", "/"),
  reviewRowsPath: path.relative(root, reviewRowsPath).replaceAll("\\", "/"),
  discoverySha256: await sha256(discoveryPath),
  discoveryRowsSha256: await sha256(discoveryRowsPath),
  reviewSha256: await sha256(reviewPath),
  reviewRowsSha256: await sha256(reviewRowsPath),
  verified: {
    discoveryInputContractRowCount: discovery.summary.inputContractRowCount,
    providerFetchExecutedNowCount: discovery.summary.providerFetchExecutedNowCount,
    failedFetchCount: discovery.summary.failedFetchCount,
    fetchedCandidateRowCount: discovery.summary.fetchedCandidateRowCount,
    selectedMappingCandidateRowCount: discovery.summary.selectedMappingCandidateRowCount,
    selectedMappingCandidateCount: discovery.summary.selectedMappingCandidateCount,
    reviewRowCount: review.summary.reviewRowCount,
    singleStrongMappingCandidateRowCount: review.summary.singleStrongMappingCandidateRowCount,
    ambiguousMappingCandidateRowCount: review.summary.ambiguousMappingCandidateRowCount,
    weakMappingCandidateRowCount: review.summary.weakMappingCandidateRowCount,
    noCandidateRowCount: review.summary.noCandidateRowCount,
    strongMappingCandidates: review.summary.strongMappingCandidates,
    acceptedNowCount: review.summary.acceptedNowCount,
    guardrailsHeld: discoveryGuardrails.searchExecutedNowCount === 0 &&
      discoveryGuardrails.providerFetchExecutedNowCount === 12 &&
      discoveryGuardrails.standingsFetchExecutedNowCount === 0 &&
      discoveryGuardrails.canonicalWriteExecutedNowCount === 0 &&
      discoveryGuardrails.productionWriteExecutedNowCount === 0 &&
      discoveryGuardrails.truthAssertionExecutedNowCount === 0 &&
      discoveryGuardrails.rawPayloadCommitted === false &&
      discoveryGuardrails.fullRawPayloadWritten === false &&
      reviewGuardrails.searchExecutedNowCount === 0 &&
      reviewGuardrails.fetchExecutedNowCount === 0 &&
      reviewGuardrails.providerFetchExecutedNowCount === 0 &&
      reviewGuardrails.standingsFetchExecutedNowCount === 0 &&
      reviewGuardrails.canonicalWriteExecutedNowCount === 0 &&
      reviewGuardrails.productionWriteExecutedNowCount === 0 &&
      reviewGuardrails.truthAssertionExecutedNowCount === 0 &&
      reviewGuardrails.rawPayloadCommitted === false &&
      reviewGuardrails.fullRawPayloadWritten === false
  },
  conclusion: "Provider league-id mapping discovery/review is verified. Five strong mapping candidates are available for a bounded provider standings proof plan; no mapping was accepted as truth and no standings were fetched.",
  blocks
};

await fs.writeFile(verificationPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  status: report.status,
  verificationPath: path.relative(root, verificationPath).replaceAll("\\", "/"),
  verified: report.verified,
  conclusion: report.conclusion,
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
