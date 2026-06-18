#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const allowFetch = process.argv.includes("--allow-fetch");
if (!allowFetch) throw new Error("Refusing network fetch without --allow-fetch");

const CELL_ROWS_PATH = path.join(ROOT, "data", "football-truth", "_diagnostics", `bulk-rendered-cell-shape-inspection-${DATE}`, `bulk-rendered-cell-shape-inspection-rows-${DATE}.jsonl`);
const OUT_DIR = path.join(ROOT, "data", "football-truth", "_diagnostics", `official-asset-api-route-mining-probe-${DATE}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

function rel(p) { return path.relative(ROOT, p).replaceAll("\\", "/"); }
function sha256(x) { return crypto.createHash("sha256").update(String(x || "")).digest("hex"); }
function readJsonl(p) { return fs.readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)); }

function safeUrl(url, base) {
  try { return new URL(url, base).toString(); } catch { return null; }
}

function sameOfficialFamily(url, host) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    const wanted = String(host || "").toLowerCase();
    if (!wanted) return false;
    const root = wanted.split(".").slice(-2).join(".");
    return h.endsWith(root) || h.includes("pulselive.com") || h.includes("premier-league-prod");
  } catch {
    return false;
  }
}

function extractAssets(html, baseUrl, sourceHost) {
  const refs = [];
  const attrMatches = [...String(html || "").matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)].map((m) => m[1]);
  for (const raw of attrMatches) {
    const url = safeUrl(raw, baseUrl);
    if (!url) continue;
    if (!sameOfficialFamily(url, sourceHost)) continue;
    if (!/\.(js|mjs|json)(\?|$)|\/_next\/static\/|\/assets\/|\/static\/|\/build\/|\/dist\//i.test(url)) continue;
    refs.push(url);
  }
  return [...new Set(refs)].slice(0, 40);
}

function mineRouteStrings(text, baseUrl) {
  const found = new Set();

  const absoluteUrls = [...String(text || "").matchAll(/https?:\/\/[^"'`\s<>\\]+/g)].map((m) => m[0]);
  for (const url of absoluteUrls) {
    if (/(stand|standing|table|rank|ranking|competition|league|season|club|team|stats|football|api)/i.test(url)) found.add(url);
  }

  const quotedPaths = [...String(text || "").matchAll(/["'`]((?:\/|\.\/|\.\.\/)[^"'`\s<>\\]{3,220})["'`]/g)].map((m) => m[1]);
  for (const p of quotedPaths) {
    if (!/(stand|standing|table|rank|ranking|competition|league|season|club|team|stats|football|api)/i.test(p)) continue;
    const url = safeUrl(p, baseUrl);
    if (url) found.add(url);
  }

  const apiFragments = [...String(text || "").matchAll(/["'`]([A-Za-z0-9_./?&=%:-]*(?:standings?|tables?|rankings?|competitions?|seasons?|clubs?|teams?|football)[A-Za-z0-9_./?&=%:-]*)["'`]/gi)].map((m) => m[1]);
  for (const frag of apiFragments) {
    if (frag.length < 4 || frag.length > 220) continue;
    if (/^[A-Za-z0-9_-]+$/.test(frag)) continue;
    const url = safeUrl(frag.startsWith("/") ? frag : `/${frag}`, baseUrl);
    if (url) found.add(url);
  }

  return [...found].slice(0, 200);
}

function scoreRoute(url) {
  const text = String(url || "").toLowerCase();
  let score = 0;
  if (/standings?/.test(text)) score += 100;
  if (/table|ranking|rank/.test(text)) score += 70;
  if (/competition/.test(text)) score += 50;
  if (/season/.test(text)) score += 30;
  if (/api/.test(text)) score += 40;
  if (/club|team/.test(text)) score += 10;
  if (/login|auth|account|payment|checkout|preferences|personalisation|ads|analytics|consent|profile|user/.test(text)) score -= 200;
  if (/\.(png|jpg|jpeg|svg|webp|css|woff|woff2)(\?|$)/.test(text)) score -= 200;
  return score;
}

async function fetchText(url, referer) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Ai-MatchLab-FootballTruth/1.0 controlled-diagnostic-probe",
        "accept": "application/javascript,application/json,text/plain,*/*",
        "referer": referer
      }
    });
    clearTimeout(timer);
    const text = await res.text();
    return {
      url,
      ok: res.ok,
      httpStatus: res.status,
      contentType: res.headers.get("content-type") || "",
      byteCount: Buffer.byteLength(text),
      sha256: sha256(text),
      durationMs: Date.now() - started,
      text
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      url,
      ok: false,
      httpStatus: null,
      contentType: "",
      byteCount: 0,
      sha256: null,
      durationMs: Date.now() - started,
      error: String(err?.message || err),
      text: ""
    };
  }
}

