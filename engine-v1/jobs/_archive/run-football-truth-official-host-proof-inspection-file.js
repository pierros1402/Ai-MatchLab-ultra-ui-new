import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const argv = process.argv.slice(2);
const allowFetch = argv.includes("--allow-fetch");
const maxTargets = Number(argv.find(arg => arg.startsWith("--max-targets="))?.split("=")[1] || "21");

if (!allowFetch) {
  throw new Error("Refusing proof inspection without --allow-fetch");
}

const proofPath = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `official-host-proof-target-board-${today}`,
  `official-host-proof-target-board-${today}.json`
);

const proofRowsPath = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `official-host-proof-target-board-${today}`,
  `official-host-proof-target-board-rows-${today}.jsonl`
);

const outputDir = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `official-host-proof-inspection-${today}`
);

const outputPath = path.join(outputDir, `official-host-proof-inspection-${today}.json`);
const rowsOutputPath = path.join(outputDir, `official-host-proof-inspection-rows-${today}.jsonl`);

const standingsTerms = [
  "standings", "standing", "table", "tabelle", "tabell", "tabela", "tabla",
  "classement", "classifica", "classificação", "classificacao", "ranking",
  "rankings", "ladder", "points", "punkte", "puntos", "pts", "team", "club"
];

const endpointTerms = [
  "api", "graphql", "rank", "ranking", "standings", "standing", "table",
  "tabelle", "tabell", "tabela", "classement", "classifica", "clubRank",
  "competition", "season", "teams", "clubs"
];

