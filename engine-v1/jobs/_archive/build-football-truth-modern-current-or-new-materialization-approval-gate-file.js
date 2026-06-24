import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = `data/football-truth/_diagnostics/modern-current-or-new-materialization-approval-gate-${DATE}`;
const OUT = `${OUT_DIR}/modern-current-or-new-materialization-approval-gate-${DATE}.json`;
const PAYLOAD_OUT = `${OUT_DIR}/modern-current-or-new-materialization-candidate-payload-${DATE}.json`;
const ROWS_OUT = `${OUT_DIR}/modern-current-or-new-materialization-candidate-rows-${DATE}.jsonl`;

const PROOF_SUMMARY = `data/football-truth/_diagnostics/modern-sportomedia-sef-current-or-new-proof-${DATE}/modern-sportomedia-sef-current-or-new-proof-${DATE}.json`;
const PROOF_ROWS = `data/football-truth/_diagnostics/modern-sportomedia-sef-current-or-new-proof-${DATE}/modern-sportomedia-sef-current-or-new-proof-rows-${DATE}.jsonl`;
const IMPACT_BOARD = `data/football-truth/_diagnostics/modern-family-proof-coverage-impact-board-${DATE}/modern-family-proof-coverage-impact-board-${DATE}.json`;
const CONTRACT = "engine-v1/config/football-truth-modern-sportomedia-sef-current-or-new-proof-contract.json";

