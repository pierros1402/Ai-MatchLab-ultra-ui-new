import fs from "fs";
import path from "path";
import crypto from "crypto";

export function sha256Text(text) {
  return crypto.createHash("sha256").update(String(text ?? "")).digest("hex");
}

export function readJsonlFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

function walkAbs(dir, predicate, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkAbs(full, predicate, out);
    else if (predicate(full)) out.push(full);
  }
  return out;
}

function latestAbs(root, fileRegex) {
  const files = walkAbs(path.join(root, "data/football-truth/_diagnostics"), p => fileRegex.test(path.basename(p)));
  if (!files.length) return null;
  return files.map(p => ({ p, mtimeMs: fs.statSync(p).mtimeMs })).sort((a, b) => b.mtimeMs - a.mtimeMs)[0].p;
}

export function loadPreviousCompletedDiagnosticProofState({
  root = process.cwd(),
  expectedProofSlugs = ["eng.1"]
} = {}) {
  const latestRowsAbs = latestAbs(root, /^eng1-ita1-previous-completed-extractor-proof-rows-\d{4}-\d{2}-\d{2}\.jsonl$/);
  const rows = latestRowsAbs ? readJsonlFile(latestRowsAbs) : [];
  const proofRows = rows.filter(row =>
    expectedProofSlugs.includes(row.competitionSlug) &&
    row.seasonScope === "previous_completed" &&
    row.validationStatus === "passed" &&
    row.qualityGateStatus === "verified"
  );

  const groups = {};
  for (const row of proofRows) {
    if (!groups[row.competitionSlug]) groups[row.competitionSlug] = [];
    groups[row.competitionSlug].push(row);
  }

  const groupSummaries = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([competitionSlug, group]) => {
    const blocks = [];
    const teamSet = new Set();
    let totalPlayed = 0;
    let totalPoints = 0;
    let maxPlayed = 0;
    let maxPoints = 0;

    const expectedRows = competitionSlug === "eng.1" ? 20 : null;
    if (expectedRows !== null && group.length !== expectedRows) blocks.push(`row_count_${group.length}_expected_${expectedRows}`);

    for (const row of group) {
      teamSet.add(row.teamName);
      totalPlayed += Number(row.played ?? 0);
      totalPoints += Number(row.points ?? 0);
      maxPlayed = Math.max(maxPlayed, Number(row.played ?? 0));
      maxPoints = Math.max(maxPoints, Number(row.points ?? 0));
      if (row.played !== row.won + row.drawn + row.lost) blocks.push(`${row.teamName}_wdl_failed`);
      if (row.points !== row.won * 3 + row.drawn) blocks.push(`${row.teamName}_points_failed`);
      if (row.goalDifference !== row.goalsFor - row.goalsAgainst) blocks.push(`${row.teamName}_gd_failed`);
    }

    if (teamSet.size !== group.length) blocks.push("duplicate_team_names");
    if (totalPlayed <= 0 || totalPoints <= 0 || maxPlayed <= 0 || maxPoints <= 0) blocks.push("non_trivial_previous_completed_gate_failed");

    const expectedSignals = competitionSlug === "eng.1"
      ? ["Arsenal", "Manchester City", "Manchester United", "Liverpool", "Chelsea", "Aston Villa"]
      : [];

    const missingSignals = expectedSignals.filter(signal => !group.some(row => String(row.teamName).toLowerCase().includes(signal.toLowerCase())));
    if (missingSignals.length) blocks.push(`missing_expected_team_signals_${missingSignals.join("_")}`);

    return {
      competitionSlug,
      rowCount: group.length,
      seasonLabels: [...new Set(group.map(row => row.seasonLabel))].sort(),
      sourceFamilies: [...new Set(group.map(row => row.sourceFamily))].sort(),
      totalPlayed,
      totalPoints,
      maxPlayed,
      maxPoints,
      teamSignals: group.slice(0, 10).map(row => row.teamName),
      expectedSignals,
      missingSignals,
      duplicateGuardHash: sha256Text(group.map(row => `${row.competitionSlug}|${row.position}|${row.teamName}|${row.played}|${row.points}`).join("\n")).slice(0, 24),
      validationStatus: blocks.length ? "blocked" : "passed",
      blocks: [...new Set(blocks)]
    };
  });

  const verifiedSlugs = groupSummaries.filter(g => g.validationStatus === "passed").map(g => g.competitionSlug).sort();
  const verifiedRows = proofRows.filter(row => verifiedSlugs.includes(row.competitionSlug));

  return {
    latestRowsPath: latestRowsAbs ? path.relative(root, latestRowsAbs).replace(/\\/g, "/") : null,
    expectedProofSlugs,
    verifiedPreviousCompletedProofSlugCount: verifiedSlugs.length,
    verifiedPreviousCompletedProofRowCount: verifiedRows.length,
    verifiedPreviousCompletedProofSlugs: verifiedSlugs,
    groupSummaries,
    rows: verifiedRows,
    validationStatus: expectedProofSlugs.every(slug => verifiedSlugs.includes(slug)) ? "passed" : "blocked",
    blocks: [
      ...expectedProofSlugs.filter(slug => !verifiedSlugs.includes(slug)).map(slug => `missing_verified_proof_slug_${slug}`),
      ...groupSummaries.flatMap(g => g.blocks.map(block => `${g.competitionSlug}:${block}`))
    ]
  };
}
