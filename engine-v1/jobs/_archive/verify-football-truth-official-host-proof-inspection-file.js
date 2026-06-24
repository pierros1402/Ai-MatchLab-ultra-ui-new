import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const proofPath = path.join(root, "data", "football-truth", "_diagnostics", `official-host-proof-target-board-${today}`, `official-host-proof-target-board-${today}.json`);
const inspectionPath = path.join(root, "data", "football-truth", "_diagnostics", `official-host-proof-inspection-${today}`, `official-host-proof-inspection-${today}.json`);
const inspectionRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `official-host-proof-inspection-${today}`, `official-host-proof-inspection-rows-${today}.jsonl`);

const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `official-host-proof-inspection-verification-${today}`);
const verificationPath = path.join(verificationDir, `official-host-proof-inspection-verification-${today}.json`);

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

const blocks = [];

const proof = JSON.parse(await fs.readFile(proofPath, "utf8"));
const inspection = JSON.parse(await fs.readFile(inspectionPath, "utf8"));
const rows = parseJsonl(await fs.readFile(inspectionRowsPath, "utf8"));

if (inspection.status !== "passed") blocks.push("inspection_status_not_passed");
if (inspection.contractVersion !== 1) blocks.push("inspection_contract_version_not_1");
if (inspection.summary?.selectedProofTargetCount !== 21) blocks.push("selected_proof_target_count_not_21");
if (inspection.summary?.inspectedTargetCount !== 21) blocks.push("inspected_target_count_not_21");
if (inspection.summary?.inspectedSlugCount !== 10) blocks.push("inspected_slug_count_not_10");
if (rows.length !== inspection.summary?.inspectedTargetCount) blocks.push("inspection_rows_count_mismatch");
if (inspection.summary?.fetched2xxCount !== 18) blocks.push("fetched2xx_count_not_18");
if (inspection.summary?.fetchFailedCount !== 3) blocks.push("fetch_failed_count_not_3");
if (inspection.summary?.htmlTableExtractionCandidateCount !== 8) blocks.push("html_table_extraction_candidate_count_not_8");
if (inspection.summary?.jsonRankTableCandidateCount !== 1) blocks.push("json_rank_table_candidate_count_not_1");
if (inspection.summary?.scriptEndpointFollowupCandidateCount !== 1) blocks.push("script_endpoint_followup_candidate_count_not_1");
if (inspection.summary?.browserRenderRequiredCount !== 5) blocks.push("browser_render_required_count_not_5_after_gender_guard");
if (inspection.summary?.parkedCount !== 6) blocks.push("parked_count_not_6_after_gender_guard");
if (inspection.summary?.acceptedNowCount !== 0) blocks.push("accepted_now_count_not_zero");

const guardrails = inspection.guardrails || {};
if (guardrails.allowFetch !== true) blocks.push("allow_fetch_not_true");
if (guardrails.searchExecutedNowCount !== 0) blocks.push("search_executed_not_zero");
if (guardrails.fetchExecutedNowCount !== 21) blocks.push("fetch_executed_not_21");
if (guardrails.canonicalWriteExecutedNowCount !== 0) blocks.push("canonical_write_not_zero");
if (guardrails.productionWriteExecutedNowCount !== 0) blocks.push("production_write_not_zero");
if (guardrails.truthAssertionExecutedNowCount !== 0) blocks.push("truth_assertion_not_zero");
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_not_false");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_not_false");

const expectedExtractionTargets = [
  ["aut.1", "html_table_extraction_candidate", "https://www.bundesliga.at/de/tabelle/saison-2024-2025"],
  ["aut.1", "html_table_extraction_candidate", "https://www.bundesliga.at/de/tabelle/saison-2025-2026"],
  ["aut.2", "html_table_extraction_candidate", "https://www.2liga.at/de/tabelle/saison-2024-2025"],
  ["aut.2", "html_table_extraction_candidate", "https://www.2liga.at/de/tabelle/saison-2025-2026"],
  ["aus.1", "html_table_extraction_candidate", "https://aleagues.com.au/ladders/a-league-men/"],
  ["mex.1", "html_table_extraction_candidate", "https://ligamx.net/cancha/estadisticahistorica"],
  ["mex.1", "html_table_extraction_candidate", "https://ligamx.net/cancha/estadisticahistorica/1/"],
  ["nor.1", "html_table_extraction_candidate", "https://www.eliteserien.no/tabell"],
  ["kor.1", "json_rank_table_candidate", "https://www.kleague.com/api/clubRank.do"]
];

