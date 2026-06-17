import fs from "node:fs";
import path from "node:path";

const outPath = "data/football-truth/_diagnostics/high-yield-named-frontier-search-wave-2026-06-17/high-yield-named-frontier-search-targets-2026-06-17.json";
const currentFrontierPackPath = "data/football-truth/_diagnostics/search-ready-frontier-query-hygiene-pack-2026-06-17/search-ready-frontier-query-hygiene-pack-2026-06-17.json";
const l2GatePath = "data/football-truth/_diagnostics/strict-l1-to-l2-source-identity-host-family-gate-2026-06-17/strict-l1-to-l2-source-identity-host-family-gate-2026-06-17.json";

function readJsonMaybe(p){ try { return JSON.parse(fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"")); } catch { return null; } }
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }
function clean(s){ return String(s ?? "").replace(/\s+/g," ").trim(); }
function listJson(dir, out=[]){
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
  if(Array.isArray(x)){ for(const v of x) walk(v, cb, depth+1); return; }
  if(typeof x === "object"){
    cb(x);
    for(const v of Object.values(x).slice(0,160)) if(v && typeof v === "object") walk(v, cb, depth+1);
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
function isLeagueSlug(s){ return /^[a-z]{2,3}\.\d+$/.test(s) && !/\.cup$/.test(s); }
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
  if(/\b(super|premier|primera|serie|liga|ligue|league|division|championship|bundesliga|ekstraklasa|eredivisie|superliga|j1|j2|a-league|k league|allsvenskan|eliteserien)\b/i.test(n)) score += 35;
  if(country) score += 10;
  if(/\b(cup|women|youth|u19|u21|reserve|friendly)\b/i.test(n)) score -= 35;
  return score;
}
const exclude = new Set([
  "ger.1","ger.2","esp.1","esp.2","nor.1","nor.2","aut.1","aut.2","fin.1","swe.1","swe.2",
  "afg.1","afg.2","pak.1","pak.2"
]);

const current = readJsonMaybe(currentFrontierPackPath);
for(const t of current?.searchReadyTargets || []) exclude.add(t.competitionSlug);

const l2 = readJsonMaybe(l2GatePath);
walk(l2, o => { const s = slugOf(o); if(isLeagueSlug(s)) exclude.add(s); });

const candidates = new Map();
let scannedJsonFileCount = 0;
for(const file of listJson("data/football-truth").slice(0,6000)){
  const j = readJsonMaybe(file);
  if(!j) continue;
  scannedJsonFileCount++;
  walk(j, o => {
    const slug = slugOf(o);
    if(!isLeagueSlug(slug) || exclude.has(slug)) return;
    const name = nameOf(o);
    if(placeholderName(slug, name)) return;
    const country = countryOf(o);
    const score = scoreName(name, country);
    if(score < 30) return;
    const prior = candidates.get(slug);
    if(!prior || score > prior.score || (score === prior.score && name.length > String(prior.competitionName || "").length)){
      candidates.set(slug, {competitionSlug:slug, competitionName:name, country, score, sourceFile:file});
    }
  });
}

const selected = [...candidates.values()]
  .sort((a,b)=>b.score-a.score || a.competitionSlug.localeCompare(b.competitionSlug))
  .slice(0,80)
  .map((t,i)=>{
    const q = [
      `"${t.competitionName}" ${t.country} official standings`,
      `"${t.competitionName}" ${t.country} official league table`,
      `"${t.competitionName}" official website standings`,
      `${t.country} "${t.competitionName}" football federation standings`
    ].map(s => s.replace(/\s+/g," ").trim());
    return {
      priority:i+1,
      competitionSlug:t.competitionSlug,
      competitionName:t.competitionName,
      country:t.country,
      highYieldNameScore:t.score,
      sourceFile:t.sourceFile,
      plannedSearchQueries:q,
      fetchAllowedNow:false,
      canonicalWriteAllowedNow:false,
      productionTruthAllowedNow:false
    };
  });

const rows = [];
for(const t of selected){
  let queryIndex = 0;
  for(const q of t.plannedSearchQueries){
    queryIndex++;
    rows.push({
      targetId:`${t.competitionSlug}-hy-q${queryIndex}`,
      id:`${t.competitionSlug}-hy-q${queryIndex}`,
      competitionSlug:t.competitionSlug,
      competitionName:t.competitionName,
      country:t.country,
      query:q,
      q,
      searchQuery:q,
      sourceType:"high_yield_named_official_web_search",
      searchIntent:"official_standings_or_league_table",
      priority:t.priority,
      queryIndex,
      allowFetchNow:false,
      canonicalWriteAllowedNow:false,
      productionTruthAllowedNow:false
    });
  }
}

const payload = {
  generatedAtUtc:new Date().toISOString(),
  status:selected.length ? "passed" : "blocked_no_high_yield_named_targets",
  summary:{
    scannedJsonFileCount,
    candidateNamedLeagueCount:candidates.size,
    targetCount:selected.length,
    searchQueryCount:rows.length,
    excludedSlugCount:exclude.size,
    searchExecutedNowCount:0,
    fetchExecutedNowCount:0,
    broadSearchExecutedNowCount:0,
    canonicalWriteExecutedNowCount:0,
    productionWriteExecutedNowCount:0,
    truthAssertionExecutedNowCount:0
  },
  searchReadyTargets:selected,
  targets:rows,
  searchTargets:rows,
  rows,
  policy:{
    highYieldNamedLeaguesOnly:true,
    placeholdersExcluded:true,
    alreadyCoveredOrSearchedOrL2Excluded:true,
    searchRequiresExplicitAllowSearch:true,
    noFetch:true,
    noCanonicalCandidateWrite:true,
    noProductionTruth:true
  }
};

writeJson(outPath,payload);
console.log(JSON.stringify(payload.summary,null,2));

