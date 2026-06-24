import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const allowFetch = process.argv.includes("--allow-fetch");

const actionPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-post-rollup-action-batch-${today}`, `football-truth-post-rollup-action-batch-${today}.json`);
const outDir = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-ned2-start-date-evidence-${today}`);
const outPath = path.join(outDir, `football-truth-ned2-start-date-evidence-${today}.json`);
const rowsPath = path.join(outDir, `football-truth-ned2-start-date-evidence-rows-${today}.jsonl`);

function rel(file) { return path.relative(root, file).replaceAll("\\", "/"); }
function shaText(text) { return crypto.createHash("sha256").update(String(text || "")).digest("hex"); }
function stripHtml(value) { return String(value || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim(); }
function hostOf(url) { try { return new URL(url).host.toLowerCase().replace(/^www\./, ""); } catch { return ""; } }
function titleOf(html) { const m = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i); return stripHtml(m?.[1] || "").slice(0, 180); }
function uniq(values) { return [...new Set((values || []).filter(Boolean))]; }

const monthMap = {
  januari: "01", februari: "02", maart: "03", april: "04", mei: "05", juni: "06",
  juli: "07", augustus: "08", september: "09", oktober: "10", november: "11", december: "12"
};

function isoDate(y, m, d) {
  const yy = String(y).padStart(4, "0");
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function normalizeDate(value) {
  const s = String(value || "").trim().toLowerCase();
  let m = s.match(/\b(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})\b/);
  if (m) return isoDate(m[1], m[2], m[3]);
  m = s.match(/\b(\d{1,2})[-\/](\d{1,2})[-\/](20\d{2})\b/);
  if (m) return isoDate(m[3], m[2], m[1]);
  m = s.match(/\b(\d{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+(20\d{2})\b/i);
  if (m) return isoDate(m[3], monthMap[m[2].toLowerCase()], m[1]);
  return null;
}

function snippetAround(text, index, radius = 220) {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function extractDateMentions(text, url) {
  const clean = stripHtml(text);
  const patterns = [
    /\b20\d{2}[-\/]\d{1,2}[-\/]\d{1,2}\b/g,
    /\b\d{1,2}[-\/]\d{1,2}[-\/]20\d{2}\b/g,
    /\b\d{1,2}\s+(?:januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+20\d{2}\b/gi
  ];

  const mentions = [];
  for (const rx of patterns) {
    let match;
    while ((match = rx.exec(clean)) !== null) {
      const normalizedDate = normalizeDate(match[0]);
      if (!normalizedDate) continue;
      const context = snippetAround(clean, match.index);
      const lowerContext = context.toLowerCase();
      const dateObj = new Date(`${normalizedDate}T00:00:00Z`);
      const year = Number(normalizedDate.slice(0, 4));
      const month = Number(normalizedDate.slice(5, 7));

      let score = 0;
      if (year === 2026) score += 25;
      if (month >= 7 && month <= 9) score += 30;
      if (/start|begint|begin|eerste|openings|speelronde\s*1|ronde\s*1|programma|speelschema|wedstrijdschema|kalender/.test(lowerContext)) score += 55;
      if (/keuken kampioen|eerste divisie|kkd|competitie|seizoen|2026\/27|2026-27|2026\/2027/.test(lowerContext)) score += 35;
      if (/programma|wedstrijden|schema|kalender|fixtures/i.test(url)) score += 20;
      if (normalizedDate < today) score -= 35;
      if (year < 2026 || year > 2027) score -= 50;

      mentions.push({
        url,
        rawDate: match[0],
        normalizedDate,
        score,
        context,
        contextSha256: shaText(context)
      });
    }
  }

  return mentions;
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
        "user-agent": "Mozilla/5.0 (compatible; AI-MatchLab-FootballTruth/1.0; +ned2-start-date-evidence)",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.7",
        "accept-language": "nl-NL,nl;q=0.9,en-US;q=0.7,en;q=0.6"
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

await fs.mkdir(outDir, { recursive: true });

const blocks = [];
if (!allowFetch) blocks.push("missing_allow_fetch");

const action = JSON.parse(await fs.readFile(actionPath, "utf8"));
if (action.status !== "passed") blocks.push("action_batch_not_passed");
if (JSON.stringify(action.summary?.zeroPlayedStartDateLaneSlugs || []) !== JSON.stringify(["ned.2"])) blocks.push("ned2_not_the_only_zero_played_start_date_target");

const urls = [
  "https://keukenkampioendivisie.nl/",
  "https://keukenkampioendivisie.nl/programma",
  "https://keukenkampioendivisie.nl/programma/",
  "https://keukenkampioendivisie.nl/wedstrijden",
  "https://keukenkampioendivisie.nl/wedstrijden/",
  "https://keukenkampioendivisie.nl/stand",
  "https://keukenkampioendivisie.nl/stand/",
  "https://keukenkampioendivisie.nl/nieuws",
  "https://keukenkampioendivisie.nl/nieuws/",
  "https://keukenkampioendivisie.nl/competitie",
  "https://keukenkampioendivisie.nl/competitie/"
];

const rows = [];
let fetchCount = 0;
let allMentions = [];

if (allowFetch && blocks.length === 0) {
  for (const url of urls) {
    console.log(`[ned.2] ${url}`);
    const fetched = await fetchWithTimeout(url);
    fetchCount += 1;

    const finalUrl = fetched.response?.url || url;
    const text = fetched.text || "";
    const mentions = extractDateMentions(text, finalUrl);
    allMentions.push(...mentions);

    rows.push({
      slug: "ned.2",
      url,
      finalUrl,
      finalHost: hostOf(finalUrl),
      fetchStatus: fetched.response?.status ?? null,
      title: titleOf(text),
      bodyLength: text.length,
      bodySha256: text ? shaText(text) : null,
      fetchError: fetched.error,
      timedOut: fetched.timedOut,
      dateMentionCount: mentions.length,
      topDateMentions: mentions.sort((a, b) => b.score - a.score).slice(0, 6),
      acceptedNow: false,
      canonicalWriteExecutedNow: false,
      lifecycleWriteExecutedNow: false,
      productionWriteExecutedNow: false,
      truthAssertionExecutedNow: false,
      rawPayloadCommitted: false,
      fullRawPayloadWritten: false
    });
  }
}

allMentions = allMentions.sort((a, b) => b.score - a.score || a.normalizedDate.localeCompare(b.normalizedDate));
const bestMention = allMentions[0] || null;

let evidenceStatus = "start_date_evidence_not_found";
if (bestMention && bestMention.score >= 90) evidenceStatus = "start_date_candidate_needs_review";
else if (bestMention && bestMention.score >= 55) evidenceStatus = "weak_start_date_evidence_needs_review";

const report = {
  status: blocks.length ? "failed" : "passed",
  runner: "football_truth_ned2_start_date_evidence",
  contractVersion: 1,
  generatedAt: new Date().toISOString(),
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  inputs: {
    actionPath: rel(actionPath)
  },
  target: {
    slug: "ned.2",
    competitionLabel: "Keuken Kampioen Divisie / Eerste Divisie",
    sourceHost: "keukenkampioendivisie.nl",
    reason: "zero-played table needs governed start-date evidence before lifecycle/current-season handling"
  },
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: fetchCount,
    controlledOfficialStartDateFetchExecutedNowCount: fetchCount,
    canonicalWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    targetCount: 1,
    attemptedFetchCount: fetchCount,
    dateMentionCount: allMentions.length,
    evidenceStatus,
    bestStartDateCandidate: bestMention ? {
      normalizedDate: bestMention.normalizedDate,
      score: bestMention.score,
      sourceUrl: bestMention.url,
      rawDate: bestMention.rawDate,
      context: bestMention.context,
      contextSha256: bestMention.contextSha256
    } : null,
    acceptedNowCount: 0,
    nextRecommendedLane: evidenceStatus === "start_date_candidate_needs_review" ? "review start-date candidate before lifecycle/current-season handling" : "park ned.2 start-date lane or use explicit official schedule source search later"
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
  blocks: report.blocks
}, null, 2));

if (blocks.length) process.exitCode = 1;
