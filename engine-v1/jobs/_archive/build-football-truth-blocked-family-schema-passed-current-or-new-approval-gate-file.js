import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);

const INPUT = `data/football-truth/_diagnostics/blocked-families-local-context-schema-probe-${DATE}/blocked-families-local-context-schema-probe-${DATE}.json`;
const INPUT_ROWS = `data/football-truth/_diagnostics/blocked-families-local-context-schema-probe-${DATE}/blocked-families-local-context-schema-probe-rows-${DATE}.jsonl`;

const OUT_DIR = `data/football-truth/_diagnostics/blocked-family-schema-passed-current-or-new-approval-gate-${DATE}`;
const OUT = `${OUT_DIR}/blocked-family-schema-passed-current-or-new-approval-gate-${DATE}.json`;
const PAYLOAD_OUT = `${OUT_DIR}/blocked-family-schema-passed-current-or-new-candidate-payload-${DATE}.json`;
const ROWS_OUT = `${OUT_DIR}/blocked-family-schema-passed-current-or-new-candidate-rows-${DATE}.jsonl`;

const EXPECTED = {
  "isl.1": {
    familyId: "ksi",
    seasonScope: "current_or_new",
    seasonLabel: "2026",
    rowCount: 12,
    requiredTitle: "Besta deild karla",
    requiredSourceHost: "www.ksi.is"
  },
  "isl.2": {
    familyId: "ksi",
    seasonScope: "current_or_new",
    seasonLabel: "2026",
    rowCount: 12,
    requiredTitle: "Lengjudeild karla",
    requiredSourceHost: "www.ksi.is"
  },
  "cyp.1": {
    familyId: "cfa_cyprus_html",
    seasonScope: "current_or_new",
    seasonLabel: "2025-2026",
    rowCount: 14,
    requiredTitle: "Cyprus Football Association",
    requiredSourceHost: "www.cfa.com.cy"
  }
};

function abs(p) {
  return path.join(ROOT, p);
}

function readJson(p) {
  if (!fs.existsSync(abs(p))) throw new Error(`Missing ${p}`);
  return JSON.parse(fs.readFileSync(abs(p), "utf8"));
}