const EXPECTED = {
  "swe.1": {
    rows: 16,
    seasonScope: "current_or_new",
    seasonLabel: "2026",
    sourceHost: "allsvenskan.se",
    officialRoute: "https://allsvenskan.se/tabell",
    sourceUrl: "https://gql.sportomedia.se/graphql",
    league: "allsvenskan"
  },
  "swe.2": {
    rows: 16,
    seasonScope: "current_or_new",
    seasonLabel: "2026",
    sourceHost: "superettan.se",
    officialRoute: "https://superettan.se/tabell",
    sourceUrl: "https://gql.sportomedia.se/graphql",
    league: "superettan"
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

function groupBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const k = row[key];
    if (!out[k]) out[k] = [];
    out[k].push(row);
  }
  return out;
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function normTeam(v) {
  return String(v ?? "").trim().replace(/\s+/g, " ");
}

function validateRows(rows) {
  const blocks = [];
  const warnings = [];
  const bySlug = groupBy(rows, "competitionSlug");
  const acceptedSlugs = Object.keys(EXPECTED);

  for (const slug of acceptedSlugs) {
    const cfg = EXPECTED[slug];
    const slugRows = (bySlug[slug] ?? []).slice().sort((a, b) => n(a.position) - n(b.position));

    if (slugRows.length !== cfg.rows) blocks.push(`${slug}_row_count_${slugRows.length}_expected_${cfg.rows}`);

    const positions = slugRows.map(r => n(r.position));
    const expectedPositions = Array.from({ length: cfg.rows }, (_, i) => i + 1);
    if (JSON.stringify(positions) !== JSON.stringify(expectedPositions)) blocks.push(`${slug}_positions_not_1_to_${cfg.rows}`);

    const teamNames = new Set();
    const teamIds = new Set();
    let totalPlayed = 0;
    let totalPoints = 0;
    let maxPlayed = 0;
    let maxPoints = 0;

    for (const row of slugRows) {
      const team = normTeam(row.teamName);
      if (!team) blocks.push(`${slug}_missing_team_name`);
      teamNames.add(team.toLowerCase());
      teamIds.add(String(row.teamId ?? ""));

      const requiredExact = {
        seasonScope: cfg.seasonScope,
        seasonLabel: cfg.seasonLabel,
        sourceFamily: "sportomedia_sef",
        sourceKind: "official_sportomedia_graphql_standingsForLeague",
        sourceHost: cfg.sourceHost,
        sourceUrl: cfg.sourceUrl,
        officialRoute: cfg.officialRoute,
        league: cfg.league,
        qualityGateStatus: "verified",
        validationStatus: "passed"
      };

      for (const [field, expected] of Object.entries(requiredExact)) {
        if (row[field] !== expected) blocks.push(`${slug}_${team}_${field}_mismatch_${row[field]}_expected_${expected}`);
      }

      const played = n(row.played);
      const won = n(row.won);
      const drawn = n(row.drawn);
      const lost = n(row.lost);
      const goalsFor = n(row.goalsFor);
      const goalsAgainst = n(row.goalsAgainst);
      const goalDifference = n(row.goalDifference);
      const points = n(row.points);

      for (const [field, value] of Object.entries({ played, won, drawn, lost, goalsFor, goalsAgainst, goalDifference, points })) {
        if (!Number.isInteger(value)) blocks.push(`${slug}_${team}_${field}_not_integer`);
      }

      if (played !== won + drawn + lost) blocks.push(`${slug}_${team}_wdl_arithmetic_failed`);
      if (points !== won * 3 + drawn) blocks.push(`${slug}_${team}_points_arithmetic_failed`);
      if (goalDifference !== goalsFor - goalsAgainst) blocks.push(`${slug}_${team}_goal_difference_failed`);

      totalPlayed += played;
      totalPoints += points;
      maxPlayed = Math.max(maxPlayed, played);
      maxPoints = Math.max(maxPoints, points);
    }

    if (teamNames.size !== slugRows.length) blocks.push(`${slug}_duplicate_team_names`);
    if (teamIds.size !== slugRows.length) blocks.push(`${slug}_duplicate_team_ids`);
    if (totalPlayed <= 0 || totalPoints <= 0 || maxPlayed <= 0 || maxPoints <= 0) blocks.push(`${slug}_non_trivial_current_or_new_failed`);

    const sortedSignature = slugRows.map(row => [
      row.teamId,
      normTeam(row.teamName),
      row.position,
      row.played,
      row.won,
      row.drawn,
      row.lost,
      row.goalsFor,
      row.goalsAgainst,
      row.goalDifference,
      row.points
    ].join("|")).join("\n");

    cfg.rowSignatureSha256 = sha256Text(sortedSignature);
    cfg.totalPlayed = totalPlayed;
    cfg.totalPoints = totalPoints;
    cfg.maxPlayed = maxPlayed;
    cfg.maxPoints = maxPoints;
    cfg.teamSignals = slugRows.slice(0, 8).map(r => normTeam(r.teamName));
  }

  const unexpectedSlugs = Object.keys(bySlug).filter(slug => !EXPECTED[slug]);
  if (unexpectedSlugs.length) blocks.push(`unexpected_slugs_${unexpectedSlugs.join("_")}`);

  const sigs = acceptedSlugs.map(slug => EXPECTED[slug].rowSignatureSha256);
  if (new Set(sigs).size !== sigs.length) blocks.push("duplicate_shared_table_guard_failed");

  return { blocks: Array.from(new Set(blocks)), warnings };
}

const proof = readJson(PROOF_SUMMARY);
const rows = readJsonl(PROOF_ROWS);
const impact = readJson(IMPACT_BOARD);
const contract = readJson(CONTRACT);

const blocks = [];
const warnings = [];

if (proof.status !== "passed_verified_current_or_new_diagnostic_only") blocks.push(`proof_status_not_passed_${proof.status}`);
if (impact.status !== "passed") blocks.push(`impact_board_status_not_passed_${impact.status}`);
if (contract.status !== "active") blocks.push(`contract_status_not_active_${contract.status}`);
if (contract.mode !== "isolated_diagnostic_proof_only") blocks.push(`contract_mode_unexpected_${contract.mode}`);

if (rows.length !== 32) blocks.push(`rows_count_${rows.length}_expected_32`);
if (JSON.stringify(impact.modernProofs?.[0]?.newCurrentOrNewSlugs ?? []) !== JSON.stringify(["swe.1", "swe.2"])) {
  blocks.push("impact_new_current_or_new_slugs_not_exact_swe1_swe2");
}
if (Number(impact.impact?.wouldAddCurrentOrNewSatisfiedCount ?? -1) !== 2) blocks.push("impact_would_add_current_or_new_count_not_2");
if (Number(impact.impact?.wouldAddCurrentOrNewVerifiedRowsCount ?? -1) !== 32) blocks.push("impact_would_add_rows_not_32");
if (Number(impact.impact?.previousCompletedSatisfiedCountUnchanged ?? -1) !== 11) blocks.push("baseline_previous_completed_not_11");
if (Number(impact.impact?.previousCompletedVerifiedRowsCountUnchanged ?? -1) !== 180) blocks.push("baseline_previous_completed_rows_not_180");
if (Number(impact.impact?.nextSeasonStartDateSatisfiedCountUnchanged ?? -1) !== 2) blocks.push("baseline_start_dates_not_2");

const rowValidation = validateRows(rows);
blocks.push(...rowValidation.blocks);
warnings.push(...rowValidation.warnings);

const canonicalPayload = {
  schemaVersion: 1,
  payloadKind: "modern_current_or_new_lane_materialization_candidate",
  familyId: "sportomedia_sef",
  seasonScope: "current_or_new",
  seasonLabel: "2026",
  competitionSlugs: ["swe.1", "swe.2"],
  rowCount: rows.length,
  rowsByCompetition: Object.fromEntries(Object.keys(EXPECTED).map(slug => [slug, rows.filter(r => r.competitionSlug === slug).length])),
  sourcePolicy: {
    proofOnly: true,
    canonicalWriteAllowed: false,
    productionWriteAllowed: false,
    truthAssertionAllowed: false
  },
  rows
};

const payloadSha256 = sha256Text(JSON.stringify(canonicalPayload));

const status = blocks.length === 0 ? "passed_ready_for_explicit_materialization_approval" : "blocked";
const approval = {
  approvalRequired: true,
  approvedNow: false,
  mayMaterializeDiagnosticStateRowsAfterExplicitUserApprovalCount: status === "passed_ready_for_explicit_materialization_approval" ? 1 : 0,
  mayWriteCanonicalNowCount: 0,
  mayWriteProductionNowCount: 0,
  mayAssertTruthNowCount: 0
};

const output = {
  status,
  runner: "modern_current_or_new_materialization_approval_gate",
  contractVersion: 1,
  generatedAtUtc: new Date().toISOString(),
  purpose: "validate modern current_or_new proof rows and prepare an approval-gated materialization candidate; do not write canonical/truth/production/state lane outputs now",
  inputs: {
    proofSummary: PROOF_SUMMARY,
    proofRows: PROOF_ROWS,
    impactBoard: IMPACT_BOARD,
    contract: CONTRACT
  },
  target: {
    familyId: "sportomedia_sef",
    seasonScope: "current_or_new",
    seasonLabel: "2026",
    competitionSlugs: ["swe.1", "swe.2"],
    rowCount: rows.length,
    rowsByCompetition: canonicalPayload.rowsByCompetition
  },
  baselinePreserved: {
    previousCompletedSatisfiedCount: Number(impact.impact?.previousCompletedSatisfiedCountUnchanged ?? 0),
    previousCompletedVerifiedRowsCount: Number(impact.impact?.previousCompletedVerifiedRowsCountUnchanged ?? 0),
    nextSeasonStartDateSatisfiedCount: Number(impact.impact?.nextSeasonStartDateSatisfiedCountUnchanged ?? 0),
    projectedCurrentOrNewSatisfiedCount: Number(impact.impact?.projectedCurrentOrNewSatisfiedCount ?? 0),
    projectedCurrentOrNewVerifiedRowsCount: Number(impact.impact?.projectedCurrentOrNewVerifiedRowsCount ?? 0)
  },
  gates: {
    proofStatusPassed: proof.status === "passed_verified_current_or_new_diagnostic_only",
    impactBoardPassed: impact.status === "passed",
    contractActiveDiagnosticOnly: contract.status === "active" && contract.mode === "isolated_diagnostic_proof_only",
    exactRowsAndSlugs: rows.length === 32 && JSON.stringify(Object.keys(groupBy(rows, "competitionSlug")).sort()) === JSON.stringify(["swe.1", "swe.2"]),
    exactIdentityAndSeason: !rowValidation.blocks.some(b => b.includes("mismatch")),
    arithmeticAndNonTrivial: !rowValidation.blocks.some(b => b.includes("arithmetic") || b.includes("non_trivial")),
    duplicateSharedTableGuard: !rowValidation.blocks.some(b => b.includes("duplicate_shared_table")),
    baselinePreserved: Number(impact.impact?.previousCompletedSatisfiedCountUnchanged ?? 0) === 11 && Number(impact.impact?.nextSeasonStartDateSatisfiedCountUnchanged ?? 0) === 2
  },
  competitionEvidence: Object.fromEntries(Object.entries(EXPECTED).map(([slug, cfg]) => [slug, {
    rows: cfg.rows,
    seasonScope: cfg.seasonScope,
    seasonLabel: cfg.seasonLabel,
    sourceHost: cfg.sourceHost,
    officialRoute: cfg.officialRoute,
    sourceUrl: cfg.sourceUrl,
    league: cfg.league,
    totalPlayed: cfg.totalPlayed,
    totalPoints: cfg.totalPoints,
    maxPlayed: cfg.maxPlayed,
    maxPoints: cfg.maxPoints,
    rowSignatureSha256: cfg.rowSignatureSha256,
    teamSignals: cfg.teamSignals
  }])),
  approval,
  blocks: Array.from(new Set(blocks)),
  warnings,
  payload: {
    output: PAYLOAD_OUT,
    rowsOutput: ROWS_OUT,
    sha256: payloadSha256,
    rowCount: rows.length,
    rowsByCompetition: canonicalPayload.rowsByCompetition
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
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
};

writeJson(OUT, output);
writeJson(PAYLOAD_OUT, canonicalPayload);
writeJsonl(ROWS_OUT, rows);

console.log(JSON.stringify({
  status,
  target: output.target,
  baselinePreserved: output.baselinePreserved,
  approval,
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
