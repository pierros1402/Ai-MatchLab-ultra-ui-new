import fs from "fs";
import path from "path";
import crypto from "crypto";

export function sha256Text(text) {
  return crypto.createHash("sha256").update(String(text ?? "")).digest("hex");
}

export function readJsonlFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

export function loadCurrentOrNewDiagnosticState({
  root = process.cwd(),
  stateDir = "data/football-truth/_state/current-or-new-season-standings-candidates",
  knownOutsideState = ["geo.1"]
} = {}) {
  const absDir = path.join(root, stateDir);
  const rowsFiles = fs.existsSync(absDir)
    ? fs.readdirSync(absDir).filter(file => file.endsWith(".jsonl")).sort().map(file => path.posix.join(stateDir, file))
    : [];

  const rows = [];
  for (const rel of rowsFiles) {
    for (const row of readJsonlFile(path.join(root, rel))) rows.push({ ...row, stateRowsFile: rel });
  }

  const groups = {};
  for (const row of rows) {
    if (!groups[row.competitionSlug]) groups[row.competitionSlug] = [];
    groups[row.competitionSlug].push(row);
  }

  const groupSummaries = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([competitionSlug, group]) => {
    const blocks = [];
    const teamSet = new Set();
    let totalPlayed = 0;
    let totalPoints = 0;

    for (const row of group) {
      teamSet.add(row.teamName);
      totalPlayed += Number(row.played ?? 0);
      totalPoints += Number(row.points ?? 0);

      if (row.seasonScope !== "current_or_new") blocks.push(`${row.teamName}_seasonScope_${row.seasonScope}`);
      if (row.validationStatus && row.validationStatus !== "passed") blocks.push(`${row.teamName}_validationStatus_${row.validationStatus}`);
      if (row.qualityGateStatus && row.qualityGateStatus !== "verified") blocks.push(`${row.teamName}_qualityGateStatus_${row.qualityGateStatus}`);
      if (row.played !== row.won + row.drawn + row.lost) blocks.push(`${row.teamName}_wdl_failed`);
      if (row.points !== row.won * 3 + row.drawn) blocks.push(`${row.teamName}_points_failed`);
      if (row.goalDifference !== row.goalsFor - row.goalsAgainst) blocks.push(`${row.teamName}_gd_failed`);
    }

    if (teamSet.size !== group.length) blocks.push("duplicate_team_names");

    return {
      competitionSlug,
      rowCount: group.length,
      seasonLabels: [...new Set(group.map(row => row.seasonLabel))].sort(),
      sourceFamilies: [...new Set(group.map(row => row.sourceFamily))].sort(),
      totalPlayed,
      totalPoints,
      teamSignals: group.slice(0, 8).map(row => row.teamName),
      duplicateGuardHash: sha256Text(group.map(row => `${row.competitionSlug}|${row.position}|${row.teamName}|${row.played}|${row.points}`).join("\n")).slice(0, 24),
      validationStatus: blocks.length ? "blocked" : "passed",
      blocks: [...new Set(blocks)].slice(0, 80)
    };
  });

  const materializedDiagnosticCurrentOrNewSlugs = Object.keys(groups).sort();
  const projectedKnownCurrentOrNewSlugs = [...new Set([...knownOutsideState, ...materializedDiagnosticCurrentOrNewSlugs])].sort();

  return {
    stateDir,
    stateRowsFiles: rowsFiles,
    materializedDiagnosticCurrentOrNewSlugCount: materializedDiagnosticCurrentOrNewSlugs.length,
    materializedDiagnosticCurrentOrNewRowCount: rows.length,
    materializedDiagnosticCurrentOrNewSlugs,
    knownExistingCurrentOrNewOutsideThisState: knownOutsideState,
    projectedKnownCurrentOrNewSlugCount: projectedKnownCurrentOrNewSlugs.length,
    projectedKnownCurrentOrNewSlugs,
    groupSummaries,
    rows,
    validationStatus: groupSummaries.every(group => group.validationStatus === "passed") ? "passed" : "blocked",
    blocks: groupSummaries.flatMap(group => group.blocks.map(block => `${group.competitionSlug}:${block}`)).slice(0, 120)
  };
}
