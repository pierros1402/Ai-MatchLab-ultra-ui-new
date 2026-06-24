import fs from "node:fs";
import path from "node:path";

const outPath = "data/football-truth/_diagnostics/bulk-lane-decision-board-2026-06-17/bulk-lane-decision-board-2026-06-17.json";

const knownPaths = {
  searchReadyFrontierPack: "data/football-truth/_diagnostics/search-ready-frontier-query-hygiene-pack-2026-06-17/search-ready-frontier-query-hygiene-pack-2026-06-17.json",
  highYieldTargets: "data/football-truth/_diagnostics/high-yield-named-frontier-search-wave-2026-06-17/high-yield-named-frontier-search-targets-2026-06-17.json",
  highYieldPartialClassifier: "data/football-truth/_diagnostics/high-yield-partial-search-classifier-2026-06-17/high-yield-partial-search-classifier-2026-06-17.json",
  highYieldPrecisionReview: "data/football-truth/_diagnostics/high-yield-partial-precision-review-2026-06-17/high-yield-partial-precision-review-2026-06-17.json",
  l2Gate: "data/football-truth/_diagnostics/strict-l1-to-l2-source-identity-host-family-gate-2026-06-17/strict-l1-to-l2-source-identity-host-family-gate-2026-06-17.json"
};

const canonicalCovered = new Set(["ger.1","ger.2","esp.1","esp.2","nor.1","nor.2","aut.1","aut.2","fin.1","swe.1","swe.2"]);
const suppressedLowValue = new Set(["afg.1","afg.2","pak.1","pak.2"]);
const manuallyParkedNoisy = new Set(["aia.1","aia.2","gam.1","gam.2","eri.1","eri.2","gab.1","fij.2"]);

function readJsonMaybe(p){
  try { return JSON.parse(fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"")); }
  catch { return null; }
}
function writeJson(p,v){
  fs.mkdirSync(path.dirname(p),{recursive:true});
  fs.writeFileSync(p,JSON.stringify(v,null,2));
}
function clean(s){ return String(s ?? "").replace(/\s+/g," ").trim(); }
function listJson(dir,out=[]){
  if(!fs.existsSync(dir)) return out;
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,e.name);
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
    for(const v of Object.values(x).slice(0,160)){
      if(v && typeof v === "object") walk(v,cb,depth+1);
    }
  }
}
function slugOf(o){
  return clean(o.competitionSlug || o.normalizedCompetitionSlug || o.slug || o.competitionId || o.id);
}
function nameOf(o){
  return clean(o.competitionName || o.name || o.leagueName || o.displayName || o.title || o.competition || o.league);
}
function countryOf(o){
  return clean(o.country || o.countryName || o.normalizedCountry || o.associationCountry || o.regionCountry);
}
function isLeagueSlug(s){
  return /^[a-z]{2,3}\.\d+$/.test(s) && !/\.cup$/.test(s);
}
function placeholderName(slug, name){
  const n = clean(name).toLowerCase();
  const p = slug.split(".")[0].toLowerCase();
  const level = slug.split(".")[1];
  const normalized = n.replace(/[^a-z0-9]+/g,"");
  if(!n || n === slug.toLowerCase()) return true;
  if(normalized === `${p}${level}`) return true;
  if(normalized === p) return true;
  if(new RegExp(`^${p}\\s*${level}$`,"i").test(n)) return true;
  if(/^(unknown|registry|league|cup|test|placeholder|football)$/i.test(n)) return true;
  if(n.length < 5) return true;
  return false;
}
function scoreName(name, country){
  const n = clean(name);
  let score = 0;
  if(n.length >= 8) score += 20;
  if(n.length >= 14) score += 15;
  if(/\b(super|premier|primera|serie|liga|ligue|league|division|championship|bundesliga|ekstraklasa|eredivisie|superliga|j1|j2|a-league|k league|allsvenskan|eliteserien|first|second|stars|challenge)\b/i.test(n)) score += 35;
  if(country) score += 10;
  if(/\b(cup|women|youth|u19|u21|reserve|friendly)\b/i.test(n)) score -= 35;
  return score;
}
function addSlugsFromPayload(set, payload){
  walk(payload, o => {
    const s = slugOf(o);
    if(isLeagueSlug(s)) set.add(s);
  });
}

const currentFrontierSlugs = new Set();
const highYieldParkedSlugs = new Set();
const l2WorkedSlugs = new Set();

addSlugsFromPayload(currentFrontierSlugs, readJsonMaybe(knownPaths.searchReadyFrontierPack));
addSlugsFromPayload(highYieldParkedSlugs, readJsonMaybe(knownPaths.highYieldTargets));
addSlugsFromPayload(l2WorkedSlugs, readJsonMaybe(knownPaths.l2Gate));

const excluded = new Set([
  ...canonicalCovered,
  ...suppressedLowValue,
  ...manuallyParkedNoisy,
  ...currentFrontierSlugs,
  ...highYieldParkedSlugs,
  ...l2WorkedSlugs
]);

const allLeagueInventory = new Map();
const namedCandidates = new Map();
const officialHintCandidates = new Map();
let scannedJsonFileCount = 0;

