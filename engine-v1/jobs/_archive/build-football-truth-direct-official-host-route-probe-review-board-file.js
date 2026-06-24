import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const inputDir = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `direct-official-host-previous-completed-route-probe-${today}`
);

const inputPath = path.join(inputDir, `direct-official-host-previous-completed-route-probe-${today}.json`);
const inputRowsPath = path.join(inputDir, `direct-official-host-previous-completed-route-probe-rows-${today}.jsonl`);

const outputDir = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `direct-official-host-route-probe-review-board-${today}`
);

const outputPath = path.join(outputDir, `direct-official-host-route-probe-review-board-${today}.json`);
const rowsOutputPath = path.join(outputDir, `direct-official-host-route-probe-review-board-rows-${today}.jsonl`);

const explicitRouteTerms = [
  "standings", "standing", "table", "tables", "tabelle", "tabell", "tabela",
  "tabla", "classement", "classificacao", "classificação", "ranking", "rankings",
  "ladder", "estadistica", "estadisticahistorica", "tablaGeneral", "competicoes",
  "competition", "classifica"
];

const parkedHosts = new Set(["cbf.com.br", "tff.org"]);

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function safeUrlParts(value) {
  try {
    const u = new URL(value);
    return {
      href: u.href,
      host: u.hostname.replace(/^www\./, "").toLowerCase(),
      path: decodeURIComponent(u.pathname || "/").toLowerCase(),
      search: u.search || ""
    };
  } catch {
    return { href: String(value || ""), host: "", path: "", search: "" };
  }
}

function hasExplicitRoutePath(row) {
  const finalParts = safeUrlParts(row.finalUrl || row.url);
  const originalParts = safeUrlParts(row.url);
  const pathText = `${finalParts.path} ${finalParts.search} ${originalParts.path} ${originalParts.search}`.toLowerCase();

  return explicitRouteTerms.some(term => pathText.includes(term.toLowerCase()));
}

function isHomepage(row) {
  const finalParts = safeUrlParts(row.finalUrl || row.url);
  const p = finalParts.path.replace(/\/+$/g, "") || "/";
  return p === "/" || p === "/de" || p === "/en" || p === "/el" || p === "/es" || p === "/index.do";
}

function scoreStrict(row) {
  const signals = Array.isArray(row.signals) ? row.signals : [];
  const explicitRoutePath = hasExplicitRoutePath(row);
  const homepage = isHomepage(row);
  const http2xx = row.status >= 200 && row.status < 300;
  const expectedOfficialHost = signals.includes("expected_official_host");
  const tableEvidence = Number(row.tableTagCount || 0) >= 1 && Number(row.rowTagCount || 0) >= 10;
  const strongTableEvidence = Number(row.tableTagCount || 0) >= 2 && Number(row.rowTagCount || 0) >= 20;
  const standingWord = row.standingWordHit === true || signals.includes("standing_word_hit");
  const seasonHit = row.seasonHit === true || signals.includes("season_2025_hit");

  let score = 0;
  const strictSignals = [];

  if (http2xx) { score += 35; strictSignals.push("http_2xx"); }
  if (expectedOfficialHost) { score += 30; strictSignals.push("expected_official_host"); }
  if (explicitRoutePath) { score += 45; strictSignals.push("explicit_standings_route_path"); }
  if (standingWord) { score += 15; strictSignals.push("standing_word"); }
  if (seasonHit) { score += 10; strictSignals.push("season_2025"); }
  if (tableEvidence) { score += 20; strictSignals.push("table_and_row_evidence"); }
  if (strongTableEvidence) { score += 15; strictSignals.push("strong_table_and_row_evidence"); }
  if (Number(row.termHitCount || 0) >= 2) { score += 8; strictSignals.push("multi_term_hit"); }
  if (homepage) { score -= 35; strictSignals.push("homepage_penalty"); }
  if (parkedHosts.has(row.host)) { score -= 25; strictSignals.push("host_fetch_blocked_or_zero_status_family"); }
  if (!http2xx) { score -= 40; strictSignals.push("not_http_2xx"); }

  const explicitRouteCandidate = http2xx && expectedOfficialHost && explicitRoutePath && score >= 80;
  const renderedHomepageCandidate = http2xx && expectedOfficialHost && homepage && strongTableEvidence && score >= 60;
  const extractorCandidate = explicitRouteCandidate && (strongTableEvidence || Number(row.rowTagCount || 0) >= 20);
  const browserRenderCandidate = explicitRouteCandidate && !extractorCandidate;

  let action = "park";
  if (extractorCandidate) action = "html_extractor_probe_candidate";
  else if (browserRenderCandidate) action = "browser_render_probe_candidate";
  else if (renderedHomepageCandidate) action = "homepage_embedded_table_review_only";

  return {
    strictScore: score,
    strictSignals,
    explicitRoutePath,
    homepage,
    tableEvidence,
    strongTableEvidence,
    explicitRouteCandidate,
    renderedHomepageCandidate,
    extractorCandidate,
    browserRenderCandidate,
    action
  };
}

await fs.mkdir(outputDir, { recursive: true });