const rejectEndpointTerms = [
  "manifest.json", "favicons", "polyfills", "webpack", "runtime", "framework",
  "main-app", "app-build-manifest", "build-manifest", ".css", ".png", ".jpg",
  ".jpeg", ".svg", ".webp", ".woff", ".ico"
];

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function cleanText(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function titleOf(html) {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? cleanText(match[1]).slice(0, 240) : "";
}

function containsAny(text, terms) {
  const lower = String(text || "").toLowerCase();
  return terms.some(term => lower.includes(term.toLowerCase()));
}

function safeUrl(value, base) {
  try {
    return new URL(String(value || ""), base).href;
  } catch {
    return "";
  }
}

function hostOf(value) {
  try {
    return new URL(String(value || "")).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function pathOf(value) {
  try {
    const u = new URL(String(value || ""));
    return `${u.pathname}${u.search}`.toLowerCase();
  } catch {
    return String(value || "").toLowerCase();
  }
}

function boundedSnippet(text, term, radius = 180) {
  const source = String(text || "");
  const lower = source.toLowerCase();
  const idx = lower.indexOf(term.toLowerCase());
  if (idx < 0) return "";
  const start = Math.max(0, idx - radius);
  const end = Math.min(source.length, idx + term.length + radius);
  return source.slice(start, end).replace(/\s+/g, " ").trim();
}

function extractTableSnippets(html) {
  const tableMatches = [...String(html || "").matchAll(/<table\b[\s\S]*?<\/table>/gi)]
    .map(match => match[0])
    .slice(0, 4);

  return tableMatches.map((table, index) => ({
    tableIndex: index,
    rowTagCount: (table.match(/<tr\b/gi) || []).length,
    cellTagCount: (table.match(/<t[dh]\b/gi) || []).length,
    textSample: cleanText(table).slice(0, 900)
  }));
}

function inspectHtml({ body, target }) {
  const text = cleanText(body);
  const title = titleOf(body);
  const tableTagCount = (String(body || "").match(/<table\b/gi) || []).length;
  const rowTagCount = (String(body || "").match(/<tr\b/gi) || []).length;
  const cellTagCount = (String(body || "").match(/<t[dh]\b/gi) || []).length;
  const standingsTermHitCount = standingsTerms.filter(term => text.toLowerCase().includes(term.toLowerCase())).length;
  const season2025Hit = text.includes("2025") || text.includes("2025/26") || text.includes("2025-26") || text.includes("2025-2026");
  const seasonRouteHint = pathOf(target.candidateUrl).match(/saison-\d{4}-\d{4}/i)?.[0] || "";
  const tableSnippets = extractTableSnippets(body);

  const htmlTableExtractionCandidate =
    tableTagCount >= 1 &&
    rowTagCount >= 10 &&
    cellTagCount >= 30 &&
    standingsTermHitCount >= 1;

  const browserRenderRequired =
    !htmlTableExtractionCandidate &&
    (target.proofType === "standings_route_render_probe" || target.proofType === "season_route_extraction_probe");

  const genderMismatchSignal =
    target.slug === "aus.1" &&
    /women/i.test(target.candidateUrl);

  return {
    inspectionKind: "html_route_or_page",
    title,
    textLength: text.length,
    tableTagCount,
    rowTagCount,
    cellTagCount,
    standingsTermHitCount,
    season2025Hit,
    seasonRouteHint,
    tableSnippets,
    htmlTableExtractionCandidate: htmlTableExtractionCandidate && !genderMismatchSignal,
    browserRenderRequired: browserRenderRequired && !genderMismatchSignal,
    genderMismatchSignal,
    keywordSnippets: standingsTerms
      .map(term => ({ term, snippet: boundedSnippet(text, term) }))
      .filter(row => row.snippet)
      .slice(0, 8)
  };
}

function extractUrlsFromScript(script, baseUrl) {
  const urls = new Set();

  const stringRegex = /["'`]([^"'`]{2,280})["'`]/g;
  for (const match of String(script || "").matchAll(stringRegex)) {
    const raw = match[1];
    if (!containsAny(raw, endpointTerms)) continue;
    if (containsAny(raw, rejectEndpointTerms)) continue;
    const url = raw.startsWith("http") || raw.startsWith("/")
      ? safeUrl(raw, baseUrl)
      : raw;
    if (url) urls.add(url);
  }

  const escapedRegex = /https?:\\\/\\\/[^"'`\s]{6,260}/gi;
  for (const match of String(script || "").matchAll(escapedRegex)) {
    const url = match[0].replaceAll("\\/", "/");
    if (containsAny(url, endpointTerms) && !containsAny(url, rejectEndpointTerms)) {
      urls.add(url);
    }
  }

  return [...urls].slice(0, 60);
}

function inspectScript({ body, target }) {
  const endpointCandidates = extractUrlsFromScript(body, target.candidateUrl)
    .map(candidateUrl => {
      const lower = candidateUrl.toLowerCase();
      let score = 0;
      const signals = [];

      if (containsAny(lower, ["api", "graphql", ".json"])) { score += 35; signals.push("api_or_json_pattern"); }
      if (containsAny(lower, ["rank", "ranking", "stand", "table", "tabelle", "tabell", "tabela", "classifica", "club"])) { score += 35; signals.push("standings_or_rank_path"); }
      if (lower.includes("2025")) { score += 15; signals.push("season_2025_in_url"); }
      if (hostOf(candidateUrl) === "" || hostOf(candidateUrl) === hostOf(target.candidateUrl)) { score += 15; signals.push("same_or_relative_host"); }

      return { candidateUrl, score, signals };
    })
    .sort((a, b) => b.score - a.score || a.candidateUrl.localeCompare(b.candidateUrl))
    .slice(0, 20);

  const keywordSnippets = endpointTerms
    .map(term => ({ term, snippet: boundedSnippet(body, term, 220) }))
    .filter(row => row.snippet)
    .slice(0, 10);

  return {
    inspectionKind: "script_asset",
    scriptLength: String(body || "").length,
    endpointCandidateCount: endpointCandidates.length,
    highValueEndpointCandidateCount: endpointCandidates.filter(row => row.score >= 50).length,
    endpointCandidates,
    keywordSnippets,
    scriptEndpointFollowupCandidate: endpointCandidates.some(row => row.score >= 50)
  };
}

function findArrays(value, pathName = "$", out = []) {
  if (out.length >= 20) return out;

  if (Array.isArray(value)) {
    const sample = value.slice(0, 5);
    const keys = [...new Set(sample.flatMap(item =>
      item && typeof item === "object" && !Array.isArray(item) ? Object.keys(item) : []
    ))];

    out.push({
      path: pathName,
      length: value.length,
      sampleKeys: keys.slice(0, 40)
    });

    for (let i = 0; i < Math.min(value.length, 3); i += 1) {
      findArrays(value[i], `${pathName}[${i}]`, out);
    }
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value).slice(0, 80)) {
      findArrays(child, `${pathName}.${key}`, out);
    }
  }

  return out;
}

function inspectJson({ body }) {
  let parsed = null;
  let parseError = null;

  try {
    parsed = JSON.parse(body);
  } catch (error) {
    parseError = error.message || String(error);
  }

  if (!parsed) {
    return {
      inspectionKind: "json_or_api",
      jsonParseOk: false,
      jsonParseError: parseError,
      jsonRankTableCandidate: false,
      arrayCandidates: []
    };
  }

  const arrays = findArrays(parsed);
  const standingsLikeArrays = arrays.filter(row => {
    const keyText = row.sampleKeys.join(" ").toLowerCase();
    const hasTeam = containsAny(keyText, ["team", "club", "name", "equipo", "clubname"]);
    const hasRank = containsAny(keyText, ["rank", "position", "pos", "place", "standing", "clas"]);
    const hasPoints = containsAny(keyText, ["points", "pts", "point", "puntos"]);
    const hasPlayed = containsAny(keyText, ["played", "matches", "games", "pj", "mp"]);
    return row.length >= 8 && hasTeam && (hasRank || hasPoints || hasPlayed);
  });

  return {
    inspectionKind: "json_or_api",
    jsonParseOk: true,
    rootType: Array.isArray(parsed) ? "array" : typeof parsed,
    arrayCandidateCount: arrays.length,
    standingsLikeArrayCount: standingsLikeArrays.length,
    arrayCandidates: arrays.slice(0, 12),
    standingsLikeArrays: standingsLikeArrays.slice(0, 6),
    jsonRankTableCandidate: standingsLikeArrays.length > 0
  };
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 AI-MatchLab-FootballTruth/1.0",
        "accept": "text/html,application/json,text/javascript,*/*;q=0.8"
      }
    });
    const body = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      finalUrl: res.url,
      contentType: res.headers.get("content-type") || "",
      body
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      finalUrl: url,
      contentType: "",
      body: "",
      error: `${error.name || "Error"}: ${error.message || String(error)}`
    };
  } finally {
    clearTimeout(timeout);
  }
}

