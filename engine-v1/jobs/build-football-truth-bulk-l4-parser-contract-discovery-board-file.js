import fs from "node:fs";
import path from "node:path";

const inputPath = "data/football-truth/_diagnostics/bulk-official-route-template-shape-wave-2026-06-17/bulk-official-route-template-shape-wave-2026-06-17.json";
const outPath = "data/football-truth/_diagnostics/bulk-l4-parser-contract-discovery-board-2026-06-17/bulk-l4-parser-contract-discovery-board-2026-06-17.json";

function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"")); }
function readText(p){ return p && fs.existsSync(p) ? fs.readFileSync(p,"utf8") : ""; }
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
function cleanHtml(s){
  return cleanCell(String(s ?? ""));
}
function matches(text,re){ return [...String(text ?? "").matchAll(re)]; }
function count(text,re){ return matches(text,re).length; }
function uniq(a){ return [...new Set(a.filter(Boolean))]; }
function hitList(text,tokens){
  const t = String(text ?? "").toLowerCase();
  return uniq(tokens.filter(x => t.includes(String(x).toLowerCase())));
}

const statTokens = [
  "played","pld","mp","matches played","won","drawn","lost","goals for","goals against",
  "goal difference","gd","points","pts","puntos","punten","v","e","d","pj","pg","pe","pp","gf","gc","dg"
];

const headerTokens = [
  "team","club","clubs","position","pos","rank","#","played","pld","mp","won","drawn","lost",
  "gd","goal difference","points","pts","puntos","pj","pg","pe","pp","gf","gc","dg","equipo"
];

const jsonKeys = [
  "standings","standing","table","rank","ranking","position","club","team","teamName","played",
  "matchesPlayed","won","wins","drawn","draws","lost","losses","points","pts","goalsFor",
  "goalsAgainst","goalDifference","leagueTable","competitionTable","overallStandings","entries"
];

function extractTables(body){
  return matches(body, /<table\b[\s\S]*?<\/table>/gi).map((m, tableIndex) => {
    const html = m[0];
    const tr = matches(html, /<tr\b[\s\S]*?<\/tr>/gi).map(r => r[0]);
    const parsedRows = tr.map(rowHtml => {
      const cells = matches(rowHtml, /<t[dh]\b[\s\S]*?<\/t[dh]>/gi).map(c => cleanCell(c[0])).filter(Boolean);
      const isHeader = /<th\b/i.test(rowHtml);
      return { isHeader, cells };
    }).filter(r => r.cells.length);
    const headerRow = parsedRows.find(r => r.isHeader && r.cells.length >= 4) || parsedRows[0] || { cells: [] };
    const allText = parsedRows.flatMap(r => r.cells).join(" ");
    const headerHits = hitList(headerRow.cells.join(" "), headerTokens);
    const statHits = hitList(allText, statTokens);
    const teamLikeDataRows = parsedRows.filter(r => {
      const joined = r.cells.join(" ");
      const numericCells = r.cells.filter(c => /^[-+]?\d{1,3}$/.test(String(c).trim())).length;
      const hasName = r.cells.some(c => /[A-Za-z]/.test(c) && String(c).trim().length >= 2);
      return numericCells >= 4 && hasName;
    }).length;
    const score =
      Math.min(parsedRows.length, 30) * 3 +
      headerHits.length * 14 +
      statHits.length * 9 +
      (teamLikeDataRows >= 8 ? 70 : teamLikeDataRows * 6);
    return {
      tableIndex,
      trCount: tr.length,
      parsedRowCount: parsedRows.length,
      teamLikeDataRows,
      header: headerRow.cells,
      headerHits,
      statHits,
      sampleRows: parsedRows.slice(0, 8).map(r => r.cells),
      score
    };
  }).sort((a,b) => b.score - a.score);
}

