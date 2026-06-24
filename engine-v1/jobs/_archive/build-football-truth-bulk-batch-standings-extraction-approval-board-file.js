import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const batchIndex = 1;
const pad = String(batchIndex).padStart(3, "0");

const proofPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-generic-standings-extraction-proof-${today}`, `bulk-batch-generic-standings-extraction-proof-batch-${pad}-${today}.json`);
const proofRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-generic-standings-extraction-proof-${today}`, `bulk-batch-generic-standings-extraction-proof-batch-${pad}-rows-${today}.jsonl`);
const proofVerificationPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-generic-standings-extraction-proof-verification-${today}`, `bulk-batch-generic-standings-extraction-proof-batch-${pad}-verification-${today}.json`);
const tableIdentityGatePath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-html-table-identity-gate-${today}`, `bulk-batch-html-table-identity-gate-batch-${pad}-${today}.json`);

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-standings-extraction-approval-board-${today}`);
const outPath = path.join(outDir, `bulk-batch-standings-extraction-approval-board-batch-${pad}-${today}.json`);
const rowsPath = path.join(outDir, `bulk-batch-standings-extraction-approval-board-batch-${pad}-rows-${today}.jsonl`);

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function shaText(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

function inferSeasonLabel(row) {
  const title = String(row.title || "");
  const url = String(row.finalUrl || "");
  const combined = `${title} ${url}`;

  const m1 = combined.match(/\b(20\d{2})[/-](\d{2})\b/);
  if (m1) return `${m1[1]}/${m1[2]}`;

  const m2 = combined.match(/\b(20\d{2})\b/);
  if (m2) return m2[1];

  return null;
}

function inferSeasonScope(row, seasonLabel) {
  if (row.extractionProofStatus === "proof_passed_zero_played_table_needs_start_date_lane") return "current_or_next_season_zero_played";
  if (row.slug === "ksa.1" && seasonLabel === "2025/26" && row.maxPlayed === 34) return "previous_completed_or_recent_completed";
  if (row.maxPlayed > 0) return "nonzero_standings_season_scope_requires_review";
  return "unknown";
}

function makeBoardRow(row) {
  const seasonLabel = inferSeasonLabel(row);
  const seasonScope = inferSeasonScope(row, seasonLabel);
  const blocks = [];

  if (row.extractionProofStatus === "proof_failed") blocks.push("proof_failed");
  if (row.arithmeticFailedRowCount !== 0) blocks.push("arithmetic_failed");
  if (row.duplicateTeamNameCount !== 0) blocks.push("duplicate_team_names");
  if (!seasonLabel) blocks.push("season_label_not_explicit_in_title_or_url");
  if (seasonScope === "current_or_next_season_zero_played") blocks.push("zero_played_requires_start_date_lifecycle_lane");
  if (seasonScope === "nonzero_standings_season_scope_requires_review") blocks.push("season_scope_requires_review_before_candidate_write");

  const eligibleAfterExplicitApproval =
    blocks.length === 0 &&
    row.extractionProofStatus === "proof_passed_nonzero_standings" &&
    row.slug === "ksa.1" &&
    seasonLabel === "2025/26";

  return {
    slug: row.slug,
    batchIndex,
    seasonLabel,
    seasonScope,
    finalUrl: row.finalUrl,
    finalHost: row.finalHost,
    title: row.title,
    extractionProofStatus: row.extractionProofStatus,
    extractedStandingRowCount: row.extractedStandingRowCount,
    expectedStandingRowCount: row.expectedStandingRowCount,
    minPlayed: row.minPlayed,
    maxPlayed: row.maxPlayed,
    arithmeticPassedRowCount: row.arithmeticPassedRowCount,
    arithmeticFailedRowCount: row.arithmeticFailedRowCount,
    duplicateTeamNameCount: row.duplicateTeamNameCount,
    validationBlocks: row.validationBlocks,
    firstTeam: row.standingsRows?.[0]?.teamName || null,
    lastTeam: row.standingsRows?.[row.standingsRows.length - 1]?.teamName || null,
    reviewOnlyCandidateEligibleAfterExplicitApproval: eligibleAfterExplicitApproval,
    reviewOnlyCandidateBlocked: !eligibleAfterExplicitApproval,
    reviewOnlyCandidateBlocks: blocks,
    requiredNextLane:
      eligibleAfterExplicitApproval ? "explicit_user_approval_for_review_only_candidate_write" :
      blocks.includes("zero_played_requires_start_date_lifecycle_lane") ? "start_date_lifecycle_lane" :
      blocks.includes("season_label_not_explicit_in_title_or_url") || blocks.includes("season_scope_requires_review_before_candidate_write") ? "season_identity_lifecycle_review" :
      "route_or_parser_review",
    canonicalCandidateWriteAllowedNow: false,
    lifecycleCandidateWriteAllowedNow: false,
    productionWriteAllowedNow: false,
    truthAssertionAllowedNow: false,
    acceptedNow: false,
    evidenceSha256: shaText(JSON.stringify({
      slug: row.slug,
      seasonLabel,
      seasonScope,
      finalUrl: row.finalUrl,
      title: row.title,
      extractionProofStatus: row.extractionProofStatus,
      rowCount: row.extractedStandingRowCount,
      maxPlayed: row.maxPlayed,
      blocks
    }))
  };
}

await fs.mkdir(outDir, { recursive: true });

const proof = JSON.parse(await fs.readFile(proofPath, "utf8"));
const proofRows = parseJsonl(await fs.readFile(proofRowsPath, "utf8"));
const proofVerification = JSON.parse(await fs.readFile(proofVerificationPath, "utf8"));
const tableIdentityGate = JSON.parse(await fs.readFile(tableIdentityGatePath, "utf8"));
const blocks = [];

if (proof.status !== "passed") blocks.push("proof_not_passed");
if (proofVerification.status !== "passed") blocks.push("proof_verification_not_passed");
if (tableIdentityGate.status !== "passed") blocks.push("table_identity_gate_not_passed");
if (proof.summary?.proofPassedNonzeroCount !== 2) blocks.push("proof_nonzero_count_not_2");
if (proof.summary?.proofPassedZeroPlayedCount !== 1) blocks.push("proof_zero_count_not_1");

const rows = proofRows.map(makeBoardRow);

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "bulk_batch_standings_extraction_approval_board",
  contractVersion: 1,
  batchIndex,
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  proofPath: rel(proofPath),
  proofRowsPath: rel(proofRowsPath),
  proofVerificationPath: rel(proofVerificationPath),
  tableIdentityGatePath: rel(tableIdentityGatePath),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    batchIndex,
    boardRowCount: rows.length,
    eligibleAfterExplicitApprovalCount: rows.filter(row => row.reviewOnlyCandidateEligibleAfterExplicitApproval).length,
    blockedCount: rows.filter(row => row.reviewOnlyCandidateBlocked).length,
    eligibleAfterExplicitApprovalSlugs: rows.filter(row => row.reviewOnlyCandidateEligibleAfterExplicitApproval).map(row => row.slug),
    blockedSlugs: rows.filter(row => row.reviewOnlyCandidateBlocked).map(row => row.slug),
    requiredNextLaneBySlug: Object.fromEntries(rows.map(row => [row.slug, row.requiredNextLane])),
    blocksBySlug: Object.fromEntries(rows.map(row => [row.slug, row.reviewOnlyCandidateBlocks])),
    explicitUserApprovalRequiredBeforeCandidateWrite: true,
    canonicalCandidateWriteAllowedNow: false,
    lifecycleCandidateWriteAllowedNow: false,
    productionWriteAllowedNow: false,
    truthAssertionAllowedNow: false,
    acceptedNowCount: 0,
    nextRecommendedLane: "ask explicit approval only for ksa.1 review-only standings candidate write; route aut.2 to season identity review and jpn.2 to start-date lifecycle lane"
  },
  rows,
  blocks
};

await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsPath, rows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  guardrails: report.guardrails,
  summary: report.summary,
  rows: report.rows.map(row => ({
    slug: row.slug,
    seasonLabel: row.seasonLabel,
    seasonScope: row.seasonScope,
    extractionProofStatus: row.extractionProofStatus,
    rowCount: row.extractedStandingRowCount,
    minPlayed: row.minPlayed,
    maxPlayed: row.maxPlayed,
    firstTeam: row.firstTeam,
    lastTeam: row.lastTeam,
    eligibleAfterExplicitApproval: row.reviewOnlyCandidateEligibleAfterExplicitApproval,
    blocked: row.reviewOnlyCandidateBlocked,
    blocks: row.reviewOnlyCandidateBlocks,
    requiredNextLane: row.requiredNextLane
  })),
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
