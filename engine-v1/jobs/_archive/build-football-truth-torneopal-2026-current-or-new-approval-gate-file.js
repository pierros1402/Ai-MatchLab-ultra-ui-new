import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const INPUT = `data/football-truth/_diagnostics/current-season-blocker-adjudication-and-torneopal-sweep-${DATE}/current-season-blocker-adjudication-and-torneopal-sweep-${DATE}.json`;
const INPUT_ROWS = `data/football-truth/_diagnostics/current-season-blocker-adjudication-and-torneopal-sweep-${DATE}/current-season-blocker-adjudication-and-torneopal-sweep-candidate-rows-${DATE}.jsonl`;
const OUT_DIR = `data/football-truth/_diagnostics/torneopal-2026-current-or-new-approval-gate-${DATE}`;
const OUT = `${OUT_DIR}/torneopal-2026-current-or-new-approval-gate-${DATE}.json`;
const PAYLOAD_OUT = `${OUT_DIR}/torneopal-2026-current-or-new-candidate-payload-${DATE}.json`;
const ROWS_OUT = `${OUT_DIR}/torneopal-2026-current-or-new-candidate-rows-${DATE}.jsonl`;

const EXPECTED = {
  "fin.1": { familyId: "torneopal", seasonScope: "current_or_new", seasonLabel: "2026", rowCount: 12, routeLabel: "Veikkausliiga", sourceHost: "tulospalvelu.palloliitto.fi" },
  "fin.2": { familyId: "torneopal", seasonScope: "current_or_new", seasonLabel: "2026", rowCount: 10, routeLabel: "Ykkösliiga", sourceHost: "tulospalvelu.palloliitto.fi" }
};

function abs(p) { return path.join(ROOT, p); }
function readJson(p) { if (!fs.existsSync(abs(p))) throw new Error(`Missing ${p}`); return JSON.parse(fs.readFileSync(abs(p), "utf8")); }
function readJsonl(p) { if (!fs.existsSync(abs(p))) throw new Error(`Missing ${p}`); return fs.readFileSync(abs(p), "utf8").split(/\r?\n/).filter(Boolean).map(x => JSON.parse(x)); }
function writeJson(p, v) { fs.mkdirSync(path.dirname(abs(p)), { recursive: true }); fs.writeFileSync(abs(p), JSON.stringify(v, null, 2) + "\n"); }
function writeJsonl(p, rows) { fs.mkdirSync(path.dirname(abs(p)), { recursive: true }); fs.writeFileSync(abs(p), rows.map(r => JSON.stringify(r)).join("\n") + "\n"); }
function sha256Text(t) { return crypto.createHash("sha256").update(t).digest("hex"); }
function group(rows) { return rows.reduce((a, r) => { a[r.competitionSlug] = (a[r.competitionSlug] ?? 0) + 1; return a; }, {}); }

const source = readJson(INPUT);
const rows = readJsonl(INPUT_ROWS);
const rowsByCompetition = group(rows);
const blocks = [];

if (source.status !== "passed") blocks.push(`source_status_${source.status}`);
if (source.torneopal?.schemaPassedGroupCount !== 2) blocks.push(`schemaPassedGroupCount_${source.torneopal?.schemaPassedGroupCount}_expected_2`);
if (source.acceptedRowCount !== 22) blocks.push(`source_acceptedRowCount_${source.acceptedRowCount}_expected_22`);
if (rows.length !== 22) blocks.push(`rows_length_${rows.length}_expected_22`);
if (JSON.stringify(Object.keys(rowsByCompetition).sort()) !== JSON.stringify(["fin.1","fin.2"])) blocks.push(`slugs_${JSON.stringify(Object.keys(rowsByCompetition).sort())}_expected_fin1_fin2`);

