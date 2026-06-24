import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);

const OUT_DIR = `data/football-truth/_diagnostics/modern-aggregate-current-or-new-materialization-approval-gate-${DATE}`;
const OUT = `${OUT_DIR}/modern-aggregate-current-or-new-materialization-approval-gate-${DATE}.json`;
const PAYLOAD_OUT = `${OUT_DIR}/modern-aggregate-current-or-new-materialization-candidate-payload-${DATE}.json`;
const ROWS_OUT = `${OUT_DIR}/modern-aggregate-current-or-new-materialization-candidate-rows-${DATE}.jsonl`;

const COVERAGE_BOARD = `data/football-truth/_diagnostics/modern-current-or-new-proof-coverage-board-${DATE}/modern-current-or-new-proof-coverage-board-${DATE}.json`;

const EXPECTED = {
  "nor.1": {
    rows: 16,
    familyId: "norway_ntf",
    sourceFamily: "norway_ntf",
    sourceKind: "official_ntf_html_table_standings",
    sourceHost: "eliteserien.no",
    officialRoute: "https://www.eliteserien.no/tabell",
    seasonScope: "current_or_new",
    seasonLabel: "2026"
  },
  "swe.1": {
    rows: 16,
    familyId: "sportomedia_sef",
    sourceFamily: "sportomedia_sef",
    sourceKind: "official_sportomedia_graphql_standingsForLeague",
    sourceHost: "allsvenskan.se",
    officialRoute: "https://allsvenskan.se/tabell",
    seasonScope: "current_or_new",
    seasonLabel: "2026"
  },
  "swe.2": {
    rows: 16,
    familyId: "sportomedia_sef",
    sourceFamily: "sportomedia_sef",
    sourceKind: "official_sportomedia_graphql_standingsForLeague",
    sourceHost: "superettan.se",
    officialRoute: "https://superettan.se/tabell",
    seasonScope: "current_or_new",
    seasonLabel: "2026"
  }
};

function abs(rel) {
  return path.join(ROOT, rel);
}

function readJson(rel) {
  if (!fs.existsSync(abs(rel))) throw new Error(`Missing required input: ${rel}`);
  return JSON.parse(fs.readFileSync(abs(rel), "utf8"));
}

