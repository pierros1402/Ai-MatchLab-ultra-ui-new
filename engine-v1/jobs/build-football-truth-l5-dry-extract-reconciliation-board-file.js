import fs from "node:fs";
import path from "node:path";

const inputPath = "data/football-truth/_diagnostics/l4-html-table-dry-extract-2026-06-17/l4-html-table-dry-extract-2026-06-17.json";
const outPath = "data/football-truth/_diagnostics/l5-dry-extract-reconciliation-board-2026-06-17/l5-dry-extract-reconciliation-board-2026-06-17.json";

function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"")); }
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }
function slugExpectedTeamCount(slug){
  const map = { "ksa.1": 18 };
  return map[slug] ?? null;
}
function num(v){ return typeof v === "number" && Number.isFinite(v) ? v : null; }

const input = readJson(inputPath);
const eligible = (input.rows || []).filter(r => r.dryExtractStatus === "L5_dry_extract_shape_quality_passed_requires_reconciliation");

const rows = eligible.map(item => {
  const slug = item.competitionSlug;
  const expectedTeamCount = slugExpectedTeamCount(slug);
  const table = item.rows || [];

  const teamNames = table.map(r => String(r.team || "").trim()).filter(Boolean);
  const uniqueTeams = new Set(teamNames.map(x => x.toLowerCase()));
  const ranks = table.map(r => num(r.rank));
  const points = table.map(r => num(r.points));

  const rowChecks = table.map(r => {
    const played = num(r.played);
    const won = num(r.won);
    const drawn = num(r.drawn);
    const lost = num(r.lost);
    const gf = num(r.goalsFor);
    const ga = num(r.goalsAgainst);
    const gd = num(r.goalDifference);
    const pts = num(r.points);

    return {
      rank: r.rank,
      team: r.team,
      playedEqualsWdl: played != null && won != null && drawn != null && lost != null && played === won + drawn + lost,
      gdEqualsGfMinusGa: gf != null && ga != null && gd != null && gd === gf - ga,
      pointsEqualsThreeWinsPlusDraws: pts != null && won != null && drawn != null && pts === (3 * won + drawn),
      coreFieldsPresent: Boolean(r.team) && played != null && won != null && drawn != null && lost != null && pts != null,
      raw: r
    };
  });

  const rankSequenceOk = ranks.length > 0 && ranks.every((r,i) => r === i + 1);
  const uniqueTeamsOk = uniqueTeams.size === teamNames.length && teamNames.length === table.length;
  const expectedTeamCountOk = expectedTeamCount == null ? false : table.length === expectedTeamCount;
  const nonIncreasingPointsOk = points.every((p,i) => i === 0 || p <= points[i-1]);
  const allPlayedEqualsWdl = rowChecks.every(r => r.playedEqualsWdl);
  const allGdEqualsGfMinusGa = rowChecks.every(r => r.gdEqualsGfMinusGa);
  const allPointsFormulaOk = rowChecks.every(r => r.pointsEqualsThreeWinsPlusDraws);
  const allCoreFieldsPresent = rowChecks.every(r => r.coreFieldsPresent);

  const reconciliationChecks = [
    { name:"expectedTeamCountOk", passed: expectedTeamCountOk, expectedTeamCount, actualTeamCount: table.length },
    { name:"rankSequenceOk", passed: rankSequenceOk },
    { name:"uniqueTeamsOk", passed: uniqueTeamsOk, uniqueTeamCount: uniqueTeams.size, rowCount: table.length },
    { name:"nonIncreasingPointsOk", passed: nonIncreasingPointsOk },
    { name:"allCoreFieldsPresent", passed: allCoreFieldsPresent },
    { name:"allPlayedEqualsWdl", passed: allPlayedEqualsWdl },
    { name:"allGdEqualsGfMinusGa", passed: allGdEqualsGfMinusGa },
    { name:"allPointsFormulaOk", passed: allPointsFormulaOk }
  ];

  const passedCheckCount = reconciliationChecks.filter(c => c.passed).length;
  const blockedCheckCount = reconciliationChecks.filter(c => !c.passed).length;

  const reconciliationStatus =
    blockedCheckCount === 0
      ? "L5_reconciled_official_table_arithmetic_passed_requires_canonical_approval"
      : "blocked_l5_reconciliation_failed";

  return {
    competitionSlug: slug,
    host: item.host,
    url: item.url,
    effectiveUrl: item.effectiveUrl,
    dryExtractStatus: item.dryExtractStatus,
    dryExtractedRowCount: item.dryExtractedRowCount,
    expectedTeamCount,
    reconciliationStatus,
    reconciliationChecks,
    rowChecks,
    rows: table,
    passedCheckCount,
    blockedCheckCount,
    canonicalCandidateWriteEligibleAfterApproval: reconciliationStatus === "L5_reconciled_official_table_arithmetic_passed_requires_canonical_approval",
    canonicalCandidateWriteExecutedNow: false,
    productionTruthAllowed: false
  };
});

const summary = {
  status: "passed",
  inputDryExtractQualityPassedCount: eligible.length,
  reconciliationAttemptCount: rows.length,
  l5ReconciledCount: rows.filter(r => r.reconciliationStatus === "L5_reconciled_official_table_arithmetic_passed_requires_canonical_approval").length,
  blockedReconciliationCount: rows.filter(r => r.reconciliationStatus !== "L5_reconciled_official_table_arithmetic_passed_requires_canonical_approval").length,
  statusCounts: Object.entries(rows.reduce((a,r)=>{ a[r.reconciliationStatus]=(a[r.reconciliationStatus]||0)+1; return a; },{})).map(([status,count])=>({status,count})),
  l5ReconciledSlugs: rows.filter(r => r.reconciliationStatus === "L5_reconciled_official_table_arithmetic_passed_requires_canonical_approval").map(r => r.competitionSlug),
  blockedSlugs: rows.filter(r => r.reconciliationStatus !== "L5_reconciled_official_table_arithmetic_passed_requires_canonical_approval").map(r => r.competitionSlug),
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
