import fs from "node:fs";
import path from "node:path";

const inputPath = "data/football-truth/_diagnostics/bulk-l5-dry-extract-reconciliation-board-2026-06-17/bulk-l5-dry-extract-reconciliation-board-2026-06-17.json";
const outPath = "data/football-truth/_diagnostics/bulk-l5-strict-active-table-audit-board-2026-06-17/bulk-l5-strict-active-table-audit-board-2026-06-17.json";

function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"")); }
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }
function n(v){ return typeof v === "number" && Number.isFinite(v) ? v : null; }

const input = readJson(inputPath);
const rows = (input.rows || []).map(item => {
  const table = item.rows || [];
  const rowCount = table.length;
  const rowsWithRank = table.filter(r => n(r.rank) != null).length;
  const rowsWithCore = table.filter(r => r.team && n(r.played) != null && n(r.points) != null).length;
  const totalPlayed = table.reduce((a,r)=>a+(n(r.played) ?? 0),0);
  const totalPoints = table.reduce((a,r)=>a+(n(r.points) ?? 0),0);
  const maxPlayed = Math.max(0, ...table.map(r => n(r.played) ?? 0));
  const maxPoints = Math.max(0, ...table.map(r => n(r.points) ?? 0));
  const allZeroTable = rowCount > 0 && totalPlayed === 0 && totalPoints === 0;
  const rankComplete = rowCount > 0 && rowsWithRank === rowCount;
  const coreComplete = rowCount > 0 && rowsWithCore === rowCount;
  const nonEmptyCompetitionTable = rowCount > 0 && !allZeroTable && maxPlayed > 0 && maxPoints > 0;
  const arithmeticPassed = item.reconciliationStatus === "L5_bulk_reconciled_official_table_arithmetic_passed_requires_canonical_approval";
  const partialReview = item.reconciliationStatus === "L5_bulk_reconciliation_review_required_partial_arithmetic";

  const checks = [
    { name:"arithmeticPassed", passed: arithmeticPassed },
    { name:"coreComplete", passed: coreComplete, rowsWithCore, rowCount },
    { name:"rankComplete", passed: rankComplete, rowsWithRank, rowCount },
    { name:"nonEmptyCompetitionTable", passed: nonEmptyCompetitionTable, totalPlayed, totalPoints, maxPlayed, maxPoints, allZeroTable },
    { name:"expectedTeamCountStillOk", passed: item.expectedTeamCount == null ? false : rowCount === item.expectedTeamCount, expectedTeamCount: item.expectedTeamCount, rowCount }
  ];

  let strictStatus = "blocked_strict_l5_active_table_audit";
  if(arithmeticPassed && coreComplete && rankComplete && nonEmptyCompetitionTable && rowCount === item.expectedTeamCount){
    strictStatus = "L5_strict_active_table_reconciled_requires_canonical_approval";
  } else if(partialReview && coreComplete && nonEmptyCompetitionTable && rowCount === item.expectedTeamCount){
    strictStatus = "L5_strict_active_table_review_required_partial_arithmetic";
  } else if(allZeroTable || !nonEmptyCompetitionTable){
    strictStatus = "blocked_empty_or_preseason_zero_table";
  } else if(!rankComplete){
    strictStatus = "blocked_missing_rank_core_for_canonical";
  }

  return {
    competitionSlug: item.competitionSlug,
    url: item.url,
    host: item.host,
    parserMethod: item.parserMethod,
    sourceReconciliationStatus: item.reconciliationStatus,
    strictActiveTableAuditStatus: strictStatus,
    failedStrictChecks: checks.filter(c => !c.passed).map(c => c.name),
    checks,
    rowCount,
    expectedTeamCount: item.expectedTeamCount,
    totalPlayed,
    totalPoints,
    maxPlayed,
    maxPoints,
    rowsWithRank,
    rowsWithCore,
    allZeroTable,
    rows: table,
    canonicalCandidateWriteEligibleAfterApproval: strictStatus === "L5_strict_active_table_reconciled_requires_canonical_approval",
    canonicalCandidateWriteExecutedNow: false,
    productionTruthAllowed: false
  };
});

const summary = {
  status: "passed",
  inputL5RowCount: rows.length,
  strictCanonicalEligibleCount: rows.filter(r => r.strictActiveTableAuditStatus === "L5_strict_active_table_reconciled_requires_canonical_approval").length,
  strictReviewRequiredCount: rows.filter(r => r.strictActiveTableAuditStatus === "L5_strict_active_table_review_required_partial_arithmetic").length,
  strictBlockedCount: rows.filter(r => r.strictActiveTableAuditStatus.startsWith("blocked_")).length,
  statusCounts: Object.entries(rows.reduce((a,r)=>{ a[r.strictActiveTableAuditStatus]=(a[r.strictActiveTableAuditStatus]||0)+1; return a; },{})).map(([status,count])=>({status,count})),
  strictCanonicalEligibleSlugs: rows.filter(r => r.strictActiveTableAuditStatus === "L5_strict_active_table_reconciled_requires_canonical_approval").map(r => r.competitionSlug),
  strictReviewRequiredSlugs: rows.filter(r => r.strictActiveTableAuditStatus === "L5_strict_active_table_review_required_partial_arithmetic").map(r => r.competitionSlug),
  strictBlockedSlugs: rows.filter(r => r.strictActiveTableAuditStatus.startsWith("blocked_")).map(r => r.competitionSlug),
  fetchExecutedNowCount: 0,
  searchExecutedNowCount: 0,
  broadSearchExecutedNowCount: 0,
  standingsExtractionExecutedNowCount: 0,
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
    localAuditOnly: true,
    noFetch: true,
    noSearch: true,
    noNewExtraction: true,
    noCanonicalCandidateWrite: true,
    noProductionTruth: true,
    blocksZeroPreseasonTables: true,
    canonicalCandidateWriteRequiresExplicitUserApproval: true
  }
};

writeJson(outPath,out);
console.log(JSON.stringify(summary,null,2));