function readJsonl(p) {
  if (!fs.existsSync(abs(p))) throw new Error(`Missing ${p}`);
  return fs.readFileSync(abs(p), "utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

function writeJson(p, v) {
  fs.mkdirSync(path.dirname(abs(p)), { recursive: true });
  fs.writeFileSync(abs(p), JSON.stringify(v, null, 2) + "\n");
}

function writeJsonl(p, rows) {
  fs.mkdirSync(path.dirname(abs(p)), { recursive: true });
  fs.writeFileSync(abs(p), rows.map(row => JSON.stringify(row)).join("\n") + "\n");
}

function sha256Text(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function groupBy(rows, key) {
  return rows.reduce((acc, row) => {
    const k = row[key];
    if (!acc[k]) acc[k] = [];
    acc[k].push(row);
    return acc;
  }, {});
}

function validateRows(slug, rows) {
  const expected = EXPECTED[slug];
  const blocks = [];

  if (!expected) blocks.push(`${slug}_unexpected_slug`);
  if (expected && rows.length !== expected.rowCount) blocks.push(`${slug}_row_count_${rows.length}_expected_${expected.rowCount}`);

  const positions = rows.map(r => Number(r.position)).sort((a, b) => a - b);
  for (let i = 0; i < positions.length; i += 1) {
    if (positions[i] !== i + 1) {
      blocks.push(`${slug}_positions_not_1_to_n`);
      break;
    }
  }

  const teamSet = new Set(rows.map(r => r.teamName));
  if (teamSet.size !== rows.length) blocks.push(`${slug}_duplicate_team_names`);

  let totalPlayed = 0;
  let totalPoints = 0;
  let maxPlayed = 0;
  let maxPoints = 0;

  for (const row of rows) {
    if (expected && row.seasonScope !== expected.seasonScope) blocks.push(`${slug}_${row.teamName}_seasonScope_${row.seasonScope}`);
    if (expected && row.seasonLabel !== expected.seasonLabel) blocks.push(`${slug}_${row.teamName}_seasonLabel_${row.seasonLabel}`);
    if (expected && row.sourceHost !== expected.requiredSourceHost) blocks.push(`${slug}_${row.teamName}_sourceHost_${row.sourceHost}`);

    totalPlayed += Number(row.played ?? 0);
    totalPoints += Number(row.points ?? 0);
    maxPlayed = Math.max(maxPlayed, Number(row.played ?? 0));
    maxPoints = Math.max(maxPoints, Number(row.points ?? 0));

    if (row.played !== row.won + row.drawn + row.lost) blocks.push(`${slug}_${row.teamName}_wdl_failed`);
    if (row.points !== row.won * 3 + row.drawn) blocks.push(`${slug}_${row.teamName}_points_failed`);
    if (row.goalDifference !== row.goalsFor - row.goalsAgainst) blocks.push(`${slug}_${row.teamName}_gd_failed`);
  }

  if (totalPlayed <= 0 || totalPoints <= 0 || maxPlayed <= 0 || maxPoints <= 0) blocks.push(`${slug}_non_triviality_failed`);

  return {
    passed: blocks.length === 0,
    blocks: [...new Set(blocks)].slice(0, 80),
    rowCount: rows.length,
    totalPlayed,
    totalPoints,
    maxPlayed,
    maxPoints,
    teamSignals: rows.slice(0, 8).map(r => r.teamName),
    duplicateGuardHash: sha256Text(rows.map(r => `${r.competitionSlug}|${r.position}|${r.teamName}|${r.played}|${r.points}`).join("\n")).slice(0, 24)
  };
}

const probe = readJson(INPUT);
const rows = readJsonl(INPUT_ROWS);

const blocks = [];
const warnings = [];

if (probe.status !== "passed") blocks.push(`schema_probe_status_${probe.status}`);
if (probe.acceptedRowCount !== 38) blocks.push(`schema_probe_acceptedRowCount_${probe.acceptedRowCount}_expected_38`);

const expectedSlugs = Object.keys(EXPECTED).sort();
const rowGroups = groupBy(rows, "competitionSlug");
const actualSlugs = Object.keys(rowGroups).sort();

if (JSON.stringify(actualSlugs) !== JSON.stringify(expectedSlugs)) {
  blocks.push(`actual_slugs_${JSON.stringify(actualSlugs)}_expected_${JSON.stringify(expectedSlugs)}`);
}

const groupValidations = {};
for (const slug of expectedSlugs) {
  groupValidations[slug] = validateRows(slug, rowGroups[slug] ?? []);
  if (!groupValidations[slug].passed) blocks.push(`${slug}_validation_failed`);
}

const candidateGroups = probe.candidateGroups ?? [];
const blockedGroups = candidateGroups
  .filter(group => group.status !== "schema_candidate_passed_diagnostic_only")
  .map(group => ({
    familyId: group.familyId,
    competitionSlug: group.competitionSlug,
    status: group.status,
    title: group.title,
    parsedRowCount: group.parsedRowCount,
    blocks: group.validation?.blocks ?? [],
    url: group.url
  }));

const disallowedIfPresent = ["cyp.2", "fin.1", "fin.2"];
for (const slug of disallowedIfPresent) {
  if (rowGroups[slug]?.length) blocks.push(`${slug}_must_not_be_in_candidate_rows`);
}
if (!blockedGroups.some(group => group.competitionSlug === "cyp.2")) warnings.push("cyp2_block_group_not_found");
if (!blockedGroups.some(group => group.competitionSlug === "fin.1")) warnings.push("fin1_block_group_not_found");
if (!blockedGroups.some(group => group.competitionSlug === "fin.2")) warnings.push("fin2_block_group_not_found");

const normalizedRows = rows.map(row => ({
  ...row,
  qualityGateStatus: "verified",
  validationStatus: "passed",
  approvalGateStatus: "ready_for_explicit_materialization_approval",
  materializationStatus: "not_materialized",
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0
}));

const rowsByCompetition = Object.fromEntries(Object.entries(rowGroups).map(([slug, group]) => [slug, group.length]));

const payload = {
  payloadKind: "blocked_family_schema_passed_current_or_new_lane_materialization_candidate",
  schemaVersion: 1,
  generatedAtUtc: new Date().toISOString(),
  sourceSchemaProbe: INPUT,
  sourceRows: INPUT_ROWS,
  seasonScopes: [...new Set(normalizedRows.map(row => row.seasonScope))].sort(),
  competitionSlugs: actualSlugs,
  rowCount: normalizedRows.length,
  rowsByCompetition,
  expectedContracts: EXPECTED,
  groupValidations,
  excludedBlockedGroups: blockedGroups,
  rows: normalizedRows,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
};

writeJson(PAYLOAD_OUT, payload);
writeJsonl(ROWS_OUT, normalizedRows);

const payloadSha256 = sha256Text(JSON.stringify(payload));
const rowsSha256 = sha256Text(normalizedRows.map(row => JSON.stringify(row)).join("\n"));

const output = {
  status: blocks.length ? "blocked" : "passed_ready_for_explicit_materialization_approval",
  runner: "blocked_family_schema_passed_current_or_new_approval_gate",
  contractVersion: 1,
  generatedAtUtc: new Date().toISOString(),
  purpose: "approval gate for schema-passed blocked-family current_or_new rows; no state/canonical/truth write without explicit approval",
  sourceSchemaProbe: INPUT,
  target: {
    seasonScope: "current_or_new",
    competitionSlugs: actualSlugs,
    rowCount: normalizedRows.length,
    rowsByCompetition,
    expectedContracts: EXPECTED,
    groupValidations
  },
  excludedBlockedGroups: blockedGroups,
  payload: {
    output: PAYLOAD_OUT,
    rowsOutput: ROWS_OUT,
    sha256: payloadSha256,
    rowsSha256
  },
  approval: {
    approvalRequired: true,
    approvedNow: false,
    mayMaterializeDiagnosticStateRowsAfterExplicitUserApprovalCount: blocks.length ? 0 : 1,
    mayWriteCanonicalNowCount: 0,
    mayWriteProductionNowCount: 0,
    mayAssertTruthNowCount: 0
  },
  policy: {
    rawPayloadCommitted: false,
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    browserExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    stateLaneWriteExecutedNowCount: 0
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

writeJson(OUT, output);

console.log(JSON.stringify({
  status: output.status,
  target: output.target,
  excludedBlockedGroups: output.excludedBlockedGroups,
  approval: output.approval,
  payload: output.payload,
  blocks,
  warnings,
  output: OUT,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
}, null, 2));

if (blocks.length) process.exit(1);