for (const [slug, expected] of Object.entries(EXPECTED)) {
  const groupRows = rows.filter(r => r.competitionSlug === slug);
  if (groupRows.length !== expected.rowCount) blocks.push(`${slug}_row_count_${groupRows.length}_expected_${expected.rowCount}`);
  const teams = new Set(groupRows.map(r => r.teamName));
  if (teams.size !== groupRows.length) blocks.push(`${slug}_duplicate_team_names`);
  const positions = groupRows.map(r => Number(r.position)).sort((a, b) => a - b);
  for (let i = 0; i < groupRows.length; i++) if (positions[i] !== i + 1) { blocks.push(`${slug}_positions_not_1_to_n`); break; }
  let totalPlayed = 0, totalPoints = 0, maxPlayed = 0, maxPoints = 0;
  for (const row of groupRows) {
    totalPlayed += Number(row.played ?? 0);
    totalPoints += Number(row.points ?? 0);
    maxPlayed = Math.max(maxPlayed, Number(row.played ?? 0));
    maxPoints = Math.max(maxPoints, Number(row.points ?? 0));
    if (row.sourceFamily !== expected.familyId) blocks.push(`${slug}_${row.teamName}_sourceFamily_${row.sourceFamily}`);
    if (row.seasonScope !== expected.seasonScope) blocks.push(`${slug}_${row.teamName}_seasonScope_${row.seasonScope}`);
    if (row.seasonLabel !== expected.seasonLabel) blocks.push(`${slug}_${row.teamName}_seasonLabel_${row.seasonLabel}`);
    if (row.sourceHost !== expected.sourceHost) blocks.push(`${slug}_${row.teamName}_sourceHost_${row.sourceHost}`);
    if (row.routeLabel !== expected.routeLabel) blocks.push(`${slug}_${row.teamName}_routeLabel_${row.routeLabel}`);
    if (row.played !== row.won + row.drawn + row.lost) blocks.push(`${slug}_${row.teamName}_wdl_failed`);
    if (row.points !== row.won * 3 + row.drawn) blocks.push(`${slug}_${row.teamName}_points_failed`);
    if (row.goalDifference !== row.goalsFor - row.goalsAgainst) blocks.push(`${slug}_${row.teamName}_gd_failed`);
  }
  if (totalPlayed <= 0 || totalPoints <= 0 || maxPlayed <= 0 || maxPoints <= 0) blocks.push(`${slug}_non_triviality_failed`);
}

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

const payload = {
  payloadKind: "torneopal_2026_current_or_new_lane_materialization_candidate",
  schemaVersion: 1,
  generatedAtUtc: new Date().toISOString(),
  sourceSweep: INPUT,
  sourceRows: INPUT_ROWS,
  seasonScope: "current_or_new",
  seasonLabel: "2026",
  competitionSlugs: Object.keys(rowsByCompetition).sort(),
  rowCount: normalizedRows.length,
  rowsByCompetition,
  expectedContracts: EXPECTED,
  rows: normalizedRows,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
};

writeJson(PAYLOAD_OUT, payload);
writeJsonl(ROWS_OUT, normalizedRows);

const output = {
  status: blocks.length ? "blocked" : "passed_ready_for_explicit_materialization_approval",
  runner: "torneopal_2026_current_or_new_approval_gate",
  generatedAtUtc: new Date().toISOString(),
  target: {
    seasonScope: "current_or_new",
    seasonLabel: "2026",
    competitionSlugs: Object.keys(rowsByCompetition).sort(),
    rowCount: normalizedRows.length,
    rowsByCompetition,
    expectedContracts: EXPECTED
  },
  payload: {
    output: PAYLOAD_OUT,
    rowsOutput: ROWS_OUT,
    sha256: sha256Text(JSON.stringify(payload)),
    rowsSha256: sha256Text(normalizedRows.map(r => JSON.stringify(r)).join("\n"))
  },
  approval: {
    approvalRequired: true,
    approvedNow: false,
    mayMaterializeDiagnosticStateRowsAfterExplicitUserApprovalCount: blocks.length ? 0 : 1,
    mayWriteCanonicalNowCount: 0,
    mayWriteProductionNowCount: 0,
    mayAssertTruthNowCount: 0
  },
  blocks: [...new Set(blocks)].slice(0, 120),
  warnings: [],
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
};

writeJson(OUT, output);
console.log(JSON.stringify(output, null, 2));
if (blocks.length) process.exit(1);
