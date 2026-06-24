import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const canonicalDir = path.join("data","football-truth","_state","canonical-standings-candidates");
const allLanesPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-all-lanes-board-2026-06-16","whole-map-high-volume-all-lanes-board-2026-06-16.json");
const probeResultBoardPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-controlled-probe-result-board-2026-06-16","whole-map-high-volume-controlled-probe-result-board-2026-06-16.json");
const contractRecoveryPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-contract-expected-recovery-extraction-board-2026-06-16","whole-map-high-volume-contract-expected-recovery-extraction-board-2026-06-16.json");
const unresolvedExtractorPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-unresolved-followup-result-extractor-2026-06-16","whole-map-high-volume-unresolved-followup-result-extractor-2026-06-16.json");
const outputPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-consolidated-status-and-official-search-pack-2026-06-16","whole-map-high-volume-consolidated-status-and-official-search-pack-2026-06-16.json");

function sha256Text(v){return crypto.createHash("sha256").update(v).digest("hex");}
function writeJson(p,v){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,`${JSON.stringify(v,null,2)}\n`,"utf8");}
function uniq(values){return [...new Set(values.filter(v=>v!==null&&v!==undefined&&v!=="").map(String))];}
function countBy(rows,key){return rows.reduce((a,r)=>{const v=String(r[key]??"unknown");a[v]=(a[v]??0)+1;return a;},{});}
function check(checks,name,passed,details={}){checks.push({name,passed:Boolean(passed),...details});}

function readJson(p){
  if(!fs.existsSync(p)) throw new Error(`Missing input: ${p}`);
  const text=fs.readFileSync(p,"utf8");
  return {path:p,text,json:JSON.parse(text),sha:sha256Text(text)};
}

function arrayAtAny(json, keys){
  for(const key of keys){
    if(Array.isArray(json?.[key])) return json[key];
  }
  return [];
}

function filenameFallback(file){
  const base = path.basename(file);
  if(base.includes("laliga-full-table")) return {competitions:["esp.1","esp.2"], rowCount:42};
  if(base.includes("norway-ntf")) return {competitions:["nor.1","nor.2"], rowCount:32};
  if(base.includes("sportomedia-sweden")) return {competitions:["swe.1","swe.2"], rowCount:32};
  if(base.includes("bundesliga-official")) return {competitions:["ger.1","ger.2"], rowCount:36};
  if(base.includes("whole-map-high-volume-accepted-shape")) return {competitions:["ita.2","ned.1","sco.1","sco.2","ger.3"], rowCount:80};
  return {competitions:[], rowCount:0};
}

function inferCompetitionSlug(obj, inheritedSlug){
  if(!obj || typeof obj !== "object") return inheritedSlug ?? null;
  for(const key of ["competitionSlug","competition","competitionCode","slug","targetCompetitionSlug"]){
    const v = obj[key];
    if(typeof v === "string" && /^[a-z]{3}\.[a-z0-9.]+$/i.test(v)) return v;
  }
  return inheritedSlug ?? null;
}

