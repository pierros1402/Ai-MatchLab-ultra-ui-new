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
  `official-host-proof-target-board-${today}`
);

const outputPath = path.join(outputDir, `official-host-proof-target-board-${today}.json`);
const rowsOutputPath = path.join(outputDir, `official-host-proof-target-board-rows-${today}.jsonl`);

const proofRouteTerms = [
  "standings", "standing", "table", "tables", "tabelle", "tabell", "tabela",
  "tabla", "classement", "classifica", "classificacao", "classificação",
  "ranking", "rankings", "ladder", "league-table", "estadisticahistorica"
];

const badGenericEndpointPatterns = [
  "/wp-json/",
  "/wp-json/oembed/",
  "/manifest.json",
  "/favicons",
  "/getnewslist",
  "/api/_content",
  "/api/custom/live",
  "/mundial/posiciones.json"
];

const contentNoisePatterns = [
  "/posts/", "/post/", "/news/", "/noticias/", "/articles/", "/article/",
  "/blog/", "/pages/", "messi", "futsal", "efemerides", "pekerman",
  "campeones", "paraguay", "america-19", "${", "%7b", "%7d", "getlogo"
];

const slugSpecificRejects = [
  { slug: "arg.2", includes: "www.afa.com.ar/standings/" },
  { slug: "sui.1", includes: "challengeleague-classement" },
  { slug: "usa.1", includes: "/standings/2026/" }
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

function hasAny(text, terms) {
  const lower = String(text || "").toLowerCase();
  return terms.some(term => lower.includes(term.toLowerCase()));
}

function classifyProof(row) {
  const parts = safeUrlParts(row.candidateUrl);
  const sourceParts = safeUrlParts(row.sourceUrl);
  const urlText = `${parts.href} ${parts.path} ${parts.search}`.toLowerCase();

  const sameHost = row.sameHost === true || parts.host === sourceParts.host || parts.host.endsWith(`.${sourceParts.host}`);
  const routeTerm = hasAny(`${parts.path} ${parts.search}`, proofRouteTerms);
  const scriptAsset = /\.js(?:\?|$)/i.test(parts.href);
  const jsonOrApiAsset = /\.json(?:\?|$)/i.test(parts.href) || parts.path.includes("/api/");
  const apiRankLike = jsonOrApiAsset && hasAny(`${parts.path} ${parts.search}`, ["rank", "ranking", "stand", "table", "classifica", "clubrank"]);
  const season2025 = parts.href.includes("2025");
  const season2026Only = parts.href.includes("2026") && !parts.href.includes("2025");
  const genericEndpointNoise = hasAny(urlText, badGenericEndpointPatterns);
  const contentNoise = hasAny(urlText, contentNoisePatterns);
  const staticNoise = /\.(png|jpg|jpeg|svg|webp|gif|css|woff2?|ttf|ico|pdf)(?:\?|$)/i.test(parts.href);
  const slugReject = slugSpecificRejects.some(rule => row.slug === rule.slug && urlText.includes(rule.includes));

  let proofScore = 0;
  const proofSignals = [];

  if (sameHost) { proofScore += 35; proofSignals.push("same_official_host_family"); }
  if (routeTerm) { proofScore += 45; proofSignals.push("standings_route_term"); }
  if (scriptAsset && routeTerm) { proofScore += 35; proofSignals.push("standings_script_asset"); }
  if (apiRankLike) { proofScore += 40; proofSignals.push("rank_or_table_api_endpoint"); }
  if (season2025) { proofScore += 25; proofSignals.push("season_2025_in_url"); }
  if (row.minerCandidateType === "route_candidate") { proofScore += 12; proofSignals.push("miner_route_candidate"); }
  if (row.minerCandidateType === "script_asset_candidate") { proofScore += 12; proofSignals.push("miner_script_candidate"); }
  if (row.minerCandidateType === "api_or_json_candidate" && apiRankLike) { proofScore += 12; proofSignals.push("miner_api_confirmed_by_rank_path"); }

  if (genericEndpointNoise) { proofScore -= 70; proofSignals.push("generic_endpoint_noise"); }
  if (contentNoise) { proofScore -= 70; proofSignals.push("content_or_template_noise"); }
  if (staticNoise) { proofScore -= 90; proofSignals.push("static_asset_noise"); }
  if (season2026Only) { proofScore -= 55; proofSignals.push("season_2026_current_or_next_noise"); }
  if (slugReject) { proofScore -= 90; proofSignals.push("slug_specific_false_positive"); }
  if (!sameHost) { proofScore -= 35; proofSignals.push("external_host_penalty"); }

  let proofType = "park";
  let proofPriority = 99;

  if (sameHost && routeTerm && season2025 && !scriptAsset && !genericEndpointNoise && !contentNoise && !staticNoise && !slugReject) {
    proofType = "season_route_extraction_probe";
    proofPriority = 1;
  } else if (sameHost && scriptAsset && routeTerm && !genericEndpointNoise && !contentNoise && !staticNoise && !slugReject) {
    proofType = "standings_script_endpoint_probe";
    proofPriority = 2;
  } else if (sameHost && routeTerm && !season2026Only && !genericEndpointNoise && !contentNoise && !staticNoise && !slugReject) {
    proofType = "standings_route_render_probe";
    proofPriority = 3;
  } else if (sameHost && apiRankLike && !genericEndpointNoise && !contentNoise && !staticNoise && !slugReject) {
    proofType = "rank_api_probe";
    proofPriority = 4;
  }

  if (proofScore < 65) {
    proofType = "park";
    proofPriority = 99;
  }

  return {
    proofType,
    proofPriority,
    proofScore,
    proofSignals,
    sameHost,
    routeTerm,
    scriptAsset,
    jsonOrApiAsset,
    apiRankLike,
    season2025,
    season2026Only,
    genericEndpointNoise,
    contentNoise,
    staticNoise,
    slugReject,
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

  const proof = classifyProof(row);
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
    ...proof
  };

  const key = `${enriched.slug}|${enriched.candidateUrl}`;
  const previous = deduped.get(key);
  if (!previous || enriched.proofScore > previous.proofScore) {
    deduped.set(key, enriched);
  }
}

const proofRows = [...deduped.values()]
  .sort((a, b) =>
    a.proofPriority - b.proofPriority ||
    b.proofScore - a.proofScore ||
    a.slug.localeCompare(b.slug) ||
    a.candidateUrl.localeCompare(b.candidateUrl)
  );

const actionableRows = proofRows.filter(row => row.proofType !== "park");

const selectedProofTargets = [];
const perSlugCount = new Map();
const perSlugTypeCount = new Map();

for (const row of actionableRows) {
  if (selectedProofTargets.length >= 32) break;

  const slugCount = perSlugCount.get(row.slug) || 0;
  const slugTypeKey = `${row.slug}|${row.proofType}`;
  const slugTypeCount = perSlugTypeCount.get(slugTypeKey) || 0;

  if (slugCount >= 3) continue;
  if (slugTypeCount >= 2) continue;

  perSlugCount.set(row.slug, slugCount + 1);
  perSlugTypeCount.set(slugTypeKey, slugTypeCount + 1);

  selectedProofTargets.push({
    slug: row.slug,
    sourceLeague: row.sourceLeague,
    proofType: row.proofType,
    candidateUrl: row.candidateUrl,
    proofScore: row.proofScore,
    proofSignals: row.proofSignals,
    minerCandidateType: row.minerCandidateType,
    minerScore: row.minerScore
  });
}

const bySlug = {};
for (const slug of [...new Set(proofRows.map(row => row.slug))].sort()) {
  const slugRows = proofRows.filter(row => row.slug === slug);
  bySlug[slug] = {
    reviewedCandidateCount: slugRows.length,
    proofCandidateCount: slugRows.filter(row => row.proofType !== "park").length,
    seasonRouteExtractionProbeCount: slugRows.filter(row => row.proofType === "season_route_extraction_probe").length,
    standingsScriptEndpointProbeCount: slugRows.filter(row => row.proofType === "standings_script_endpoint_probe").length,
    standingsRouteRenderProbeCount: slugRows.filter(row => row.proofType === "standings_route_render_probe").length,
    rankApiProbeCount: slugRows.filter(row => row.proofType === "rank_api_probe").length,
    parkedCount: slugRows.filter(row => row.proofType === "park").length,
    selectedCount: selectedProofTargets.filter(row => row.slug === slug).length,
    topRows: slugRows.slice(0, 8).map(row => ({
      proofType: row.proofType,
      candidateUrl: row.candidateUrl,
      proofScore: row.proofScore,
      proofSignals: row.proofSignals,
      minerCandidateType: row.minerCandidateType,
      minerScore: row.minerScore
    }))
  };
}

const report = {
  status: "passed",
  runner: "official_host_proof_target_board",
  contractVersion: 1,
  purpose: "Strict proof-target board over asset/API miner results. Prefers season routes, standings scripts, standings routes, and rank/table APIs; parks generic wp-json/manifest/content/static/current-season noise.",
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
    reviewedUniqueCandidateCount: proofRows.length,
    sourceMinerActionableCandidateCount: miner.summary.actionableCandidateCount,
    proofCandidateCount: actionableRows.length,
    proofCandidateSlugCount: new Set(actionableRows.map(row => row.slug)).size,
    seasonRouteExtractionProbeCount: actionableRows.filter(row => row.proofType === "season_route_extraction_probe").length,
    standingsScriptEndpointProbeCount: actionableRows.filter(row => row.proofType === "standings_script_endpoint_probe").length,
    standingsRouteRenderProbeCount: actionableRows.filter(row => row.proofType === "standings_route_render_probe").length,
    rankApiProbeCount: actionableRows.filter(row => row.proofType === "rank_api_probe").length,
    parkedNoiseCount: proofRows.filter(row => row.proofType === "park").length,
    selectedProofTargetCount: selectedProofTargets.length,
    selectedProofSlugCount: new Set(selectedProofTargets.map(row => row.slug)).size,
    selectedProofTargets,
    acceptedNowCount: 0
  },
  recommendation: {
    nextLane: "Run bounded proof inspection only for selectedProofTargets. Do not inspect generic wp-json/manifest/content endpoints. Do not accept rows until exact previous_completed season table extraction passes row-count/team/arithmetic gates.",
    selectedProofTargets
  },
  bySlug
};

await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsOutputPath, proofRows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  guardrails: report.guardrails,
  summary: report.summary,
  recommendation: report.recommendation
}, null, 2));
