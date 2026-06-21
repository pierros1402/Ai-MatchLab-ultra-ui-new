#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function decodeHtml(value) {
  return asText(value)
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#x3D;/gi, "=")
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code);
      return Number.isFinite(n) ? String.fromCharCode(n) : "";
    });
}

function stripHtml(value) {
  return decodeHtml(asText(value).replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function hostnameFromUrl(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function decodeMaybeBase64Url(value) {
  try {
    const padded = asText(value).replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return "";
  }
}

export function normalizeSearchResultUrl(value) {
  const raw = decodeHtml(value);
  if (!raw) return "";

  try {
    const decoded = raw.startsWith("//") ? `https:${raw}` : raw;
    const maybeUrl = new URL(decoded, "https://duckduckgo.com");

    const uddg = maybeUrl.searchParams.get("uddg");
    if (uddg) return normalizeSearchResultUrl(uddg);

    const q = maybeUrl.searchParams.get("q");
    if (q && /^https?:\/\//i.test(q)) return normalizeSearchResultUrl(q);

    const bingU = maybeUrl.searchParams.get("u");
    if (bingU) {
      let target = bingU;
      if (target.startsWith("a1")) {
        const decodedTarget = decodeMaybeBase64Url(target.slice(2));
        if (decodedTarget) target = decodedTarget;
      }
      return normalizeSearchResultUrl(target);
    }

    if (!/^https?:$/.test(maybeUrl.protocol)) return "";
    if (/^(duckduckgo\.com|lite\.duckduckgo\.com|bing\.com|www\.bing\.com)$/i.test(maybeUrl.hostname)) {
      return "";
    }

    maybeUrl.hash = "";
    return maybeUrl.toString();
  } catch {
    return "";
  }
}

function toResult(row, provider, rank, query = "") {
  const url = normalizeSearchResultUrl(row.url);
  const title = stripHtml(row.title);
  const snippet = stripHtml(row.snippet || row.text || "");

  if (!url || !title) return null;

  return {
    query: asText(query),
    rank,
    title,
    snippet,
    url,
    hostname: hostnameFromUrl(url),
    provider,
    resultSource: provider,
    fetchState: "not_fetched",
    manualCandidateUrlUsed: false,
    inventedUrl: false
  };
}

export function parseDuckDuckGoHtmlResults(html, query = "") {
  const out = [];
  const safeHtml = String(html || "");
  const resultRe = /<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of safeHtml.matchAll(resultRe)) {
    const row = toResult({ url: match[1], title: match[2] }, "duckduckgo_html", out.length + 1, query);
    if (row) out.push(row);
    if (out.length >= 10) break;
  }

  return out;
}

export function parseDuckDuckGoLiteResults(html, query = "") {
  const out = [];
  const safeHtml = String(html || "");
  const linkRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of safeHtml.matchAll(linkRe)) {
    const title = stripHtml(match[2]);
    const url = normalizeSearchResultUrl(match[1]);

    if (!url || !title) continue;
    if (/^(images|videos|news|maps|settings|privacy)$/i.test(title)) continue;

    const row = toResult({ url, title }, "duckduckgo_lite", out.length + 1, query);
    if (row) out.push(row);
    if (out.length >= 10) break;
  }

  return out;
}

export function parseBingHtmlResults(html, query = "") {
  const out = [];
  const safeHtml = String(html || "");
  const blockRe = /<li[^>]+class=["'][^"']*b_algo[^"']*["'][^>]*>[\s\S]*?<\/li>/gi;

  for (const blockMatch of safeHtml.matchAll(blockRe)) {
    const block = blockMatch[0];
    const linkMatch = block.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;

    const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const row = toResult({
      url: linkMatch[1],
      title: linkMatch[2],
      snippet: snippetMatch ? snippetMatch[1] : ""
    }, "bing_html", out.length + 1, query);

    if (row) out.push(row);
    if (out.length >= 10) break;
  }

  return out;
}

function classifySearchFailure(text) {
  const body = asText(text).toLowerCase();

  if (!body) return "empty_response";
  if (body.includes("captcha") || body.includes("unusual traffic")) return "blocked_or_captcha";
  if (body.includes("enable javascript") && body.length < 5000) return "javascript_required";
  if (body.includes("403 forbidden")) return "forbidden";

  return "";
}

async function fetchTextResult(url, options = {}) {
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || 12000));
  const maxChars = Math.max(1000, Number(options.maxChars || 120000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "user-agent": "Mozilla/5.0 Ai-MatchLab autonomous source discovery"
      }
    });

    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      finalUrl: res.url,
      text: text.slice(0, maxChars),
      error: ""
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      finalUrl: url,
      text: "",
      error: error?.name === "AbortError" ? "timeout" : asText(error?.message || error)
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildAttempt(provider, fetchResult, rows) {
  const failureReason = fetchResult.ok ? classifySearchFailure(fetchResult.text) : (fetchResult.error || `http_${fetchResult.status}`);

  return {
    provider,
    ok: fetchResult.ok && !failureReason,
    status: fetchResult.status,
    finalUrl: fetchResult.finalUrl,
    resultCount: rows.length,
    failureReason,
    fetchedBytes: fetchResult.text.length
  };
}

export async function searchWeb(query, options = {}) {
  const safeQuery = asText(query);
  const allowSearch = options.allowSearch === true;

  if (!safeQuery) {
    return {
      ok: false,
      status: "missing_query",
      query: safeQuery,
      rows: [],
      attempts: [],
      guarantees: buildGuarantees(false)
    };
  }

  if (!allowSearch) {
    return {
      ok: false,
      status: "search_not_allowed",
      query: safeQuery,
      rows: [],
      attempts: [],
      guarantees: buildGuarantees(false)
    };
  }

  const timeoutMs = Math.max(1000, Number(options.timeoutMs || process.env.AIML_AUTONOMOUS_SEARCH_FETCH_TIMEOUT_MS || 12000));
  const maxChars = Math.max(1000, Number(options.maxChars || process.env.AIML_AUTONOMOUS_SEARCH_MAX_CHARS || 120000));
  const attempts = [];

  const engines = [
    {
      provider: "duckduckgo_html",
      url: `https://duckduckgo.com/html/?q=${encodeURIComponent(safeQuery)}`,
      parse: parseDuckDuckGoHtmlResults
    },
    {
      provider: "duckduckgo_lite",
      url: `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(safeQuery)}`,
      parse: parseDuckDuckGoLiteResults
    },
    {
      provider: "bing_html",
      url: `https://www.bing.com/search?q=${encodeURIComponent(safeQuery)}`,
      parse: parseBingHtmlResults
    }
  ];

  for (const engine of engines) {
    const fetchResult = await fetchTextResult(engine.url, { timeoutMs, maxChars });
    const failureReason = fetchResult.ok ? classifySearchFailure(fetchResult.text) : (fetchResult.error || `http_${fetchResult.status}`);
    const rows = fetchResult.ok && !failureReason ? engine.parse(fetchResult.text, safeQuery) : [];
    attempts.push(buildAttempt(engine.provider, fetchResult, rows));

    if (rows.length > 0) {
      return {
        ok: true,
        status: "ok",
        query: safeQuery,
        rows,
        attempts,
        guarantees: buildGuarantees(true)
      };
    }
  }

  return {
    ok: false,
    status: "no_results_or_blocked",
    query: safeQuery,
    rows: [],
    attempts,
    guarantees: buildGuarantees(true)
  };
}

function buildGuarantees(searchExecuted) {
  return {
    sourceFetch: false,
    urlFetch: false,
    searchExecuted,
    manualCandidateUrlsRequired: false,
    manualCandidateUrlsUsed: false,
    inventedUrls: false,
    noCanonicalPromotion: true,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
}

function runSelfTest() {
  const ddgHtml = `
    <html><body>
      <a class="result__a" href="/l/?uddg=https%3A%2F%2Fwww.slgr.gr%2Fen%2Fschedule%2F">Super League Greece fixtures</a>
    </body></html>
  `;

  const ddgLite = `
    <html><body>
      <a href="/l/?uddg=https%3A%2F%2Fwww.eredivisie.nl%2Fcompetitie%2Fprogramma%2F">Eredivisie programme</a>
    </body></html>
  `;

  const bingHtml = `
    <html><body>
      <li class="b_algo">
        <h2><a href="https://www.sfl.ch/matchcenter/">Swiss Football League fixtures</a></h2>
        <p>Official match center and schedule.</p>
      </li>
    </body></html>
  `;

  const ddgRows = parseDuckDuckGoHtmlResults(ddgHtml, "Super League Greece fixtures");
  const liteRows = parseDuckDuckGoLiteResults(ddgLite, "Eredivisie fixtures");
  const bingRows = parseBingHtmlResults(bingHtml, "Swiss Super League fixtures");

  if (ddgRows.length !== 1) throw new Error(`expected 1 ddg html row, got ${ddgRows.length}`);
  if (liteRows.length !== 1) throw new Error(`expected 1 ddg lite row, got ${liteRows.length}`);
  if (bingRows.length !== 1) throw new Error(`expected 1 bing row, got ${bingRows.length}`);
  if (ddgRows[0].url !== "https://www.slgr.gr/en/schedule/") throw new Error(`unexpected ddg url: ${ddgRows[0].url}`);
  if (liteRows[0].url !== "https://www.eredivisie.nl/competitie/programma/") throw new Error(`unexpected lite url: ${liteRows[0].url}`);
  if (bingRows[0].url !== "https://www.sfl.ch/matchcenter/") throw new Error(`unexpected bing url: ${bingRows[0].url}`);

  return {
    ok: true,
    selfTest: "web-search-provider",
    summary: {
      duckduckgoHtmlRows: ddgRows.length,
      duckduckgoLiteRows: liteRows.length,
      bingRows: bingRows.length,
      allowSearchDefault: false,
      inventedUrls: false,
      manualCandidateUrlsUsed: false,
      canonicalWrites: 0,
      productionWrite: false
    },
    guarantees: buildGuarantees(false)
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  if (process.argv.includes("--self-test")) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
  } else {
    console.log(JSON.stringify({
      ok: false,
      status: "cli_search_not_enabled_here",
      message: "Import searchWeb(query, { allowSearch: true }) from a controlled job instead.",
      guarantees: buildGuarantees(false)
    }, null, 2));
  }
}