const nextExtractionTargets = inspection.summary?.nextExtractionTargets || [];
if (nextExtractionTargets.length !== expectedExtractionTargets.length) blocks.push("next_extraction_target_count_not_9");

for (const [slug, outcome, candidateUrl] of expectedExtractionTargets) {
  const found = nextExtractionTargets.find(row => row.slug === slug && row.proofOutcome === outcome && row.candidateUrl === candidateUrl);
  if (!found) blocks.push(`missing_next_extraction_target_${slug}_${outcome}_${candidateUrl}`);
}

const genderMismatchRows = rows.filter(row => row.genderMismatchSignal === true);
for (const row of genderMismatchRows) {
  if (row.proofOutcome !== "park") blocks.push(`gender_mismatch_not_parked_${row.slug}_${row.candidateUrl}`);
}

const rawPayloadFields = ["body", "rawBody", "html", "rawHtml", "script", "rawPayload", "fullRawPayload"];
for (const row of rows) {
  if (row.acceptanceAllowedNow !== false) blocks.push(`row_acceptance_allowed_${row.slug}`);
  if (row.reviewOnly !== true) blocks.push(`row_not_review_only_${row.slug}`);
  if (row.acceptedNow !== false) blocks.push(`row_accepted_now_not_false_${row.slug}`);
  for (const field of rawPayloadFields) {
    if (Object.prototype.hasOwnProperty.call(row, field)) blocks.push(`raw_payload_field_present_${field}_${row.slug}`);
  }
  if (row.proofOutcome === "html_table_extraction_candidate" && Number(row.rowTagCount || 0) < 10) {
    blocks.push(`html_candidate_lacks_row_evidence_${row.slug}`);
  }
  if (row.proofOutcome === "json_rank_table_candidate" && Number(row.standingsLikeArrayCount || 0) < 1) {
    blocks.push(`json_candidate_lacks_standings_array_${row.slug}`);
  }
}

await fs.mkdir(verificationDir, { recursive: true });

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_official_host_proof_inspection",
  contractVersion: 1,
  proofPath: path.relative(root, proofPath).replaceAll("\\", "/"),
  inspectionPath: path.relative(root, inspectionPath).replaceAll("\\", "/"),
  inspectionRowsPath: path.relative(root, inspectionRowsPath).replaceAll("\\", "/"),
  proofSha256: await sha256(proofPath),
  inspectionSha256: await sha256(inspectionPath),
  inspectionRowsSha256: await sha256(inspectionRowsPath),
  verified: {
    sourceSelectedProofTargetCount: proof.summary.selectedProofTargetCount,
    inspectedTargetCount: inspection.summary.inspectedTargetCount,
    inspectedSlugCount: inspection.summary.inspectedSlugCount,
    fetched2xxCount: inspection.summary.fetched2xxCount,
    fetchFailedCount: inspection.summary.fetchFailedCount,
    htmlTableExtractionCandidateCount: inspection.summary.htmlTableExtractionCandidateCount,
    jsonRankTableCandidateCount: inspection.summary.jsonRankTableCandidateCount,
    scriptEndpointFollowupCandidateCount: inspection.summary.scriptEndpointFollowupCandidateCount,
    browserRenderRequiredCount: inspection.summary.browserRenderRequiredCount,
    parkedCount: inspection.summary.parkedCount,
    nextExtractionTargetCount: nextExtractionTargets.length,
    nextExtractionSlugs: [...new Set(nextExtractionTargets.map(row => row.slug))],
    genderMismatchParkedCount: genderMismatchRows.filter(row => row.proofOutcome === "park").length,
    acceptedNowCount: inspection.summary.acceptedNowCount,
    guardrailsHeld: guardrails.searchExecutedNowCount === 0 &&
      guardrails.fetchExecutedNowCount === 21 &&
      guardrails.canonicalWriteExecutedNowCount === 0 &&
      guardrails.productionWriteExecutedNowCount === 0 &&
      guardrails.truthAssertionExecutedNowCount === 0 &&
      guardrails.rawPayloadCommitted === false &&
      guardrails.fullRawPayloadWritten === false
  },
  conclusion: "Proof inspection produced 9 extraction candidates across 6 slugs and parked the A-League Women gender mismatch. No rows accepted. Next step is exact row extraction and validation for nextExtractionTargets.",
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
