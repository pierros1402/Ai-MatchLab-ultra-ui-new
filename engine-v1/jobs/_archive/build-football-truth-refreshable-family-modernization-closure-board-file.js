import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = `data/football-truth/_diagnostics/refreshable-family-modernization-closure-board-${DATE}`;
const OUT = `${OUT_DIR}/refreshable-family-modernization-closure-board-${DATE}.json`;

const INPUTS = {
  refreshableAudit: "data/football-truth/_diagnostics/refreshable-family-gate-audit-2026-06-18/refreshable-family-gate-audit-2026-06-18.json",
  modernProofHarness: `data/football-truth/_diagnostics/modern-family-adapter-proof-harness-${DATE}/modern-family-adapter-proof-harness-${DATE}.json`,
  sportomediaProof: `data/football-truth/_diagnostics/modern-sportomedia-sef-current-or-new-proof-${DATE}/modern-sportomedia-sef-current-or-new-proof-${DATE}.json`,
  sportomediaApprovalGate: `data/football-truth/_diagnostics/modern-current-or-new-materialization-approval-gate-${DATE}/modern-current-or-new-materialization-approval-gate-${DATE}.json`,
  norwayProof: `data/football-truth/_diagnostics/modern-norway-ntf-current-or-new-proof-${DATE}/modern-norway-ntf-current-or-new-proof-${DATE}.json`,
  aggregateCoverageBoard: `data/football-truth/_diagnostics/modern-current-or-new-proof-coverage-board-${DATE}/modern-current-or-new-proof-coverage-board-${DATE}.json`,
  aggregateApprovalGate: `data/football-truth/_diagnostics/modern-aggregate-current-or-new-materialization-approval-gate-${DATE}/modern-aggregate-current-or-new-materialization-approval-gate-${DATE}.json`,
  loiBlocker: `data/football-truth/_diagnostics/loi-ajax-modernization-blocker-board-${DATE}/loi-ajax-modernization-blocker-board-${DATE}.json`,
  seasonLedger: "data/football-truth/_diagnostics/season-lane-coverage-ledger-2026-06-18/season-lane-coverage-ledger-2026-06-18.json",
  prioritizedBoard: "data/football-truth/_diagnostics/prioritized-lifecycle-execution-board-2026-06-18/prioritized-lifecycle-execution-board-2026-06-18.json"
};

function abs(rel) {
  return path.join(ROOT, rel);
}

function exists(rel) {
  return fs.existsSync(abs(rel));
}

function readJson(rel) {
  if (!exists(rel)) throw new Error(`Missing required input: ${rel}`);
  return JSON.parse(fs.readFileSync(abs(rel), "utf8"));
}

function writeJson(rel, value) {
  fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
  fs.writeFileSync(abs(rel), JSON.stringify(value, null, 2) + "\n");
}

function getAllNumbersByKey(x, key, out = []) {
  if (!x || typeof x !== "object") return out;
  if (Array.isArray(x)) {
    for (const item of x) getAllNumbersByKey(item, key, out);
    return out;
  }
  if (Object.prototype.hasOwnProperty.call(x, key)) {
    const n = Number(x[key]);
    if (Number.isFinite(n)) out.push(n);
  }
  for (const v of Object.values(x)) getAllNumbersByKey(v, key, out);
  return out;
}

function getMaxNumber(x, keys, fallback = 0) {
  const vals = [];
  for (const key of keys) vals.push(...getAllNumbersByKey(x, key));
  return vals.length ? Math.max(...vals) : fallback;
}

const refreshableAudit = readJson(INPUTS.refreshableAudit);
const harness = readJson(INPUTS.modernProofHarness);
const sportomediaProof = readJson(INPUTS.sportomediaProof);
const sportomediaApprovalGate = readJson(INPUTS.sportomediaApprovalGate);
const norwayProof = readJson(INPUTS.norwayProof);
const aggregateCoverage = readJson(INPUTS.aggregateCoverageBoard);
const aggregateApprovalGate = readJson(INPUTS.aggregateApprovalGate);
const loiBlocker = readJson(INPUTS.loiBlocker);
const seasonLedger = readJson(INPUTS.seasonLedger);
const prioritizedBoard = readJson(INPUTS.prioritizedBoard);

const blocks = [];
const warnings = [];

