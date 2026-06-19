import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const minerPath = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `official-host-asset-api-route-miner-${today}`,
  `official-host-asset-api-route-miner-${today}.json`
);

const minerRowsPath = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `official-host-asset-api-route-miner-${today}`,
  `official-host-asset-api-route-miner-rows-${today}.jsonl`
);

const outputDir = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `official-host-asset-api-route-miner-review-board-${today}`
);

const outputPath = path.join(outputDir, `official-host-asset-api-route-miner-review-board-${today}.json`);
const rowsOutputPath = path.join(outputDir, `official-host-asset-api-route-miner-review-board-rows-${today}.jsonl`);

const strictRouteTerms = [
  "standings", "standing", "table", "tables", "tabelle", "tabell", "tabela",
  "tabla", "classement", "classificacao", "classificação", "ranking", "rankings",
  "ladder", "league-table", "estadisticahistorica", "tablaGeneral", "classifica"
];

const strictApiTerms = [
  "/api/", "/graphql", "/wp-json", "/ajax", "/rest/", "/_next/data/",
  ".json", "format=json", "type=json", "application/json"
];

const contentNoiseTerms = [
  "/posts/", "/post/", "/news/", "/noticias/", "/articles/", "/article/",
  "/blog/", "/pages/", "campeones", "efemerides", "messi", "seleccion",
  "futsal", "paraguay", "pekerman", "america-19"
];

const templateNoiseTerms = [
  "${", "%7b", "%7d", "getlogo", "undefined", "[object", "/#"
];

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function safeUrlParts(value) {
  try {
    const u = new URL(String(value || ""));
    return {
      href: u.href,
      host: u.hostname.replace(/^www\./, "").toLowerCase(),
      path: decodeURIComponent(u.pathname || "/").toLowerCase(),
      search: (u.search || "").toLowerCase()
    };
  } catch {
    return { href: String(value || ""), host: "", path: String(value || "").toLowerCase(), search: "" };
  }
}

function includesAny(text, terms) {
  const lower = String(text || "").toLowerCase();
  return terms.some(term => lower.includes(term.toLowerCase()));
}

function classifyStrict(row) {
  const parts = safeUrlParts(row.candidateUrl);
  const sourceParts = safeUrlParts(row.sourceUrl);
  const urlText = `${parts.path} ${parts.search} ${parts.href}`.toLowerCase();

  const sameHost = row.sameHost === true || parts.host === sourceParts.host || parts.host.endsWith(`.${sourceParts.host}`);
  const strictApi = includesAny(urlText, strictApiTerms);
  const strictRoute = includesAny(`${parts.path} ${parts.search}`, strictRouteTerms);
  const scriptAsset = /\.js(?:\?|$)/i.test(parts.href);
  const jsonAsset = /\.json(?:\?|$)/i.test(parts.href) || strictApi;
  const contentNoise = includesAny(urlText, contentNoiseTerms);
  const templateNoise = includesAny(urlText, templateNoiseTerms);
  const staticNoise = /\.(png|jpg|jpeg|svg|webp|gif|css|woff2?|ttf|ico|pdf)(?:\?|$)/i.test(parts.href);
  const homepage = parts.path === "/" || parts.path === "" || ["/de", "/en", "/es", "/el"].includes(parts.path.replace(/\/+$/g, ""));

  let strictScore = 0;
  const strictSignals = [];

  if (sameHost) { strictScore += 30; strictSignals.push("same_official_host_family"); }
  if (strictApi) { strictScore += 45; strictSignals.push("strict_api_or_json_pattern"); }
  if (jsonAsset) { strictScore += 25; strictSignals.push("json_or_api_asset"); }
  if (scriptAsset) { strictScore += 28; strictSignals.push("script_asset"); }
  if (strictRoute) { strictScore += 35; strictSignals.push("strict_route_keyword"); }
  if (parts.href.includes("2025")) { strictScore += 18; strictSignals.push("season_2025_in_url"); }
  if (row.routeHit === true) { strictScore += 8; strictSignals.push("miner_route_hit"); }
  if (row.apiHit === true && strictApi) { strictScore += 8; strictSignals.push("miner_api_hit_confirmed"); }

  if (homepage) { strictScore -= 30; strictSignals.push("homepage_penalty"); }
  if (contentNoise) { strictScore -= 55; strictSignals.push("content_or_news_noise"); }
  if (templateNoise) { strictScore -= 70; strictSignals.push("template_placeholder_noise"); }
  if (staticNoise) { strictScore -= 80; strictSignals.push("static_asset_noise"); }
  if (!sameHost) { strictScore -= 30; strictSignals.push("external_host_penalty"); }

  let strictType = "park";
  if (jsonAsset && strictScore >= 70 && !contentNoise && !templateNoise && !staticNoise) {
    strictType = "endpoint_inspection_candidate";
  } else if (scriptAsset && strictScore >= 58 && !staticNoise) {
    strictType = "script_inspection_candidate";
  } else if (strictRoute && strictScore >= 60 && !contentNoise && !templateNoise && !staticNoise) {
    strictType = "route_inspection_candidate";
  }

  return {
    strictType,
    strictScore,
    strictSignals,
    sameHost,
    strictApi,
    strictRoute,
    scriptAsset,
    jsonAsset,
    contentNoise,
    templateNoise,
    staticNoise,
    homepage,
    reviewOnly: true,
    acceptanceAllowedNow: false
  };
}

