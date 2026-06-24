import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const reportPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-post-rollup-proof-cross-collision-fix-${today}`, `football-truth-post-rollup-proof-cross-collision-fix-${today}.json`);
const rowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-post-rollup-proof-cross-collision-fix-${today}`, `football-truth-post-rollup-proof-cross-collision-fix-rows-${today}.jsonl`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-post-rollup-proof-cross-collision-fix-verification-${today}`);
const verificationPath = path.join(verificationDir, `football-truth-post-rollup-proof-cross-collision-fix-verification-${today}.json`);

function rel(file) { return path.relative(root, file).replaceAll("\\", "/"); }
async function sha256(file) { return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex"); }
function parseJsonl(text) { return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }
function sorted(values) { return [...new Set(values || [])].sort((a,b) => a.localeCompare(b)); }

await fs.mkdir(verificationDir, { recursive: true });

const blocks = [];
const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
const rows = parseJsonl(await fs.readFile(rowsPath, "utf8"));

if (report.status !== "passed") blocks.push("report_not_passed");
if (report.runner !== "football_truth_post_rollup_proof_cross_collision_fix") blocks.push("runner_mismatch");
if (report.summary?.targetCount !== 5) blocks.push("target_count_not_5");
if (rows.length !== 5) blocks.push("rows_not_5");
if (JSON.stringify(sorted(rows.map(row => row.slug))) !== JSON.stringify(["arm.2","bih.2","egy.2","mne.2","qat.2"])) blocks.push("slug_set_mismatch");
if (JSON.stringify(sorted(report.summary?.correctedProofShapeCrossCandidateCollisionSlugs || [])) !== JSON.stringify(["bih.2","mne.2"])) blocks.push("collision_slug_set_mismatch");
if ((report.summary?.correctedProofShapeNonzeroNoCollisionSlugs || []).length !== 0) blocks.push("unexpected_no_collision_proof_shape_slugs");
if (JSON.stringify(sorted(report.summary?.correctedExtractionReviewRequiredSlugs || [])) !== JSON.stringify(["arm.2","egy.2","qat.2"])) blocks.push("extraction_review_slug_set_mismatch");

const expectedCollisions = { "bih.2": ["bih.1"], "mne.2": ["mne.1"] };
for (const [slug, expected] of Object.entries(expectedCollisions)) {
  const actual = sorted(report.summary?.correctedCrossCandidateCollisions?.[slug] || []);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) blocks.push(`collision_mapping_mismatch_${slug}`);
}

for (const row of rows) {
  if (!row.slug) blocks.push("row_missing_slug");
  if (!row.correctedFinalLane) blocks.push(`missing_corrected_final_lane_${row.slug}`);
  if (row.acceptedNow !== false) blocks.push(`accepted_now_true_${row.slug}`);
  if (row.reviewOnlyCandidateWriteExecutedNow !== false) blocks.push(`review_only_write_true_${row.slug}`);
  if (row.canonicalWriteExecutedNow !== false) blocks.push(`canonical_write_true_${row.slug}`);
  if (row.lifecycleWriteExecutedNow !== false) blocks.push(`lifecycle_write_true_${row.slug}`);
  if (row.productionWriteExecutedNow !== false) blocks.push(`production_write_true_${row.slug}`);
  if (row.truthAssertionExecutedNow !== false) blocks.push(`truth_assertion_true_${row.slug}`);
  if (row.rawPayloadCommitted !== false) blocks.push(`raw_payload_committed_true_${row.slug}`);
  if (row.fullRawPayloadWritten !== false) blocks.push(`full_raw_payload_written_true_${row.slug}`);
}

const guardrails = report.guardrails || {};
if (guardrails.searchExecutedNowCount !== 0) blocks.push("search_executed_not_zero");
if (guardrails.fetchExecutedNowCount !== 0) blocks.push("fetch_executed_not_zero");
if (guardrails.reviewOnlyCandidateWriteExecutedNowCount !== 0) blocks.push("review_only_candidate_write_not_zero");
if (guardrails.canonicalWriteExecutedNowCount !== 0) blocks.push("canonical_write_not_zero");
if (guardrails.lifecycleWriteExecutedNowCount !== 0) blocks.push("lifecycle_write_not_zero");
if (guardrails.productionWriteExecutedNowCount !== 0) blocks.push("production_write_not_zero");
if (guardrails.truthAssertionExecutedNowCount !== 0) blocks.push("truth_assertion_not_zero");
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_true");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_true");

const verification = {
  status: blocks.length ? "failed" : "passed",
  runner: "verify_football_truth_post_rollup_proof_cross_collision_fix",
  contractVersion: 1,
  reportPath: rel(reportPath),
  rowsPath: rel(rowsPath),
  verificationPath: rel(verificationPath),
  reportSha256: await sha256(reportPath),
  rowsSha256: await sha256(rowsPath),
  verified: {
    summary: report.summary,
    guardrailsHeld: blocks.length === 0
  },
  conclusion: "Post-rollup proof cross-collision fix is verified. Header-normalized fingerprints show bih.2 and mne.2 collide with existing review-only candidates, so no additional candidate writes are allowed for them.",
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

if (blocks.length) process.exitCode = 1;
