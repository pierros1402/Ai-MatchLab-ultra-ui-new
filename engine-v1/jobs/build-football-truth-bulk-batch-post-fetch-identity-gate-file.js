import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const batchIndex = 1;
const pad = String(batchIndex).padStart(3, "0");

const controlledFetchPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-route-controlled-fetch-verification-${today}`, `bulk-batch-route-controlled-fetch-verification-batch-${pad}-${today}.json`);
const alternativeProbePath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-alternative-route-probe-${today}`, `bulk-batch-alternative-route-probe-batch-${pad}-${today}.json`);

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-post-fetch-identity-gate-${today}`);
const outPath = path.join(outDir, `bulk-batch-post-fetch-identity-gate-batch-${pad}-${today}.json`);
const rowsPath = path.join(outDir, `bulk-batch-post-fetch-identity-gate-batch-${pad}-rows-${today}.jsonl`);

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function shaText(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}

function hostOf(url) {
  try { return new URL(url).host.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

function pathOf(url) {
  try { return new URL(url).pathname.toLowerCase().replace(/\/+$/, "/"); } catch { return ""; }
}

function isGenericHomepage(row) {
  const title = String(row.title || row.bestTitle || "").toLowerCase();
  const url = String(row.finalUrl || row.bestFinalUrl || row.selectedUrl || row.bestUrl || "").toLowerCase();
  const pathname = pathOf(url);

  if (pathname === "/" || pathname === "/en/" || pathname === "/es/" || pathname === "/de/" || pathname === "/el/" || pathname === "/fr/" || pathname === "/pt/") return true;
  if (/^(homepage|home|bienvenido|football australia \| the home|k league)$/i.test(String(row.title || row.bestTitle || "").trim())) return true;
  if (/official website$|official international website$/i.test(String(row.title || row.bestTitle || "").trim()) && pathname === "/") return true;

  return false;
}

function routeIntentFromUrl(url, title) {
  const text = `${url || ""} ${title || ""}`.toLowerCase();
  if (/(standings|ranking|table|tabela|tabulka|tabelle|classifica|classificacao|clasament|puan|ladder|scoreboard|βαθμολογ|stillingen|clasament)/i.test(text)) return "standings";
  if (/(fixtures|fixture|results|schedule|matches|match|calendario|spielplan|program|terminarz|zapasy|fikstur|kampprogram|αγων|meciuri)/i.test(text)) return "fixtures_or_results";
  if (/(liga-1|superliga|serie-bkt|j2|2\. liga|super league|usl championship|mls|ekstraklasa)/i.test(text)) return "competition_page";
  return "generic_or_unknown";
}

function confidenceFor(row) {
  const url = row.finalUrl || row.bestFinalUrl || row.selectedUrl || row.bestUrl || "";
  const title = row.title || row.bestTitle || "";
  const bodyLength = Number(row.bodyLength || row.bestBodyLength || 0);
  const status = row.fetchStatus ?? row.bestFetchStatus;
  const routeIntent = routeIntentFromUrl(url, title);
  const genericHomepage = isGenericHomepage(row);

  const blocks = [];
  if (!(status >= 200 && status < 400)) blocks.push("status_not_2xx_or_3xx");
  if (genericHomepage) blocks.push("generic_homepage_or_root_redirect");
  if (routeIntent === "generic_or_unknown") blocks.push("route_intent_unknown");
  if (bodyLength < 500) blocks.push("body_too_short");

  let confidence = "rejected";
  if (blocks.length === 0 && ["standings", "fixtures_or_results"].includes(routeIntent)) confidence = "parser_ready";
  else if (blocks.length === 0 && routeIntent === "competition_page") confidence = "rendered_or_parser_review";
  else if (blocks.length <= 1 && routeIntent !== "generic_or_unknown" && !genericHomepage && status >= 200 && status < 400) confidence = "rendered_or_parser_review";

  return { confidence, routeIntent, genericHomepage, blocks };
}

await fs.mkdir(outDir, { recursive: true });

const controlled = JSON.parse(await fs.readFile(controlledFetchPath, "utf8"));
const alternative = JSON.parse(await fs.readFile(alternativeProbePath, "utf8"));

const candidateRows = [];

for (const row of controlled.rows || []) {
  if (row.validationPassed === true) {
    candidateRows.push({
      slug: row.slug,
      displayName: row.displayName,
      sourceLane: "controlled_fetch_passed",
      url: row.selectedUrl,
      finalUrl: row.finalUrl,
      finalHost: row.finalHost,
      fetchStatus: row.fetchStatus,
      title: row.title,
      bodyLength: row.bodyLength,
      bodySha256: row.bodySha256,
      routeTermMatched: row.routeTermMatched,
      competitionTermMatched: row.competitionTermMatched
    });
  }
}

for (const row of alternative.rows || []) {
  if (["alternative_route_passed", "route_fetches_but_needs_rendered_or_parser_review"].includes(row.bestStatus)) {
    candidateRows.push({
      slug: row.slug,
      displayName: row.slug,
      sourceLane: row.bestStatus,
      url: row.bestUrl,
      finalUrl: row.bestFinalUrl,
      finalHost: row.bestFinalHost,
      fetchStatus: row.bestFetchStatus,
      title: row.bestTitle,
      bodyLength: row.bestBodyLength,
      bodySha256: (row.attempts || []).find(a => a.finalUrl === row.bestFinalUrl)?.bodySha256 || null,
      routeTermMatched: !(row.bestValidationBlocks || []).includes("route_terms_not_found"),
      competitionTermMatched: !(row.bestValidationBlocks || []).includes("competition_terms_not_found")
    });
  }
}

const dedup = new Map();
for (const row of candidateRows) {
  const key = row.slug;
  const existing = dedup.get(key);
  if (!existing) {
    dedup.set(key, row);
    continue;
  }
  const score = r => (r.sourceLane === "alternative_route_passed" ? 10 : 0) + (r.fetchStatus === 200 ? 5 : 0) + (r.bodyLength || 0) / 1000000;
  if (score(row) > score(existing)) dedup.set(key, row);
}

const rows = [...dedup.values()].map(row => {
  const gate = confidenceFor(row);
  return {
    ...row,
    batchIndex,
    routeIntent: gate.routeIntent,
    genericHomepage: gate.genericHomepage,
    identityConfidence: gate.confidence,
    identityBlocks: gate.blocks,
    parserPlanningAllowedNow: gate.confidence === "parser_ready",
    renderedReviewAllowedNow: gate.confidence === "rendered_or_parser_review",
    acceptedNow: false,
    productionWriteExecutedNow: false,
    truthAssertionExecutedNow: false,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false,
    evidenceSha256: shaText(JSON.stringify(row))
  };
}).sort((a, b) => {
  const order = { parser_ready: 0, rendered_or_parser_review: 1, rejected: 2 };
  return order[a.identityConfidence] - order[b.identityConfidence] || a.slug.localeCompare(b.slug);
});

const report = {
  status: "passed",
  runner: "bulk_batch_post_fetch_identity_gate",
  contractVersion: 1,
  batchIndex,
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  controlledFetchPath: rel(controlledFetchPath),
  alternativeProbePath: rel(alternativeProbePath),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    providerFetchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    batchIndex,
    inputCandidateCount: candidateRows.length,
    dedupedSlugCount: rows.length,
    parserReadyCount: rows.filter(row => row.identityConfidence === "parser_ready").length,
    renderedOrParserReviewCount: rows.filter(row => row.identityConfidence === "rendered_or_parser_review").length,
    rejectedCount: rows.filter(row => row.identityConfidence === "rejected").length,
    parserReadySlugs: rows.filter(row => row.identityConfidence === "parser_ready").map(row => row.slug),
    renderedOrParserReviewSlugs: rows.filter(row => row.identityConfidence === "rendered_or_parser_review").map(row => row.slug),
    rejectedSlugs: rows.filter(row => row.identityConfidence === "rejected").map(row => row.slug),
    acceptedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    nextRecommendedLane: "run parser/surface extraction planning only for parser_ready rows; rendered review rows require rendered adapter or stronger route proof"
  },
  rows,
  blocks: []
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
    sourceLane: row.sourceLane,
    fetchStatus: row.fetchStatus,
    finalHost: row.finalHost,
    finalUrl: row.finalUrl,
    title: row.title,
    routeIntent: row.routeIntent,
    genericHomepage: row.genericHomepage,
    identityConfidence: row.identityConfidence,
    identityBlocks: row.identityBlocks
  })),
  blocks: report.blocks
}, null, 2));
