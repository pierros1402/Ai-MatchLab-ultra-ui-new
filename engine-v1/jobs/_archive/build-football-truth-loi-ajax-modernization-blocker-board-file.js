import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = `data/football-truth/_diagnostics/loi-ajax-modernization-blocker-board-${DATE}`;
const OUT = `${OUT_DIR}/loi-ajax-modernization-blocker-board-${DATE}.json`;

const INPUTS = {
  activeWatchlistNormalized: "data/football-truth/_diagnostics/active-watchlist-provider-specific-normalized-lanes-2026-06-12/active-watchlist-loi-ajax-normalized-rows-2026-06-12.json",
  sourceNormalized: "data/football-truth/_diagnostics/uefa-current-readiness-check-2026-06-09/uefa-tier1-season-status-fullbody-extraction-2026-06-09/loi-source-normalized-rows-2026-06-10.json",
  normalizedAudit: "data/football-truth/_diagnostics/uefa-current-readiness-check-2026-06-09/uefa-tier1-season-status-fullbody-extraction-2026-06-09/loi-ajax-normalized-audit-rows-2026-06-10.json",
  fullPagination: "data/football-truth/_diagnostics/uefa-current-readiness-check-2026-06-09/uefa-tier1-season-status-fullbody-extraction-2026-06-09/loi-ajax-full-pagination-with-repair-2026-06-10.json",
  repairPlan: "data/football-truth/_diagnostics/loi-family-normalizer-repair-plan-2026-06-14/loi-family-normalizer-repair-plan-2026-06-14.json",
  reusableContractOutput: "data/football-truth/_diagnostics/existing-reusable-family-artifact-contract-runner-2026-06-17/build-uefa-loi-ajax-normalized-rows-file-output-2026-06-17.json"
};

function abs(rel) {
  return path.join(ROOT, rel);
}

function readJson(rel) {
  if (!fs.existsSync(abs(rel))) throw new Error(`Missing required input: ${rel}`);
  return JSON.parse(fs.readFileSync(abs(rel), "utf8"));
}

function writeJson(rel, value) {
  fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
  fs.writeFileSync(abs(rel), JSON.stringify(value, null, 2) + "\n");
}

function groupBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const k = row[key] ?? "unknown";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function unique(rows, key) {
  return [...new Set(rows.map(row => row[key]).filter(v => v !== undefined && v !== null))].sort();
}

function hasStandingShape(row) {
  const keys = Object.keys(row);
  const keySet = new Set(keys);
  const text = JSON.stringify(row).toLowerCase();

  const numericStandingKeys = ["position", "rank", "played", "won", "drawn", "lost", "points", "goalsFor", "goalsAgainst", "goalDifference"];
  const hasNumericStandingKeys = numericStandingKeys.filter(k => keySet.has(k)).length >= 4;
  const hasFixtureKeys = ["homeTeam", "awayTeam", "isoDate", "kickoffLocal", "homeScore", "awayScore"].filter(k => keySet.has(k)).length >= 3;
  const hasStandingWords = /\bstandings?\b|\btable\b|\bplayed\b|\bpoints\b/.test(text);

  return hasNumericStandingKeys && !hasFixtureKeys && hasStandingWords;
}

const active = readJson(INPUTS.activeWatchlistNormalized);
const source = readJson(INPUTS.sourceNormalized);
const audit = readJson(INPUTS.normalizedAudit);
const fullPagination = readJson(INPUTS.fullPagination);
const repairPlan = readJson(INPUTS.repairPlan);
const reusable = readJson(INPUTS.reusableContractOutput);

const normalizedRows = active.normalizedRows ?? [];
const sourceRows = source.normalizedRows ?? [];
const auditRows = audit.normalizedRows ?? [];
const allNormalizedRows = [...normalizedRows, ...sourceRows, ...auditRows];

const standingLikeRows = allNormalizedRows.filter(hasStandingShape);
const fixtureLikeRows = allNormalizedRows.filter(row => row.homeTeam && row.awayTeam && row.isoDate);
const pageKinds = unique(allNormalizedRows, "pageKind");
const competitions = unique(allNormalizedRows, "competition");
const leagues = unique(allNormalizedRows, "leagueLabel");

const blocks = [];
const warnings = [];

if (normalizedRows.length !== 270) blocks.push(`active_watchlist_normalized_rows_${normalizedRows.length}_expected_270`);
if (sourceRows.length !== 270) blocks.push(`source_normalized_rows_${sourceRows.length}_expected_270`);
if (auditRows.length !== 270) blocks.push(`audit_normalized_rows_${auditRows.length}_expected_270`);
if (standingLikeRows.length !== 0) blocks.push(`standing_like_rows_detected_${standingLikeRows.length}`);
if (fixtureLikeRows.length !== allNormalizedRows.length) warnings.push(`fixture_like_rows_${fixtureLikeRows.length}_of_${allNormalizedRows.length}`);
if (JSON.stringify(competitions) !== JSON.stringify(["irl.1", "irl.2"])) blocks.push(`competitions_${JSON.stringify(competitions)}_expected_irl1_irl2`);
if (!pageKinds.every(kind => ["fixtures", "results"].includes(kind))) blocks.push(`unexpected_page_kinds_${JSON.stringify(pageKinds)}`);

const activeSummary = active.summary ?? {};
const repairSummary = repairPlan.summary ?? {};
const reusableSummary = reusable.summary ?? {};
const fullSummary = fullPagination.summary ?? {};

