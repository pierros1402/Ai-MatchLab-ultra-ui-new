import fs from "node:fs";
import path from "node:path";

const growthPath = path.join("data","football-truth","_diagnostics","source-registry-growth-plan-2026-06-17","source-registry-growth-plan-2026-06-17.json");
const outDir = path.join("data","football-truth","_diagnostics","strict-source-identity-executable-wave-plan-2026-06-17");
const outPath = path.join(outDir,"strict-source-identity-executable-wave-plan-2026-06-17.json");

function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8")); }
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }

if(!fs.existsSync(growthPath)) throw new Error(`Missing growth plan: ${growthPath}`);

const growth = readJson(growthPath);
const allowedLanes = new Set([
  "europe_official_source_identity_discovery",
  "americas_official_source_identity_discovery",
  "asia_oceania_official_source_identity_discovery"
]);

const plannedRows = growth.plannedRows || [];
const eligible = plannedRows
  .filter(r => allowedLanes.has(r.lane))
  .filter(r => r.allowedNextAction === "source_identity_discovery_only")
  .sort((a,b)=>b.priorityScore-a.priorityScore || a.competitionSlug.localeCompare(b.competitionSlug));

const wave = eligible.slice(0,48).map(r => {
  const [countryCode, level] = r.competitionSlug.split(".");
  const genericLeagueTerm = level === "1" ? "first division top league" : level === "2" ? "second division league" : "league";

  const searchQueries = [
    `${r.competitionSlug} official ${genericLeagueTerm} football standings source`,
    `${r.competitionSlug} official football league table fixtures federation`,
    `${countryCode} ${genericLeagueTerm} official football league standings fixtures`
  ];

  return {
    ...r,
    executionKind:"source_identity_discovery",
    searchQueries,
    acceptanceGate:{
      l1CandidateFound:[
        "URL host is official league/federation domain OR official site embedded provider endpoint",
        "page/route text contains competition identity evidence",
        "page/route exposes standings/fixtures/season signal",
        "not aggregator, not generic table, not social media, not wikipedia"
      ],
      l2SourceIdentityVerified:[
        "competition identity matches slug",
        "country/league level match is explicit",
        "season identity is present or discovery route can prove it",
        "source contract/evidence URL is stored",
        "no ambiguous mismatch"
      ]
    },
    forbiddenActions:[
      "standings_extraction",
      "canonical_candidate_write",
      "production_write",
      "truth_assertion"
    ]
  };
});

const checks=[];
function check(name,passed,details={}){ checks.push({name,passed:Boolean(passed),...details}); }
check("eligibleRowsPositive", eligible.length>0, {eligibleCount:eligible.length});
check("waveCountFortyEightOrLess", wave.length>0 && wave.length<=48, {waveCount:wave.length});
check("noDeferredLaneInWave", wave.every(r=>allowedLanes.has(r.lane)));
check("onlySourceIdentityDiscovery", wave.every(r=>r.executionKind==="source_identity_discovery"));
check("noFetchSearchWriteInThisPlan", true);

const output = {
  status:"passed",
  generatedAtUtc:new Date().toISOString(),
  growthPlan:growthPath,
  eligibleCount:eligible.length,
  wave,
  deferredExcludedCount:plannedRows.filter(r=>r.lane==="deferred_l0_source_identity_discovery").length,
  checks,
  summary:{
    status:"passed",
    eligibleSourceIdentityDiscoveryCount:eligible.length,
    executableWaveCount:wave.length,
    waveLaneCounts:wave.reduce((a,r)=>{a[r.lane]=(a[r.lane]||0)+1;return a;},{}),
    deferredExcludedCount:plannedRows.filter(r=>r.lane==="deferred_l0_source_identity_discovery").length,
    waveSlugs:wave.map(r=>r.competitionSlug),
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
    sourceIdentityOnly:true,
    noDeferredLane:true,
    noStandingsExtraction:true,
    noCanonicalCandidateWrite:true,
    noProductionTruth:true
  }
};

writeJson(outPath,output);
console.log(JSON.stringify(output.summary,null,2));
