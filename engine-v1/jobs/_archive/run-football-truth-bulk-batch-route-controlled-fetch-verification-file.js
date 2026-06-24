import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const batchArg = process.argv.find(arg => arg.startsWith("--batch="));
const batchIndex = Number(batchArg ? batchArg.split("=")[1] : 1);
const allowFetch = process.argv.includes("--allow-fetch");

const pad = String(batchIndex).padStart(3, "0");
const qualityPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-route-quality-board-${today}`, `bulk-batch-route-quality-board-batch-${pad}-${today}.json`);
const qualityRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-route-quality-board-${today}`, `bulk-batch-route-quality-board-batch-${pad}-rows-${today}.jsonl`);

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-route-controlled-fetch-verification-${today}`);
const outPath = path.join(outDir, `bulk-batch-route-controlled-fetch-verification-batch-${pad}-${today}.json`);
const rowsPath = path.join(outDir, `bulk-batch-route-controlled-fetch-verification-batch-${pad}-rows-${today}.jsonl`);

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function shaText(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

function hostOf(url) {
  try { return new URL(url).host.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

function routeTermsForKind(kind) {
  if (kind === "standings") {
    return /(standings|ranking|table|tabela|tabulka|tabelle|classifica|classificacao|clasament|puan|ladder|vatmologia|βαθμολογ|pos\.|played|points|pts|team)/i;
  }
  if (kind === "fixtures_or_results") {
    return /(fixtures|fixture|results|calendario|schedule|matches|match|spielplan|program|kampprogram|terminarz|zapasy|fikstur|round|date|home|away)/i;
  }
  return /(standings|fixtures|results|matches|table|ranking|schedule|team|club)/i;
}

function competitionTerms(slug) {
  const map = {
    "eng.2": /(championship|sky bet championship|efl)/i,
    "eng.3": /(league one|sky bet league one|efl)/i,
    "eng.4": /(league two|sky bet league two|efl)/i,
    "fra.1": /(ligue 1|ligue1)/i,
    "fra.2": /(ligue 2|ligue2)/i,
    "por.1": /(liga portugal|primeira)/i,
    "por.2": /(liga portugal 2|ligaportugal2|liga 2)/i,
    "bel.1": /(pro league|jupiler|belgian)/i,
    "bel.2": /(challenger pro league|challenger)/i,
    "aut.1": /(bundesliga|austrian)/i,
    "aut.2": /(2\. liga|2liga|zweite liga)/i,
    "sui.1": /(super league|superleague|swiss)/i,
    "sui.2": /(challenge league|challengeleague)/i,
    "pol.1": /(ekstraklasa)/i,
    "pol.2": /(1 liga|i liga|pierwsza liga)/i,
    "cze.1": /(chance liga|chanceliga|first league)/i,
    "tur.1": /(super lig|süper lig)/i,
    "tur.2": /(1\. lig|1 lig|birinci)/i,
    "gre.1": /(super league|slgr|stoiximan|σουπερ|βαθμολογ)/i,
    "gre.2": /(super league 2|sl2)/i,
    "usa.1": /(major league soccer|mls)/i,
    "usa.2": /(usl championship)/i,
    "mex.1": /(liga mx|ligamx)/i,
    "mex.2": /(expansion|expansión|ascenso)/i,
    "bra.1": /(serie a|série a|brasileiro)/i,
    "bra.2": /(serie b|série b|brasileiro)/i,
    "arg.1": /(liga profesional|primera)/i,
    "arg.2": /(primera nacional)/i,
    "kor.1": /(k league 1|kleague 1|k리그1)/i,
    "kor.2": /(k league 2|kleague 2|k리그2)/i,
    "aus.1": /(a-league men|a league men|aleague men)/i,
    "chn.1": /(super league|csl|chinese super league)/i,
    "chn.2": /(league one|china league one)/i,
    "jpn.2": /(j2|j\.league|j league)/i
  };
  return map[slug] || null;
}

function extractTitle(html) {
  const m = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  return m[1].replace(/\s+/g, " ").trim().slice(0, 180);
}

function truncateDiagnosticText(value, max = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

async function fetchWithTimeout(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; AI-MatchLab-FootballTruth/1.0; +controlled-verification)",
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

const quality = JSON.parse(await fs.readFile(qualityPath, "utf8"));
const qualityRows = parseJsonl(await fs.readFile(qualityRowsPath, "utf8"));

const blocks = [];
if (!allowFetch) blocks.push("missing_allow_fetch");
if (quality.status !== "passed") blocks.push("quality_board_not_passed");
if (quality.summary?.readyForControlledFetchVerificationCount !== 34) blocks.push("ready_count_not_34");

const targets = qualityRows.filter(row => row.routeQualityStatus === "ready_for_controlled_fetch_verification");
if (targets.length !== 34) blocks.push("target_count_not_34");

const rows = [];

if (allowFetch && blocks.length === 0) {
  let index = 0;
  for (const target of targets) {
    index += 1;
    console.log(`[${index}/${targets.length}] fetch ${target.slug} ${target.selectedUrl}`);

    const startedAt = new Date().toISOString();
    const fetched = await fetchWithTimeout(target.selectedUrl, 20000);
    const endedAt = new Date().toISOString();

    const status = fetched.response?.status ?? null;
    const finalUrl = fetched.response?.url || target.selectedUrl;
    const finalHost = hostOf(finalUrl);
    const contentType = fetched.response?.headers?.get("content-type") || null;
    const bodyLength = fetched.text.length;
    const bodySha256 = fetched.text ? shaText(fetched.text) : null;
    const title = extractTitle(fetched.text);

    const routeTermMatched = routeTermsForKind(target.selectedRouteKind).test(fetched.text);
    const competitionRegex = competitionTerms(target.slug);
    const competitionTermMatched = competitionRegex ? competitionRegex.test(fetched.text) || competitionRegex.test(finalUrl) || competitionRegex.test(title || "") : true;
    const hostMatched = finalHost === target.selectedHost || finalHost.endsWith(`.${target.selectedHost}`);

    const validationBlocks = [];
    if (fetched.error) validationBlocks.push("fetch_error");
    if (fetched.timedOut) validationBlocks.push("fetch_timeout");
    if (!(status >= 200 && status < 400)) validationBlocks.push("status_not_2xx_or_3xx");
    if (!hostMatched) validationBlocks.push("final_host_mismatch");
    if (bodyLength < 500) validationBlocks.push("body_too_short");
    if (!routeTermMatched) validationBlocks.push("route_terms_not_found");
    if (!competitionTermMatched) validationBlocks.push("competition_terms_not_found");

    rows.push({
      slug: target.slug,
      displayName: target.displayName,
      batchIndex,
      selectedUrl: target.selectedUrl,
      selectedHost: target.selectedHost,
      selectedRouteKind: target.selectedRouteKind,
      selectedEvidenceFile: target.selectedEvidenceFile,
      startedAt,
      endedAt,
      fetchStatus: status,
      finalUrl,
      finalHost,
      contentType,
      bodyLength,
      bodySha256,
      title: truncateDiagnosticText(title),
      fetchError: fetched.error,
      timedOut: fetched.timedOut,
      hostMatched,
      routeTermMatched,
      competitionTermMatched,
      validationPassed: validationBlocks.length === 0,
      validationBlocks,
      rawPayloadWritten: false,
      rawPayloadCommitted: false,
      productionWriteExecutedNow: false,
      truthAssertionExecutedNow: false
    });
  }
}

const passedRows = rows.filter(row => row.validationPassed);
const failedRows = rows.filter(row => !row.validationPassed);

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "bulk_batch_route_controlled_fetch_verification",
  contractVersion: 1,
  batchIndex,
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  qualityPath: rel(qualityPath),
  qualityRowsPath: rel(qualityRowsPath),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: rows.length,
    providerFetchExecutedNowCount: 0,
    controlledRouteFetchExecutedNowCount: rows.length,
    canonicalWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    batchIndex,
    attemptedFetchCount: rows.length,
    passedFetchVerificationCount: passedRows.length,
    failedFetchVerificationCount: failedRows.length,
    passedSlugs: passedRows.map(row => row.slug),
    failedSlugs: failedRows.map(row => row.slug),
    failedBlocksBySlug: Object.fromEntries(failedRows.map(row => [row.slug, row.validationBlocks])),
    acceptedNowCount: 0,
    productionWriteAllowedNow: false,
    truthAssertionAllowedNow: false,
    nextRecommendedLane: "review fetch verification results; successful rows may proceed to parser/proof extraction planning, failed rows go to route discovery"
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
    displayName: row.displayName,
    fetchStatus: row.fetchStatus,
    finalHost: row.finalHost,
    bodyLength: row.bodyLength,
    title: row.title,
    hostMatched: row.hostMatched,
    routeTermMatched: row.routeTermMatched,
    competitionTermMatched: row.competitionTermMatched,
    validationPassed: row.validationPassed,
    validationBlocks: row.validationBlocks
  })),
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
