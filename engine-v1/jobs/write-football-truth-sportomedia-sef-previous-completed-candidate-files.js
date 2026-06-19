import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const args = process.argv.slice(2);
const approved = args.includes("--approval-user-approved");

const proofPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-previous-completed-diagnostic-proof-${today}`, `sportomedia-sef-previous-completed-diagnostic-proof-${today}.json`);
const proofVerificationPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-previous-completed-proof-output-verification-${today}`, `sportomedia-sef-previous-completed-proof-output-verification-${today}.json`);
const approvalBoardPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-previous-completed-promotion-approval-board-${today}`, `sportomedia-sef-previous-completed-promotion-approval-board-${today}.json`);

const outputDir = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-previous-completed-candidate-files-${today}`);
const candidateDir = path.join(outputDir, "candidates");
const outputPath = path.join(outputDir, `sportomedia-sef-previous-completed-candidate-files-${today}.json`);
const rowsOutputPath = path.join(outputDir, `sportomedia-sef-previous-completed-candidate-files-rows-${today}.jsonl`);

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

await fs.mkdir(candidateDir, { recursive: true });

const blocks = [];
if (!approved) blocks.push("missing_explicit_user_approval_flag");

const proof = JSON.parse(await fs.readFile(proofPath, "utf8"));
const proofVerification = JSON.parse(await fs.readFile(proofVerificationPath, "utf8"));
const approvalBoard = JSON.parse(await fs.readFile(approvalBoardPath, "utf8"));

if (proof.status !== "passed") blocks.push("proof_status_not_passed");
if (proof.summary?.validationPassedRowCount !== 2) blocks.push("proof_validation_passed_count_not_2");
if (proof.summary?.validationFailedRowCount !== 0) blocks.push("proof_validation_failed_count_not_0");
if (proof.summary?.targetSeasonScope !== "previous_completed") blocks.push("proof_scope_not_previous_completed");
if (proof.summary?.targetSeasonLabel !== "2024") blocks.push("proof_season_not_2024");

if (proofVerification.status !== "passed") blocks.push("proof_verification_status_not_passed");
if (proofVerification.verification?.summary?.passedRowCount !== 2) blocks.push("proof_verification_passed_count_not_2");
if (proofVerification.verification?.summary?.failedRowCount !== 0) blocks.push("proof_verification_failed_count_not_0");

if (approvalBoard.status !== "passed") blocks.push("approval_board_status_not_passed");
if (approvalBoard.summary?.eligibleAfterExplicitApprovalCount !== 2) blocks.push("approval_board_eligible_count_not_2");
if (approvalBoard.summary?.explicitUserApprovalRequiredBeforeCanonicalCandidateWrite !== true) blocks.push("approval_board_missing_approval_requirement");

const guardrailSources = [
  ["proof", proof.guardrails || {}],
  ["proofVerification", proofVerification.guardrails || {}],
  ["approvalBoard", approvalBoard.guardrails || {}]
];

for (const [label, guardrails] of guardrailSources) {
  for (const key of ["canonicalWriteExecutedNowCount", "productionWriteExecutedNowCount", "truthAssertionExecutedNowCount"]) {
    if ((guardrails[key] ?? 0) !== 0) blocks.push(`${label}_${key}_not_zero`);
  }
  if (guardrails.rawPayloadCommitted !== false) blocks.push(`${label}_raw_payload_committed_not_false`);
  if (guardrails.fullRawPayloadWritten !== false) blocks.push(`${label}_full_raw_payload_written_not_false`);
}

const expectedSlugs = ["swe.1", "swe.2"];
const proofRows = Array.isArray(proof.rows) ? proof.rows : [];
for (const slug of expectedSlugs) {
  if (!proofRows.find(row => row.slug === slug)) blocks.push(`missing_proof_row_${slug}`);
}

const candidateRows = [];
const candidateFiles = [];

