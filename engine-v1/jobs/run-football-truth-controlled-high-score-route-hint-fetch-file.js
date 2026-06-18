#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const allowFetch = process.argv.includes("--allow-fetch");
if (!allowFetch) throw new Error("Refusing network fetch without --allow-fetch");

const ROUTE_MINING_PATH = path.join(ROOT, "data", "football-truth", "_diagnostics", `official-asset-api-route-mining-probe-${DATE}`, `official-asset-api-route-mining-probe-${DATE}.json`);
const OUT_DIR = path.join(ROOT, "data", "football-truth", "_diagnostics", `controlled-high-score-route-hint-fetch-${DATE}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

function rel(p) { return path.relative(ROOT, p).replaceAll("\\", "/"); }
function readJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }
function sha256(x) { return crypto.createHash("sha256").update(String(x || "")).digest("hex"); }

function safeUrl(url) {
  try { return new URL(url).toString(); } catch { return null; }
}

function normalizedCandidateUrl(raw) {
  let u = String(raw || "").trim();
  u = u.replace(/^https:\/\/[^/]+\/https:\/\//, "https://");
  u = u.replace(/&amp;/g, "&");
  if (u.includes("%1%") || u.includes("%2%") || u.includes("%3%") || u.includes("%4%") || u.includes("%5%")) return null;
  return safeUrl(u);
}

function buildCandidates(routeMining) {
  const out = [];

  for (const row of routeMining.rows || []) {
    for (const hint of row.topRouteHints || []) {
      const rawUrl = String(hint.url || "");
      const score = Number(hint.score || 0);
      if (score < 140) continue;

      const direct = normalizedCandidateUrl(rawUrl);
      if (direct && !/(doubleclick|facebook|translations\.premier|ariaLabel|label\.|meta\.|nextjs\.org|fantasy|cache:)/i.test(direct)) {
        out.push({ competitionSlug: row.competitionSlug, sourceHost: row.sourceHost, url: direct, sourceHint: rawUrl, score, candidateType: "direct_high_score_hint" });
      }

      if (row.competitionSlug === "por.1" && rawUrl.includes("/api/v2/competition/standings")) {
        for (const live of ["false", "0", "true"]) {
          for (const round of ["20252026", ""]) {
            out.push({
              competitionSlug: "por.1",
              sourceHost: "ligaportugal.pt",
              url: `https://www.ligaportugal.pt/api/v2/competition/standings?competition=854&season=20252026&live=${live}&round=${round}`,
              sourceHint: rawUrl,
              score: score + 25,
              candidateType: "template_substitution_liga_portugal_betclic"
            });
          }
        }
      }

      if (row.competitionSlug === "por.1" && rawUrl.includes("/api/v2/international/competition/%1%/standings")) {
        out.push({
          competitionSlug: "por.1",
          sourceHost: "ligaportugal.pt",
          url: "https://www.ligaportugal.pt/api/v2/international/competition/854/standings",
          sourceHint: rawUrl,
          score: score + 5,
          candidateType: "template_substitution_liga_portugal_international"
        });
      }
    }
  }

  out.push({
    competitionSlug: "den.1",
    sourceHost: "superliga.dk",
    url: "https://api.superliga.dk/tournaments/46/standings?appName=superligadk&access_token=5b6ab6f5eb84c60031bbbd24&env=production&locale=da&addResults=true&resultsLimit=999&type=&form=last&stageId=",
    sourceHint: "asset_mined_direct_superliga_standings",
    score: 200,
    candidateType: "known_direct_asset_mined_standings"
  });

  out.push({
    competitionSlug: "por.1",
    sourceHost: "ligaportugal.pt",
    url: "https://www.ligaportugal.pt/competition/854/liga-portugal-betclic/round/20252026?tab=standings",
    sourceHint: "asset_mined_rendered_standings_route",
    score: 150,
    candidateType: "official_rendered_route"
  });

  const seen = new Set();
  return out
    .filter((c) => c.url && !seen.has(`${c.competitionSlug}|${c.url}`) && seen.add(`${c.competitionSlug}|${c.url}`))
    .sort((a, b) => b.score - a.score)
    .slice(0, 24);
}

function collectJsonPaths(value, pathName = "$", out = [], depth = 0) {
  if (depth > 10 || out.length > 3000) return out;
  if (Array.isArray(value)) {
    out.push({ path: pathName, type: "array", length: value.length, sampleKeys: value[0] && typeof value[0] === "object" ? Object.keys(value[0]).slice(0, 60) : [] });
    for (let i = 0; i < Math.min(3, value.length); i++) collectJsonPaths(value[i], `${pathName}[${i}]`, out, depth + 1);
  } else if (value && typeof value === "object") {
    const keys = Object.keys(value);
    out.push({ path: pathName, type: "object", keyCount: keys.length, sampleKeys: keys.slice(0, 80) });
    for (const k of keys.slice(0, 100)) collectJsonPaths(value[k], `${pathName}.${k}`, out, depth + 1);
  }
  return out;
}

function scoreJsonPath(p) {
  const text = `${p.path} ${(p.sampleKeys || []).join(" ")}`.toLowerCase();
  let score = 0;
  for (const k of ["standing", "standings", "rank", "ranking", "classification", "table"]) if (text.includes(k)) score += 80;
  for (const k of ["team", "club", "participant", "contestant", "name", "points", "played", "matches", "won", "draw", "lost", "position"]) if (text.includes(k)) score += 30;
  if (p.type === "array") score += Math.min(Number(p.length || 0), 60);
  return score;
}

