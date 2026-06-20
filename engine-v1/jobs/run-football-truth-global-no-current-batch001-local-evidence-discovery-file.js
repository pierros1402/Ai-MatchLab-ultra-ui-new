import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const allowFetch = process.argv.includes("--allow-fetch");

const dataRoot = path.join(root, "data", "football-truth");
const planPath = path.join(dataRoot, "_diagnostics", `football-truth-global-no-current-discovery-batches-${today}`, `football-truth-global-no-current-discovery-batches-${today}.json`);
const planRowsPath = path.join(dataRoot, "_diagnostics", `football-truth-global-no-current-discovery-batches-${today}`, `football-truth-global-no-current-discovery-batches-rows-${today}.jsonl`);
const planVerificationPath = path.join(dataRoot, "_diagnostics", `football-truth-global-no-current-discovery-batches-verification-${today}`, `football-truth-global-no-current-discovery-batches-verification-${today}.json`);

const outDir = path.join(dataRoot, "_diagnostics", `football-truth-global-no-current-batch001-local-evidence-discovery-${today}`);
const outPath = path.join(outDir, `football-truth-global-no-current-batch001-local-evidence-discovery-${today}.json`);
const rowsPath = path.join(outDir, `football-truth-global-no-current-batch001-local-evidence-discovery-rows-${today}.jsonl`);

function rel(file) { return path.relative(root, file).replaceAll("\\", "/"); }
function parseJsonl(text) { return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }
function uniq(values) { return [...new Set((values || []).filter(Boolean))]; }
function shaText(text) { return crypto.createHash("sha256").update(String(text || "")).digest("hex"); }
function country(slug) { return String(slug || "").split(".")[0]; }
function hostOf(url) { try { return new URL(url).host.toLowerCase().replace(/^www\./, ""); } catch { return ""; } }

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleOf(html) {
  const m = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return String(m?.[1] || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim().slice(0, 180);
}

function deniedHost(url) {
  const host = hostOf(url);
  if (!host) return true;
  return ["wikipedia.org","wikidata.org","facebook.com","twitter.com","x.com","instagram.com","youtube.com","countryreports.org","transfermarkt.com","sofascore.com","flashscore.com","livescore.com","worldfootball.net","rsssf.org","google.com","bing.com"].some(d => host === d || host.endsWith(`.${d}`));
}

function routeScore(text) {
  const n = normalize(text);
  return ["standings","table","fixtures","fixture","schedule","results","competition","league","season","posiciones","clasificacion","tabla","calendario","resultados","tabela","classificacao"].filter(w => n.includes(normalize(w))).length;
}

function terms(target) {
  const out = [target.slug, country(target.slug)];
  if (target.displayName) {
    out.push(target.displayName);
    for (const p of String(target.displayName).split(/\s+/)) {
      const v = p.replace(/[^\p{L}\p{N}.]/gu, "");
      if (v.length >= 4) out.push(v);
    }
  }
  return uniq(out);
}

function hits(text, wanted) {
  const n = normalize(text);
  return uniq(wanted.filter(t => t && n.includes(normalize(t))));
}

function extractUrls(text) {
  const out = [];
  const rx = /https?:\/\/[^\s"'<>\\)]+/g;
  let m;
  while ((m = rx.exec(text)) !== null) {
    const url = m[0].replace(/[,\].}]+$/g, "");
    const context = text.slice(Math.max(0, m.index - 300), Math.min(text.length, m.index + url.length + 300));
    out.push({ url, context });
  }
  return out;
}

function localScore(target, item) {
  if (deniedHost(item.url)) return -1000;
  const combined = `${item.url} ${item.context || ""}`;
  const termHits = hits(combined, terms(target));
  let score = termHits.length * 30 + routeScore(combined) * 18;
  if (/feder|league|liga|futbol|football|soccer|association|futve|dimayor|anfp|auf|apf|vpf|aiff|thaileague|cpl|faw/i.test(item.url)) score += 35;
  if (/standings|table|fixture|schedule|results|competition|season|posiciones|tabla|calendario|resultados/i.test(item.url)) score += 35;
  if (/news|article|privacy|terms|login|shop|ticket/i.test(item.url)) score -= 30;
  return score;
}

async function fetchWithTimeout(url, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; AI-MatchLab-FootballTruth/1.0; +fast-local-evidence-batch001)",
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