if (refreshableAudit.summary?.status !== "passed" && refreshableAudit.status !== "passed") blocks.push("refreshable_audit_not_passed");
if (harness.status !== "passed") blocks.push(`harness_status_${harness.status}`);
if (sportomediaProof.status !== "passed_verified_current_or_new_diagnostic_only") blocks.push(`sportomedia_status_${sportomediaProof.status}`);
if (sportomediaApprovalGate.status !== "passed_ready_for_explicit_materialization_approval") blocks.push(`sportomedia_approval_status_${sportomediaApprovalGate.status}`);
if (norwayProof.status !== "partial_verified_current_or_new_diagnostic_only") blocks.push(`norway_status_${norwayProof.status}`);
if (aggregateCoverage.status !== "passed") blocks.push(`aggregate_coverage_status_${aggregateCoverage.status}`);
if (aggregateApprovalGate.status !== "passed_ready_for_explicit_materialization_approval") blocks.push(`aggregate_approval_status_${aggregateApprovalGate.status}`);
if (loiBlocker.status !== "passed_blocked_for_standings_modernization") blocks.push(`loi_status_${loiBlocker.status}`);

const aggregateSlugs = aggregateCoverage.newCurrentOrNewSlugs ?? [];
if (JSON.stringify(aggregateSlugs) !== JSON.stringify(["nor.1", "swe.1", "swe.2"])) {
  blocks.push(`aggregate_new_slugs_${JSON.stringify(aggregateSlugs)}_expected_nor1_swe1_swe2`);
}

const aggregateRows = Number(aggregateCoverage.impact?.wouldAddCurrentOrNewVerifiedRowsCount ?? 0);
if (aggregateRows !== 48) blocks.push(`aggregate_rows_${aggregateRows}_expected_48`);

const loiStandingLike = Number(loiBlocker.evidence?.standingLikeRowCount ?? -1);
if (loiStandingLike !== 0) blocks.push(`loi_standing_like_rows_${loiStandingLike}_expected_0`);

const norwayBlocked = (norwayProof.validations ?? []).find(v => v.competitionSlug === "nor.2");
if (!norwayBlocked || norwayBlocked.passed !== false || !(norwayBlocked.blocks ?? []).includes("Åsane_points_arithmetic_failed")) {
  blocks.push("norway_nor2_expected_asane_points_block_missing");
}

const baseline = {
  previousCompletedSatisfiedCount: getMaxNumber(seasonLedger, ["previousCompletedSatisfiedCount"], 0),
  previousCompletedVerifiedRowsCount: getMaxNumber(seasonLedger, ["previousCompletedVerifiedRowsCount"], 0),
  currentOrNewSatisfiedCount: getMaxNumber(seasonLedger, ["currentOrNewSeasonSatisfiedCount", "currentOrNewSatisfiedCount"], 0),
  nextSeasonStartDateSatisfiedCount: getMaxNumber(seasonLedger, ["nextSeasonStartDateSatisfiedCount"], 0),
  prioritizedAcceptedExecutableTaskCount: getMaxNumber(prioritizedBoard, ["acceptedExecutableTaskCount"], 0),
  prioritizedStandingsExpansionTargetCount: getMaxNumber(prioritizedBoard, ["standingsExpansionTargetCount"], 0),
  prioritizedStartDateEvidenceTargetCount: getMaxNumber(prioritizedBoard, ["startDateEvidenceTargetCount"], 0)
};

if (baseline.previousCompletedSatisfiedCount !== 11) blocks.push(`baseline_previous_completed_${baseline.previousCompletedSatisfiedCount}_expected_11`);
if (baseline.previousCompletedVerifiedRowsCount !== 180) blocks.push(`baseline_previous_completed_rows_${baseline.previousCompletedVerifiedRowsCount}_expected_180`);
if (baseline.nextSeasonStartDateSatisfiedCount !== 2) blocks.push(`baseline_start_dates_${baseline.nextSeasonStartDateSatisfiedCount}_expected_2`);

