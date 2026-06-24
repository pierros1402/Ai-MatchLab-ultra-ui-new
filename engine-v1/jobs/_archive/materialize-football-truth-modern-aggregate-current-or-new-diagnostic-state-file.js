import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const APPROVAL = `data/football-truth/_diagnostics/modern-aggregate-current-or-new-materialization-approval-gate-${DATE}/modern-aggregate-current-or-new-materialization-approval-gate-${DATE}.json`;
const OUT_DIR = `data/football-truth/_diagnostics/modern-aggregate-current-or-new-diagnostic-state-materialization-${DATE}`;
const OUT = `${OUT_DIR}/modern-aggregate-current-or-new-diagnostic-state-materialization-${DATE}.json`;
const STATE_DIR = "data/football-truth/_state/current-or-new-season-standings-candidates";
const STATE_OUT = `${STATE_DIR}/modern-aggregate-current-or-new-season-standings-candidates-${DATE}.json`;
const STATE_ROWS = `${STATE_DIR}/modern-aggregate-current-or-new-season-standings-candidate-rows-${DATE}.jsonl`;

function abs(p) { return path.join(ROOT, p); }
function readJson(p) { if (!fs.existsSync(abs(p))) throw new Error(`Missing ${p}`); return JSON.parse(fs.readFileSync(abs(p), "utf8")); }
function readJsonl(p) { if (!fs.existsSync(abs(p))) throw new Error(`Missing ${p}`); return fs.readFileSync(abs(p), "utf8").split(/\r?\n/).filter(Boolean).map(x => JSON.parse(x)); }
function writeJson(p, v) { fs.mkdirSync(path.dirname(abs(p)), { recursive: true }); fs.writeFileSync(abs(p), JSON.stringify(v, null, 2) + "\n"); }
function writeJsonl(p, rows) { fs.mkdirSync(path.dirname(abs(p)), { recursive: true }); fs.writeFileSync(abs(p), rows.map(r => JSON.stringify(r)).join("\n") + "\n"); }
function sha256Text(t) { return crypto.createHash("sha256").update(t).digest("hex"); }
function group(rows) { return rows.reduce((a, r) => { a[r.competitionSlug] = (a[r.competitionSlug] ?? 0) + 1; return a; }, {}); }

if (!process.argv.includes("--approved-by-user")) throw new Error("Explicit user approval flag required");

const approval = readJson(APPROVAL);
if (approval.status !== "passed_ready_for_explicit_materialization_approval") throw new Error(`Approval gate not ready: ${approval.status}`);
if (approval.approval?.mayMaterializeDiagnosticStateRowsAfterExplicitUserApprovalCount !== 1) throw new Error("Approval gate does not allow diagnostic state materialization");
if (approval.approval?.mayWriteCanonicalNowCount !== 0 || approval.approval?.mayWriteProductionNowCount !== 0 || approval.approval?.mayAssertTruthNowCount !== 0) throw new Error("Unsafe write permission detected in approval gate");

const payload = readJson(approval.payload.output);
const rows = readJsonl(approval.payload.rowsOutput);
const expectedSlugs = ["nor.1", "swe.1", "swe.2"];
const rowsByCompetition = group(rows);
const blocks = [];

if (payload.payloadKind !== "modern_aggregate_current_or_new_lane_materialization_candidate") blocks.push("payload_kind_mismatch");
if (payload.seasonScope !== "current_or_new" || payload.seasonLabel !== "2026") blocks.push("payload_season_scope_or_label_mismatch");
if (rows.length !== 48) blocks.push(`row_count_${rows.length}_expected_48`);
if (JSON.stringify(Object.keys(rowsByCompetition).sort()) !== JSON.stringify(expectedSlugs)) blocks.push(`slugs_${JSON.stringify(Object.keys(rowsByCompetition).sort())}_expected_${JSON.stringify(expectedSlugs)}`);
for (const slug of expectedSlugs) if (rowsByCompetition[slug] !== 16) blocks.push(`${slug}_rows_${rowsByCompetition[slug] ?? 0}_expected_16`);
if (rowsByCompetition["nor.2"]) blocks.push("nor.2_must_not_be_materialized");

for (const row of rows) {
  if (row.seasonScope !== "current_or_new") blocks.push(`${row.competitionSlug}_${row.teamName}_seasonScope`);
  if (row.seasonLabel !== "2026") blocks.push(`${row.competitionSlug}_${row.teamName}_seasonLabel`);
  if (row.qualityGateStatus !== "verified") blocks.push(`${row.competitionSlug}_${row.teamName}_qualityGateStatus`);
  if (row.validationStatus !== "passed") blocks.push(`${row.competitionSlug}_${row.teamName}_validationStatus`);
  if (row.played !== row.won + row.drawn + row.lost) blocks.push(`${row.competitionSlug}_${row.teamName}_wdl`);
  if (row.points !== row.won * 3 + row.drawn) blocks.push(`${row.competitionSlug}_${row.teamName}_points`);
  if (row.goalDifference !== row.goalsFor - row.goalsAgainst) blocks.push(`${row.competitionSlug}_${row.teamName}_gd`);
}

if (blocks.length) {
  writeJson(OUT, { status: "blocked", blocks, approvalGate: APPROVAL, canonicalWriteExecutedNowCount: 0, productionWriteExecutedNowCount: 0, truthAssertionExecutedNowCount: 0, stateLaneWriteExecutedNowCount: 0 });
  throw new Error(`Materialization blocked: ${blocks.slice(0, 5).join(", ")}`);
}

const state = {
  status: "materialized_diagnostic_state_current_or_new_rows",
  schemaVersion: 1,
  materializedAtUtc: new Date().toISOString(),
  approvedByUserNow: true,
  approvalSource: "user explicitly requested both approved diagnostic materialization and CFA review in current chat",
  seasonScope: "current_or_new",
  seasonLabel: "2026",
  competitionSlugs: expectedSlugs,
  rowCount: rows.length,
  rowsByCompetition,
  sourceApprovalGate: APPROVAL,
  sourcePayload: approval.payload.output,
  sourceRows: approval.payload.rowsOutput,
  payloadSha256: approval.payload.sha256,
  rowSetSha256: sha256Text(rows.map(r => JSON.stringify(r)).join("\n")),
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 1,
  rows
};

writeJson(STATE_OUT, state);
writeJsonl(STATE_ROWS, rows);

const summary = {
  status: "passed_materialized_diagnostic_state_rows_only",
  runner: "modern_aggregate_current_or_new_diagnostic_state_materializer",
  approvedByUserNow: true,
  target: { seasonScope: "current_or_new", seasonLabel: "2026", competitionSlugs: expectedSlugs, rowCount: rows.length, rowsByCompetition },
  stateOutput: STATE_OUT,
  rowsOutput: STATE_ROWS,
  sourceApprovalGate: APPROVAL,
  excludedBlockedGroupsStillExcluded: approval.excludedBlockedGroups ?? [],
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 1,
  blocks: []
};

writeJson(OUT, summary);
console.log(JSON.stringify(summary, null, 2));
