import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const allowFetch = process.argv.includes("--allow-fetch");

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `zero-played-start-date-evidence-diagnostic-${today}`);
const outPath = path.join(outDir, `zero-played-start-date-evidence-diagnostic-${today}.json`);
const rowsPath = path.join(outDir, `zero-played-start-date-evidence-diagnostic-rows-${today}.jsonl`);

const jpnProofPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-generic-standings-extraction-proof-${today}`, `bulk-batch-generic-standings-extraction-proof-batch-001-${today}.json`);
const srbProofPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-srb1-html-table-extraction-diagnostic-${today}`, `bulk-batch-srb1-html-table-extraction-diagnostic-batch-002-${today}.json`);
const srbProofVerificationPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-srb1-html-table-extraction-diagnostic-verification-${today}`, `bulk-batch-srb1-html-table-extraction-diagnostic-batch-002-verification-${today}.json`);

const controlledTargets = [
  {
    slug: "jpn.2",
    displayName: "Japan J2 League",
    expectedCompetitionTerms: ["j2", "j.league", "jleague", "japan"],
    officialHosts: ["jleague.co"],
    sourceProofPath: jpnProofPath,
    proofCheck: proof => proof.summary?.proofPassedZeroPlayedSlugs?.includes("jpn.2"),
    urls: [
      "https://www.jleague.co/en/standings/j2/2026/",
      "https://www.jleague.co/en/matches/j2/2026/",
      "https://www.jleague.co/en/schedule/j2/2026/",
      "https://www.jleague.co/en/matches/",
      "https://www.jleague.co/en/news/"
    ]
  },
  {
    slug: "srb.1",
    displayName: "Serbia SuperLiga",
    expectedCompetitionTerms: ["super liga", "superliga", "mozzart", "srbije", "serbia"],
    officialHosts: ["superliga.rs"],
    sourceProofPath: srbProofPath,
    proofVerificationPath: srbProofVerificationPath,
    proofCheck: proof => proof.summary?.proofShapePassedZeroPlayedSlugs?.includes("srb.1"),
    urls: [
      "https://www.superliga.rs/sezona/tabela-takmicenja/",
      "https://www.superliga.rs/sezona/raspored-utakmica/",
      "https://www.superliga.rs/sezona/rezultati/",
      "https://www.superliga.rs/sezona/",
      "https://www.superliga.rs/vesti/"
    ]
  }
];

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function shaText(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
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

function hostOf(url) {
  try { return new URL(url).host.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

function parseDateCandidate(raw) {
  const s = String(raw || "").trim();

  let m = s.match(/\b(20\d{2})[.\-/](0?[1-9]|1[0-2])[.\-/](0?[1-9]|[12]\d|3[01])\b/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;

  m = s.match(/\b(0?[1-9]|[12]\d|3[01])[.\-/](0?[1-9]|1[0-2])[.\-/](20\d{2})\b/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;

  const months = {
    january: "01", february: "02", march: "03", april: "04", may: "05", june: "06", july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
    jan: "01", feb: "02", mar: "03", apr: "04", jun: "06", jul: "07", aug: "08", sep: "09", sept: "09", oct: "10", nov: "11", dec: "12"
  };

  m = s.toLowerCase().match(/\b(0?[1-9]|[12]\d|3[01])\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(20\d{2})\b/);
  if (m) return `${m[3]}-${months[m[2]]}-${String(m[1]).padStart(2, "0")}`;

  m = s.toLowerCase().match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(0?[1-9]|[12]\d|3[01]),?\s+(20\d{2})\b/);
  if (m) return `${m[3]}-${months[m[1]]}-${String(m[2]).padStart(2, "0")}`;

  return null;
}

function extractDateCandidates(text, url, title, target) {
  const clean = stripHtml(text);
  const rawMatches = [
    ...clean.matchAll(/\b20\d{2}[.\-/](?:0?[1-9]|1[0-2])[.\-/](?:0?[1-9]|[12]\d|3[01])\b/g),
    ...clean.matchAll(/\b(?:0?[1-9]|[12]\d|3[01])[.\-/](?:0?[1-9]|1[0-2])[.\-/]20\d{2}\b/g),
    ...clean.matchAll(/\b(?:0?[1-9]|[12]\d|3[01])\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+20\d{2}\b/gi),
    ...clean.matchAll(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(?:0?[1-9]|[12]\d|3[01]),?\s+20\d{2}\b/gi)
  ].map(match => ({ raw: match[0], index: match.index ?? 0 }));

  const dedup = new Map();

  for (const match of rawMatches) {
    const isoDate = parseDateCandidate(match.raw);
    if (!isoDate) continue;
    if (isoDate < today) continue;
    if (isoDate > "2027-12-31") continue;

    const start = Math.max(0, match.index - 240);
    const end = Math.min(clean.length, match.index + match.raw.length + 240);
    const context = clean.slice(start, end);
    const combined = `${url} ${title} ${context}`.toLowerCase();

    const competitionTermHits = target.expectedCompetitionTerms.filter(term => combined.includes(term.toLowerCase()));
    const scheduleTermHits = ["fixture", "fixtures", "match", "matches", "schedule", "round", "round 1", "opening", "start", "season", "raspored", "utakmica", "kolo", "sezona", "日程", "試合"].filter(term => combined.includes(term.toLowerCase()));

    let score = 0;
    score += competitionTermHits.length * 30;
    score += scheduleTermHits.length * 20;
    if (/standings|table|tabela/.test(combined)) score += 10;
    if (/matches|fixtures|schedule|raspored|utakmica/.test(combined)) score += 30;
    if (/round\s*1|1\.\s*kolo|opening|start|kickoff|開幕/.test(combined)) score += 40;
    if (hostOf(url) && target.officialHosts.some(host => hostOf(url) === host || hostOf(url).endsWith(`.${host}`))) score += 50;

    const key = `${isoDate}|${url}`;
    const candidate = {
      slug: target.slug,
      isoDate,
      rawDateText: match.raw,
      sourceUrl: url,
      sourceTitle: title,
      score,
      competitionTermHits,
      scheduleTermHits,
      evidenceContext: context.slice(0, 500),
      governedByOfficialHost: target.officialHosts.some(host => hostOf(url) === host || hostOf(url).endsWith(`.${host}`))
    };

    const prev = dedup.get(key);
    if (!prev || candidate.score > prev.score) dedup.set(key, candidate);
  }

  return [...dedup.values()].sort((a, b) => b.score - a.score || a.isoDate.localeCompare(b.isoDate));
}

async function fetchWithTimeout(url, timeoutMs = 18000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; AI-MatchLab-FootballTruth/1.0; +zero-played-start-date-evidence)",
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

await fs.mkdir(outDir, { recursive: true });

const blocks = [];
if (!allowFetch) blocks.push("missing_allow_fetch");

for (const target of controlledTargets) {
  const proof = JSON.parse(await fs.readFile(target.sourceProofPath, "utf8"));
  if (!target.proofCheck(proof)) blocks.push(`zero_played_proof_missing_${target.slug}`);
  if (target.proofVerificationPath) {
    const proofVerification = JSON.parse(await fs.readFile(target.proofVerificationPath, "utf8"));
    if (proofVerification.status !== "passed") blocks.push(`zero_played_verification_missing_${target.slug}`);
  }
}

const rows = [];
let attemptedFetchCount = 0;

if (allowFetch && blocks.length === 0) {
  for (const target of controlledTargets) {
    const fetches = [];
    const allCandidates = [];

    for (let i = 0; i < target.urls.length; i++) {
      const url = target.urls[i];
      attemptedFetchCount += 1;
      console.log(`[${target.slug}] [${i + 1}/${target.urls.length}] ${url}`);

      const startedAt = new Date().toISOString();
      const fetched = await fetchWithTimeout(url, 18000);
      const endedAt = new Date().toISOString();
      const html = fetched.text || "";
      const finalUrl = fetched.response?.url || url;
      const title = titleOf(html);
      const finalHost = hostOf(finalUrl);
      const hostAllowed = target.officialHosts.some(host => finalHost === host || finalHost.endsWith(`.${host}`));
      const challengeText = `${title} ${html.slice(0, 12000)} ${finalUrl}`;
      const hasChallenge = /just a moment|are you not a robot|showcaptcha|access denied|forbidden/i.test(challengeText) || (/cf-chl|cloudflare/i.test(challengeText) && /challenge|captcha|checking your browser/i.test(challengeText));
      const candidates = hostAllowed && !hasChallenge
        ? extractDateCandidates(html, finalUrl, title, target).filter(candidate =>
            candidate.scheduleTermHits.length > 0 &&
            !/last\s+updated|updated\s+on|last\s+modified/i.test(candidate.evidenceContext)
          )
        : [];

      fetches.push({
        url,
        finalUrl,
        finalHost,
        fetchStatus: fetched.response?.status ?? null,
        contentType: fetched.response?.headers?.get("content-type") || null,
        title,
        bodyLength: html.length,
        bodySha256: html ? shaText(html) : null,
        hostAllowed,
        hasChallenge,
        fetchError: fetched.error,
        timedOut: fetched.timedOut,
        dateCandidateCount: candidates.length,
        topDateCandidates: candidates.slice(0, 5),
        startedAt,
        endedAt
      });

      allCandidates.push(...candidates);
    }

    const ranked = [...allCandidates].sort((a, b) => b.score - a.score || a.isoDate.localeCompare(b.isoDate));
    const selected = ranked.find(candidate => candidate.score >= 90 && candidate.governedByOfficialHost) || null;

    rows.push({
      slug: target.slug,
      displayName: target.displayName,
      lifecycleEvidenceStatus: selected ? "start_date_candidate_found_needs_review" : "no_governed_start_date_candidate_found",
      selectedStartDateCandidate: selected,
      dateCandidateCount: ranked.length,
      topDateCandidates: ranked.slice(0, 10),
      fetches,
      acceptedNow: false,
      lifecycleWriteExecutedNow: false,
      canonicalWriteExecutedNow: false,
      productionWriteExecutedNow: false,
      truthAssertionExecutedNow: false,
      rawPayloadCommitted: false,
      fullRawPayloadWritten: false
    });
  }
}

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "zero_played_start_date_evidence_diagnostic",
  contractVersion: 1,
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  inputProofs: controlledTargets.map(target => rel(target.sourceProofPath)),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: attemptedFetchCount,
    controlledOfficialLifecycleEvidenceFetchExecutedNowCount: attemptedFetchCount,
    lifecycleWriteExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    targetCount: controlledTargets.length,
    attemptedFetchCount,
    candidateFoundCount: rows.filter(row => row.lifecycleEvidenceStatus === "start_date_candidate_found_needs_review").length,
    noCandidateCount: rows.filter(row => row.lifecycleEvidenceStatus === "no_governed_start_date_candidate_found").length,
    candidateFoundSlugs: rows.filter(row => row.lifecycleEvidenceStatus === "start_date_candidate_found_needs_review").map(row => row.slug),
    noCandidateSlugs: rows.filter(row => row.lifecycleEvidenceStatus === "no_governed_start_date_candidate_found").map(row => row.slug),
    acceptedNowCount: 0,
    lifecycleWriteAllowedNow: false,
    canonicalWriteAllowedNow: false,
    productionWriteAllowedNow: false,
    truthAssertionAllowedNow: false,
    nextRecommendedLane: "verify diagnostic; candidate rows require human review before any lifecycle candidate write"
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
    lifecycleEvidenceStatus: row.lifecycleEvidenceStatus,
    selectedStartDateCandidate: row.selectedStartDateCandidate,
    dateCandidateCount: row.dateCandidateCount,
    topDateCandidates: row.topDateCandidates.slice(0, 5),
    fetches: row.fetches.map(fetch => ({
      url: fetch.url,
      finalUrl: fetch.finalUrl,
      finalHost: fetch.finalHost,
      fetchStatus: fetch.fetchStatus,
      title: fetch.title,
      bodyLength: fetch.bodyLength,
      hostAllowed: fetch.hostAllowed,
      hasChallenge: fetch.hasChallenge,
      dateCandidateCount: fetch.dateCandidateCount,
      topDateCandidates: fetch.topDateCandidates.slice(0, 3)
    }))
  })),
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
