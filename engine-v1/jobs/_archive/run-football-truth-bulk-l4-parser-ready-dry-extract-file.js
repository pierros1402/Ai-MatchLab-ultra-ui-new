import fs from "node:fs";
import path from "node:path";

const inputPath = "data/football-truth/_diagnostics/bulk-l4-parser-contract-discovery-board-2026-06-17/bulk-l4-parser-contract-discovery-board-2026-06-17.json";
const outPath = "data/football-truth/_diagnostics/bulk-l4-parser-ready-dry-extract-2026-06-17/bulk-l4-parser-ready-dry-extract-2026-06-17.json";

function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"")); }
function readText(p){ return p && fs.existsSync(p) ? fs.readFileSync(p,"utf8") : ""; }
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }
function matches(text,re){ return [...String(text ?? "").matchAll(re)]; }
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
function toNum(v){
  const s = String(v ?? "").replace(/[^\d+\-]/g,"").trim();
  if(!s || s === "+" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function normTeam(v){
  return String(v ?? "")
    .replace(/\b(logo|club badge|team badge)\b/gi," ")
    .replace(/\s+/g," ")
    .trim();
}
function uniq(a){ return [...new Set(a.filter(Boolean))]; }

function extractTables(body){
  return matches(body, /<table\b[\s\S]*?<\/table>/gi).map((m, tableIndex) => {
    const html = m[0];
    const rows = matches(html, /<tr\b[\s\S]*?<\/tr>/gi).map(r => {
      const rowHtml = r[0];
      const cells = matches(rowHtml, /<t[dh]\b[\s\S]*?<\/t[dh]>/gi).map(c => cleanCell(c[0])).filter(Boolean);
      return { isHeader: /<th\b/i.test(rowHtml), cells };
    }).filter(r => r.cells.length);
    return { tableIndex, rows };
  });
}
function headerMap(header){
  const map = {};
  const h = header.map(x => String(x).toLowerCase().trim());
  for(let i=0;i<h.length;i++){
    const x = h[i];
    if(map.rank == null && /^(#|pos|position|rank|rnk|順位)$/.test(x)) map.rank = i;
    if(map.team == null && /(team|club|equipo|clubes|球队|チーム|チーム名|النادي|الفريق)/i.test(x)) map.team = i;
    if(map.played == null && /^(p|pl|pld|mp|played|matches|pj|j|試合|لعب)$/.test(x)) map.played = i;
    if(map.won == null && /^(w|won|wins|v|pg|勝|فوز)$/.test(x)) map.won = i;
    if(map.drawn == null && /^(d|drawn|draws|e|pe|分|تعادل)$/.test(x)) map.drawn = i;
    if(map.lost == null && /^(l|lost|losses|pp|敗|خسارة)$/.test(x)) map.lost = i;
    if(map.gf == null && /^(gf|f|goals for|favor|goles a favor|得点|له)$/.test(x)) map.gf = i;
    if(map.ga == null && /^(ga|a|goals against|contra|goles en contra|失点|عليه)$/.test(x)) map.ga = i;
    if(map.gd == null && /^(gd|dg|diff|goal difference|diferencia|得失点|فرق)$/.test(x)) map.gd = i;
    if(map.points == null && /^(pts|pt|points|puntos|punten|勝点|ポイント|النقاط)$/.test(x)) map.points = i;
  }
  return map;
}
function parseRowByHeader(cells,map){
  if(map.team == null || map.played == null || map.points == null) return null;
  return {
    rank: map.rank != null ? toNum(cells[map.rank]) : null,
    team: normTeam(cells[map.team]),
    played: toNum(cells[map.played]),
    won: map.won != null ? toNum(cells[map.won]) : null,
    drawn: map.drawn != null ? toNum(cells[map.drawn]) : null,
    lost: map.lost != null ? toNum(cells[map.lost]) : null,
    goalsFor: map.gf != null ? toNum(cells[map.gf]) : null,
    goalsAgainst: map.ga != null ? toNum(cells[map.ga]) : null,
    goalDifference: map.gd != null ? toNum(cells[map.gd]) : null,
    points: toNum(cells[map.points]),
    rawCells: cells
  };
}
function inferRow(cells){
  const nums = cells.map(toNum);
  const numericIdx = nums.map((n,i)=> n == null ? null : i).filter(i => i != null);
  if(numericIdx.length < 5) return null;

  const teamCandidates = cells.map((c,i)=>({i, c:normTeam(c), n:nums[i]}))
    .filter(x => x.n == null && /[A-Za-zÀ-ž]/.test(x.c) && x.c.length >= 2 && !/^(club|team|played|points|pts|form)$/i.test(x.c));
  if(!teamCandidates.length) return null;

  const teamIdx = teamCandidates[0].i;
  const rankIdx = numericIdx.find(i => i < teamIdx) ?? null;
  const tail = numericIdx.filter(i => i > teamIdx).map(i => ({i,n:nums[i]}));
  if(tail.length < 5) return null;

  let played = tail[0]?.n ?? null;
  let won = tail[1]?.n ?? null;
  let drawn = tail[2]?.n ?? null;
  let lost = tail[3]?.n ?? null;
  let gf = null, ga = null, gd = null, points = tail[tail.length - 1]?.n ?? null;

  if(tail.length >= 8){
    gf = tail[4].n;
    ga = tail[5].n;
    gd = tail[6].n;
    points = tail[7].n;
  } else if(tail.length >= 6){
    gd = tail[tail.length - 2].n;
  }

  return {
    rank: rankIdx == null ? null : nums[rankIdx],
    team: teamCandidates[0].c,
    played, won, drawn, lost,
    goalsFor: gf,
    goalsAgainst: ga,
    goalDifference: gd,
    points,
    rawCells: cells
  };
}
function tableExtract(body, preferredTableIndex){
  const tables = extractTables(body);
  const ordered = preferredTableIndex == null ? tables : [
    ...tables.filter(t => t.tableIndex === preferredTableIndex),
    ...tables.filter(t => t.tableIndex !== preferredTableIndex)
  ];

  let best = { rows: [], tableIndex: null, header: [], parserMap: {}, source:"html_table" };

  for(const table of ordered){
    const headerRow = table.rows.find(r => r.isHeader && r.cells.length >= 4) || table.rows[0] || { cells: [] };
    const map = headerMap(headerRow.cells);
    const parsed = [];

    for(const row of table.rows){
      if(row.cells.length < 4) continue;
      if(row.isHeader) continue;
      const low = row.cells.join(" ").toLowerCase();
      if(/^(club|team|played|points|pts|pos|rank)/.test(low)) continue;
      let p = parseRowByHeader(row.cells,map);
      if(!p || !p.team || p.played == null || p.points == null) p = inferRow(row.cells);
      if(p && p.team && p.played != null && p.points != null){
        parsed.push(p);
      }
    }

    const dedup = [];
    const seen = new Set();
    for(const r of parsed){
      const key = `${r.rank ?? ""}:${r.team.toLowerCase()}:${r.played}:${r.points}`;
      if(!seen.has(key)){ seen.add(key); dedup.push(r); }
    }

    if(dedup.length > best.rows.length){
      best = { rows: dedup, tableIndex: table.tableIndex, header: headerRow.cells, parserMap: map, source:"html_table" };
    }
  }

  return best;
}
function collectJsonTexts(body){
  const texts = [];
  for(const m of matches(body, /<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi)) texts.push(m[1]);
  for(const m of matches(body, /<script\b[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)) texts.push(m[1]);
  for(const m of matches(body, /<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
    const s = m[1];
    for(const x of matches(s, /(?:window\.__INITIAL_STATE__|window\.__NUXT__|__INITIAL_STATE__)\s*=\s*(\{[\s\S]*?\});/g)) texts.push(x[1]);
  }
  return texts;
}
function traverse(node, arrays, depth=0){
  if(depth > 12 || node == null) return;
  if(Array.isArray(node)){
    if(node.length >= 6 && node.every(x => x && typeof x === "object")) arrays.push(node);
    for(const x of node.slice(0,80)) traverse(x, arrays, depth+1);
  } else if(typeof node === "object"){
    for(const v of Object.values(node).slice(0,120)) traverse(v, arrays, depth+1);
  }
}
function pick(obj, keys){
  for(const k of keys){
    if(obj && Object.prototype.hasOwnProperty.call(obj,k)) return obj[k];
  }
  return null;
}
function parseJsonRow(o){
  if(!o || typeof o !== "object") return null;
  const teamObj = pick(o, ["team","club","participant","competitor"]);
  const team = normTeam(
    pick(o, ["teamName","clubName","name","shortName","displayName","participantName"]) ??
    (teamObj && typeof teamObj === "object" ? pick(teamObj, ["name","shortName","displayName","teamName","clubName"]) : null)
  );
  const played = toNum(pick(o, ["played","matchesPlayed","mp","p","playedMatches","gamesPlayed"]));
  const points = toNum(pick(o, ["points","pts","point","puntos"]));
  if(!team || played == null || points == null) return null;
  return {
    rank: toNum(pick(o, ["rank","position","pos","standing","place"])),
    team,
    played,
    won: toNum(pick(o, ["won","wins","w","pg"])),
    drawn: toNum(pick(o, ["drawn","draws","draw","d","pe"])),
    lost: toNum(pick(o, ["lost","losses","l","pp"])),
    goalsFor: toNum(pick(o, ["goalsFor","gf","for","goals_for"])),
    goalsAgainst: toNum(pick(o, ["goalsAgainst","ga","against","goals_against"])),
    goalDifference: toNum(pick(o, ["goalDifference","gd","diff","dg"])),
    points,
    rawObject: o
  };
}
function embeddedJsonExtract(body){
  const jsonTexts = collectJsonTexts(body);
  const candidates = [];
  for(const text of jsonTexts){
    try{
      const root = JSON.parse(String(text).replace(/&quot;/g,'"').replace(/&amp;/g,"&").trim());
      const arrays = [];
      traverse(root, arrays);
      for(const arr of arrays){
        const parsed = arr.map(parseJsonRow).filter(Boolean);
        if(parsed.length >= 6) candidates.push(parsed);
      }
    } catch {}
  }
  candidates.sort((a,b) => b.length - a.length);
  const rows = candidates[0] || [];
  return { rows, source:"embedded_json", jsonTextCount: jsonTexts.length, candidateArrayCount: candidates.length };
}
function quality(rows){
  const rowCount = rows.length;
  const teams = rows.map(r => String(r.team || "").toLowerCase()).filter(Boolean);
  const uniqueTeamCount = new Set(teams).size;
  const plausibleRowCount = rowCount >= 8 && rowCount <= 40;
  const uniqueTeamsOk = rowCount > 0 && uniqueTeamCount === rowCount;
  const coreFieldsOk = rows.every(r => r.team && r.played != null && r.points != null);
  const plausiblePlayed = rows.every(r => r.played >= 0 && r.played <= 80);
  const plausiblePoints = rows.every(r => r.points >= -20 && r.points <= 140);
  const pointsOrderOk = rows.every((r,i) => i === 0 || r.points <= rows[i-1].points || rows[i-1].rank == null);
  const rankValues = rows.map(r => r.rank).filter(x => x != null);
  const rankSequenceOk = rankValues.length < rowCount * 0.7 ? null : rows.every((r,i) => r.rank == null || r.rank === i + 1);

  const arithmeticAvailableRows = rows.filter(r => r.won != null && r.drawn != null && r.lost != null);
  const wdlOkRows = arithmeticAvailableRows.filter(r => r.played === r.won + r.drawn + r.lost).length;
  const pointsOkRows = arithmeticAvailableRows.filter(r => r.points === (3 * r.won + r.drawn)).length;
  const gdAvailableRows = rows.filter(r => r.goalsFor != null && r.goalsAgainst != null && r.goalDifference != null);
  const gdOkRows = gdAvailableRows.filter(r => r.goalDifference === r.goalsFor - r.goalsAgainst).length;

  const arithmeticStrong =
    arithmeticAvailableRows.length >= Math.max(6, rowCount * 0.7) &&
    wdlOkRows === arithmeticAvailableRows.length &&
    pointsOkRows === arithmeticAvailableRows.length;
  const gdStrong =
    gdAvailableRows.length < Math.max(6, rowCount * 0.7) ||
    gdOkRows === gdAvailableRows.length;

  const checks = [
    { name:"plausibleRowCount", passed: plausibleRowCount, actual: rowCount },
    { name:"uniqueTeamsOk", passed: uniqueTeamsOk, uniqueTeamCount, rowCount },
    { name:"coreFieldsOk", passed: coreFieldsOk },
    { name:"plausiblePlayed", passed: plausiblePlayed },
    { name:"plausiblePoints", passed: plausiblePoints },
    { name:"pointsOrderOk", passed: pointsOrderOk },
    { name:"rankSequenceOk", passed: rankSequenceOk === null ? true : rankSequenceOk, informationalWhenNoRanks: rankSequenceOk === null },
    { name:"arithmeticStrong", passed: arithmeticStrong, availableRows: arithmeticAvailableRows.length, wdlOkRows, pointsOkRows },
    { name:"goalDifferenceStrong", passed: gdStrong, availableRows: gdAvailableRows.length, gdOkRows }
  ];

  let status = "blocked_bulk_dry_extract_quality_failed";
  if(plausibleRowCount && uniqueTeamsOk && coreFieldsOk && plausiblePlayed && plausiblePoints && pointsOrderOk){
    status = arithmeticStrong && gdStrong
      ? "L5_bulk_dry_extract_quality_passed_requires_reconciliation"
      : "L5_bulk_dry_extract_review_required_arithmetic_or_partial_fields";
  }

  return { status, checks };
}

const input = readJson(inputPath);
const readyRoutes = (input.rows || []).filter(r => r.dryExtractAllowed === true);

const attempts = readyRoutes.map(r => {
  const body = readText(r.snapshotBody);
  let extracted;
  if(r.parserMethod === "embedded_json") extracted = embeddedJsonExtract(body);
  else extracted = tableExtract(body, r.bestTable?.tableIndex);

  const q = quality(extracted.rows);
  return {
    competitionSlug: r.competitionSlug,
    routeRank: r.rank,
    host: r.host,
    url: r.url,
    effectiveUrl: r.effectiveUrl,
    parserMethod: r.parserMethod,
    parserContractDiscoveryStatus: r.parserContractDiscoveryStatus,
    dryExtractSource: extracted.source,
    tableIndex: extracted.tableIndex ?? null,
    header: extracted.header ?? [],
    parserMap: extracted.parserMap ?? {},
    dryExtractedRowCount: extracted.rows.length,
    rows: extracted.rows,
    qualityChecks: q.checks,
    dryExtractStatus: q.status,
    reconciliationAllowed: q.status === "L5_bulk_dry_extract_quality_passed_requires_reconciliation",
    reviewRequired: q.status === "L5_bulk_dry_extract_review_required_arithmetic_or_partial_fields",
    canonicalCandidateWriteAllowed: false,
    productionTruthAllowed: false
  };
});

const bestBySlug = new Map();
function rankStatus(s){
  if(s === "L5_bulk_dry_extract_quality_passed_requires_reconciliation") return 3;
  if(s === "L5_bulk_dry_extract_review_required_arithmetic_or_partial_fields") return 2;
  return 1;
}
for(const a of attempts){
  const prev = bestBySlug.get(a.competitionSlug);
  if(!prev || rankStatus(a.dryExtractStatus) > rankStatus(prev.dryExtractStatus) || (rankStatus(a.dryExtractStatus) === rankStatus(prev.dryExtractStatus) && a.dryExtractedRowCount > prev.dryExtractedRowCount)){
    bestBySlug.set(a.competitionSlug, a);
  }
}
const bestRows = [...bestBySlug.values()].sort((a,b) => String(a.competitionSlug).localeCompare(String(b.competitionSlug)));

const summary = {
  status: "passed",
  inputReadyRouteCount: readyRoutes.length,
  inputReadySlugCount: uniq(readyRoutes.map(r => r.competitionSlug)).length,
  dryExtractAttemptCount: attempts.length,
  bestQualityPassedSlugCount: bestRows.filter(r => r.dryExtractStatus === "L5_bulk_dry_extract_quality_passed_requires_reconciliation").length,
  bestReviewRequiredSlugCount: bestRows.filter(r => r.dryExtractStatus === "L5_bulk_dry_extract_review_required_arithmetic_or_partial_fields").length,
  bestBlockedSlugCount: bestRows.filter(r => r.dryExtractStatus === "blocked_bulk_dry_extract_quality_failed").length,
  bestRowsByStatus: Object.entries(bestRows.reduce((a,r)=>{ a[r.dryExtractStatus]=(a[r.dryExtractStatus]||0)+1; return a; },{})).map(([status,count])=>({status,count})),
  attemptRowsByStatus: Object.entries(attempts.reduce((a,r)=>{ a[r.dryExtractStatus]=(a[r.dryExtractStatus]||0)+1; return a; },{})).map(([status,count])=>({status,count})),
  qualityPassedSlugs: bestRows.filter(r => r.dryExtractStatus === "L5_bulk_dry_extract_quality_passed_requires_reconciliation").map(r => r.competitionSlug),
  reviewRequiredSlugs: bestRows.filter(r => r.dryExtractStatus === "L5_bulk_dry_extract_review_required_arithmetic_or_partial_fields").map(r => r.competitionSlug),
  blockedSlugs: bestRows.filter(r => r.dryExtractStatus === "blocked_bulk_dry_extract_quality_failed").map(r => r.competitionSlug),
  fetchExecutedNowCount: 0,
  searchExecutedNowCount: 0,
  broadSearchExecutedNowCount: 0,
  dryExtractExecutedNowCount: attempts.length,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0
};

const out = {
  generatedAtUtc: new Date().toISOString(),
  status: "passed",
  inputPath,
  summary,
  attempts,
  bestRows,
  policy: {
    localSnapshotsOnly: true,
    noFetch: true,
    noSearch: true,
    dryExtractOnly: true,
    noCanonicalCandidateWrite: true,
    noProductionTruth: true,
    nextAllowedAction: "bulk_reconcile_quality_passed_only"
  }
};

writeJson(outPath,out);
console.log(JSON.stringify(summary,null,2));
