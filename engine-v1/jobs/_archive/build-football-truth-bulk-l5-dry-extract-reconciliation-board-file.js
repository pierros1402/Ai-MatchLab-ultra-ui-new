import fs from "node:fs";
import path from "node:path";

const inputPath = "data/football-truth/_diagnostics/bulk-l4-parser-ready-dry-extract-2026-06-17/bulk-l4-parser-ready-dry-extract-2026-06-17.json";
const outPath = "data/football-truth/_diagnostics/bulk-l5-dry-extract-reconciliation-board-2026-06-17/bulk-l5-dry-extract-reconciliation-board-2026-06-17.json";

function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"")); }
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }
function uniq(a){ return [...new Set(a.filter(Boolean))]; }
function n(v){ return typeof v === "number" && Number.isFinite(v) ? v : null; }
function expectedTeamCount(slug){
  const m = {
    "jpn.1": 20,
    "jpn.2": 20,
    "ned.2": 20,
    "ksa.1": 18
  };
  return m[slug] ?? null;
}

const input = readJson(inputPath);
const candidates = (input.bestRows || []).filter(r =>
  r.dryExtractStatus === "L5_bulk_dry_extract_quality_passed_requires_reconciliation" ||
  r.dryExtractStatus === "L5_bulk_dry_extract_review_required_arithmetic_or_partial_fields"
);

const rows = candidates.map(item => {
  const slug = item.competitionSlug;
  const table = item.rows || [];
  const expected = expectedTeamCount(slug);

  const rowChecks = table.map((r, idx) => {
    const played = n(r.played);
    const won = n(r.won);
    const drawn = n(r.drawn);
    const lost = n(r.lost);
    const gf = n(r.goalsFor);
    const ga = n(r.goalsAgainst);
    const gd = n(r.goalDifference);
    const pts = n(r.points);
    const rank = n(r.rank);

    const wdlAvailable = played != null && won != null && drawn != null && lost != null;
    const pointsFormulaAvailable = pts != null && won != null && drawn != null;
    const gdAvailable = gf != null && ga != null && gd != null;

    return {
      rowIndex: idx + 1,
      rank,
      team: r.team,
      corePresent: Boolean(r.team) && played != null && pts != null,
      rankSequenceOk: rank == null ? true : rank === idx + 1,
      playedEqualsWdl: wdlAvailable ? played === won + drawn + lost : null,
      pointsEqualsThreeWinsPlusDraws: pointsFormulaAvailable ? pts === (3 * won + drawn) : null,
      gdEqualsGfMinusGa: gdAvailable ? gd === gf - ga : null,
      raw: r
    };
  });

  const rowCount = table.length;
  const teams = table.map(r => String(r.team || "").trim().toLowerCase()).filter(Boolean);
  const uniqueTeamCount = new Set(teams).size;
  const expectedTeamCountOk = expected == null ? false : rowCount === expected;
  const uniqueTeamsOk = uniqueTeamCount === rowCount && rowCount > 0;
  const allCorePresent = rowChecks.every(r => r.corePresent);
  const rankSequenceOk = rowChecks.every(r => r.rankSequenceOk);

  const points = table.map(r => n(r.points));
  const nonIncreasingPointsOk = points.every((p,i) => p == null || i === 0 || points[i-1] == null || p <= points[i-1]);

  const wdlKnown = rowChecks.filter(r => r.playedEqualsWdl !== null);
  const wdlOk = wdlKnown.filter(r => r.playedEqualsWdl === true);
  const ptsKnown = rowChecks.filter(r => r.pointsEqualsThreeWinsPlusDraws !== null);
  const ptsOk = ptsKnown.filter(r => r.pointsEqualsThreeWinsPlusDraws === true);
  const gdKnown = rowChecks.filter(r => r.gdEqualsGfMinusGa !== null);
  const gdOk = gdKnown.filter(r => r.gdEqualsGfMinusGa === true);

  const arithmeticCoverageOk = wdlKnown.length >= Math.max(8, Math.floor(rowCount * 0.75)) && ptsKnown.length >= Math.max(8, Math.floor(rowCount * 0.75));
  const allKnownWdlOk = wdlKnown.length > 0 && wdlKnown.length === wdlOk.length;
  const allKnownPointsOk = ptsKnown.length > 0 && ptsKnown.length === ptsOk.length;
  const allKnownGdOk = gdKnown.length === 0 || gdKnown.length === gdOk.length;

  const checks = [
    { name:"expectedTeamCountOk", passed: expectedTeamCountOk, expectedTeamCount: expected, actualTeamCount: rowCount },
    { name:"uniqueTeamsOk", passed: uniqueTeamsOk, uniqueTeamCount, rowCount },
    { name:"allCorePresent", passed: allCorePresent },
    { name:"rankSequenceOk", passed: rankSequenceOk },
    { name:"nonIncreasingPointsOk", passed: nonIncreasingPointsOk },
    { name:"arithmeticCoverageOk", passed: arithmeticCoverageOk, wdlKnown: wdlKnown.length, ptsKnown: ptsKnown.length, rowCount },
    { name:"allKnownWdlOk", passed: allKnownWdlOk, okRows: wdlOk.length, knownRows: wdlKnown.length },
    { name:"allKnownPointsOk", passed: allKnownPointsOk, okRows: ptsOk.length, knownRows: ptsKnown.length },
    { name:"allKnownGdOk", passed: allKnownGdOk, okRows: gdOk.length, knownRows: gdKnown.length }
  ];

  const failed = checks.filter(c => !c.passed).map(c => c.name);
  let status = "blocked_l5_bulk_reconciliation_failed";
  if(failed.length === 0){
    status = "L5_bulk_reconciled_official_table_arithmetic_passed_requires_canonical_approval";
  } else if(
    expectedTeamCountOk && uniqueTeamsOk && allCorePresent && rankSequenceOk && nonIncreasingPointsOk &&
    item.dryExtractStatus === "L5_bulk_dry_extract_review_required_arithmetic_or_partial_fields"
  ){
    status = "L5_bulk_reconciliation_review_required_partial_arithmetic";
  }

  return {
    competitionSlug: slug,
    url: item.url,
    host: item.host,
    parserMethod: item.parserMethod,
    dryExtractStatus: item.dryExtractStatus,
    dryExtractedRowCount: item.dryExtractedRowCount,
    expectedTeamCount: expected,
    reconciliationStatus: status,
    failedChecks: failed,
    reconciliationChecks: checks,
    rowChecks,
    rows: table,
    canonicalCandidateWriteEligibleAfterApproval: status === "L5_bulk_reconciled_official_table_arithmetic_passed_requires_canonical_approval",
    canonicalCandidateWriteExecutedNow: false,
    productionTruthAllowed: false
  };
});

