import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const ledgerPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-factory-lane-ledger-${today}`, `football-truth-factory-lane-ledger-${today}.json`);
const rowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-factory-lane-ledger-${today}`, `football-truth-factory-lane-ledger-rows-${today}.jsonl`);
const groupsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-factory-lane-ledger-${today}`, `football-truth-factory-lane-ledger-groups-${today}.json`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-factory-lane-ledger-verification-${today}`);
const verificationPath = path.join(verificationDir, `football-truth-factory-lane-ledger-verification-${today}.json`);

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
const ledger = JSON.parse(await fs.readFile(ledgerPath, "utf8"));
const rows = parseJsonl(await fs.readFile(rowsPath, "utf8"));
const groups = JSON.parse(await fs.readFile(groupsPath, "utf8"));

if (ledger.status !== "passed") blocks.push("ledger_not_passed");
if (ledger.runner !== "football_truth_factory_lane_ledger") blocks.push("runner_mismatch");
if (ledger.contractVersion !== 1) blocks.push("contract_version_not_1");
if (ledger.groups?.counts?.previousCompletedVerifiedProof !== 14) blocks.push("previous_completed_verified_count_not_14");
if (ledger.groups?.counts?.countableCoverageNow !== 14) blocks.push("countable_coverage_now_not_14");
if (ledger.groups?.counts?.reviewOnlyCandidateEligibleAfterExplicitApproval !== 1) blocks.push("approval_candidate_count_not_1");
if (ledger.groups?.counts?.zeroPlayedStartDateMissing !== 2) blocks.push("zero_played_start_date_missing_count_not_2");
if (ledger.groups?.counts?.batch3ProofShapePassedNonzeroNeedsSeasonReview !== 3) blocks.push("batch3_nonzero_proof_count_not_3");
if (ledger.groups?.counts?.batch3ExtractionReviewRequired !== 4) blocks.push("batch3_extraction_review_count_not_4");
if (ledger.groups?.counts?.batch3RenderedOrApiRequired !== 17) blocks.push("batch3_rendered_api_count_not_17");
if (ledger.groups?.counts?.batch3RouteNotFound !== 4) blocks.push("batch3_route_not_found_count_not_4");
if ((ledger.groups?.counts?.sameSourceSameRowsCollisionGroups || 0) < 2) blocks.push("collision_groups_less_than_2");

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
  if (!Array.isArray(row.laneGroups) || row.laneGroups.length === 0) blocks.push(`row_missing_lane_${row.slug}`);
  if (row.countableCoverageNow === true && row.precisionStatus !== "countable_verified_proof") blocks.push(`countable_row_bad_precision_${row.slug}`);
}

const verification = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_football_truth_factory_lane_ledger",
  contractVersion: 1,
  ledgerPath: rel(ledgerPath),
  rowsPath: rel(rowsPath),
  groupsPath: rel(groupsPath),
  verificationPath: rel(verificationPath),
  ledgerSha256: await sha256(ledgerPath),
  rowsSha256: await sha256(rowsPath),
  groupsSha256: await sha256(groupsPath),
  verified: {
    countableCoverageNow: ledger.summary.countableCoverageNow,
    previousCompletedVerifiedProofCount: ledger.summary.previousCompletedVerifiedProofCount,
    immediateFactoryCandidatesNotCountableYet: ledger.summary.immediateFactoryCandidatesNotCountableYet,
    rejectionsAndParks: ledger.summary.rejectionsAndParks,
    collisionGroups: ledger.summary.collisionGroups,
    priorityOrder: groups.priorityOrder,
    guardrailsHeld: blocks.length === 0
  },
  conclusion: "Factory lane ledger is verified. It records countable coverage, not-yet-countable proof-shape candidates, rendered/API lanes, review lanes, rejected/not-found lanes, and collision risks in one mass classification artifact. No fetch/search/write/truth action was executed.",
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
