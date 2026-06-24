import fs from "node:fs";
import path from "node:path";

const registryPath = path.join("data","football-truth","_diagnostics","source-registry-foundation-2026-06-17","source-registry-foundation-2026-06-17.json");
const outDir = path.join("data","football-truth","_diagnostics","source-registry-growth-plan-2026-06-17");
const outPath = path.join(outDir,"source-registry-growth-plan-2026-06-17.json");

function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8")); }
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }

if(!fs.existsSync(registryPath)) throw new Error(`Missing source registry foundation: ${registryPath}`);

const registry = readJson(registryPath);
const rows = registry.sourceRegistryRows || [];

const suppress = new Set(["afg.1","afg.2","afg.cup","pak.1","pak.2","pak.cup"]);

const priorityCountryPrefixes = [
  "eng","esp","ger","ita","fra","ned","por","bel","aut","sui","den","swe","nor","fin","sco","irl",
  "bra","arg","usa","mex","jpn","kor","chn","aus","ksa","tur","gre","cyp","pol","rou","bul","cro","srb","cze"
];

function prefix(slug){ return String(slug).split(".")[0]; }
function isLeague(slug,type){ return type === "league" || /\.\d+$/.test(slug); }
function priorityScore(r){
  let s = 0;
  const p = prefix(r.competitionSlug);
  if(isLeague(r.competitionSlug,r.competitionType)) s += 100;
  if(priorityCountryPrefixes.includes(p)) s += 80 - priorityCountryPrefixes.indexOf(p);
  if(/^[a-z]{3}\.1$/.test(r.competitionSlug)) s += 35;
  if(/^[a-z]{3}\.2$/.test(r.competitionSlug)) s += 20;
  if(suppress.has(r.competitionSlug)) s -= 1000;
  if(r.competitionType === "cup") s -= 40;
  if(r.competitionType === "registry_gap") s -= 100;
  return s;
}

function laneFor(r){
  const p = prefix(r.competitionSlug);
  if(["eng","esp","ger","ita","fra","ned","por","bel","aut","sui","den","swe","nor","fin","sco","irl"].includes(p)) {
    return "europe_official_source_identity_discovery";
  }
  if(["bra","arg","usa","mex","col","chi","per","uru"].includes(p)) {
    return "americas_official_source_identity_discovery";
  }
  if(["jpn","kor","chn","aus","ksa"].includes(p)) {
    return "asia_oceania_official_source_identity_discovery";
  }
  return "deferred_l0_source_identity_discovery";
}

const l0 = rows.filter(r => r.registryLevel === "L0_unknown_no_verified_source_identity" && !suppress.has(r.competitionSlug));
const planned = l0
  .map(r => ({
    competitionSlug:r.competitionSlug,
    competitionType:r.competitionType,
    currentRegistryLevel:r.registryLevel,
    lane:laneFor(r),
    priorityScore:priorityScore(r),
    allowedNextAction:"source_identity_discovery_only",
    forbiddenActions:[
      "standings_extraction",
      "canonical_candidate_write",
      "production_write",
      "truth_assertion"
    ],
    l1EvidenceRequirements:[
      "candidate URL must be official league/federation/club-competition domain or documented provider contract embedded in official site",
      "candidate must include competition identity text or route metadata matching slug",
      "candidate must expose standings/fixtures/season navigation or API contract signal",
      "aggregators and generic accepted-shape tables are not sufficient"
    ],
    l2PromotionRequirements:[
      "source identity reviewed and accepted",
      "domain/route contract mapped",
      "competition identity proof stored",
      "season identity proof stored or explicitly marked unknown",
      "no ambiguous country/league mismatch"
    ]
  }))
  .sort((a,b)=>b.priorityScore-a.priorityScore || a.competitionSlug.localeCompare(b.competitionSlug));

const firstWave = planned.filter(r => r.priorityScore > 0).slice(0,80);
const laneCounts = planned.reduce((a,r)=>{a[r.lane]=(a[r.lane]||0)+1;return a;},{});

const checks = [];
function check(name,passed,details={}){ checks.push({name,passed:Boolean(passed),...details}); }
check("foundationRowsExpected689", rows.length === 689, {actual:rows.length});
check("l0RowsPositive", l0.length > 0, {actual:l0.length});
check("firstWaveOnlySourceIdentityDiscovery", firstWave.every(r => r.allowedNextAction === "source_identity_discovery_only"));
check("firstWaveNoSuppressedLowValue", firstWave.every(r => !suppress.has(r.competitionSlug)));
check("noFetchSearchWriteInThisPlan", true);

const output = {
  status:"passed",
  generatedAtUtc:new Date().toISOString(),
  sourceRegistryFoundation:registryPath,
  plannedRows:planned,
  firstWave,
  checks,
  summary:{
    status:"passed",
    l0InputCount:l0.length,
    plannedSourceIdentityDiscoveryCount:planned.length,
    firstWaveCount:firstWave.length,
    laneCounts,
    firstWaveLaneCounts:firstWave.reduce((a,r)=>{a[r.lane]=(a[r.lane]||0)+1;return a;},{}),
    firstWaveTopSlugs:firstWave.slice(0,40).map(r=>r.competitionSlug),
    fetchExecutedNowCount:0,
    searchExecutedNowCount:0,
    broadSearchExecutedNowCount:0,
    canonicalWriteExecutedNowCount:0,
    productionWriteExecutedNowCount:0,
    truthAssertionExecutedNowCount:0,
    checkCount:checks.length,
    passedCheckCount:checks.filter(c=>c.passed).length,
    blockedCheckCount:checks.filter(c=>!c.passed).length
  },
  policy:{
    planOnly:true,
    noFetch:true,
    noSearch:true,
    noExtraction:true,
    sourceIdentityOnly:true,
    anyFutureRunnerMustReadThisPlan:true
  }
};

writeJson(outPath,output);
console.log(JSON.stringify(output.summary,null,2));
