import fs from "node:fs";
import path from "node:path";

const inputPath = "data/football-truth/_diagnostics/l4-parser-contract-discovery-board-2026-06-17/l4-parser-contract-discovery-board-2026-06-17.json";
const outPath = "data/football-truth/_diagnostics/l4-html-table-dry-extract-2026-06-17/l4-html-table-dry-extract-2026-06-17.json";

function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"")); }
function readText(p){ return fs.existsSync(p) ? fs.readFileSync(p,"utf8") : ""; }
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }

function cleanCell(s){
  return String(s ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/g," ")
    .replace(/&amp;/g,"&")
    .replace(/&#8211;/g,"-")
    .replace(/&#x2F;/g,"/")
    .replace(/\s+/g," ")
    .trim();
}
function matches(text,re){ return [...String(text ?? "").matchAll(re)]; }
function toNum(v){
  const s = String(v ?? "").replace(/[^\d+\-]/g,"").trim();
  if(!s || s === "+" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function normalizeTeam(v){
  return String(v ?? "")
    .replace(/\bLogo\b/gi," ")
    .replace(/\s+/g," ")
    .trim();
}
function extractTables(body){
  return matches(body, /<table\b[\s\S]*?<\/table>/gi).map((m, tableIndex) => {
    const html = m[0];
    const rows = matches(html, /<tr\b[\s\S]*?<\/tr>/gi).map(r => {
      const rowHtml = r[0];
      const cells = matches(rowHtml, /<t[dh]\b[\s\S]*?<\/t[dh]>/gi).map(c => cleanCell(c[0])).filter(Boolean);
      const isHeader = /<th\b/i.test(rowHtml);
      return { isHeader, cells };
    }).filter(r => r.cells.length);
    return { tableIndex, html, rows };
  });
}
function headerMap(header){
  const map = {};
  const h = header.map(x => String(x).toLowerCase());
  for(let i=0;i<h.length;i++){
    const x = h[i];
    if(map.rank == null && /^(#|pos|position|rank)$/i.test(x)) map.rank = i;
    if(map.team == null && /(club|team|teams|الفريق|النادي)/i.test(x)) map.team = i;
    if(map.played == null && /^(pl|pld|mp|p|played|matches|لعب)$/i.test(x)) map.played = i;
    if(map.won == null && /^(w|won|wins|فوز)$/i.test(x)) map.won = i;
    if(map.drawn == null && /^(d|drawn|draws|تعادل)$/i.test(x)) map.drawn = i;
    if(map.lost == null && /^(l|lost|losses|خسارة)$/i.test(x)) map.lost = i;
    if(map.gf == null && /^(gf|goals for|له)$/i.test(x)) map.gf = i;
    if(map.ga == null && /^(ga|goals against|عليه)$/i.test(x)) map.ga = i;
    if(map.gd == null && /^(gd|goal difference|diff|فرق)$/i.test(x)) map.gd = i;
    if(map.points == null && /^(pts|pt|points|النقاط)$/i.test(x)) map.points = i;
  }
  return map;
}
function inferRowsFromCells(cells){
  const nums = cells.map(toNum);
  const numericIdx = nums.map((n,i)=> n == null ? null : i).filter(i=>i != null);
  if(numericIdx.length < 6) return null;

  let rankIdx = 0;
  if(nums[0] == null && numericIdx.length) rankIdx = numericIdx[0];

  const teamCandidates = cells.map((c,i)=>({ i, c: normalizeTeam(c), n: nums[i] }))
    .filter(x => x.n == null && x.c.length >= 2 && !/^(club|team|played|won|drawn|lost|points|pts)$/i.test(x.c));

  const teamIdx = teamCandidates.length ? teamCandidates[0].i : (rankIdx === 0 ? 1 : 0);
  const tailNums = numericIdx.filter(i => i !== rankIdx && i > teamIdx).map(i => ({ i, n: nums[i] }));

  if(tailNums.length < 6) return null;

  const rank = nums[rankIdx];
  const team = normalizeTeam(cells[teamIdx]);

  const played = tailNums[0]?.n ?? null;
  const won = tailNums[1]?.n ?? null;
  const drawn = tailNums[2]?.n ?? null;
  const lost = tailNums[3]?.n ?? null;

  let gf = null, ga = null, gd = null, points = null;
  if(tailNums.length >= 8){
    gf = tailNums[4].n;
    ga = tailNums[5].n;
    gd = tailNums[6].n;
    points = tailNums[7].n;
  } else {
    gd = tailNums[4]?.n ?? null;
    points = tailNums[tailNums.length - 1]?.n ?? null;
  }

  if(!team || rank == null || played == null || points == null) return null;

  return { rank, team, played, won, drawn, lost, goalsFor: gf, goalsAgainst: ga, goalDifference: gd, points };
}
function extractFromTable(table, bestTable){
  let header = [];
  const headerRow = table.rows.find(r => r.isHeader && r.cells.length >= 4) || table.rows[0];
  if(headerRow) header = headerRow.cells;
  const map = headerMap(header);

  const dataRows = [];
  for(const row of table.rows){
    const cells = row.cells;
    if(cells.length < 4) continue;
    const low = cells.join(" ").toLowerCase();
    if(/club|team|played|points|pts/.test(low) && row.isHeader) continue;

    let parsed = null;

    if(map.team != null && map.played != null && map.points != null){
      parsed = {
        rank: map.rank != null ? toNum(cells[map.rank]) : toNum(cells[0]),
        team: normalizeTeam(cells[map.team]),
        played: toNum(cells[map.played]),
        won: map.won != null ? toNum(cells[map.won]) : null,
        drawn: map.drawn != null ? toNum(cells[map.drawn]) : null,
        lost: map.lost != null ? toNum(cells[map.lost]) : null,
        goalsFor: map.gf != null ? toNum(cells[map.gf]) : null,
        goalsAgainst: map.ga != null ? toNum(cells[map.ga]) : null,
        goalDifference: map.gd != null ? toNum(cells[map.gd]) : null,
        points: toNum(cells[map.points])
      };
    }

    if(!parsed || !parsed.team || parsed.played == null || parsed.points == null){
      parsed = inferRowsFromCells(cells);
    }

    if(parsed && parsed.team && parsed.rank != null && parsed.played != null && parsed.points != null){
      dataRows.push({
        ...parsed,
        rawCells: cells
      });
    }
  }

  const byRank = new Map();
  for(const r of dataRows){
    const key = `${r.rank}:${r.team}`;
    if(!byRank.has(key)) byRank.set(key,r);
  }

  return {
    header,
    parserMap: map,
    extractedRows: [...byRank.values()].sort((a,b) => a.rank - b.rank),
    sourceBestTable: bestTable
  };
}

const input = readJson(inputPath);
const readyRows = (input.rows || []).filter(r => r.parserContractDiscoveryStatus === "L4_parser_contract_ready_html_table_requires_dry_extract");

const rows = readyRows.map(r => {
  const body = readText(r.snapshotBody);
  const tables = extractTables(body);
  const tableIndex = r.bestTable?.tableIndex ?? 0;
  const table = tables.find(t => t.tableIndex === tableIndex) || tables[0] || { rows: [] };
  const parsed = extractFromTable(table, r.bestTable);
  const extracted = parsed.extractedRows;

  const rankSequenceOk = extracted.length > 0 && extracted.every((x,i) => x.rank === i + 1);
  const uniqueTeamCount = new Set(extracted.map(x => x.team.toLowerCase())).size;
  const allRowsHaveCore = extracted.every(x => x.team && x.rank != null && x.played != null && x.points != null);
  const plausibleRowCount = extracted.length >= 8 && extracted.length <= 24;
  const plausiblePoints = extracted.every(x => x.points >= 0 && x.points <= 120);
  const plausiblePlayed = extracted.every(x => x.played >= 0 && x.played <= 60);

  const qualityChecks = [
    { name:"plausibleRowCount", passed: plausibleRowCount, actual: extracted.length },
    { name:"allRowsHaveCore", passed: allRowsHaveCore },
    { name:"uniqueTeams", passed: uniqueTeamCount === extracted.length, uniqueTeamCount, rowCount: extracted.length },
    { name:"plausiblePoints", passed: plausiblePoints },
    { name:"plausiblePlayed", passed: plausiblePlayed },
    { name:"rankSequenceOk", passed: rankSequenceOk }
  ];

  const passedQualityCheckCount = qualityChecks.filter(c => c.passed).length;
  const dryExtractStatus =
    passedQualityCheckCount === qualityChecks.length
      ? "L5_dry_extract_shape_quality_passed_requires_reconciliation"
      : "blocked_dry_extract_quality_failed";

  return {
    competitionSlug: r.competitionSlug,
    host: r.host,
    url: r.url,
    effectiveUrl: r.effectiveUrl,
    parserMethod: r.parserMethod,
    parserContractDiscoveryStatus: r.parserContractDiscoveryStatus,
    tableIndex,
    header: parsed.header,
    parserMap: parsed.parserMap,
    dryExtractedRowCount: extracted.length,
    rows: extracted,
    qualityChecks,
    dryExtractStatus,
    reconciliationAllowed: dryExtractStatus === "L5_dry_extract_shape_quality_passed_requires_reconciliation",
    canonicalCandidateWriteAllowed: false,
    productionTruthAllowed: false
  };
});

const summary = {
  status: "passed",
  inputParserContractReadyCount: readyRows.length,
  dryExtractAttemptCount: rows.length,
  dryExtractQualityPassedCount: rows.filter(r => r.dryExtractStatus === "L5_dry_extract_shape_quality_passed_requires_reconciliation").length,
  blockedDryExtractCount: rows.filter(r => r.dryExtractStatus !== "L5_dry_extract_shape_quality_passed_requires_reconciliation").length,
  statusCounts: Object.entries(rows.reduce((a,r)=>{ a[r.dryExtractStatus]=(a[r.dryExtractStatus]||0)+1; return a; },{})).map(([status,count])=>({status,count})),
  qualityPassedSlugs: rows.filter(r => r.dryExtractStatus === "L5_dry_extract_shape_quality_passed_requires_reconciliation").map(r => r.competitionSlug),
  blockedSlugs: rows.filter(r => r.dryExtractStatus !== "L5_dry_extract_shape_quality_passed_requires_reconciliation").map(r => r.competitionSlug),
  fetchExecutedNowCount: 0,
  searchExecutedNowCount: 0,
  broadSearchExecutedNowCount: 0,
  dryExtractExecutedNowCount: rows.length,
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
    localSnapshotsOnly: true,
    noFetch: true,
    noSearch: true,
    dryExtractOnly: true,
    noCanonicalCandidateWrite: true,
    noProductionTruth: true,
    nextAllowedAction: "reconcile_quality_passed_dry_extract_only"
  }
};

writeJson(outPath,out);
console.log(JSON.stringify(summary,null,2));
