import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const minerPath = path.join(root, "data", "football-truth", "_diagnostics", `official-host-asset-api-route-miner-${today}`, `official-host-asset-api-route-miner-${today}.json`);
const minerRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `official-host-asset-api-route-miner-${today}`, `official-host-asset-api-route-miner-rows-${today}.jsonl`);

const minerReviewPath = path.join(root, "data", "football-truth", "_diagnostics", `official-host-asset-api-route-miner-review-board-${today}`, `official-host-asset-api-route-miner-review-board-${today}.json`);
const minerReviewRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `official-host-asset-api-route-miner-review-board-${today}`, `official-host-asset-api-route-miner-review-board-rows-${today}.jsonl`);

const proofPath = path.join(root, "data", "football-truth", "_diagnostics", `official-host-proof-target-board-${today}`, `official-host-proof-target-board-${today}.json`);
const proofRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `official-host-proof-target-board-${today}`, `official-host-proof-target-board-rows-${today}.jsonl`);

const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `official-host-proof-target-board-verification-${today}`);
const verificationPath = path.join(verificationDir, `official-host-proof-target-board-verification-${today}.json`);

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

const blocks = [];

const miner = JSON.parse(await fs.readFile(minerPath, "utf8"));
const minerRows = parseJsonl(await fs.readFile(minerRowsPath, "utf8"));

const minerReview = JSON.parse(await fs.readFile(minerReviewPath, "utf8"));
const minerReviewRows = parseJsonl(await fs.readFile(minerReviewRowsPath, "utf8"));

const proof = JSON.parse(await fs.readFile(proofPath, "utf8"));
const proofRows = parseJsonl(await fs.readFile(proofRowsPath, "utf8"));

if (miner.status !== "passed") blocks.push("miner_status_not_passed");
if (miner.contractVersion !== 1) blocks.push("miner_contract_version_not_1");
if (miner.summary?.sourcePageCount !== 29) blocks.push("miner_source_page_count_not_29");
if (miner.summary?.fetched2xxCount !== 29) blocks.push("miner_fetched2xx_count_not_29");
if (miner.summary?.fetchFailedCount !== 0) blocks.push("miner_fetch_failed_count_not_zero");
if (miner.summary?.minedCandidateRowCount !== 953) blocks.push("miner_candidate_count_not_953");
if (minerRows.length !== miner.summary?.minedCandidateRowCount) blocks.push("miner_rows_count_mismatch");
if (miner.summary?.actionableSlugCount !== 18) blocks.push("miner_actionable_slug_count_not_18");
if (miner.summary?.acceptedNowCount !== 0) blocks.push("miner_accepted_now_not_zero");

const minerGuardrails = miner.guardrails || {};
if (minerGuardrails.allowFetch !== true) blocks.push("miner_allow_fetch_not_true");
if (minerGuardrails.searchExecutedNowCount !== 0) blocks.push("miner_search_not_zero");
if (minerGuardrails.fetchExecutedNowCount !== 29) blocks.push("miner_fetch_executed_not_29");
if (minerGuardrails.canonicalWriteExecutedNowCount !== 0) blocks.push("miner_canonical_write_not_zero");
if (minerGuardrails.productionWriteExecutedNowCount !== 0) blocks.push("miner_production_write_not_zero");
if (minerGuardrails.truthAssertionExecutedNowCount !== 0) blocks.push("miner_truth_assertion_not_zero");
if (minerGuardrails.rawPayloadCommitted !== false) blocks.push("miner_raw_payload_committed_not_false");
if (minerGuardrails.fullRawPayloadWritten !== false) blocks.push("miner_full_raw_payload_written_not_false");

if (minerReview.status !== "passed") blocks.push("miner_review_status_not_passed");
if (minerReview.contractVersion !== 1) blocks.push("miner_review_contract_version_not_1");
if (minerReview.summary?.minedCandidateRowCount !== 953) blocks.push("miner_review_mined_count_not_953");
if (minerReview.summary?.reviewedUniqueCandidateCount !== 953) blocks.push("miner_review_unique_count_not_953");
if (minerReviewRows.length !== minerReview.summary?.reviewedUniqueCandidateCount) blocks.push("miner_review_rows_count_mismatch");
if (minerReview.summary?.strictActionableSlugCount !== 21) blocks.push("miner_review_strict_actionable_slug_count_not_21");
if (minerReview.summary?.acceptedNowCount !== 0) blocks.push("miner_review_accepted_now_not_zero");

const minerReviewGuardrails = minerReview.guardrails || {};
for (const key of ["searchExecutedNowCount", "fetchExecutedNowCount", "canonicalWriteExecutedNowCount", "productionWriteExecutedNowCount", "truthAssertionExecutedNowCount"]) {
  if (minerReviewGuardrails[key] !== 0) blocks.push(`miner_review_guardrail_${key}_not_zero`);
}
if (minerReviewGuardrails.rawPayloadCommitted !== false) blocks.push("miner_review_raw_payload_committed_not_false");
if (minerReviewGuardrails.fullRawPayloadWritten !== false) blocks.push("miner_review_full_raw_payload_written_not_false");

