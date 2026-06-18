#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const allowFetch = process.argv.includes("--allow-fetch");
if (!allowFetch) throw new Error("Refusing network fetch without --allow-fetch");

const OUT_DIR = path.join(ROOT, "data", "football-truth", "_diagnostics", `denmark-superliga-season-stage-discovery-${DATE}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

const TOKEN = "5b6ab6f5eb84c60031bbbd24";
const BASE_PARAMS = `appName=superligadk&access_token=${TOKEN}&env=production&locale=da`;
const ROOT_API = "https://api.superliga.dk";
const TT_ID = 46;

function rel(p) { return path.relative(ROOT, p).replaceAll("\\", "/"); }
function sha256(x) { return crypto.createHash("sha256").update(String(x || "")).digest("hex"); }
function num(x) { return Number.isFinite(Number(x)) ? Number(x) : null; }

function arithmetic(rows) {
  const failures = [];
  for (const row of rows) {
    const playedExpected = row.won + row.drawn + row.lost;
    if (row.played !== playedExpected) failures.push({ teamName: row.teamName, check: "played=w+d+l", played: row.played, expected: playedExpected });
    const pointsExpected = row.won * 3 + row.drawn;
    if (row.points !== pointsExpected) failures.push({ teamName: row.teamName, check: "points=3w+d", points: row.points, expected: pointsExpected });
    if (row.goalDifference !== row.goalsFor - row.goalsAgainst) failures.push({ teamName: row.teamName, check: "gd=gf-ga", goalDifference: row.goalDifference, expected: row.goalsFor - row.goalsAgainst });
  }
  return { status: failures.length ? "failed" : "passed", tested: rows.length, failed: failures.length, failures: failures.slice(0, 20) };
}

function nonZeroGate(rows) {
  const totalPlayed = rows.reduce((s, r) => s + (Number(r.played) || 0), 0);
  const totalPoints = rows.reduce((s, r) => s + (Number(r.points) || 0), 0);
  const maxPlayed = Math.max(0, ...rows.map((r) => Number(r.played) || 0));
  const maxPoints = Math.max(0, ...rows.map((r) => Number(r.points) || 0));
  return {
    status: totalPlayed > 0 && totalPoints > 0 && maxPlayed > 0 && maxPoints > 0 ? "passed" : "failed",
    totalPlayed,
    totalPoints,
    maxPlayed,
    maxPoints
  };
}

async function fetchText(url) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "accept": "application/json,text/plain,*/*",
        "user-agent": "Ai-MatchLab-FootballTruth/1.0 controlled-diagnostic-probe",
        "origin": "https://superliga.dk",
        "referer": "https://superliga.dk/stillinger"
      }
    });
    clearTimeout(timer);
    const text = await res.text();
    let json = null;
    let jsonStatus = "not_json";
    try { json = JSON.parse(text); jsonStatus = "parsed_json"; } catch {}
    return {
      url,
      ok: res.ok,
      httpStatus: res.status,
      contentType: res.headers.get("content-type") || "",
      byteCount: Buffer.byteLength(text),
      sha256: sha256(text),
      durationMs: Date.now() - started,
      jsonStatus,
      json,
      textPreview: text.slice(0, 1200).replace(/\s+/g, " ").trim()
    };
  } catch (err) {
    clearTimeout(timer);
    return { url, ok: false, httpStatus: null, contentType: "", byteCount: 0, sha256: null, durationMs: Date.now() - started, jsonStatus: "fetch_failed", json: null, error: String(err?.message || err) };
  }
}

function collectIds(value, pathName = "$", out = [], depth = 0) {
  if (depth > 8 || out.length > 5000) return out;
  if (Array.isArray(value)) {
    for (let i = 0; i < Math.min(value.length, 100); i++) collectIds(value[i], `${pathName}[${i}]`, out, depth + 1);
  } else if (value && typeof value === "object") {
    const keys = Object.keys(value);
    const picked = {};
    for (const k of keys) {
      if (/season|stage|tournament|round|name|title|year|label|id/i.test(k)) picked[k] = value[k];
    }
    if (Object.keys(picked).length) out.push({ path: pathName, picked });
    for (const [k, v] of Object.entries(value).slice(0, 120)) collectIds(v, `${pathName}.${k}`, out, depth + 1);
  }
  return out;
}

function findCandidateIds(idRows) {
  const ids = new Set();
  const stageIds = new Set();
  for (const row of idRows) {
    for (const [k, v] of Object.entries(row.picked || {})) {
      if (/season/i.test(k) && /^\d+$/.test(String(v))) ids.add(String(v));
      if (/stage/i.test(k) && /^\d+$/.test(String(v))) stageIds.add(String(v));
    }
  }
  return {
    seasonIds: [...ids].slice(0, 40),
    stageIds: [...stageIds].slice(0, 40)
  };
}

function extractRows(json, sourceUrl) {
  if (!Array.isArray(json)) return [];
  return json.map((r) => {
    const goalsFor = num(r.goalsScored);
    const goalsAgainst = num(r.goalsConceded);
    return {
      competitionSlug: "den.1",
      seasonScope: "previous_completed_candidate",
      seasonLabel: null,
      provider: "official_api",
      sourceHost: "api.superliga.dk",
      sourceUrl,
      extractionAdapter: "superliga_dk_api_standings",
      position: num(r.rank),
      teamName: String(r.teamName || "").trim(),
      played: num(r.matchesPlayed),
      won: num(r.matchesWon),
      drawn: num(r.matchesDraw),
      lost: num(r.matchesLost),
      goalsFor,
      goalsAgainst,
      goalDifference: goalsFor !== null && goalsAgainst !== null ? goalsFor - goalsAgainst : null,
      points: num(r.points),
      tournamentStageId: r.tournamentStageId ?? null,
      tournamentStageName: r.tournamentStageName ?? null
    };
  }).filter((r) => Number.isInteger(r.position) && r.teamName && [r.played, r.won, r.drawn, r.lost, r.goalsFor, r.goalsAgainst, r.goalDifference, r.points].every(Number.isInteger)).sort((a, b) => a.position - b.position);
}

function scoreStandingCandidate(rows) {
  const ar = arithmetic(rows);
  const nz = nonZeroGate(rows);
  const expectedRowsMatch = rows.length === 12;
  const expectedTeamSignals = ["F.C. København", "FC Midtjylland", "Brøndby IF", "AGF", "FC Nordsjælland", "Silkeborg IF"];
  const teamText = rows.map((r) => r.teamName).join(" | ").toLowerCase();
  const expectedTeamSignalCount = expectedTeamSignals.filter((team) => teamText.includes(team.toLowerCase())).length;
  const status = expectedRowsMatch && expectedTeamSignalCount >= 4 && ar.status === "passed" && nz.status === "passed" ? "accepted_previous_completed_candidate" : "rejected";
  return { status, expectedRowsMatch, expectedTeamSignalCount, arithmetic: ar, nonZeroGate: nz };
}

const discoveryUrls = [
  `${ROOT_API}/tournaments/${TT_ID}?${BASE_PARAMS}`,
  `${ROOT_API}/tournaments/${TT_ID}/season?${BASE_PARAMS}`,
  `${ROOT_API}/tournaments/${TT_ID}/season?${BASE_PARAMS}&seasonId=`,
  `${ROOT_API}/events-v2?appName=dk.releaze.livecenter.spdk&access_token=${TOKEN}&env=production&locale=da&ttId=${TT_ID}&seasonId=`
];

const discoveryResults = [];
for (const url of discoveryUrls) {
  console.error(`FETCH_DISCOVERY ${url}`);
  discoveryResults.push(await fetchText(url));
}

const idRows = discoveryResults.flatMap((r) => r.json ? collectIds(r.json) : []);
const discovered = findCandidateIds(idRows);

const standingUrls = new Set();
standingUrls.add(`${ROOT_API}/tournaments/${TT_ID}/standings?${BASE_PARAMS}&addResults=true&resultsLimit=999&type=&form=last&stageId=`);
for (const stageId of discovered.stageIds) {
  standingUrls.add(`${ROOT_API}/tournaments/${TT_ID}/standings?${BASE_PARAMS}&addResults=true&resultsLimit=999&type=&form=last&stageId=${stageId}`);
}
for (const seasonId of discovered.seasonIds) {
  standingUrls.add(`${ROOT_API}/tournaments/${TT_ID}/standings?${BASE_PARAMS}&addResults=true&resultsLimit=999&type=&form=last&stageId=&seasonId=${seasonId}`);
  standingUrls.add(`${ROOT_API}/tournaments/${TT_ID}/season?${BASE_PARAMS}&seasonId=${seasonId}`);
}
for (const likely of ["2025", "2026", "20252026", "2024", "20242025"]) {
  standingUrls.add(`${ROOT_API}/tournaments/${TT_ID}/standings?${BASE_PARAMS}&addResults=true&resultsLimit=999&type=&form=last&stageId=&seasonId=${likely}`);
  standingUrls.add(`${ROOT_API}/tournaments/${TT_ID}/season?${BASE_PARAMS}&seasonId=${likely}`);
}

const standingResults = [];
for (const url of [...standingUrls].slice(0, 80)) {
  console.error(`FETCH_STANDING_VARIANT ${url}`);
  const fetched = await fetchText(url);
  const rows = extractRows(fetched.json, url);
  const gate = scoreStandingCandidate(rows);
  standingResults.push({
    url,
    ok: fetched.ok,
    httpStatus: fetched.httpStatus,
    contentType: fetched.contentType,
    byteCount: fetched.byteCount,
    sha256: fetched.sha256,
    jsonStatus: fetched.jsonStatus,
    parsedRowCount: rows.length,
    tournamentStageIds: [...new Set(rows.map((r) => r.tournamentStageId).filter((x) => x !== null))],
    tournamentStageNames: [...new Set(rows.map((r) => r.tournamentStageName).filter(Boolean))],
    gate,
    rowsPreview: rows.slice(0, 14),
    textPreview: rows.length ? null : fetched.textPreview
  });
}

const accepted = standingResults.filter((r) => r.gate.status === "accepted_previous_completed_candidate");
accepted.sort((a, b) => (b.gate.nonZeroGate.totalPlayed || 0) - (a.gate.nonZeroGate.totalPlayed || 0));

const summary = {
  status: "passed",
  runner: "denmark_superliga_season_stage_discovery",
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: discoveryResults.length + standingResults.length,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  discoveryUrlCount: discoveryUrls.length,
  discovery2xxCount: discoveryResults.filter((r) => r.ok).length,
  discoveredSeasonIdCount: discovered.seasonIds.length,
  discoveredStageIdCount: discovered.stageIds.length,
  standingVariantFetchCount: standingResults.length,
  acceptedPreviousCompletedCandidateCount: accepted.length,
  rejectedAllZeroOrInvalidCount: standingResults.length - accepted.length,
  bestAcceptedTotalPlayed: accepted[0]?.gate?.nonZeroGate?.totalPlayed || 0,
  recommendedNextLane: accepted.length ? "promote_denmark_superliga_previous_completed_api_adapter" : "inspect_superliga_season_stage_discovery_and_refine_parameters"
};

const outPath = path.join(OUT_DIR, `denmark-superliga-season-stage-discovery-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `denmark-superliga-season-stage-discovery-rows-${DATE}.jsonl`);
fs.writeFileSync(outPath, JSON.stringify({ summary, discovered, discoveryResults: discoveryResults.map((r) => ({ ...r, json: undefined })), idRows: idRows.slice(0, 400), standingResults, accepted }, null, 2) + "\n", "utf8");
fs.writeFileSync(rowsPath, standingResults.map((r) => JSON.stringify(r)).join("\n") + (standingResults.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({ output: rel(outPath), rowsOutput: rel(rowsPath), summary }, null, 2));
if (!accepted.length) throw new Error("No non-zero previous-completed Denmark Superliga standings candidate found.");
