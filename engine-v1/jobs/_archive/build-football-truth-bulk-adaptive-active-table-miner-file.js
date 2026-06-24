import fs from "node:fs";
import path from "node:path";

const inputPath = "data/football-truth/_diagnostics/bulk-official-route-template-shape-wave-2026-06-17/bulk-official-route-template-shape-wave-2026-06-17.json";
const outPath = "data/football-truth/_diagnostics/bulk-adaptive-active-table-miner-2026-06-17/bulk-adaptive-active-table-miner-2026-06-17.json";

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
function lineTextFromHtml(s){
  return String(s ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<\/(tr|li|div|p|section|article|tbody|thead)>/gi,"\n")
    .replace(/<(br|br\/)\s*>/gi,"\n")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/g," ")
    .replace(/&amp;/g,"&")
    .replace(/&#8211;/g,"-")
    .replace(/[ \t]+/g," ")
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(x => x.length >= 8);
}
function toNum(v){
  const s = String(v ?? "").replace(/[^\d+\-]/g,"").trim();
  if(!s || s === "+" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function normTeam(v){
  return String(v ?? "")
    .replace(/\b(logo|club badge|team badge|form|last 5|next)\b/gi," ")
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
function inferRowFromCells(cells){
  const nums = cells.map(toNum);
  const numericIdx = nums.map((n,i)=> n == null ? null : i).filter(i => i != null);
  if(numericIdx.length < 5) return null;

  const teamCandidates = cells.map((c,i)=>({i, c:normTeam(c), n:nums[i]}))
    .filter(x => x.n == null && /[A-Za-zÀ-ž]/.test(x.c) && x.c.length >= 2 && !/^(club|team|played|points|pts|form|rank)$/i.test(x.c));
  if(!teamCandidates.length) return null;

  const teamIdx = teamCandidates[0].i;
  const rankIdx = numericIdx.find(i => i < teamIdx) ?? null;
  const tail = numericIdx.filter(i => i > teamIdx).map(i => ({i,n:nums[i]}));
  if(tail.length < 5) return null;

  const played = tail[0]?.n ?? null;
  const won = tail[1]?.n ?? null;
  const drawn = tail[2]?.n ?? null;
  const lost = tail[3]?.n ?? null;
  let gf = null, ga = null, gd = null, points = tail[tail.length - 1]?.n ?? null;

  if(tail.length >= 8){
    gf = tail[4].n;
    ga = tail[5].n;
    gd = tail[6].n;
    points = tail[7].n;
  } else if(tail.length >= 6){
    gd = tail[tail.length - 2].n;
  }

  return { rank: rankIdx == null ? null : nums[rankIdx], team: teamCandidates[0].c, played, won, drawn, lost, goalsFor: gf, goalsAgainst: ga, goalDifference: gd, points, rawCells: cells };
}
function tableExtract(body){
  const tables = extractTables(body);
  let best = { source:"html_table", rows: [], tableIndex:null, header: [], parserMap:{} };
  for(const table of tables){
    const headerRow = table.rows.find(r => r.isHeader && r.cells.length >= 4) || table.rows[0] || { cells: [] };
    const map = headerMap(headerRow.cells);
    const parsed = [];
    for(const row of table.rows){
      if(row.cells.length < 4 || row.isHeader) continue;
      let p = parseRowByHeader(row.cells,map);
      if(!p || !p.team || p.played == null || p.points == null) p = inferRowFromCells(row.cells);
      if(p && p.team && p.played != null && p.points != null) parsed.push(p);
    }
    const dedup = dedupRows(parsed);
    if(dedup.length > best.rows.length) best = { source:"html_table", rows: dedup, tableIndex: table.tableIndex, header: headerRow.cells, parserMap: map };
  }
  return best;
}
function parseLine(line){
  const ms = [...String(line).matchAll(/[-+]?\d{1,3}/g)];
  if(ms.length < 6) return null;
  const nums = ms.map(m => ({ n:Number(m[0]), start:m.index, end:m.index + m[0].length }));
  let rank = null, team = "", statStart = 0;

  const prefix = line.slice(0, nums[0].start).trim();
  if(prefix.length >= 2 && /[A-Za-zÀ-ž]/.test(prefix)){
    team = prefix;
    statStart = 0;
  } else {
    rank = nums[0].n;
    team = line.slice(nums[0].end, nums[1].start).trim();
    statStart = 1;
  }

  team = normTeam(team);
  if(!team || team.length < 2 || !/[A-Za-zÀ-ž]/.test(team)) return null;

  const tail = nums.slice(statStart).map(x => x.n);
  if(tail.length < 5) return null;

  const played = tail[0];
  const won = tail[1];
  const drawn = tail[2];
  const lost = tail[3];
  let gf = null, ga = null, gd = null, points = tail[tail.length - 1];
  if(tail.length >= 8){
    gf = tail[4]; ga = tail[5]; gd = tail[6]; points = tail[7];
  } else if(tail.length >= 6){
    gd = tail[tail.length - 2];
  }

  if(played == null || points == null) return null;
  return { rank, team, played, won, drawn, lost, goalsFor: gf, goalsAgainst: ga, goalDifference: gd, points, rawLine: line };
}
function textLineExtract(body){
  const parsed = [];
  for(const line of lineTextFromHtml(body)){
    const p = parseLine(line);
    if(p && p.team && p.played != null && p.points != null) parsed.push(p);
  }
  return { source:"text_line", rows: dedupRows(parsed) };
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
  for(const k of keys){ if(obj && Object.prototype.hasOwnProperty.call(obj,k)) return obj[k]; }
  return null;
}
function parseJsonRow(o){
  if(!o || typeof o !== "object") return null;
  const teamObj = pick(o, ["team","club","participant","competitor"]);
  const team = normTeam(pick(o, ["teamName","clubName","name","shortName","displayName","participantName"]) ?? (teamObj && typeof teamObj === "object" ? pick(teamObj, ["name","shortName","displayName","teamName","clubName"]) : null));
  const played = toNum(pick(o, ["played","matchesPlayed","mp","p","playedMatches","gamesPlayed"]));
  const points = toNum(pick(o, ["points","pts","point","puntos"]));
  if(!team || played == null || points == null) return null;
  return {
    rank: toNum(pick(o, ["rank","position","pos","standing","place"])),
    team, played,
    won: toNum(pick(o, ["won","wins","w","pg"])),
    drawn: toNum(pick(o, ["drawn","draws","draw","d","pe"])),
    lost: toNum(pick(o, ["lost","losses","l","pp"])),
    goalsFor: toNum(pick(o, ["goalsFor","gf","for","goals_for"])),
    goalsAgainst: toNum(pick(o, ["goalsAgainst","ga","against","goals_against"])),
    goalDifference: toNum(pick(o, ["goalDifference","gd","diff","dg"])),
    points, rawObject: o
  };
}
function jsonExtract(body){
  const candidates = [];
  for(const text of collectJsonTexts(body)){
    try{
      const root = JSON.parse(String(text).replace(/&quot;/g,'"').replace(/&amp;/g,"&").trim());
      const arrays = [];
      traverse(root, arrays);
      for(const arr of arrays){
        const parsed = dedupRows(arr.map(parseJsonRow).filter(Boolean));
        if(parsed.length >= 6) candidates.push(parsed);
      }
    } catch {}
  }
  candidates.sort((a,b) => b.length - a.length);
  return { source:"embedded_json", rows: candidates[0] || [] };
}
function dedupRows(rows){
  const out = [];
  const seen = new Set();
  for(const r of rows){
    const key = `${String(r.team || "").toLowerCase()}:${r.played}:${r.points}:${r.rank ?? ""}`;
    if(!seen.has(key)){ seen.add(key); out.push(r); }
  }
  return out;
}
function quality(rows){
  const rowCount = rows.length;
  const teams = rows.map(r => String(r.team || "").toLowerCase()).filter(Boolean);
  const uniqueTeamCount = new Set(teams).size;
  const totalPlayed = rows.reduce((a,r)=>a+(toNum(r.played) ?? 0),0);
  const totalPoints = rows.reduce((a,r)=>a+(toNum(r.points) ?? 0),0);
  const maxPlayed = Math.max(0, ...rows.map(r => toNum(r.played) ?? 0));
  const maxPoints = Math.max(0, ...rows.map(r => toNum(r.points) ?? 0));
  const allZeroTable = rowCount > 0 && totalPlayed === 0 && totalPoints === 0;

  const plausibleRowCount = rowCount >= 8 && rowCount <= 40;
  const uniqueTeamsOk = rowCount > 0 && uniqueTeamCount === rowCount;
  const coreFieldsOk = rows.every(r => r.team && toNum(r.played) != null && toNum(r.points) != null);
  const nonEmptyActiveTable = plausibleRowCount && !allZeroTable && totalPlayed > 0 && totalPoints > 0 && maxPlayed > 0 && maxPoints > 0;
  const pointsOrderOk = rows.every((r,i) => i === 0 || toNum(r.points) == null || toNum(rows[i-1].points) == null || toNum(r.points) <= toNum(rows[i-1].points));

  const wdlRows = rows.filter(r => toNum(r.played) != null && toNum(r.won) != null && toNum(r.drawn) != null && toNum(r.lost) != null);
  const wdlOk = wdlRows.filter(r => toNum(r.played) === toNum(r.won) + toNum(r.drawn) + toNum(r.lost)).length;
  const ptsRows = rows.filter(r => toNum(r.points) != null && toNum(r.won) != null && toNum(r.drawn) != null);
  const ptsOk = ptsRows.filter(r => toNum(r.points) === 3 * toNum(r.won) + toNum(r.drawn)).length;
  const gdRows = rows.filter(r => toNum(r.goalsFor) != null && toNum(r.goalsAgainst) != null && toNum(r.goalDifference) != null);
  const gdOk = gdRows.filter(r => toNum(r.goalDifference) === toNum(r.goalsFor) - toNum(r.goalsAgainst)).length;

  const arithmeticStrong = wdlRows.length >= Math.max(8, rowCount * 0.7) && ptsRows.length >= Math.max(8, rowCount * 0.7) && wdlOk === wdlRows.length && ptsOk === ptsRows.length;
  const gdStrong = gdRows.length === 0 || gdOk === gdRows.length;

  let status = "blocked_adaptive_active_table_miner";
  if(nonEmptyActiveTable && uniqueTeamsOk && coreFieldsOk && pointsOrderOk && arithmeticStrong && gdStrong) status = "L5_adaptive_active_table_quality_passed_requires_reconciliation";
  else if(nonEmptyActiveTable && uniqueTeamsOk && coreFieldsOk) status = "L5_adaptive_active_table_review_required_partial_or_unordered";
  else if(allZeroTable) status = "blocked_empty_or_preseason_zero_table";

  return {
    status,
    metrics: { rowCount, uniqueTeamCount, totalPlayed, totalPoints, maxPlayed, maxPoints, allZeroTable, wdlRows: wdlRows.length, wdlOk, ptsRows: ptsRows.length, ptsOk, gdRows: gdRows.length, gdOk },
    checks: [
      { name:"plausibleRowCount", passed: plausibleRowCount, actual: rowCount },
      { name:"uniqueTeamsOk", passed: uniqueTeamsOk, uniqueTeamCount, rowCount },
      { name:"coreFieldsOk", passed: coreFieldsOk },
      { name:"nonEmptyActiveTable", passed: nonEmptyActiveTable, totalPlayed, totalPoints, maxPlayed, maxPoints, allZeroTable },
      { name:"pointsOrderOk", passed: pointsOrderOk },
      { name:"arithmeticStrong", passed: arithmeticStrong, wdlRows: wdlRows.length, wdlOk, ptsRows: ptsRows.length, ptsOk },
      { name:"goalDifferenceStrong", passed: gdStrong, gdRows: gdRows.length, gdOk }
    ]
  };
}

const input = readJson(inputPath);
const shapeRows = (input.fetchRows || []).filter(r => r.bulkRouteShapeStatus === "L4_bulk_route_template_shape_candidate_requires_parser_contract" && r.snapshotBody);

const attempts = [];
for(const r of shapeRows){
  const body = readText(r.snapshotBody);
  const methods = [tableExtract(body), jsonExtract(body), textLineExtract(body)];
  for(const m of methods){
    const q = quality(m.rows);
    attempts.push({
      competitionSlug: r.competitionSlug,
      routeRank: r.rank,
      host: r.host,
      url: r.url,
      sourceMethod: m.source,
      tableIndex: m.tableIndex ?? null,
      header: m.header ?? [],
      parserMap: m.parserMap ?? {},
      rowCount: m.rows.length,
      rows: m.rows,
      qualityStatus: q.status,
      metrics: q.metrics,
      checks: q.checks,
      canonicalCandidateWriteAllowed: false,
      productionTruthAllowed: false
    });
  }
}

const scoreStatus = s => s === "L5_adaptive_active_table_quality_passed_requires_reconciliation" ? 3 : s === "L5_adaptive_active_table_review_required_partial_or_unordered" ? 2 : s === "blocked_empty_or_preseason_zero_table" ? 1 : 0;
const bestBySlug = new Map();
for(const a of attempts){
  const prev = bestBySlug.get(a.competitionSlug);
  const aScore = scoreStatus(a.qualityStatus) * 1000 + a.rowCount + (a.metrics?.totalPlayed || 0) / 1000;
  const pScore = prev ? scoreStatus(prev.qualityStatus) * 1000 + prev.rowCount + (prev.metrics?.totalPlayed || 0) / 1000 : -1;
  if(!prev || aScore > pScore) bestBySlug.set(a.competitionSlug, a);
}
const bestRows = [...bestBySlug.values()].sort((a,b) => String(a.competitionSlug).localeCompare(String(b.competitionSlug)));

const summary = {
  status: "passed",
  inputShapeRouteCount: shapeRows.length,
  inputShapeSlugCount: uniq(shapeRows.map(r => r.competitionSlug)).length,
  adaptiveAttemptCount: attempts.length,
  bestQualityPassedSlugCount: bestRows.filter(r => r.qualityStatus === "L5_adaptive_active_table_quality_passed_requires_reconciliation").length,
  bestReviewRequiredSlugCount: bestRows.filter(r => r.qualityStatus === "L5_adaptive_active_table_review_required_partial_or_unordered").length,
  bestZeroBlockedSlugCount: bestRows.filter(r => r.qualityStatus === "blocked_empty_or_preseason_zero_table").length,
  bestOtherBlockedSlugCount: bestRows.filter(r => r.qualityStatus === "blocked_adaptive_active_table_miner").length,
  bestRowsByStatus: Object.entries(bestRows.reduce((a,r)=>{ a[r.qualityStatus]=(a[r.qualityStatus]||0)+1; return a; },{})).map(([status,count])=>({status,count})),
  attemptRowsByStatus: Object.entries(attempts.reduce((a,r)=>{ a[r.qualityStatus]=(a[r.qualityStatus]||0)+1; return a; },{})).map(([status,count])=>({status,count})),
  qualityPassedSlugs: bestRows.filter(r => r.qualityStatus === "L5_adaptive_active_table_quality_passed_requires_reconciliation").map(r => r.competitionSlug),
  reviewRequiredSlugs: bestRows.filter(r => r.qualityStatus === "L5_adaptive_active_table_review_required_partial_or_unordered").map(r => r.competitionSlug),
  zeroBlockedSlugs: bestRows.filter(r => r.qualityStatus === "blocked_empty_or_preseason_zero_table").map(r => r.competitionSlug),
  otherBlockedSlugs: bestRows.filter(r => r.qualityStatus === "blocked_adaptive_active_table_miner").map(r => r.competitionSlug),
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
  attempts,
  bestRows,
  policy: {
    localSnapshotsOnly: true,
    noFetch: true,
    noSearch: true,
    adaptiveDryMiningOnly: true,
    noCanonicalCandidateWrite: true,
    noProductionTruth: true,
    zeroTableBlocked: true,
    nextAllowedAction: "bulk_reconcile_adaptive_quality_passed_only"
  }
};

writeJson(outPath,out);
console.log(JSON.stringify(summary,null,2));
