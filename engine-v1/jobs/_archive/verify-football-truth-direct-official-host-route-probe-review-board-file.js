import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const probePath = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `direct-official-host-previous-completed-route-probe-${today}`,
  `direct-official-host-previous-completed-route-probe-${today}.json`
);

const probeRowsPath = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `direct-official-host-previous-completed-route-probe-${today}`,
  `direct-official-host-previous-completed-route-probe-rows-${today}.jsonl`
);

const boardPath = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `direct-official-host-route-probe-review-board-${today}`,
  `direct-official-host-route-probe-review-board-${today}.json`
);

const boardRowsPath = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `direct-official-host-route-probe-review-board-${today}`,
  `direct-official-host-route-probe-review-board-rows-${today}.jsonl`
);

const verificationDir = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `direct-official-host-route-probe-review-board-verification-${today}`
);

const verificationPath = path.join(
  verificationDir,
  `direct-official-host-route-probe-review-board-verification-${today}.json`
);

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

const blocks = [];

const probe = JSON.parse(await fs.readFile(probePath, "utf8"));
const probeRows = parseJsonl(await fs.readFile(probeRowsPath, "utf8"));
const board = JSON.parse(await fs.readFile(boardPath, "utf8"));
const boardRows = parseJsonl(await fs.readFile(boardRowsPath, "utf8"));

if (probe.status !== "passed") blocks.push("probe_status_not_passed");
if (probe.contractVersion !== 1) blocks.push("probe_contract_version_not_1");
if (probe.summary?.selectedTargetCount !== 24) blocks.push("probe_selected_target_count_not_24");
if (probe.summary?.probeRowCount !== 864) blocks.push("probe_row_count_not_864");
if (probeRows.length !== probe.summary?.probeRowCount) blocks.push("probe_rows_jsonl_count_mismatch");
if (probe.summary?.fetched2xxCount !== 103) blocks.push("probe_fetched2xx_count_not_103");
if (probe.summary?.routeProbeCandidateCount !== 103) blocks.push("probe_broad_candidate_count_not_103");
if (probe.acceptance?.acceptedNowCount !== 0) blocks.push("probe_accepted_now_not_zero");

const probeGuardrails = probe.guardrails || {};
if (probeGuardrails.allowFetch !== true) blocks.push("probe_allow_fetch_not_true");
if (probeGuardrails.searchExecutedNowCount !== 0) blocks.push("probe_search_executed_not_zero");
if (probeGuardrails.fetchExecutedNowCount !== 864) blocks.push("probe_fetch_executed_not_864");
if (probeGuardrails.canonicalWriteExecutedNowCount !== 0) blocks.push("probe_canonical_write_not_zero");
if (probeGuardrails.productionWriteExecutedNowCount !== 0) blocks.push("probe_production_write_not_zero");
if (probeGuardrails.truthAssertionExecutedNowCount !== 0) blocks.push("probe_truth_assertion_not_zero");
if (probeGuardrails.rawPayloadCommitted !== false) blocks.push("probe_raw_payload_committed_not_false");
if (probeGuardrails.fullRawPayloadWritten !== false) blocks.push("probe_full_raw_payload_written_not_false");

if (board.status !== "passed") blocks.push("board_status_not_passed");
if (board.contractVersion !== 1) blocks.push("board_contract_version_not_1");
if (board.summary?.reviewedRawRowCount !== 864) blocks.push("board_reviewed_raw_row_count_not_864");
if (board.summary?.reviewedUniqueUrlCount !== 491) blocks.push("board_reviewed_unique_url_count_not_491");
if (boardRows.length !== board.summary?.reviewedUniqueUrlCount) blocks.push("board_rows_jsonl_count_mismatch");
if (board.summary?.originalBroadRouteProbeCandidateCount !== 103) blocks.push("board_original_broad_candidate_count_not_103");
if (board.summary?.strictActionableRouteCandidateCount !== 8) blocks.push("board_strict_actionable_count_not_8");
if (board.summary?.strictActionableSlugCount !== 6) blocks.push("board_strict_actionable_slug_count_not_6");
if (board.summary?.htmlExtractorProbeCandidateCount !== 3) blocks.push("board_html_extractor_count_not_3");
if (board.summary?.browserRenderProbeCandidateCount !== 5) blocks.push("board_browser_render_count_not_5");
if (board.summary?.acceptedNowCount !== 0) blocks.push("board_accepted_now_not_zero");

const boardGuardrails = board.guardrails || {};
for (const key of [
  "searchExecutedNowCount",
  "fetchExecutedNowCount",
  "canonicalWriteExecutedNowCount",
  "productionWriteExecutedNowCount",
  "truthAssertionExecutedNowCount"
]) {
  if (boardGuardrails[key] !== 0) blocks.push(`board_guardrail_${key}_not_zero`);
}
if (boardGuardrails.rawPayloadCommitted !== false) blocks.push("board_raw_payload_committed_not_false");
if (boardGuardrails.fullRawPayloadWritten !== false) blocks.push("board_full_raw_payload_written_not_false");