const familyOutcomes = [
  {
    familyId: "sportomedia_sef",
    competitionSlugs: ["swe.1", "swe.2"],
    modernizationStatus: "verified_current_or_new_proof_ready_for_explicit_materialization_approval",
    seasonScope: "current_or_new",
    seasonLabel: "2026",
    verifiedSlugs: ["swe.1", "swe.2"],
    verifiedRowCount: 32,
    blockedSlugs: [],
    summaryPath: INPUTS.sportomediaProof,
    approvalGatePath: INPUTS.sportomediaApprovalGate,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0
  },
  {
    familyId: "norway_ntf",
    competitionSlugs: ["nor.1", "nor.2"],
    modernizationStatus: "partial_verified_current_or_new_proof",
    seasonScope: "current_or_new",
    seasonLabel: "2026",
    verifiedSlugs: ["nor.1"],
    verifiedRowCount: 16,
    blockedSlugs: ["nor.2"],
    blockReasons: {
      "nor.2": ["Åsane_points_arithmetic_failed", "needs_explicit_governed_point_deduction_evidence_before_acceptance"]
    },
    summaryPath: INPUTS.norwayProof,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0
  },
  {
    familyId: "loi_ajax",
    competitionSlugs: ["irl.1", "irl.2"],
    modernizationStatus: "blocked_not_a_standings_family_from_existing_artifacts",
    seasonScope: null,
    seasonLabel: null,
    verifiedSlugs: [],
    verifiedRowCount: 0,
    blockedSlugs: ["irl.1", "irl.2"],
    blockReasons: {
      "irl.1": ["loi_ajax_outputs_fixture_result_rows_only"],
      "irl.2": ["loi_ajax_outputs_fixture_result_rows_only", "irl2_fixture_endpoint_also_not_safe_from_existing_repair_probe"]
    },
    summaryPath: INPUTS.loiBlocker,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0
  }
];

const closureBoard = {
  status: blocks.length ? "blocked" : "passed",
  runner: "refreshable_family_modernization_closure_board",
  contractVersion: 1,
  generatedAtUtc: new Date().toISOString(),
  purpose: "close the refreshable family standings modernization pass and establish the next safe execution lane without canonical writes, production writes, or truth assertions",
  inputs: INPUTS,
  baseline,
  familyOutcomes,
  aggregateCurrentOrNewCandidate: {
    status: aggregateApprovalGate.status,
    verifiedNewCurrentOrNewSlugs: ["nor.1", "swe.1", "swe.2"],
    verifiedRowCount: 48,
    projectedCurrentOrNewSatisfiedCount: Number(aggregateApprovalGate.baselinePreserved?.projectedCurrentOrNewSatisfiedCount ?? aggregateCoverage.impact?.projectedCurrentOrNewSatisfiedCount ?? 0),
    projectedCurrentOrNewVerifiedRowsCount: Number(aggregateApprovalGate.baselinePreserved?.projectedCurrentOrNewVerifiedRowsCount ?? aggregateCoverage.impact?.projectedCurrentOrNewVerifiedRowsCount ?? 0),
    approvalRequired: true,
    approvedNow: false,
    payloadSha256: aggregateApprovalGate.payload?.sha256 ?? null,
    payloadPath: aggregateApprovalGate.payload?.output ?? null,
    rowsPath: aggregateApprovalGate.payload?.rowsOutput ?? null
  },
  refreshableSetClosure: {
    exactRefreshableFamilyCount: 3,
    fullyVerifiedFamilyCount: 1,
    partiallyVerifiedFamilyCount: 1,
    blockedForStandingsFamilyCount: 1,
    verifiedCurrentOrNewSlugCount: 3,
    verifiedCurrentOrNewRowCount: 48,
    previousCompletedAddedCount: 0,
    startDatesAddedCount: 0,
    truthOrCanonicalWritesExecuted: false
  },
  nextRecommendedLane: {
    lane: "blocked_exact_runner_missing_family_contract_discovery",
    reason: "Refreshable standings modernization now has a safe closure board. The remaining earlier blocked families are not executable and need exact runner/source contracts before any proof runner: torneopal(fin.1/fin.2), ksi(isl.1/isl.2), cfa_cyprus_html(cyp.1/cyp.2).",
    firstAction: "inspect_blocked_exact_runner_missing_family_artifacts_and_build_source_contract_discovery_board",
    mustNotDo: [
      "do_not_borrow_unrelated_central_or_jleague_runner",
      "do_not_promote_review_candidates_directly",
      "do_not_write_canonical_or_truth_without_explicit_approval"
    ]
  },
  policy: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    browserExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    stateLaneWriteExecutedNowCount: 0,
    approvalGateOnly: false,
    proofOnly: true
  },
  blocks,
  warnings,
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
};

writeJson(OUT, closureBoard);

console.log(JSON.stringify({
  status: closureBoard.status,
  baseline,
  familyOutcomes,
  aggregateCurrentOrNewCandidate: closureBoard.aggregateCurrentOrNewCandidate,
  refreshableSetClosure: closureBoard.refreshableSetClosure,
  nextRecommendedLane: closureBoard.nextRecommendedLane,
  blocks,
  warnings,
  output: OUT,
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
}, null, 2));

if (closureBoard.status !== "passed") {
  process.exit(1);
}
