import fs from "node:fs";
import path from "node:path";

const dryPath = "data/football-truth/_diagnostics/exact-official-seed-table-dry-extract-2026-06-17/exact-official-seed-table-dry-extract-2026-06-17.json";
const seedPath = "data/football-truth/_diagnostics/exact-official-domain-seed-probe-2026-06-17/exact-official-domain-seed-probe-2026-06-17.json";
const outPath = "data/football-truth/_diagnostics/hard-reset-progress-gate-2026-06-17/hard-reset-progress-gate-2026-06-17.json";

function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"")); }
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }
function clean(s){ return String(s ?? "").replace(/\s+/g," ").trim(); }
function strip(html){
  return clean(String(html||"")
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/&#8211;/gi,"-")
    .replace(/&#8212;/gi,"-"));
}
function readTextMaybe(p){
  try { return fs.readFileSync(p,"utf8"); } catch { return ""; }
}
function unique(a){ return [...new Set(a.filter(Boolean))]; }

const dry = readJson(dryPath);
const seed = readJson(seedPath);

const currentSeasonRe = /(2025[\s/-]*2026|2025\s*-\s*26|2025\/26|season\s*2025|2026|2025-2026)/i;
const staleSeasonRe = /(200[0-9]|201[0-9]|2020|2021|2022|2023|2024)(\s*[-/]\s*(0[0-9]|1[0-9]|2[0-4]))?/i;
const staleTeamHints = /(APOP\/KINYRAS|APEP PITSILIAS|ATROMITOS YEROSKIPOU|ALKI LARNAKAS|ATHLITIKI ENOSI PAFOS)/i;

function auditDryTable(row){
  const dryRows = (dry.dryExtractRows || []).filter(r => r.competitionSlug === row.competitionSlug);
  const cellsText = dryRows.map(r => [r.team, ...(r.cells || [])].join(" ")).join(" ");
  const snapshot = readTextMaybe(row.snapshotPath);
  const visible = strip(snapshot).slice(0,120000);
  const evidence = `${row.pageTitle || ""} ${row.sourceUrl || ""} ${cellsText} ${visible}`;
  const currentSeasonHits = unique((evidence.match(currentSeasonRe) || []));
  const staleSeasonHits = unique((evidence.match(staleSeasonRe) || []));
  const staleTeamHit = staleTeamHints.test(evidence);
  const rowCount = Number(row.bestTable?.dataRowCount || 0);
  const header = (row.bestTable?.header || []).join(" | ");
  const arithmeticRows = dryRows.map(r => {
    const c = r.cells || [];
    const nums = c.map(x => clean(x)).filter(x => /^-?\d+$/.test(x)).map(Number);
    return {team:r.team, nums};
  });
  let arithmeticLikelyOkCount = 0;
  for(const r of arithmeticRows){
    const nums = r.nums;
    if(nums.length >= 8){
      const played = nums[1], w = nums[2], d = nums[3], l = nums[4], gf = nums[5], ga = nums[6], pts = nums[7];
      if(played === w+d+l && pts === w*3+d && gf >= 0 && ga >= 0) arithmeticLikelyOkCount++;
    }
  }
  const arithmeticOk = rowCount > 0 && arithmeticLikelyOkCount >= Math.max(8, Math.floor(rowCount * 0.7));

  let currentnessStatus = "blocked_current_season_not_proven";
  let reason = "no explicit current season evidence";
  if(staleTeamHit || staleSeasonHits.some(x => !/2025|2026/.test(x))){
    currentnessStatus = "blocked_stale_or_historical_table";
    reason = "historical/stale team or season evidence detected";
  } else if(currentSeasonHits.length && arithmeticOk && rowCount >= 8){
    currentnessStatus = "current_season_candidate_requires_reconciliation";
    reason = "current-season marker and arithmetic-like standings rows found";
  } else if(arithmeticOk && rowCount >= 8){
    currentnessStatus = "review_arithmetic_ok_but_current_season_missing";
    reason = "standings arithmetic likely OK but current season not proven";
  }
  return {
    competitionSlug:row.competitionSlug,
    competitionName:row.competitionName,
    sourceUrl:row.sourceUrl,
    host:row.host,
    pageTitle:row.pageTitle,
    snapshotPath:row.snapshotPath,
    dryExtractStatus:row.dryExtractStatus,
    rowCount,
    header,
    arithmeticLikelyOkCount,
    arithmeticOk,
    currentSeasonHits,
    staleSeasonHits,
    staleTeamHit,
    currentnessStatus,
    currentnessReason:reason,
    sampleTeams:dryRows.slice(0,12).map(r=>r.team)
  };
}

const dryQualityRows = dry.qualityPassedRows || [];
const currentnessAuditRows = dryQualityRows.map(auditDryTable);
const currentSeasonRows = currentnessAuditRows.filter(r => r.currentnessStatus === "current_season_candidate_requires_reconciliation");
const staleRows = currentnessAuditRows.filter(r => r.currentnessStatus === "blocked_stale_or_historical_table");
const currentnessReviewRows = currentnessAuditRows.filter(r => r.currentnessStatus === "review_arithmetic_ok_but_current_season_missing");

const knownStrongCanonicalCandidates = ["ger.1","ger.2","esp.1","esp.2","nor.1","nor.2","aut.1","aut.2","fin.1","swe.1","swe.2"];
const seedUsefulButNotCurrent = [
  ...new Set([
    ...(seed.tableCandidateRows || []).map(r=>r.competitionSlug),
    ...(seed.routeCandidateRows || []).map(r=>r.competitionSlug)
  ])
].sort();

const blockedSeedRows = (seed.bestRows || []).filter(r => r.probeStatus === "blocked_no_standings_shape").map(r => ({
  competitionSlug:r.competitionSlug,
  competitionName:r.competitionName,
  host:r.host,
  pageTitle:r.pageTitle,
  reason:"seeded official routes did not expose extractable standings shape"
}));

const progressLedger = {
  productionTruthCoverageCount:0,
  canonicalCandidateStrongCount:knownStrongCanonicalCandidates.length,
  currentSessionCurrentSeasonNewCandidateCount:currentSeasonRows.length,
  currentSessionStaleBlockedCount:staleRows.length,
  currentSessionReviewCurrentnessCount:currentnessReviewRows.length,
  meaningfulProgressThisSession:currentSeasonRows.length > 0,
  whyProgressIsStillPoor:"generic search lanes produced noise; official-domain seed produced only one standings-like table, and it appears stale/historical unless currentness evidence is found"
};

const summary = {
  status:"passed",
  dryQualityCandidateCount:dryQualityRows.length,
  currentSeasonCandidateCount:currentSeasonRows.length,
  staleOrHistoricalBlockedCount:staleRows.length,
  currentnessReviewCount:currentnessReviewRows.length,
  knownStrongCanonicalCandidateCount:knownStrongCanonicalCandidates.length,
  seedUsefulButNotCurrentCount:seedUsefulButNotCurrent.length,
  blockedSeedCompetitionCount:blockedSeedRows.length,
  recommendedNextLane: currentSeasonRows.length ? "reconcile_current_season_candidates" : "hard_reset_to_official_contract_inventory_for_major_leagues",
  searchExecutedNowCount:0,
  fetchExecutedNowCount:0,
  canonicalWriteExecutedNowCount:0,
  productionWriteExecutedNowCount:0,
  truthAssertionExecutedNowCount:0
};

writeJson(outPath,{
  generatedAtUtc:new Date().toISOString(),
  status:"passed",
  summary,
  progressLedger,
  currentnessAuditRows,
  currentSeasonRows,
  staleRows,
  currentnessReviewRows,
  knownStrongCanonicalCandidates,
  seedUsefulButNotCurrent,
  blockedSeedRows,
  hardResetRules:[
    "No table counts as progress unless current season is proven.",
    "No search result counts as a candidate without official football host and extractable route/table/API evidence.",
    "No canonical candidate without arithmetic reconciliation.",
    "Low-value/no-betting-value leagues stay parked until endgame.",
    "Next work must prioritize official contracts for high-value European and global leagues."
  ],
  policy:{
    localAuditOnly:true,
    noSearch:true,
    noFetch:true,
    noCanonicalCandidateWrite:true,
    noProductionTruth:true
  }
});
console.log(JSON.stringify(summary,null,2));
