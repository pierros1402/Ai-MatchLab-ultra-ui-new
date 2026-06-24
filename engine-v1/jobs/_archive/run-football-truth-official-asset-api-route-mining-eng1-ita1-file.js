import fs from "fs";
import path from "path";
import crypto from "crypto";
import { spawnSync } from "child_process";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = `data/football-truth/_diagnostics/official-asset-api-route-mining-eng1-ita1-${DATE}`;
const OUT = `${OUT_DIR}/official-asset-api-route-mining-eng1-ita1-${DATE}.json`;
const ROWS_OUT = `${OUT_DIR}/official-asset-api-route-mining-eng1-ita1-hints-${DATE}.jsonl`;

if (!process.argv.includes("--allow-fetch")) throw new Error("Missing --allow-fetch");
if (!process.argv.includes("--allow-browser")) throw new Error("Missing --allow-browser");

const TARGETS = [
  {
    familyId: "premierleague_official_rendered",
    competitionSlug: "eng.1",
    expectedHost: "premierleague.com",
    seeds: [
      "https://www.premierleague.com/tables",
      "https://www.premierleague.com/en/tables"
    ],
    apiHostAllow: [
      "premierleague.com",
      "pulselive.com",
      "sdp-prem-prod.premier-league-prod.pulselive.com"
    ],
    keywords: ["table", "tables", "standings", "competition", "season", "clubs", "premier"]
  },
  {
    familyId: "serie_a_official_rendered",
    competitionSlug: "ita.1",
    expectedHost: "legaseriea.it",
    seeds: [
      "https://www.legaseriea.it/it/serie-a/classifica",
      "https://www.legaseriea.it/serie-a/classifica"
    ],
    apiHostAllow: [
      "legaseriea.it",
      "deltatre.digital",
      "cloudfront.net"
    ],
    keywords: ["classifica", "standings", "ranking", "competition", "season", "campionato", "serie-a"]
  }
];