await fs.mkdir(outputDir, { recursive: true });

const proof = JSON.parse(await fs.readFile(proofPath, "utf8"));
const proofRows = parseJsonl(await fs.readFile(proofRowsPath, "utf8"));
const targets = (proof.summary?.selectedProofTargets || []).slice(0, maxTargets);

const rows = [];
let fetchExecutedNowCount = 0;
let fetched2xxCount = 0;
let fetchFailedCount = 0;

for (let i = 0; i < targets.length; i += 1) {
  const target = targets[i];
  console.log(`FETCH_PROOF ${i + 1}/${targets.length} ${target.slug} ${target.proofType} ${target.candidateUrl}`);

  const fetched = await fetchText(target.candidateUrl);
  fetchExecutedNowCount += 1;
  if (fetched.ok) fetched2xxCount += 1;
  else fetchFailedCount += 1;

  let inspection = {
    inspectionKind: "fetch_failed_or_unclassified",
    htmlTableExtractionCandidate: false,
    browserRenderRequired: false,
    scriptEndpointFollowupCandidate: false,
    jsonRankTableCandidate: false
  };

  if (fetched.ok) {
    const urlPath = pathOf(fetched.finalUrl || target.candidateUrl);
    const contentType = fetched.contentType.toLowerCase();

    if (target.proofType === "standings_script_endpoint_probe" || /\.js(?:\?|$)/i.test(urlPath)) {
      inspection = inspectScript({ body: fetched.body, target });
    } else if (target.proofType === "rank_api_probe" || contentType.includes("json") || /\.json(?:\?|$)/i.test(urlPath)) {
      inspection = inspectJson({ body: fetched.body, target });
    } else {
      inspection = inspectHtml({ body: fetched.body, target });
    }
  }

  let proofOutcome = "park";
  if (inspection.htmlTableExtractionCandidate) proofOutcome = "html_table_extraction_candidate";
  else if (inspection.jsonRankTableCandidate) proofOutcome = "json_rank_table_candidate";
  else if (inspection.scriptEndpointFollowupCandidate) proofOutcome = "script_endpoint_followup_candidate";
  else if (inspection.browserRenderRequired && fetched.ok) proofOutcome = "browser_render_required";

  rows.push({
    slug: target.slug,
    sourceLeague: target.sourceLeague,
    proofType: target.proofType,
    proofScore: target.proofScore,
    proofSignals: target.proofSignals,
    candidateUrl: target.candidateUrl,
    fetchOk: fetched.ok,
    status: fetched.status,
    finalUrl: fetched.finalUrl,
    contentType: fetched.contentType,
    bodyLength: fetched.body.length,
    error: fetched.error || null,
    proofOutcome,
    acceptedNow: false,
    reviewOnly: true,
    acceptanceAllowedNow: false,
    ...inspection
  });

  await new Promise(resolve => setTimeout(resolve, 150));
}

