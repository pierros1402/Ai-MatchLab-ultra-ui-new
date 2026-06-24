#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const allowFetch = process.argv.includes("--allow-fetch");
if (!allowFetch) throw new Error("Refusing network fetch without --allow-fetch");

const MATERIALIZATION_PATH = path.join(ROOT, "data", "football-truth", "_diagnostics", `bulk-rendered-candidate-materialization-probe-${DATE}`, `bulk-rendered-candidate-materialization-probe-${DATE}.json`);
const OUT_DIR = path.join(ROOT, "data", "football-truth", "_diagnostics", `controlled-api-route-fetch-probe-${DATE}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

function rel(p) { return path.relative(ROOT, p).replaceAll("\\", "/"); }
function readJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }
function sha256(x) { return crypto.createHash("sha256").update(String(x || "")).digest("hex"); }

function safeUrl(u) {
  try { return new URL(u); } catch { return null; }
}

function looksUsefulApiUrl(url) {
  const u = safeUrl(url);
  if (!u) return false;
  const host = u.hostname.toLowerCase();
  const text = `${u.hostname}${u.pathname}${u.search}`.toLowerCase();

  if (/account|pingone|payment|checkout|adobe|preferences|personalisation|companion|signin|login|auth|user|profile|mapper|cdn|analytics|tag|consent/.test(text)) return false;
  if (!/premierleague|premier-league|pulselive|ligue1|ligaportugal|superliga|ekstraklasa/.test(host)) return false;
  if (!/(api|stand|table|ranking|competition|league|club|team|season|stats|football)/.test(text)) return false;
  return true;
}

function collectJsonPaths(value, pathName = "$", out = [], depth = 0) {
  if (depth > 9 || out.length > 1500) return out;
  if (Array.isArray(value)) {
    out.push({ path: pathName, type: "array", length: value.length, sampleKeys: value[0] && typeof value[0] === "object" ? Object.keys(value[0]).slice(0, 40) : [] });
    if (value.length) collectJsonPaths(value[0], `${pathName}[0]`, out, depth + 1);
  } else if (value && typeof value === "object") {
    const keys = Object.keys(value);
    out.push({ path: pathName, type: "object", keyCount: keys.length, sampleKeys: keys.slice(0, 50) });
    for (const k of keys.slice(0, 80)) collectJsonPaths(value[k], `${pathName}.${k}`, out, depth + 1);
  }
  return out;
}

function scorePath(p) {
  const text = `${p.path} ${(p.sampleKeys || []).join(" ")}`.toLowerCase();
  let score = 0;
  for (const k of ["standing", "standings", "table", "ranking", "classification", "league", "competition"]) if (text.includes(k)) score += 50;
  for (const k of ["team", "club", "points", "played", "won", "draw", "lost", "position", "rank", "overall"]) if (text.includes(k)) score += 20;
  if (p.type === "array") score += Math.min(Number(p.length || 0), 40);
  return score;
}

async function fetchCandidate(url, slug) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "accept": "application/json,text/plain,*/*",
        "user-agent": "Ai-MatchLab-FootballTruth/1.0 controlled-diagnostic-probe",
        "origin": "https://www.premierleague.com",
        "referer": "https://www.premierleague.com/tables"
      }
    });
    clearTimeout(timer);
    const contentType = res.headers.get("content-type") || "";
    const text = await res.text();
    const textPreview = text.slice(0, 1200).replace(/\s+/g, " ").trim();
    let jsonStatus = "not_json";
    let topPaths = [];
    let topLevelKeys = [];
    try {
      const parsed = JSON.parse(text);
      jsonStatus = "parsed_json";
      topLevelKeys = parsed && typeof parsed === "object" ? Object.keys(parsed).slice(0, 50) : [];
      topPaths = collectJsonPaths(parsed).map((p) => ({ ...p, score: scorePath(p) })).sort((a, b) => b.score - a.score).slice(0, 50);
    } catch {}

    return {
      competitionSlug: slug,
      url,
      status: "fetched",
      httpStatus: res.status,
      ok: res.ok,
      contentType,
      byteCount: Buffer.byteLength(text),
      sha256: sha256(text),
      durationMs: Date.now() - started,
      jsonStatus,
      topLevelKeys,
      topPaths,
      textPreview,
      recommendedNextAction: res.ok && jsonStatus === "parsed_json" && topPaths.some((p) => p.score >= 100)
        ? "build_api_json_extractor_probe"
        : res.ok
          ? "inspect_response_shape_or_refine_endpoint"
          : "reject_or_adjust_api_endpoint"
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      competitionSlug: slug,
      url,
      status: "fetch_failed",
      error: String(err?.message || err),
      durationMs: Date.now() - started,
      recommendedNextAction: "reject_or_adjust_api_endpoint"
    };
  }
}

const materialization = readJson(MATERIALIZATION_PATH);
const apiRows = materialization.apiRouteMiningBoard || [];
const candidates = [];

for (const row of apiRows) {
  for (const url of row.topApiLikeUrls || []) {
    if (!looksUsefulApiUrl(url)) continue;
    candidates.push({
      competitionSlug: row.competitionSlug,
      sourceHost: row.sourceHost,
      url
    });
  }
}

const unique = [];
const seen = new Set();
for (const c of candidates) {
  const key = `${c.competitionSlug}|${c.url}`;
  if (seen.has(key)) continue;
  seen.add(key);
  unique.push(c);
}

const results = [];
for (const c of unique.slice(0, 20)) {
  console.error(`FETCH_API_CANDIDATE ${c.competitionSlug} ${c.url}`);
  results.push(await fetchCandidate(c.url, c.competitionSlug));
}

const summary = {
  status: "passed",
  runner: "controlled_api_route_fetch_probe",
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: results.length,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  sourceMaterializationPath: rel(MATERIALIZATION_PATH),
  inputApiBoardRowsCount: apiRows.length,
  rawApiLikeUrlCount: apiRows.reduce((sum, r) => sum + ((r.topApiLikeUrls || []).length), 0),
  acceptedFetchCandidateCount: unique.length,
  fetched2xxCount: results.filter((r) => r.ok).length,
  parsedJsonCount: results.filter((r) => r.jsonStatus === "parsed_json").length,
  extractorProbeCandidateCount: results.filter((r) => r.recommendedNextAction === "build_api_json_extractor_probe").length,
  recommendedNextLane: results.some((r) => r.recommendedNextAction === "build_api_json_extractor_probe")
    ? "build_api_json_extractor_probe_for_successful_official_api_candidate"
    : "replace_or_refine_api_routes_and_continue_official_source_specific_mining"
};

const outPath = path.join(OUT_DIR, `controlled-api-route-fetch-probe-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `controlled-api-route-fetch-probe-rows-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({ summary, fetchCandidates: unique, results }, null, 2) + "\n", "utf8");
fs.writeFileSync(rowsPath, results.map((r) => JSON.stringify(r)).join("\n") + (results.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  summary
}, null, 2));