function findStandingLikeArrays(value, pathName = "$", out = [], depth = 0) {
  if (depth > 12 || out.length > 200) return out;
  if (Array.isArray(value)) {
    const sample = value.filter((x) => x && typeof x === "object").slice(0, 8);
    const keys = [...new Set(sample.flatMap((x) => Object.keys(x)))];
    const keyText = keys.join(" ").toLowerCase();
    let score = 0;
    for (const k of ["team", "club", "participant", "contestant", "name"]) if (keyText.includes(k)) score += 40;
    for (const k of ["point", "played", "match", "won", "draw", "lost", "position", "rank", "goal"]) if (keyText.includes(k)) score += 30;
    if (value.length >= 8 && value.length <= 30) score += 40;
    if (score >= 70) out.push({ path: pathName, length: value.length, score, sampleKeys: keys.slice(0, 80), sampleRows: sample.slice(0, 3) });
    for (let i = 0; i < Math.min(3, value.length); i++) findStandingLikeArrays(value[i], `${pathName}[${i}]`, out, depth + 1);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value).slice(0, 120)) findStandingLikeArrays(v, `${pathName}.${k}`, out, depth + 1);
  }
  return out;
}

async function fetchCandidate(c) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(c.url, {
      signal: controller.signal,
      headers: {
        "accept": "application/json,text/plain,text/html,*/*",
        "user-agent": "Ai-MatchLab-FootballTruth/1.0 controlled-diagnostic-probe",
        "referer": c.sourceHost === "superliga.dk" ? "https://superliga.dk/stillinger" : "https://www.ligaportugal.pt/",
        "origin": c.sourceHost === "superliga.dk" ? "https://superliga.dk" : "https://www.ligaportugal.pt"
      }
    });
    clearTimeout(timer);
    const text = await res.text();
    let jsonStatus = "not_json";
    let topPaths = [];
    let standingLikeArrays = [];
    let topLevelKeys = [];
    try {
      const parsed = JSON.parse(text);
      jsonStatus = "parsed_json";
      topLevelKeys = parsed && typeof parsed === "object" ? Object.keys(parsed).slice(0, 80) : [];
      topPaths = collectJsonPaths(parsed).map((p) => ({ ...p, score: scoreJsonPath(p) })).sort((a, b) => b.score - a.score).slice(0, 80);
      standingLikeArrays = findStandingLikeArrays(parsed).sort((a, b) => b.score - a.score).slice(0, 30);
    } catch {}

    const tableCount = (text.match(/<table\b/gi) || []).length;

    return {
      ...c,
      status: "fetched",
      httpStatus: res.status,
      ok: res.ok,
      contentType: res.headers.get("content-type") || "",
      byteCount: Buffer.byteLength(text),
      sha256: sha256(text),
      durationMs: Date.now() - started,
      jsonStatus,
      topLevelKeys,
      topPaths,
      standingLikeArrays,
      tableCount,
      textPreview: text.slice(0, 1400).replace(/\s+/g, " ").trim(),
      recommendedNextAction: res.ok && jsonStatus === "parsed_json" && standingLikeArrays.length
        ? "build_api_standings_extractor_probe"
        : res.ok && tableCount
          ? "build_rendered_route_table_probe"
          : "reject_or_refine_route"
    };
  } catch (err) {
    clearTimeout(timer);
    return { ...c, status: "fetch_failed", error: String(err?.message || err), durationMs: Date.now() - started, recommendedNextAction: "reject_or_refine_route" };
  }
}

const routeMining = readJson(ROUTE_MINING_PATH);
const candidates = buildCandidates(routeMining);
const results = [];

for (const c of candidates) {
  console.error(`FETCH_ROUTE_HINT ${c.competitionSlug} ${c.url}`);
  results.push(await fetchCandidate(c));
}

const summary = {
  status: "passed",
  runner: "controlled_high_score_route_hint_fetch",
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: results.length,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  sourceRouteMiningPath: rel(ROUTE_MINING_PATH),
  candidateCount: candidates.length,
  fetched2xxCount: results.filter((r) => r.ok).length,
  parsedJsonCount: results.filter((r) => r.jsonStatus === "parsed_json").length,
  htmlTableRouteCount: results.filter((r) => r.ok && r.tableCount > 0).length,
  apiExtractorProbeCandidateCount: results.filter((r) => r.recommendedNextAction === "build_api_standings_extractor_probe").length,
  renderedRouteTableProbeCandidateCount: results.filter((r) => r.recommendedNextAction === "build_rendered_route_table_probe").length,
  recommendedNextLane: results.some((r) => r.recommendedNextAction === "build_api_standings_extractor_probe")
    ? "build_api_standings_extractor_probe_for_successful_route_hints"
    : results.some((r) => r.recommendedNextAction === "build_rendered_route_table_probe")
      ? "build_rendered_route_table_probe_for_successful_html_route"
      : "refine_or_replace_high_score_route_hints"
};

const outPath = path.join(OUT_DIR, `controlled-high-score-route-hint-fetch-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `controlled-high-score-route-hint-fetch-rows-${DATE}.jsonl`);
fs.writeFileSync(outPath, JSON.stringify({ summary, candidates, results }, null, 2) + "\n", "utf8");
fs.writeFileSync(rowsPath, results.map((r) => JSON.stringify(r)).join("\n") + (results.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({ output: rel(outPath), rowsOutput: rel(rowsPath), summary }, null, 2));