if (Number(activeSummary.normalizedRowCount ?? -1) !== 270) blocks.push("active_summary_normalized_count_not_270");
if (Number(activeSummary.resultRows ?? -1) !== 186) blocks.push("active_summary_result_rows_not_186");
if (Number(activeSummary.scheduledRows ?? -1) !== 84) blocks.push("active_summary_scheduled_rows_not_84");

if (Number(fullSummary.byCompetition?.["irl.1"] ?? -1) !== 10 || Number(fullSummary.byCompetition?.["irl.2"] ?? -1) !== 10) {
  blocks.push("full_pagination_competition_probe_counts_unexpected");
}

if (repairSummary.recommendedRepair !== "patch_loi_ajax_family_selectors_or_normalizer_from_safe_direct_row_candidates") {
  warnings.push(`repair_recommendation_changed_${repairSummary.recommendedRepair}`);
}
if (Number(repairSummary.evidenceFilesWithStandingsCandidatesCount ?? 0) > 0) {
  warnings.push(`repair_plan_mentions_standings_candidate_files_${repairSummary.evidenceFilesWithStandingsCandidatesCount}_but_no_modern_standing_row_shape_found`);
}
if (Number(reusableSummary.normalizedRowCount ?? -1) !== 0) {
  warnings.push(`reusable_artifact_contract_runner_output_nonzero_${reusableSummary.normalizedRowCount}`);
}

const board = {
  status: blocks.length ? "blocked_unexpected_loi_shape" : "passed_blocked_for_standings_modernization",
  runner: "loi_ajax_modernization_blocker_board",
  contractVersion: 1,
  generatedAtUtc: new Date().toISOString(),
  purpose: "classify LOI AJAX legacy family for modernization; prevent fixtures/results normalizer from being used as a standings/current_or_new proof source",
  familyId: "loi_ajax",
  competitionSlugs: ["irl.1", "irl.2"],
  inputs: INPUTS,
  evidence: {
    normalizedRowCount: normalizedRows.length,
    sourceNormalizedRowCount: sourceRows.length,
    auditNormalizedRowCount: auditRows.length,
    allNormalizedRowCount: allNormalizedRows.length,
    fixtureLikeRowCount: fixtureLikeRows.length,
    standingLikeRowCount: standingLikeRows.length,
    byCompetition: groupBy(allNormalizedRows, "competition"),
    byPageKind: groupBy(allNormalizedRows, "pageKind"),
    byCompetitionPageKind: groupBy(allNormalizedRows, row => `${row.competition}|${row.pageKind}`),
    competitions,
    pageKinds,
    leagues,
    teamsByCompetition: activeSummary.teamsByCompetition ?? {},
    irl2FixturesBlockedReason: active.blocked?.irl2Fixtures ?? active.blockedReason ?? "official AJAX First Division fixture endpoint previously returned 500 or Premier Division fallback; no safe irl.2 fixture lane from current artifacts"
  },
  modernizationDecision: {
    standingsProofCandidate: false,
    currentOrNewStandingsProofCandidate: false,
    previousCompletedStandingsProofCandidate: false,
    fixtureResultsFamilyCandidate: true,
    reason: "Existing LOI AJAX artifacts contain fixture/result normalized rows only. They do not contain table standings rows with position/played/won/drawn/lost/points semantics required by Football Truth standings lanes.",
    requiredNextLane: "do_not_promote_loi_ajax_to_standings; keep as fixture/results modernization candidate or run separate official standings discovery if needed"
  },
  gates: {
    noStandingRowShapeFound: standingLikeRows.length === 0,
    normalizedRowsAreFixtureResultsOnly: fixtureLikeRows.length === allNormalizedRows.length,
    noCanonicalWritesNow: true,
    noProductionWritesNow: true,
    noTruthAssertionsNow: true
  },
  blockedGroups: [
    {
      familyId: "loi_ajax",
      competitionSlug: "irl.1",
      seasonScope: "current_or_new",
      seasonLabel: "2026",
      status: "blocked_no_standings_rows_in_legacy_loi_ajax_artifacts",
      rowCount: 0,
      blocks: ["loi_ajax_outputs_fixture_result_rows_only"],
      teamSignals: activeSummary.teamsByCompetition?.["irl.1"] ?? []
    },
    {
      familyId: "loi_ajax",
      competitionSlug: "irl.2",
      seasonScope: "current_or_new",
      seasonLabel: "2026",
      status: "blocked_no_standings_rows_in_legacy_loi_ajax_artifacts",
      rowCount: 0,
      blocks: ["loi_ajax_outputs_fixture_result_rows_only", "irl2_fixture_endpoint_also_not_safe_from_existing_repair_probe"],
      teamSignals: activeSummary.teamsByCompetition?.["irl.2"] ?? []
    }
  ],
  blocks,
  warnings,
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
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
};

writeJson(OUT, board);

console.log(JSON.stringify({
  status: board.status,
  familyId: board.familyId,
  competitionSlugs: board.competitionSlugs,
  evidence: board.evidence,
  modernizationDecision: board.modernizationDecision,
  blockedGroups: board.blockedGroups,
  blocks: board.blocks,
  warnings: board.warnings,
  output: OUT,
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
}, null, 2));

if (board.status !== "passed_blocked_for_standings_modernization") {
  process.exit(1);
}