const targetSlugs = new Set(["eng.1", "fra.1", "por.1", "den.1", "pol.1"]);
const cellRows = readJsonl(CELL_ROWS_PATH).filter((r) => targetSlugs.has(r.competitionSlug));

const rows = [];
let fetchExecutedNowCount = 0;

for (const target of cellRows) {
  const htmlPath = target.renderedHtmlPath ? path.join(ROOT, target.renderedHtmlPath) : null;
  const html = htmlPath && fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, "utf8") : "";
  const assets = extractAssets(html, target.sourceUrl, target.sourceHost);
  const minedFromHtml = mineRouteStrings(html, target.sourceUrl).map((url) => ({ url, source: "rendered_html", score: scoreRoute(url) }));

  const assetFetches = [];
  for (const assetUrl of assets.slice(0, 12)) {
    console.error(`FETCH_ASSET ${target.competitionSlug} ${assetUrl}`);
    const fetched = await fetchText(assetUrl, target.sourceUrl);
    fetchExecutedNowCount++;
    const routeHints = mineRouteStrings(fetched.text, assetUrl).map((url) => ({ url, source: assetUrl, score: scoreRoute(url) }));
    assetFetches.push({
      url: assetUrl,
      ok: fetched.ok,
      httpStatus: fetched.httpStatus,
      contentType: fetched.contentType,
      byteCount: fetched.byteCount,
      sha256: fetched.sha256,
      durationMs: fetched.durationMs,
      error: fetched.error || null,
      routeHintCount: routeHints.length,
      topRouteHints: routeHints.sort((a, b) => b.score - a.score).slice(0, 40)
    });
  }

  const allRouteHints = [...minedFromHtml, ...assetFetches.flatMap((x) => x.topRouteHints || [])]
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const deduped = [];
  const seen = new Set();
  for (const hint of allRouteHints) {
    const key = hint.url;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(hint);
  }

  rows.push({
    competitionSlug: target.competitionSlug,
    sourceHost: target.sourceHost,
    sourceUrl: target.sourceUrl,
    renderedHtmlPath: target.renderedHtmlPath,
    renderedByteCount: target.renderedByteCount,
    assetCandidateCount: assets.length,
    fetchedAssetCount: assetFetches.length,
    fetchedAsset2xxCount: assetFetches.filter((x) => x.ok).length,
    assetFetches,
    renderedHtmlRouteHintCount: minedFromHtml.length,
    totalPositiveRouteHintCount: deduped.length,
    topRouteHints: deduped.slice(0, 80),
    recommendedNextAction: deduped.some((x) => x.score >= 140)
      ? "controlled_fetch_high_score_route_hints"
      : deduped.length
        ? "review_route_hints_before_fetch"
        : "replace_route_or_source_specific_search"
  });
}

const summary = {
  status: "passed",
  runner: "official_asset_api_route_mining_probe",
  searchExecutedNowCount: 0,
  fetchExecutedNowCount,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  targetCount: rows.length,
  totalAssetCandidateCount: rows.reduce((sum, r) => sum + r.assetCandidateCount, 0),
  fetchedAsset2xxCount: rows.reduce((sum, r) => sum + r.fetchedAsset2xxCount, 0),
  positiveRouteHintTargetCount: rows.filter((r) => r.totalPositiveRouteHintCount > 0).length,
  highScoreRouteHintTargetCount: rows.filter((r) => r.recommendedNextAction === "controlled_fetch_high_score_route_hints").length,
  recommendedNextLane: rows.some((r) => r.recommendedNextAction === "controlled_fetch_high_score_route_hints")
    ? "controlled_fetch_high_score_route_hints_without_canonical_write"
    : "replace_current_routes_with_source_specific_official_candidates"
};

const outPath = path.join(OUT_DIR, `official-asset-api-route-mining-probe-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `official-asset-api-route-mining-probe-rows-${DATE}.jsonl`);
fs.writeFileSync(outPath, JSON.stringify({ summary, rows }, null, 2) + "\n", "utf8");
fs.writeFileSync(rowsPath, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  summary
}, null, 2));
