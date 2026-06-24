import fs from "node:fs";
import path from "node:path";

const inputPath = "data/football-truth/_diagnostics/parked-lanes-next-priority-board-2026-06-17/parked-lanes-next-priority-board-2026-06-17.json";
const outPath = "data/football-truth/_diagnostics/value-tier-suppression-board-2026-06-17/value-tier-suppression-board-2026-06-17.json";

function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"")); }
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }
function clean(s){ return String(s ?? "").replace(/\s+/g," ").trim(); }
function slugPrefix(slug){ return String(slug||"").split(".")[0].toLowerCase(); }

const input = readJson(inputPath);
const rows = input.nextPriorityRows || [];

const suppressPrefixes = new Set([
  "afg","pak",
  "bru","cay","cok","com","dji","dma","gum","lbr","lca","les","mac","mdv","mng","msr","nep","png","sam","sey","skn","sol","som","sri","ssd","stp","tca",
  "tah","swz","syr","tog","tpe","tri","sur","sud","sle","sen","nig","nam"
]);

const keepPrefixes = new Set([
  "gre","cro","bul","alb","alg","and","aze","ind","isl","sgp","svn","tha","uzb","tur","nzl","ven","svk","srb","rus","qat","mys","mlt","mne","mkd","mda","lux","kos","kaz"
]);

function isPlaceholder(row){
  const n = clean(row.competitionName).toLowerCase();
  const slug = clean(row.competitionSlug).toLowerCase();
  if(!n || n === slug) return true;
  if(/\bofficial host discovery\b/.test(n)) return true;
  if(/\bofficial route fixture hint\b/.test(n)) return true;
  if(/^[a-z]{3}\s+1$/.test(n)) return true;
  if(/^[a-z]{3}\s+2$/.test(n)) return true;
  if(/\bhttps?:\/\//.test(n)) return true;
  if(/\b(livesport|britishcouncil|learnenglish|premier -league|soccerway|flashscore|sofascore|transfermarkt)\b/.test(n)) return true;
  return false;
}

function classify(row){
  const slug = clean(row.competitionSlug);
  const p = slugPrefix(slug);
  const placeholder = isPlaceholder(row);
  const suppressedByPolicy = suppressPrefixes.has(p);
  const keptByMarket = keepPrefixes.has(p);
  let status = "park_low_value_or_noisy";
  let reason = "not in active value tier";
  let score = Number(row.priorityScore || 0);

  if(suppressedByPolicy){
    status = "park_low_value_unreliable_market";
    reason = "small/unreliable league with low or no betting value";
    score -= 200;
  } else if(placeholder && !keptByMarket){
    status = "park_placeholder_or_search_noise";
    reason = "placeholder/noisy discovery name without usable league identity";
    score -= 120;
  } else if(keptByMarket && !placeholder){
    status = "keep_active_high_value_named_candidate";
    reason = "usable league name in acceptable value tier";
    score += 80;
  } else if(keptByMarket && placeholder){
    status = "review_high_value_but_placeholder_name";
    reason = "acceptable value market but local name is still placeholder and needs better identity before search";
    score += 10;
  }

  return {...row, valueTierStatus:status, valueTierReason:reason, valueTierScore:score};
}

const classified = rows.map(classify).sort((a,b)=>b.valueTierScore-a.valueTierScore || String(a.competitionSlug).localeCompare(String(b.competitionSlug)));
const keepRows = classified.filter(r=>r.valueTierStatus==="keep_active_high_value_named_candidate");
const reviewRows = classified.filter(r=>r.valueTierStatus==="review_high_value_but_placeholder_name");
const suppressedRows = classified.filter(r=>r.valueTierStatus.startsWith("park_"));

const nextActionRows = keepRows.slice(0,40);
const summary = {
  status:"passed",
  sourceBoardPath:inputPath,
  inputNextPriorityCandidateCount:rows.length,
  keepActiveHighValueNamedCount:keepRows.length,
  reviewHighValuePlaceholderCount:reviewRows.length,
  suppressedOrParkedCount:suppressedRows.length,
  nextActionCandidateCount:nextActionRows.length,
  suppressPrefixCount:suppressPrefixes.size,
  keepPrefixCount:keepPrefixes.size,
  recommendedNextLane:nextActionRows.length ? "build_small_high_value_named_search_pack_from_value_tier_rows" : "repair_high_value_placeholder_identity_before_search",
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
  nextActionRows,
  keepRows,
  reviewRows,
  suppressedRows,
  classifiedRows:classified,
  policy:{
    localBoardOnly:true,
    noSearch:true,
    noFetch:true,
    noCanonicalCandidateWrite:true,
    noProductionTruth:true,
    smallUnreliableNoBettingValueSuppressed:true,
    doNotRunBroad267CandidateSet:true,
    nextAllowedAction:summary.recommendedNextLane
  }
});
console.log(JSON.stringify(summary,null,2));
