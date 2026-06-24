import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const inputPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-official-html-candidates-extraction-probe-${today}`, `football-truth-global-batch001-official-html-candidates-extraction-probe-${today}.json`);
const inputRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-official-html-candidates-extraction-probe-${today}`, `football-truth-global-batch001-official-html-candidates-extraction-probe-rows-${today}.jsonl`);
const inputVerificationPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-official-html-candidates-extraction-probe-verification-${today}`, `football-truth-global-batch001-official-html-candidates-extraction-probe-verification-${today}.json`);

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-official-html-custom-salvage-${today}`);
const outPath = path.join(outDir, `football-truth-global-batch001-official-html-custom-salvage-${today}.json`);
const rowsPath = path.join(outDir, `football-truth-global-batch001-official-html-custom-salvage-rows-${today}.jsonl`);

function rel(file) { return path.relative(root, file).replaceAll("\\", "/"); }
function parseJsonl(text) { return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }
function shaText(text) { return crypto.createHash("sha256").update(String(text || "")).digest("hex"); }

function strip(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function norm(value) {
  return strip(value).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim();
}

function parseIntLoose(value) {
  const s = strip(value).replace(/[^\d\-+]/g, "");
  if (!s || s === "-" || s === "+") return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function parseSignedPrefix(value) {
  const m = strip(value).match(/[+\-]?\d+/);
  if (!m) return null;
  const n = Number.parseInt(m[0], 10);
  return Number.isFinite(n) ? n : null;
}

function rowArithmetic(row) {
  if (row.goalDifference == null && row.goalsFor != null && row.goalsAgainst != null) {
    row.goalDifference = row.goalsFor - row.goalsAgainst;
  }

  row.playedArithmeticPassed = row.played != null && row.wins != null && row.draws != null && row.losses != null
    ? row.played === row.wins + row.draws + row.losses
    : null;

  row.goalDifferenceArithmeticPassed = row.goalsFor != null && row.goalsAgainst != null && row.goalDifference != null
    ? row.goalDifference === row.goalsFor - row.goalsAgainst
    : null;

  row.pointsArithmeticPassed = row.wins != null && row.draws != null && row.points != null
    ? row.points === row.wins * 3 + row.draws
    : null;

  row.arithmeticPassed =
    row.playedArithmeticPassed !== false &&
    row.goalDifferenceArithmeticPassed !== false &&
    row.pointsArithmeticPassed !== false &&
    (row.playedArithmeticPassed === true || row.goalDifferenceArithmeticPassed === true || row.pointsArithmeticPassed === true);

  return row;
}

function mk(row, source, parsedBy) {
  if (!row || !row.teamName || row.teamName.includes("{{")) return null;
  return rowArithmetic({
    parsedBy,
    position: row.position,
    teamName: strip(row.teamName),
    played: row.played,
    wins: row.wins,
    draws: row.draws,
    losses: row.losses,
    goalsFor: row.goalsFor ?? null,
    goalsAgainst: row.goalsAgainst ?? null,
    goalDifference: row.goalDifference ?? null,
    points: row.points,
    rawCells: source.rawCells || []
  });
}

function parseAus(source) {
  const c = source.rawCells || [];
  const first = strip(c[0]);
  const m = first.match(/^(\d+)\s+(.+)$/);
  if (!m || c.length < 6) return null;
  return mk({
    position: parseIntLoose(m[1]),
    teamName: m[2],
    played: parseIntLoose(c[1]),
    wins: parseIntLoose(c[2]),
    draws: parseIntLoose(c[3]),
    losses: parseIntLoose(c[4]),
    points: parseIntLoose(c[5])
  }, source, "aus_position_team_combined_cell");
}

function parseIta2(source) {
  const c = source.rawCells || [];
  if (c.length < 8) return null;
  return mk({
    position: parseIntLoose(c[0]),
    teamName: c[1],
    points: parseIntLoose(c[2]),
    played: parseIntLoose(c[3]),
    wins: parseIntLoose(c[4]),
    draws: parseIntLoose(c[5]),
    losses: parseIntLoose(c[6]),
    goalDifference: parseIntLoose(c[7])
  }, source, "ita2_points_before_played_layout");
}

function parseBih1(source) {
  const c = source.rawCells || [];
  if (c.length < 7) return null;
  return mk({
    position: parseIntLoose(c[0]),
    teamName: c[1],
    played: parseIntLoose(c[2]),
    wins: parseIntLoose(c[3]),
    draws: parseIntLoose(c[4]),
    losses: parseIntLoose(c[5]),
    points: parseIntLoose(c[6])
  }, source, "bih1_pos_team_played_wdl_points_layout");
}

function parseMne1(source) {
  const c = source.rawCells || [];
  if (c.length < 10) return null;
  return mk({
    position: parseIntLoose(c[0]),
    teamName: c[1],
    played: parseIntLoose(c[2]),
    wins: parseIntLoose(c[3]),
    draws: parseIntLoose(c[4]),
    losses: parseIntLoose(c[5]),
    goalsFor: parseIntLoose(c[6]),
    goalsAgainst: parseIntLoose(c[7]),
    goalDifference: parseSignedPrefix(c[8]),
    points: parseIntLoose(c[9])
  }, source, "mne1_signed_goal_difference_compound_cell");
}

function passThrough(source) {
  return mk({
    position: source.position,
    teamName: source.teamName,
    played: source.played,
    wins: source.wins,
    draws: source.draws,
    losses: source.losses,
    goalsFor: source.goalsFor,
    goalsAgainst: source.goalsAgainst,
    goalDifference: source.goalDifference,
    points: source.points
  }, source, "pass_through_existing_parser");
}

function parseRow(slug, source) {
  if (slug === "aus.1" || slug === "aus.2") return parseAus(source);
  if (slug === "ita.2") return parseIta2(source);
  if (slug === "bih.1") return parseBih1(source);
  if (slug === "mne.1") return parseMne1(source);
  return passThrough(source);
}

function fingerprint(parsedRows) {
  return shaText(parsedRows.map(row => `${norm(row.teamName)}:${row.played}:${row.wins}:${row.draws}:${row.losses}:${row.points}`).join("|"));
}

await fs.mkdir(outDir, { recursive: true });

const blocks = [];
const input = JSON.parse(await fs.readFile(inputPath, "utf8"));
const inputRows = parseJsonl(await fs.readFile(inputRowsPath, "utf8"));
const inputVerification = JSON.parse(await fs.readFile(inputVerificationPath, "utf8"));

if (input.status !== "passed") blocks.push("input_not_passed");
if (inputVerification.status !== "passed") blocks.push("input_verification_not_passed");

const targets = inputRows.filter(row => row.extractionProbeStatus === "extraction_review_required");
if (targets.length !== 11) blocks.push("target_rows_not_11");

const preliminaryRows = targets.map(target => {
  const parsedRows = (target.standingsRows || [])
    .map(source => parseRow(target.slug, source))
    .filter(Boolean);

  const duplicateTeamNameCount = parsedRows.length - new Set(parsedRows.map(row => norm(row.teamName))).size;
  const arithmeticPassedRowCount = parsedRows.filter(row => row.arithmeticPassed).length;
  const arithmeticFailedRowCount = parsedRows.filter(row => row.arithmeticPassed === false).length;
  const playedValues = parsedRows.map(row => row.played).filter(value => value != null);
  const pointsValues = parsedRows.map(row => row.points).filter(value => value != null);
  const minPlayed = playedValues.length ? Math.min(...playedValues) : null;
  const maxPlayed = playedValues.length ? Math.max(...playedValues) : null;
  const allRowsZeroPlayed = parsedRows.length > 0 && playedValues.length === parsedRows.length && playedValues.every(value => value === 0);
  const allRowsZeroPoints = parsedRows.length > 0 && pointsValues.length === parsedRows.length && pointsValues.every(value => value === 0);

  let customSalvageStatus = "custom_salvage_no_proof";
  if (parsedRows.length >= 8 && duplicateTeamNameCount === 0 && arithmeticPassedRowCount >= Math.ceil(parsedRows.length * 0.7) && maxPlayed != null && maxPlayed > 0) {
    customSalvageStatus = "custom_salvage_proof_shape_passed_nonzero_needs_season_league_review";
  } else if (parsedRows.length >= 8 && duplicateTeamNameCount === 0 && allRowsZeroPlayed && allRowsZeroPoints) {
    customSalvageStatus = "custom_salvage_proof_shape_passed_zero_played_needs_start_date_lane";
  } else if (parsedRows.length >= 4) {
    customSalvageStatus = "custom_salvage_review_required";
  }

  return {
    slug: target.slug,
    displayName: target.displayName,
    sourceFinalUrl: target.finalUrl,
    sourceTitle: target.title,
    inputExtractionProbeStatus: target.extractionProbeStatus,
    originalExtractedStandingRowCount: target.extractedStandingRowCount,
    originalArithmeticPassedRowCount: target.arithmeticPassedRowCount,
    customParsedStandingRowCount: parsedRows.length,
    arithmeticPassedRowCount,
    arithmeticFailedRowCount,
    duplicateTeamNameCount,
    minPlayed,
    maxPlayed,
    allRowsZeroPlayed,
    allRowsZeroPoints,
    customSalvageStatus,
    parsedRowsFingerprint: fingerprint(parsedRows),
    sampleParsedRows: parsedRows.slice(0, 8),
    parsedRows,
    acceptedNow: false,
    canonicalWriteExecutedNow: false,
    lifecycleWriteExecutedNow: false,
    productionWriteExecutedNow: false,
    truthAssertionExecutedNow: false,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  };
});

const fingerprintGroups = {};
for (const row of preliminaryRows) {
  if (!row.parsedRowsFingerprint || row.customParsedStandingRowCount < 4) continue;
  fingerprintGroups[row.parsedRowsFingerprint] ||= [];
  fingerprintGroups[row.parsedRowsFingerprint].push(row.slug);
}

const rows = preliminaryRows.map(row => {
  const collisionSlugs = fingerprintGroups[row.parsedRowsFingerprint] || [];
  const hasCollision = collisionSlugs.length > 1;
  let finalStatus = row.customSalvageStatus;

  if (hasCollision && finalStatus === "custom_salvage_proof_shape_passed_nonzero_needs_season_league_review") {
    finalStatus = "custom_salvage_proof_shape_passed_nonzero_with_collision_needs_league_identity_review";
  }

  return {
    ...row,
    customSalvageStatus: finalStatus,
    collisionGroupSlugs: collisionSlugs,
    hasSameRowsCollision: hasCollision,
    nextAction:
      finalStatus.includes("proof_shape_passed_nonzero")
        ? "season/league identity review required before any candidate write"
        : finalStatus.includes("zero_played")
          ? "start-date/lifecycle lane required"
          : "park or custom parser review; not countable"
  };
});

const statusCounts = rows.reduce((acc, row) => {
  acc[row.customSalvageStatus] = (acc[row.customSalvageStatus] || 0) + 1;
  return acc;
}, {});

const collisionGroups = Object.fromEntries(
  Object.entries(fingerprintGroups)
    .filter(([, slugs]) => slugs.length > 1)
    .map(([key, slugs]) => [key, slugs])
);

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "global_batch001_official_html_custom_salvage",
  contractVersion: 1,
  generatedAt: new Date().toISOString(),
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  inputPath: rel(inputPath),
  inputRowsPath: rel(inputRowsPath),
  inputVerificationPath: rel(inputVerificationPath),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    targetCount: targets.length,
    customSalvageStatusCounts: statusCounts,
    proofShapePassedNonzeroSlugs: rows.filter(row => row.customSalvageStatus === "custom_salvage_proof_shape_passed_nonzero_needs_season_league_review").map(row => row.slug),
    proofShapePassedNonzeroWithCollisionSlugs: rows.filter(row => row.customSalvageStatus === "custom_salvage_proof_shape_passed_nonzero_with_collision_needs_league_identity_review").map(row => row.slug),
    proofShapePassedZeroPlayedSlugs: rows.filter(row => row.customSalvageStatus === "custom_salvage_proof_shape_passed_zero_played_needs_start_date_lane").map(row => row.slug),
    reviewRequiredSlugs: rows.filter(row => row.customSalvageStatus === "custom_salvage_review_required").map(row => row.slug),
    noProofSlugs: rows.filter(row => row.customSalvageStatus === "custom_salvage_no_proof").map(row => row.slug),
    collisionGroups,
    acceptedNowCount: 0,
    nextRecommendedLane: "season/league identity review for proof-shape rows; collision groups cannot be counted until resolved"
  },
  rows,
  blocks
};

await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsPath, rows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  guardrails: report.guardrails,
  summary: report.summary,
  rows: rows.map(row => ({
    slug: row.slug,
    customSalvageStatus: row.customSalvageStatus,
    customParsedStandingRowCount: row.customParsedStandingRowCount,
    arithmeticPassedRowCount: row.arithmeticPassedRowCount,
    arithmeticFailedRowCount: row.arithmeticFailedRowCount,
    duplicateTeamNameCount: row.duplicateTeamNameCount,
    minPlayed: row.minPlayed,
    maxPlayed: row.maxPlayed,
    hasSameRowsCollision: row.hasSameRowsCollision,
    collisionGroupSlugs: row.collisionGroupSlugs,
    sampleParsedRows: row.sampleParsedRows.slice(0, 4)
  })),
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
