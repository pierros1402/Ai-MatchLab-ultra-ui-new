import fs from "node:fs";
import path from "node:path";

const inputPath = "data/football-truth/_diagnostics/enriched-global-frontier-pack-2026-06-17/enriched-global-frontier-pack-2026-06-17.json";
const outPath = "data/football-truth/_diagnostics/search-ready-frontier-query-hygiene-pack-2026-06-17/search-ready-frontier-query-hygiene-pack-2026-06-17.json";

function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"")); }
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }
function clean(s){ return String(s ?? "").replace(/_/g," ").replace(/\s+/g," ").trim(); }
function slugPrefix(slug){ return String(slug || "").split(".")[0]; }
function levelFromSlug(slug){
  const n = Number(String(slug || "").split(".")[1]);
  if(n === 1) return { level:"top division", phrases:["premier league","first division","top division"] };
  if(n === 2) return { level:"second division", phrases:["first division","second division","division 2"] };
  return { level:`division ${n}`, phrases:[`division ${n}`] };
}
function placeholderName(name, slug){
  const n = clean(name);
  const p = slugPrefix(slug);
  const title = p ? p.charAt(0).toUpperCase() + p.slice(1) : "";
  return !n || n.toLowerCase() === String(slug).toLowerCase() || new RegExp(`^${title} \\d+$`, "i").test(n) || /^[A-Z][a-z]{2} \d+$/.test(n);
}
function uniq(arr){ return [...new Set(arr.map(x => clean(x)).filter(Boolean))]; }
function queryQuality(q){
  let score = 0;
  if(/\bofficial\b/i.test(q)) score += 15;
  if(/\bstandings|table|classification|classement|tabla|positions?\b/i.test(q)) score += 20;
  if(/\bfederation|association|league\b/i.test(q)) score += 10;
  if(/\bfootball|soccer\b/i.test(q)) score += 10;
  if(/\b[A-Z][a-z]{2} \d\b/.test(q)) score -= 40;
  if(/\b[a-z]{2,3}\.\d\b/i.test(q)) score -= 40;
  if(q.length < 18) score -= 30;
  return score;
}

const input = readJson(inputPath);
const targets = input.frontierTargets || [];

const rewrittenTargets = targets.map(t => {
  const slug = t.competitionSlug;
  const name = clean(t.competitionName);
  const country = clean(t.country);
  const lvl = levelFromSlug(slug);
  const isPlaceholder = placeholderName(name, slug);

  let queries = [];
  if(isPlaceholder){
    const baseCountry = country || slugPrefix(slug);
    queries = [
      `${baseCountry} football federation official standings ${lvl.level}`,
      `${baseCountry} football association official league table ${lvl.level}`,
      `${baseCountry} ${lvl.phrases[0]} football standings official`,
      `${baseCountry} ${lvl.phrases[1] || lvl.level} football league table official`
    ];
  } else {
    const base = `${name}${country ? " " + country : ""}`;
    queries = [
      `${base} official standings`,
      `${base} official league table`,
      `${base} football standings official`,
      `${base} fixtures results standings official`
    ];
  }

  queries = uniq(queries).slice(0,4);
  const scores = queries.map(queryQuality);
  const minQueryQualityScore = Math.min(...scores);
  const queryHygieneStatus = minQueryQualityScore >= 5 ? "search_ready" : "review_query_quality";

  return {
    priority: t.priority,
    competitionSlug: slug,
    competitionName: name,
    country,
    nameWasPlaceholder: isPlaceholder,
    queryHygieneStatus,
    minQueryQualityScore,
    plannedSearchQueries: queries,
    fetchAllowedNow:false,
    canonicalWriteAllowedNow:false,
    productionTruthAllowedNow:false
  };
});

const searchReady = rewrittenTargets.filter(t => t.queryHygieneStatus === "search_ready");
const review = rewrittenTargets.filter(t => t.queryHygieneStatus !== "search_ready");

const summary = {
  status: searchReady.length >= 120 ? "passed" : "review_required_low_search_ready_count",
  inputTargetCount: targets.length,
  outputTargetCount: rewrittenTargets.length,
  searchReadyTargetCount: searchReady.length,
  reviewQueryQualityTargetCount: review.length,
  placeholderNameTargetCount: rewrittenTargets.filter(t => t.nameWasPlaceholder).length,
  realNameTargetCount: rewrittenTargets.filter(t => !t.nameWasPlaceholder).length,
  plannedSearchQueryCount: rewrittenTargets.reduce((a,t)=>a+t.plannedSearchQueries.length,0),
  searchReadyQueryCount: searchReady.reduce((a,t)=>a+t.plannedSearchQueries.length,0),
  firstSearchReadySlugs: searchReady.slice(0,30).map(t=>t.competitionSlug),
  reviewSlugs: review.map(t=>t.competitionSlug),
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
  inputPath,
  summary,
  searchReadyTargets:searchReady,
  reviewTargets:review,
  allTargets:rewrittenTargets,
  policy:{
    localPlanningOnly:true,
    noSearch:true,
    noFetch:true,
    noCanonicalCandidateWrite:true,
    noProductionTruth:true,
    placeholderNamesRewrittenToCountryLevelQueries:true,
    nextAllowedAction:"run_search_ready_frontier_official_search_wave"
  }
};

writeJson(outPath,out);
console.log(JSON.stringify(summary,null,2));
if(summary.status !== "passed") process.exitCode = 1;
