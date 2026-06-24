import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const reportPath = path.join(root, "data", "football-truth", "_review-only-candidates", `official-standings-${today}`, `football-truth-review-only-official-standings-candidates-${today}.json`);
const rowsPath = path.join(root, "data", "football-truth", "_review-only-candidates", `official-standings-${today}`, `football-truth-review-only-official-standings-candidates-rows-${today}.jsonl`);
const candidatesDir = path.join(root, "data", "football-truth", "_review-only-candidates", `official-standings-${today}`, "candidates");

const verificationDir = path.join(root, "data", "football-truth", "_review-only-candidates", `official-standings-${today}`, "verification");
const verificationPath = path.join(verificationDir, `football-truth-review-only-official-standings-candidates-verification-${today}.json`);

function rel(file) { return path.relative(root, file).replaceAll("\\", "/"); }
async function sha256(file) { return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex"); }
function parseJsonl(text) { return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }
function sorted(values) { return [...new Set(values || [])].sort((a,b) => a.localeCompare(b)); }

await fs.mkdir(verificationDir, { recursive: true });

const blocks = [];
const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
const rows = parseJsonl(await fs.readFile(rowsPath, "utf8"));

if (report.status !== "passed") blocks.push("report_not_passed");
if (report.runner !== "write_football_truth_review_only_official_standings_candidates") blocks.push("runner_mismatch");

const expectedSlugs = ["bih.1", "ita.2", "mne.1"];
if (JSON.stringify(sorted(report.summary?.reviewOnlyCandidateSlugs || [])) !== JSON.stringify(expectedSlugs)) blocks.push("candidate_slug_set_mismatch");
if (report.summary?.reviewOnlyCandidateWriteCount !== 3) blocks.push("candidate_write_count_not_3");
if (rows.length !== 3) blocks.push("rows_not_3");

const candidateFiles = await fs.readdir(candidatesDir);
const candidateJsonFiles = candidateFiles.filter(file => file.endsWith(".json")).sort();
if (candidateJsonFiles.length !== 3) blocks.push("candidate_file_count_not_3");

const candidates = [];
for (const file of candidateJsonFiles) {
  const candidatePath = path.join(candidatesDir, file);
  const candidate = JSON.parse(await fs.readFile(candidatePath, "utf8"));
  candidates.push({ candidatePath, candidate });

  if (candidate.status !== "review_only_candidate") blocks.push(`candidate_status_invalid_${file}`);
  if (candidate.candidateKind !== "official_standings_review_only") blocks.push(`candidate_kind_invalid_${file}`);
  if (!expectedSlugs.includes(candidate.slug)) blocks.push(`unexpected_candidate_slug_${candidate.slug}`);
  if (candidate.gates?.explicitReviewOnlyCandidateWriteApproval !== true) blocks.push(`approval_gate_missing_${candidate.slug}`);
  if (candidate.gates?.canonicalWriteApproved !== false) blocks.push(`canonical_gate_not_false_${candidate.slug}`);
  if (candidate.gates?.productionWriteApproved !== false) blocks.push(`production_gate_not_false_${candidate.slug}`);
  if (candidate.gates?.truthAssertionApproved !== false) blocks.push(`truth_gate_not_false_${candidate.slug}`);
  if (candidate.downstreamRestrictions?.reviewOnly !== true) blocks.push(`review_only_restriction_missing_${candidate.slug}`);
  if (candidate.downstreamRestrictions?.mayBePromotedToCanonicalWithoutSeparateApproval !== false) blocks.push(`canonical_promotion_restriction_missing_${candidate.slug}`);
  if (candidate.guardrails?.canonicalWriteExecutedNow !== false) blocks.push(`canonical_write_true_${candidate.slug}`);
  if (candidate.guardrails?.lifecycleWriteExecutedNow !== false) blocks.push(`lifecycle_write_true_${candidate.slug}`);
  if (candidate.guardrails?.productionWriteExecutedNow !== false) blocks.push(`production_write_true_${candidate.slug}`);
  if (candidate.guardrails?.truthAssertionExecutedNow !== false) blocks.push(`truth_assertion_true_${candidate.slug}`);
  if (candidate.guardrails?.rawPayloadCommitted !== false) blocks.push(`raw_payload_committed_true_${candidate.slug}`);
  if (candidate.guardrails?.fullRawPayloadWritten !== false) blocks.push(`full_raw_payload_written_true_${candidate.slug}`);

  const rows = candidate.standings?.rows || [];
  const metrics = candidate.standings?.metrics || {};
  if (rows.length < 8) blocks.push(`too_few_rows_${candidate.slug}`);
  if (metrics.duplicateTeamNameCount !== 0) blocks.push(`duplicate_team_names_${candidate.slug}`);
  if (metrics.arithmeticPassedRowCount < Math.ceil(rows.length * 0.7)) blocks.push(`arithmetic_gate_failed_${candidate.slug}`);
  if (!(metrics.maxPlayed > 0)) blocks.push(`max_played_not_positive_${candidate.slug}`);
  if (rows.some(row => Object.prototype.hasOwnProperty.call(row, "rawCells"))) blocks.push(`raw_cells_present_${candidate.slug}`);
}

const guardrails = report.guardrails || {};
if (guardrails.searchExecutedNowCount !== 0) blocks.push("search_executed_not_zero");
if (guardrails.fetchExecutedNowCount !== 0) blocks.push("fetch_executed_not_zero");
if (guardrails.reviewOnlyCandidateWriteExecutedNowCount !== 3) blocks.push("review_only_candidate_write_count_not_3");
if (guardrails.canonicalWriteExecutedNowCount !== 0) blocks.push("canonical_write_not_zero");
if (guardrails.lifecycleWriteExecutedNowCount !== 0) blocks.push("lifecycle_write_not_zero");
if (guardrails.productionWriteExecutedNowCount !== 0) blocks.push("production_write_not_zero");
if (guardrails.truthAssertionExecutedNowCount !== 0) blocks.push("truth_assertion_not_zero");
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_true");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_true");

const verification = {
  status: blocks.length ? "failed" : "passed",
  runner: "verify_football_truth_review_only_official_standings_candidates",
  contractVersion: 1,
  reportPath: rel(reportPath),
  rowsPath: rel(rowsPath),
  candidatesDir: rel(candidatesDir),
  verificationPath: rel(verificationPath),
  reportSha256: await sha256(reportPath),
  rowsSha256: await sha256(rowsPath),
  candidateFileSha256: Object.fromEntries(await Promise.all(candidateJsonFiles.map(async file => [file, await sha256(path.join(candidatesDir, file))]))),
  verified: {
    reviewOnlyCandidateSlugs: sorted(candidates.map(item => item.candidate.slug)),
    reviewOnlyCandidateWriteExecutedNowCount: guardrails.reviewOnlyCandidateWriteExecutedNowCount,
    canonicalWriteExecutedNowCount: guardrails.canonicalWriteExecutedNowCount,
    lifecycleWriteExecutedNowCount: guardrails.lifecycleWriteExecutedNowCount,
    productionWriteExecutedNowCount: guardrails.productionWriteExecutedNowCount,
    truthAssertionExecutedNowCount: guardrails.truthAssertionExecutedNowCount,
    rawPayloadCommitted: guardrails.rawPayloadCommitted,
    fullRawPayloadWritten: guardrails.fullRawPayloadWritten,
    guardrailsHeld: blocks.length === 0
  },
  conclusion: "Review-only official standings candidate files are verified for bih.1, ita.2, and mne.1. They are explicitly non-canonical, non-production, and non-truth-asserting; any promotion requires separate approval.",
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
