import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const materializationPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-post-rollup-proof-extraction-materialization-${today}`, `football-truth-post-rollup-proof-extraction-materialization-${today}.json`);
const materializationRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-post-rollup-proof-extraction-materialization-${today}`, `football-truth-post-rollup-proof-extraction-materialization-rows-${today}.jsonl`);
const reviewOnlyCandidatesDir = path.join(root, "data", "football-truth", "_review-only-candidates", `official-standings-${today}`, "candidates");

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-post-rollup-proof-cross-collision-fix-${today}`);
const outPath = path.join(outDir, `football-truth-post-rollup-proof-cross-collision-fix-${today}.json`);
const rowsPath = path.join(outDir, `football-truth-post-rollup-proof-cross-collision-fix-rows-${today}.jsonl`);

function rel(file) { return path.relative(root, file).replaceAll("\\", "/"); }
function parseJsonl(text) { return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }
function shaText(text) { return crypto.createHash("sha256").update(String(text || "")).digest("hex"); }
function norm(value) { return String(value || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/&[#a-z0-9]+;/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim(); }
function uniq(values) { return [...new Set((values || []).filter(Boolean))]; }
function sorted(values) { return uniq(values).sort((a,b) => a.localeCompare(b)); }

function isHeaderLike(row) {
  const n = norm(row?.teamName || "");
  const noData = row?.position == null && row?.played == null && row?.wins == null && row?.draws == null && row?.losses == null && row?.points == null;
  if (noData) return true;
  return ["team", "club", "klub", "tim", "الفريق", "թիմեր"].includes(n);
}

function normalizedRows(rows) {
  return (rows || [])
    .filter(row => row && !isHeaderLike(row))
    .map(row => ({
      position: row.position ?? null,
      teamNameNorm: norm(row.teamName || ""),
      teamName: row.teamName,
      played: row.played ?? null,
      wins: row.wins ?? null,
      draws: row.draws ?? null,
      losses: row.losses ?? null,
      goalsFor: row.goalsFor ?? null,
      goalsAgainst: row.goalsAgainst ?? null,
      goalDifference: row.goalDifference ?? null,
      points: row.points ?? null,
      arithmeticPassed: row.arithmeticPassed === true
    }))
    .filter(row => row.teamNameNorm && row.teamNameNorm.length >= 2);
}

function fingerprintRows(rows) {
  return shaText(normalizedRows(rows)
    .map(row => `${row.position ?? ""}|${row.teamNameNorm}|${row.played ?? ""}|${row.wins ?? ""}|${row.draws ?? ""}|${row.losses ?? ""}|${row.goalsFor ?? ""}|${row.goalsAgainst ?? ""}|${row.goalDifference ?? ""}|${row.points ?? ""}`)
    .join("\n"));
}

function metrics(rows) {
  const clean = normalizedRows(rows);
  const duplicateTeamNameCount = clean.length - new Set(clean.map(row => row.teamNameNorm)).size;
  const arithmeticPassedRowCount = clean.filter(row => row.arithmeticPassed).length;
  const arithmeticFailedRowCount = clean.filter(row => row.arithmeticPassed === false).length;
  const playedValues = clean.map(row => row.played).filter(v => v != null);
  return {
    normalizedStandingRowCount: clean.length,
    arithmeticPassedRowCount,
    arithmeticFailedRowCount,
    duplicateTeamNameCount,
    minPlayed: playedValues.length ? Math.min(...playedValues) : null,
    maxPlayed: playedValues.length ? Math.max(...playedValues) : null,
    normalizedRows: clean
  };
}

async function loadExistingCandidates() {
  const out = [];
  const files = (await fs.readdir(reviewOnlyCandidatesDir)).filter(file => file.endsWith(".json")).sort();
  for (const file of files) {
    const candidatePath = path.join(reviewOnlyCandidatesDir, file);
    const candidate = JSON.parse(await fs.readFile(candidatePath, "utf8"));
    const rows = candidate.standings?.rows || [];
    const m = metrics(rows);
    out.push({
      slug: candidate.slug,
      candidatePath: rel(candidatePath),
      normalizedStandingRowCount: m.normalizedStandingRowCount,
      rowFingerprint: fingerprintRows(rows),
      normalizedRows: m.normalizedRows
    });
  }
  return out;
}

await fs.mkdir(outDir, { recursive: true });

const blocks = [];
const materialization = JSON.parse(await fs.readFile(materializationPath, "utf8"));
const materializationRows = parseJsonl(await fs.readFile(materializationRowsPath, "utf8"));
const existingCandidates = await loadExistingCandidates();

if (materialization.status !== "passed") blocks.push("materialization_not_passed");
if (existingCandidates.length !== 3) blocks.push("existing_review_candidate_count_not_3");

const rows = materializationRows.map(row => {
  const m = metrics(row.standingRows || []);
  const rowFingerprint = fingerprintRows(row.standingRows || []);
  const collisions = existingCandidates.filter(candidate => candidate.rowFingerprint === rowFingerprint);

  let correctedFinalLane = row.materializedFinalLane;
  if (row.materializedFinalLane === "materialized_proof_shape_nonzero_candidate_after_review" && collisions.length > 0) {
    correctedFinalLane = "corrected_proof_shape_nonzero_collides_with_existing_review_candidate";
  } else if (row.materializedFinalLane === "materialized_proof_shape_nonzero_candidate_after_review") {
    correctedFinalLane = "corrected_proof_shape_nonzero_no_collision_needs_season_league_review";
  } else if (row.materializedFinalLane === "materialized_extraction_review_required") {
    correctedFinalLane = "corrected_extraction_review_required";
  } else {
    correctedFinalLane = `corrected_${row.materializedFinalLane}`;
  }

  return {
    slug: row.slug,
    sourceMaterializedFinalLane: row.materializedFinalLane,
    correctedFinalLane,
    selectedUrl: row.selectedUrl,
    selectedTitle: row.selectedTitle,
    originalExtractedStandingRowCount: row.extractedStandingRowCount,
    normalizedStandingRowCount: m.normalizedStandingRowCount,
    arithmeticPassedRowCount: m.arithmeticPassedRowCount,
    arithmeticFailedRowCount: m.arithmeticFailedRowCount,
    duplicateTeamNameCount: m.duplicateTeamNameCount,
    minPlayed: m.minPlayed,
    maxPlayed: m.maxPlayed,
    rowFingerprint,
    crossCandidateCollisionSlugs: collisions.map(candidate => candidate.slug),
    crossCandidateCollisionPaths: collisions.map(candidate => candidate.candidatePath),
    normalizedSampleRows: m.normalizedRows.slice(0, 5),
    acceptedNow: false,
    reviewOnlyCandidateWriteExecutedNow: false,
    canonicalWriteExecutedNow: false,
    lifecycleWriteExecutedNow: false,
    productionWriteExecutedNow: false,
    truthAssertionExecutedNow: false,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  };
});

const correctedFinalLaneCounts = rows.reduce((acc, row) => {
  acc[row.correctedFinalLane] = (acc[row.correctedFinalLane] || 0) + 1;
  return acc;
}, {});

const report = {
  status: blocks.length ? "failed" : "passed",
  runner: "football_truth_post_rollup_proof_cross_collision_fix",
  contractVersion: 1,
  generatedAt: new Date().toISOString(),
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  inputs: {
    materializationPath: rel(materializationPath),
    materializationRowsPath: rel(materializationRowsPath),
    reviewOnlyCandidatesDir: rel(reviewOnlyCandidatesDir)
  },
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    reviewOnlyCandidateWriteExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    targetCount: rows.length,
    correctedFinalLaneCounts,
    correctedProofShapeNonzeroNoCollisionSlugs: rows.filter(row => row.correctedFinalLane === "corrected_proof_shape_nonzero_no_collision_needs_season_league_review").map(row => row.slug),
    correctedProofShapeCrossCandidateCollisionSlugs: rows.filter(row => row.correctedFinalLane === "corrected_proof_shape_nonzero_collides_with_existing_review_candidate").map(row => row.slug),
    correctedExtractionReviewRequiredSlugs: rows.filter(row => row.correctedFinalLane === "corrected_extraction_review_required").map(row => row.slug),
    correctedCrossCandidateCollisions: Object.fromEntries(rows.filter(row => row.crossCandidateCollisionSlugs.length).map(row => [row.slug, row.crossCandidateCollisionSlugs])),
    acceptedNowCount: 0,
    nextRecommendedLane: "do not write bih.2/mne.2 candidates; they collide with existing review-only candidates after header-normalized fingerprinting"
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
    sourceMaterializedFinalLane: row.sourceMaterializedFinalLane,
    correctedFinalLane: row.correctedFinalLane,
    normalizedStandingRowCount: row.normalizedStandingRowCount,
    arithmeticPassedRowCount: row.arithmeticPassedRowCount,
    crossCandidateCollisionSlugs: row.crossCandidateCollisionSlugs,
    selectedTitle: row.selectedTitle
  })),
  blocks: report.blocks
}, null, 2));

if (blocks.length) process.exitCode = 1;
