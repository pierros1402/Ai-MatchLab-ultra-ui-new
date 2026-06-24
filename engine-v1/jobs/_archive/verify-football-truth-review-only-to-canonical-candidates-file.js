import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const reportPath = path.join(root, "data", "football-truth", "_canonical-candidates", `official-standings-${today}`, `football-truth-canonical-official-standings-candidates-${today}.json`);
const rowsPath = path.join(root, "data", "football-truth", "_canonical-candidates", `official-standings-${today}`, `football-truth-canonical-official-standings-candidates-rows-${today}.jsonl`);
const candidatesDir = path.join(root, "data", "football-truth", "_canonical-candidates", `official-standings-${today}`, "candidates");
const verificationDir = path.join(root, "data", "football-truth", "_canonical-candidates", `official-standings-${today}`, "verification");
const verificationPath = path.join(verificationDir, `football-truth-canonical-official-standings-candidates-verification-${today}.json`);

function rel(file) { return path.relative(root, file).replaceAll("\\", "/"); }
async function sha256(file) { return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex"); }
function parseJsonl(text) { return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }
function sorted(values) { return [...new Set(values || [])].sort((a,b) => a.localeCompare(b)); }

await fs.mkdir(verificationDir, { recursive: true });

const blocks = [];
const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
const rows = parseJsonl(await fs.readFile(rowsPath, "utf8"));
const expectedSlugs = ["bih.1", "ita.2", "mne.1"];

if (report.status !== "passed") blocks.push("report_not_passed");
if (report.runner !== "promote_football_truth_review_only_to_canonical_candidates") blocks.push("runner_mismatch");
if (report.summary?.canonicalCandidateWriteCount !== 3) blocks.push("canonical_candidate_write_count_not_3");
if (JSON.stringify(sorted(report.summary?.canonicalCandidateSlugs || [])) !== JSON.stringify(expectedSlugs)) blocks.push("canonical_candidate_slug_set_mismatch");
if (rows.length !== 3) blocks.push("rows_not_3");

const files = (await fs.readdir(candidatesDir)).filter(file => file.endsWith(".json")).sort();
if (files.length !== 3) blocks.push("candidate_file_count_not_3");

const candidateFileSha256 = {};
for (const file of files) {
  const candidatePath = path.join(candidatesDir, file);
  const candidate = JSON.parse(await fs.readFile(candidatePath, "utf8"));
  candidateFileSha256[file] = await sha256(candidatePath);

  if (candidate.status !== "canonical_candidate") blocks.push(`candidate_status_invalid_${file}`);
  if (candidate.candidateKind !== "official_standings_canonical_candidate") blocks.push(`candidate_kind_invalid_${file}`);
  if (!expectedSlugs.includes(candidate.slug)) blocks.push(`unexpected_slug_${candidate.slug}`);
  if (candidate.gates?.explicitCanonicalCandidatePromotionApproval !== true) blocks.push(`promotion_approval_missing_${candidate.slug}`);
  if (candidate.gates?.productionWriteApproved !== false) blocks.push(`production_gate_not_false_${candidate.slug}`);
  if (candidate.gates?.truthAssertionApproved !== false) blocks.push(`truth_gate_not_false_${candidate.slug}`);
  if (candidate.downstreamRestrictions?.canonicalCandidateOnly !== true) blocks.push(`canonical_candidate_only_missing_${candidate.slug}`);
  if (candidate.downstreamRestrictions?.mayWriteLifecycleWithoutSeparateApproval !== false) blocks.push(`lifecycle_restriction_missing_${candidate.slug}`);
  if (candidate.downstreamRestrictions?.mayWriteProductionWithoutSeparateApproval !== false) blocks.push(`production_restriction_missing_${candidate.slug}`);
  if (candidate.downstreamRestrictions?.mayAssertTruthWithoutSeparateApproval !== false) blocks.push(`truth_restriction_missing_${candidate.slug}`);
  if (candidate.guardrails?.canonicalCandidateWriteExecutedNow !== true) blocks.push(`canonical_candidate_write_not_true_${candidate.slug}`);
  if (candidate.guardrails?.lifecycleWriteExecutedNow !== false) blocks.push(`lifecycle_write_true_${candidate.slug}`);
  if (candidate.guardrails?.productionWriteExecutedNow !== false) blocks.push(`production_write_true_${candidate.slug}`);
  if (candidate.guardrails?.truthAssertionExecutedNow !== false) blocks.push(`truth_assertion_true_${candidate.slug}`);
  if (candidate.guardrails?.rawPayloadCommitted !== false) blocks.push(`raw_payload_committed_true_${candidate.slug}`);
  if (candidate.guardrails?.fullRawPayloadWritten !== false) blocks.push(`full_raw_payload_written_true_${candidate.slug}`);

  const metrics = candidate.standings?.metrics || {};
  const standingRows = candidate.standings?.rows || [];
  if (standingRows.length < 8) blocks.push(`too_few_rows_${candidate.slug}`);
  if (metrics.duplicateTeamNameCount !== 0) blocks.push(`duplicate_team_names_${candidate.slug}`);
  if (metrics.arithmeticPassedRowCount < Math.ceil(metrics.standingRowCount * 0.7)) blocks.push(`arithmetic_gate_failed_${candidate.slug}`);
  if (!(metrics.maxPlayed > 0)) blocks.push(`max_played_not_positive_${candidate.slug}`);
}

const guardrails = report.guardrails || {};
if (guardrails.searchExecutedNowCount !== 0) blocks.push("search_executed_not_zero");
if (guardrails.fetchExecutedNowCount !== 0) blocks.push("fetch_executed_not_zero");
if (guardrails.reviewOnlyCandidateWriteExecutedNowCount !== 0) blocks.push("review_only_write_not_zero");
if (guardrails.canonicalCandidateWriteExecutedNowCount !== 3) blocks.push("canonical_candidate_write_count_not_3");
if (guardrails.lifecycleWriteExecutedNowCount !== 0) blocks.push("lifecycle_write_not_zero");
if (guardrails.productionWriteExecutedNowCount !== 0) blocks.push("production_write_not_zero");
if (guardrails.truthAssertionExecutedNowCount !== 0) blocks.push("truth_assertion_not_zero");
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_true");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_true");

const verification = {
  status: blocks.length ? "failed" : "passed",
  runner: "verify_football_truth_review_only_to_canonical_candidates",
  contractVersion: 1,
  reportPath: rel(reportPath),
  rowsPath: rel(rowsPath),
  candidatesDir: rel(candidatesDir),
  verificationPath: rel(verificationPath),
  reportSha256: await sha256(reportPath),
  rowsSha256: await sha256(rowsPath),
  candidateFileSha256,
  verified: {
    canonicalCandidateSlugs: sorted(report.summary?.canonicalCandidateSlugs || []),
    canonicalCandidateWriteExecutedNowCount: guardrails.canonicalCandidateWriteExecutedNowCount,
    lifecycleWriteExecutedNowCount: guardrails.lifecycleWriteExecutedNowCount,
    productionWriteExecutedNowCount: guardrails.productionWriteExecutedNowCount,
    truthAssertionExecutedNowCount: guardrails.truthAssertionExecutedNowCount,
    guardrailsHeld: blocks.length === 0
  },
  conclusion: "Canonical candidate promotion is verified for bih.1, ita.2, and mne.1. This is not lifecycle, production, or truth write. Next bulk progress must come from reusable family adapters and targeted high-value route expansion, not blind long-tail probing.",
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