function fetchedScore(target, candidate, fetched) {
  const html = fetched.text || "";
  const finalUrl = fetched.response?.url || candidate.url;
  const title = titleOf(html);
  const status = fetched.response?.status ?? null;
  const combined = `${finalUrl} ${title} ${html.slice(0, 50000)}`;
  const termHits = hits(combined, terms(target));
  const rScore = routeScore(combined);
  const tableCount = (html.match(/<table\b/gi) || []).length;
  const trCount = (html.match(/<tr\b/gi) || []).length;
  const apiHintCount = (html.match(/standings|fixtures|schedule|results|posiciones|clasificacion|tabla|calendario|resultados|competition|season|league|table/gi) || []).length;
  const challengeText = `${title} ${html.slice(0, 8000)} ${finalUrl}`;
  const hasChallenge = /just a moment|are you not a robot|showcaptcha|access denied|forbidden/i.test(challengeText) || (/cf-chl|cloudflare/i.test(challengeText) && /challenge|captcha|checking your browser/i.test(challengeText));

  let score = 0;
  if ((status ?? 0) >= 200 && (status ?? 0) < 400) score += 50;
  if (hasChallenge) score -= 150;
  score += termHits.length * 35;
  score += rScore * 20;
  if (tableCount >= 1 && trCount >= 8) score += 65;
  if (apiHintCount >= 20) score += 35;
  if (/feder|league|liga|futbol|football|soccer|association|futve|dimayor|anfp|auf|apf|vpf|aiff|thaileague|cpl|faw/i.test(`${hostOf(finalUrl)} ${finalUrl} ${title}`)) score += 35;
  if (deniedHost(finalUrl)) score -= 250;

  let discoveryStatus = "controlled_route_candidate_not_found";
  if (score >= 190 && !hasChallenge && (status ?? 0) >= 200 && (status ?? 0) < 400) discoveryStatus = "controlled_route_candidate_passed";
  else if (score >= 120 && !hasChallenge) discoveryStatus = "controlled_route_candidate_needs_review";

  return { finalUrl, finalHost: hostOf(finalUrl), fetchStatus: status, title, bodyLength: html.length, bodySha256: html ? shaText(html) : null, fetchError: fetched.error, timedOut: fetched.timedOut, termHits, routeWordHitCount: rScore, tableCount, trCount, apiHintCount, hasChallenge, fetchedScore: score, discoveryStatus };
}

await fs.mkdir(outDir, { recursive: true });

const blocks = [];
if (!allowFetch) blocks.push("missing_allow_fetch");

const plan = JSON.parse(await fs.readFile(planPath, "utf8"));
const planRows = parseJsonl(await fs.readFile(planRowsPath, "utf8"));
const planVerification = JSON.parse(await fs.readFile(planVerificationPath, "utf8"));

if (plan.status !== "passed") blocks.push("plan_not_passed");
if (planVerification.status !== "passed") blocks.push("plan_verification_not_passed");

const firstBatch = plan.batches?.find(b => b.batchId === "global-no-current-discovery-001");
if (!firstBatch || firstBatch.targetCount !== 80) blocks.push("first_batch_missing_or_bad");

const bySlug = new Map(planRows.map(row => [row.slug, row]));
const targets = (firstBatch?.slugs || []).map(slug => bySlug.get(slug)).filter(Boolean);
if (targets.length !== 80) blocks.push("targets_not_80");

let scannedFileCount = 0;
let candidateUrlObservationCount = 0;
let fetchCount = 0;
const rows = [];

