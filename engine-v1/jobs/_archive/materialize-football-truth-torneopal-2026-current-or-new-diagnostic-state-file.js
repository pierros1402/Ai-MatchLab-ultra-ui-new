import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const GATE = `data/football-truth/_diagnostics/torneopal-2026-current-or-new-approval-gate-${DATE}/torneopal-2026-current-or-new-approval-gate-${DATE}.json`;
const STATE_DIR = "data/football-truth/_state/current-or-new-season-standings-candidates";
const STATE_OUT = `${STATE_DIR}/torneopal-2026-current-or-new-season-standings-candidates-${DATE}.json`;
const STATE_ROWS = `${STATE_DIR}/torneopal-2026-current-or-new-season-standings-candidate-rows-${DATE}.jsonl`;
const OUT_DIR = `data/football-truth/_diagnostics/torneopal-2026-current-or-new-diagnostic-state-materialization-${DATE}`;
const OUT = `${OUT_DIR}/torneopal-2026-current-or-new-diagnostic-state-materialization-${DATE}.json`;

if (!process.argv.includes("--approved-by-user")) throw new Error("Explicit --approved-by-user required");

function abs(p) { return path.join(ROOT, p); }
function readJson(p) { if (!fs.existsSync(abs(p))) throw new Error(`Missing ${p}`); return JSON.parse(fs.readFileSync(abs(p), "utf8")); }
function readJsonl(p) { if (!fs.existsSync(abs(p))) throw new Error(`Missing ${p}`); return fs.readFileSync(abs(p), "utf8").split(/\r?\n/).filter(Boolean).map(x => JSON.parse(x)); }
function writeJson(p, v) { fs.mkdirSync(path.dirname(abs(p)), { recursive: true }); fs.writeFileSync(abs(p), JSON.stringify(v, null, 2) + "\n"); }
function writeJsonl(p, rows) { fs.mkdirSync(path.dirname(abs(p)), { recursive: true }); fs.writeFileSync(abs(p), rows.map(r => JSON.stringify(r)).join("\n") + "\n"); }
function sha256Text(t) { return crypto.createHash("sha256").update(t).digest("hex"); }
function group(rows) { return rows.reduce((a, r) => { a[r.competitionSlug] = (a[r.competitionSlug] ?? 0) + 1; return a; }, {}); }

const gate = readJson(GATE);
if (gate.status !== "passed_ready_for_explicit_materialization_approval") throw new Error(`Gate not ready: ${gate.status}`);
if (gate.approval?.mayMaterializeDiagnosticStateRowsAfterExplicitUserApprovalCount !== 1) throw new Error("Gate does not permit diagnostic materialization");
if (gate.approval?.mayWriteCanonicalNowCount !== 0 || gate.approval?.mayWriteProductionNowCount !== 0 || gate.approval?.mayAssertTruthNowCount !== 0) throw new Error("Unsafe write permission in gate");

const payload = readJson(gate.payload.output);
const rows = readJsonl(gate.payload.rowsOutput);
const rowsByCompetition = group(rows);
const blocks = [];

if (payload.payloadKind !== "torneopal_2026_current_or_new_lane_materialization_candidate") blocks.push("payload_kind_mismatch");
if (rows.length !== 22) blocks.push(`row_count_${rows.length}_expected_22`);
if (rowsByCompetition["fin.1"] !== 12) blocks.push(`fin.1_rows_${rowsByCompetition["fin.1"] ?? 0}_expected_12`);
if (rowsByCompetition["fin.2"] !== 10) blocks.push(`fin.2_rows_${rowsByCompetition["fin.2"] ?? 0}_expected_10`);

for (const row of rows) {
  if (row.qualityGateStatus !== "verified") blocks.push(`${row.competitionSlug}_${row.teamName}_qualityGateStatus`);
  if (row.validationStatus !== "passed") blocks.push(`${row.competitionSlug}_${row.teamName}_validationStatus`);
  if (row.seasonScope !== "current_or_new") blocks.push(`${row.competitionSlug}_${row.teamName}_seasonScope`);
  if (row.seasonLabel !== "2026") blocks.push(`${row.competitionSlug}_${row.teamName}_seasonLabel`);
  if (row.played !== row.won + row.drawn + row.lost) blocks.push(`${row.competitionSlug}_${row.teamName}_wdl`);
  if (row.points !== row.won * 3 + row.drawn) blocks.push(`${row.competitionSlug}_${row.teamName}_points`);
  if (row.goalDifference !== row.goalsFor - row.goalsAgainst) blocks.push(`${row.competitionSlug}_${row.teamName}_gd`);
}

if (blocks.length) {
  writeJson(OUT, { status: "blocked", blocks, canonicalWriteExecutedNowCount: 0, productionWriteExecutedNowCount: 0, truthAssertionExecutedNowCount: 0, stateLaneWriteExecutedNowCount: 0 });
  throw new Error(`Blocked: ${blocks.slice(0, 8).join(", ")}`);
}

const materializedAtUtc = new Date().toISOString();
const stateRows = rows.map(row => ({
  ...row,
  materializationStatus: "materialized_diagnostic_state_only",
  materializedAtUtc,
  approvedByUserNow: true
}));

const state = {
  status: "materialized_diagnostic_state_current_or_new_rows",
  schemaVersion: 1,
  materializedAtUtc,
  approvedByUserNow: true,
  approvalSource: "user executed materializer with --approved-by-user after Torneopal approval gate passed",
  seasonScope: "current_or_new",
  seasonLabel: "2026",
  competitionSlugs: Object.keys(rowsByCompetition).sort(),
  rowCount: stateRows.length,
  rowsByCompetition,
  sourceApprovalGate: GATE,
  sourcePayload: gate.payload.output,
  sourceRows: gate.payload.rowsOutput,
  payloadSha256: gate.payload.sha256,
  rowsSha256: gate.payload.rowsSha256,
  rowSetSha256: sha256Text(stateRows.map(r => JSON.stringify(r)).join("\n")),
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 1,
  rows: stateRows
};

writeJson(STATE_OUT, state);
writeJsonl(STATE_ROWS, stateRows);

const summary = {
  status: "passed_materialized_diagnostic_state_rows_only",
  runner: "torneopal_2026_current_or_new_diagnostic_state_materializer",
  approvedByUserNow: true,
  target: { seasonScope: "current_or_new", seasonLabel: "2026", competitionSlugs: Object.keys(rowsByCompetition).sort(), rowCount: stateRows.length, rowsByCompetition },
  stateOutput: STATE_OUT,
  rowsOutput: STATE_ROWS,
  sourceApprovalGate: GATE,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 1,
  blocks: []
};

writeJson(OUT, summary);
console.log(JSON.stringify(summary, null, 2));
