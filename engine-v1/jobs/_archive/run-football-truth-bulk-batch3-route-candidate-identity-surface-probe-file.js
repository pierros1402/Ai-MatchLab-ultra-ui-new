import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const allowFetch = process.argv.includes("--allow-fetch");

const inputPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch3-controlled-official-route-discovery-${today}`, `bulk-batch3-controlled-official-route-discovery-${today}.json`);
const inputRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch3-controlled-official-route-discovery-${today}`, `bulk-batch3-controlled-official-route-discovery-rows-${today}.jsonl`);
const inputVerificationPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch3-controlled-official-route-discovery-verification-${today}`, `bulk-batch3-controlled-official-route-discovery-verification-${today}.json`);

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch3-route-candidate-identity-surface-probe-${today}`);
const outPath = path.join(outDir, `bulk-batch3-route-candidate-identity-surface-probe-${today}.json`);
const rowsPath = path.join(outDir, `bulk-batch3-route-candidate-identity-surface-probe-rows-${today}.jsonl`);

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function shaText(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

function normalizeHost(host) {
  return String(host || "").toLowerCase().replace(/^www\./, "");
}

function hostOf(url) {
  try { return normalizeHost(new URL(url).host); } catch { return ""; }
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function titleOf(html) {
  const m = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return stripHtml(m?.[1] || "").slice(0, 180);
}

function countRegex(text, regex) {
  return (String(text || "").match(regex) || []).length;
}

function termHits(text, terms) {
  const lower = String(text || "").toLowerCase();
  return [...new Set((terms || []).filter(term => lower.includes(String(term).toLowerCase())))];
}

async function fetchWithTimeout(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; AI-MatchLab-FootballTruth/1.0; +batch3-identity-surface-probe)",
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

function classifySurface(sourceRow, fetched, html) {
  const finalUrl = fetched.response?.url || sourceRow.selectedFinalUrl || sourceRow.selectedUrl;
  const finalHost = hostOf(finalUrl);
  const selectedHost = normalizeHost(sourceRow.selectedHost);
  const title = titleOf(html);
  const clean = stripHtml(html).slice(0, 80000);
  const combined = `${sourceRow.slug} ${sourceRow.displayName} ${sourceRow.selectedUrl} ${sourceRow.selectedFinalUrl} ${finalUrl} ${title} ${clean}`;

  const status = fetched.response?.status ?? null;
  const hostMatches = finalHost === selectedHost || finalHost.endsWith(`.${selectedHost}`) || selectedHost.endsWith(`.${finalHost}`);
  const challengeText = `${title} ${html.slice(0, 12000)} ${finalUrl}`;
  const hasChallenge = /just a moment|are you not a robot|showcaptcha|access denied|forbidden/i.test(challengeText) || (/cf-chl|cloudflare/i.test(challengeText) && /challenge|captcha|checking your browser/i.test(challengeText));

  const tableCount = countRegex(html, /<table\b/gi);
  const trCount = countRegex(html, /<tr\b/gi);
  const scriptCount = countRegex(html, /<script\b/gi);
  const jsonBlobCount = countRegex(html, /__NEXT_DATA__|application\/ld\+json|window\.__|nuxt|apollo|graphql|standings|fixtures|schedule|results|posiciones|clasificacion|tabla|klasemen|bang-xep-hang/gi);
  const standingHintCount = countRegex(combined, /standings|table|points|posiciones|clasificaci[oó]n|tabla|klasemen|bang[- ]xep[- ]hang|played|wins|draws|losses|pts|puntos/gi);
  const fixtureHintCount = countRegex(combined, /fixture|fixtures|schedule|calendario|results|resultados|matches|round|jornada|fecha|lich thi dau/i);
  const routeTermHitsNow = termHits(combined, sourceRow.selectedRouteTermHits || []);
  const competitionTermHitsNow = termHits(combined, sourceRow.selectedCompetitionTermHits || []);

  let identitySurfaceStatus = "identity_surface_review_required";
  if (!((status ?? 0) >= 200 && (status ?? 0) < 400) || hasChallenge) {
    identitySurfaceStatus = "surface_fetch_blocked_or_unavailable";
  } else if (!hostMatches) {
    identitySurfaceStatus = "identity_review_required";
  } else if (competitionTermHitsNow.length === 0 && routeTermHitsNow.length === 0) {
    identitySurfaceStatus = "identity_review_required";
  } else if (tableCount >= 1 && trCount >= 8 && standingHintCount >= 3) {
    identitySurfaceStatus = "html_table_extraction_probe_ready";
  } else if (tableCount >= 1 && trCount >= 4) {
    identitySurfaceStatus = "html_table_review_required";
  } else if (standingHintCount >= 12 && (jsonBlobCount >= 20 || scriptCount >= 8)) {
    identitySurfaceStatus = "rendered_or_api_standings_surface_required";
  } else if (fixtureHintCount >= 2 && standingHintCount < 3) {
    identitySurfaceStatus = "fixture_or_schedule_surface_only";
  } else if (jsonBlobCount >= 50 || scriptCount >= 20) {
    identitySurfaceStatus = "rendered_or_api_surface_required";
  }

  return {
    finalUrl,
    finalHost,
    fetchStatus: status,
    contentType: fetched.response?.headers?.get("content-type") || null,
    title,
    bodyLength: html.length,
    bodySha256: html ? shaText(html) : null,
    hostMatches,
    hasChallenge,
    tableCount,
    trCount,
    scriptCount,
    jsonBlobCount,
    standingHintCount,
    fixtureHintCount,
    selectedCompetitionTermHits: sourceRow.selectedCompetitionTermHits || [],
    selectedRouteTermHits: sourceRow.selectedRouteTermHits || [],
    competitionTermHitsNow,
    routeTermHitsNow,
    textSample: clean.slice(0, 700),
    identitySurfaceStatus
  };
}

await fs.mkdir(outDir, { recursive: true });

const blocks = [];
if (!allowFetch) blocks.push("missing_allow_fetch");

const input = JSON.parse(await fs.readFile(inputPath, "utf8"));
const inputRows = parseJsonl(await fs.readFile(inputRowsPath, "utf8"));
const inputVerification = JSON.parse(await fs.readFile(inputVerificationPath, "utf8"));

if (inputVerification.status !== "passed") blocks.push("input_verification_not_passed");
if (input.summary?.passedCount !== 32) blocks.push("input_passed_count_not_32");
if (input.summary?.routeClaimMadeNowCount !== 0) blocks.push("input_route_claim_not_zero");
if (input.summary?.familyClaimMadeNowCount !== 0) blocks.push("input_family_claim_not_zero");

const passedRows = inputRows.filter(row => row.discoveryStatus === "controlled_official_route_candidate_passed");
if (passedRows.length !== 32) blocks.push("passed_rows_not_32");

const rows = [];
let fetchCount = 0;

if (allowFetch && blocks.length === 0) {
  let index = 0;
  for (const sourceRow of passedRows) {
    index += 1;
    const url = sourceRow.selectedFinalUrl || sourceRow.selectedUrl;
    console.log(`[${index}/${passedRows.length}] ${sourceRow.slug} ${url}`);
    const fetched = await fetchWithTimeout(url, 12000);
    fetchCount += 1;
    const surface = classifySurface(sourceRow, fetched, fetched.text || "");

    rows.push({
      slug: sourceRow.slug,
      displayName: sourceRow.displayName,
      sourceSelectedUrl: sourceRow.selectedUrl,
      sourceSelectedFinalUrl: sourceRow.selectedFinalUrl,
      sourceSelectedHost: sourceRow.selectedHost,
      sourceSelectedTitle: sourceRow.selectedTitle,
      sourceSelectedScore: sourceRow.selectedScore,
      ...surface,
      fetchError: fetched.error,
      timedOut: fetched.timedOut,
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

const counts = rows.reduce((acc, row) => {
  acc[row.identitySurfaceStatus] = (acc[row.identitySurfaceStatus] || 0) + 1;
  return acc;
}, {});

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "bulk_batch3_route_candidate_identity_surface_probe",
  contractVersion: 1,
  batchIndex: 3,
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  inputPath: rel(inputPath),
  inputRowsPath: rel(inputRowsPath),
  inputVerificationPath: rel(inputVerificationPath),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: fetchCount,
    controlledIdentitySurfaceFetchExecutedNowCount: fetchCount,
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
    batchIndex: 3,
    inputPassedRouteCandidateCount: passedRows.length,
    attemptedFetchCount: fetchCount,
    identitySurfaceStatusCounts: counts,
    htmlTableExtractionProbeReadySlugs: rows.filter(row => row.identitySurfaceStatus === "html_table_extraction_probe_ready").map(row => row.slug),
    htmlTableReviewRequiredSlugs: rows.filter(row => row.identitySurfaceStatus === "html_table_review_required").map(row => row.slug),
    renderedOrApiRequiredSlugs: rows.filter(row => row.identitySurfaceStatus === "rendered_or_api_standings_surface_required" || row.identitySurfaceStatus === "rendered_or_api_surface_required").map(row => row.slug),
    fixtureOrScheduleOnlySlugs: rows.filter(row => row.identitySurfaceStatus === "fixture_or_schedule_surface_only").map(row => row.slug),
    identityReviewRequiredSlugs: rows.filter(row => row.identitySurfaceStatus === "identity_review_required" || row.identitySurfaceStatus === "identity_surface_review_required").map(row => row.slug),
    fetchBlockedOrUnavailableSlugs: rows.filter(row => row.identitySurfaceStatus === "surface_fetch_blocked_or_unavailable").map(row => row.slug),
    acceptedNowCount: 0,
    routeClaimMadeNowCount: 0,
    familyClaimMadeNowCount: 0,
    canonicalWriteAllowedNow: false,
    lifecycleWriteAllowedNow: false,
    productionWriteAllowedNow: false,
    truthAssertionAllowedNow: false,
    nextRecommendedLane: "run bulk extraction probes only for html_table_extraction_probe_ready; run rendered/api planning for rendered_or_api rows; keep review/fixture-only lanes out of coverage counts"
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
    identitySurfaceStatus: row.identitySurfaceStatus,
    finalUrl: row.finalUrl,
    finalHost: row.finalHost,
    fetchStatus: row.fetchStatus,
    title: row.title,
    hostMatches: row.hostMatches,
    hasChallenge: row.hasChallenge,
    tableCount: row.tableCount,
    trCount: row.trCount,
    standingHintCount: row.standingHintCount,
    fixtureHintCount: row.fixtureHintCount,
    competitionTermHitsNow: row.competitionTermHitsNow,
    routeTermHitsNow: row.routeTermHitsNow
  })),
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
