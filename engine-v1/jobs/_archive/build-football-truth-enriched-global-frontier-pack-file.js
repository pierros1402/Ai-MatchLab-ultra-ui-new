import fs from "node:fs";
import path from "node:path";

const outPath = "data/football-truth/_diagnostics/enriched-global-frontier-pack-2026-06-17/enriched-global-frontier-pack-2026-06-17.json";
const canonicalRoot = "data/football-truth/_state/canonical-standings-candidates";
const diagnosticsRoot = "data/football-truth/_diagnostics";

function listFiles(dir, out=[]){
  if(!fs.existsSync(dir)) return out;
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const p = path.join(dir,e.name);
    if(e.isDirectory()) listFiles(p,out);
    else out.push(p);
  }
  return out;
}
function readJson(p){
  try { return JSON.parse(fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"")); } catch { return null; }
}
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }
function clean(v){ return String(v ?? "").replace(/\s+/g," ").trim(); }
function isSlug(s){ return /^[a-z]{2,3}\.\d+$/.test(String(s || "").trim()); }
function normSlug(s){ return clean(s).toLowerCase(); }
function meaningfulName(name, slug){
  const n = clean(name);
  if(!n || n.toLowerCase() === String(slug).toLowerCase()) return false;
  if(isSlug(n)) return false;
  if(n.length < 4) return false;
  return /[A-Za-zÀ-ž]/.test(n);
}
function pickDeepString(o, keys, depth=0){
  if(!o || typeof o !== "object" || depth > 4) return "";
  for(const k of keys){
    if(Object.prototype.hasOwnProperty.call(o,k) && typeof o[k] === "string" && clean(o[k])) return clean(o[k]);
  }
  for(const v of Object.values(o)){
    if(v && typeof v === "object"){
      const x = pickDeepString(v, keys, depth+1);
      if(x) return x;
    }
  }
  return "";
}
function pickSlug(o, depth=0){
  if(!o || typeof o !== "object" || depth > 4) return "";
  for(const k of ["competitionSlug","normalizedCompetitionSlug","slug","competition_id","competitionId","id","code"]){
    const v = o[k];
    if(typeof v === "string" && isSlug(v)) return normSlug(v);
  }
  for(const [k,v] of Object.entries(o)){
    if(/slug|competition|league|id/i.test(k) && typeof v === "string" && isSlug(v)) return normSlug(v);
  }
  for(const v of Object.values(o)){
    if(v && typeof v === "object"){
      const s = pickSlug(v, depth+1);
      if(s) return s;
    }
  }
  return "";
}
function pickName(o, slug){
  const n = pickDeepString(o, [
    "competitionName","normalizedCompetitionName","officialCompetitionName","leagueName","name","displayName","title","label","competition","league"
  ]);
  return meaningfulName(n, slug) ? n : "";
}
function pickCountry(o){
  return pickDeepString(o, ["countryName","country","countryCode","countrySlug","nation","area","region"]);
}
function pickType(o){
  return pickDeepString(o, ["competitionType","type","kind","category"]).toLowerCase();
}
function isLeagueRow(o, slug){
  const t = pickType(o);
  if(t.includes("cup") || t.includes("continental") || t.includes("international") || t.includes("registry_gap")) return false;
  if(t.includes("league")) return true;
  return isSlug(slug);
}
function rowScore(r){
  let s = 0;
  if(meaningfulName(r.competitionName, r.competitionSlug)) s += 100;
  if(r.country) s += 25;
  if(r.competitionType && r.competitionType !== "league_inferred_from_slug") s += 10;
  if(/full.*competition.*map|inventory|source.*registry|official.*pack|frontier/i.test(r.sourceFile)) s += 10;
  if(/diagnostics[\\\/]global-bulk-frontier-pivot-pack/i.test(r.sourceFile)) s -= 50;
  return s;
}
function walkRows(x, sourceFile, out, depth=0){
  if(depth > 8 || !x) return;
  if(Array.isArray(x)){
    for(const item of x.slice(0, 10000)) walkRows(item, sourceFile, out, depth+1);
    return;
  }
  if(typeof x === "object"){
    const slug = pickSlug(x);
    if(slug && isLeagueRow(x, slug)){
      const name = pickName(x, slug);
      const country = pickCountry(x);
      out.push({
        competitionSlug: slug,
        competitionName: name || slug,
        country,
        competitionType: pickType(x) || "league_inferred_from_slug",
        hasMeaningfulName: meaningfulName(name, slug),
        sourceFile
      });
    }
    for(const v of Object.values(x).slice(0, 120)) walkRows(v, sourceFile, out, depth+1);
  }
}
function collectSlugs(x, out=new Set(), depth=0){
  if(depth > 8 || !x) return out;
  if(Array.isArray(x)){
    for(const v of x.slice(0,10000)) collectSlugs(v,out,depth+1);
  } else if(typeof x === "object"){
    const s = pickSlug(x);
    if(s) out.add(s);
    for(const v of Object.values(x).slice(0,120)) collectSlugs(v,out,depth+1);
  }
  return out;
}

const jsonFiles = [
  ...listFiles("data/football-truth").filter(p => p.endsWith(".json")),
  ...listFiles("data").filter(p => p.endsWith(".json") && !p.includes("football-truth"))
]
.filter((p,i,a) => a.indexOf(p) === i)
.filter(p => {
  try {
    const size = fs.statSync(p).size;
    const b = path.basename(p).toLowerCase();
    return size > 100 && size < 15 * 1024 * 1024 && !/node_modules|snapshots|canonical-candidate-approval-pack/.test(p) && /competition|inventory|map|source|registry|target|frontier|league|standings|provider|official/.test(b + " " + p.toLowerCase());
  } catch { return false; }
});

