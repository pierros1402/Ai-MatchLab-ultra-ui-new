import fs from "node:fs";
import path from "node:path";

const outPath = "data/football-truth/_diagnostics/global-bulk-frontier-pivot-pack-2026-06-17/global-bulk-frontier-pivot-pack-2026-06-17.json";
const diagnosticsRoot = "data/football-truth/_diagnostics";
const canonicalRoot = "data/football-truth/_state/canonical-standings-candidates";

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
function slugOf(o){ return String(o?.competitionSlug || o?.slug || o?.normalizedCompetitionSlug || o?.competition_id || o?.id || "").trim(); }
function nameOf(o, slug){ return String(o?.competitionName || o?.name || o?.leagueName || o?.competition || o?.title || o?.label || slug || "").trim(); }
function typeOf(o){ return String(o?.competitionType || o?.type || o?.kind || o?.category || "").toLowerCase(); }
function countryOf(o){ return String(o?.countryName || o?.country || o?.countryCode || o?.countrySlug || o?.region || "").trim(); }
function isLeagueRow(o, slug){
  const t = typeOf(o);
  if(t.includes("cup") || t.includes("continental") || t.includes("international") || t.includes("registry_gap")) return false;
  if(t.includes("league")) return true;
  return /^[a-z]{2,3}\.\d+$/.test(slug);
}
function walkRows(x, sourceFile, found, depth=0){
  if(depth > 8 || !x) return;
  if(Array.isArray(x)){
    let slugRows = 0;
    for(const item of x.slice(0, 5000)){
      if(item && typeof item === "object" && slugOf(item)) slugRows++;
    }
    if(slugRows >= 5){
      for(const item of x){
        if(!item || typeof item !== "object") continue;
        const slug = slugOf(item);
        if(!slug || !isLeagueRow(item, slug)) continue;
        found.push({
          competitionSlug: slug,
          competitionName: nameOf(item, slug),
          country: countryOf(item),
          competitionType: typeOf(item) || "league_inferred_from_slug",
          sourceFile
        });
      }
      return;
    }
    for(const item of x.slice(0, 200)) walkRows(item, sourceFile, found, depth+1);
    return;
  }
  if(typeof x === "object"){
    for(const v of Object.values(x).slice(0, 80)) walkRows(v, sourceFile, found, depth+1);
  }
}
function collectSlugsFromJson(x, out=new Set(), depth=0){
  if(depth > 8 || !x) return out;
  if(Array.isArray(x)){
    for(const item of x.slice(0,10000)) collectSlugsFromJson(item,out,depth+1);
  } else if(typeof x === "object"){
    const s = slugOf(x);
    if(s) out.add(s);
    for(const v of Object.values(x).slice(0,120)) collectSlugsFromJson(v,out,depth+1);
  }
  return out;
}

const candidateFiles = listFiles(diagnosticsRoot)
  .filter(p => p.endsWith(".json"))
  .filter(p => {
    const b = path.basename(p).toLowerCase();
    return /competition.*map|full.*map|inventory|source.*registry|search.*target|frontier|official.*pack|lane.*pack/.test(b);
  })
  .filter(p => fs.statSync(p).size < 12 * 1024 * 1024);

const rawRows = [];
for(const f of candidateFiles){
  const j = readJson(f);
  if(j) walkRows(j, f, rawRows);
}

const universeBySlug = new Map();
for(const r of rawRows){
  if(!universeBySlug.has(r.competitionSlug)) universeBySlug.set(r.competitionSlug, r);
}
const universe = [...universeBySlug.values()].sort((a,b)=>a.competitionSlug.localeCompare(b.competitionSlug));

const canonicalSlugs = new Set();
for(const f of listFiles(canonicalRoot).filter(p => p.endsWith(".json"))){
  const j = readJson(f);
  collectSlugsFromJson(j, canonicalSlugs);
}

const exhaustedSlugs = new Set();
for(const rel of [
  "strict-l1-to-l2-source-identity-host-family-gate-2026-06-17/strict-l1-to-l2-source-identity-host-family-gate-2026-06-17.json",
  "bulk-official-route-template-shape-wave-2026-06-17/bulk-official-route-template-shape-wave-2026-06-17.json",
  "bulk-endpoint-hygiene-dry-extract-board-2026-06-17/bulk-endpoint-hygiene-dry-extract-board-2026-06-17.json"
]){
  const p = path.join(diagnosticsRoot, rel);
  const j = readJson(p);
  collectSlugsFromJson(j, exhaustedSlugs);
}

const suppressedSlugs = new Set(["afg.1","afg.2","afg.cup","pak.1","pak.2","pak.cup"]);
const alreadyDoneOrExhausted = new Set([...canonicalSlugs, ...exhaustedSlugs, ...suppressedSlugs]);

const frontier = universe
  .filter(r => !alreadyDoneOrExhausted.has(r.competitionSlug))
  .filter(r => /^[a-z]{2,3}\.\d+$/.test(r.competitionSlug))
  .slice(0, 160)
  .map((r, i) => {
    const name = r.competitionName && r.competitionName !== r.competitionSlug ? r.competitionName : r.competitionSlug;
    const country = r.country || "";
    return {
      priority: i + 1,
      competitionSlug: r.competitionSlug,
      competitionName: name,
      country,
      sourceFile: r.sourceFile,
      plannedSearchQueries: [
        `${name} ${country} official standings`,
        `${name} ${country} official league table`,
        `${name} official fixtures results standings`,
        `${r.competitionSlug} official football standings`
      ].map(q => q.replace(/\s+/g," ").trim()),
      plannedSearchOnly: true,
      fetchAllowedNow: false,
      canonicalWriteAllowedNow: false,
      productionTruthAllowedNow: false
    };
  });

const searchRunnerCandidates = listFiles("engine-v1/jobs")
  .filter(p => /\.(js|mjs|ps1)$/.test(p))
  .filter(p => /search|official.*frontier|provider.*discovery|fixture.*league.*date/i.test(path.basename(p)))
  .sort();

const summary = {
  status: frontier.length >= 40 ? "passed" : "review_required_low_frontier_count",
  scannedDiagnosticJsonCount: candidateFiles.length,
  rawLeagueRowCount: rawRows.length,
  universeLeagueSlugCount: universe.length,
  canonicalCoveredSlugCount: canonicalSlugs.size,
  exhaustedCurrentLaneSlugCount: exhaustedSlugs.size,
  suppressedSlugCount: suppressedSlugs.size,
  frontierTargetCount: frontier.length,
  plannedSearchQueryCount: frontier.reduce((a,r)=>a+r.plannedSearchQueries.length,0),
  searchRunnerCandidateCount: searchRunnerCandidates.length,
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  broadSearchExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0
};

const out = {
  generatedAtUtc: new Date().toISOString(),
  status: summary.status,
  summary,
  inputFiles: candidateFiles,
  canonicalCoveredSlugs: [...canonicalSlugs].sort(),
  exhaustedCurrentLaneSlugs: [...exhaustedSlugs].sort(),
  frontierTargets: frontier,
  searchRunnerCandidates,
  policy: {
    localPlanningOnly: true,
    noSearch: true,
    noFetch: true,
    noCanonicalCandidateWrite: true,
    noProductionTruth: true,
    nextAllowedAction: "run_large_frontier_official_search_wave_after_inspecting_runner_candidate"
  }
};

writeJson(outPath,out);
console.log(JSON.stringify(summary,null,2));
