import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const allowFetch = process.argv.includes("--allow-fetch");

const auditPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-strict-precision-audit-${today}`, `football-truth-global-batch001-strict-precision-audit-${today}.json`);
const auditRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-strict-precision-audit-${today}`, `football-truth-global-batch001-strict-precision-audit-rows-${today}.jsonl`);
const auditVerificationPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-strict-precision-audit-verification-${today}`, `football-truth-global-batch001-strict-precision-audit-verification-${today}.json`);

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-strict-identity-surface-gate-${today}`);
const outPath = path.join(outDir, `football-truth-global-batch001-strict-identity-surface-gate-${today}.json`);
const rowsPath = path.join(outDir, `football-truth-global-batch001-strict-identity-surface-gate-rows-${today}.jsonl`);

function rel(file) { return path.relative(root, file).replaceAll("\\", "/"); }
function parseJsonl(text) { return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }
function shaText(text) { return crypto.createHash("sha256").update(String(text || "")).digest("hex"); }

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

function norm(value) {
  return stripHtml(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleOf(html) {
  const m = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return stripHtml(m?.[1] || "").slice(0, 180);
}

function country(slug) { return String(slug || "").split(".")[0]; }

function countRegex(text, regex) {
  return (String(text || "").match(regex) || []).length;
}

function termHits(text, terms) {
  const n = norm(text);
  return [...new Set((terms || []).filter(term => n.includes(norm(term))))];
}

function targetTerms(row) {
  const out = [row.slug, country(row.slug)];
  if (row.displayName) {
    out.push(row.displayName);
    for (const part of String(row.displayName).split(/\s+/)) {
      const p = part.replace(/[^\p{L}\p{N}.]/gu, "");
      if (p.length >= 4) out.push(p);
    }
  }
  return [...new Set(out)];
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
        "user-agent": "Mozilla/5.0 (compatible; AI-MatchLab-FootballTruth/1.0; +strict-identity-surface-gate)",
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

function classify(row, fetched) {
  const html = fetched.text || "";
  const finalUrl = fetched.response?.url || row.inputSelectedFinalUrl || row.inputSelectedUrl;
  const title = titleOf(html);
  const status = fetched.response?.status ?? null;
  const combined = `${row.slug} ${row.displayName || ""} ${finalUrl} ${title} ${stripHtml(html).slice(0, 80000)}`;

  const tableCount = countRegex(html, /<table\b/gi);
  const trCount = countRegex(html, /<tr\b/gi);
  const scriptCount = countRegex(html, /<script\b/gi);
  const standingHintCount = countRegex(combined, /standings|table|classification|classifica|clasificacion|clasificación|posiciones|tabla|tabela|rank|points|pts|puntos|played|wins|draws|losses|pj|pg|pe|pp/gi);
  const fixtureHintCount = countRegex(combined, /fixture|fixtures|schedule|calendar|calendario|resultados|results|matches|matchday|jornada|spielplan|kalender|matches/gi);
  const newsHintCount = countRegex(combined, /news|latest|article|noticias|ειδήσεις|actualit|nieuws/gi);
  const targetTermHits = termHits(combined, targetTerms(row));
  const hasChallenge = /just a moment|are you not a robot|showcaptcha|access denied|forbidden/i.test(`${title} ${html.slice(0, 10000)} ${finalUrl}`);

  let lane = "surface_review_required";
  if (!((status ?? 0) >= 200 && (status ?? 0) < 400) || hasChallenge) {
    lane = "surface_fetch_blocked_or_unavailable";
  } else if (targetTermHits.length < 2) {
    lane = "identity_review_required";
  } else if (tableCount >= 1 && trCount >= 8 && standingHintCount >= 6) {
    lane = "html_table_extraction_probe_ready";
  } else if (standingHintCount >= 20 && scriptCount >= 8) {
    lane = "rendered_or_api_standings_surface_required";
  } else if (fixtureHintCount >= 3 && standingHintCount < 8) {
    lane = "fixture_or_schedule_surface_only";
  } else if (newsHintCount >= 3 && standingHintCount < 8) {
    lane = "news_or_homepage_surface_only";
  } else if (scriptCount >= 15) {
    lane = "rendered_or_api_surface_required";
  }

  return {
    finalUrl,
    finalHost: (() => { try { return new URL(finalUrl).host.toLowerCase().replace(/^www\./, ""); } catch { return null; } })(),
    fetchStatus: status,
    title,
    bodyLength: html.length,
    bodySha256: html ? shaText(html) : null,
    fetchError: fetched.error,
    timedOut: fetched.timedOut,
    tableCount,
    trCount,
    scriptCount,
    standingHintCount,
    fixtureHintCount,
    newsHintCount,
    targetTermHits,
    hasChallenge,
    identitySurfaceLane: lane
  };
}

await fs.mkdir(outDir, { recursive: true });

const blocks = [];
if (!allowFetch) blocks.push("missing_allow_fetch");

const audit = JSON.parse(await fs.readFile(auditPath, "utf8"));
const auditRows = parseJsonl(await fs.readFile(auditRowsPath, "utf8"));
const auditVerification = JSON.parse(await fs.readFile(auditVerificationPath, "utf8"));

if (audit.status !== "passed") blocks.push("audit_not_passed");
if (auditVerification.status !== "passed") blocks.push("audit_verification_not_passed");
if (audit.summary?.strictAcceptedForNextGateCount !== 7) blocks.push("strict_accepted_count_not_7");

const targets = auditRows.filter(row => row.strictAcceptedForNextGate === true);
if (targets.length !== 7) blocks.push("target_rows_not_7");

const rows = [];
let fetchCount = 0;

if (allowFetch && blocks.length === 0) {
  let index = 0;
  for (const row of targets) {
    index += 1;
    const url = row.inputSelectedFinalUrl || row.inputSelectedUrl;
    console.log(`[${index}/${targets.length}] ${row.slug} ${url}`);
    const fetched = await fetchWithTimeout(url);
    fetchCount += 1;
    const surface = classify(row, fetched);

    rows.push({
      slug: row.slug,
      displayName: row.displayName,
      strictPrecisionLane: row.strictPrecisionLane,
      inputSelectedUrl: row.inputSelectedUrl,
      inputSelectedFinalUrl: row.inputSelectedFinalUrl,
      inputSelectedHost: row.inputSelectedHost,
      inputSelectedTitle: row.inputSelectedTitle,
      ...surface,
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

const laneCounts = rows.reduce((acc, row) => {
  acc[row.identitySurfaceLane] = (acc[row.identitySurfaceLane] || 0) + 1;
  return acc;
}, {});

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "global_batch001_strict_identity_surface_gate",
  contractVersion: 1,
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  inputAuditPath: rel(auditPath),
  inputAuditRowsPath: rel(auditRowsPath),
  inputAuditVerificationPath: rel(auditVerificationPath),
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
    targetCount: targets.length,
    attemptedFetchCount: fetchCount,
    identitySurfaceLaneCounts: laneCounts,
    htmlTableExtractionProbeReadySlugs: rows.filter(row => row.identitySurfaceLane === "html_table_extraction_probe_ready").map(row => row.slug),
    renderedOrApiRequiredSlugs: rows.filter(row => row.identitySurfaceLane === "rendered_or_api_standings_surface_required" || row.identitySurfaceLane === "rendered_or_api_surface_required").map(row => row.slug),
    fixtureOrScheduleOnlySlugs: rows.filter(row => row.identitySurfaceLane === "fixture_or_schedule_surface_only").map(row => row.slug),
    newsOrHomepageOnlySlugs: rows.filter(row => row.identitySurfaceLane === "news_or_homepage_surface_only").map(row => row.slug),
    identityReviewRequiredSlugs: rows.filter(row => row.identitySurfaceLane === "identity_review_required" || row.identitySurfaceLane === "surface_review_required").map(row => row.slug),
    fetchBlockedOrUnavailableSlugs: rows.filter(row => row.identitySurfaceLane === "surface_fetch_blocked_or_unavailable").map(row => row.slug),
    acceptedNowCount: 0,
    nextRecommendedLane: "run extraction only for htmlTableExtractionProbeReadySlugs; rendered/API family planning for rendered rows; park homepage/schedule/news rows"
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
  rows: rows.map(row => ({
    slug: row.slug,
    identitySurfaceLane: row.identitySurfaceLane,
    finalUrl: row.finalUrl,
    finalHost: row.finalHost,
    fetchStatus: row.fetchStatus,
    title: row.title,
    tableCount: row.tableCount,
    trCount: row.trCount,
    standingHintCount: row.standingHintCount,
    fixtureHintCount: row.fixtureHintCount,
    newsHintCount: row.newsHintCount,
    targetTermHits: row.targetTermHits
  })),
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
