import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const inputPath = "data/football-truth/_diagnostics/combined-ultra-strict-frontier-search-board-2026-06-17/combined-ultra-strict-frontier-search-board-2026-06-17.json";
const outDir = "data/football-truth/_diagnostics/combined-ultra-strict-candidate-fetch-probe-2026-06-17";
const outPath = path.join(outDir, "combined-ultra-strict-candidate-fetch-probe-2026-06-17.json");
const snapshotDir = path.join(outDir, "snapshots");

function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"")); }
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }
function clean(s){ return String(s ?? "").replace(/\s+/g," ").trim(); }
function sha(s){ return crypto.createHash("sha256").update(String(s)).digest("hex"); }
function hostOf(u){ try { return new URL(u).hostname.toLowerCase().replace(/^www\./,""); } catch { return ""; } }
function originOf(u){ try { return new URL(u).origin; } catch { return ""; } }
function pathOf(u){ try { return new URL(u).pathname.toLowerCase(); } catch { return ""; } }
function uniqRows(rows){
  const seen = new Set();
  const out = [];
  for(const r of rows){
    const k = `${r.competitionSlug}|${r.url}`.toLowerCase();
    if(!seen.has(k)){ seen.add(k); out.push(r); }
  }
  return out;
}
function safeName(s){ return String(s).replace(/[^a-z0-9.-]+/gi,"_").slice(0,80); }

const input = readJson(inputPath);
fs.mkdirSync(snapshotDir,{recursive:true});

const socialHosts = ["facebook.com","x.com","twitter.com","instagram.com","youtube.com","tiktok.com","linkedin.com"];
const sourceCandidates = [
  ...(input.routeCandidateRows || []),
  ...(input.domainCandidateRows || []),
  ...(input.reviewRows || [])
].map((r, i) => ({
  priority: i + 1,
  competitionSlug: r.competitionSlug,
  competitionName: r.competitionName,
  country: r.country,
  sourceSearchUrl: r.url || r.sourceSearchUrl,
  host: r.host || hostOf(r.url || r.sourceSearchUrl),
  title: r.title || r.sourceSearchTitle,
  vettingStatus: r.vettingStatus,
  ultraStrictScore: r.ultraStrictScore
})).filter(r => r.competitionSlug && r.sourceSearchUrl);

const plannedRows = [];
const blockedCandidateRows = [];

for(const c of sourceCandidates){
  const h = hostOf(c.sourceSearchUrl);
  if(socialHosts.some(s => h === s || h.endsWith("." + s))){
    blockedCandidateRows.push({
      ...c,
      status:"blocked_social_platform_candidate_no_controlled_fetch",
      fetchExecutedNow:false,
      reason:"social platform pages are not accepted as official route contracts"
    });
    continue;
  }

  const origin = originOf(c.sourceSearchUrl);
  const urls = [];
  urls.push(c.sourceSearchUrl);

  if(c.vettingStatus?.includes("domain") || c.vettingStatus?.includes("review")){
    urls.push(origin);
    for(const suffix of [
      "/standings",
      "/standing",
      "/table",
      "/league-table",
      "/points-standing",
      "/competitions",
      "/fixtures-results",
      "/matches"
    ]){
      urls.push(origin + suffix);
    }
  } else {
    urls.push(origin);
    if(!/standing|standings|table|classification|classement|tabla|posiciones|points-standing/i.test(c.sourceSearchUrl)){
      urls.push(origin + "/standings");
      urls.push(origin + "/table");
      urls.push(origin + "/league-table");
    }
  }

  for(const url of [...new Set(urls.filter(Boolean))]){
    plannedRows.push({
      competitionSlug:c.competitionSlug,
      competitionName:c.competitionName,
      country:c.country,
      sourceCandidateHost:h,
      sourceVettingStatus:c.vettingStatus,
      sourceUltraStrictScore:c.ultraStrictScore,
      sourceSearchUrl:c.sourceSearchUrl,
      sourceSearchTitle:c.title,
      url,
      host:hostOf(url)
    });
  }
}

const fetchRows = [];
let fetchIndex = 0;

function fetchUrl(row){
  fetchIndex++;
  const snapshotPath = path.join(snapshotDir, `${String(fetchIndex).padStart(4,"0")}-${safeName(row.competitionSlug)}-${safeName(row.host)}.html`);
  const args = [
    "-L",
    "--silent",
    "--show-error",
    "--compressed",
    "--max-time","15",
    "--connect-timeout","6",
    "-A","Mozilla/5.0 AI-MatchLab-FootballTruth/controlled-probe",
    "-o", snapshotPath,
    "-w", "%{http_code}\t%{url_effective}\t%{content_type}",
    row.url
  ];
  const startedAt = new Date().toISOString();
  const r = spawnSync("curl.exe", args, { encoding:"utf8", timeout:20000, windowsHide:true });
  const endedAt = new Date().toISOString();
  const stdout = clean(r.stdout);
  const [httpCodeRaw, effectiveUrlRaw, contentTypeRaw] = stdout.split("\t");
  const httpCode = Number(httpCodeRaw || 0);
  let text = "";
  if(fs.existsSync(snapshotPath)){
    try { text = fs.readFileSync(snapshotPath,"utf8"); } catch { text = ""; }
  }
  const status = r.error ? "fetch_error" : (r.status === 0 || httpCode > 0 ? "fetch_completed" : "fetch_nonzero");
  return {
    ...row,
    plannedFetchIndex:fetchIndex,
    fetchExecutedNow:true,
    status,
    curlExitCode:r.status,
    curlError:r.error ? String(r.error.message || r.error) : "",
    stderr:clean(r.stderr).slice(0,500),
    httpCode,
    effectiveUrl:effectiveUrlRaw || "",
    contentType:contentTypeRaw || "",
    snapshotPath:fs.existsSync(snapshotPath) ? snapshotPath : "",
    snapshotByteLength:Buffer.byteLength(text),
    snapshotSha256:text ? sha(text) : "",
    startedAt,
    endedAt,
    text
  };
}