const summary = {
  status: "passed",
  inputBestDryExtractCandidateCount: candidates.length,
  reconciliationAttemptCount: rows.length,
  l5ReconciledCount: rows.filter(r => r.reconciliationStatus === "L5_bulk_reconciled_official_table_arithmetic_passed_requires_canonical_approval").length,
  reviewRequiredCount: rows.filter(r => r.reconciliationStatus === "L5_bulk_reconciliation_review_required_partial_arithmetic").length,
  blockedReconciliationCount: rows.filter(r => r.reconciliationStatus === "blocked_l5_bulk_reconciliation_failed").length,
  statusCounts: Object.entries(rows.reduce((a,r)=>{ a[r.reconciliationStatus]=(a[r.reconciliationStatus]||0)+1; return a; },{})).map(([status,count])=>({status,count})),
  l5ReconciledSlugs: rows.filter(r => r.reconciliationStatus === "L5_bulk_reconciled_official_table_arithmetic_passed_requires_canonical_approval").map(r => r.competitionSlug),
  reviewRequiredSlugs: rows.filter(r => r.reconciliationStatus === "L5_bulk_reconciliation_review_required_partial_arithmetic").map(r => r.competitionSlug),
  blockedSlugs: rows.filter(r => r.reconciliationStatus === "blocked_l5_bulk_reconciliation_failed").map(r => r.competitionSlug),
  fetchExecutedNowCount: 0,
  searchExecutedNowCount: 0,
  broadSearchExecutedNowCount: 0,
  standingsExtractionExecutedNowCount: 0,
  dryExtractExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0
};

const out = {
  generatedAtUtc: new Date().toISOString(),
  status: "passed",
  inputPath,
  summary,
  rows,
  policy: {
    localDryExtractOnly: true,
    noFetch: true,
    noSearch: true,
    noNewExtraction: true,
    noCanonicalCandidateWrite: true,
    noProductionTruth: true,
    canonicalCandidateWriteRequiresExplicitUserApproval: true
  }
};

writeJson(outPath,out);
console.log(JSON.stringify(summary,null,2));