if (proof.status !== "passed") blocks.push("proof_status_not_passed");
if (proof.contractVersion !== 1) blocks.push("proof_contract_version_not_1");
if (proof.summary?.minedCandidateRowCount !== 953) blocks.push("proof_mined_count_not_953");
if (proof.summary?.reviewedUniqueCandidateCount !== 953) blocks.push("proof_unique_count_not_953");
if (proofRows.length !== proof.summary?.reviewedUniqueCandidateCount) blocks.push("proof_rows_count_mismatch");
if (proof.summary?.sourceMinerActionableCandidateCount !== 570) blocks.push("proof_source_miner_actionable_not_570");
if (proof.summary?.proofCandidateCount !== 215) blocks.push("proof_candidate_count_not_215");
if (proof.summary?.proofCandidateSlugCount !== 10) blocks.push("proof_candidate_slug_count_not_10");
if (proof.summary?.seasonRouteExtractionProbeCount !== 4) blocks.push("season_route_count_not_4");
if (proof.summary?.standingsScriptEndpointProbeCount !== 6) blocks.push("script_endpoint_count_not_6");
if (proof.summary?.standingsRouteRenderProbeCount !== 204) blocks.push("route_render_count_not_204");
if (proof.summary?.rankApiProbeCount !== 1) blocks.push("rank_api_count_not_1");
if (proof.summary?.parkedNoiseCount !== 738) blocks.push("parked_noise_count_not_738");
if (proof.summary?.selectedProofTargetCount !== 21) blocks.push("selected_proof_target_count_not_21");
if (proof.summary?.selectedProofSlugCount !== 10) blocks.push("selected_proof_slug_count_not_10");
if (proof.summary?.acceptedNowCount !== 0) blocks.push("proof_accepted_now_not_zero");

const proofGuardrails = proof.guardrails || {};
for (const key of ["searchExecutedNowCount", "fetchExecutedNowCount", "canonicalWriteExecutedNowCount", "productionWriteExecutedNowCount", "truthAssertionExecutedNowCount"]) {
  if (proofGuardrails[key] !== 0) blocks.push(`proof_guardrail_${key}_not_zero`);
}
if (proofGuardrails.rawPayloadCommitted !== false) blocks.push("proof_raw_payload_committed_not_false");
if (proofGuardrails.fullRawPayloadWritten !== false) blocks.push("proof_full_raw_payload_written_not_false");

const expectedSelected = [
  ["aut.1", "season_route_extraction_probe", "https://www.bundesliga.at/tabelle/saison-2024-2025/"],
  ["aut.1", "season_route_extraction_probe", "https://www.bundesliga.at/tabelle/saison-2025-2026/"],
  ["aut.2", "season_route_extraction_probe", "https://www.2liga.at/tabelle/saison-2024-2025/"],
  ["aut.2", "season_route_extraction_probe", "https://www.2liga.at/tabelle/saison-2025-2026/"],
  ["aut.1", "standings_script_endpoint_probe", "https://www.bundesliga.at/_next/static/chunks/app/%5Blang%5D/(runOfSite)/(leaguesOnly)/tabelle/page-68c828919f69a321.js"],
  ["aut.2", "standings_script_endpoint_probe", "https://www.2liga.at/_next/static/chunks/app/%5Blang%5D/(runOfSite)/(leaguesOnly)/tabelle/page-68c828919f69a321.js"],
  ["nor.1", "standings_script_endpoint_probe", "https://www.eliteserien.no/_/service/no.seeds.app.football/asset/0000019e64166da0/js/embed-league-table.js"],
  ["pol.1", "standings_script_endpoint_probe", "https://www.ekstraklasa.org/tabela/main.daa97c722400eadc.js"],
  ["pol.1", "standings_script_endpoint_probe", "https://www.ekstraklasa.org/tabela/polyfills.16deddbcbeac2449.js"],
  ["aus.1", "standings_route_render_probe", "https://aleagues.com.au/ladders/a-league-men/"],
  ["ksa.1", "standings_route_render_probe", "https://www.spl.com.sa/en/table"],
  ["ksa.1", "standings_route_render_probe", "https://www.spl.com.sa/table"],
  ["mex.1", "standings_route_render_probe", "https://ligamx.net/cancha/estadisticahistorica"],
  ["mex.1", "standings_route_render_probe", "https://ligamx.net/cancha/estadisticahistorica/1/"],
  ["nor.1", "standings_route_render_probe", "https://www.eliteserien.no/tabell"],
  ["pol.1", "standings_route_render_probe", "https://www.ekstraklasa.org/tabela"],
  ["sui.1", "standings_route_render_probe", "https://sfl.ch/superleague-classement"],
  ["usa.1", "standings_route_render_probe", "https://www.mlssoccer.com/standings/#"],
  ["usa.1", "standings_route_render_probe", "https://www.mlssoccer.com/standings/#chevron-down"],
  ["kor.1", "rank_api_probe", "https://www.kleague.com/api/clubRank.do"]
];

