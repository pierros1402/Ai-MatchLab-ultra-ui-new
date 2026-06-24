import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const boardPath = path.join(root, "data", "football-truth", "_diagnostics", `anchored-family-coverage-board-${today}`, `anchored-family-coverage-board-${today}.json`);
const rowsPath = path.join(root, "data", "football-truth", "_diagnostics", `anchored-family-coverage-board-${today}`, `anchored-family-coverage-board-rows-${today}.jsonl`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `anchored-family-coverage-board-verification-${today}`);
const verificationPath = path.join(verificationDir, `anchored-family-coverage-board-verification-${today}.json`);

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

const blocks = [];
const board = JSON.parse(await fs.readFile(boardPath, "utf8"));
const rows = parseJsonl(await fs.readFile(rowsPath, "utf8"));

if (board.status !== "passed") blocks.push("board_status_not_passed");
if (board.contractVersion !== 1) blocks.push("board_contract_version_not_1");
if (board.runner !== "anchored_family_coverage_board") blocks.push("wrong_runner");
if (rows.length !== 9) blocks.push("rows_count_not_9");

if (board.summary?.familyCount !== 9) blocks.push("family_count_not_9");
if (board.summary?.previousCompletedFamilySatisfiedCount !== 3) blocks.push("previous_completed_family_satisfied_count_not_3");
if (board.summary?.currentOrNewOnlyFamilySatisfiedCount !== 5) blocks.push("current_or_new_only_family_satisfied_count_not_5");
if (board.summary?.noLifecycleCoverageFamilyCount !== 1) blocks.push("no_lifecycle_coverage_family_count_not_1");
if (board.summary?.previousCompletedSatisfiedFamilySlugCount !== 7) blocks.push("previous_completed_satisfied_family_slug_count_not_7");
if (board.summary?.currentOrNewSatisfiedFamilySlugCount !== 8) blocks.push("current_or_new_satisfied_family_slug_count_not_8");
if (board.summary?.validatedButNotLifecyclePromotedFamilySlugCount !== 0) blocks.push("validated_but_not_promoted_count_not_0");
if (board.summary?.acceptedNowCount !== 0) blocks.push("accepted_now_not_zero");

const expected = new Map([
  ["bundesliga_dfb_rendered", {
    tier: "previous_completed_family_satisfied",
    previous: ["ger.1", "ger.2", "ger.3"],
    current: []
  }],
  ["laliga_official", {
    tier: "previous_completed_family_satisfied",
    previous: ["esp.1", "esp.2"],
    current: []
  }],
  ["spfl_official_rendered", {
    tier: "previous_completed_family_satisfied",
    previous: ["sco.1", "sco.2"],
    current: []
  }],
  ["ksi_iceland", {
    tier: "current_or_new_only_family_satisfied",
    previous: [],
    current: ["isl.1", "isl.2"]
  }],
  ["sportomedia_sef", {
    tier: "current_or_new_only_family_satisfied",
    previous: [],
    current: ["swe.1", "swe.2"]
  }],
  ["torneopal_veikkausliiga", {
    tier: "current_or_new_only_family_satisfied",
    previous: [],
    current: ["fin.1", "fin.2"]
  }],
  ["cfa_cyprus_html", {
    tier: "current_or_new_only_family_satisfied",
    previous: [],
    current: ["cyp.1"]
  }],
  ["norway_ntf", {
    tier: "current_or_new_only_family_satisfied",
    previous: [],
    current: ["nor.1"]
  }],
  ["loi_ajax", {
    tier: "no_lifecycle_coverage",
    previous: [],
    current: []
  }]
]);

function sameArray(a, b) {
  return JSON.stringify([...(a || [])].sort()) === JSON.stringify([...(b || [])].sort());
}

for (const [familyKey, exp] of expected.entries()) {
  const row = rows.find(item => item.familyKey === familyKey);
  if (!row) {
    blocks.push(`missing_family_${familyKey}`);
    continue;
  }

  if (row.actualCoverageTier !== exp.tier) blocks.push(`tier_mismatch_${familyKey}`);
  if (!sameArray(row.previousCompletedSatisfiedSlugs, exp.previous)) blocks.push(`previous_completed_slugs_mismatch_${familyKey}`);
  if (!sameArray(row.currentOrNewSatisfiedSlugs, exp.current)) blocks.push(`current_or_new_slugs_mismatch_${familyKey}`);
  if (row.acceptanceAllowedNow !== false) blocks.push(`acceptance_allowed_${familyKey}`);
  if (row.reviewOnly !== true) blocks.push(`not_review_only_${familyKey}`);
  if (row.acceptedNow !== false) blocks.push(`accepted_now_row_not_false_${familyKey}`);
}

const guardrails = board.guardrails || {};
for (const key of ["searchExecutedNowCount", "fetchExecutedNowCount", "canonicalWriteExecutedNowCount", "productionWriteExecutedNowCount", "truthAssertionExecutedNowCount"]) {
  if (guardrails[key] !== 0) blocks.push(`guardrail_${key}_not_zero`);
}
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_not_false");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_not_false");

await fs.mkdir(verificationDir, { recursive: true });

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_anchored_family_coverage_board",
  contractVersion: 1,
  boardPath: path.relative(root, boardPath).replaceAll("\\", "/"),
  rowsPath: path.relative(root, rowsPath).replaceAll("\\", "/"),
  boardSha256: await sha256(boardPath),
  rowsSha256: await sha256(rowsPath),
  verified: {
    familyCount: board.summary.familyCount,
    previousCompletedFamilySatisfiedCount: board.summary.previousCompletedFamilySatisfiedCount,
    currentOrNewOnlyFamilySatisfiedCount: board.summary.currentOrNewOnlyFamilySatisfiedCount,
    noLifecycleCoverageFamilyCount: board.summary.noLifecycleCoverageFamilyCount,
    previousCompletedSatisfiedFamilySlugCount: board.summary.previousCompletedSatisfiedFamilySlugCount,
    currentOrNewSatisfiedFamilySlugCount: board.summary.currentOrNewSatisfiedFamilySlugCount,
    familyRows: board.summary.familyRows,
    acceptedNowCount: board.summary.acceptedNowCount,
    guardrailsHeld: guardrails.searchExecutedNowCount === 0 &&
      guardrails.fetchExecutedNowCount === 0 &&
      guardrails.canonicalWriteExecutedNowCount === 0 &&
      guardrails.productionWriteExecutedNowCount === 0 &&
      guardrails.truthAssertionExecutedNowCount === 0 &&
      guardrails.rawPayloadCommitted === false &&
      guardrails.fullRawPayloadWritten === false
  },
  conclusion: "Anchored family coverage board is verified. It separates actual lifecycle coverage from runner inventory: 3 previous_completed families, 5 current/new-only families, and 1 no-coverage family.",
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

if (blocks.length > 0) process.exitCode = 1;
