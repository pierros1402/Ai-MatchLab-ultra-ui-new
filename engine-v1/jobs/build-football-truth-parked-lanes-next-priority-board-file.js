import fs from "node:fs";
import path from "node:path";

const outPath = "data/football-truth/_diagnostics/parked-lanes-next-priority-board-2026-06-17/parked-lanes-next-priority-board-2026-06-17.json";

function readJsonMaybe(p){ try { return JSON.parse(fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"")); } catch { return null; } }
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }
function clean(s){ return String(s ?? "").replace(/\s+/g," ").trim(); }
function listJson(dir,out=[]){
  if(!fs.existsSync(dir)) return out;
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const p = path.join(dir,e.name);
    if(e.isDirectory()) listJson(p,out);
    else if(e.name.endsWith(".json")) out.push(p);
  }
  return out;
}
function walk(x, cb, depth=0){
  if(!x || depth > 9) return;
  if(Array.isArray(x)){ for(const v of x) walk(v,cb,depth+1); return; }
  if(typeof x === "object"){
    cb(x);
    for(const v of Object.values(x).slice(0,180)){
      if(v && typeof v === "object") walk(v,cb,depth+1);
    }
  }
}
function slugOf(o){ return clean(o.competitionSlug || o.normalizedCompetitionSlug || o.slug || o.competitionId || o.id); }
function nameOf(o){ return clean(o.competitionName || o.name || o.leagueName || o.displayName || o.title || o.competition || o.league); }
function countryOf(o){ return clean(o.country || o.countryName || o.normalizedCountry || o.associationCountry || o.regionCountry); }
function isLeagueSlug(s){ return /^[a-z]{2,3}\.\d+$/.test(s) && !/\.cup$/.test(s); }

const paths = {
  walMiner:"data/football-truth/_diagnostics/wal2-faw-snapshot-route-asset-miner-2026-06-17/wal2-faw-snapshot-route-asset-miner-2026-06-17.json",
  laneBoard:"data/football-truth/_diagnostics/bulk-lane-decision-board-2026-06-17/bulk-lane-decision-board-2026-06-17.json",
  highYieldTargets:"data/football-truth/_diagnostics/high-yield-named-frontier-search-wave-2026-06-17/high-yield-named-frontier-search-targets-2026-06-17.json",
  cleanSecondWave:"data/football-truth/_diagnostics/clean-second-wave-named-route-hint-search-2026-06-17/clean-second-wave-named-route-hint-classifier-2026-06-17.json",
  l2Gate:"data/football-truth/_diagnostics/strict-l1-to-l2-source-identity-host-family-gate-2026-06-17/strict-l1-to-l2-source-identity-host-family-gate-2026-06-17.json",
  sourceRegistry:"data/football-truth/_state/source-registry/source-registry-2026-06-17.json"
};

const canonicalCovered = new Set(["ger.1","ger.2","esp.1","esp.2","nor.1","nor.2","aut.1","aut.2","fin.1","swe.1","swe.2"]);
const suppressedLowValue = new Set(["afg.1","afg.2","pak.1","pak.2"]);
const parkedByPolicy = new Map([
  ["wal.2",{reason:"WAL2/FAW had no local extractable table and is low-value second-tier Wales; user said do not force it"}],
  ["aia.1",{reason:"noisy placeholder/frontier tail; no extractable standings"}],
  ["aia.2",{reason:"noisy placeholder/frontier tail; no extractable standings"}],
  ["gam.1",{reason:"Facebook/social candidate blocked"}],
  ["gam.2",{reason:"Facebook/social candidate blocked"}],
  ["eri.1",{reason:"FIFA association profile, not standings"}],
  ["eri.2",{reason:"FIFA association profile, not standings"}],
  ["gab.1",{reason:"FIFA association profile, not standings"}],
  ["fij.2",{reason:"no standings evidence"}]
]);

function addSlugsFromPayload(set,payload){
  walk(payload,o=>{
    const s=slugOf(o);
    if(isLeagueSlug(s)) set.add(s);
  });
}
const workedOrParked = new Set([...canonicalCovered, ...suppressedLowValue, ...parkedByPolicy.keys()]);
addSlugsFromPayload(workedOrParked, readJsonMaybe(paths.highYieldTargets));
addSlugsFromPayload(workedOrParked, readJsonMaybe(paths.l2Gate));

const cleanSecond = readJsonMaybe(paths.cleanSecondWave);
for(const r of cleanSecond?.bestRows || []){
  const s=slugOf(r);
  if(isLeagueSlug(s) && s !== "wal.2") workedOrParked.add(s);
}

