import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const allowFetch = process.argv.includes("--allow-fetch");
const batchIndex = Number((process.argv.find(arg => arg.startsWith("--batch=")) || "--batch=1").split("=")[1]);
const pad = String(batchIndex).padStart(3, "0");

const identityGatePath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-post-fetch-identity-gate-${today}`, `bulk-batch-post-fetch-identity-gate-batch-${pad}-${today}.json`);
const identityGateRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-post-fetch-identity-gate-${today}`, `bulk-batch-post-fetch-identity-gate-batch-${pad}-rows-${today}.jsonl`);

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-parser-surface-probe-${today}`);
const outPath = path.join(outDir, `bulk-batch-parser-surface-probe-batch-${pad}-${today}.json`);
const rowsPath = path.join(outDir, `bulk-batch-parser-surface-probe-batch-${pad}-rows-${today}.jsonl`);

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function shaText(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

function hostOf(url) {
  try { return new URL(url).host.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

function titleOf(html) {
  const m = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return (m?.[1] || "").replace(/\s+/g, " ").trim().slice(0, 180);
}

function countMatches(text, regex) {
  return (String(text || "").match(regex) || []).length;
}

function bool(regex, text) {
  return regex.test(String(text || ""));
}

function compact(value, max = 180) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

async function fetchWithTimeout(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; AI-MatchLab-FootballTruth/1.0; +parser-surface-probe)",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
        "accept-language": "en-US,en;q=0.9"
      }
    });
    const text = await response.text();
    clearTimeout(timer);
    return { response, text, error: null, timedOut: false };
  } catch (error) {
    clearTimeout(timer);
    return { response: null, text: "", error: String(error?.name || error?.message || error), timedOut: String(error?.name || "") === "AbortError" };
  }
}

function routeTermRegex(routeIntent) {
  if (routeIntent === "standings") return /(standings|ranking|table|tabela|tabulka|tabelle|classifica|classifiche|classificacao|clasament|scoreboard|ladder|pos\.|pts|points|played|wins|draws|losses|goals|club|team|equipa|mannschaft|βαθμολογ)/i;
  if (routeIntent === "fixtures_or_results") return /(fixtures|fixture|results|schedule|matches|match|calendario|spielplan|program|terminarz|zapasy|round|date|home|away|score|result)/i;
  return /(standings|fixtures|results|matches|table|ranking|schedule|team|club|round|points)/i;
}

function inferSurfaceStatus(surface) {
  if (surface.fetchError || surface.timedOut || !(surface.fetchStatus >= 200 && surface.fetchStatus < 400)) return "fetch_failed";
  if (surface.bodyLength < 500) return "too_short";
  if (surface.tableCount >= 1 && surface.trCount >= 8) return "html_table_parser_candidate";
  if (surface.nextDataPresent || surface.nuxtDataPresent || surface.remixDataPresent || surface.astroDataPresent) return "embedded_state_parser_candidate";
  if (surface.jsonScriptCount >= 2 && surface.routeTermHitCount >= 3) return "json_script_parser_candidate";
  if (surface.dataAttributeCount >= 20 && surface.routeTermHitCount >= 3) return "dom_attribute_parser_candidate";
  if (surface.routeTermHitCount >= 8 && surface.teamLikeTokenCount >= 12) return "text_parser_candidate";
  if (surface.bodyLength >= 50000 && surface.routeTermHitCount >= 2) return "rendered_or_api_required";
  return "no_parseable_surface_detected";
}

function extractSurface(html, routeIntent) {
  const lower = html.toLowerCase();
  const tableCount = countMatches(html, /<table\b/gi);
  const trCount = countMatches(html, /<tr\b/gi);
  const thCount = countMatches(html, /<th\b/gi);
  const tdCount = countMatches(html, /<td\b/gi);
  const scriptCount = countMatches(html, /<script\b/gi);
  const jsonScriptCount = countMatches(html, /<script[^>]+type=["'](?:application\/json|application\/ld\+json)["'][^>]*>/gi);
  const nextDataPresent = bool(/id=["']__NEXT_DATA__["']/i, html);
  const nuxtDataPresent = bool(/window\.__NUXT__|__NUXT_DATA__/i, html);
  const remixDataPresent = bool(/window\.__remixContext|__remixContext/i, html);
  const astroDataPresent = bool(/astro-island|data-astro/i, html);
  const stateScriptCount = countMatches(html, /__NEXT_DATA__|__NUXT__|__APOLLO_STATE__|__INITIAL_STATE__|window\.__|data-state|hydration|preloadedState/gi);
  const dataAttributeCount = countMatches(html, /\sdata-[a-z0-9_-]+=/gi);
  const routeTermHitCount = countMatches(html, routeTermRegex(routeIntent));
  const teamLikeTokenCount = countMatches(html, /\b[A-ZΑ-Ω][A-Za-zΑ-Ωα-ωÀ-ÖØ-öø-ÿ.'-]+(?:\s+[A-ZΑ-Ω][A-Za-zΑ-Ωα-ωÀ-ÖØ-öø-ÿ.'-]+){1,4}\b/g);
  const apiHintCount = countMatches(html, /graphql|api\/|\/api|standings|fixtures|ranking|matches|competition|season|round|table/gi);
  const canonicalHref = (html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) || [])[1] || null;

  return {
    tableCount,
    trCount,
    thCount,
    tdCount,
    scriptCount,
    jsonScriptCount,
    nextDataPresent,
    nuxtDataPresent,
    remixDataPresent,
    astroDataPresent,
    stateScriptCount,
    dataAttributeCount,
    routeTermHitCount,
    teamLikeTokenCount,
    apiHintCount,
    canonicalHref,
    hasRobotsNoindex: /<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html),
    hasCloudflareChallenge: /just a moment|cf-chl|cloudflare/i.test(lower),
    hasAccessDenied: /access denied|forbidden|403/i.test(lower)
  };
}

await fs.mkdir(outDir, { recursive: true });

const identityGate = JSON.parse(await fs.readFile(identityGatePath, "utf8"));
const identityRows = parseJsonl(await fs.readFile(identityGateRowsPath, "utf8"));
const blocks = [];

if (!allowFetch) blocks.push("missing_allow_fetch");
if (identityGate.status !== "passed") blocks.push("identity_gate_not_passed");
if (identityGate.summary?.parserReadyCount !== 15) blocks.push("identity_gate_parser_ready_count_not_15");

const targets = identityRows.filter(row => row.identityConfidence === "parser_ready");
if (targets.length !== 15) blocks.push("target_count_not_15");

const rows = [];

if (allowFetch && blocks.length === 0) {
  let index = 0;
  for (const target of targets) {
    index += 1;
    console.log(`[${index}/${targets.length}] surface ${target.slug} ${target.finalUrl}`);

    const startedAt = new Date().toISOString();
    const fetched = await fetchWithTimeout(target.finalUrl, 20000);
    const endedAt = new Date().toISOString();

    const html = fetched.text || "";
    const surface = extractSurface(html, target.routeIntent);
    const title = titleOf(html);
    const fetchStatus = fetched.response?.status ?? null;
    const finalUrl = fetched.response?.url || target.finalUrl;
    const finalHost = hostOf(finalUrl);

    const surfaceRow = {
      slug: target.slug,
      batchIndex,
      sourceLane: target.sourceLane,
      routeIntent: target.routeIntent,
      inputUrl: target.finalUrl,
      finalUrl,
      finalHost,
      fetchStatus,
      contentType: fetched.response?.headers?.get("content-type") || null,
      bodyLength: html.length,
      bodySha256: html ? shaText(html) : null,
      title: compact(title),
      startedAt,
      endedAt,
      fetchError: fetched.error,
      timedOut: fetched.timedOut,
      rawPayloadWritten: false,
      rawPayloadCommitted: false,
      productionWriteExecutedNow: false,
      truthAssertionExecutedNow: false,
      ...surface
    };

    surfaceRow.surfaceStatus = inferSurfaceStatus(surfaceRow);
    surfaceRow.parserPlanningAllowedNow = [
      "html_table_parser_candidate",
      "embedded_state_parser_candidate",
      "json_script_parser_candidate",
      "dom_attribute_parser_candidate",
      "text_parser_candidate"
    ].includes(surfaceRow.surfaceStatus);
    surfaceRow.renderedOrApiPlanningAllowedNow = surfaceRow.surfaceStatus === "rendered_or_api_required";
    surfaceRow.acceptedNow = false;

    rows.push(surfaceRow);
  }
}

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "bulk_batch_parser_surface_probe",
  contractVersion: 1,
  batchIndex,
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  identityGatePath: rel(identityGatePath),
  identityGateRowsPath: rel(identityGateRowsPath),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: rows.length,
    controlledParserSurfaceFetchExecutedNowCount: rows.length,
    providerFetchExecutedNowCount: 0,
    parserWriteExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    batchIndex,
    targetCount: targets.length,
    attemptedFetchCount: rows.length,
    parserPlanningAllowedCount: rows.filter(row => row.parserPlanningAllowedNow).length,
    renderedOrApiPlanningAllowedCount: rows.filter(row => row.renderedOrApiPlanningAllowedNow).length,
    failedOrNoSurfaceCount: rows.filter(row => !row.parserPlanningAllowedNow && !row.renderedOrApiPlanningAllowedNow).length,
    parserPlanningAllowedSlugs: rows.filter(row => row.parserPlanningAllowedNow).map(row => row.slug),
    renderedOrApiPlanningAllowedSlugs: rows.filter(row => row.renderedOrApiPlanningAllowedNow).map(row => row.slug),
    failedOrNoSurfaceSlugs: rows.filter(row => !row.parserPlanningAllowedNow && !row.renderedOrApiPlanningAllowedNow).map(row => row.slug),
    surfaceStatusCounts: rows.reduce((acc, row) => {
      acc[row.surfaceStatus] = (acc[row.surfaceStatus] || 0) + 1;
      return acc;
    }, {}),
    acceptedNowCount: 0,
    productionWriteAllowedNow: false,
    truthAssertionAllowedNow: false,
    nextRecommendedLane: "build extraction proof plan only for parserPlanningAllowedSlugs; renderedOrApiPlanningAllowedSlugs need rendered/API adapter; failed slugs return to discovery"
  },
  rows,
  blocks
};

await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsPath, rows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  guardrails: report.guardrails,
  summary: report.summary,
  rows: report.rows.map(row => ({
    slug: row.slug,
    routeIntent: row.routeIntent,
    fetchStatus: row.fetchStatus,
    finalHost: row.finalHost,
    title: row.title,
    bodyLength: row.bodyLength,
    tableCount: row.tableCount,
    trCount: row.trCount,
    scriptCount: row.scriptCount,
    jsonScriptCount: row.jsonScriptCount,
    nextDataPresent: row.nextDataPresent,
    stateScriptCount: row.stateScriptCount,
    routeTermHitCount: row.routeTermHitCount,
    apiHintCount: row.apiHintCount,
    surfaceStatus: row.surfaceStatus,
    parserPlanningAllowedNow: row.parserPlanningAllowedNow,
    renderedOrApiPlanningAllowedNow: row.renderedOrApiPlanningAllowedNow
  })),
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