const rawRows = [];
const sourceStats = new Map();
for(const f of jsonFiles){
  const j = readJson(f);
  if(!j) continue;
  const before = rawRows.length;
  walkRows(j, f, rawRows);
  const fileRows = rawRows.slice(before);
  if(fileRows.length){
    const unique = new Set(fileRows.map(r=>r.competitionSlug));
    const named = fileRows.filter(r=>r.hasMeaningfulName).length;
    sourceStats.set(f, {
      file:f,
      rowCount:fileRows.length,
      uniqueSlugCount:unique.size,
      meaningfulNameRowCount:named,
      meaningfulNameCoverage:fileRows.length ? named/fileRows.length : 0
    });
  }
}

const bestBySlug = new Map();
for(const r of rawRows){
  const prev = bestBySlug.get(r.competitionSlug);
  const rs = rowScore(r);
  const ps = prev ? rowScore(prev) : -999;
  if(!prev || rs > ps) bestBySlug.set(r.competitionSlug, r);
}
const enrichedUniverse = [...bestBySlug.values()].filter(r => r.hasMeaningfulName).sort((a,b)=>a.competitionSlug.localeCompare(b.competitionSlug));

const canonicalSlugs = new Set();
for(const f of listFiles(canonicalRoot).filter(p => p.endsWith(".json"))){
  const j = readJson(f);
  if(j) collectSlugs(j, canonicalSlugs);
}

const exhaustedSlugs = new Set();
for(const rel of [
  "strict-l1-to-l2-source-identity-host-family-gate-2026-06-17/strict-l1-to-l2-source-identity-host-family-gate-2026-06-17.json",
  "bulk-official-route-template-shape-wave-2026-06-17/bulk-official-route-template-shape-wave-2026-06-17.json",
  "bulk-endpoint-hygiene-dry-extract-board-2026-06-17/bulk-endpoint-hygiene-dry-extract-board-2026-06-17.json"
]){
  const p = path.join(diagnosticsRoot, rel);
  const j = readJson(p);
  if(j) collectSlugs(j, exhaustedSlugs);
}

const suppressedSlugs = new Set(["afg.1","afg.2","pak.1","pak.2"]);
const blocked = new Set([...canonicalSlugs, ...exhaustedSlugs, ...suppressedSlugs]);

const frontierTargets = enrichedUniverse
  .filter(r => !blocked.has(r.competitionSlug))
  .slice(0, 160)
  .map((r,i) => {
    const base = `${r.competitionName}${r.country ? " " + r.country : ""}`.replace(/\s+/g," ").trim();
    return {
      priority:i+1,
      competitionSlug:r.competitionSlug,
      competitionName:r.competitionName,
      country:r.country,
      sourceFile:r.sourceFile,
      plannedSearchQueries:[
        `${base} official standings`,
        `${base} official league table`,
        `${base} football official table`,
        `${base} fixtures results standings official`
      ],
      plannedSearchOnly:true,
      fetchAllowedNow:false,
      canonicalWriteAllowedNow:false,
      productionTruthAllowedNow:false
    };
  });

const sourceTop = [...sourceStats.values()]
  .sort((a,b)=>(b.uniqueSlugCount*1000 + b.meaningfulNameRowCount) - (a.uniqueSlugCount*1000 + a.meaningfulNameRowCount))
  .slice(0,25);

const summary = {
  status: frontierTargets.length >= 40 && frontierTargets.every(t => meaningfulName(t.competitionName, t.competitionSlug)) ? "passed" : "blocked_low_enriched_frontier_quality",
  scannedJsonFileCount: jsonFiles.length,
  rawCandidateRowCount: rawRows.length,
  uniqueLeagueSlugCount: bestBySlug.size,
  enrichedMeaningfulNameSlugCount: enrichedUniverse.length,
  canonicalCoveredSlugCount: canonicalSlugs.size,
  exhaustedCurrentLaneSlugCount: exhaustedSlugs.size,
  frontierTargetCount: frontierTargets.length,
  plannedSearchQueryCount: frontierTargets.reduce((a,r)=>a+r.plannedSearchQueries.length,0),
  targetsWithCountryCount: frontierTargets.filter(t=>t.country).length,
  firstTargetSlugs: frontierTargets.slice(0,20).map(t=>t.competitionSlug),
  searchExecutedNowCount:0,
  fetchExecutedNowCount:0,
  broadSearchExecutedNowCount:0,
  canonicalWriteExecutedNowCount:0,
  productionWriteExecutedNowCount:0,
  truthAssertionExecutedNowCount:0
};

const out = {
  generatedAtUtc:new Date().toISOString(),
  status:summary.status,
  summary,
  sourceTop,
  frontierTargets,
  canonicalCoveredSlugs:[...canonicalSlugs].sort(),
  exhaustedCurrentLaneSlugs:[...exhaustedSlugs].sort(),
  policy:{
    localPlanningOnly:true,
    noSearch:true,
    noFetch:true,
    noCanonicalCandidateWrite:true,
    noProductionTruth:true,
    requiresMeaningfulCompetitionNames:true,
    nextAllowedAction:"run_enriched_frontier_official_search_wave_only_if_summary_status_passed"
  }
};

writeJson(outPath,out);
console.log(JSON.stringify(summary,null,2));
if(summary.status !== "passed") process.exitCode = 1;
