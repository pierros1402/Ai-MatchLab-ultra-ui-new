import fs from "node:fs";
import path from "node:path";

const seedPath = "data/football-truth/_diagnostics/exact-official-domain-seed-probe-2026-06-17/exact-official-domain-seed-probe-2026-06-17.json";
const outPath = "data/football-truth/_diagnostics/emergency-official-route-snapshot-extractor-2026-06-17/emergency-official-route-snapshot-extractor-2026-06-17.json";

function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"")); }
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }
function clean(s){ return String(s ?? "").replace(/\s+/g," ").trim(); }
function decode(s){ return clean(String(s ?? "").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&#8211;/gi,"-").replace(/&#8212;/gi,"-").replace(/&quot;/gi,'"').replace(/&#39;/gi,"'")); }
function strip(html){ return decode(String(html||"").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ")); }
function readText(p){ try { return fs.readFileSync(p,"utf8"); } catch { return ""; } }
function attrs(html, tag, attr){
  const out=[]; const re=new RegExp(`<${tag}\\b[^>]*\\s${attr}=["']([^"']+)["'][^>]*>`, "gi"); let m;
  while((m=re.exec(html))) out.push(m[1]);
  return [...new Set(out)];
}
function absolutize(u, base){ try { return new URL(u, base).toString(); } catch { return String(u||""); } }
function scriptBodies(html){
  const out=[]; const re=/<script\b[^>]*>([\s\S]*?)<\/script>/gi; let m;
  while((m=re.exec(html))) out.push(m[1] || "");
  return out;
}
function findBalancedJsonAround(text, idx){
  let start = text.lastIndexOf("{", idx);
  if(start < 0) return "";
  let depth=0, inStr=false, esc=false;
  for(let i=start;i<Math.min(text.length,start+200000);i++){
    const ch=text[i];
    if(inStr){
      if(esc) esc=false;
      else if(ch==="\\") esc=true;
      else if(ch === '"') inStr=false;
    } else {
      if(ch === '"') inStr=true;
      else if(ch === "{") depth++;
      else if(ch === "}"){
        depth--;
        if(depth===0) return text.slice(start,i+1);
      }
    }
  }
  return "";
}
function flattenObjects(x,out=[],depth=0){
  if(!x || depth>10) return out;
  if(Array.isArray(x)){ for(const v of x) flattenObjects(v,out,depth+1); return out; }
  if(typeof x==="object"){
    out.push(x);
    for(const v of Object.values(x)) if(v && typeof v==="object") flattenObjects(v,out,depth+1);
  }
  return out;
}
function get(o,names){
  for(const n of names){
    if(o && Object.prototype.hasOwnProperty.call(o,n) && o[n] !== null && o[n] !== undefined && clean(o[n]) !== "") return o[n];
  }
  return "";
}
function toNum(v){ const s=clean(v).replace(",","."); return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null; }
function likelyStandingObject(o){
  const name = get(o,["team","teamName","club","clubName","name","displayName","shortName","TeamName","ClubName","team_name","club_name"]);
  if(!name || !/[A-Za-zÀ-žΑ-ωΆ-ώ]/.test(String(name))) return null;
  const played = toNum(get(o,["played","matchesPlayed","playedMatches","gamesPlayed","P","MP","matchplayed","games","pld","Played"]));
  const won = toNum(get(o,["won","wins","W","Won"]));
  const drawn = toNum(get(o,["drawn","draw","draws","D","Drawn"]));
  const lost = toNum(get(o,["lost","losses","L","Lost"]));
  const points = toNum(get(o,["points","pts","Pts","PTS","Points"]));
  const gf = toNum(get(o,["goalsFor","for","gf","GF","scored","goals_scored"]));
  const ga = toNum(get(o,["goalsAgainst","against","ga","GA","conceded","goals_conceded"]));
  const rank = toNum(get(o,["rank","position","pos","standing","place","Position"]));
  const numericPresent = [played,won,drawn,lost,points,gf,ga,rank].filter(v=>v!==null).length;
  if(numericPresent < 4) return null;
  return {rank, team:clean(name), played, won, drawn, lost, gf, ga, points, raw:o};
}
function extractJsonStandingRows(html){
  const hay = html;
  const markers = ["standings","leagueTable","table","ranking","points","matchesPlayed","teamName","clubName"];
  const candidates = [];
  for(const marker of markers){
    let idx = 0;
    while((idx = hay.toLowerCase().indexOf(marker.toLowerCase(), idx)) >= 0){
      const js = findBalancedJsonAround(hay, idx);
      if(js && js.length > 20) candidates.push(js);
      idx += marker.length;
    }
  }
  const rows = [];
  for(const c of [...new Set(candidates)].slice(0,80)){
    try {
      const parsed = JSON.parse(c);
      for(const o of flattenObjects(parsed)){
        const r = likelyStandingObject(o);
        if(r) rows.push(r);
      }
    } catch {}
  }
  const seen = new Set(), out=[];
  for(const r of rows){
    const key = `${r.team}|${r.played}|${r.points}`;
    if(!seen.has(key)){ seen.add(key); out.push(r); }
  }
  return out;
}
function extractVisibleLineRows(html){
  const text = strip(html);
  const lines = text.split(/\n| {2,}/).map(clean).filter(Boolean);
  const rows=[];
  for(let i=0;i<lines.length;i++){
    const window = lines.slice(i,i+12).join(" ");
    const nums = (window.match(/\b\d{1,3}\b/g)||[]).map(Number);
    if(nums.length >= 6 && /[A-Za-zÀ-žΑ-ωΆ-ώ]{3,}/.test(window)){
      const teamMatch = window.match(/[A-Za-zÀ-žΑ-ωΆ-ώ][A-Za-zÀ-žΑ-ωΆ-ώ .'-]{2,}/);
      if(teamMatch) rows.push({team:clean(teamMatch[0]), nums, rawText:window});
    }
  }
  return rows.slice(0,40);
}

const seed = readJson(seedPath);
const routeRows = (seed.routeCandidateRows || []).filter(r => ["gre.1","ind.1"].includes(r.competitionSlug));
const tableRows = (seed.tableCandidateRows || []).filter(r => ["gre.1","ind.1"].includes(r.competitionSlug));
const candidateRows = [...routeRows, ...tableRows];

const extractRows = [];
const pageAudits = [];

for(const c of candidateRows){
  const html = readText(c.snapshotPath);
  if(!html){
    pageAudits.push({...c, extractorStatus:"blocked_missing_snapshot"});
    continue;
  }
  const base = c.effectiveUrl || c.url;
  const scripts = attrs(html,"script","src").map(u=>absolutize(u,base)).filter(u=>/api|json|standings|table|league|competition|scoreboard|static|assets|js/i.test(u));
  const links = attrs(html,"a","href").map(u=>absolutize(u,base)).filter(u=>/standings|table|league|competition|scoreboard|fixtures|results/i.test(u));
  const bodies = scriptBodies(html);
  const jsonRows = extractJsonStandingRows(html);
  const lineRows = jsonRows.length ? [] : extractVisibleLineRows(html);
  const currentSeasonHit = /(2025[\s/-]*2026|2025\s*-\s*26|2025\/26|season\s*2025|2026)/i.test(`${c.pageTitle} ${c.url} ${strip(html).slice(0,50000)}`);
  let status = "blocked_no_extractable_current_rows";
  if(jsonRows.length >= 8 && currentSeasonHit) status = "current_rows_extracted_from_embedded_json_requires_reconciliation";
  else if(lineRows.length >= 8 && currentSeasonHit) status = "review_current_rows_possible_from_visible_text_requires_parser_contract";
  else if(scripts.length || links.length) status = "route_assets_found_requires_controlled_asset_probe";
  pageAudits.push({
    competitionSlug:c.competitionSlug,
    competitionName:c.competitionName,
    sourceUrl:c.url,
    host:c.host,
    pageTitle:c.pageTitle,
    snapshotPath:c.snapshotPath,
    sourceProbeStatus:c.probeStatus,
    sourceShapeScore:c.shapeScore,
    currentSeasonHit,
    scriptSignalCount:scripts.length,
    linkSignalCount:links.length,
    inlineScriptCount:bodies.length,
    embeddedJsonStandingRowCount:jsonRows.length,
    visibleLineCandidateRowCount:lineRows.length,
    extractorStatus:status,
    scriptSignals:scripts.slice(0,40),
    linkSignals:links.slice(0,40),
    sampleJsonRows:jsonRows.slice(0,12).map(({raw,...r})=>r),
    sampleLineRows:lineRows.slice(0,12)
  });
  for(const [idx,r] of jsonRows.entries()){
    extractRows.push({competitionSlug:c.competitionSlug, sourceUrl:c.url, extractionMode:"embedded_json", rowIndex:idx+1, ...r});
  }
}

const currentExtracted = pageAudits.filter(r=>r.extractorStatus==="current_rows_extracted_from_embedded_json_requires_reconciliation");
const reviewExtracted = pageAudits.filter(r=>String(r.extractorStatus).startsWith("review_"));
const assetProbeNeeded = pageAudits.filter(r=>r.extractorStatus==="route_assets_found_requires_controlled_asset_probe");

const summary = {
  status:"passed",
  candidateSnapshotCount:candidateRows.length,
  pageAuditCount:pageAudits.length,
  currentRowsExtractedCompetitionCount:new Set(currentExtracted.map(r=>r.competitionSlug)).size,
  reviewPossibleRowsCompetitionCount:new Set(reviewExtracted.map(r=>r.competitionSlug)).size,
  assetProbeNeededCompetitionCount:new Set(assetProbeNeeded.map(r=>r.competitionSlug)).size,
  embeddedJsonExtractedRowCount:extractRows.length,
  extractorStatusCounts:Object.entries(pageAudits.reduce((a,r)=>{a[r.extractorStatus]=(a[r.extractorStatus]||0)+1; return a;},{})).map(([status,count])=>({status,count})),
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
  pageAudits,
  currentExtracted,
  reviewExtracted,
  assetProbeNeeded,
  extractedStandingRows:extractRows,
  policy:{
    emergencyLocalSnapshotExtractorOnly:true,
    noSearch:true,
    noFetch:true,
    noCanonicalCandidateWrite:true,
    noProductionTruth:true,
    progressDefinition:"current season extracted standings rows requiring reconciliation"
  }
});
console.log(JSON.stringify(summary,null,2));
