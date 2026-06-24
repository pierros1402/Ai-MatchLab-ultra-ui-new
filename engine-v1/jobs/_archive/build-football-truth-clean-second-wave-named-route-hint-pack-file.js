import fs from "node:fs";
import path from "node:path";

const outPath = "data/football-truth/_diagnostics/clean-second-wave-named-route-hint-search-2026-06-17/clean-second-wave-named-route-hint-targets-2026-06-17.json";

function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }

const cleanTargets = [
  {competitionSlug:"smr.2", competitionName:"San Marino Second Level", country:"San Marino", reason:"real named league candidate"},
  {competitionSlug:"svk.2", competitionName:"2. Liga", country:"Slovakia", reason:"real named league candidate"},
  {competitionSlug:"ven.2", competitionName:"Venezuelan Segunda División", country:"Venezuela", reason:"real named league candidate"},
  {competitionSlug:"tur.1", competitionName:"Süper Lig", country:"Turkey", reason:"local official fixture/standings hint"},
  {competitionSlug:"tur.2", competitionName:"1. Lig", country:"Turkey", reason:"local official fixture/standings hint"},
  {competitionSlug:"wal.2", competitionName:"Cymru North / Cymru South", country:"Wales", reason:"local official route fixture hint"},
  {competitionSlug:"nzl.1", competitionName:"New Zealand National League", country:"New Zealand", reason:"local official route fixture hint"},
  {competitionSlug:"nzl.2", competitionName:"New Zealand second level", country:"New Zealand", reason:"local official route fixture hint"}
];

const rows = [];
for(const t of cleanTargets){
  const queries = [
    `"${t.competitionName}" "${t.country}" official standings`,
    `"${t.competitionName}" "${t.country}" official league table`,
    `"${t.competitionName}" official fixtures results standings`,
    `"${t.country}" "${t.competitionName}" football federation standings`
  ];
  queries.forEach((q,idx)=>rows.push({
    targetId:`${t.competitionSlug}-clean2-q${idx+1}`,
    id:`${t.competitionSlug}-clean2-q${idx+1}`,
    competitionSlug:t.competitionSlug,
    competitionName:t.competitionName,
    country:t.country,
    query:q,
    q,
    searchQuery:q,
    searchIntent:"official_standings_or_league_table",
    sourceType:"clean_second_wave_named_route_hint",
    reason:t.reason,
    queryIndex:idx+1,
    allowFetchNow:false,
    canonicalWriteAllowedNow:false,
    productionTruthAllowedNow:false
  }));
}

const payload = {
  generatedAtUtc:new Date().toISOString(),
  status:"passed",
  summary:{
    targetCount:cleanTargets.length,
    searchQueryCount:rows.length,
    searchExecutedNowCount:0,
    fetchExecutedNowCount:0,
    canonicalWriteExecutedNowCount:0,
    productionWriteExecutedNowCount:0,
    truthAssertionExecutedNowCount:0
  },
  cleanTargets,
  targets:rows,
  searchTargets:rows,
  rows,
  policy:{
    cleanSecondWaveOnly:true,
    officialHostDiscoveryPlaceholdersExcluded:true,
    searchRequiresExplicitAllowSearch:true,
    noFetch:true,
    noCanonicalCandidateWrite:true,
    noProductionTruth:true
  }
};
writeJson(outPath,payload);
console.log(JSON.stringify(payload.summary,null,2));
