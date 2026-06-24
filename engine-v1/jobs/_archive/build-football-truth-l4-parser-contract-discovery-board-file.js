import fs from "node:fs";
import path from "node:path";

const inputPath = "data/football-truth/_diagnostics/l4-standings-shape-probe-local-2026-06-17/l4-standings-shape-probe-local-2026-06-17.json";
const outPath = "data/football-truth/_diagnostics/l4-parser-contract-discovery-board-2026-06-17/l4-parser-contract-discovery-board-2026-06-17.json";

function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"")); }
function readText(p){ return fs.existsSync(p) ? fs.readFileSync(p,"utf8") : ""; }
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }
function cleanHtml(s){
  return String(s ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/g," ")
    .replace(/&amp;/g,"&")
    .replace(/&#8211;/g,"-")
    .replace(/\s+/g," ")
    .trim();
}
function cleanCell(s){
  return String(s ?? "")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/g," ")
    .replace(/&amp;/g,"&")
    .replace(/\s+/g," ")
    .trim();
}
function matches(text, re){
  return [...String(text ?? "").matchAll(re)];
}
function count(text, re){
  return matches(text,re).length;
}
function uniq(a){
  return [...new Set(a.filter(Boolean))];
}
function hitList(text, tokens){
  const t = String(text ?? "").toLowerCase();
  return uniq(tokens.filter(x => t.includes(String(x).toLowerCase())));
}

const statTokens = [
  "played","pld","mp","matches played","won","drawn","lost","goals for","goals against",
  "goal difference","gd","points","pts","puntos","punten","v","e","d"
];

const tableHeaderTokens = [
  "team","club","clubs","position","pos","rank","#","played","pld","mp","won","drawn","lost","gd","points","pts"
];

const jsonKeys = [
  "standings","standing","table","rank","ranking","position","club","team","teamName","played",
  "matchesPlayed","won","wins","drawn","draws","lost","losses","points","pts","goalsFor",
  "goalsAgainst","goalDifference","leagueTable","competitionTable"
];

function extractTables(body){
  const tables = matches(body, /<table\b[\s\S]*?<\/table>/gi).map((m, idx) => {
    const html = m[0];
    const tr = matches(html, /<tr\b[\s\S]*?<\/tr>/gi).map(r => r[0]);
    const parsedRows = tr.map(rowHtml => {
      return matches(rowHtml, /<t[dh]\b[\s\S]*?<\/t[dh]>/gi).map(c => cleanCell(c[0]));
    }).filter(r => r.length);
    const header = parsedRows[0] || [];
    const sampleRows = parsedRows.slice(1, 6);
    const allText = parsedRows.flat().join(" ");
    const headerHits = hitList(header.join(" "), tableHeaderTokens);
    const statHits = hitList(allText, statTokens);
    const dataRowCount = parsedRows.filter(r => r.length >= 4).length;
    const score =
      (dataRowCount >= 8 ? 60 : dataRowCount * 5) +
      (headerHits.length * 12) +
      (statHits.length * 8);
    return {
      tableIndex: idx,
      trCount: tr.length,
      parsedRowCount: parsedRows.length,
      dataRowCount,
      header,
      headerHits,
      statHits,
      sampleRows,
      score
    };
  });
  return tables.sort((a,b) => b.score - a.score);
}