if (allowFetch && blocks.length === 0) {
  let i = 0;
  for (const target of targets) {
    i += 1;
    const candidateMap = new Map();

    for (const relFile of target.sampleEvidenceFiles || []) {
      const full = path.join(root, relFile);
      let text = "";
      try { text = await fs.readFile(full, "utf8"); scannedFileCount += 1; } catch { continue; }
      for (const item of extractUrls(text)) {
        const score = localScore(target, item);
        if (score < 55) continue;
        candidateUrlObservationCount += 1;
        const old = candidateMap.get(item.url);
        if (!old || score > old.localEvidenceScore) candidateMap.set(item.url, { url: item.url, localEvidenceScore: score, evidenceFile: relFile, contextHash: shaText(item.context) });
      }
    }

    const candidates = [...candidateMap.values()].sort((a,b) => b.localEvidenceScore - a.localEvidenceScore || a.url.localeCompare(b.url)).slice(0, 2);
    console.log(`[${i}/${targets.length}] ${target.slug} localCandidates=${candidateMap.size} fetch=${candidates.length}`);

    const fetches = [];
    for (let j = 0; j < candidates.length; j++) {
      console.log(`  [${j + 1}/${candidates.length}] ${candidates[j].url}`);
      const fetched = await fetchWithTimeout(candidates[j].url);
      fetchCount += 1;
      fetches.push({ ...candidates[j], ...fetchedScore(target, candidates[j], fetched) });
    }

    const selected = fetches.sort((a,b) => b.fetchedScore - a.fetchedScore || (b.bodyLength || 0) - (a.bodyLength || 0))[0] || null;
    const discoveryStatus = selected?.discoveryStatus || "no_local_candidate_url_found";

    rows.push({
      slug: target.slug,
      displayName: target.displayName,
      priorityScore: target.priorityScore,
      valueTier: target.valueTier,
      localCandidateUrlCount: candidateMap.size,
      fetchedCandidateCount: fetches.length,
      discoveryStatus,
      selectedUrl: selected?.url || null,
      selectedFinalUrl: selected?.finalUrl || null,
      selectedHost: selected?.finalHost || null,
      selectedTitle: selected?.title || null,
      selectedFetchStatus: selected?.fetchStatus ?? null,
      selectedFetchedScore: selected?.fetchedScore ?? null,
      selectedTermHits: selected?.termHits || [],
      selectedRouteWordHitCount: selected?.routeWordHitCount || 0,
      selectedTableCount: selected?.tableCount || 0,
      selectedTrCount: selected?.trCount || 0,
      selectedApiHintCount: selected?.apiHintCount || 0,
      selectedHasChallenge: selected?.hasChallenge ?? null,
      fetches,
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

const statusCounts = rows.reduce((acc, row) => { acc[row.discoveryStatus] = (acc[row.discoveryStatus] || 0) + 1; return acc; }, {});

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "global_no_current_batch001_fast_local_evidence_discovery",
  contractVersion: 2,
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  inputPlanPath: rel(planPath),
  inputPlanRowsPath: rel(planRowsPath),
  inputPlanVerificationPath: rel(planVerificationPath),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: fetchCount,
    controlledLocalEvidenceFetchExecutedNowCount: fetchCount,
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
    batchId: "global-no-current-discovery-001",
    targetCount: targets.length,
    scannedFileCount,
    candidateUrlObservationCount,
    attemptedFetchCount: fetchCount,
    discoveryStatusCounts: statusCounts,
    passedSlugs: rows.filter(r => r.discoveryStatus === "controlled_route_candidate_passed").map(r => r.slug),
    needsReviewSlugs: rows.filter(r => r.discoveryStatus === "controlled_route_candidate_needs_review").map(r => r.slug),
    notFoundSlugs: rows.filter(r => r.discoveryStatus === "controlled_route_candidate_not_found" || r.discoveryStatus === "no_local_candidate_url_found").map(r => r.slug),
    noLocalCandidateUrlSlugs: rows.filter(r => r.discoveryStatus === "no_local_candidate_url_found").map(r => r.slug),
    hitRate: `${rows.filter(r => r.discoveryStatus === "controlled_route_candidate_passed").length}/${targets.length}`,
    nextRecommendedLane: "verify diagnostic; pass results through identity/surface gate before extraction"
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
    discoveryStatus: row.discoveryStatus,
    localCandidateUrlCount: row.localCandidateUrlCount,
    fetchedCandidateCount: row.fetchedCandidateCount,
    selectedUrl: row.selectedUrl,
    selectedFinalUrl: row.selectedFinalUrl,
    selectedHost: row.selectedHost,
    selectedTitle: row.selectedTitle,
    selectedFetchStatus: row.selectedFetchStatus,
    selectedFetchedScore: row.selectedFetchedScore,
    selectedTableCount: row.selectedTableCount,
    selectedTrCount: row.selectedTrCount,
    selectedApiHintCount: row.selectedApiHintCount,
    selectedHasChallenge: row.selectedHasChallenge
  })),
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