if (blocks.length === 0) {
  for (const row of proofRows.filter(item => expectedSlugs.includes(item.slug)).sort((a, b) => a.slug.localeCompare(b.slug))) {
    const file = path.join(candidateDir, `${row.slug}-previous-completed-2024-sportomedia-sef-candidate.json`);

    const candidate = {
      status: "candidate_ready_for_review",
      candidateType: "football_truth_previous_completed_standings_candidate",
      contractVersion: 1,
      slug: row.slug,
      league: row.league,
      country: row.country,
      sourceFamily: row.sourceFamily,
      seasonScope: row.seasonScope,
      seasonLabel: row.seasonLabel,
      sourceUrl: row.sourceUrl,
      endpoint: row.validation?.endpoint,
      operationName: row.validation?.operationName,
      variables: row.validation?.variables,
      fetchedAt: row.fetchedAt,
      expectedRows: row.expectedRows,
      extractedRowCount: row.extractedRowCount,
      standingsRows: row.standingsRows,
      validation: row.validation,
      evidence: {
        proofPath: rel(proofPath),
        proofSha256: await sha256(proofPath),
        proofVerificationPath: rel(proofVerificationPath),
        proofVerificationSha256: await sha256(proofVerificationPath),
        approvalBoardPath: rel(approvalBoardPath),
        approvalBoardSha256: await sha256(approvalBoardPath),
        responseSha256: row.validation?.responseSha256 || null
      },
      lifecycleCandidate: {
        maySatisfyLane: "previous_completed",
        previousCompletedSeasonLabel: "2024",
        currentActiveFollowupRequired: true,
        currentActiveFollowupReason: "User confirmed Allsvenskan and Superettan are active in the current season but paused due to the World Cup; current season standings/fixtures and restart date must be proved separately.",
        nextRequiredProofLanes: [
          "current_active_season_standings",
          "current_active_season_fixtures_or_matchdays",
          "restart_date_after_world_cup_break"
        ]
      },
      writePolicy: {
        explicitUserApprovalObserved: true,
        canonicalCandidateWriteOnly: true,
        lifecycleCandidateWriteOnly: true,
        productionWriteAllowed: false,
        truthAssertionAllowed: false,
        rawPayloadCommitted: false
      },
      acceptedNow: false,
      acceptanceAllowedNow: false,
      reviewOnly: true
    };

    await writeJson(file, candidate);

    candidateFiles.push(rel(file));
    candidateRows.push({
      slug: row.slug,
      league: row.league,
      seasonScope: row.seasonScope,
      seasonLabel: row.seasonLabel,
      candidateFile: rel(file),
      candidateFileSha256: await sha256(file),
      extractedRowCount: row.extractedRowCount,
      validationPassed: row.validation?.validationPassed === true,
      currentActiveFollowupRequired: true,
      nextRequiredProofLanes: candidate.lifecycleCandidate.nextRequiredProofLanes,
      productionWriteAllowed: false,
      truthAssertionAllowed: false,
      acceptedNow: false,
      acceptanceAllowedNow: false,
      reviewOnly: true
    });
  }
}

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "write_sportomedia_sef_previous_completed_candidate_files",
  contractVersion: 1,
  purpose: "Write review-only candidate files for verified Sportomedia/SEF swe.1/swe.2 previous_completed 2024 proof after explicit user approval. This does not write production state and does not assert truth. It also records that current active season and restart-date proof remain required.",
  proofPath: rel(proofPath),
  proofSha256: await sha256(proofPath),
  proofVerificationPath: rel(proofVerificationPath),
  proofVerificationSha256: await sha256(proofVerificationPath),
  approvalBoardPath: rel(approvalBoardPath),
  approvalBoardSha256: await sha256(approvalBoardPath),
  output: rel(outputPath),
  rowsOutput: rel(rowsOutputPath),
  candidateFiles,
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    providerFetchExecutedNowCount: 0,
    standingsFetchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    canonicalCandidateWriteExecutedNowCount: candidateFiles.length,
    lifecycleWriteExecutedNowCount: 0,
    lifecycleCandidateWriteExecutedNowCount: candidateFiles.length,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    candidateFileCount: candidateFiles.length,
    targetSlugs: candidateRows.map(row => row.slug),
    seasonScope: "previous_completed",
    seasonLabel: "2024",
    canonicalCandidateWriteExecutedNowCount: candidateFiles.length,
    lifecycleCandidateWriteExecutedNowCount: candidateFiles.length,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    currentActiveFollowupRequired: true,
    nextRequiredProofLanes: [
      "current_active_season_standings",
      "current_active_season_fixtures_or_matchdays",
      "restart_date_after_world_cup_break"
    ],
    acceptedNowCount: 0,
    recommendedNextLane: "build Sportomedia current-active season standings/fixtures/restart-date proof plan for swe.1 and swe.2"
  },
  rows: candidateRows,
  blocks
};

await writeJson(outputPath, report);
await fs.writeFile(rowsOutputPath, candidateRows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  candidateFiles: report.candidateFiles,
  guardrails: report.guardrails,
  summary: report.summary,
  rows: report.rows,
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
