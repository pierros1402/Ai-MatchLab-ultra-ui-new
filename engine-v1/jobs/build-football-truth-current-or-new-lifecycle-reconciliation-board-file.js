import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);

const CURRENT_BOARD = `data/football-truth/_diagnostics/current-or-new-diagnostic-state-coverage-board-${DATE}/current-or-new-diagnostic-state-coverage-board-${DATE}.json`;
const STATE_DIR = "data/football-truth/_state/current-or-new-season-standings-candidates";
const OUT_DIR = `data/football-truth/_diagnostics/current-or-new-lifecycle-reconciliation-board-${DATE}`;
const OUT = `${OUT_DIR}/current-or-new-lifecycle-reconciliation-board-${DATE}.json`;

function abs(p) {
  return path.join(ROOT, p);
}

function readJsonIfExists(p) {
  if (!fs.existsSync(abs(p))) return null;
  return JSON.parse(fs.readFileSync(abs(p), "utf8"));
}

function readJsonlIfExists(p) {
  if (!fs.existsSync(abs(p))) return [];
  return fs.readFileSync(abs(p), "utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

function writeJson(p, v) {
  fs.mkdirSync(path.dirname(abs(p)), { recursive: true });
  fs.writeFileSync(abs(p), JSON.stringify(v, null, 2) + "\n");
}

function sha256Text(t) {
  return crypto.createHash("sha256").update(t).digest("hex");
}

function walk(dir, predicate, out = []) {
  const full = abs(dir);
  if (!fs.existsSync(full)) return out;
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    const rel = path.posix.join(dir.replace(/\\/g, "/"), entry.name);
    if (entry.isDirectory()) walk(rel, predicate, out);
    else if (predicate(rel)) out.push(rel);
  }
  return out;
}

function latestByName(fragment) {
  const files = walk("data/football-truth/_diagnostics", p => p.endsWith(".json") && p.toLowerCase().includes(fragment.toLowerCase()));
  if (!files.length) return null;
  return files
    .map(p => ({ p, mtimeMs: fs.statSync(abs(p)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0].p;
}

function pick(obj, keys) {
  const out = {};
  for (const key of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, key)) out[key] = obj[key];
  }
  return out;
}

const currentBoard = readJsonIfExists(CURRENT_BOARD);
if (!currentBoard) throw new Error(`Missing current board: ${CURRENT_BOARD}`);

const stateRowsFiles = fs.existsSync(abs(STATE_DIR))
  ? fs.readdirSync(abs(STATE_DIR)).filter(f => f.endsWith(".jsonl")).sort().map(f => `${STATE_DIR}/${f}`)
  : [];

const stateRows = [];
for (const file of stateRowsFiles) {
  for (const row of readJsonlIfExists(file)) stateRows.push({ ...row, stateRowsFile: file });
}

const bySlug = {};
for (const row of stateRows) {
  if (!bySlug[row.competitionSlug]) bySlug[row.competitionSlug] = [];
  bySlug[row.competitionSlug].push(row);
}

const materializedDiagnosticCurrentOrNewSlugs = Object.keys(bySlug).sort();
const materializedDiagnosticCurrentOrNewRowCount = stateRows.length;
const knownExistingCurrentOrNewOutsideThisState = ["geo.1"];
const projectedKnownCurrentOrNewSlugs = [...new Set([...knownExistingCurrentOrNewOutsideThisState, ...materializedDiagnosticCurrentOrNewSlugs])].sort();

const groupSummaries = Object.entries(bySlug).sort(([a], [b]) => a.localeCompare(b)).map(([slug, rows]) => {
  const blocks = [];
  const teams = new Set();
  let totalPlayed = 0;
  let totalPoints = 0;
  for (const row of rows) {
    teams.add(row.teamName);
    totalPlayed += Number(row.played ?? 0);
    totalPoints += Number(row.points ?? 0);
    if (row.seasonScope !== "current_or_new") blocks.push(`${row.teamName}_seasonScope_${row.seasonScope}`);
    if (row.played !== row.won + row.drawn + row.lost) blocks.push(`${row.teamName}_wdl_failed`);
    if (row.points !== row.won * 3 + row.drawn) blocks.push(`${row.teamName}_points_failed`);
    if (row.goalDifference !== row.goalsFor - row.goalsAgainst) blocks.push(`${row.teamName}_gd_failed`);
  }
  if (teams.size !== rows.length) blocks.push("duplicate_team_names");
  return {
    competitionSlug: slug,
    rowCount: rows.length,
    seasonLabels: [...new Set(rows.map(r => r.seasonLabel))].sort(),
    sourceFamilies: [...new Set(rows.map(r => r.sourceFamily))].sort(),
    totalPlayed,
    totalPoints,
    teamSignals: rows.slice(0, 8).map(r => r.teamName),
    duplicateGuardHash: sha256Text(rows.map(r => `${r.competitionSlug}|${r.position}|${r.teamName}|${r.played}|${r.points}`).join("\n")).slice(0, 24),
    validationStatus: blocks.length ? "blocked" : "passed",
    blocks: [...new Set(blocks)].slice(0, 40)
  };
});

const latestSeasonLaneLedgerPath = latestByName("season-lane-coverage-ledger");
const latestPermanentLifecyclePath = latestByName("permanent-season-lifecycle");
const latestPrioritizedLifecyclePath = latestByName("prioritized-lifecycle");

const latestSeasonLaneLedger = readJsonIfExists(latestSeasonLaneLedgerPath ?? "");
const latestPermanentLifecycle = readJsonIfExists(latestPermanentLifecyclePath ?? "");
const latestPrioritizedLifecycle = readJsonIfExists(latestPrioritizedLifecyclePath ?? "");

const ledgerCurrentCount =
  latestSeasonLaneLedger?.summary?.currentOrNewSeasonSatisfiedCount ??
  latestSeasonLaneLedger?.summary?.currentOrNewSatisfiedCount ??
  latestSeasonLaneLedger?.currentOrNewSeasonSatisfiedCount ??
  latestSeasonLaneLedger?.currentOrNewSatisfiedCount ??
  null;

const projectedCurrentCount = projectedKnownCurrentOrNewSlugs.length;
const diagnosticCurrentCount = materializedDiagnosticCurrentOrNewSlugs.length;

const lifecycleGap = ledgerCurrentCount === null
  ? "ledger_current_or_new_count_not_found"
  : ledgerCurrentCount < projectedCurrentCount
    ? "ledger_does_not_count_diagnostic_current_or_new_state"
    : "ledger_appears_to_count_current_or_new_state";

const cyp2Blocked = {
  competitionSlug: "cyp.2",
  status: "blocked",
  reason: "adult Β΄ Κατηγορίας route has phase/carryover points that fail plain 3W+D; youth false positives were rejected",
  requiredNext: "phase/carryover-aware parser or governed evidence before acceptance"
};

const knownCurrentOrNewBlocked = [
  {
    competitionSlug: "nor.2",
    status: "blocked",
    reason: "Åsane points arithmetic failed; likely deduction but governed evidence missing"
  },
  cyp2Blocked
];

const summary = {
  status: groupSummaries.every(g => g.validationStatus === "passed") ? "passed" : "blocked",
  runner: "current_or_new_lifecycle_reconciliation_board",
  generatedAtUtc: new Date().toISOString(),
  currentDiagnosticState: {
    stateDir: STATE_DIR,
    stateRowsFiles,
    materializedDiagnosticCurrentOrNewSlugCount: diagnosticCurrentCount,
    materializedDiagnosticCurrentOrNewRowCount,
    materializedDiagnosticCurrentOrNewSlugs,
    groupSummaries
  },
  projectedKnownCurrentOrNew: {
    knownExistingCurrentOrNewOutsideThisState,
    projectedKnownCurrentOrNewSlugCount: projectedCurrentCount,
    projectedKnownCurrentOrNewSlugs
  },
  lifecycleArtifacts: {
    latestSeasonLaneLedgerPath,
    latestPermanentLifecyclePath,
    latestPrioritizedLifecyclePath,
    latestSeasonLaneLedgerSummary: pick(latestSeasonLaneLedger?.summary ?? latestSeasonLaneLedger, [
      "routeConfiguredLeagueSlugCount",
      "previousCompletedSatisfiedCount",
      "previousCompletedVerifiedRowsCount",
      "currentOrNewSeasonSatisfiedCount",
      "currentOrNewSatisfiedCount",
      "nextSeasonStartDateSatisfiedCount",
      "missingPreviousCompletedCount",
      "missingCurrentOrNewSeasonCount",
      "missingNextSeasonStartDateCount",
      "startDateEvidenceTargetCount"
    ]),
    latestPermanentLifecycleSummary: pick(latestPermanentLifecycle?.summary ?? latestPermanentLifecycle, [
      "previousCompletedSatisfiedCount",
      "currentOrNewSeasonSatisfiedCount",
      "currentOrNewSatisfiedCount",
      "nextSeasonStartDateSatisfiedCount",
      "permanentDueTaskCount",
      "duePreviousCompletedStandingsCount",
      "dueCurrentOrNewSeasonStandingsCount",
      "dueNextSeasonStartDateCount"
    ]),
    latestPrioritizedLifecycleSummary: pick(latestPrioritizedLifecycle?.summary ?? latestPrioritizedLifecycle, [
      "inputDueTaskCount",
      "acceptedExecutableTaskCount",
      "standingsExpansionTargetCount",
      "currentOrNewSeasonTargetCount",
      "startDateEvidenceTargetCount",
      "highValueAcceptedTaskCount",
      "uefaLikeAcceptedTaskCount"
    ])
  },
  reconciliation: {
    ledgerCurrentOrNewSatisfiedCount: ledgerCurrentCount,
    diagnosticCurrentOrNewSatisfiedCount: diagnosticCurrentCount,
    projectedKnownCurrentOrNewSatisfiedCount: projectedCurrentCount,
    lifecycleGap,
    needsLifecycleIntegration: lifecycleGap !== "ledger_appears_to_count_current_or_new_state",
    exactIntegrationRequirement: "season-lane ledger and permanent lifecycle planner must load data/football-truth/_state/current-or-new-season-standings-candidates/*.jsonl as diagnostic current_or_new state, dedupe by competitionSlug, and preserve validation gates"
  },
  blockersStillOpen: knownCurrentOrNewBlocked,
  recommendedNextLane: lifecycleGap !== "ledger_appears_to_count_current_or_new_state"
    ? {
        lane: "integrate_current_or_new_diagnostic_state_loader_into_lifecycle_ledger",
        reason: "diagnostic current_or_new coverage exists but lifecycle counts may not reflect it",
        expectedResult: `current_or_new lifecycle satisfied count should become at least ${projectedCurrentCount}`
      }
    : {
        lane: "resume_high_value_previous_completed_or_start_date_expansion",
        reason: "current_or_new diagnostic state is already reflected in lifecycle counts"
      },
  policy: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    browserExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    stateLaneWriteExecutedNowCount: 0
  },
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
};

writeJson(OUT, summary);

console.log(JSON.stringify({
  status: summary.status,
  currentDiagnosticState: {
    materializedDiagnosticCurrentOrNewSlugCount: summary.currentDiagnosticState.materializedDiagnosticCurrentOrNewSlugCount,
    materializedDiagnosticCurrentOrNewRowCount: summary.currentDiagnosticState.materializedDiagnosticCurrentOrNewRowCount,
    materializedDiagnosticCurrentOrNewSlugs: summary.currentDiagnosticState.materializedDiagnosticCurrentOrNewSlugs
  },
  projectedKnownCurrentOrNew: summary.projectedKnownCurrentOrNew,
  reconciliation: summary.reconciliation,
  blockersStillOpen: summary.blockersStillOpen,
  recommendedNextLane: summary.recommendedNextLane,
  output: OUT,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
}, null, 2));

if (summary.status !== "passed") process.exit(1);