for(const file of listJson("data/football-truth").slice(0,8000)){
  const j = readJsonMaybe(file);
  if(!j) continue;
  scannedJsonFileCount++;

  walk(j, o => {
    const slug = slugOf(o);
    if(!isLeagueSlug(slug)) return;

    const name = nameOf(o);
    const country = countryOf(o);
    if(!allLeagueInventory.has(slug)){
      allLeagueInventory.set(slug,{competitionSlug:slug, competitionName:name, country, firstSeenFile:file});
    }

    if(!excluded.has(slug) && !placeholderName(slug,name)){
      const score = scoreName(name,country);
      if(score >= 35){
        const prev = namedCandidates.get(slug);
        if(!prev || score > prev.score || name.length > prev.competitionName.length){
          namedCandidates.set(slug,{competitionSlug:slug, competitionName:name, country, score, sourceFile:file});
        }
      }
    }

    const hints = Array.isArray(o.officialHintHosts) ? o.officialHintHosts.filter(Boolean).map(String) : [];
    if(!excluded.has(slug) && hints.length){
      const prev = officialHintCandidates.get(slug);
      const row = {competitionSlug:slug, competitionName:name, country, officialHintHosts:[...new Set(hints)], sourceFile:file};
      if(!prev || row.officialHintHosts.length > prev.officialHintHosts.length) officialHintCandidates.set(slug,row);
    }
  });
}

const nextNamedRows = [...namedCandidates.values()]
  .sort((a,b)=>b.score-a.score || a.competitionSlug.localeCompare(b.competitionSlug))
  .slice(0,120);

const officialHintRows = [...officialHintCandidates.values()]
  .sort((a,b)=>b.officialHintHosts.length-a.officialHintHosts.length || a.competitionSlug.localeCompare(b.competitionSlug))
  .slice(0,80);

const highYieldPrecision = readJsonMaybe(knownPaths.highYieldPrecisionReview);
const highYieldPartial = readJsonMaybe(knownPaths.highYieldPartialClassifier);

const parkedLanes = [
  {
    lane:"placeholder/frontier official search lane",
    parkedReason:"search/fetch produced no extractable standings and included noisy country/federation-profile results",
    affectedSlugCount:currentFrontierSlugs.size,
    nextReviewPhase:"endgame only"
  },
  {
    lane:"high-yield named search lane first wave",
    parkedReason:"12 completed batches produced zero route/domain/review candidates; 20 failed batches are timeout-heavy",
    affectedSlugCount:highYieldParkedSlugs.size,
    retryTargetCount:highYieldPartial?.summary?.retryTargetCount ?? null,
    nextReviewPhase:"endgame or only if local evidence reveals clear official route"
  },
  {
    lane:"46-slug L2 official-host/template lane",
    parkedReason:"worked through route/endpoint/parser attempts; no new strict canonical eligible table",
    affectedSlugCount:l2WorkedSlugs.size,
    nextReviewPhase:"endgame repair"
  }
];

let recommendedNextLane = "build_next_named_frontier_second_wave_pack_local_only";
let recommendationReason = "remaining named unworked league candidates exist after excluding covered, L2-worked, placeholder-frontier, and parked high-yield wave";
if(officialHintRows.length >= 10){
  recommendedNextLane = "official_hint_host_seed_lane";
  recommendationReason = "local officialHintHosts exist for unworked league slugs and should be higher precision than generic web search";
} else if(nextNamedRows.length < 20) {
  recommendedNextLane = "registry_gap_or_manual_provider_mapping_board";
  recommendationReason = "not enough unworked named candidates remain for another bulk search wave";
}

const summary = {
  status:"passed",
  scannedJsonFileCount,
  observedLeagueSlugCount:allLeagueInventory.size,
  canonicalCoveredCount:canonicalCovered.size,
  currentFrontierParkedSlugCount:currentFrontierSlugs.size,
  highYieldParkedSlugCount:highYieldParkedSlugs.size,
  l2WorkedSlugCount:l2WorkedSlugs.size,
  totalExcludedSlugCount:excluded.size,
  unworkedNamedCandidateCount:namedCandidates.size,
  nextNamedPreviewCount:nextNamedRows.length,
  officialHintCandidateCount:officialHintCandidates.size,
  officialHintPreviewCount:officialHintRows.length,
  highYieldPartialRouteCandidates:highYieldPartial?.summary?.routeCandidateSlugCount ?? null,
  highYieldPartialDomainCandidates:highYieldPartial?.summary?.domainCandidateSlugCount ?? null,
  highYieldPrecisionRouteCandidates:highYieldPrecision?.summary?.routeCandidateSlugCount ?? null,
  highYieldPrecisionDomainCandidates:highYieldPrecision?.summary?.domainCandidateSlugCount ?? null,
  recommendedNextLane,
  recommendationReason,
  searchExecutedNowCount:0,
  fetchExecutedNowCount:0,
  canonicalWriteExecutedNowCount:0,
  productionWriteExecutedNowCount:0,
  truthAssertionExecutedNowCount:0
};

const out = {
  generatedAtUtc:new Date().toISOString(),
  status:"passed",
  summary,
  parkedLanes,
  nextNamedRows,
  officialHintRows,
  policy:{
    localDecisionBoardOnly:true,
    noSearch:true,
    noFetch:true,
    noCanonicalCandidateWrite:true,
    noProductionTruth:true,
    difficultNoisyLanesParkedUntilEndgame:true,
    nextAllowedAction:recommendedNextLane
  }
};

writeJson(outPath,out);
console.log(JSON.stringify(summary,null,2));
