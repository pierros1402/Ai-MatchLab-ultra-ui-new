import fs from "node:fs";
import path from "node:path";

const inputPath = "data/football-truth/_diagnostics/bulk-same-host-endpoint-shape-probe-2026-06-17/bulk-same-host-endpoint-shape-probe-2026-06-17.json";
const outPath = "data/football-truth/_diagnostics/bulk-endpoint-hygiene-dry-extract-board-2026-06-17/bulk-endpoint-hygiene-dry-extract-board-2026-06-17.json";

function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"")); }
function readText(p){ return p && fs.existsSync(p) ? fs.readFileSync(p,"utf8") : ""; }
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }
function matches(text,re){ return [...String(text ?? "").matchAll(re)]; }
function uniq(a){ return [...new Set(a.filter(Boolean))]; }
function toNum(v){
  const s = String(v ?? "").replace(/[^\d+\-]/g,"").trim();
  if(!s || s === "+" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
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
function normTeam(v){
  return String(v ?? "")
    .replace(/\b(logo|club badge|team badge|form|last 5|next|position|rank)\b/gi," ")
    .replace(/\s+/g," ")
    .trim();
}
function urlHygiene(url){
  const u = String(url || "");
  const lower = u.toLowerCase();
  const reasons = [];
  if(/%3c|%3e|<|>/.test(lower)) reasons.push("encoded_html_fragment");
  if(/%20.{40,}/.test(lower)) reasons.push("encoded_long_text_fragment");
  if(/(title|meta|description|class=|data-|wrapper|__row|__col|font-bold|table-cell|tbody|thead|script|svg|json\.stringify)/i.test(u)) reasons.push("html_or_css_token_route");
  if(/\/20[0-2][0-9]\/\d{2}\/\d{2}\//.test(lower)) reasons.push("dated_article_route");
  if(/stayandplay|blogposting|webpage|news|posts|rss|feed|favicon|manifest\.json|oembed|wp-json\/oembed/i.test(u)) reasons.push("non_standings_content_route");
  if(/fixture|fixtures|calendar|schedule|result|results|match|matches/i.test(u) && !/standings|standing|table|tabla|posiciones|classement|classification/i.test(u)) reasons.push("fixture_result_route_without_table_signal");
  return { hygieneBlocked: reasons.length > 0, reasons };
}
function extractTables(body){
  return matches(body, /<table\b[\s\S]*?<\/table>/gi).map((m, tableIndex) => {
    const html = m[0];
    const rows = matches(html, /<tr\b[\s\S]*?<\/tr>/gi).map(r => {
      const rowHtml = r[0];
      const cells = matches(rowHtml, /<t[dh]\b[\s\S]*?<\/t[dh]>/gi).map(c => cleanCell(c[0])).filter(Boolean);
      return { isHeader:/<th\b/i.test(rowHtml), cells };
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
    if(map.team == null && /(team|club|equipo|clubes|球队|チーム|النادي|الفريق)/i.test(x)) map.team = i;
    if(map.played == null && /^(p|pl|pld|mp|played|matches|pj|j|لعب)$/.test(x)) map.played = i;
    if(map.won == null && /^(w|won|wins|v|pg|勝|فوز)$/.test(x)) map.won = i;
    if(map.drawn == null && /^(d|drawn|draws|e|pe|分|تعادل)$/.test(x)) map.drawn = i;
    if(map.lost == null && /^(l|lost|losses|pp|敗|خسارة)$/.test(x)) map.lost = i;
    if(map.gf == null && /^(gf|f|goals for|favor|له)$/.test(x)) map.gf = i;
    if(map.ga == null && /^(ga|a|goals against|contra|عليه)$/.test(x)) map.ga = i;
    if(map.gd == null && /^(gd|dg|diff|goal difference|diferencia|فرق)$/.test(x)) map.gd = i;
    if(map.points == null && /^(pts|pt|points|puntos|punten|النقاط)$/.test(x)) map.points = i;
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
  const teamCandidates = cells.map((c,i)=>({i,c:normTeam(c),n:nums[i]})).filter(x => x.n == null && /[A-Za-zÀ-ž]/.test(x.c) && x.c.length >= 2 && !/^(club|team|played|points|pts|form|rank)$/i.test(x.c));
  if(!teamCandidates.length) return null;
  const teamIdx = teamCandidates[0].i;
  const rankIdx = numericIdx.find(i => i < teamIdx) ?? null;
  const tail = numericIdx.filter(i => i > teamIdx).map(i => nums[i]);
  if(tail.length < 5) return null;
  const row = { rank: rankIdx == null ? null : nums[rankIdx], team: teamCandidates[0].c, played: tail[0], won: tail[1], drawn: tail[2], lost: tail[3], goalsFor:null, goalsAgainst:null, goalDifference:null, points: tail[tail.length - 1], rawCells: cells };
  if(tail.length >= 8){ row.goalsFor=tail[4]; row.goalsAgainst=tail[5]; row.goalDifference=tail[6]; row.points=tail[7]; }
  else if(tail.length >= 6){ row.goalDifference=tail[tail.length - 2]; }
  return row;
}
function dedupRows(rows){
  const out = [];
  const seen = new Set();
  for(const r of rows){
    const key = `${String(r.team||"").toLowerCase()}:${r.played}:${r.points}:${r.rank ?? ""}`;
    if(!seen.has(key)){ seen.add(key); out.push(r); }
  }
  return out;
}
function htmlExtract(body){
  let best = { source:"html_table", rows:[], tableIndex:null, header:[], parserMap:{} };
  for(const table of extractTables(body)){
    const headerRow = table.rows.find(r => r.isHeader && r.cells.length >= 4) || table.rows[0] || { cells:[] };
    const map = headerMap(headerRow.cells);
    const parsed = [];
    for(const row of table.rows){
      if(row.isHeader || row.cells.length < 4) continue;
      let p = parseRowByHeader(row.cells,map);
      if(!p || !p.team || p.played == null || p.points == null) p = inferRow(row.cells);
      if(p && p.team && p.played != null && p.points != null) parsed.push(p);
    }
    const rows = dedupRows(parsed);
    if(rows.length > best.rows.length) best = { source:"html_table", rows, tableIndex:table.tableIndex, header:headerRow.cells, parserMap:map };
  }
  return best;
}
function collectJsonTexts(body){
  const texts = [];
  const raw = String(body || "");
  if(/^\s*[\[{]/.test(raw)) texts.push(raw);
  for(const m of matches(raw, /<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi)) texts.push(m[1]);
  for(const m of matches(raw, /<script\b[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)) texts.push(m[1]);
  for(const m of matches(raw, /(?:window\.__INITIAL_STATE__|window\.__NUXT__|__INITIAL_STATE__)\s*=\s*(\{[\s\S]*?\});/g)) texts.push(m[1]);
  return texts;
}
function traverse(node, arrays, depth=0){
  if(depth > 14 || node == null) return;
  if(Array.isArray(node)){
    if(node.length >= 6 && node.every(x => x && typeof x === "object")) arrays.push(node);
    for(const x of node.slice(0,120)) traverse(x, arrays, depth+1);
  } else if(typeof node === "object"){
    for(const v of Object.values(node).slice(0,180)) traverse(v, arrays, depth+1);
  }
}
function pick(o, keys){
  for(const k of keys) if(o && Object.prototype.hasOwnProperty.call(o,k)) return o[k];
  return null;
}
function parseJsonRow(o){
  if(!o || typeof o !== "object") return null;
  const teamObj = pick(o, ["team","club","participant","competitor"]);
  const team = normTeam(pick(o, ["teamName","clubName","name","shortName","displayName","participantName","description"]) ?? (teamObj && typeof teamObj === "object" ? pick(teamObj, ["name","shortName","displayName","teamName","clubName"]) : null));
  const played = toNum(pick(o, ["played","matchesPlayed","mp","p","playedMatches","gamesPlayed","PJ"]));
  const points = toNum(pick(o, ["points","pts","point","puntos","PTS"]));
  if(!team || played == null || points == null) return null;
  return {
    rank: toNum(pick(o, ["rank","position","pos","standing","place"])),
    team,
    played,
    won: toNum(pick(o, ["won","wins","w","pg","PG"])),
    drawn: toNum(pick(o, ["drawn","draws","draw","d","pe","PE"])),
    lost: toNum(pick(o, ["lost","losses","l","pp","PP"])),
    goalsFor: toNum(pick(o, ["goalsFor","gf","for","goals_for","GF"])),
    goalsAgainst: toNum(pick(o, ["goalsAgainst","ga","against","goals_against","GC"])),
    goalDifference: toNum(pick(o, ["goalDifference","gd","diff","dg","DG"])),
    points,
    rawObject:o
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
        const rows = dedupRows(arr.map(parseJsonRow).filter(Boolean));
        if(rows.length >= 6) candidates.push(rows);
      }
    } catch {}
  }
  candidates.sort((a,b) => b.length - a.length);
  return { source:"embedded_json", rows:candidates[0] || [], candidateArrayCount:candidates.length };
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

  let status = "blocked_endpoint_dry_extract_quality_failed";
  if(allZeroTable) status = "blocked_empty_or_preseason_zero_table";
  else if(nonEmptyActiveTable && uniqueTeamsOk && coreFieldsOk && pointsOrderOk && arithmeticStrong && gdStrong) status = "L5_endpoint_dry_extract_quality_passed_requires_reconciliation";
  else if(nonEmptyActiveTable && uniqueTeamsOk && coreFieldsOk) status = "L5_endpoint_dry_extract_review_required_partial_or_unordered";

  return {
    status,
    metrics:{ rowCount, uniqueTeamCount, totalPlayed, totalPoints, maxPlayed, maxPoints, allZeroTable, wdlRows:wdlRows.length, wdlOk, ptsRows:ptsRows.length, ptsOk, gdRows:gdRows.length, gdOk },
    checks:[
      { name:"plausibleRowCount", passed:plausibleRowCount, actual:rowCount },
      { name:"uniqueTeamsOk", passed:uniqueTeamsOk, uniqueTeamCount, rowCount },
      { name:"coreFieldsOk", passed:coreFieldsOk },
      { name:"nonEmptyActiveTable", passed:nonEmptyActiveTable, totalPlayed, totalPoints, maxPlayed, maxPoints, allZeroTable },
      { name:"pointsOrderOk", passed:pointsOrderOk },
      { name:"arithmeticStrong", passed:arithmeticStrong, wdlRows:wdlRows.length, wdlOk, ptsRows:ptsRows.length, ptsOk },
      { name:"goalDifferenceStrong", passed:gdStrong, gdRows:gdRows.length, gdOk }
    ]
  };
}

const input = readJson(inputPath);
const candidates = (input.probeRows || []).filter(r =>
  (r.endpointProbeStatus === "L4_endpoint_shape_candidate_requires_parser_contract" || r.endpointProbeStatus === "review_endpoint_2xx_weak_shape") &&
  r.snapshotBody
);

const attempts = [];
for(const r of candidates){
  const hygiene = urlHygiene(r.url);
  const body = readText(r.snapshotBody);
  const extracts = [jsonExtract(body), htmlExtract(body)];
  for(const ex of extracts){
    const q = hygiene.hygieneBlocked
      ? { status:"blocked_endpoint_route_hygiene_failed", metrics:{ rowCount:ex.rows.length }, checks:[{ name:"routeHygieneOk", passed:false, reasons:hygiene.reasons }] }
      : quality(ex.rows);
    attempts.push({
      competitionSlug:r.competitionSlug,
      endpointRank:r.endpointRank,
      endpointProbeStatus:r.endpointProbeStatus,
      host:r.host,
      url:r.url,
      effectiveUrl:r.effectiveUrl,
      extractMethod:ex.source,
      rowCount:ex.rows.length,
      rows:ex.rows,
      hygieneReasons:hygiene.reasons,
      dryExtractStatus:q.status,
      metrics:q.metrics,
      checks:q.checks,
      canonicalCandidateWriteAllowed:false,
      productionTruthAllowed:false
    });
  }
}

const statusScore = s => s === "L5_endpoint_dry_extract_quality_passed_requires_reconciliation" ? 4 : s === "L5_endpoint_dry_extract_review_required_partial_or_unordered" ? 3 : s === "blocked_empty_or_preseason_zero_table" ? 1 : 0;
const bestBySlug = new Map();
for(const a of attempts){
  const prev = bestBySlug.get(a.competitionSlug);
  const score = statusScore(a.dryExtractStatus) * 100000 + a.rowCount + ((a.metrics?.totalPlayed || 0) / 1000);
  const prevScore = prev ? statusScore(prev.dryExtractStatus) * 100000 + prev.rowCount + ((prev.metrics?.totalPlayed || 0) / 1000) : -1;
  if(!prev || score > prevScore) bestBySlug.set(a.competitionSlug,a);
}
const bestRows = [...bestBySlug.values()].sort((a,b)=>String(a.competitionSlug).localeCompare(String(b.competitionSlug)));

const summary = {
  status:"passed",
  inputEndpointCandidateRows:candidates.length,
  inputEndpointCandidateSlugs:uniq(candidates.map(r=>r.competitionSlug)).length,
  dryExtractAttemptCount:attempts.length,
  bestQualityPassedSlugCount:bestRows.filter(r=>r.dryExtractStatus==="L5_endpoint_dry_extract_quality_passed_requires_reconciliation").length,
  bestReviewRequiredSlugCount:bestRows.filter(r=>r.dryExtractStatus==="L5_endpoint_dry_extract_review_required_partial_or_unordered").length,
  bestHygieneBlockedSlugCount:bestRows.filter(r=>r.dryExtractStatus==="blocked_endpoint_route_hygiene_failed").length,
  bestZeroBlockedSlugCount:bestRows.filter(r=>r.dryExtractStatus==="blocked_empty_or_preseason_zero_table").length,
  bestOtherBlockedSlugCount:bestRows.filter(r=>r.dryExtractStatus==="blocked_endpoint_dry_extract_quality_failed").length,
  bestRowsByStatus:Object.entries(bestRows.reduce((a,r)=>{ a[r.dryExtractStatus]=(a[r.dryExtractStatus]||0)+1; return a; },{})).map(([status,count])=>({status,count})),
  attemptRowsByStatus:Object.entries(attempts.reduce((a,r)=>{ a[r.dryExtractStatus]=(a[r.dryExtractStatus]||0)+1; return a; },{})).map(([status,count])=>({status,count})),
  qualityPassedSlugs:bestRows.filter(r=>r.dryExtractStatus==="L5_endpoint_dry_extract_quality_passed_requires_reconciliation").map(r=>r.competitionSlug),
  reviewRequiredSlugs:bestRows.filter(r=>r.dryExtractStatus==="L5_endpoint_dry_extract_review_required_partial_or_unordered").map(r=>r.competitionSlug),
  blockedSlugs:bestRows.filter(r=>!["L5_endpoint_dry_extract_quality_passed_requires_reconciliation","L5_endpoint_dry_extract_review_required_partial_or_unordered"].includes(r.dryExtractStatus)).map(r=>r.competitionSlug),
  fetchExecutedNowCount:0,
  searchExecutedNowCount:0,
  broadSearchExecutedNowCount:0,
  standingsExtractionExecutedNowCount:0,
  canonicalWriteExecutedNowCount:0,
  productionWriteExecutedNowCount:0,
  truthAssertionExecutedNowCount:0
};

const out = {
  generatedAtUtc:new Date().toISOString(),
  status:"passed",
  inputPath,
  summary,
  attempts,
  bestRows,
  policy:{
    localEndpointSnapshotsOnly:true,
    noFetch:true,
    noSearch:true,
    noCanonicalCandidateWrite:true,
    noProductionTruth:true,
    routeHygieneBlocksMalformedAndStaleCandidates:true,
    zeroTableBlocked:true,
    nextAllowedAction:"bulk_reconcile_endpoint_quality_passed_only"
  }
};

writeJson(outPath,out);
console.log(JSON.stringify(summary,null,2));
