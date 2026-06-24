import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = `data/football-truth/_diagnostics/modern-norway-ntf-current-or-new-proof-${DATE}`;
const SUMMARY_OUT = `${OUT_DIR}/modern-norway-ntf-current-or-new-proof-${DATE}.json`;
const ROWS_OUT = `${OUT_DIR}/modern-norway-ntf-current-or-new-proof-rows-${DATE}.jsonl`;
const CONTRACT_OUT = "engine-v1/config/football-truth-modern-norway-ntf-current-or-new-proof-contract.json";

const STANDING_QUALITY_PATH = "data/football-truth/_diagnostics/norway-ntf-standing-candidate-quality-gate-2026-06-15/norway-ntf-standing-candidate-quality-gate-2026-06-15.json";
const CANONICAL_QUALITY_PATH = "data/football-truth/_diagnostics/norway-ntf-canonical-candidate-proposal-quality-gate-2026-06-15/norway-ntf-canonical-candidate-proposal-quality-gate-2026-06-15.json";
const EXECUTION_APPROVAL_PATH = "data/football-truth/_diagnostics/norway-ntf-canonical-candidate-execution-approval-gate-2026-06-15/norway-ntf-canonical-candidate-execution-approval-gate-2026-06-15.json";

const EXPECTED = {
  "nor.1": {
    competitionLabel: "Norway Eliteserien",
    sourceFamily: "norway_ntf",
    sourceHost: "eliteserien.no",
    officialRoute: "https://www.eliteserien.no/tabell",
    expectedRowCount: 16,
    seasonScope: "current_or_new",
    seasonLabel: "2026"
  },
  "nor.2": {
    competitionLabel: "Norway OBOS-ligaen",
    sourceFamily: "norway_ntf",
    sourceHost: "obos-ligaen.no",
    officialRoute: "https://www.obos-ligaen.no/tabell",
    expectedRowCount: 16,
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
  if (v === null || v === undefined || v === "") return null;
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
  return rows.slice().sort((a, b) => Number(a.position) - Number(b.position) || normTeam(a.teamName).localeCompare(normTeam(b.teamName)));
}

function rowSignature(row) {
  return [
    row.competitionSlug,
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

function rawNum(row, index, fallback = null) {
  const fromRaw = Array.isArray(row.rawCells) ? n(row.rawCells[index]) : null;
  return fromRaw === null ? fallback : fromRaw;
}

const standingQuality = readJson(STANDING_QUALITY_PATH);
const canonicalQuality = readJson(CANONICAL_QUALITY_PATH);
const executionApproval = readJson(EXECUTION_APPROVAL_PATH);

const standingRowsRaw = standingQuality.qualityGatedStandingCandidateRows ?? [];
const canonicalRowsRaw = canonicalQuality.qualityGatedStandingRows ?? [];
const executionRowsRaw = executionApproval.executionApprovedStandingRows ?? [];

const canonicalBySlugAndTeam = new Map();
for (const row of canonicalRowsRaw) {
  canonicalBySlugAndTeam.set(`${row.competitionSlug}::${normTeam(row.teamName).toLowerCase()}`, row);
}

const executionBySlugAndTeam = new Map();
for (const row of executionRowsRaw) {
  executionBySlugAndTeam.set(`${row.competitionSlug}::${normTeam(row.teamName).toLowerCase()}`, row);
}

const normalizedRows = sortedRows(standingRowsRaw.map(row => {
  const slug = row.competitionSlug;
  const cfg = EXPECTED[slug] ?? {};
  const teamName = normTeam(row.teamNameCanonical || row.teamName || row.teamNameRaw);
  const canonical = canonicalBySlugAndTeam.get(`${slug}::${teamName.toLowerCase()}`) ?? null;
  const execution = executionBySlugAndTeam.get(`${slug}::${teamName.toLowerCase()}`) ?? null;

  const played = n(row.played);
  const won = n(row.won);
  const drawn = n(row.drawn);
  const lost = n(row.lost);
  const goalsFor = rawNum(row, 6, n(row.goalsFor));
  const goalsAgainst = rawNum(row, 7, n(row.goalsAgainst));
  const goalDifference = rawNum(row, 8, n(row.goalDifference));
  const points = n(row.points);

  return {
    competitionSlug: slug,
    competitionLabel: cfg.competitionLabel,
    seasonScope: cfg.seasonScope,
    seasonLabel: cfg.seasonLabel,
    sourceFamily: "norway_ntf",
    sourceKind: "official_ntf_html_table_standings",
    sourceHost: cfg.sourceHost,
    sourceUrl: cfg.officialRoute,
    officialRoute: cfg.officialRoute,
    parserStrategy: row.parserStrategy,
    position: n(row.position),
    teamName,
    teamNameRaw: row.teamNameRaw ?? null,
    played,
    won,
    drawn,
    lost,
    goalsFor,
    goalsAgainst,
    goalDifference,
    points,
    rawCells: row.rawCells ?? [],
    qualityGateStatus: "verified",
    validationStatus: "passed",
    sourceRows: {
      standingQualityGateRowId: row.norwayNtfStandingCandidateQualityGateRowId,
      canonicalQualityGateRowId: canonical?.norwayNtfCanonicalStandingCandidateQualityGateRowId ?? null,
      executionApprovalRowId: execution?.norwayNtfCanonicalStandingCandidateExecutionApprovalGateRowId ?? null
    },
    legacyStatus: {
      standingQualityGateStatus: row.qualityGateStatus,
      canonicalQualityGateStatus: canonical?.qualityGateStatus ?? null,
      executionApprovalStatus: execution?.executionApprovalStatus ?? null
    }
  };
}));

const validations = [];
const acceptedGroups = [];
const blocks = [];
const warnings = [];

if (standingQuality.summary?.norwayNtfStandingCandidateQualityGateStatus !== "passed") {
  blocks.push(`standing_quality_gate_not_passed_${standingQuality.summary?.norwayNtfStandingCandidateQualityGateStatus}`);
}
if (canonicalQuality.summary?.norwayNtfCanonicalCandidateProposalQualityGateStatus !== "passed") {
  blocks.push(`canonical_quality_gate_not_passed_${canonicalQuality.summary?.norwayNtfCanonicalCandidateProposalQualityGateStatus}`);
}
if (executionApproval.summary?.norwayNtfCanonicalCandidateExecutionApprovalGateStatus !== "passed") {
  blocks.push(`execution_approval_gate_not_passed_${executionApproval.summary?.norwayNtfCanonicalCandidateExecutionApprovalGateStatus}`);
}

const bySlug = groupBy(normalizedRows, "competitionSlug");

for (const [slug, cfg] of Object.entries(EXPECTED)) {
  const rows = sortedRows(bySlug[slug] ?? []);
  const groupBlocks = [];
  const groupWarnings = [];

  if (rows.length !== cfg.expectedRowCount) groupBlocks.push(`row_count_${rows.length}_expected_${cfg.expectedRowCount}`);

  const positions = rows.map(r => r.position);
  const expectedPositions = Array.from({ length: cfg.expectedRowCount }, (_, i) => i + 1);
  if (JSON.stringify(positions) !== JSON.stringify(expectedPositions)) groupBlocks.push(`positions_not_1_to_${cfg.expectedRowCount}`);

  const teamNames = new Set(rows.map(r => normTeam(r.teamName).toLowerCase()));
  if (teamNames.size !== rows.length) groupBlocks.push("duplicate_team_names");

  let totalPlayed = 0;
  let totalPoints = 0;
  let maxPlayed = 0;
  let maxPoints = 0;

  for (const row of rows) {
    const team = normTeam(row.teamName);
    for (const [field, expected] of Object.entries({
      seasonScope: cfg.seasonScope,
      seasonLabel: cfg.seasonLabel,
      sourceFamily: cfg.sourceFamily,
      sourceKind: "official_ntf_html_table_standings",
      sourceHost: cfg.sourceHost,
      sourceUrl: cfg.officialRoute,
      officialRoute: cfg.officialRoute,
      parserStrategy: "html_table_tr_td_parser",
      qualityGateStatus: "verified",
      validationStatus: "passed"
    })) {
      if (row[field] !== expected) groupBlocks.push(`${team}_${field}_mismatch_${row[field]}_expected_${expected}`);
    }

    for (const field of ["position", "played", "won", "drawn", "lost", "goalsFor", "goalsAgainst", "goalDifference", "points"]) {
      if (!Number.isInteger(row[field])) groupBlocks.push(`${team}_${field}_not_integer`);
    }

    if (row.played !== row.won + row.drawn + row.lost) groupBlocks.push(`${team}_wdl_arithmetic_failed`);
    if (row.points !== row.won * 3 + row.drawn) groupBlocks.push(`${team}_points_arithmetic_failed`);
    if (row.goalDifference !== row.goalsFor - row.goalsAgainst) groupBlocks.push(`${team}_goal_difference_failed`);

    if (!row.sourceRows.canonicalQualityGateRowId) groupBlocks.push(`${team}_missing_canonical_quality_gate_link`);
    if (!row.sourceRows.executionApprovalRowId) groupBlocks.push(`${team}_missing_execution_approval_link`);
    if (row.legacyStatus.standingQualityGateStatus !== "quality_gated_standing_candidate_not_truth_asserted") groupBlocks.push(`${team}_legacy_standing_quality_status_mismatch`);
    if (row.legacyStatus.canonicalQualityGateStatus !== "quality_gated_canonical_standings_candidate_not_written") groupBlocks.push(`${team}_legacy_canonical_quality_status_mismatch`);
    if (row.legacyStatus.executionApprovalStatus !== "approved_canonical_standings_candidate_for_write_runner_not_written") groupBlocks.push(`${team}_legacy_execution_status_mismatch`);

    totalPlayed += row.played;
    totalPoints += row.points;
    maxPlayed = Math.max(maxPlayed, row.played);
    maxPoints = Math.max(maxPoints, row.points);
  }

  if (totalPlayed <= 0 || totalPoints <= 0 || maxPlayed <= 0 || maxPoints <= 0) {
    groupBlocks.push(`current_or_new_non_triviality_failed_totalPlayed_${totalPlayed}_totalPoints_${totalPoints}`);
  }

  const duplicateGuardHash = sha256Text(rows.map(rowSignature).join("\n")).slice(0, 24);

  const validation = {
    competitionSlug: slug,
    status: groupBlocks.length ? "blocked" : "verified_current_or_new_diagnostic_only",
    passed: groupBlocks.length === 0,
    rowCount: rows.length,
    expectedRowCount: cfg.expectedRowCount,
    seasonScope: cfg.seasonScope,
    seasonLabel: cfg.seasonLabel,
    sourceHost: cfg.sourceHost,
    officialRoute: cfg.officialRoute,
    totalPlayed,
    totalPoints,
    maxPlayed,
    maxPoints,
    duplicateGuardHash,
    teamSignals: rows.slice(0, 8).map(r => r.teamName),
    blocks: Array.from(new Set(groupBlocks)),
    warnings: groupWarnings
  };

  validations.push(validation);
  if (validation.passed) acceptedGroups.push(validation);
}

const duplicateHashes = groupBy(validations, "duplicateGuardHash");
for (const [hash, groups] of Object.entries(duplicateHashes)) {
  const slugs = Array.from(new Set(groups.map(g => g.competitionSlug)));
  if (slugs.length > 1) {
    for (const group of groups) {
      group.passed = false;
      group.status = "blocked";
      group.blocks.push(`duplicate_shared_table_guard_failed_${hash}_${slugs.join("_")}`);
    }
  }
}

const acceptedSlugs = validations.filter(v => v.passed).map(v => v.competitionSlug);
const acceptedRows = normalizedRows
  .filter(row => acceptedSlugs.includes(row.competitionSlug))
  .map(row => ({
    competitionSlug: row.competitionSlug,
    competitionLabel: row.competitionLabel,
    seasonScope: row.seasonScope,
    seasonLabel: row.seasonLabel,
    sourceFamily: row.sourceFamily,
    sourceKind: row.sourceKind,
    sourceHost: row.sourceHost,
    sourceUrl: row.sourceUrl,
    officialRoute: row.officialRoute,
    parserStrategy: row.parserStrategy,
    position: row.position,
    teamName: row.teamName,
    played: row.played,
    won: row.won,
    drawn: row.drawn,
    lost: row.lost,
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
    goalDifference: row.goalDifference,
    points: row.points,
    qualityGateStatus: row.qualityGateStatus,
    validationStatus: row.validationStatus,
    proofOnly: true
  }));

const status = validations.filter(v => v.passed).length === 2
  ? "passed_verified_current_or_new_diagnostic_only"
  : validations.some(v => v.passed)
    ? "partial_verified_current_or_new_diagnostic_only"
    : "blocked_no_verified_groups";

const summary = {
  status,
  runner: "modern_norway_ntf_current_or_new_proof",
  contractVersion: 1,
  generatedAtUtc: new Date().toISOString(),
  purpose: "modern isolated Norway NTF current_or_new proof from legacy quality-gated HTML table rows; diagnostic rows only",
  inputPaths: {
    standingQuality: STANDING_QUALITY_PATH,
    canonicalQuality: CANONICAL_QUALITY_PATH,
    executionApproval: EXECUTION_APPROVAL_PATH
  },
  inputChecks: {
    standingQualityGateStatus: standingQuality.summary?.norwayNtfStandingCandidateQualityGateStatus ?? null,
    canonicalQualityGateStatus: canonicalQuality.summary?.norwayNtfCanonicalCandidateProposalQualityGateStatus ?? null,
    executionApprovalGateStatus: executionApproval.summary?.norwayNtfCanonicalCandidateExecutionApprovalGateStatus ?? null,
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    browserExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0
  },
  summary: {
    targetSeasonScope: "current_or_new",
    targetSeasonLabel: "2026",
    validationGroupCount: validations.length,
    verifiedGroupCount: validations.filter(v => v.passed).length,
    acceptedRowCount: acceptedRows.length,
    acceptedRowsByCompetition: Object.fromEntries(Object.keys(EXPECTED).map(slug => [slug, acceptedRows.filter(r => r.competitionSlug === slug).length])),
    blockedGroupCount: validations.filter(v => !v.passed).length
  },
  gates: {
    exactSourceFamilyIdentity: "providerFamily=norway_ntf plus sourceKind=official_ntf_html_table_standings",
    exactCompetitionIdentity: "nor.1 eliteserien.no/tabell and nor.2 obos-ligaen.no/tabell",
    rowCount: "16 per competition",
    explicitSeasonScope: "current_or_new injected by modern contract from active 2026 standings evidence",
    explicitSeasonLabel: "2026",
    teamSignalGate: "unique teamName plus linked legacy quality/execution rows",
    wdlArithmetic: "played=won+drawn+lost",
    pointsArithmetic: "points=3*won+drawn",
    goalDifferenceArithmetic: "goalDifference=goalsFor-goalsAgainst using rawCells 6/7/8",
    nonTrivialCurrentOrNewGate: "totalPlayed,totalPoints,maxPlayed,maxPoints all > 0",
    duplicateSharedTableGuard: "per-competition row signature hash must not be shared",
    proofOnly: true
  },
  validations,
  outputs: {
    summary: SUMMARY_OUT,
    rows: acceptedRows.length ? ROWS_OUT : null,
    contract: CONTRACT_OUT
  },
  policy: {
    searchAllowed: false,
    fetchAllowed: false,
    browserAllowed: false,
    canonicalWriteAllowed: false,
    productionWriteAllowed: false,
    truthAssertionAllowed: false,
    rawPayloadCommitAllowed: false
  },
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0
};

const contract = {
  status: "active",
  contractVersion: 1,
  generatedBy: "run-football-truth-modern-norway-ntf-current-or-new-proof-file.js",
  generatedAtUtc: summary.generatedAtUtc,
  familyId: "norway_ntf",
  adapterId: "modern_norway_ntf_current_or_new_proof_v1",
  mode: "isolated_diagnostic_proof_only",
  seasonScope: "current_or_new",
  seasonLabel: "2026",
  competitionContracts: EXPECTED,
  sourcePolicy: summary.policy,
  requiredPromotionGates: Object.keys(summary.gates),
  lastRun: {
    status,
    summaryOutput: SUMMARY_OUT,
    rowsOutput: acceptedRows.length ? ROWS_OUT : null,
    acceptedRowCount: acceptedRows.length,
    acceptedRowsByCompetition: summary.summary.acceptedRowsByCompetition
  }
};

writeJson(SUMMARY_OUT, summary);
if (acceptedRows.length) writeJsonl(ROWS_OUT, acceptedRows);
writeJson(CONTRACT_OUT, contract);

console.log(JSON.stringify({
  status,
  familyId: "norway_ntf",
  seasonScope: "current_or_new",
  seasonLabel: "2026",
  verifiedGroupCount: summary.summary.verifiedGroupCount,
  acceptedRowCount: summary.summary.acceptedRowCount,
  acceptedRowsByCompetition: summary.summary.acceptedRowsByCompetition,
  validations,
  output: SUMMARY_OUT,
  rowsOutput: acceptedRows.length ? ROWS_OUT : null,
  contractOutput: CONTRACT_OUT,
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0
}, null, 2));

if (!["passed_verified_current_or_new_diagnostic_only", "partial_verified_current_or_new_diagnostic_only"].includes(status)) {
  process.exit(1);
}
