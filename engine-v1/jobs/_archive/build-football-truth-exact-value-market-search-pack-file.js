import fs from "node:fs";
import path from "node:path";

const outPath = "data/football-truth/_diagnostics/exact-value-market-search-pack-2026-06-17/exact-value-market-search-targets-2026-06-17.json";
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }

const targets = [
  {competitionSlug:"gre.1", competitionName:"Super League Greece", country:"Greece", marketTier:"A"},
  {competitionSlug:"cro.1", competitionName:"Croatian Football League HNL", country:"Croatia", marketTier:"A"},
  {competitionSlug:"bul.1", competitionName:"Bulgarian First League", country:"Bulgaria", marketTier:"A"},
  {competitionSlug:"cyp.1", competitionName:"Cypriot First Division", country:"Cyprus", marketTier:"A"},
  {competitionSlug:"alb.1", competitionName:"Albanian Superliga", country:"Albania", marketTier:"B"},
  {competitionSlug:"aze.1", competitionName:"Azerbaijan Premier League", country:"Azerbaijan", marketTier:"B"},
  {competitionSlug:"svn.1", competitionName:"Slovenian PrvaLiga", country:"Slovenia", marketTier:"B"},
  {competitionSlug:"isl.1", competitionName:"Besta deild karla", country:"Iceland", marketTier:"B"},
  {competitionSlug:"ind.1", competitionName:"Indian Super League", country:"India", marketTier:"B"},
  {competitionSlug:"tha.1", competitionName:"Thai League 1", country:"Thailand", marketTier:"B"},
  {competitionSlug:"uzb.1", competitionName:"Uzbekistan Super League", country:"Uzbekistan", marketTier:"B"},
  {competitionSlug:"alg.1", competitionName:"Algerian Ligue Professionnelle 1", country:"Algeria", marketTier:"B"}
];

const rows = [];
for(const t of targets){
  const queries = [
    `"${t.competitionName}" official standings`,
    `"${t.competitionName}" official league table`,
    `"${t.country}" "${t.competitionName}" official standings`,
    `"${t.country}" football federation "${t.competitionName}" standings`
  ];
  queries.forEach((q,i)=>rows.push({
    targetId:`${t.competitionSlug}-exact-value-q${i+1}`,
    id:`${t.competitionSlug}-exact-value-q${i+1}`,
    competitionSlug:t.competitionSlug,
    competitionName:t.competitionName,
    country:t.country,
    marketTier:t.marketTier,
    query:q,
    q,
    searchQuery:q,
    sourceType:"exact_value_market_search",
    searchIntent:"official_standings_or_league_table",
    queryIndex:i+1,
    allowFetchNow:false,
    canonicalWriteAllowedNow:false,
    productionTruthAllowedNow:false
  }));
}

const payload = {
  generatedAtUtc:new Date().toISOString(),
  status:"passed",
  summary:{
    targetCount:targets.length,
    searchQueryCount:rows.length,
    searchExecutedNowCount:0,
    fetchExecutedNowCount:0,
    canonicalWriteExecutedNowCount:0,
    productionWriteExecutedNowCount:0,
    truthAssertionExecutedNowCount:0
  },
  targets:rows,
  searchTargets:rows,
  rows,
  valueMarketTargets:targets,
  policy:{
    exactValueMarketOnly:true,
    smallUnreliableNoBettingValueExcluded:true,
    noPlaceholderDiscoveryNames:true,
    searchRequiresExplicitAllowSearch:true,
    noFetch:true,
    noCanonicalCandidateWrite:true,
    noProductionTruth:true
  }
};
writeJson(outPath,payload);
console.log(JSON.stringify(payload.summary,null,2));