const expectedSelected = [
  ["aut.1", "html_extractor_probe_candidate", "https://www.bundesliga.at/de/tabelle"],
  ["aut.2", "html_extractor_probe_candidate", "https://www.2liga.at/de/tabelle"],
  ["mex.1", "html_extractor_probe_candidate", "https://ligamx.net/cancha/estadisticahistorica"],
  ["usa.1", "browser_render_probe_candidate", "https://www.mlssoccer.com/standings/"],
  ["pol.1", "browser_render_probe_candidate", "https://www.ekstraklasa.org/tabela/"],
  ["arg.2", "browser_render_probe_candidate", "https://www.afa.com.ar/standings/"]
];

const selected = board.summary?.selectedExtractorTargets || [];
if (selected.length !== expectedSelected.length) blocks.push("selected_extractor_targets_count_mismatch");

for (const [slug, action, url] of expectedSelected) {
  const found = selected.find(row => row.slug === slug && row.action === action && row.url === url);
  if (!found) blocks.push(`missing_selected_target_${slug}_${action}_${url}`);
  if (found && found.slug !== "arg.2" && found.strictScore < 120) blocks.push(`selected_target_score_too_low_${slug}`);
  if (found && found.action === "html_extractor_probe_candidate" && Number(found.rowTagCount || 0) < 20) {
    blocks.push(`html_extractor_target_lacks_row_evidence_${slug}`);
  }
}

for (const row of boardRows) {
  if (row.acceptanceAllowedNow !== false) blocks.push(`board_row_acceptance_allowed_${row.slug}`);
  if (row.reviewOnly !== true) blocks.push(`board_row_not_review_only_${row.slug}`);
  if (row.action === "html_extractor_probe_candidate" && Number(row.rowTagCount || 0) < 20) {
    blocks.push(`board_html_extractor_row_lacks_row_evidence_${row.slug}`);
  }
}

await fs.mkdir(verificationDir, { recursive: true });

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_direct_official_host_route_probe_review_board",
  contractVersion: 1,
  probePath: path.relative(root, probePath).replaceAll("\\", "/"),
  probeRowsPath: path.relative(root, probeRowsPath).replaceAll("\\", "/"),
  boardPath: path.relative(root, boardPath).replaceAll("\\", "/"),
  boardRowsPath: path.relative(root, boardRowsPath).replaceAll("\\", "/"),
  probeSha256: await sha256(probePath),
  probeRowsSha256: await sha256(probeRowsPath),
  boardSha256: await sha256(boardPath),
  boardRowsSha256: await sha256(boardRowsPath),
  verified: {
    probeSelectedTargetCount: probe.summary.selectedTargetCount,
    probeRowCount: probeRows.length,
    fetched2xxCount: probe.summary.fetched2xxCount,
    broadRouteProbeCandidateCount: probe.summary.routeProbeCandidateCount,
    strictActionableRouteCandidateCount: board.summary.strictActionableRouteCandidateCount,
    strictActionableSlugCount: board.summary.strictActionableSlugCount,
    htmlExtractorProbeCandidateCount: board.summary.htmlExtractorProbeCandidateCount,
    browserRenderProbeCandidateCount: board.summary.browserRenderProbeCandidateCount,
    selectedExtractorTargets: selected.map(row => ({
      slug: row.slug,
      action: row.action,
      url: row.url,
      strictScore: row.strictScore,
      tableTagCount: row.tableTagCount,
      rowTagCount: row.rowTagCount
    })),
    acceptedNowCount: board.summary.acceptedNowCount,
    guardrailsHeld: probeGuardrails.searchExecutedNowCount === 0 &&
      probeGuardrails.fetchExecutedNowCount === 864 &&
      probeGuardrails.canonicalWriteExecutedNowCount === 0 &&
      probeGuardrails.productionWriteExecutedNowCount === 0 &&
      probeGuardrails.truthAssertionExecutedNowCount === 0 &&
      probeGuardrails.rawPayloadCommitted === false &&
      probeGuardrails.fullRawPayloadWritten === false &&
      boardGuardrails.searchExecutedNowCount === 0 &&
      boardGuardrails.fetchExecutedNowCount === 0 &&
      boardGuardrails.canonicalWriteExecutedNowCount === 0 &&
      boardGuardrails.productionWriteExecutedNowCount === 0 &&
      boardGuardrails.truthAssertionExecutedNowCount === 0 &&
      boardGuardrails.rawPayloadCommitted === false &&
      boardGuardrails.fullRawPayloadWritten === false
  },
  conclusion: "Direct official-host probing found strict route-level extractor/render targets, but accepted no standings rows. Next step is controlled extractor/render proof against selected targets only.",
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
