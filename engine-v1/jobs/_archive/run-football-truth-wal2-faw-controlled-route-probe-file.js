import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const outDir = "data/football-truth/_diagnostics/wal2-faw-controlled-route-probe-2026-06-17";
const snapDir = path.join(outDir, "snapshots");
const outPath = path.join(outDir, "wal2-faw-controlled-route-probe-2026-06-17.json");

function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }
function clean(s){ return String(s ?? "").replace(/\s+/g," ").trim(); }
function sha(s){ return crypto.createHash("sha256").update(String(s)).digest("hex"); }
function safe(s){ return String(s).replace(/[^a-z0-9.-]+/gi,"_").slice(0,90); }
function strip(html){
  return clean(String(html||"")
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&"));
}
function hostOf(u){ try { return new URL(u).hostname.toLowerCase().replace(/^www\./,""); } catch { return ""; } }

const urls = [
  "https://faw.cymru/",
  "https://faw.cymru/cymru-leagues/",
  "https://faw.cymru/cymru-leagues/cymru-north/",
  "https://faw.cymru/cymru-leagues/cymru-south/",
  "https://faw.cymru/cymru-leagues/cymru-north/fixtures-results/",
  "https://faw.cymru/cymru-leagues/cymru-south/fixtures-results/",
  "https://faw.cymru/cymru-leagues/cymru-north/league-table/",
  "https://faw.cymru/cymru-leagues/cymru-south/league-table/",
  "https://faw.cymru/cymru-leagues/cymru-north/table/",
  "https://faw.cymru/cymru-leagues/cymru-south/table/",
  "https://faw.cymru/cymru-leagues/cymru-north/standings/",
  "https://faw.cymru/cymru-leagues/cymru-south/standings/",
  "https://faw.cymru/fixtures-results/",
  "https://faw.cymru/league-table/",
  "https://faw.cymru/tables/"
];

function fetchUrl(url, idx){
  const snapshotPath = path.join(snapDir, `${String(idx).padStart(3,"0")}-${safe(url)}.html`);
  const args = [
    "-L","--silent","--show-error","--compressed",
    "--max-time","20","--connect-timeout","8",
    "-A","Mozilla/5.0 AI-MatchLab-FootballTruth/wal2-controlled-route-probe",
    "-o", snapshotPath,
    "-w","%{http_code}\t%{url_effective}\t%{content_type}",
    url
  ];
  const r = spawnSync("curl.exe", args, {encoding:"utf8", timeout:25000, windowsHide:true});
  const [codeRaw,effectiveUrl,contentType] = clean(r.stdout).split("\t");
  const httpCode = Number(codeRaw || 0);
  let html = "";
  if(fs.existsSync(snapshotPath)){
    try { html = fs.readFileSync(snapshotPath,"utf8"); } catch {}
  }
  const visible = strip(html);
  const lower = `${url} ${effectiveUrl || ""} ${visible.slice(0,30000)}`.toLowerCase();
  const pageTitle = clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const tableTagCount = (html.toLowerCase().match(/<table\b/g) || []).length;
  const trCount = (html.toLowerCase().match(/<tr\b/g) || []).length;
  const standingsTokenCount = (lower.match(/standings|standing|league table|table|cymru north|cymru south|fixtures|results|played|points|pts/g) || []).length;
  const teamishCount = (visible.match(/\b[A-Z][A-Za-zÀ-ž.' -]{3,}\b/g) || []).length;
  const numberishCount = (visible.match(/\b\d{1,3}\b/g) || []).length;
  const status2xx = httpCode >= 200 && httpCode < 300;
  let shapeScore = 0;
  if(status2xx) shapeScore += 40;
  shapeScore += Math.min(standingsTokenCount,12) * 12;
  if(tableTagCount) shapeScore += 55;
  if(trCount >= 8) shapeScore += 35;
  if(teamishCount >= 8 && numberishCount >= 20) shapeScore += 25;
  if(/page not found|404/i.test(pageTitle + " " + visible.slice(0,1000))) shapeScore -= 120;
  if(hostOf(effectiveUrl || url) !== "faw.cymru") shapeScore -= 60;
  const probeStatus = shapeScore >= 150 ? "shape_candidate_requires_parser_contract" : (status2xx ? "fetched_2xx_no_standings_shape" : "fetch_not_2xx_or_error");
  return {
    competitionSlug:"wal.2",
    competitionName:"Cymru North / Cymru South",
    country:"Wales",
    url,
    host:hostOf(url),
    httpCode,
    effectiveUrl:effectiveUrl || "",
    effectiveHost:hostOf(effectiveUrl || url),
    contentType:contentType || "",
    curlExitCode:r.status,
    curlError:r.error ? String(r.error.message || r.error) : "",
    stderr:clean(r.stderr).slice(0,500),
    snapshotPath,
    snapshotByteLength:Buffer.byteLength(html),
    snapshotSha256:html ? sha(html) : "",
    pageTitle,
    tableTagCount,
    trCount,
    standingsTokenCount,
    teamishCount,
    numberishCount,
    shapeScore,
    probeStatus
  };
}

const fetchRows = urls.map((u,i)=>fetchUrl(u,i+1));
const shapeCandidateRows = fetchRows.filter(r=>r.probeStatus==="shape_candidate_requires_parser_contract").sort((a,b)=>b.shapeScore-a.shapeScore);
const bestRows = [...fetchRows].sort((a,b)=>b.shapeScore-a.shapeScore).slice(0,10);

const summary = {
  status:"passed",
  competitionSlug:"wal.2",
  controlledRouteProbeUrlCount:urls.length,
  fetchExecutedNowCount:fetchRows.length,
  fetched2xxCount:fetchRows.filter(r=>r.httpCode>=200 && r.httpCode<300).length,
  shapeCandidateCount:shapeCandidateRows.length,
  bestProbeStatus:bestRows[0]?.probeStatus || null,
  bestShapeScore:bestRows[0]?.shapeScore ?? null,
  searchExecutedNowCount:0,
  broadSearchExecutedNowCount:0,
  standingsExtractionExecutedNowCount:0,
  canonicalWriteExecutedNowCount:0,
  productionWriteExecutedNowCount:0,
  truthAssertionExecutedNowCount:0
};

writeJson(outPath,{
  generatedAtUtc:new Date().toISOString(),
  status:"passed",
  summary,
  fetchRows,
  shapeCandidateRows,
  bestRows,
  policy:{
    controlledWal2FawProbeOnly:true,
    noSearch:true,
    noCanonicalCandidateWrite:true,
    noProductionTruth:true,
    nextAllowedAction:"dry_extract_shape_candidates_only_else_park_wal2_lane"
  }
});
console.log(JSON.stringify(summary,null,2));
