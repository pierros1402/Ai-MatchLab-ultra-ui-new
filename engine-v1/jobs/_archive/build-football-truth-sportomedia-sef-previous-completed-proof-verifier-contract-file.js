import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const planPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-previous-completed-proof-harness-plan-${today}`, `sportomedia-sef-previous-completed-proof-harness-plan-${today}.json`);
const safetyPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-exact-runner-safety-scan-${today}`, `sportomedia-sef-exact-runner-safety-scan-${today}.json`);

const outputDir = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-previous-completed-proof-verifier-contract-${today}`);
const outputPath = path.join(outputDir, `sportomedia-sef-previous-completed-proof-verifier-contract-${today}.json`);
const rowsOutputPath = path.join(outputDir, `sportomedia-sef-previous-completed-proof-verifier-contract-rows-${today}.jsonl`);

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

await fs.mkdir(outputDir, { recursive: true });

const plan = JSON.parse(await fs.readFile(planPath, "utf8"));
const safety = JSON.parse(await fs.readFile(safetyPath, "utf8"));

const blocks = [];

if (plan.status !== "passed") blocks.push("plan_status_not_passed");
if (plan.contractVersion !== 3) blocks.push("plan_contract_version_not_3");
if (plan.summary?.family !== "sportomedia_sef") blocks.push("plan_family_not_sportomedia_sef");
if (plan.summary?.planAllowsFetchNow !== false) blocks.push("plan_allows_fetch_now");
if (plan.summary?.verifierRequiredBeforeFetch !== true) blocks.push("plan_verifier_required_before_fetch_not_true");

if (safety.status !== "passed") blocks.push("safety_status_not_passed");
if (safety.summary?.wrapperRequired !== true) blocks.push("safety_wrapper_required_not_true");
if (safety.summary?.directExecutionSafeForProof !== false) blocks.push("safety_direct_execution_should_be_false");
if (safety.summary?.hasCanonicalFlag !== true) blocks.push("safety_canonical_signal_expected_true_missing");
if (safety.summary?.hasTruthFlag !== true) blocks.push("safety_truth_signal_expected_true_missing");

const targetRows = [
  {
    slug: "swe.1",
    league: "Allsvenskan",
    country: "Sweden",
    sourceFamily: "sportomedia_sef",
    seasonScope: "previous_completed",
    seasonLabel: "2024",
    expectedRows: 16,
    expectedMaxPlayed: 30,
    validationMinimumTeamSignals: 4,
    teamSignalTerms: ["Malmö FF", "Hammarby", "AIK", "Djurgården", "Mjällby", "Elfsborg"]
  },
  {
    slug: "swe.2",
    league: "Superettan",
    country: "Sweden",
    sourceFamily: "sportomedia_sef",
    seasonScope: "previous_completed",
    seasonLabel: "2024",
    expectedRows: 16,
    expectedMaxPlayed: 30,
    validationMinimumTeamSignals: 4,
    teamSignalTerms: ["Degerfors", "Öster", "Landskrona", "Helsingborg", "Sandviken", "Brage"]
  }
];

const requiredProofOutputFields = [
  "status",
  "runner",
  "contractVersion",
  "guardrails",
  "summary",
  "rows"
];

const requiredRowFields = [
  "slug",
  "league",
  "country",
  "sourceFamily",
  "seasonScope",
  "seasonLabel",
  "sourceUrl",
  "fetchedAt",
  "expectedRows",
  "extractedRowCount",
  "teamSignalHits",
  "standingsRows",
  "validation",
  "acceptedNow",
  "acceptanceAllowedNow",
  "reviewOnly"
];

const requiredStandingRowFields = [
  "rank",
  "team",
  "played",
  "wins",
  "draws",
  "losses",
  "goalsFor",
  "goalsAgainst",
  "goalDifference",
  "points"
];

const requiredValidationGates = [
  {
    gate: "source_family_identity",
    rule: "row.sourceFamily === sportomedia_sef"
  },
  {
    gate: "target_slug_identity",
    rule: "row.slug is exactly one of swe.1 or swe.2"
  },
  {
    gate: "season_scope",
    rule: "row.seasonScope === previous_completed"
  },
  {
    gate: "season_label",
    rule: "row.seasonLabel === 2024"
  },
  {
    gate: "expected_rows",
    rule: "row.extractedRowCount === 16 and row.standingsRows.length === 16"
  },
  {
    gate: "max_played",
    rule: "max(row.standingsRows.played) === 30"
  },
  {
    gate: "played_arithmetic",
    rule: "for every row: played === wins + draws + losses"
  },
  {
    gate: "points_arithmetic",
    rule: "for every row: points === wins * 3 + draws"
  },
  {
    gate: "goal_difference_arithmetic",
    rule: "for every row: goalDifference === goalsFor - goalsAgainst"
  },
  {
    gate: "team_signals",
    rule: "teamSignalHits.length >= validationMinimumTeamSignals"
  },
  {
    gate: "duplicate_team_guard",
    rule: "normalized team names are unique within slug table"
  },
  {
    gate: "non_trivial_completed_table",
    rule: "all rows are non-zero completed-season rows and max played is expectedMaxPlayed"
  },
  {
    gate: "write_guardrails",
    rule: "canonicalWriteExecutedNowCount, productionWriteExecutedNowCount, truthAssertionExecutedNowCount are all 0"
  },
  {
    gate: "raw_payload_guardrails",
    rule: "rawPayloadCommitted === false and fullRawPayloadWritten === false"
  },
  {
    gate: "review_only_guard",
    rule: "acceptedNow === false, acceptanceAllowedNow === false, reviewOnly === true"
  }
];

const forbiddenProofOutputSignals = [
  "canonicalWriteExecutedNowCount > 0",
  "productionWriteExecutedNowCount > 0",
  "truthAssertionExecutedNowCount > 0",
  "rawPayloadCommitted === true",
  "fullRawPayloadWritten === true",
  "acceptedNow === true",
  "acceptanceAllowedNow === true",
  "seasonScope !== previous_completed",
  "seasonLabel !== 2024"
];

const rows = targetRows.map(target => ({
  ...target,
  verifierContractStatus: "defined_not_executed",
  requiredProofOutputFields,
  requiredRowFields,
  requiredStandingRowFields,
  requiredValidationGates,
  forbiddenProofOutputSignals,
  verifierMustFailIfAnyGateFails: true,
  verifierAllowsCanonicalWrite: false,
  verifierAllowsTruthAssertion: false,
  verifierAllowsProductionWrite: false,
  acceptedNow: false,
  acceptanceAllowedNow: false,
  reviewOnly: true
}));

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "sportomedia_sef_previous_completed_proof_verifier_contract",
  contractVersion: 1,
  purpose: "Define the required verifier contract for a diagnostic-only Sportomedia/SEF previous_completed proof output before any proof fetch is allowed.",
  planPath: rel(planPath),
  planSha256: await sha256(planPath),
  safetyPath: rel(safetyPath),
  safetySha256: await sha256(safetyPath),
  output: rel(outputPath),
  rowsOutput: rel(rowsOutputPath),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    providerFetchExecutedNowCount: 0,
    standingsFetchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  sourcePlanSummary: plan.summary,
  sourceSafetySummary: safety.summary,
  summary: {
    family: "sportomedia_sef",
    targetCount: rows.length,
    targetSlugs: rows.map(row => row.slug),
    targetSeasonScope: "previous_completed",
    targetSeasonLabel: "2024",
    expectedRowsPerTarget: 16,
    expectedMaxPlayed: 30,
    requiredProofOutputFieldCount: requiredProofOutputFields.length,
    requiredRowFieldCount: requiredRowFields.length,
    requiredStandingRowFieldCount: requiredStandingRowFields.length,
    requiredValidationGateCount: requiredValidationGates.length,
    forbiddenProofOutputSignalCount: forbiddenProofOutputSignals.length,
    verifierAllowsCanonicalWrite: false,
    verifierAllowsTruthAssertion: false,
    verifierAllowsProductionWrite: false,
    acceptedNowCount: 0,
    recommendedNextLane: "create executable verifier from this contract, then create diagnostic-only proof runner"
  },
  rows,
  blocks
};

await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsOutputPath, rows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  guardrails: report.guardrails,
  summary: report.summary,
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