const bySlug = {};
for (const slug of [...new Set(rows.map(row => row.slug))].sort()) {
  const slugRows = rows.filter(row => row.slug === slug);
  bySlug[slug] = {
    inspectedTargetCount: slugRows.length,
    fetched2xxCount: slugRows.filter(row => row.fetchOk).length,
    htmlTableExtractionCandidateCount: slugRows.filter(row => row.proofOutcome === "html_table_extraction_candidate").length,
    jsonRankTableCandidateCount: slugRows.filter(row => row.proofOutcome === "json_rank_table_candidate").length,
    scriptEndpointFollowupCandidateCount: slugRows.filter(row => row.proofOutcome === "script_endpoint_followup_candidate").length,
    browserRenderRequiredCount: slugRows.filter(row => row.proofOutcome === "browser_render_required").length,
    parkedCount: slugRows.filter(row => row.proofOutcome === "park").length,
    topRows: slugRows.map(row => ({
      proofType: row.proofType,
      proofOutcome: row.proofOutcome,
      candidateUrl: row.candidateUrl,
      status: row.status,
      title: row.title || "",
      tableTagCount: row.tableTagCount || 0,
      rowTagCount: row.rowTagCount || 0,
      endpointCandidateCount: row.endpointCandidateCount || 0,
      standingsLikeArrayCount: row.standingsLikeArrayCount || 0
    }))
  };
}

const report = {
  status: "passed",
  runner: "official_host_proof_inspection",
  contractVersion: 1,
  purpose: "Bounded proof inspection of selected official-host proof targets. Stores only bounded metadata/snippets/endpoints, never full raw payloads, and performs no acceptance.",
  inputProofPath: path.relative(root, proofPath).replaceAll("\\", "/"),
  inputProofRowsPath: path.relative(root, proofRowsPath).replaceAll("\\", "/"),
  inputProofSha256: await sha256(proofPath),
  inputProofRowsSha256: await sha256(proofRowsPath),
  output: path.relative(root, outputPath).replaceAll("\\", "/"),
  rowsOutput: path.relative(root, rowsOutputPath).replaceAll("\\", "/"),
  guardrails: {
    allowFetch,
    searchExecutedNowCount: 0,
    fetchExecutedNowCount,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  sourceProofSummary: proof.summary,
  summary: {
    selectedProofTargetCount: proof.summary.selectedProofTargetCount,
    inspectedTargetCount: rows.length,
    inspectedSlugCount: new Set(rows.map(row => row.slug)).size,
    fetched2xxCount,
    fetchFailedCount,
    htmlTableExtractionCandidateCount: rows.filter(row => row.proofOutcome === "html_table_extraction_candidate").length,
    jsonRankTableCandidateCount: rows.filter(row => row.proofOutcome === "json_rank_table_candidate").length,
    scriptEndpointFollowupCandidateCount: rows.filter(row => row.proofOutcome === "script_endpoint_followup_candidate").length,
    browserRenderRequiredCount: rows.filter(row => row.proofOutcome === "browser_render_required").length,
    parkedCount: rows.filter(row => row.proofOutcome === "park").length,
    acceptedNowCount: 0,
    nextExtractionTargets: rows
      .filter(row => ["html_table_extraction_candidate", "json_rank_table_candidate"].includes(row.proofOutcome))
      .map(row => ({
        slug: row.slug,
        sourceLeague: row.sourceLeague,
        proofOutcome: row.proofOutcome,
        candidateUrl: row.finalUrl || row.candidateUrl,
        status: row.status,
        title: row.title || "",
        tableTagCount: row.tableTagCount || 0,
        rowTagCount: row.rowTagCount || 0,
        standingsLikeArrayCount: row.standingsLikeArrayCount || 0
      })),
    nextScriptEndpointTargets: rows
      .filter(row => row.proofOutcome === "script_endpoint_followup_candidate")
      .map(row => ({
        slug: row.slug,
        sourceLeague: row.sourceLeague,
        scriptUrl: row.finalUrl || row.candidateUrl,
        endpointCandidateCount: row.endpointCandidateCount,
        highValueEndpointCandidateCount: row.highValueEndpointCandidateCount,
        endpoints: (row.endpointCandidates || []).slice(0, 8)
      })),
    nextBrowserRenderTargets: rows
      .filter(row => row.proofOutcome === "browser_render_required")
      .map(row => ({
        slug: row.slug,
        sourceLeague: row.sourceLeague,
        candidateUrl: row.finalUrl || row.candidateUrl,
        status: row.status,
        title: row.title || ""
      }))
  },
  recommendation: {
    nextLane: "Run exact extraction/validation for nextExtractionTargets first, then script endpoint follow-up, then browser render for browserRenderRequired targets. Still no canonical/truth/production writes until validation passes and explicit approval is given."
  },
  bySlug
};

await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsOutputPath, rows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  guardrails: report.guardrails,
  summary: report.summary,
  recommendation: report.recommendation
}, null, 2));

