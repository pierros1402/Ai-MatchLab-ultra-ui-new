import fs from "node:fs";
import path from "node:path";

const inputPath = "data/football-truth/_diagnostics/wal2-faw-controlled-route-probe-2026-06-17/wal2-faw-controlled-route-probe-2026-06-17.json";
const outPath = "data/football-truth/_diagnostics/wal2-faw-snapshot-route-asset-miner-2026-06-17/wal2-faw-snapshot-route-asset-miner-2026-06-17.json";

function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"")); }
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }
function clean(s){ return String(s ?? "").replace(/\s+/g," ").trim(); }
function strip(html){
  return clean(String(html||"")
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&"));
}
function attrs(html, tag, attr){
  const out = [];
  const re = new RegExp(`<${tag}\\b[^>]*\\s${attr}=["']([^"']+)["'][^>]*>`, "gi");
  let m;
  while((m = re.exec(html))) out.push(m[1]);
  return [...new Set(out)];
}
function absolutize(u, base){
  try { return new URL(u, base).toString(); } catch { return String(u || ""); }
}
function relevantUrl(u){
  const s = String(u||"").toLowerCase();
  return /(cymru|north|south|standings|standing|table|fixtures|results|league|competition|api|wp-json|ajax|json|data|footballwebpages|fa-fulltime|fulltime|sportlomo|leaguerepublic|pitchero|assets|js)/i.test(s);
}
function tableBlocks(html){
  const out = [];
  const re = /<table\b[\s\S]*?<\/table>/gi;
  let m;
  while((m = re.exec(html))) out.push(m[0]);
  return out;
}
function tableScore(tableHtml){
  const text = strip(tableHtml).toLowerCase();
  const tr = (tableHtml.match(/<tr\b/gi)||[]).length;
  const td = (tableHtml.match(/<t[dh]\b/gi)||[]).length;
  const tokens = (text.match(/team|club|played|pld|won|draw|lost|goals|gd|points|pts|cymru|north|south/g)||[]).length;
  return tr * 8 + td + tokens * 20;
}
function inlineJsonSignals(html){
  const out = [];
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while((m = re.exec(html))){
    const body = m[1] || "";
    const lower = body.toLowerCase();
    if(/cymru|standings|league_table|league-table|fixtures|results|wp-json|ajax|competition|teams|points|played/.test(lower)){
      out.push({
        byteLength: Buffer.byteLength(body),
        preview: clean(body.slice(0,600)),
        tokenHits: (lower.match(/cymru|standings|league_table|league-table|fixtures|results|wp-json|ajax|competition|teams|points|played/g)||[]).length
      });
    }
  }
  return out.slice(0,20);
}

const input = readJson(inputPath);
const rows = input.fetchRows || [];
const snapshotRows = [];

for(const r of rows){
  const p = r.snapshotPath;
  if(!p || !fs.existsSync(p)) continue;
  const html = fs.readFileSync(p, "utf8");
  const visible = strip(html);
  const base = r.effectiveUrl || r.url;
  const pageTitle = clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || r.pageTitle || "");
  const links = attrs(html, "a", "href").map(u => absolutize(u, base)).filter(relevantUrl);
  const scripts = attrs(html, "script", "src").map(u => absolutize(u, base)).filter(relevantUrl);
  const iframes = attrs(html, "iframe", "src").map(u => absolutize(u, base)).filter(relevantUrl);
  const forms = attrs(html, "form", "action").map(u => absolutize(u, base)).filter(relevantUrl);
  const tables = tableBlocks(html).map((t,i)=>({
    tableIndex:i+1,
    score:tableScore(t),
    trCount:(t.match(/<tr\b/gi)||[]).length,
    cellCount:(t.match(/<t[dh]\b/gi)||[]).length,
    preview:strip(t).slice(0,1200)
  })).sort((a,b)=>b.score-a.score);
  const inlineSignals = inlineJsonSignals(html);
  const visibleHits = (visible.toLowerCase().match(/cymru north|cymru south|standings|league table|fixtures|results|played|points|pts|won|lost|draw/g)||[]).length;

  let minerScore = 0;
  if(tables[0]?.score >= 120) minerScore += 120;
  minerScore += Math.min(links.length,20) * 6;
  minerScore += Math.min(scripts.length,20) * 8;
  minerScore += Math.min(iframes.length,10) * 20;
  minerScore += Math.min(inlineSignals.length,10) * 14;
  minerScore += Math.min(visibleHits,20) * 5;

  let minerStatus = "no_local_route_or_table_signal";
  if(tables[0]?.score >= 160) minerStatus = "local_html_table_candidate_requires_dry_extract";
  else if(iframes.length || scripts.length || inlineSignals.length || links.some(x=>/standings|table|fixtures|results|wp-json|ajax|api/i.test(x))) minerStatus = "local_route_or_asset_signal_requires_controlled_followup_probe";
  else if(minerScore >= 80) minerStatus = "local_review_signal_weak_route_context";

  snapshotRows.push({
    competitionSlug:"wal.2",
    sourceUrl:r.url,
    snapshotPath:p,
    pageTitle,
    snapshotByteLength:Buffer.byteLength(html),
    tableCount:tables.length,
    bestTableScore:tables[0]?.score || 0,
    links,
    scripts,
    iframes,
    forms,
    inlineSignals,
    tables:tables.slice(0,5),
    visibleHits,
    minerScore,
    minerStatus
  });
}

const tableCandidateRows = snapshotRows.filter(r => r.minerStatus === "local_html_table_candidate_requires_dry_extract");
const routeAssetRows = snapshotRows.filter(r => r.minerStatus === "local_route_or_asset_signal_requires_controlled_followup_probe");
const reviewRows = snapshotRows.filter(r => r.minerStatus === "local_review_signal_weak_route_context");
const bestRows = [...snapshotRows].sort((a,b)=>b.minerScore-a.minerScore).slice(0,12);

const candidateFollowupUrls = [...new Set(routeAssetRows.flatMap(r => [...r.iframes, ...r.links, ...r.scripts, ...r.forms]).filter(relevantUrl))]
  .filter(u => /^https?:\/\//i.test(u))
  .slice(0,80);

const summary = {
  status:"passed",
  sourceProbePath:inputPath,
  snapshotReviewedCount:snapshotRows.length,
  tableCandidateCount:tableCandidateRows.length,
  routeAssetSignalCount:routeAssetRows.length,
  reviewWeakSignalCount:reviewRows.length,
  candidateFollowupUrlCount:candidateFollowupUrls.length,
  bestMinerStatus:bestRows[0]?.minerStatus || null,
  bestMinerScore:bestRows[0]?.minerScore ?? null,
  searchExecutedNowCount:0,
  fetchExecutedNowCount:0,
  broadSearchExecutedNowCount:0,
  standingsExtractionExecutedNowCount:0,
  canonicalWriteExecutedNowCount:0,
  productionWriteExecutedNowCount:0,
  truthAssertionExecutedNowCount:0
};

writeJson(outPath,{
  generatedAtUtc:new Date().toISOString(),
  status:"passed",
  summary,
  tableCandidateRows,
  routeAssetRows,
  reviewRows,
  bestRows,
  candidateFollowupUrls,
  policy:{
    localSnapshotMiningOnly:true,
    noSearch:true,
    noFetch:true,
    noCanonicalCandidateWrite:true,
    noProductionTruth:true,
    nextAllowedAction:"dry_extract_local_table_candidates_or_controlled_followup_probe_for_candidate_urls_else_park_wal2"
  }
});
console.log(JSON.stringify(summary,null,2));
