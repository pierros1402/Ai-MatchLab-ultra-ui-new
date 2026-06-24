#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const allowFetch = process.argv.includes("--allow-fetch");
if (!allowFetch) throw new Error("Refusing network fetch without --allow-fetch");

const OUT_DIR = path.join(ROOT, "data", "football-truth", "_diagnostics", `denmark-superliga-api-standings-extractor-proof-${DATE}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

const SOURCE_URL = "https://api.superliga.dk/tournaments/46/standings?appName=superligadk&access_token=5b6ab6f5eb84c60031bbbd24&env=production&locale=da&addResults=true&resultsLimit=999&type=&form=last&stageId=";

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
  return { status: failures.length ? "failed" : "passed", tested: rows.length, failed: failures.length, failures };
}

async function fetchJson(url) {
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
    return {
      ok: res.ok,
      httpStatus: res.status,
      contentType: res.headers.get("content-type") || "",
      byteCount: Buffer.byteLength(text),
      sha256: sha256(text),
      durationMs: Date.now() - started,
      text,
      json: JSON.parse(text)
    };
  } catch (err) {
    clearTimeout(timer);
    throw new Error(`Fetch/parse failed: ${String(err?.message || err)}`);
  }
}

function extractRows(json) {
  if (!Array.isArray(json)) throw new Error("Expected Denmark Superliga standings API root to be an array.");

  return json.map((r) => {
    const goalsFor = num(r.goalsScored);
    const goalsAgainst = num(r.goalsConceded);
    return {
      competitionSlug: "den.1",
      seasonScope: "previous_completed",
      seasonLabel: "2025-2026",
      provider: "official_api",
      sourceHost: "api.superliga.dk",
      sourceUrl: SOURCE_URL,
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
      rawKeys: Object.keys(r).sort()
    };
  }).filter((r) =>
    Number.isInteger(r.position) &&
    r.teamName &&
    [r.played, r.won, r.drawn, r.lost, r.goalsFor, r.goalsAgainst, r.goalDifference, r.points].every(Number.isInteger)
  ).sort((a, b) => a.position - b.position);
}

const fetched = await fetchJson(SOURCE_URL);
const rows = extractRows(fetched.json);
const expectedTeamSignals = ["FC København", "FC Midtjylland", "Brøndby IF", "AGF", "FC Nordsjælland", "Silkeborg IF"];
const teamText = rows.map((r) => r.teamName).join(" | ").toLowerCase();
const expectedTeamSignalCount = expectedTeamSignals.filter((team) => teamText.includes(team.toLowerCase())).length;
const ar = arithmetic(rows);

const summary = {
  status: fetched.ok && rows.length === 12 && expectedTeamSignalCount >= 4 && ar.status === "passed" ? "passed" : "failed",
  runner: "denmark_superliga_api_standings_extractor_proof",
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 1,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  sourceUrl: SOURCE_URL,
  sourceHost: "api.superliga.dk",
  httpStatus: fetched.httpStatus,
  contentType: fetched.contentType,
  responseByteCount: fetched.byteCount,
  responseSha256: fetched.sha256,
  parsedRootType: Array.isArray(fetched.json) ? "array" : typeof fetched.json,
  parsedRowCount: rows.length,
  expectedRows: 12,
  expectedRowsMatch: rows.length === 12,
  expectedTeamSignalCount,
  arithmeticStatus: ar.status,
  arithmeticFailureCount: ar.failed,
  recommendedNextLane: fetched.ok && rows.length === 12 && expectedTeamSignalCount >= 4 && ar.status === "passed"
    ? "promote_superliga_dk_api_standings_adapter_to_central_config"
    : "inspect_denmark_superliga_api_extractor_failure"
};

const outPath = path.join(OUT_DIR, `denmark-superliga-api-standings-extractor-proof-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `denmark-superliga-api-standings-extractor-proof-rows-${DATE}.jsonl`);
fs.writeFileSync(outPath, JSON.stringify({ summary, arithmetic: ar, rows }, null, 2) + "\n", "utf8");
fs.writeFileSync(rowsPath, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({ output: rel(outPath), rowsOutput: rel(rowsPath), summary }, null, 2));
if (summary.status !== "passed") throw new Error(`Denmark Superliga API extractor proof failed: ${JSON.stringify(summary)}`);