const input = JSON.parse(await fs.readFile(inputPath, "utf8"));
const rows = parseJsonl(await fs.readFile(inputRowsPath, "utf8"));

const deduped = new Map();
for (const row of rows) {
  const keyParts = safeUrlParts(row.finalUrl || row.url);
  const key = `${row.slug}|${keyParts.href || row.finalUrl || row.url}`;
  const strict = scoreStrict(row);
  const enriched = {
    slug: row.slug,
    league: row.league,
    url: row.url,
    finalUrl: row.finalUrl,
    status: row.status,
    host: row.host,
    title: row.title,
    candidateScore: row.candidateScore,
    tableTagCount: row.tableTagCount,
    rowTagCount: row.rowTagCount,
    termHitCount: row.termHitCount,
    standingWordHit: row.standingWordHit,
    seasonHit: row.seasonHit,
    originalRouteProbeCandidate: row.routeProbeCandidate,
    acceptanceAllowedNow: false,
    reviewOnly: true,
    ...strict
  };

  const previous = deduped.get(key);
  if (!previous || enriched.strictScore > previous.strictScore) {
    deduped.set(key, enriched);
  }
}

const reviewRows = [...deduped.values()]
  .sort((a, b) => b.strictScore - a.strictScore || a.slug.localeCompare(b.slug) || a.finalUrl.localeCompare(b.finalUrl));

const actionableRows = reviewRows.filter(row =>
  row.action === "html_extractor_probe_candidate" ||
  row.action === "browser_render_probe_candidate"
);

const selectedBySlug = new Map();
for (const row of actionableRows) {
  if (!selectedBySlug.has(row.slug)) selectedBySlug.set(row.slug, row);
}

const selectedExtractorTargets = [...selectedBySlug.values()].slice(0, 12).map(row => ({
  slug: row.slug,
  league: row.league,
  action: row.action,
  url: row.finalUrl || row.url,
  strictScore: row.strictScore,
  title: row.title,
  tableTagCount: row.tableTagCount,
  rowTagCount: row.rowTagCount,
  strictSignals: row.strictSignals
}));

const bySlug = {};
for (const slug of [...new Set(reviewRows.map(row => row.slug))]) {
  const slugRows = reviewRows.filter(row => row.slug === slug);
  bySlug[slug] = {
    reviewedUniqueUrlCount: slugRows.length,
    actionableRouteCount: slugRows.filter(row => row.explicitRouteCandidate).length,
    extractorCandidateCount: slugRows.filter(row => row.extractorCandidate).length,
    browserRenderCandidateCount: slugRows.filter(row => row.browserRenderCandidate).length,
    homepageEmbeddedReviewOnlyCount: slugRows.filter(row => row.renderedHomepageCandidate).length,
    topRows: slugRows.slice(0, 5).map(row => ({
      action: row.action,
      url: row.finalUrl || row.url,
      status: row.status,
      title: row.title,
      strictScore: row.strictScore,
      strictSignals: row.strictSignals,
      tableTagCount: row.tableTagCount,
      rowTagCount: row.rowTagCount
    }))
  };
}

const report = {
  status: "passed",
  runner: "direct_official_host_route_probe_review_board",
  contractVersion: 1,
  purpose: "Strict review board over direct official-host route probe results. Separates actionable explicit route candidates from broad homepage false positives. No new fetch/search/write execution.",
  inputPath: path.relative(root, inputPath).replaceAll("\\", "/"),
  inputRowsPath: path.relative(root, inputRowsPath).replaceAll("\\", "/"),
  inputSha256: await sha256(inputPath),
  inputRowsSha256: await sha256(inputRowsPath),
  output: path.relative(root, outputPath).replaceAll("\\", "/"),
  rowsOutput: path.relative(root, rowsOutputPath).replaceAll("\\", "/"),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  sourceProbeSummary: input.summary,
  summary: {
    reviewedRawRowCount: rows.length,
    reviewedUniqueUrlCount: reviewRows.length,
    originalBroadRouteProbeCandidateCount: rows.filter(row => row.routeProbeCandidate).length,
    strictActionableRouteCandidateCount: actionableRows.length,
    strictActionableSlugCount: new Set(actionableRows.map(row => row.slug)).size,
    htmlExtractorProbeCandidateCount: actionableRows.filter(row => row.action === "html_extractor_probe_candidate").length,
    browserRenderProbeCandidateCount: actionableRows.filter(row => row.action === "browser_render_probe_candidate").length,
    homepageEmbeddedReviewOnlyCount: reviewRows.filter(row => row.action === "homepage_embedded_table_review_only").length,
    acceptedNowCount: 0,
    selectedExtractorTargets
  },
  recommendation: {
    nextLane: "Build a controlled extractor/render probe only for selectedExtractorTargets. Do not continue search-engine batches. Do not accept rows until exact competition identity, previous_completed season label, expected row count, team signals, arithmetic, non-trivial, and duplicate gates pass.",
    selectedExtractorTargets
  },
  bySlug
};

await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsOutputPath, reviewRows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  guardrails: report.guardrails,
  summary: report.summary,
  recommendation: report.recommendation
}, null, 2));