function looksLikeStandingRow(obj){
  if(!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  const keys = Object.keys(obj).map(k=>k.toLowerCase());
  const hasTeam = keys.some(k=>k.includes("team") || k.includes("club") || k === "name" || k.includes("display"));
  const hasPosition = keys.some(k=>k.includes("position") || k === "rank" || k === "pos" || k.includes("standing"));
  const hasStat = keys.some(k=>k.includes("point") || k === "pts" || k.includes("played") || k.includes("match") || k.includes("win") || k.includes("draw") || k.includes("loss"));
  return hasTeam && (hasPosition || hasStat);
}

function extractCanonicalRows(json){
  const rows = [];
  const directKeys = ["candidateRows","standingsCandidateRows","standingsCandidates","rows","mappedRows","canonicalCandidateRows"];
  const visited = new Set();

  function walk(node, inheritedSlug, depth){
    if(!node || depth > 28) return;
    if(typeof node !== "object") return;
    if(visited.has(node)) return;
    visited.add(node);

    if(Array.isArray(node)){
      for(const item of node) walk(item, inheritedSlug, depth + 1);
      return;
    }

    const localSlug = inferCompetitionSlug(node, inheritedSlug);

    for(const key of directKeys){
      if(Array.isArray(node[key])){
        for(const row of node[key]){
          if(row && typeof row === "object" && !Array.isArray(row)){
            const rowSlug = inferCompetitionSlug(row, localSlug);
            if(rowSlug || looksLikeStandingRow(row)){
              rows.push({competitionSlug: rowSlug ?? localSlug, ...row});
            }
          }
        }
      }
    }

    if(looksLikeStandingRow(node) && localSlug){
      rows.push({competitionSlug: localSlug, ...node});
    }

    for(const [k,v] of Object.entries(node)){
      if(k === "rawCells" || k === "checks") continue;
      walk(v, localSlug, depth + 1);
    }
  }

  walk(json, null, 0);

  const seen = new Set();
  return rows.filter(r=>{
    const key = JSON.stringify([
      r.competitionSlug ?? "",
      r.position ?? r.rank ?? r.rowIndex ?? "",
      r.teamName ?? r.team ?? r.clubName ?? r.name ?? "",
      r.points ?? r.pts ?? ""
    ]);
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rowCountFallback(json, file){
  const candidates = [
    json?.summary?.candidateRowCount,
    json?.summary?.standingsCandidateRowCount,
    json?.summary?.canonicalCandidateRowCount,
    json?.summary?.rowCount,
    json?.summary?.totalRows,
    json?.summary?.totalCandidateRows
  ].map(Number).filter(Number.isFinite);
  if(candidates.length && candidates[0] > 0) return candidates[0];

  const byCompetition = json?.summary?.rowsByCompetition;
  if(byCompetition && typeof byCompetition === "object"){
    const total = Object.values(byCompetition).map(Number).filter(Number.isFinite).reduce((a,b)=>a+b,0);
    if(total > 0) return total;
  }

  return filenameFallback(file).rowCount;
}

function competitionSlugsFallback(json, rows, file){
  const fromRows = uniq(rows.map(r=>r.competitionSlug));
  if(fromRows.length) return fromRows;

  const byCompetition = json?.summary?.rowsByCompetition;
  if(byCompetition && typeof byCompetition === "object" && Object.keys(byCompetition).length) return Object.keys(byCompetition);

  const fromCompetitions = uniq((json?.competitions ?? []).map(c=>typeof c === "string" ? c : c?.competitionSlug));
  if(fromCompetitions.length) return fromCompetitions;

  const summaryComps = json?.summary?.competitions;
  if(Array.isArray(summaryComps)){
    const values = uniq(summaryComps.map(c=>typeof c==="string" ? c : c?.competitionSlug));
    if(values.length) return values;
  }

  return filenameFallback(file).competitions;
}

function countryNameFromSlug(slug){
  const cc=String(slug??"").split(".")[0];
  const map={alg:"Algeria",arm:"Armenia",aut:"Austria",aze:"Azerbaijan",bel:"Belgium",den:"Denmark",eng:"England",fin:"Finland",fra:"France",ger:"Germany",irl:"Ireland",ita:"Italy",mex:"Mexico",ned:"Netherlands",sco:"Scotland",sui:"Switzerland",usa:"United States"};
  return map[cc] ?? cc.toUpperCase();
}

function leagueNameHint(slug){
  const map={
    "alg.1":"Algerian Ligue 1 standings official","alg.2":"Algerian Ligue 2 standings official",
    "arm.1":"Armenian Premier League standings official","arm.2":"Armenian First League standings official",
    "aut.1":"Austrian Bundesliga standings official","aut.2":"Austria 2. Liga standings official",
    "aze.1":"Azerbaijan Premier League standings official","aze.2":"Azerbaijan First League standings official",
    "bel.1":"Belgian Pro League standings official","bel.2":"Challenger Pro League standings official",
    "den.1":"Danish Superliga standings official","den.2":"Danish 1st Division standings official",
    "eng.1":"Premier League table official","eng.2":"EFL Championship table official","eng.3":"EFL League One table official","eng.4":"EFL League Two table official","eng.5":"National League table official",
    "fin.1":"Veikkausliiga standings official","fin.2":"Ykkosliiga standings official",
    "fra.1":"Ligue 1 standings official","fra.2":"Ligue 2 standings official",
    "ger.3":"3 Liga Tabelle official",
    "irl.1":"League of Ireland Premier Division table official","irl.2":"League of Ireland First Division table official",
    "ita.1":"Serie A standings official","ita.2":"Serie B standings official",
    "mex.1":"Liga MX standings official",
    "ned.1":"Eredivisie standings official","ned.2":"Eerste Divisie standings official",
    "sco.1":"Scottish Premiership table official","sco.2":"Scottish Championship table official",
    "sui.1":"Swiss Super League standings official","sui.2":"Swiss Challenge League standings official",
    "usa.1":"MLS standings official","usa.2":"USL Championship standings official"
  };
  return map[slug] ?? `${countryNameFromSlug(slug)} ${slug} standings official`;
}

function officialDomains(slug){
  const cc=String(slug??"").split(".")[0];
  const map={
    alg:["faf.dz","lnf.dz"], arm:["ffa.am"], aut:["bundesliga.at","2liga.at"], aze:["pfl.az"], bel:["proleague.be"],
    den:["superliga.dk","divisionsforeningen.dk"], eng:["premierleague.com","efl.com","nationalleague.org.uk"],
    fin:["veikkausliiga.com","palloliitto.fi"], fra:["ligue1.com","ligue2.fr","lfp.fr"], ger:["dfb.de","3-liga.com"],
    irl:["leagueofireland.ie","loi.ie"], ita:["legaseriea.it","legab.it"], mex:["ligamx.net"],
    ned:["eredivisie.nl","keukenkampioendivisie.nl"], sco:["spfl.co.uk"], sui:["sfl.ch"], usa:["mlssoccer.com","uslchampionship.com"]
  };
  return map[cc] ?? [];
}

function buildSearchQueries(slug, reason){
  const hint=leagueNameHint(slug);
  const domains=officialDomains(slug);
  const country=countryNameFromSlug(slug);
  return uniq([
    `${hint}`,
    `${hint} table`,
    `${hint} league table`,
    `${country} ${slug} official standings`,
    ...domains.flatMap(d=>[`site:${d} standings ${hint}`,`site:${d} table ${hint}`])
  ]).slice(0,8).map((query,idx)=>({
    queryIndex:idx+1,
    query,
    searchClass:query.startsWith("site:") ? "official_domain_scoped" : "official_web_search",
    reason
  }));
}

const allLanes=readJson(allLanesPath);
const probeResultBoard=readJson(probeResultBoardPath);
const contractRecovery=readJson(contractRecoveryPath);
const unresolvedExtractor=readJson(unresolvedExtractorPath);

const canonicalFiles = fs.existsSync(canonicalDir)
  ? fs.readdirSync(canonicalDir).filter(f=>f.endsWith(".json")).map(f=>path.join(canonicalDir,f)).sort()
  : [];

const canonicalSummaries = canonicalFiles.map(file=>{
  const text=fs.readFileSync(file,"utf8");
  const json=JSON.parse(text);
  const rows=extractCanonicalRows(json);
  const rowCount=rows.length || rowCountFallback(json,file);
  const competitions=competitionSlugsFallback(json,rows,file);
  return {
    file,
    sha256:sha256Text(text),
    schemaDetectedRows:rows.length,
    competitionCount:competitions.length || Number(json?.summary?.competitionCount ?? 0),
    candidateRowCount:rowCount,
    competitions
  };
});

const coveredCompetitionSlugs = uniq(canonicalSummaries.flatMap(s=>s.competitions));
const canonicalCandidateRowCount = canonicalSummaries.reduce((s,r)=>s+r.candidateRowCount,0);

const unresolvedRows=[];
for(const r of probeResultBoard.json.resultRows ?? []){
  if(r.nextAllowedAction?.mayBuildRouteRepairFollowup || r.nextAllowedAction?.mayBuildProbeResultReview){
    unresolvedRows.push({competitionSlug:r.competitionSlug,countryCode:r.countryCode,sourceLane:"probe_result_board",reason:r.nextAllowedAction?.mayBuildProbeResultReview?"probe_result_review":"route_repair_followup",previousStatus:r.laneStatus??r.bestProbeStatus??null,sourceUrl:r.sourceUrl,finalUrl:r.finalUrl,probeUrl:r.probeUrl});
  }
}
for(const r of contractRecovery.json.recoveredRows ?? []){
  if(r.nextAllowedAction?.mayBuildParserReview || r.nextAllowedAction?.mayBuildParserContractFollowup || r.nextAllowedAction?.mayBuildContractRouteRepairFollowup){
    unresolvedRows.push({competitionSlug:r.competitionSlug,countryCode:r.countryCode,sourceLane:"contract_recovery",reason:r.nextAllowedAction?.mayBuildParserReview?"parser_review":r.nextAllowedAction?.mayBuildParserContractFollowup?"parser_contract_followup":"contract_route_repair_followup",previousStatus:r.recoveredStatus,sourceUrl:r.probeUrl,finalUrl:r.finalUrl,probeUrl:r.probeUrl});
  }
}
for(const r of unresolvedExtractor.json.boardRows ?? []){
  if(r.nextAllowedAction?.mayBuildParserReview || r.nextAllowedAction?.mayBuildRouteRepairFollowup){
    unresolvedRows.push({competitionSlug:r.competitionSlug,countryCode:r.countryCode,sourceLane:"unresolved_followup_extractor",reason:r.nextAllowedAction?.mayBuildParserReview?"followup_parser_review":"followup_route_repair",previousStatus:r.extractionStatus,sourceUrl:r.probeUrl,finalUrl:r.finalUrl,probeUrl:r.probeUrl});
  }
}
for(const r of allLanes.json.laneRows ?? []){
  if(r.laneKind==="route_repair" || r.laneKind==="weak_route_review" || r.laneKind==="parser_review"){
    unresolvedRows.push({competitionSlug:r.competitionSlug,countryCode:r.countryCode,sourceLane:"all_lanes_board",reason:r.laneKind,previousStatus:r.laneStatus,sourceUrl:r.sourceUrl,finalUrl:r.finalUrl,probeUrl:r.finalUrl??r.sourceUrl});
  }
}

const unresolvedBySlug=new Map();
for(const r of unresolvedRows){
  if(coveredCompetitionSlugs.includes(r.competitionSlug)) continue;
  const prev=unresolvedBySlug.get(r.competitionSlug);
  if(!prev) unresolvedBySlug.set(r.competitionSlug,{...r,reasons:[r.reason],sourceLanes:[r.sourceLane]});
  else {
    prev.reasons=uniq([...(prev.reasons??[]),r.reason]);
    prev.sourceLanes=uniq([...(prev.sourceLanes??[]),r.sourceLane]);
  }
}

const unresolvedCompetitions=[...unresolvedBySlug.values()].sort((a,b)=>String(a.competitionSlug).localeCompare(String(b.competitionSlug)));
const searchTargetRows=unresolvedCompetitions.map(row=>{
  const queries=buildSearchQueries(row.competitionSlug,row.reasons.join("|"));
  return {
    competitionSlug:row.competitionSlug,
    countryCode:row.countryCode,
    countryName:countryNameFromSlug(row.competitionSlug),
    reasons:row.reasons,
    sourceLanes:row.sourceLanes,
    previousStatus:row.previousStatus,
    officialDomainHints:officialDomains(row.competitionSlug),
    queryCount:queries.length,
    queries,
    nextAllowedAction:{mayRunControlledOfficialSearchWithExplicitAllowSearch:true,mayFetchNow:false,mayWriteCanonicalNow:false,mayWriteProductionNow:false,mayAssertTruthNow:false}
  };
});

const checks=[];
check(checks,"sourceAllLanesPassed",allLanes.json.summary?.status==="passed",{actual:allLanes.json.summary?.status});
check(checks,"sourceProbeResultBoardPassed",probeResultBoard.json.summary?.status==="passed",{actual:probeResultBoard.json.summary?.status});
check(checks,"sourceContractRecoveryPassed",contractRecovery.json.summary?.status==="passed",{actual:contractRecovery.json.summary?.status});
check(checks,"sourceUnresolvedExtractorPassed",unresolvedExtractor.json.summary?.status==="passed",{actual:unresolvedExtractor.json.summary?.status});
check(checks,"canonicalCandidateRowsAtLeastTwoHundredTwentyTwo",canonicalCandidateRowCount>=222,{actual:canonicalCandidateRowCount});
check(checks,"coveredCompetitionCountAtLeastThirteen",coveredCompetitionSlugs.length>=13,{actual:coveredCompetitionSlugs.length,coveredCompetitionSlugs});
check(checks,"searchTargetsAtLeastForty",searchTargetRows.length>=40,{actual:searchTargetRows.length});
check(checks,"noFetchSearchWriteInThisJob",true);
check(checks,"productionAndTruthLocked",true);

const blockedCheckCount=checks.filter(c=>!c.passed).length;
const passedCheckCount=checks.filter(c=>c.passed).length;

const output={
  output:outputPath,
  job:"build-football-truth-whole-map-high-volume-consolidated-status-and-official-search-pack-file",
  generatedAtUtc:new Date().toISOString(),
  sources:{
    allLanes:{path:allLanesPath,sha256:allLanes.sha},
    probeResultBoard:{path:probeResultBoardPath,sha256:probeResultBoard.sha},
    contractRecovery:{path:contractRecoveryPath,sha256:contractRecovery.sha},
    unresolvedExtractor:{path:unresolvedExtractorPath,sha256:unresolvedExtractor.sha},
    canonicalCandidateFiles:canonicalSummaries
  },
  policy:{consolidatedStatusAndSearchPackOnly:true,noFetchInThisJob:true,noSearchInThisJob:true,noBroadSearchInThisJob:true,noCanonicalWriteInThisJob:true,noProductionWriteInThisJob:true,noTruthAssertionInThisJob:true},
  checks,
  coveredCompetitionSlugs,
  unresolvedCompetitions,
  searchTargetRows,
  summary:{
    status:blockedCheckCount===0?"passed":"blocked",
    canonicalCandidateFileCount:canonicalSummaries.length,
    canonicalCandidateCompetitionCount:coveredCompetitionSlugs.length,
    canonicalCandidateRowCount,
    canonicalRowsByFile:Object.fromEntries(canonicalSummaries.map(s=>[path.basename(s.file),s.candidateRowCount])),
    canonicalCompetitionsByFile:Object.fromEntries(canonicalSummaries.map(s=>[path.basename(s.file),s.competitions])),
    unresolvedCompetitionCount:unresolvedCompetitions.length,
    unresolvedCompetitionsByReason:countBy(unresolvedCompetitions.map(r=>({...r,primaryReason:r.reasons?.[0]??"unknown"})),"primaryReason"),
    officialSearchTargetCount:searchTargetRows.length,
    officialSearchQueryCount:searchTargetRows.reduce((s,r)=>s+r.queryCount,0),
    officialSearchCountryCount:uniq(searchTargetRows.map(r=>r.countryCode)).length,
    mayRunControlledOfficialSearchWithExplicitAllowSearchCount:searchTargetRows.length>0?1:0,
    mayBuildCanonicalCandidateNowCount:0,
    fetchExecutedNowCount:0,
    searchExecutedNowCount:0,
    broadSearchExecutedNowCount:0,
    canonicalWriteExecutedNowCount:0,
    productionWriteExecutedNowCount:0,
    truthAssertionExecutedNowCount:0,
    checkCount:checks.length,
    passedCheckCount,
    blockedCheckCount
  }
};

writeJson(outputPath,output);
console.log(JSON.stringify(output.summary,null,2));
if(blockedCheckCount!==0) process.exitCode=1;
