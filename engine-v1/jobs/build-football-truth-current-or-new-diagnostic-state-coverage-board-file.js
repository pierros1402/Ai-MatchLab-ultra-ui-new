import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const STATE_DIR = "data/football-truth/_state/current-or-new-season-standings-candidates";
const OUT_DIR = `data/football-truth/_diagnostics/current-or-new-diagnostic-state-coverage-board-${DATE}`;
const OUT = `${OUT_DIR}/current-or-new-diagnostic-state-coverage-board-${DATE}.json`;

function abs(p) { return path.join(ROOT, p); }
function readJsonl(p) { return fs.readFileSync(abs(p), "utf8").split(/\r?\n/).filter(Boolean).map(x => JSON.parse(x)); }
function writeJson(p, v) { fs.mkdirSync(path.dirname(abs(p)), { recursive: true }); fs.writeFileSync(abs(p), JSON.stringify(v, null, 2) + "\n"); }
function sha256Text(t) { return crypto.createHash("sha256").update(t).digest("hex"); }

const files = fs.existsSync(abs(STATE_DIR))
  ? fs.readdirSync(abs(STATE_DIR)).filter(f => f.endsWith(".jsonl")).sort().map(f => `${STATE_DIR}/${f}`)
  : [];

const rows = [];
for (const file of files) {
  for (const row of readJsonl(file)) rows.push({ ...row, stateRowsFile: file });
}

const groups = {};
for (const row of rows) {
  const slug = row.competitionSlug;
  if (!groups[slug]) groups[slug] = [];
  groups[slug].push(row);
}

const groupSummaries = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([slug, group]) => {
  const blocks = [];
  const seenTeams = new Set();
  let totalPlayed = 0;
  let totalPoints = 0;

  for (const row of group) {
    seenTeams.add(row.teamName);
    totalPlayed += Number(row.played ?? 0);
    totalPoints += Number(row.points ?? 0);
    if (row.played !== row.won + row.drawn + row.lost) blocks.push(`${row.teamName}_wdl_failed`);
    if (row.points !== row.won * 3 + row.drawn) blocks.push(`${row.teamName}_points_failed`);
    if (row.goalDifference !== row.goalsFor - row.goalsAgainst) blocks.push(`${row.teamName}_gd_failed`);
    if (row.seasonScope !== "current_or_new") blocks.push(`${row.teamName}_seasonScope_${row.seasonScope}`);
  }

  if (seenTeams.size !== group.length) blocks.push("duplicate_team_names");

  return {
    competitionSlug: slug,
    rowCount: group.length,
    seasonLabels: [...new Set(group.map(r => r.seasonLabel))].sort(),
    sourceFamilies: [...new Set(group.map(r => r.sourceFamily))].sort(),
    totalPlayed,
    totalPoints,
    teamSignals: group.slice(0, 8).map(r => r.teamName),
    duplicateGuardHash: sha256Text(group.map(r => `${r.competitionSlug}|${r.position}|${r.teamName}|${r.played}|${r.points}`).join("\n")).slice(0, 24),
    validationStatus: blocks.length ? "blocked" : "passed",
    blocks: [...new Set(blocks)].slice(0, 40)
  };
});

const materializedSlugs = Object.keys(groups).sort();
const knownExistingCurrentOrNewOutsideThisState = ["geo.1"];
const projectedKnownCurrentOrNewSlugs = [...new Set([...knownExistingCurrentOrNewOutsideThisState, ...materializedSlugs])].sort();

const output = {
  status: groupSummaries.every(g => g.validationStatus === "passed") ? "passed" : "blocked",
  runner: "current_or_new_diagnostic_state_coverage_board",
  generatedAtUtc: new Date().toISOString(),
  stateDir: STATE_DIR,
  stateRowsFiles: files,
  materializedDiagnosticCurrentOrNewSlugCount: materializedSlugs.length,
  materializedDiagnosticCurrentOrNewRowCount: rows.length,
  materializedDiagnosticCurrentOrNewSlugs: materializedSlugs,
  knownExistingCurrentOrNewOutsideThisState,
  projectedKnownCurrentOrNewSlugCount: projectedKnownCurrentOrNewSlugs.length,
  projectedKnownCurrentOrNewSlugs,
  groupSummaries,
  blocks: groupSummaries.flatMap(g => g.blocks.map(b => `${g.competitionSlug}:${b}`)).slice(0, 80),
  policy: {
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    stateLaneWriteExecutedNowCount: 0
  },
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
};

writeJson(OUT, output);

console.log(JSON.stringify({
  status: output.status,
  materializedDiagnosticCurrentOrNewSlugCount: output.materializedDiagnosticCurrentOrNewSlugCount,
  materializedDiagnosticCurrentOrNewRowCount: output.materializedDiagnosticCurrentOrNewRowCount,
  materializedDiagnosticCurrentOrNewSlugs: output.materializedDiagnosticCurrentOrNewSlugs,
  projectedKnownCurrentOrNewSlugCount: output.projectedKnownCurrentOrNewSlugCount,
  projectedKnownCurrentOrNewSlugs: output.projectedKnownCurrentOrNewSlugs,
  groupSummaries: output.groupSummaries,
  output: OUT,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
}, null, 2));

if (output.status !== "passed") process.exit(1);
