import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const boardPath = path.join(root, "data", "football-truth", "_diagnostics", `refreshed-prioritized-high-yield-lifecycle-expansion-board-${today}`, `refreshed-prioritized-high-yield-lifecycle-expansion-board-${today}.json`);
const rowsPath = path.join(root, "data", "football-truth", "_diagnostics", `refreshed-prioritized-high-yield-lifecycle-expansion-board-${today}`, `refreshed-prioritized-high-yield-lifecycle-expansion-board-rows-${today}.jsonl`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `refreshed-prioritized-high-yield-lifecycle-expansion-board-verification-${today}`);
const verificationPath = path.join(verificationDir, `refreshed-prioritized-high-yield-lifecycle-expansion-board-verification-${today}.json`);

const satisfiedPreviousCompleted = new Set([
  "esp.1", "esp.2", "ger.1", "ger.2", "ger.3", "cro.1",
  "sco.1", "sco.2", "ned.1", "den.1", "jpn.1", "eng.1"
]);

const satisfiedCurrentOrNew = new Set([
  "geo.1", "cyp.1", "fin.1", "fin.2", "isl.1", "isl.2", "nor.1", "swe.1", "swe.2"
]);

const satisfiedNextSeasonStartDate = new Set(["eng.1", "ksa.1"]);
const blockedWithoutEvidence = new Set(["nor.2", "cyp.2"]);
const reviewOnly = new Set(["ita.1"]);

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

const blocks = [];
const board = JSON.parse(await fs.readFile(boardPath, "utf8"));
const rows = (await fs.readFile(rowsPath, "utf8"))
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .map(line => JSON.parse(line));

if (board.status !== "passed") blocks.push("board_status_not_passed");
if (board.summary.acceptedBoardRowCount !== 160) blocks.push("accepted_board_row_count_not_160");
if (rows.length !== 160) blocks.push("rows_jsonl_count_not_160");
if (board.summary.previousCompletedExpansionRowCount !== 160) blocks.push("previous_completed_expansion_count_not_160");
if (board.summary.nextSeasonStartDateExpansionRowCount !== 0) blocks.push("unexpected_next_season_start_date_rows");
if (board.summary.sourceFamilyRows !== 0) blocks.push("unexpected_review_source_family_rows");

const guardrails = board.guardrails || {};
for (const key of [
  "searchExecutedNowCount",
  "fetchExecutedNowCount",
  "canonicalWriteExecutedNowCount",
  "productionWriteExecutedNowCount",
  "truthAssertionExecutedNowCount"
]) {
  if (guardrails[key] !== 0) blocks.push(`guardrail_${key}_not_zero`);
}
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_not_false");

const rowKeys = new Set();
for (const row of rows) {
  const key = `${row.slug}|${row.lane}`;
  if (rowKeys.has(key)) blocks.push(`duplicate_row_${key}`);
  rowKeys.add(key);

  if (row.lane !== "previous_completed_standings") blocks.push(`non_previous_completed_lane_${key}`);
  if (satisfiedPreviousCompleted.has(row.slug)) blocks.push(`already_satisfied_previous_completed_present_${row.slug}`);
  if (reviewOnly.has(row.slug)) blocks.push(`review_only_present_${row.slug}`);
  if (blockedWithoutEvidence.has(row.slug)) blocks.push(`blocked_without_governed_evidence_present_${row.slug}`);
  if (row.lane === "current_or_new_standings" && satisfiedCurrentOrNew.has(row.slug)) blocks.push(`current_or_new_satisfied_present_${row.slug}`);
  if (row.lane === "next_season_start_date" && satisfiedNextSeasonStartDate.has(row.slug)) blocks.push(`next_start_satisfied_present_${row.slug}`);
}

const expectedExclusions = [
  "already_satisfied_previous_completed",
  "already_satisfied_current_or_new",
  "already_satisfied_next_season_start_date",
  "known_review_only_single_league_rabbit_hole",
  "known_blocked_without_governed_evidence_or_phase_parser"
];

for (const key of expectedExclusions) {
  if (!board.summary.exclusionCounts || !Number.isInteger(board.summary.exclusionCounts[key]) || board.summary.exclusionCounts[key] < 1) {
    blocks.push(`missing_expected_exclusion_${key}`);
  }
}

await fs.mkdir(verificationDir, { recursive: true });

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_refreshed_prioritized_high_yield_lifecycle_expansion_board",
  contractVersion: 1,
  boardPath: path.relative(root, boardPath).replaceAll("\\", "/"),
  rowsPath: path.relative(root, rowsPath).replaceAll("\\", "/"),
  boardSha256: await sha256(boardPath),
  rowsSha256: await sha256(rowsPath),
  verified: {
    acceptedBoardRowCount: rows.length,
    allRowsPreviousCompleted: rows.every(row => row.lane === "previous_completed_standings"),
    alreadySatisfiedPreviousCompletedAbsent: rows.every(row => !satisfiedPreviousCompleted.has(row.slug)),
    reviewOnlyAbsent: rows.every(row => !reviewOnly.has(row.slug)),
    blockedWithoutGovernedEvidenceAbsent: rows.every(row => !blockedWithoutEvidence.has(row.slug)),
    guardrailsZero: blocks.filter(block => block.startsWith("guardrail_")).length === 0
  },
  firstTwentySlugs: rows.slice(0, 20).map(row => row.slug),
  blocks
};

await fs.writeFile(verificationPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  status: report.status,
  verificationPath: path.relative(root, verificationPath).replaceAll("\\", "/"),
  verified: report.verified,
  firstTwentySlugs: report.firstTwentySlugs,
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) {
  process.exitCode = 1;
}