function discoverJsonSignals(body){
  const keyHits = jsonKeys.filter(k => new RegExp(`["']?${k}["']?\\s*:`, "i").test(body));
  const nextDataCount = count(body, /id=["']__NEXT_DATA__["']/gi);
  const nuxtDataCount = count(body, /window\.__NUXT__|__NUXT_DATA__/gi);
  const applicationJsonCount = count(body, /<script[^>]+type=["']application\/json["'][^>]*>/gi);
  const objectWithPointsCount = count(body, /\{[^{}]{0,1200}(points|pts|played|matchesPlayed|goalDifference|standings|table)[^{}]{0,1200}\}/gi);
  const arrayWithTeamsCount = count(body, /\[[\s\S]{0,6000}(team|club|teamName|name)[\s\S]{0,6000}(points|pts|played|standings|table|rank)[\s\S]{0,6000}\]/gi);
  const score =
    keyHits.length * 13 +
    Math.min(objectWithPointsCount, 35) * 4 +
    Math.min(arrayWithTeamsCount, 8) * 16 +
    nextDataCount * 22 +
    nuxtDataCount * 18 +
    applicationJsonCount * 10;
  return { keyHits, nextDataCount, nuxtDataCount, applicationJsonCount, objectWithPointsCount, arrayWithTeamsCount, score };
}

function routePenalty(url){
  const u = String(url ?? "").toLowerCase();
  let penalty = 0;
  const bad = [];
  for (const token of ["news","video","shop","tickets","privacy","about","contact","media","gallery","calendar","fixture","fixtures","results","schedule","matches"]) {
    if (u.includes(token)) {
      if (["calendar","fixture","fixtures","results","schedule","matches"].includes(token)) penalty += 20;
      else penalty += 70;
      bad.push(token);
    }
  }
  return { penalty, badRouteHits: uniq(bad) };
}

const input = readJson(inputPath);
const shapeRows = (input.fetchRows || []).filter(r => r.bulkRouteShapeStatus === "L4_bulk_route_template_shape_candidate_requires_parser_contract" && r.snapshotBody);

const rows = shapeRows.map(r => {
  const body = readText(r.snapshotBody);
  const plain = cleanHtml(body);
  const tables = extractTables(body);
  const bestTable = tables[0] || null;
  const jsonSignals = discoverJsonSignals(body);
  const route = routePenalty(r.url);
  const visibleStatHits = hitList(plain.slice(0, 60000), statTokens);
  const standingsWordCount = count(plain, /\b(standings|standing|table|classification|classement|classifica|classificacao|classificação|posiciones|tabla|stilling|klassement|rankings?)\b/gi);

  let parserContractScore =
    (Number(r.shapeScore) || 0) +
    (bestTable ? bestTable.score : 0) +
    jsonSignals.score +
    visibleStatHits.length * 8 +
    Math.min(standingsWordCount, 20) * 3 -
    route.penalty;

  let status = "blocked_no_parser_contract_discovered";
  let parserMethod = "none";

  if (bestTable && bestTable.score >= 115 && bestTable.teamLikeDataRows >= 8 && route.badRouteHits.length === 0) {
    status = "L4_parser_contract_ready_html_table_requires_bulk_dry_extract";
    parserMethod = "html_table";
  } else if (jsonSignals.score >= 115 && (jsonSignals.keyHits.length >= 5 || jsonSignals.objectWithPointsCount >= 8 || jsonSignals.arrayWithTeamsCount >= 2) && route.penalty < 70) {
    status = "L4_parser_contract_ready_embedded_json_requires_bulk_dry_extract";
    parserMethod = "embedded_json";
  } else if (parserContractScore >= 230 && route.penalty < 70 && (bestTable || jsonSignals.score >= 70 || visibleStatHits.length >= 6)) {
    status = "L4_parser_contract_review_required_shape_only";
    parserMethod = "shape_only_review";
  }

  return {
    competitionSlug: r.competitionSlug,
    rank: r.rank,
    host: r.host,
    url: r.url,
    effectiveUrl: r.effectiveUrl,
    inputShapeScore: r.shapeScore,
    parserContractScore,
    parserContractDiscoveryStatus: status,
    parserMethod,
    htmlTableCount: tables.length,
    bestTable,
    jsonSignals,
    visibleStatHits,
    standingsWordCount,
    badRouteHits: route.badRouteHits,
    snapshotBody: r.snapshotBody,
    dryExtractAllowed: status.startsWith("L4_parser_contract_ready_"),
    canonicalCandidateWriteAllowed: false,
    productionTruthAllowed: false
  };
});

const bestBySlug = new Map();
for (const r of rows) {
  const prev = bestBySlug.get(r.competitionSlug);
  if (!prev || r.parserContractScore > prev.parserContractScore) bestBySlug.set(r.competitionSlug, r);
}
const bestRows = [...bestBySlug.values()].sort((a,b) => String(a.competitionSlug).localeCompare(String(b.competitionSlug)));

const summary = {
  status: "passed",
  inputL4ShapeCandidateRouteCount: shapeRows.length,
  inputL4ShapeCandidateSlugCount: uniq(shapeRows.map(r => r.competitionSlug)).length,
  parserContractReadyRouteCount: rows.filter(r => r.dryExtractAllowed).length,
  parserContractReadySlugCount: bestRows.filter(r => r.dryExtractAllowed).length,
  parserContractReviewRequiredSlugCount: bestRows.filter(r => r.parserContractDiscoveryStatus === "L4_parser_contract_review_required_shape_only").length,
  blockedSlugCount: bestRows.filter(r => r.parserContractDiscoveryStatus === "blocked_no_parser_contract_discovered").length,
  bestRowsByStatus: Object.entries(bestRows.reduce((a,r)=>{ a[r.parserContractDiscoveryStatus]=(a[r.parserContractDiscoveryStatus]||0)+1; return a; },{})).map(([status,count])=>({status,count})),
  routeRowsByStatus: Object.entries(rows.reduce((a,r)=>{ a[r.parserContractDiscoveryStatus]=(a[r.parserContractDiscoveryStatus]||0)+1; return a; },{})).map(([status,count])=>({status,count})),
  methodCounts: Object.entries(bestRows.reduce((a,r)=>{ a[r.parserMethod]=(a[r.parserMethod]||0)+1; return a; },{})).map(([method,count])=>({method,count})),
  readySlugs: bestRows.filter(r => r.dryExtractAllowed).map(r => r.competitionSlug),
  reviewRequiredSlugs: bestRows.filter(r => r.parserContractDiscoveryStatus === "L4_parser_contract_review_required_shape_only").map(r => r.competitionSlug),
  blockedSlugs: bestRows.filter(r => r.parserContractDiscoveryStatus === "blocked_no_parser_contract_discovered").map(r => r.competitionSlug),
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
  bestRows,
  policy: {
    localSnapshotsOnly: true,
    noFetch: true,
    noSearch: true,
    noStandingsExtraction: true,
    noCanonicalCandidateWrite: true,
    noProductionTruth: true,
    nextAllowedAction: "bulk_dry_extract_parser_contract_ready_only"
  }
};

writeJson(outPath,out);
console.log(JSON.stringify(summary,null,2));
