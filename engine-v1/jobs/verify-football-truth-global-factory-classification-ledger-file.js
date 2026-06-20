import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const outPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-factory-classification-ledger-${today}`, `football-truth-global-factory-classification-ledger-${today}.json`);
const rowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-factory-classification-ledger-${today}`, `football-truth-global-factory-classification-ledger-rows-${today}.jsonl`);
const groupsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-factory-classification-ledger-${today}`, `football-truth-global-factory-classification-ledger-groups-${today}.json`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-factory-classification-ledger-verification-${today}`);
const verificationPath = path.join(verificationDir, `football-truth-global-factory-classification-ledger-verification-${today}.json`);

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

await fs.mkdir(verificationDir, { recursive: true });

const blocks = [];
const ledger = JSON.parse(await fs.readFile(outPath, "utf8"));
const rows = parseJsonl(await fs.readFile(rowsPath, "utf8"));
const groups = JSON.parse(await fs.readFile(groupsPath, "utf8"));

if (ledger.status !== "passed") blocks.push("ledger_not_passed");
if (ledger.runner !== "football_truth_global_factory_classification_ledger") blocks.push("runner_mismatch");
if (ledger.contractVersion !== 1) blocks.push("contract_version_not_1");
if (ledger.coverageFunnel?.allKnownSlugCount !== rows.length) blocks.push("all_known_slug_count_mismatch");
if ((ledger.coverageFunnel?.allKnownSlugCount || 0) < 300) blocks.push("all_known_slug_count_too_low_for_global_scan");
if (ledger.coverageFunnel?.countableCoverageNow !== 14) blocks.push("countable_coverage_now_not_14");
if (ledger.coverageFunnel?.explicitApprovalCandidate !== 1) blocks.push("explicit_approval_candidate_not_1");
if (ledger.coverageFunnel?.proofShapeNonzeroNeedsReview !== 3) blocks.push("proof_shape_nonzero_not_3");
if (ledger.coverageFunnel?.zeroPlayedStartDateMissing !== 2) blocks.push("zero_played_start_date_missing_not_2");

const countSum = Object.values(ledger.groupCounts || {}).reduce((sum, value) => sum + Number(value || 0), 0);
if (countSum !== rows.length) blocks.push("group_counts_do_not_sum_to_rows");

const guardrails = ledger.guardrails || {};
if (guardrails.searchExecutedNowCount !== 0) blocks.push("search_executed_not_zero");
if (guardrails.fetchExecutedNowCount !== 0) blocks.push("fetch_executed_not_zero");
if (guardrails.routeClaimMadeNowCount !== 0) blocks.push("route_claim_not_zero");
if (guardrails.familyClaimMadeNowCount !== 0) blocks.push("family_claim_not_zero");
if (guardrails.canonicalWriteExecutedNowCount !== 0) blocks.push("canonical_write_not_zero");
if (guardrails.lifecycleWriteExecutedNowCount !== 0) blocks.push("lifecycle_write_not_zero");
if (guardrails.productionWriteExecutedNowCount !== 0) blocks.push("production_write_not_zero");
if (guardrails.truthAssertionExecutedNowCount !== 0) blocks.push("truth_assertion_not_zero");
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_true");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_true");

for (const row of rows) {
  if (!row.slug) blocks.push("row_missing_slug");
  if (!row.classificationLane) blocks.push(`missing_classification_lane_${row.slug}`);
  if (row.countableCoverageNow === true && row.classificationLane !== "countable_verified_proof") blocks.push(`bad_countable_lane_${row.slug}`);
}

const verification = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_football_truth_global_factory_classification_ledger",
  contractVersion: 1,
  ledgerPath: rel(outPath),
  rowsPath: rel(rowsPath),
  groupsPath: rel(groupsPath),
  verificationPath: rel(verificationPath),
  ledgerSha256: await sha256(outPath),
  rowsSha256: await sha256(rowsPath),
  groupsSha256: await sha256(groupsPath),
  verified: {
    coverageFunnel: ledger.coverageFunnel,
    groupCounts: ledger.groupCounts,
    priorityOrder: ledger.priorityOrder,
    precisionContract: ledger.precisionContract,
    guardrailsHeld: blocks.length === 0
  },
  conclusion: "Global factory classification ledger is verified. It classifies all currently discoverable league slugs into countable coverage, near-ready review, rendered/API, zero-played, parked, or no-current-evidence lanes. No fetch/search/write/truth action was executed.",
  blocks
};

await fs.writeFile(verificationPath, `${JSON.stringify(verification, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  status: verification.status,
  verificationPath: verification.verificationPath,
  verified: verification.verified,
  conclusion: verification.conclusion,
  blocks: verification.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