function analyze(row){
  const text = row.text || "";
  const lower = text.toLowerCase();
  const visible = lower.replace(/<script[\s\S]*?<\/script>/g," ").replace(/<style[\s\S]*?<\/style>/g," ").replace(/<[^>]+>/g," ").replace(/\s+/g," ");
  const routeText = `${row.url} ${row.effectiveUrl} ${visible.slice(0,20000)}`.toLowerCase();

  const title = (text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s+/g," ").trim();
  const standingsTokenCount = (routeText.match(/standings|standing|points standing|league table|classification|classement|classifica|classificação|classificacao|posiciones|tabla|ranking|ladder/g) || []).length;
  const footballTokenCount = (routeText.match(/football|soccer|futbol|fútbol|futebol|association|federation|league|division|premier/g) || []).length;
  const tableTagCount = (lower.match(/<table\b/g) || []).length;
  const trCount = (lower.match(/<tr\b/g) || []).length;
  const jsonScriptCount = (lower.match(/application\/json|__next_data__|window\.__|initialstate|standings/g) || []).length;
  const teamishCount = (visible.match(/\b[A-Z][A-Za-zÀ-ž.' -]{3,}\b/g) || []).length;
  const numberishCount = (visible.match(/\b\d{1,3}\b/g) || []).length;

  let shapeScore = 0;
  if(row.httpCode >= 200 && row.httpCode < 300) shapeScore += 40;
  shapeScore += Math.min(standingsTokenCount, 6) * 20;
  shapeScore += Math.min(footballTokenCount, 8) * 8;
  if(tableTagCount) shapeScore += 50;
  if(trCount >= 8) shapeScore += 45;
  if(jsonScriptCount >= 2) shapeScore += 20;
  if(teamishCount >= 8 && numberishCount >= 20) shapeScore += 35;
  if(/facebook|instagram|linkedin|twitter|x\.com/i.test(row.host)) shapeScore -= 200;
  if(/fifa\.com/i.test(row.host) && !standingsTokenCount) shapeScore -= 35;

  const probeStatus = shapeScore >= 140
    ? "shape_candidate_requires_parser_contract"
    : (row.httpCode >= 200 && row.httpCode < 300 ? "fetched_2xx_no_standings_shape" : "fetch_not_2xx_or_error");

  return {
    ...row,
    text: undefined,
    pageTitle:title,
    standingsTokenCount,
    footballTokenCount,
    tableTagCount,
    trCount,
    jsonScriptCount,
    teamishCount,
    numberishCount,
    shapeScore,
    probeStatus
  };
}

for(const row of uniqRows(plannedRows)){
  fetchRows.push(analyze(fetchUrl(row)));
}

const bestBySlug = new Map();
for(const r of fetchRows){
  const prev = bestBySlug.get(r.competitionSlug);
  if(!prev || r.shapeScore > prev.shapeScore) bestBySlug.set(r.competitionSlug, r);
}
const bestRows = [...bestBySlug.values()].sort((a,b)=>b.shapeScore-a.shapeScore || a.competitionSlug.localeCompare(b.competitionSlug));
const shapeRows = bestRows.filter(r => r.probeStatus === "shape_candidate_requires_parser_contract");

const summary = {
  status:"passed",
  inputCandidateCount:sourceCandidates.length,
  socialBlockedCandidateCount:blockedCandidateRows.length,
  plannedFetchRowCount:uniqRows(plannedRows).length,
  fetchExecutedNowCount:fetchRows.length,
  fetched2xxCount:fetchRows.filter(r => r.httpCode >= 200 && r.httpCode < 300).length,
  bestCompetitionCount:bestRows.length,
  shapeCandidateCompetitionCount:shapeRows.length,
  shapeCandidateSlugs:shapeRows.map(r=>r.competitionSlug),
  bestRowsByProbeStatus:Object.entries(bestRows.reduce((a,r)=>{ a[r.probeStatus]=(a[r.probeStatus]||0)+1; return a; },{})).map(([probeStatus,count])=>({probeStatus,count})),
  allRowsByProbeStatus:Object.entries(fetchRows.reduce((a,r)=>{ a[r.probeStatus]=(a[r.probeStatus]||0)+1; return a; },{})).map(([probeStatus,count])=>({probeStatus,count})),
  searchExecutedNowCount:0,
  broadSearchExecutedNowCount:0,
  standingsExtractionExecutedNowCount:0,
  canonicalWriteExecutedNowCount:0,
  productionWriteExecutedNowCount:0,
  truthAssertionExecutedNowCount:0
};

const out = {
  generatedAtUtc:new Date().toISOString(),
  status:"passed",
  inputPath,
  summary,
  blockedCandidateRows,
  plannedRows:uniqRows(plannedRows),
  fetchRows,
  bestRows,
  shapeCandidateRows:shapeRows,
  policy:{
    controlledFetchProbeOnly:true,
    noSearch:true,
    noCanonicalCandidateWrite:true,
    noProductionTruth:true,
    noTruthAssertion:true,
    socialPlatformCandidatesBlocked:true,
    nextAllowedAction:"build_parser_contract_for_shape_candidates_only"
  }
};

writeJson(outPath,out);
console.log(JSON.stringify(summary,null,2));
