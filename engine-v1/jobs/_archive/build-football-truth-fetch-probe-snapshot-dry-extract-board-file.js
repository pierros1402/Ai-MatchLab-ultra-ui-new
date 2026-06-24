import fs from "node:fs";
import path from "node:path";

const inputPath = "data/football-truth/_diagnostics/combined-ultra-strict-candidate-fetch-probe-2026-06-17/combined-ultra-strict-candidate-fetch-probe-2026-06-17.json";
const outPath = "data/football-truth/_diagnostics/fetch-probe-snapshot-dry-extract-board-2026-06-17/fetch-probe-snapshot-dry-extract-board-2026-06-17.json";

function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"")); }
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }
function clean(s){ return String(s ?? "").replace(/\s+/g," ").trim(); }
function decode(s){
  return clean(String(s ?? "")
    .replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/&lt;/gi,"<")
    .replace(/&gt;/gi,">")
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)))
  );
}
function strip(html){
  return decode(String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
  );
}
function num(v){
  const s = clean(v).replace(/[^\d.-]/g,"");
  if(!s || s === "-" || s === "." || s === "-.") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function hostOf(u){ try { return new URL(u).hostname.toLowerCase().replace(/^www\./,""); } catch { return ""; } }
function pathOf(u){ try { return new URL(u).pathname.toLowerCase(); } catch { return ""; } }
function extractTables(html){
  const tables = [];
  const re = /<table\b[\s\S]*?<\/table>/gi;
  let m;
  while((m = re.exec(html))){
    const tableHtml = m[0];
    const rows = [];
    const trRe = /<tr\b[\s\S]*?<\/tr>/gi;
    let tr;
    while((tr = trRe.exec(tableHtml))){
      const rowHtml = tr[0];
      const cells = [];
      const cellRe = /<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi;
      let c;
      while((c = cellRe.exec(rowHtml))){
        cells.push(strip(c[2]));
      }
      if(cells.filter(Boolean).length) rows.push(cells);
    }
    tables.push({tableIndex:tables.length+1, rowCount:rows.length, rows});
  }
  return tables;
}
function colIndex(headers, patterns){
  return headers.findIndex(h => patterns.some(p => p.test(clean(h).toLowerCase())));
}
function pickTeamCol(headers, sampleRows){
  let i = colIndex(headers, [/team/,/club/,/name/,/squad/,/selection/]);
  if(i >= 0) return i;
  const width = Math.max(...sampleRows.map(r=>r.length), headers.length, 0);
  let best = -1, bestScore = -1;
  for(let c=0;c<width;c++){
    let score = 0;
    for(const r of sampleRows.slice(0,12)){
      const v = clean(r[c]);
      if(/[A-Za-zÀ-ž]{3,}/.test(v) && num(v) == null) score++;
    }
    if(score > bestScore){ bestScore = score; best = c; }
  }
  return bestScore >= 3 ? best : -1;
}
function parseTable(table){
  if(!table.rows.length) return {rows:[], headers:[], mapping:{}, quality:{status:"blocked_no_rows"}};
  let headers = table.rows[0].map(clean);
  let dataRows = table.rows.slice(1);

  const headerText = headers.join(" ").toLowerCase();
  const headerLooksNumeric = headers.filter(h => num(h) != null).length >= Math.max(2, Math.floor(headers.length/2));
  if(headerLooksNumeric || !/(team|club|played|points|pts|standing|table|p|w|d|l|gf|ga|gd)/i.test(headerText)){
    headers = [];
    dataRows = table.rows;
  }

  const headerNorm = headers.map(h => h.toLowerCase());
  const mapping = {
    rank: colIndex(headerNorm, [/^#$/,/rank/,/^pos/,/^no\.?$/]),
    team: pickTeamCol(headerNorm, dataRows),
    played: colIndex(headerNorm, [/^p$/,/^pl$/,/played/,/^gp$/,/matches/,/games/]),
    won: colIndex(headerNorm, [/^w$/,/won/,/wins/]),
    drawn: colIndex(headerNorm, [/^d$/,/draw/,/drawn/]),
    lost: colIndex(headerNorm, [/^l$/,/lost/,/loss/]),
    gf: colIndex(headerNorm, [/^gf$/,/for$/,/goals for/]),
    ga: colIndex(headerNorm, [/^ga$/,/against$/,/goals against/]),
    gd: colIndex(headerNorm, [/^gd$/,/diff/]),
    points: colIndex(headerNorm, [/^pts?$/,/points/])
  };

  if(mapping.points < 0){
    const width = Math.max(...dataRows.map(r=>r.length), 0);
    let best = -1, bestNumeric = -1;
    for(let c=0;c<width;c++){
      const vals = dataRows.map(r=>num(r[c])).filter(v=>v != null);
      if(vals.length >= Math.min(4, dataRows.length) && vals.length > bestNumeric){
        bestNumeric = vals.length; best = c;
      }
    }
    mapping.points = best;
  }

  const parsed = [];
  for(const r of dataRows){
    const team = clean(r[mapping.team]);
    if(!team || team.length < 2 || /^team$/i.test(team) || num(team) != null) continue;
    const row = {
      rank: mapping.rank >= 0 ? num(r[mapping.rank]) : null,
      team,
      played: mapping.played >= 0 ? num(r[mapping.played]) : null,
      won: mapping.won >= 0 ? num(r[mapping.won]) : null,
      drawn: mapping.drawn >= 0 ? num(r[mapping.drawn]) : null,
      lost: mapping.lost >= 0 ? num(r[mapping.lost]) : null,
      gf: mapping.gf >= 0 ? num(r[mapping.gf]) : null,
      ga: mapping.ga >= 0 ? num(r[mapping.ga]) : null,
      gd: mapping.gd >= 0 ? num(r[mapping.gd]) : null,
      points: mapping.points >= 0 ? num(r[mapping.points]) : null,
      rawCells:r
    };
    parsed.push(row);
  }

  const teams = new Set(parsed.map(r=>r.team.toLowerCase()));
  const rowCount = parsed.length;
  const totalPlayed = parsed.reduce((a,r)=>a+(r.played||0),0);
  const totalPoints = parsed.reduce((a,r)=>a+(r.points||0),0);
  const hasCore = rowCount >= 4 && teams.size === rowCount && mapping.team >= 0 && mapping.points >= 0;
  const hasActive = totalPlayed > 0 || totalPoints > 0;
  const hasPlayed = parsed.filter(r=>r.played != null).length >= Math.min(4,rowCount);
  const wdlOk = parsed.filter(r => r.played != null && r.won != null && r.drawn != null && r.lost != null).every(r => r.played === r.won + r.drawn + r.lost);
  const pointsOk = parsed.filter(r => r.points != null && r.won != null && r.drawn != null).every(r => r.points === r.won*3 + r.drawn || r.points >= r.won*3 + r.drawn);
  const qualityStatus = hasCore && hasActive && hasPlayed && wdlOk ? "dry_extract_quality_passed_requires_reconciliation"
    : hasCore && hasActive ? "dry_extract_review_required_partial_table"
    : hasCore ? "blocked_empty_or_preseason_zero_table"
    : "blocked_table_quality_failed";

  return {
    rows:parsed,
    headers,
    mapping,
    quality:{status:qualityStatus,rowCount,totalPlayed,totalPoints,uniqueTeamCount:teams.size,hasCore,hasActive,hasPlayed,wdlOk,pointsOk}
  };
}
function hardBlock(row, html){
  const host = row.host || hostOf(row.url);
  const p = pathOf(row.effectiveUrl || row.url);
  const title = row.pageTitle || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const evidence = `${host} ${p} ${title} ${row.url}`.toLowerCase();
  if(/facebook\.com|instagram\.com|linkedin\.com|twitter\.com|x\.com/.test(host)) return "blocked_social_platform";
  if(/fifa\.com/.test(host) && /\/associations\//.test(p)) return "blocked_fifa_association_profile_not_standings";
  if(/inside fifa/i.test(title) && /fifa\.com/.test(host)) return "blocked_fifa_profile_not_standings";
  if(/page not found|404|not found/i.test(title)) return "blocked_page_not_found";
  if(!/(standing|standings|points standing|table|league-table|classification|classement|tabla|posiciones)/i.test(evidence + " " + strip(html).slice(0,5000))) return "blocked_no_standings_evidence";
  return "";
}

const input = readJson(inputPath);
const fetchRows = input.fetchRows || [];
const attempts = [];

for(const r of fetchRows){
  if(!r.snapshotPath || !fs.existsSync(r.snapshotPath)) continue;
  const html = fs.readFileSync(r.snapshotPath,"utf8");
  const block = hardBlock(r, html);
  if(block){
    attempts.push({
      competitionSlug:r.competitionSlug,
      competitionName:r.competitionName,
      host:r.host,
      url:r.url,
      snapshotPath:r.snapshotPath,
      pageTitle:r.pageTitle,
      dryExtractStatus:block,
      extractMethod:"none",
      rowCount:0,
      candidateRows:[]
    });
    continue;
  }

  const tables = extractTables(html);
  const parsedTables = tables.map(t => ({table:t, parsed:parseTable(t)}));
  parsedTables.sort((a,b)=>{
    const rank = s => s === "dry_extract_quality_passed_requires_reconciliation" ? 4 : s === "dry_extract_review_required_partial_table" ? 3 : s === "blocked_empty_or_preseason_zero_table" ? 2 : 0;
    return rank(b.parsed.quality.status)-rank(a.parsed.quality.status) || b.parsed.quality.rowCount-a.parsed.quality.rowCount;
  });
  const best = parsedTables[0];

  if(!best){
    attempts.push({
      competitionSlug:r.competitionSlug,
      competitionName:r.competitionName,
      host:r.host,
      url:r.url,
      snapshotPath:r.snapshotPath,
      pageTitle:r.pageTitle,
      dryExtractStatus:"blocked_no_extractable_table",
      extractMethod:"html_table",
      rowCount:0,
      candidateRows:[]
    });
  } else {
    attempts.push({
      competitionSlug:r.competitionSlug,
      competitionName:r.competitionName,
      host:r.host,
      url:r.url,
      snapshotPath:r.snapshotPath,
      pageTitle:r.pageTitle,
      dryExtractStatus:best.parsed.quality.status,
      extractMethod:"html_table",
      tableIndex:best.table.tableIndex,
      headers:best.parsed.headers,
      mapping:best.parsed.mapping,
      quality:best.parsed.quality,
      rowCount:best.parsed.rows.length,
      candidateRows:best.parsed.rows
    });
  }
}

const rankStatus = s => s === "dry_extract_quality_passed_requires_reconciliation" ? 5 : s === "dry_extract_review_required_partial_table" ? 4 : s === "blocked_empty_or_preseason_zero_table" ? 2 : 1;
const bestBySlug = new Map();
for(const a of attempts){
  const prev = bestBySlug.get(a.competitionSlug);
  const score = rankStatus(a.dryExtractStatus)*100000 + (a.rowCount||0);
  const prevScore = prev ? rankStatus(prev.dryExtractStatus)*100000 + (prev.rowCount||0) : -1;
  if(!prev || score > prevScore) bestBySlug.set(a.competitionSlug,a);
}
const bestRows = [...bestBySlug.values()].sort((a,b)=>a.competitionSlug.localeCompare(b.competitionSlug));
const qualityPassed = bestRows.filter(r=>r.dryExtractStatus==="dry_extract_quality_passed_requires_reconciliation");
const review = bestRows.filter(r=>r.dryExtractStatus==="dry_extract_review_required_partial_table");

const summary = {
  status:"passed",
  sourceFetchProbePath:inputPath,
  sourceFetchExecutedNowCount:input.summary?.fetchExecutedNowCount ?? null,
  snapshotDryExtractAttemptCount:attempts.length,
  bestCompetitionCount:bestRows.length,
  dryExtractQualityPassedCount:qualityPassed.length,
  dryExtractReviewRequiredCount:review.length,
  bestRowsByDryExtractStatus:Object.entries(bestRows.reduce((a,r)=>{ a[r.dryExtractStatus]=(a[r.dryExtractStatus]||0)+1; return a; },{})).map(([status,count])=>({status,count})),
  allRowsByDryExtractStatus:Object.entries(attempts.reduce((a,r)=>{ a[r.dryExtractStatus]=(a[r.dryExtractStatus]||0)+1; return a; },{})).map(([status,count])=>({status,count})),
  qualityPassedSlugs:qualityPassed.map(r=>r.competitionSlug),
  reviewRequiredSlugs:review.map(r=>r.competitionSlug),
  searchExecutedNowCount:0,
  fetchExecutedNowCount:0,
  broadSearchExecutedNowCount:0,
  standingsExtractionExecutedNowCount:attempts.length,
  canonicalWriteExecutedNowCount:0,
  productionWriteExecutedNowCount:0,
  truthAssertionExecutedNowCount:0
};

const out = {
  generatedAtUtc:new Date().toISOString(),
  status:"passed",
  summary,
  bestRows,
  attempts,
  qualityPassedRows:qualityPassed,
  reviewRows:review,
  policy:{
    localSnapshotDryExtractOnly:true,
    noSearch:true,
    noFetch:true,
    noCanonicalCandidateWrite:true,
    noProductionTruth:true,
    fifaAssociationProfilesBlocked:true,
    nextAllowedAction:"reconcile_quality_passed_rows_or_route_repair_review_rows"
  }
};

writeJson(outPath,out);
console.log(JSON.stringify(summary,null,2));
