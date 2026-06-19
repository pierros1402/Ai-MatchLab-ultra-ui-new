import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = `data/football-truth/_diagnostics/modern-sportomedia-sef-current-or-new-proof-${DATE}`;
const SUMMARY_OUT = `${OUT_DIR}/modern-sportomedia-sef-current-or-new-proof-${DATE}.json`;
const ROWS_OUT = `${OUT_DIR}/modern-sportomedia-sef-current-or-new-proof-rows-${DATE}.jsonl`;
const CONTRACT_OUT = "engine-v1/config/football-truth-modern-sportomedia-sef-current-or-new-proof-contract.json";

const EXTRACTION_PATH = "data/football-truth/_diagnostics/controlled-sportomedia-exact-graphql-standings-extraction-runner-2026-06-16/controlled-sportomedia-exact-graphql-standings-extraction-runner-2026-06-16.json";
const QUALITY_PATH = "data/football-truth/_diagnostics/controlled-sportomedia-standings-extraction-quality-gate-2026-06-16/controlled-sportomedia-standings-extraction-quality-gate-2026-06-16.json";

const EXPECTED = {
  "swe.1": {
    competitionLabel: "Allsvenskan",
    league: "allsvenskan",
    officialRoute: "https://allsvenskan.se/tabell",
    sourceHost: "allsvenskan.se",
    expectedRowCount: 16,
    seasonScope: "current_or_new",
    seasonLabel: "2026"
  },
  "swe.2": {
    competitionLabel: "Superettan",
    league: "superettan",
    officialRoute: "https://superettan.se/tabell",
    sourceHost: "superettan.se",
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

function sha256Text(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function normTeam(s) {
  return String(s ?? "").trim().replace(/\s+/g, " ");
}

function rowSignature(row) {
  return [
    normTeam(row.teamName),
    n(row.position),
    n(row.played),
    n(row.wins),
    n(row.draws),
    n(row.losses),
    n(row.goalsFor),
    n(row.goalsAgainst),
    n(row.goalDifference),
    n(row.points)
  ].join("|");
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

function extractionRowsBySlug(extraction) {
  const out = {};
  for (const er of extraction.extractionRows ?? []) {
    const slug = er.competitionSlug;
    out[slug] = sortedRows((er.normalizedStandingRows ?? []).map(row => ({
      competitionSlug: slug,
      teamId: row.teamId,
      teamName: row.teamName,
      teamAbbrv: row.teamAbbrv,
      position: n(row.position),
      played: n(row.played),
      wins: n(row.wins),
      draws: n(row.draws),
      losses: n(row.losses),
      goalsFor: n(row.goalsFor),
      goalsAgainst: n(row.goalsAgainst),
      goalDifference: n(row.goalDifference),
      points: n(row.points),
      borderType: row.borderType
    })));
  }
  return out;
}

function qualityRowsBySlug(quality) {
  return groupBy((quality.canonicalCandidatePreviewRows ?? []).map(row => ({
    competitionSlug: row.competitionSlug,
    competitionLabel: row.competitionLabel,
    providerFamily: row.providerFamily,
    sourceKind: row.sourceKind,
    sourceUrl: row.sourceUrl,
    officialRoute: row.officialRoute,
    seasonStartYear: n(row.seasonStartYear),
    league: row.league,
    type: row.type,
    teamId: row.teamId,
    teamName: row.teamName,
    teamAbbrv: row.teamAbbrv,
    position: n(row.position),
    played: n(row.played),
    wins: n(row.wins),
    draws: n(row.draws),
    losses: n(row.losses),
    goalsFor: n(row.goalsFor),
    goalsAgainst: n(row.goalsAgainst),
    goalDifference: n(row.goalDifference),
    points: n(row.points),
    borderType: row.borderType
  })), "competitionSlug");
}

function validateSlug(slug, extractionRows, qualityRows) {
  const exp = EXPECTED[slug];
  const rows = sortedRows(qualityRows ?? []);
  const extraction = sortedRows(extractionRows ?? []);
  const blocks = [];
  const warnings = [];

  if (!exp) blocks.push("unexpected_competition_slug");
  if (rows.length !== exp.expectedRowCount) blocks.push(`quality_row_count_${rows.length}_expected_${exp.expectedRowCount}`);
  if (extraction.length !== exp.expectedRowCount) blocks.push(`extraction_row_count_${extraction.length}_expected_${exp.expectedRowCount}`);

  const qualitySig = sortedRows(rows).map(rowSignature);
  const extractionSig = sortedRows(extraction).map(rowSignature);
  if (JSON.stringify(qualitySig) !== JSON.stringify(extractionSig)) {
    blocks.push("quality_rows_do_not_match_exact_extraction_rows");
  }

  const uniqueTeams = new Set(rows.map(r => normTeam(r.teamName).toLowerCase()));
  const uniqueTeamIds = new Set(rows.map(r => String(r.teamId ?? "")));
  if (uniqueTeams.size !== rows.length) blocks.push("duplicate_team_names");
  if (uniqueTeamIds.size !== rows.length) blocks.push("duplicate_team_ids");

  const positions = rows.map(r => n(r.position));
  const expectedPositions = Array.from({ length: exp.expectedRowCount }, (_, i) => i + 1);
  if (JSON.stringify(positions) !== JSON.stringify(expectedPositions)) blocks.push("positions_not_1_to_expected_count");

  let totalPlayed = 0;
  let totalPoints = 0;
  let maxPlayed = 0;
  let maxPoints = 0;

  for (const row of rows) {
    const fields = ["position", "played", "wins", "draws", "losses", "goalsFor", "goalsAgainst", "goalDifference", "points"];
    for (const field of fields) {
      if (!Number.isInteger(row[field])) blocks.push(`missing_or_non_integer_${field}_${normTeam(row.teamName)}`);
    }

    if (row.played !== row.wins + row.draws + row.losses) blocks.push(`wdl_arithmetic_failed_${normTeam(row.teamName)}`);
    if (row.goalDifference !== row.goalsFor - row.goalsAgainst) blocks.push(`goal_difference_failed_${normTeam(row.teamName)}`);
    if (row.points !== row.wins * 3 + row.draws) blocks.push(`points_arithmetic_failed_${normTeam(row.teamName)}`);

    if (row.providerFamily !== "sportomedia_sef") blocks.push(`provider_family_mismatch_${normTeam(row.teamName)}`);
    if (row.sourceKind !== "official_graphql_standings") blocks.push(`source_kind_mismatch_${normTeam(row.teamName)}`);
    if (row.officialRoute !== exp.officialRoute) blocks.push(`official_route_mismatch_${normTeam(row.teamName)}`);
    if (Number(row.seasonStartYear) !== Number(exp.seasonLabel)) blocks.push(`season_start_year_mismatch_${normTeam(row.teamName)}`);
    if (row.league !== exp.league) blocks.push(`league_variable_mismatch_${normTeam(row.teamName)}`);

    totalPlayed += row.played;
    totalPoints += row.points;
    maxPlayed = Math.max(maxPlayed, row.played);
    maxPoints = Math.max(maxPoints, row.points);
  }

  if (totalPlayed <= 0 || totalPoints <= 0 || maxPlayed <= 0 || maxPoints <= 0) {
    blocks.push(`current_or_new_non_triviality_failed_totalPlayed_${totalPlayed}_totalPoints_${totalPoints}`);
  }

  const duplicateGuardHash = sha256Text(qualitySig.join("\n")).slice(0, 24);

  return {
    competitionSlug: slug,
    competitionLabel: exp.competitionLabel,
    seasonScope: exp.seasonScope,
    seasonLabel: exp.seasonLabel,
    sourceFamily: "sportomedia_sef",
    sourceHost: exp.sourceHost,
    officialRoute: exp.officialRoute,
    rowCount: rows.length,
    extractionRowCount: extraction.length,
    expectedRowCount: exp.expectedRowCount,
    totalPlayed,
    totalPoints,
    maxPlayed,
    maxPoints,
    duplicateGuardHash,
    status: blocks.length === 0 ? "verified_current_or_new_diagnostic_only" : "blocked",
    passed: blocks.length === 0,
    blocks: Array.from(new Set(blocks)),
    warnings,
    teamSignals: rows.slice(0, 8).map(r => normTeam(r.teamName)),
    rows
  };
}

const extraction = readJson(EXTRACTION_PATH);
const quality = readJson(QUALITY_PATH);

const extractionBySlug = extractionRowsBySlug(extraction);
const qualityBySlug = qualityRowsBySlug(quality);

const validations = Object.keys(EXPECTED).map(slug => validateSlug(slug, extractionBySlug[slug], qualityBySlug[slug]));
const accepted = validations.filter(v => v.passed);

const acceptedRows = accepted.flatMap(v => v.rows.map(row => ({
  competitionSlug: v.competitionSlug,
  competitionLabel: v.competitionLabel,
  seasonScope: v.seasonScope,
  seasonLabel: v.seasonLabel,
  sourceFamily: v.sourceFamily,
  sourceKind: "official_graphql_standings",
  sourceHost: v.sourceHost,
  sourceUrl: row.sourceUrl,
  officialRoute: row.officialRoute,
  league: row.league,
  position: row.position,
  teamId: row.teamId,
  teamName: row.teamName,
  teamAbbrv: row.teamAbbrv,
  played: row.played,
  won: row.wins,
  drawn: row.draws,
  lost: row.losses,
  goalsFor: row.goalsFor,
  goalsAgainst: row.goalsAgainst,
  goalDifference: row.goalDifference,
  points: row.points,
  qualityGateStatus: "verified",
  validationStatus: "passed",
  proofOnly: true
})));

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

const finalAccepted = validations.filter(v => v.passed);
const finalAcceptedRows = finalAccepted.flatMap(v => acceptedRows.filter(r => r.competitionSlug === v.competitionSlug));

const status = finalAccepted.length === 2
  ? "passed_verified_current_or_new_diagnostic_only"
  : finalAccepted.length > 0
    ? "partial_verified_current_or_new_diagnostic_only"
    : "blocked_no_verified_groups";

const summary = {
  status,
  runner: "modern_sportomedia_sef_current_or_new_proof",
  contractVersion: 1,
  generatedAtUtc: new Date().toISOString(),
  purpose: "modern isolated adapter proof from legacy Sportomedia/SEF cached exact extraction and quality-gate outputs; diagnostic rows only; no canonical, production, or truth writes",
  inputPaths: {
    extraction: EXTRACTION_PATH,
    quality: QUALITY_PATH
  },
  inputChecks: {
    extractionStatusPassed: extraction.status === "passed",
    qualityGateStatusPassed: quality.summary?.controlledSportomediaStandingsExtractionQualityGateStatus === "passed",
    sourceExtractionFetchCountWasHistorical: extraction.summary?.fetchExecutedNowCount ?? null,
    fetchExecutedNowCount: 0,
    searchExecutedNowCount: 0,
    browserExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0
  },
  summary: {
    targetSeasonScope: "current_or_new",
    targetSeasonLabel: "2026",
    validationGroupCount: validations.length,
    verifiedGroupCount: finalAccepted.length,
    acceptedRowCount: finalAcceptedRows.length,
    acceptedRowsByCompetition: Object.fromEntries(Object.keys(EXPECTED).map(slug => [slug, finalAcceptedRows.filter(r => r.competitionSlug === slug).length])),
    blockedGroupCount: validations.length - finalAccepted.length
  },
  gates: {
    exactSourceFamilyIdentity: "providerFamily=sportomedia_sef plus sourceKind=official_graphql_standings",
    exactCompetitionIdentity: "swe.1 allsvenskan/allsvenskan.se and swe.2 superettan/superettan.se",
    rowCount: "16 per competition",
    explicitSeasonScope: "current_or_new injected by modern contract from active 2026 season evidence",
    explicitSeasonLabel: "2026 from seasonStartYear",
    teamSignalGate: "unique teamId/teamName plus exact extraction-vs-quality row signature match",
    wdlArithmetic: "played=wins+draws+losses",
    pointsArithmetic: "points=3*wins+draws",
    goalDifferenceArithmetic: "goalDifference=goalsFor-goalsAgainst",
    nonTrivialCurrentOrNewGate: "totalPlayed,totalPoints,maxPlayed,maxPoints all > 0",
    duplicateSharedTableGuard: "per-competition row signature hash must not be shared",
    proofOnly: true
  },
  validations: validations.map(v => ({
    competitionSlug: v.competitionSlug,
    status: v.status,
    passed: v.passed,
    rowCount: v.rowCount,
    extractionRowCount: v.extractionRowCount,
    totalPlayed: v.totalPlayed,
    totalPoints: v.totalPoints,
    maxPlayed: v.maxPlayed,
    maxPoints: v.maxPoints,
    duplicateGuardHash: v.duplicateGuardHash,
    teamSignals: v.teamSignals,
    blocks: v.blocks,
    warnings: v.warnings
  })),
  outputs: {
    summary: SUMMARY_OUT,
    rows: finalAcceptedRows.length ? ROWS_OUT : null,
    contract: CONTRACT_OUT
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
  generatedBy: "run-football-truth-modern-sportomedia-sef-current-or-new-proof-file.js",
  generatedAtUtc: summary.generatedAtUtc,
  familyId: "sportomedia_sef",
  adapterId: "modern_sportomedia_sef_current_or_new_proof_v1",
  mode: "isolated_diagnostic_proof_only",
  seasonScope: "current_or_new",
  seasonLabel: "2026",
  competitionContracts: EXPECTED,
  sourcePolicy: {
    searchAllowed: false,
    fetchAllowed: false,
    browserAllowed: false,
    canonicalWriteAllowed: false,
    productionWriteAllowed: false,
    truthAssertionAllowed: false,
    rawPayloadCommitAllowed: false
  },
  requiredPromotionGates: Object.keys(summary.gates),
  lastRun: {
    status,
    summaryOutput: SUMMARY_OUT,
    rowsOutput: finalAcceptedRows.length ? ROWS_OUT : null,
    acceptedRowCount: finalAcceptedRows.length,
    acceptedRowsByCompetition: summary.summary.acceptedRowsByCompetition
  }
};

writeJson(SUMMARY_OUT, summary);
if (finalAcceptedRows.length) writeJsonl(ROWS_OUT, finalAcceptedRows);
writeJson(CONTRACT_OUT, contract);

console.log(JSON.stringify({
  status,
  familyId: "sportomedia_sef",
  seasonScope: "current_or_new",
  seasonLabel: "2026",
  verifiedGroupCount: finalAccepted.length,
  acceptedRowCount: finalAcceptedRows.length,
  acceptedRowsByCompetition: summary.summary.acceptedRowsByCompetition,
  validations: summary.validations,
  output: SUMMARY_OUT,
  rowsOutput: finalAcceptedRows.length ? ROWS_OUT : null,
  contractOutput: CONTRACT_OUT,
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0
}, null, 2));