function readJsonl(rel) {
  if (!fs.existsSync(abs(rel))) throw new Error(`Missing required input: ${rel}`);
  return fs.readFileSync(abs(rel), "utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

function writeJson(rel, value) {
  fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
  fs.writeFileSync(abs(rel), JSON.stringify(value, null, 2) + "\n");
}

function writeJsonl(rel, rows) {
  fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
  fs.writeFileSync(abs(rel), rows.map(row => JSON.stringify(row)).join("\n") + "\n");
}

function sha256Text(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function normTeam(v) {
  return String(v ?? "").trim().replace(/\s+/g, " ");
}

function groupBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const k = row[key];
    if (!out[k]) out[k] = [];
    out[k].push(row);
  }
  return out;
}

function sortedRows(rows) {
  return rows.slice().sort((a, b) => n(a.position) - n(b.position) || normTeam(a.teamName).localeCompare(normTeam(b.teamName)));
}

function normalizeRow(row) {
  return {
    competitionSlug: row.competitionSlug,
    competitionLabel: row.competitionLabel,
    seasonScope: row.seasonScope,
    seasonLabel: row.seasonLabel,
    sourceFamily: row.sourceFamily,
    sourceKind: row.sourceKind,
    sourceHost: row.sourceHost,
    sourceUrl: row.sourceUrl,
    officialRoute: row.officialRoute,
    parserStrategy: row.parserStrategy ?? null,
    league: row.league ?? null,
    position: n(row.position),
    teamId: row.teamId ?? null,
    teamName: normTeam(row.teamName),
    teamAbbrv: row.teamAbbrv ?? null,
    played: n(row.played),
    won: n(row.won),
    drawn: n(row.drawn),
    lost: n(row.lost),
    goalsFor: n(row.goalsFor),
    goalsAgainst: n(row.goalsAgainst),
    goalDifference: n(row.goalDifference),
    points: n(row.points),
    qualityGateStatus: row.qualityGateStatus,
    validationStatus: row.validationStatus,
    proofOnly: row.proofOnly === true
  };
}

function rowSignature(row) {
  return [
    row.competitionSlug,
    row.teamId ?? "",
    row.teamName,
    row.position,
    row.played,
    row.won,
    row.drawn,
    row.lost,
    row.goalsFor,
    row.goalsAgainst,
    row.goalDifference,
    row.points
  ].join("|");
}

const coverage = readJson(COVERAGE_BOARD);
const blocks = [];
const warnings = [];

if (coverage.status !== "passed") blocks.push(`coverage_board_not_passed_${coverage.status}`);

const expectedSlugs = Object.keys(EXPECTED).sort();
const coverageNewSlugs = (coverage.newCurrentOrNewSlugs ?? []).slice().sort();

if (JSON.stringify(coverageNewSlugs) !== JSON.stringify(expectedSlugs)) {
  blocks.push(`coverage_new_slugs_${JSON.stringify(coverageNewSlugs)}_expected_${JSON.stringify(expectedSlugs)}`);
}

if ((coverage.blockedGroups ?? []).some(group => group.competitionSlug === "nor.2" && !(group.blocks ?? []).includes("Åsane_points_arithmetic_failed"))) {
  blocks.push("nor.2_block_reason_changed_or_missing");
}

if ((coverage.verifiedCurrentOrNewSlugs ?? []).includes("nor.2")) {
  blocks.push("nor.2_must_not_be_verified_without_point_deduction_evidence");
}

const inputProofRows = [];
for (const proof of coverage.proofInputs ?? []) {
  for (const row of readJsonl(proof.rowsPath)) {
    inputProofRows.push({
      ...normalizeRow(row),
      sourceProofSummary: proof.summaryPath,
      sourceProofRows: proof.rowsPath,
      sourceProofFamilyId: proof.familyId
    });
  }
}

const acceptedRows = sortedRows(inputProofRows.filter(row => expectedSlugs.includes(row.competitionSlug)));
const bySlug = groupBy(acceptedRows, "competitionSlug");

const competitionEvidence = {};
for (const slug of expectedSlugs) {
  const cfg = EXPECTED[slug];
  const rows = sortedRows(bySlug[slug] ?? []);
  const slugBlocks = [];

  if (rows.length !== cfg.rows) slugBlocks.push(`${slug}_row_count_${rows.length}_expected_${cfg.rows}`);

  const positions = rows.map(r => r.position);
  const expectedPositions = Array.from({ length: cfg.rows }, (_, i) => i + 1);
  if (JSON.stringify(positions) !== JSON.stringify(expectedPositions)) slugBlocks.push(`${slug}_positions_not_1_to_${cfg.rows}`);

  const teamNames = new Set(rows.map(row => row.teamName.toLowerCase()));
  if (teamNames.size !== rows.length) slugBlocks.push(`${slug}_duplicate_team_names`);

  const teamIds = new Set(rows.filter(row => row.teamId !== null && row.teamId !== undefined).map(row => String(row.teamId)));
  if (slug.startsWith("swe.") && teamIds.size !== rows.length) slugBlocks.push(`${slug}_duplicate_or_missing_team_ids`);

  let totalPlayed = 0;
  let totalPoints = 0;
  let maxPlayed = 0;
  let maxPoints = 0;

  for (const row of rows) {
    const team = row.teamName;

    for (const [field, expected] of Object.entries({
      seasonScope: cfg.seasonScope,
      seasonLabel: cfg.seasonLabel,
      sourceFamily: cfg.sourceFamily,
      sourceKind: cfg.sourceKind,
      sourceHost: cfg.sourceHost,
      officialRoute: cfg.officialRoute,
      qualityGateStatus: "verified",
      validationStatus: "passed"
    })) {
      if (row[field] !== expected) slugBlocks.push(`${slug}_${team}_${field}_mismatch_${row[field]}_expected_${expected}`);
    }

    for (const field of ["position", "played", "won", "drawn", "lost", "goalsFor", "goalsAgainst", "goalDifference", "points"]) {
      if (!Number.isInteger(row[field])) slugBlocks.push(`${slug}_${team}_${field}_not_integer`);
    }

    if (row.played !== row.won + row.drawn + row.lost) slugBlocks.push(`${slug}_${team}_wdl_arithmetic_failed`);
    if (row.points !== row.won * 3 + row.drawn) slugBlocks.push(`${slug}_${team}_points_arithmetic_failed`);
    if (row.goalDifference !== row.goalsFor - row.goalsAgainst) slugBlocks.push(`${slug}_${team}_goal_difference_failed`);
    if (row.proofOnly !== true) slugBlocks.push(`${slug}_${team}_proof_only_flag_missing`);

    totalPlayed += row.played;
    totalPoints += row.points;
    maxPlayed = Math.max(maxPlayed, row.played);
    maxPoints = Math.max(maxPoints, row.points);
  }

  if (totalPlayed <= 0 || totalPoints <= 0 || maxPlayed <= 0 || maxPoints <= 0) {
    slugBlocks.push(`${slug}_non_trivial_current_or_new_failed`);
  }

  const signatureSha256 = sha256Text(rows.map(rowSignature).join("\n"));

  competitionEvidence[slug] = {
    status: slugBlocks.length ? "blocked" : "ready_for_explicit_materialization_approval",
    rows: rows.length,
    expectedRows: cfg.rows,
    seasonScope: cfg.seasonScope,
    seasonLabel: cfg.seasonLabel,
    sourceFamily: cfg.sourceFamily,
    sourceKind: cfg.sourceKind,
    sourceHost: cfg.sourceHost,
    officialRoute: cfg.officialRoute,
    totalPlayed,
    totalPoints,
    maxPlayed,
    maxPoints,
    teamSignals: rows.slice(0, 8).map(row => row.teamName),
    rowSignatureSha256: signatureSha256,
    blocks: Array.from(new Set(slugBlocks))
  };

  blocks.push(...slugBlocks);
}

const signatureCounts = {};
for (const evidence of Object.values(competitionEvidence)) {
  signatureCounts[evidence.rowSignatureSha256] = (signatureCounts[evidence.rowSignatureSha256] ?? 0) + 1;
}
for (const [hash, count] of Object.entries(signatureCounts)) {
  if (count > 1) blocks.push(`duplicate_shared_table_guard_failed_${hash}`);
}

const rowsByCompetition = Object.fromEntries(expectedSlugs.map(slug => [slug, bySlug[slug]?.length ?? 0]));
const rowCount = acceptedRows.length;

if (rowCount !== 48) blocks.push(`accepted_row_count_${rowCount}_expected_48`);
if (rowsByCompetition["nor.2"]) blocks.push("nor.2_rows_must_not_be_in_payload");

if (Number(coverage.impact?.previousCompletedSatisfiedCountUnchanged ?? -1) !== 11) blocks.push("baseline_previous_completed_not_11");
if (Number(coverage.impact?.previousCompletedVerifiedRowsCountUnchanged ?? -1) !== 180) blocks.push("baseline_previous_completed_rows_not_180");
if (Number(coverage.impact?.nextSeasonStartDateSatisfiedCountUnchanged ?? -1) !== 2) blocks.push("baseline_start_dates_not_2");
if (Number(coverage.impact?.wouldAddCurrentOrNewSatisfiedCount ?? -1) !== 3) blocks.push("coverage_would_add_current_or_new_not_3");
if (Number(coverage.impact?.wouldAddCurrentOrNewVerifiedRowsCount ?? -1) !== 48) blocks.push("coverage_would_add_rows_not_48");

const payload = {
  schemaVersion: 1,
  payloadKind: "modern_aggregate_current_or_new_lane_materialization_candidate",
  seasonScope: "current_or_new",
  seasonLabel: "2026",
  competitionSlugs: expectedSlugs,
  rowCount,
  rowsByCompetition,
  excludedBlockedGroups: coverage.blockedGroups ?? [],
  sourceCoverageBoard: COVERAGE_BOARD,
  sourcePolicy: {
    proofOnly: true,
    canonicalWriteAllowed: false,
    productionWriteAllowed: false,
    truthAssertionAllowed: false,
    stateLaneWriteAllowedNow: false
  },
  rows: acceptedRows
};

const payloadSha256 = sha256Text(JSON.stringify(payload));
const status = blocks.length ? "blocked" : "passed_ready_for_explicit_materialization_approval";

const output = {
  status,
  runner: "modern_aggregate_current_or_new_materialization_approval_gate",
  contractVersion: 1,
  generatedAtUtc: new Date().toISOString(),
  purpose: "approval-gated aggregate materialization candidate for verified modern current_or_new proof rows; no canonical, production, truth, or state-lane writes now",
  inputs: {
    coverageBoard: COVERAGE_BOARD,
    proofInputs: coverage.proofInputs ?? []
  },
  target: {
    seasonScope: "current_or_new",
    seasonLabel: "2026",
    competitionSlugs: expectedSlugs,
    rowCount,
    rowsByCompetition
  },
  baselinePreserved: {
    previousCompletedSatisfiedCount: Number(coverage.impact?.previousCompletedSatisfiedCountUnchanged ?? 0),
    previousCompletedVerifiedRowsCount: Number(coverage.impact?.previousCompletedVerifiedRowsCountUnchanged ?? 0),
    nextSeasonStartDateSatisfiedCount: Number(coverage.impact?.nextSeasonStartDateSatisfiedCountUnchanged ?? 0),
    projectedCurrentOrNewSatisfiedCount: Number(coverage.impact?.projectedCurrentOrNewSatisfiedCount ?? 0),
    projectedCurrentOrNewVerifiedRowsCount: Number(coverage.impact?.projectedCurrentOrNewVerifiedRowsCount ?? 0)
  },
  excludedBlockedGroups: coverage.blockedGroups ?? [],
  competitionEvidence,
  gates: {
    coverageBoardPassed: coverage.status === "passed",
    exactNewSlugs: JSON.stringify(coverageNewSlugs) === JSON.stringify(expectedSlugs),
    exactRowCount: rowCount === 48,
    exactRowsByCompetition: JSON.stringify(rowsByCompetition) === JSON.stringify({ "nor.1": 16, "swe.1": 16, "swe.2": 16 }),
    noNor2WithoutPointDeductionEvidence: !rowsByCompetition["nor.2"],
    exactIdentitySeasonAndSources: !blocks.some(b => b.includes("_mismatch_")),
    arithmeticAndNonTrivial: !blocks.some(b => b.includes("arithmetic_failed") || b.includes("non_trivial")),
    duplicateSharedTableGuard: !blocks.some(b => b.includes("duplicate_shared_table_guard_failed")),
    baselinePreserved: Number(coverage.impact?.previousCompletedSatisfiedCountUnchanged ?? 0) === 11 && Number(coverage.impact?.nextSeasonStartDateSatisfiedCountUnchanged ?? 0) === 2
  },
  approval: {
    approvalRequired: true,
    approvedNow: false,
    mayMaterializeDiagnosticStateRowsAfterExplicitUserApprovalCount: status === "passed_ready_for_explicit_materialization_approval" ? 1 : 0,
    mayWriteCanonicalNowCount: 0,
    mayWriteProductionNowCount: 0,
    mayAssertTruthNowCount: 0
  },
  payload: {
    output: PAYLOAD_OUT,
    rowsOutput: ROWS_OUT,
    sha256: payloadSha256,
    rowCount,
    rowsByCompetition
  },
  policy: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    browserExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    stateLaneWriteExecutedNowCount: 0,
    approvalGateOnly: true
  },
  blocks: Array.from(new Set(blocks)),
  warnings,
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
};

writeJson(OUT, output);
writeJson(PAYLOAD_OUT, payload);
writeJsonl(ROWS_OUT, acceptedRows);

console.log(JSON.stringify({
  status,
  target: output.target,
  baselinePreserved: output.baselinePreserved,
  excludedBlockedGroups: output.excludedBlockedGroups,
  approval: output.approval,
  blocks: output.blocks,
  payload: output.payload,
  output: OUT,
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
}, null, 2));

if (status !== "passed_ready_for_explicit_materialization_approval") {
  process.exit(1);
}