const selected = proof.summary?.selectedProofTargets || [];
for (const [slug, proofType, candidateUrl] of expectedSelected) {
  const found = selected.find(row => row.slug === slug && row.proofType === proofType && row.candidateUrl === candidateUrl);
  if (!found) blocks.push(`missing_expected_selected_proof_target_${slug}_${proofType}_${candidateUrl}`);
}

const forbiddenSelectedPatterns = [
  "/wp-json/",
  "/manifest.json",
  "/posts/",
  "/pages/",
  "getNewsList",
  "/standings/2026/",
  "challengeleague-classement"
];

for (const row of selected) {
  const url = String(row.candidateUrl || "");
  for (const forbidden of forbiddenSelectedPatterns) {
    if (url.includes(forbidden)) blocks.push(`forbidden_selected_pattern_${row.slug}_${forbidden}`);
  }
  if (row.acceptanceAllowedNow === true) blocks.push(`selected_acceptance_allowed_${row.slug}`);
}

for (const row of proofRows) {
  if (row.acceptanceAllowedNow !== false) blocks.push(`proof_row_acceptance_allowed_${row.slug}`);
  if (row.reviewOnly !== true) blocks.push(`proof_row_not_review_only_${row.slug}`);
}

await fs.mkdir(verificationDir, { recursive: true });

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_official_host_proof_target_board",
  contractVersion: 1,
  minerPath: path.relative(root, minerPath).replaceAll("\\", "/"),
  minerRowsPath: path.relative(root, minerRowsPath).replaceAll("\\", "/"),
  minerReviewPath: path.relative(root, minerReviewPath).replaceAll("\\", "/"),
  minerReviewRowsPath: path.relative(root, minerReviewRowsPath).replaceAll("\\", "/"),
  proofPath: path.relative(root, proofPath).replaceAll("\\", "/"),
  proofRowsPath: path.relative(root, proofRowsPath).replaceAll("\\", "/"),
  minerSha256: await sha256(minerPath),
  minerRowsSha256: await sha256(minerRowsPath),
  minerReviewSha256: await sha256(minerReviewPath),
  minerReviewRowsSha256: await sha256(minerReviewRowsPath),
  proofSha256: await sha256(proofPath),
  proofRowsSha256: await sha256(proofRowsPath),
  verified: {
    sourcePageCount: miner.summary.sourcePageCount,
    fetched2xxCount: miner.summary.fetched2xxCount,
    minedCandidateRowCount: minerRows.length,
    minerActionableSlugCount: miner.summary.actionableSlugCount,
    proofCandidateCount: proof.summary.proofCandidateCount,
    proofCandidateSlugCount: proof.summary.proofCandidateSlugCount,
    seasonRouteExtractionProbeCount: proof.summary.seasonRouteExtractionProbeCount,
    standingsScriptEndpointProbeCount: proof.summary.standingsScriptEndpointProbeCount,
    standingsRouteRenderProbeCount: proof.summary.standingsRouteRenderProbeCount,
    rankApiProbeCount: proof.summary.rankApiProbeCount,
    parkedNoiseCount: proof.summary.parkedNoiseCount,
    selectedProofTargetCount: proof.summary.selectedProofTargetCount,
    selectedProofSlugCount: proof.summary.selectedProofSlugCount,
    selectedProofSlugs: [...new Set(selected.map(row => row.slug))],
    acceptedNowCount: proof.summary.acceptedNowCount,
    guardrailsHeld: minerGuardrails.searchExecutedNowCount === 0 &&
      minerGuardrails.fetchExecutedNowCount === 29 &&
      minerGuardrails.canonicalWriteExecutedNowCount === 0 &&
      minerGuardrails.productionWriteExecutedNowCount === 0 &&
      minerGuardrails.truthAssertionExecutedNowCount === 0 &&
      minerGuardrails.rawPayloadCommitted === false &&
      minerGuardrails.fullRawPayloadWritten === false &&
      proofGuardrails.searchExecutedNowCount === 0 &&
      proofGuardrails.fetchExecutedNowCount === 0 &&
      proofGuardrails.canonicalWriteExecutedNowCount === 0 &&
      proofGuardrails.productionWriteExecutedNowCount === 0 &&
      proofGuardrails.truthAssertionExecutedNowCount === 0 &&
      proofGuardrails.rawPayloadCommitted === false &&
      proofGuardrails.fullRawPayloadWritten === false
  },
  conclusion: "Proof target board v2 reduced noisy miner output to bounded standings proof targets across 10 slugs. No rows accepted. Next step is controlled proof inspection only for selectedProofTargets.",
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

if (blocks.length > 0) {
  process.exitCode = 1;
}