const inventory = new Map();
const sourceHints = new Map();
let scannedJsonFileCount = 0;

for(const file of listJson("data/football-truth").slice(0,9000)){
  const j = readJsonMaybe(file);
  if(!j) continue;
  scannedJsonFileCount++;
  walk(j,o=>{
    const s=slugOf(o);
    if(!isLeagueSlug(s)) return;
    const row = inventory.get(s) || {competitionSlug:s, names:new Set(), countries:new Set(), files:new Set(), hintHosts:new Set(), sourceSignalCount:0};
    const n=nameOf(o); if(n) row.names.add(n);
    const c=countryOf(o); if(c) row.countries.add(c);
    row.files.add(file);
    if(Array.isArray(o.officialHintHosts)){
      for(const h of o.officialHintHosts) if(h) row.hintHosts.add(String(h));
    }
    const text = JSON.stringify(o).toLowerCase();
    if(/official|standings|table|fixtures|results|source|provider|host|route|adapter|api|contract/.test(text)) row.sourceSignalCount++;
    inventory.set(s,row);
  });
}

function bestName(row){
  const names=[...row.names].filter(Boolean).sort((a,b)=>b.length-a.length);
  return names[0] || row.competitionSlug;
}
function bestCountry(row){
  const countries=[...row.countries].filter(Boolean).sort((a,b)=>b.length-a.length);
  return countries[0] || "";
}
function tierPriority(slug, name, country){
  let score = 0;
  const level = Number(slug.split(".")[1]);
  if(level === 1) score += 80;
  if(level === 2) score += 35;
  const n = `${name} ${country}`.toLowerCase();
  if(/\b(turkey|turkish|süper lig|super lig|qatar|russia|serbia|slovakia|slovenia|singapore|thailand|uzbekistan|venezuela|new zealand|south africa|malaysia|malta|luxembourg|kazakhstan|kosovo|moldova|montenegro|northern ireland)\b/.test(n)) score += 35;
  if(/\b(official host discovery|official route fixture hint|nzl\.|wal\.)\b/.test(n)) score -= 25;
  if(/\b(second level|second division|2\. liga|1\. liga|challenge|first division)\b/.test(n)) score -= 10;
  if(/\b(cup|women|youth|u19|u21|reserve)\b/.test(n)) score -= 100;
  return score;
}

const nextPriorityRows = [];
for(const [slug,row] of inventory){
  if(workedOrParked.has(slug)) continue;
  const name=bestName(row);
  const country=bestCountry(row);
  const score=tierPriority(slug,name,country) + Math.min(row.sourceSignalCount,20);
  if(score >= 40){
    nextPriorityRows.push({
      competitionSlug:slug,
      competitionName:name,
      country,
      priorityScore:score,
      sourceSignalCount:row.sourceSignalCount,
      officialHintHosts:[...row.hintHosts],
      observedFileCount:row.files.size,
      sampleFiles:[...row.files].slice(0,5)
    });
  }
}
nextPriorityRows.sort((a,b)=>b.priorityScore-a.priorityScore || a.competitionSlug.localeCompare(b.competitionSlug));

const parkedLaneRows = [...parkedByPolicy.entries()].map(([competitionSlug,v])=>({
  competitionSlug,
  status:"parked_until_endgame",
  reason:v.reason
}));

const walMiner = readJsonMaybe(paths.walMiner);
const summary = {
  status:"passed",
  scannedJsonFileCount,
  observedLeagueSlugCount:inventory.size,
  canonicalCoveredCount:canonicalCovered.size,
  workedOrParkedSlugCount:workedOrParked.size,
  policyParkedSlugCount:parkedByPolicy.size,
  wal2Parked:true,
  wal2TableCandidateCount:walMiner?.summary?.tableCandidateCount ?? null,
  wal2CandidateFollowupUrlCount:walMiner?.summary?.candidateFollowupUrlCount ?? null,
  nextPriorityCandidateCount:nextPriorityRows.length,
  nextPriorityPreviewCount:Math.min(50,nextPriorityRows.length),
  recommendedNextLane:nextPriorityRows.length ? "build_controlled_next_priority_source_discovery_pack_local_then_small_search_only" : "inventory_gap_review_no_more_search",
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
  parkedLaneRows,
  nextPriorityRows:nextPriorityRows.slice(0,80),
  policy:{
    localBoardOnly:true,
    noSearch:true,
    noFetch:true,
    noCanonicalCandidateWrite:true,
    noProductionTruth:true,
    lowValueOrNoTableLanesParked:true,
    nextAllowedAction:summary.recommendedNextLane
  }
});
console.log(JSON.stringify(summary,null,2));
