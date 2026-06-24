import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const allowFetch = process.argv.includes("--allow-fetch");
const batchArg = process.argv.find(arg => arg.startsWith("--batch="));
const batchIndex = Number(batchArg ? batchArg.split("=")[1] : 2);
const pad = String(batchIndex).padStart(3, "0");

const discoveryPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-controlled-official-route-discovery-${today}`, `bulk-batch-controlled-official-route-discovery-batch-${pad}-${today}.json`);
const discoveryRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-controlled-official-route-discovery-${today}`, `bulk-batch-controlled-official-route-discovery-batch-${pad}-rows-${today}.jsonl`);

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-route-candidate-identity-surface-probe-${today}`);
const outPath = path.join(outDir, `bulk-batch-route-candidate-identity-surface-probe-batch-${pad}-${today}.json`);
const rowsPath = path.join(outDir, `bulk-batch-route-candidate-identity-surface-probe-batch-${pad}-rows-${today}.jsonl`);

const specs = {
  "srb.1": { terms: ["super liga", "superliga", "mozzart", "srbije"], routeTerms: ["tabela", "table", "standings"] },
  "lva.1": { terms: ["virsliga", "tonybet"], routeTerms: ["sacensibas", "table", "standings", "fixtures", "rezultati"] },
  "lva.2": { terms: ["1. liga", "nakotnes", "future league", "latvijas"], routeTerms: ["sacensibas", "table", "standings", "fixtures", "rezultati"] },
  "mda.1": { terms: ["super liga", "moldova"], routeTerms: ["clasament", "program", "rezultate", "fixtures", "table"] },
  "mda.2": { terms: ["liga 1", "moldova"], routeTerms: ["clasament", "program", "rezultate", "fixtures", "table"] },
  "mne.1": { terms: ["1. cfl", "meridianbet", "crne gore"], routeTerms: ["fixtures", "tabela", "raspored", "rezultati"] },
  "mne.2": { terms: ["2. cfl", "crne gore"], routeTerms: ["fixtures", "tabela", "raspored", "rezultati"] }
};

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

function pathOf(url) {
  try { return new URL(url).pathname.toLowerCase().replace(/\/+$/, "/"); } catch { return ""; }
}

function titleOf(html) {
  const m = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return String(m?.[1] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
}

function textSample(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 9000);
}

function countMatches(text, regex) {
  return (String(text || "").match(regex) || []).length;
}

function countTermHits(text, terms) {
  const lower = String(text || "").toLowerCase();
  return terms.filter(term => lower.includes(String(term).toLowerCase())).length;
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
        "user-agent": "Mozilla/5.0 (compatible; AI-MatchLab-FootballTruth/1.0; +route-candidate-identity-surface-probe)",
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

function classifySurface(html) {
  const tableCount = countMatches(html, /<table\b/gi);
  const trCount = countMatches(html, /<tr\b/gi);
  const scriptCount = countMatches(html, /<script\b/gi);
  const jsonScriptCount = countMatches(html, /<script[^>]+type=["'](?:application\/json|application\/ld\+json)["'][^>]*>/gi);
  const stateScriptCount = countMatches(html, /__NEXT_DATA__|__NUXT__|__APOLLO_STATE__|__INITIAL_STATE__|window\.__|data-state|hydration|preloadedState/gi);
  const dataAttributeCount = countMatches(html, /\sdata-[a-z0-9_-]+=/gi);
  const apiHintCount = countMatches(html, /graphql|api\/|\/api|standings|fixtures|ranking|matches|competition|season|round|table|tabela|clasament|raspored|rezultati/gi);

  let surfaceStatus = "no_parseable_surface_detected";
  if (tableCount >= 1 && trCount >= 8) surfaceStatus = "html_table_parser_candidate";
  else if (stateScriptCount >= 1 || jsonScriptCount >= 2) surfaceStatus = "embedded_state_or_json_candidate";
  else if (html.length >= 50000 && apiHintCount >= 10) surfaceStatus = "rendered_or_api_required";
  else if (dataAttributeCount >= 30 && apiHintCount >= 5) surfaceStatus = "dom_attribute_parser_candidate";

  return { tableCount, trCount, scriptCount, jsonScriptCount, stateScriptCount, dataAttributeCount, apiHintCount, surfaceStatus };
}

function classifyIdentity({ slug, url, finalUrl, title, sample, html, fetchStatus, fetchError, timedOut }) {
  const spec = specs[slug] || { terms: [], routeTerms: [] };
  const pathname = pathOf(finalUrl);
  const combined = `${url} ${finalUrl} ${title} ${sample}`;
  const competitionTermHitCount = countTermHits(combined, spec.terms);
  const routeTermHitCount = countTermHits(combined, spec.routeTerms);
  const rootOrHomepage = ["/", "/en/", "/lv/", "/ro/", "/me/", "/sr/", "/index.php/"].includes(pathname);
  const titleGeneric = /^(fmf|pfl|latvijas futbola federacija|latvijas futbola federācija|fudbalski savez crne gore)$/i.test(String(title || "").trim());
  const hasChallenge = /just a moment|cf-chl|cloudflare|captcha|are you not a robot/i.test(`${html} ${finalUrl} ${title}`);
  const hasAccessDenied = /access denied|forbidden|403/i.test(`${html} ${title}`);

  const blocks = [];
  if (fetchError || timedOut) blocks.push("fetch_error_or_timeout");
  if (!(fetchStatus >= 200 && fetchStatus < 400)) blocks.push("status_not_2xx_or_3xx");
  if (html.length < 500) blocks.push("body_too_short");
  if (hasChallenge || hasAccessDenied) blocks.push("access_denied_or_challenge");
  if (competitionTermHitCount === 0) blocks.push("competition_terms_not_found");
  if (routeTermHitCount === 0) blocks.push("route_terms_not_found");
  if (rootOrHomepage && titleGeneric && routeTermHitCount < 2) blocks.push("generic_homepage_or_root_route");
  if (rootOrHomepage && competitionTermHitCount < 2) blocks.push("root_route_weak_competition_identity");

  let identityStatus = "route_identity_rejected";
  if (blocks.length === 0) identityStatus = "route_identity_passed";
  else if (!blocks.includes("status_not_2xx_or_3xx") && !blocks.includes("fetch_error_or_timeout") && competitionTermHitCount > 0 && routeTermHitCount > 0) identityStatus = "route_identity_needs_review";

  return {
    identityStatus,
    identityBlocks: blocks,
    competitionTermHitCount,
    routeTermHitCount,
    rootOrHomepage,
    titleGeneric,
    hasChallenge,
    hasAccessDenied
  };
}

await fs.mkdir(outDir, { recursive: true });

const discovery = JSON.parse(await fs.readFile(discoveryPath, "utf8"));
const discoveryRows = parseJsonl(await fs.readFile(discoveryRowsPath, "utf8"));
const blocks = [];

if (!allowFetch) blocks.push("missing_allow_fetch");
if (discovery.status !== "passed") blocks.push("discovery_not_passed");
if (discovery.batchIndex !== batchIndex) blocks.push("discovery_batch_mismatch");
if (discovery.summary?.passedCount !== 7) blocks.push("discovery_passed_count_not_7");

const targets = discoveryRows.filter(row => row.discoveryStatus === "controlled_official_route_candidate_passed");
if (targets.length !== 7) blocks.push("target_count_not_7");

const rows = [];

if (allowFetch && blocks.length === 0) {
  let index = 0;
  for (const target of targets) {
    index += 1;
    console.log(`[${index}/${targets.length}] identity/surface ${target.slug} ${target.selectedFinalUrl}`);

    const startedAt = new Date().toISOString();
    const fetched = await fetchWithTimeout(target.selectedFinalUrl, 20000);
    const endedAt = new Date().toISOString();

    const html = fetched.text || "";
    const title = titleOf(html);
    const finalUrl = fetched.response?.url || target.selectedFinalUrl;
    const sample = textSample(html);
    const fetchStatus = fetched.response?.status ?? null;

    const identity = classifyIdentity({
      slug: target.slug,
      url: target.selectedFinalUrl,
      finalUrl,
      title,
      sample,
      html,
      fetchStatus,
      fetchError: fetched.error,
      timedOut: fetched.timedOut
    });
    const surface = classifySurface(html);

    rows.push({
      slug: target.slug,
      displayName: target.displayName,
      batchIndex,
      inputUrl: target.selectedFinalUrl,
      finalUrl,
      finalHost: hostOf(finalUrl),
      fetchStatus,
      contentType: fetched.response?.headers?.get("content-type") || null,
      title,
      bodyLength: html.length,
      bodySha256: html ? shaText(html) : null,
      startedAt,
      endedAt,
      fetchError: fetched.error,
      timedOut: fetched.timedOut,
      ...identity,
      ...surface,
      candidateSurfaceStatus:
        identity.identityStatus === "route_identity_passed" && ["html_table_parser_candidate", "embedded_state_or_json_candidate", "dom_attribute_parser_candidate"].includes(surface.surfaceStatus) ? "candidate_surface_parser_planning_allowed" :
        identity.identityStatus === "route_identity_passed" && surface.surfaceStatus === "rendered_or_api_required" ? "candidate_surface_rendered_or_api_required" :
        identity.identityStatus === "route_identity_needs_review" ? "candidate_surface_identity_review_required" :
        "candidate_surface_rejected",
      acceptedNow: false,
      routeClaimMadeNow: false,
      familyClaimMadeNow: false,
      canonicalWriteExecutedNow: false,
      lifecycleWriteExecutedNow: false,
      productionWriteExecutedNow: false,
      truthAssertionExecutedNow: false,
      rawPayloadCommitted: false,
      fullRawPayloadWritten: false
    });
  }
}

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "bulk_batch_route_candidate_identity_surface_probe",
  contractVersion: 1,
  batchIndex,
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  discoveryPath: rel(discoveryPath),
  discoveryRowsPath: rel(discoveryRowsPath),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: rows.length,
    controlledRouteCandidateIdentitySurfaceFetchExecutedNowCount: rows.length,
    routeClaimMadeNowCount: 0,
    familyClaimMadeNowCount: 0,
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
    parserPlanningAllowedCount: rows.filter(row => row.candidateSurfaceStatus === "candidate_surface_parser_planning_allowed").length,
    renderedOrApiRequiredCount: rows.filter(row => row.candidateSurfaceStatus === "candidate_surface_rendered_or_api_required").length,
    identityReviewRequiredCount: rows.filter(row => row.candidateSurfaceStatus === "candidate_surface_identity_review_required").length,
    rejectedCount: rows.filter(row => row.candidateSurfaceStatus === "candidate_surface_rejected").length,
    parserPlanningAllowedSlugs: rows.filter(row => row.candidateSurfaceStatus === "candidate_surface_parser_planning_allowed").map(row => row.slug),
    renderedOrApiRequiredSlugs: rows.filter(row => row.candidateSurfaceStatus === "candidate_surface_rendered_or_api_required").map(row => row.slug),
    identityReviewRequiredSlugs: rows.filter(row => row.candidateSurfaceStatus === "candidate_surface_identity_review_required").map(row => row.slug),
    rejectedSlugs: rows.filter(row => row.candidateSurfaceStatus === "candidate_surface_rejected").map(row => row.slug),
    identityStatusCounts: rows.reduce((acc, row) => {
      acc[row.identityStatus] = (acc[row.identityStatus] || 0) + 1;
      return acc;
    }, {}),
    surfaceStatusCounts: rows.reduce((acc, row) => {
      acc[row.surfaceStatus] = (acc[row.surfaceStatus] || 0) + 1;
      return acc;
    }, {}),
    acceptedNowCount: 0,
    routeClaimMadeNowCount: 0,
    familyClaimMadeNowCount: 0,
    productionWriteAllowedNow: false,
    truthAssertionAllowedNow: false,
    nextRecommendedLane: "verify this probe; parser-planning rows may enter extraction diagnostics only after verification"
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
    inputUrl: row.inputUrl,
    finalUrl: row.finalUrl,
    finalHost: row.finalHost,
    fetchStatus: row.fetchStatus,
    title: row.title,
    bodyLength: row.bodyLength,
    identityStatus: row.identityStatus,
    identityBlocks: row.identityBlocks,
    competitionTermHitCount: row.competitionTermHitCount,
    routeTermHitCount: row.routeTermHitCount,
    rootOrHomepage: row.rootOrHomepage,
    tableCount: row.tableCount,
    trCount: row.trCount,
    scriptCount: row.scriptCount,
    apiHintCount: row.apiHintCount,
    surfaceStatus: row.surfaceStatus,
    candidateSurfaceStatus: row.candidateSurfaceStatus
  })),
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
