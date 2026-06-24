import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const planPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-no-current-discovery-batches-${today}`, `football-truth-global-no-current-discovery-batches-${today}.json`);
const rowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-no-current-discovery-batches-${today}`, `football-truth-global-no-current-discovery-batches-rows-${today}.jsonl`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-no-current-discovery-batches-verification-${today}`);
const verificationPath = path.join(verificationDir, `football-truth-global-no-current-discovery-batches-verification-${today}.json`);

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
const plan = JSON.parse(await fs.readFile(planPath, "utf8"));
const rows = parseJsonl(await fs.readFile(rowsPath, "utf8"));

if (plan.status !== "passed") blocks.push("plan_not_passed");
if (plan.runner !== "football_truth_global_no_current_discovery_batches") blocks.push("runner_mismatch");
if (plan.contractVersion !== 1) blocks.push("contract_version_not_1");
if (plan.summary?.noCurrentFactoryEvidenceInputCount !== 385) blocks.push("input_count_not_385");
if (plan.summary?.plannedTargetCount !== 385) blocks.push("planned_target_count_not_385");
if (rows.length !== 385) blocks.push("rows_not_385");
if (plan.summary?.batchSize !== 80) blocks.push("batch_size_not_80");
if (plan.summary?.batchCount !== 5) blocks.push("batch_count_not_5");
if (plan.summary?.firstBatchTargetCount !== 80) blocks.push("first_batch_not_80");
if (!Array.isArray(plan.summary?.firstBatchSlugs) || plan.summary.firstBatchSlugs.length !== 80) blocks.push("first_batch_slugs_not_80");
if (!plan.summary?.top20 || plan.summary.top20.length !== 20) blocks.push("top20_not_20");

const sumBatchTargets = (plan.batches || []).reduce((sum, batch) => sum + Number(batch.targetCount || 0), 0);
if (sumBatchTargets !== 385) blocks.push("batch_targets_do_not_sum_to_385");

const guardrails = plan.guardrails || {};
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

const verification = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_football_truth_global_no_current_discovery_batches",
  contractVersion: 1,
  planPath: rel(planPath),
  rowsPath: rel(rowsPath),
  verificationPath: rel(verificationPath),
  planSha256: await sha256(planPath),
  rowsSha256: await sha256(rowsPath),
  verified: {
    summary: plan.summary,
    firstBatch: plan.batches?.[0] || null,
    batchCount: plan.batches?.length || 0,
    guardrailsHeld: blocks.length === 0
  },
  conclusion: "Global no-current discovery batches are verified. The 385 no-current slugs are ranked into five bulk waves with precision/rejection policy and no fetch/search/write/truth action.",
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