function abs(p) { return path.join(ROOT, p); }
function writeJson(p, v) { fs.mkdirSync(path.dirname(abs(p)), { recursive: true }); fs.writeFileSync(abs(p), JSON.stringify(v, null, 2) + "\n"); }
function writeJsonl(p, rows) { fs.mkdirSync(path.dirname(abs(p)), { recursive: true }); fs.writeFileSync(abs(p), rows.map(r => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "")); }
function sha256Text(t) { return crypto.createHash("sha256").update(String(t ?? "")).digest("hex"); }
function stripTags(s) { return String(s ?? "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim(); }
function normUrl(u, base) { try { const x = new URL(u, base); x.hash = ""; return x.toString(); } catch { return null; } }
function hostOf(u) { try { return new URL(u).host.toLowerCase(); } catch { return ""; } }

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe"
  ].filter(Boolean);
  return candidates.find(p => fs.existsSync(p.replace(/\//g, path.sep))) ?? null;
}

function chromeDump(url, label) {
  const chrome = findChrome();
  if (!chrome) return { ok: false, error: "chrome_not_found", html: "" };
  console.log(`RENDER_START ${label} ${url}`);
  const args = ["--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage", "--virtual-time-budget=8000", "--dump-dom", url];
  const started = Date.now();
  const r = spawnSync(chrome, args, { encoding: "utf8", maxBuffer: 45 * 1024 * 1024, timeout: 22000 });
  const elapsedMs = Date.now() - started;
  console.log(`RENDER_END ${label} status=${r.status} bytes=${Buffer.byteLength(r.stdout ?? "")} elapsedMs=${elapsedMs}`);
  return { ok: r.status === 0 && !!r.stdout, status: r.status, error: r.error?.message ?? (r.stderr || null), html: r.stdout ?? "", elapsedMs };
}

async function fetchText(url, label, timeoutMs = 11000) {
  console.log(`FETCH_START ${label} ${url}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 FootballTruthDiagnostics/1.0",
        "accept": "text/html,application/javascript,text/javascript,application/json,*/*"
      }
    });
    const contentType = res.headers.get("content-type") ?? "";
    const text = await res.text();
    const elapsedMs = Date.now() - started;
    console.log(`FETCH_END ${label} status=${res.status} bytes=${Buffer.byteLength(text)} elapsedMs=${elapsedMs}`);
    return { ok: res.ok, status: res.status, contentType, text, elapsedMs, error: null };
  } catch (e) {
    const elapsedMs = Date.now() - started;
    console.log(`FETCH_END ${label} error=${e?.name ?? "error"} elapsedMs=${elapsedMs}`);
    return { ok: false, status: null, contentType: "", text: "", elapsedMs, error: String(e?.message ?? e) };
  } finally {
    clearTimeout(timeout);
  }
}

function extractAssetUrls(html, baseUrl) {
  const urls = new Set();
  const patterns = [
    /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi,
    /<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi,
    /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(html))) {
      const u = normUrl(m[1], baseUrl);
      if (u) urls.add(u);
    }
  }
  const direct = html.match(/https?:\/\/[^\s"'<>\\)]+/g) ?? [];
  for (const d of direct) {
    const u = normUrl(d.replace(/[.,;]+$/g, ""), baseUrl);
    if (u) urls.add(u);
  }
  return [...urls];
}

function extractInlineSnippets(text, target) {
  const snippets = [];
  const lines = String(text ?? "").split(/\n|;|,/);
  for (const line of lines) {
    const l = line.trim();
    if (l.length < 8 || l.length > 900) continue;
    const low = l.toLowerCase();
    if (target.keywords.some(k => low.includes(k)) && /(api|standings|table|classifica|ranking|season|competition|fixtures|clubs|teams|tournament)/i.test(l)) {
      snippets.push(l.slice(0, 500));
    }
    if (snippets.length >= 40) break;
  }
  return [...new Set(snippets)];
}

function extractRouteHints(text, baseUrl, target, sourceKind, sourceUrl) {
  const hints = [];
  const raw = String(text ?? "");
  const lower = raw.toLowerCase();

  const urlMatches = raw.match(/https?:\/\/[^\s"'<>\\)]+/g) ?? [];
  for (const u0 of urlMatches) {
    const url = normUrl(u0.replace(/[.,;]+$/g, ""), baseUrl);
    if (!url) continue;
    hints.push({ route: url, kind: "absolute_url", sourceKind, sourceUrl });
  }

  const pathRegexes = [
    /["'`](\/[^"'`\\]*(?:api|standings|standing|classifica|ranking|table|tables|competition|season|clubs|teams|fixtures|tournaments)[^"'`\\]*)["'`]/gi,
    /["'`]([^"'`\\]*(?:api\/|\/api|standings|standing|classifica|ranking|competition\/|season\/|tournaments\/)[^"'`\\]*)["'`]/gi
  ];

  for (const re of pathRegexes) {
    let m;
    while ((m = re.exec(raw))) {
      const candidate = m[1].trim();
      if (!candidate || candidate.length > 300) continue;
      const url = normUrl(candidate, baseUrl);
      if (!url) continue;
      hints.push({ route: url, kind: "path_or_template", sourceKind, sourceUrl });
    }
  }

  for (const snippet of extractInlineSnippets(raw, target)) {
    hints.push({ route: snippet, kind: "inline_snippet", sourceKind, sourceUrl });
  }

  return hints.map(h => {
    const s = `${h.route}`.toLowerCase();
    let score = 0;
    if (target.keywords.some(k => s.includes(k.toLowerCase()))) score += 50;
    if (/(api|graphql|standings|standing|classifica|ranking|table|tables)/i.test(h.route)) score += 60;
    if (/(season|competition|tournament|clubs|teams)/i.test(h.route)) score += 30;
    if (/(2024|2025|2026|2025-2026|2026-2027|2025\/26|2026\/27)/i.test(h.route)) score += 20;
    const hst = hostOf(h.route);
    if (hst && target.apiHostAllow.some(allowed => hst.includes(allowed))) score += 40;
    if (/(google|facebook|twitter|analytics|cookie|consent|font|css|image|svg|png|jpg|jpeg|woff|map$)/i.test(h.route)) score -= 70;
    if (h.kind === "inline_snippet") score -= 5;
    return {
      ...h,
      familyId: target.familyId,
      competitionSlug: target.competitionSlug,
      score,
      routeSha256: sha256Text(`${target.familyId}|${h.route}`).slice(0, 24)
    };
  });
}

const pageRenders = [];
const assetFetches = [];
const routeHints = [];

for (const target of TARGETS) {
  for (const seed of target.seeds) {
    const dump = chromeDump(seed, `${target.familyId}:page`);
    const html = dump.html ?? "";
    const title = stripTags(html.match(/<title[^>]*>[\s\S]*?<\/title>/i)?.[0] ?? "");
    const h1 = stripTags(html.match(/<h1[^>]*>[\s\S]*?<\/h1>/i)?.[0] ?? "");
    const assets = extractAssetUrls(html, seed).filter(u => {
      const h = hostOf(u);
      const low = u.toLowerCase();
      if (!h) return false;
      if (/\.(png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|css)(\?|$)/i.test(low)) return false;
      return target.apiHostAllow.some(allowed => h.includes(allowed)) || low.includes(".js") || /(api|standings|classifica|ranking|table|season|competition)/i.test(low);
    });

    const pageHints = extractRouteHints(html, seed, target, "rendered_html", seed);
    routeHints.push(...pageHints);

    pageRenders.push({
      familyId: target.familyId,
      competitionSlug: target.competitionSlug,
      seed,
      browserOk: dump.ok,
      browserStatus: dump.status,
      browserError: dump.error,
      elapsedMs: dump.elapsedMs,
      browserBytes: Buffer.byteLength(html),
      title,
      h1,
      extractedAssetCount: assets.length,
      selectedAssetPreview: assets.slice(0, 20),
      pageHintCount: pageHints.length,
      rawPayloadCommitted: false
    });

    const selectedAssets = assets
      .map(u => {
        let score = 0;
        const low = u.toLowerCase();
        if (/\.js(\?|$)/.test(low)) score += 40;
        if (/(api|standings|classifica|ranking|table|season|competition)/i.test(low)) score += 70;
        if (target.apiHostAllow.some(allowed => hostOf(u).includes(allowed))) score += 30;
        return { url: u, score };
      })
      .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url))
      .slice(0, 16);

    for (const asset of selectedAssets) {
      const fetched = await fetchText(asset.url, `${target.familyId}:asset`);
      const text = fetched.text ?? "";
      const hints = fetched.ok ? extractRouteHints(text, asset.url, target, "asset_text", asset.url) : [];
      routeHints.push(...hints);
      assetFetches.push({
        familyId: target.familyId,
        competitionSlug: target.competitionSlug,
        assetUrl: asset.url,
        assetScore: asset.score,
        status: fetched.status,
        ok: fetched.ok,
        contentType: fetched.contentType,
        bytes: Buffer.byteLength(text),
        elapsedMs: fetched.elapsedMs,
        error: fetched.error,
        hintCount: hints.length,
        topHintsPreview: hints.sort((a, b) => b.score - a.score).slice(0, 10).map(h => ({ route: h.route.slice(0, 240), kind: h.kind, score: h.score })),
        rawPayloadCommitted: false
      });
    }
  }
}

const dedupedHints = [...new Map(
  routeHints
    .filter(h => h.score >= 50)
    .sort((a, b) => b.score - a.score)
    .map(h => [`${h.familyId}|${h.routeSha256}`, h])
).values()];

const topHints = dedupedHints.slice(0, 160).map(h => ({
  familyId: h.familyId,
  competitionSlug: h.competitionSlug,
  route: h.route.length > 600 ? h.route.slice(0, 600) : h.route,
  kind: h.kind,
  score: h.score,
  sourceKind: h.sourceKind,
  sourceUrl: h.sourceUrl,
  routeSha256: h.routeSha256,
  routeHost: hostOf(h.route)
}));

const highScoreHints = topHints.filter(h => h.score >= 110);
writeJsonl(ROWS_OUT, highScoreHints);

const output = {
  status: "passed",
  runner: "official_asset_api_route_mining_eng1_ita1",
  generatedAtUtc: new Date().toISOString(),
  purpose: "mine official rendered HTML and linked assets for previous_completed standings API/route hints for eng.1 and ita.1; diagnostics only",
  targets: TARGETS.map(t => ({ familyId: t.familyId, competitionSlug: t.competitionSlug, seeds: t.seeds, apiHostAllow: t.apiHostAllow })),
  pageRenderExecutedNowCount: pageRenders.length,
  assetFetchExecutedNowCount: assetFetches.length,
  pageRenders,
  assetFetches,
  totalRawHintCount: routeHints.length,
  dedupedScoredHintCount: dedupedHints.length,
  highScoreHintCount: highScoreHints.length,
  highScoreHints,
  rowsOutput: ROWS_OUT,
  nextRecommendedLane: highScoreHints.length
    ? {
        lane: "controlled_fetch_high_score_asset_api_hints_for_eng1_ita1",
        candidateCount: highScoreHints.length,
        rule: "fetch only high-score official/API-like hints; inspect JSON/table shape; no raw payload commits"
      }
    : {
        lane: "park_eng1_ita1_rendered_immediate_routes_and_return_to_bulk_previous_completed_family_discovery",
        candidateCount: 0,
        rule: "no useful official asset/API hints found"
      },
  policy: {
    rawPayloadCommitted: false,
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: assetFetches.length,
    browserRenderExecutedNowCount: pageRenders.length,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    stateLaneWriteExecutedNowCount: 0
  },
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: assetFetches.length,
  browserRenderExecutedNowCount: pageRenders.length,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
};

writeJson(OUT, output);

console.log(JSON.stringify({
  status: output.status,
  pageRenderExecutedNowCount: output.pageRenderExecutedNowCount,
  assetFetchExecutedNowCount: output.assetFetchExecutedNowCount,
  totalRawHintCount: output.totalRawHintCount,
  dedupedScoredHintCount: output.dedupedScoredHintCount,
  highScoreHintCount: output.highScoreHintCount,
  highScoreHints: highScoreHints.slice(0, 30),
  nextRecommendedLane: output.nextRecommendedLane,
  output: OUT,
  rowsOutput: ROWS_OUT,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
}, null, 2));