function discoverJsonSignals(body){
  const keyHits = jsonKeys.filter(k => new RegExp(`["']?${k}["']?\\s*:`, "i").test(body));
  const nextDataCount = count(body, /id=["']__NEXT_DATA__["']/gi);
  const scriptJsonCount = count(body, /<script[^>]+type=["']application\/json["'][^>]*>/gi);
  const objectWithPointsCount = count(body, /\{[^{}]{0,800}(points|pts|played|matchesPlayed|goalDifference|standings|table)[^{}]{0,800}\}/gi);
  const arrayWithTeamsCount = count(body, /\[[\s\S]{0,4000}(team|club|teamName)[\s\S]{0,4000}(points|pts|played|standings|table)[\s\S]{0,4000}\]/gi);
  const score =
    keyHits.length * 15 +
    Math.min(objectWithPointsCount, 20) * 4 +
    Math.min(arrayWithTeamsCount, 5) * 15 +
    nextDataCount * 20 +
    scriptJsonCount * 10;
  return {
    keyHits,
    nextDataCount,
    scriptJsonCount,
    objectWithPointsCount,
    arrayWithTeamsCount,
    score
  };
}

const input = readJson(inputPath);
const l4Rows = (input.bestRows || []).filter(r => r.standingsShapeProbeStatus === "L4_standings_shape_candidate_requires_parser_contract");

const rows = l4Rows.map(r => {
  const body = readText(r.snapshotBody);
  const plain = cleanHtml(body);
  const tables = extractTables(body);
  const bestTable = tables[0] || null;
  const jsonSignals = discoverJsonSignals(body);
  const visibleStatHits = hitList(plain.slice(0, 40000), statTokens);
  const standingsWordCount = count(plain, /\b(standings|standing|table|classification|classement|classifica|classificacao|classificação|posiciones|tabla|stilling)\b/gi);

  let status = "blocked_no_parser_contract_discovered";
  let parserMethod = "none";

  if (bestTable && bestTable.score >= 115 && bestTable.dataRowCount >= 8) {
    status = "L4_parser_contract_ready_html_table_requires_dry_extract";
    parserMethod = "html_table";
  } else if (jsonSignals.score >= 100 && (jsonSignals.keyHits.length >= 5 || jsonSignals.objectWithPointsCount >= 8)) {
    status = "L4_parser_contract_ready_embedded_json_requires_dry_extract";
    parserMethod = "embedded_json";
  } else if ((r.shapeScore || 0) >= 180 && visibleStatHits.length >= 5) {
    status = "L4_parser_contract_review_required_shape_only";
    parserMethod = "shape_only_review";
  }

  return {
    competitionSlug: r.competitionSlug,
    source: r.source,
    host: r.host,
    url: r.url,
    effectiveUrl: r.effectiveUrl,
    snapshotBody: r.snapshotBody,
    inputShapeScore: r.shapeScore,
    parserContractDiscoveryStatus: status,
    parserMethod,
    htmlTableCount: tables.length,
    bestTable,
    jsonSignals,
    visibleStatHits,
    standingsWordCount,
    dryExtractAllowed: status.startsWith("L4_parser_contract_ready_"),
    canonicalCandidateWriteAllowed: false,
    productionTruthAllowed: false
  };
});

const summary = {
  status: "passed",
  inputL4ShapeCandidateSlugCount: l4Rows.length,
  parserContractReadySlugCount: rows.filter(r => r.parserContractDiscoveryStatus.startsWith("L4_parser_contract_ready_")).length,
  parserContractReviewRequiredCount: rows.filter(r => r.parserContractDiscoveryStatus === "L4_parser_contract_review_required_shape_only").length,
  blockedCount: rows.filter(r => r.parserContractDiscoveryStatus === "blocked_no_parser_contract_discovered").length,
  statusCounts: Object.entries(rows.reduce((a,r)=>{ a[r.parserContractDiscoveryStatus]=(a[r.parserContractDiscoveryStatus]||0)+1; return a; },{})).map(([status,count])=>({status,count})),
  methodCounts: Object.entries(rows.reduce((a,r)=>{ a[r.parserMethod]=(a[r.parserMethod]||0)+1; return a; },{})).map(([method,count])=>({method,count})),
  readySlugs: rows.filter(r => r.parserContractDiscoveryStatus.startsWith("L4_parser_contract_ready_")).map(r => r.competitionSlug),
  reviewRequiredSlugs: rows.filter(r => r.parserContractDiscoveryStatus === "L4_parser_contract_review_required_shape_only").map(r => r.competitionSlug),
  blockedSlugs: rows.filter(r => r.parserContractDiscoveryStatus === "blocked_no_parser_contract_discovered").map(r => r.competitionSlug),
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
    localSnapshotsOnly: true,
    noFetch: true,
    noSearch: true,
    noStandingsExtraction: true,
    noCanonicalCandidateWrite: true,
    noProductionTruth: true,
    nextAllowedAction: "dry_extract_parser_contract_ready_only"
  }
};

writeJson(outPath,out);
console.log(JSON.stringify(summary,null,2));

