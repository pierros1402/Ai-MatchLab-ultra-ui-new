import fs from "node:fs";
import path from "node:path";

const inputPath = "data/football-truth/_diagnostics/exact-official-domain-seed-probe-2026-06-17/exact-official-domain-seed-probe-2026-06-17.json";
const outPath = "data/football-truth/_diagnostics/exact-official-seed-table-dry-extract-2026-06-17/exact-official-seed-table-dry-extract-2026-06-17.json";

function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"")); }
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }
function clean(s){ return String(s ?? "").replace(/\s+/g," ").trim(); }
function decodeEntities(s){
  return clean(String(s ?? "")
    .replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/&lt;/gi,"<")
    .replace(/&gt;/gi,">")
    .replace(/&quot;/gi,'"')
    .replace(/&#39;/gi,"'")
    .replace(/&#8211;/gi,"-")
    .replace(/&#8212;/gi,"-")
    .replace(/&#(\d+);/g,(_,n)=>{ try { return String.fromCodePoint(Number(n)); } catch { return " "; } }));
}
function stripTags(html){
  return decodeEntities(String(html||"")
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," "));
}
function extractTables(html){
  const out = [];
  const re = /<table\b[\s\S]*?<\/table>/gi;
  let m;
  while((m = re.exec(html))) out.push(m[0]);
  return out;
}
function extractRows(tableHtml){
  const rows = [];
  const trRe = /<tr\b[\s\S]*?<\/tr>/gi;
  let tr;
  while((tr = trRe.exec(tableHtml))){
    const rowHtml = tr[0];
    const cells = [];
    const cellRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let c;
    while((c = cellRe.exec(rowHtml))){
      cells.push(stripTags(c[1]));
    }
    if(cells.some(Boolean)) rows.push(cells);
  }
  return rows;
}
function isNumericCell(v){ return /^-?\d+([.,]\d+)?$/.test(clean(v)); }
function numericCount(row){ return row.filter(isNumericCell).length; }
function textCount(row){ return row.filter(v => /[A-Za-zÀ-žΑ-ωΆ-ώА-Яа-я]/.test(v) && !isNumericCell(v)).length; }
function headerScore(row){
  const s = row.join(" ").toLowerCase();
  const hits = [
    /team|club|ομάδα|ομαδα|lið|félag|команда|jamoa/,
    /played|pld|\bp\b|αγών|αγων|leik|матч/,
    /\bw\b|won|wins|νίκ|νικ|sig/,
    /\bd\b|draw|ισοπ|jafn/,
    /\bl\b|lost|loss|ήττ|ηττ|tap/,
    /points|pts|βαθ|stig|очки/,
    /\bgd\b|goal difference|διαφορά|mismun/,
    /goals|gf|ga|γκολ|mark/
  ].filter(re=>re.test(s)).length;
  return hits;
}
function likelyTeamName(v){
  const s = clean(v);
  if(s.length < 2) return false;
  if(isNumericCell(s)) return false;
  if(/^(team|club|played|points|pts|p|w|d|l|gd|gf|ga|form)$/i.test(s)) return false;
  return /[A-Za-zÀ-žΑ-ωΆ-ώА-Яа-я]/.test(s);
}
function inferRows(rows){
  if(!rows.length) return {header:[], dataRows:[], inferredTeamCellIndex:null};
  let headerIndex = -1;
  let bestHeaderScore = -1;
  for(let i=0;i<Math.min(rows.length,5);i++){
    const s = headerScore(rows[i]);
    if(s > bestHeaderScore){ bestHeaderScore = s; headerIndex = i; }
  }
  const header = headerIndex >= 0 ? rows[headerIndex] : [];
  const dataRows = rows.filter((r,i)=>i !== headerIndex && r.length >= 3 && textCount(r) >= 1 && numericCount(r) >= 2);
  let inferredTeamCellIndex = null;
  for(let idx=0; idx<Math.max(...rows.map(r=>r.length),0); idx++){
    const hits = dataRows.filter(r => likelyTeamName(r[idx])).length;
    if(hits >= Math.max(3, Math.floor(dataRows.length * 0.5))){
      inferredTeamCellIndex = idx;
      break;
    }
  }
  return {header, dataRows, inferredTeamCellIndex, bestHeaderScore};
}
function qualityStatus(table){
  if(table.dataRowCount >= 8 && table.numericDataRowCount >= 8 && table.bestHeaderScore >= 3) return "quality_passed_standings_like_table_requires_reconciliation";
  if(table.dataRowCount >= 8 && table.numericDataRowCount >= 8) return "review_numeric_team_table_requires_manual_header_mapping";
  if(table.rawRowCount >= 8) return "review_table_rows_not_standings_like";
  return "blocked_table_too_small_or_not_standings";
}

const input = readJson(inputPath);
const candidates = (input.tableCandidateRows || []).filter(r => ["ind.1","cyp.1","isl.1"].includes(r.competitionSlug));
const extractRowsOut = [];
const tableRows = [];

for(const c of candidates){
  if(!c.snapshotPath || !fs.existsSync(c.snapshotPath)){
    tableRows.push({...c, dryExtractStatus:"blocked_missing_snapshot", tables:[]});
    continue;
  }
  const html = fs.readFileSync(c.snapshotPath,"utf8");
  const tables = extractTables(html);
  const extractedTables = tables.map((t,tableIndex)=>{
    const rows = extractRows(t);
    const inferred = inferRows(rows);
    const mappedRows = inferred.dataRows.map((r,rowIndex)=>({
      rowIndex:rowIndex+1,
      team: inferred.inferredTeamCellIndex === null ? "" : clean(r[inferred.inferredTeamCellIndex]),
      cells:r
    }));
    const out = {
      tableIndex:tableIndex+1,
      rawRowCount:rows.length,
      rawColumnMax:rows.reduce((m,r)=>Math.max(m,r.length),0),
      bestHeaderScore:inferred.bestHeaderScore || 0,
      header:inferred.header,
      inferredTeamCellIndex:inferred.inferredTeamCellIndex,
      dataRowCount:inferred.dataRows.length,
      numericDataRowCount:inferred.dataRows.filter(r=>numericCount(r)>=2).length,
      sampleRows:mappedRows.slice(0,8),
      allRows:mappedRows
    };
    out.tableQualityStatus = qualityStatus(out);
    return out;
  }).sort((a,b)=>{
    const rank = s => s === "quality_passed_standings_like_table_requires_reconciliation" ? 4 : s === "review_numeric_team_table_requires_manual_header_mapping" ? 3 : s === "review_table_rows_not_standings_like" ? 2 : 0;
    return rank(b.tableQualityStatus)*10000 + b.dataRowCount - (rank(a.tableQualityStatus)*10000 + a.dataRowCount);
  });
  const best = extractedTables[0] || null;
  const dryExtractStatus = best ? best.tableQualityStatus : "blocked_no_tables_in_snapshot";
  tableRows.push({
    competitionSlug:c.competitionSlug,
    competitionName:c.competitionName,
    country:c.country,
    sourceUrl:c.url,
    host:c.host,
    pageTitle:c.pageTitle,
    snapshotPath:c.snapshotPath,
    sourceShapeScore:c.shapeScore,
    sourceTableTagCount:c.tableTagCount,
    tableCount:tables.length,
    dryExtractStatus,
    bestTable:best,
    tables:extractedTables
  });
  if(best){
    for(const r of best.allRows || []){
      extractRowsOut.push({
        competitionSlug:c.competitionSlug,
        competitionName:c.competitionName,
        country:c.country,
        sourceUrl:c.url,
        host:c.host,
        pageTitle:c.pageTitle,
        tableIndex:best.tableIndex,
        rowIndex:r.rowIndex,
        team:r.team,
        cells:r.cells
      });
    }
  }
}

const qualityPassedRows = tableRows.filter(r=>r.dryExtractStatus==="quality_passed_standings_like_table_requires_reconciliation");
const reviewRows = tableRows.filter(r=>String(r.dryExtractStatus).startsWith("review_"));
const blockedRows = tableRows.filter(r=>String(r.dryExtractStatus).startsWith("blocked_"));

const summary = {
  status:"passed",
  sourceProbePath:inputPath,
  candidateCompetitionCount:candidates.length,
  dryExtractReviewedCompetitionCount:tableRows.length,
  extractedDataRowCount:extractRowsOut.length,
  qualityPassedCompetitionCount:qualityPassedRows.length,
  reviewCompetitionCount:reviewRows.length,
  blockedCompetitionCount:blockedRows.length,
  dryExtractStatusCounts:Object.entries(tableRows.reduce((a,r)=>{a[r.dryExtractStatus]=(a[r.dryExtractStatus]||0)+1; return a;},{})).map(([status,count])=>({status,count})),
  searchExecutedNowCount:0,
  fetchExecutedNowCount:0,
  standingsExtractionExecutedNowCount:1,
  canonicalWriteExecutedNowCount:0,
  productionWriteExecutedNowCount:0,
  truthAssertionExecutedNowCount:0
};

writeJson(outPath,{
  generatedAtUtc:new Date().toISOString(),
  status:"passed",
  summary,
  tableRows,
  qualityPassedRows,
  reviewRows,
  blockedRows,
  dryExtractRows:extractRowsOut,
  policy:{
    localSnapshotDryExtractOnly:true,
    noSearch:true,
    noFetch:true,
    noCanonicalCandidateWrite:true,
    noProductionTruth:true,
    nextAllowedAction:"reconcile_quality_passed_tables_else_park_failed_table_candidates"
  }
});
console.log(JSON.stringify(summary,null,2));