await fs.mkdir(outputDir, { recursive: true });

const miner = JSON.parse(await fs.readFile(minerPath, "utf8"));
const rows = parseJsonl(await fs.readFile(minerRowsPath, "utf8"));

const deduped = new Map();
for (const row of rows) {
  if (!row.candidateUrl) continue;
  const strict = classifyStrict(row);
  const key = `${row.slug}|${row.candidateUrl}`;
  const enriched = {
    slug: row.slug,
    sourceLeague: row.sourceLeague,
    sourceUrl: row.sourceUrl,
    sourceStatus: row.sourceStatus,
    sourceFetchOk: row.sourceFetchOk,
    sourceTitleHint: row.sourceTitleHint,
    candidateUrl: row.candidateUrl,
    candidateHost: row.candidateHost,
    minerCandidateType: row.candidateType,
    minerScore: row.score,
    minerSignals: row.signals,
    routeHit: row.routeHit,
    apiHit: row.apiHit,
    ...strict
  };

  const previous = deduped.get(key);
  if (!previous || enriched.strictScore > previous.strictScore) {
    deduped.set(key, enriched);
  }
}

const reviewRows = [...deduped.values()]
  .sort((a, b) => b.strictScore - a.strictScore || a.slug.localeCompare(b.slug) || a.candidateUrl.localeCompare(b.candidateUrl));

const actionableRows = reviewRows.filter(row => row.strictType !== "park");

const selectedInspectionTargets = [];
const perSlugCount = new Map();
const perSlugTypeCount = new Map();

for (const row of actionableRows) {
  if (selectedInspectionTargets.length >= 36) break;

  const slugCount = perSlugCount.get(row.slug) || 0;
  const slugTypeKey = `${row.slug}|${row.strictType}`;
  const slugTypeCount = perSlugTypeCount.get(slugTypeKey) || 0;

  if (slugCount >= 3) continue;
  if (slugTypeCount >= 2) continue;

  perSlugCount.set(row.slug, slugCount + 1);
  perSlugTypeCount.set(slugTypeKey, slugTypeCount + 1);

  selectedInspectionTargets.push({
    slug: row.slug,
    sourceLeague: row.sourceLeague,
    strictType: row.strictType,
    candidateUrl: row.candidateUrl,
    strictScore: row.strictScore,
    strictSignals: row.strictSignals,
    minerCandidateType: row.minerCandidateType,
    minerScore: row.minerScore
  });
}

const bySlug = {};
for (const slug of [...new Set(reviewRows.map(row => row.slug))].sort()) {
  const slugRows = reviewRows.filter(row => row.slug === slug);
  bySlug[slug] = {
    reviewedCandidateCount: slugRows.length,
    actionableCandidateCount: slugRows.filter(row => row.strictType !== "park").length,
    endpointInspectionCandidateCount: slugRows.filter(row => row.strictType === "endpoint_inspection_candidate").length,
    scriptInspectionCandidateCount: slugRows.filter(row => row.strictType === "script_inspection_candidate").length,
    routeInspectionCandidateCount: slugRows.filter(row => row.strictType === "route_inspection_candidate").length,
    topRows: slugRows.slice(0, 8).map(row => ({
      strictType: row.strictType,
      candidateUrl: row.candidateUrl,
      strictScore: row.strictScore,
      strictSignals: row.strictSignals,
      minerCandidateType: row.minerCandidateType,
      minerScore: row.minerScore
    }))
  };
}

const report = {
  status: "passed",
  runner: "official_host_asset_api_route_miner_review_board",
  contractVersion: 1,
  purpose: "Strict review over official-host asset/API miner results. Removes content/news/template/static noise and enforces diversity across slugs before endpoint/script inspection.",
  inputMinerPath: path.relative(root, minerPath).replaceAll("\\", "/"),
  inputMinerRowsPath: path.relative(root, minerRowsPath).replaceAll("\\", "/"),
  inputMinerSha256: await sha256(minerPath),
  inputMinerRowsSha256: await sha256(minerRowsPath),
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
  sourceMinerSummary: miner.summary,
  summary: {
    minedCandidateRowCount: rows.length,
    reviewedUniqueCandidateCount: reviewRows.length,
    sourceMinerActionableCandidateCount: miner.summary.actionableCandidateCount,
    strictActionableCandidateCount: actionableRows.length,
    strictActionableSlugCount: new Set(actionableRows.map(row => row.slug)).size,
    endpointInspectionCandidateCount: actionableRows.filter(row => row.strictType === "endpoint_inspection_candidate").length,
    scriptInspectionCandidateCount: actionableRows.filter(row => row.strictType === "script_inspection_candidate").length,
    routeInspectionCandidateCount: actionableRows.filter(row => row.strictType === "route_inspection_candidate").length,
    noiseParkedCount: reviewRows.filter(row => row.strictType === "park").length,
    selectedInspectionTargetCount: selectedInspectionTargets.length,
    selectedInspectionSlugCount: new Set(selectedInspectionTargets.map(row => row.slug)).size,
    selectedInspectionTargets,
    acceptedNowCount: 0
  },
  recommendation: {
    nextLane: "Run bounded endpoint/script/route inspection only for selectedInspectionTargets. Do not use the noisy miner selectedNextTargets. Do not accept rows until extraction validates exact previous_completed standings with row-count/team/arithmetic gates.",
    selectedInspectionTargets
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
