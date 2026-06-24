import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const batchIndex = 1;
const pad = String(batchIndex).padStart(3, "0");

const extractionPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-html-table-extraction-diagnostic-${today}`, `bulk-batch-html-table-extraction-diagnostic-batch-${pad}-${today}.json`);
const extractionRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-html-table-extraction-diagnostic-${today}`, `bulk-batch-html-table-extraction-diagnostic-batch-${pad}-rows-${today}.jsonl`);

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-html-table-identity-gate-${today}`);
const outPath = path.join(outDir, `bulk-batch-html-table-identity-gate-batch-${pad}-${today}.json`);
const rowsPath = path.join(outDir, `bulk-batch-html-table-identity-gate-batch-${pad}-rows-${today}.jsonl`);

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function shaText(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

function norm(value) {
  return String(value || "").toLowerCase().normalize("NFKD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim();
}

function cellsText(rows) {
  return (rows || []).flatMap(row => row.cells || []).join(" ");
}

function numericPayloadRows(rows) {
  return (rows || []).filter(row => {
    const text = (row.cells || []).join(" ");
    const nums = text.match(/-?\d+/g) || [];
    return nums.length >= 5;
  });
}

function bodyRows(best) {
  return (best?.extractedRows || best?.sampleRows || []).filter(row => row.rowIndex !== 0);
}

function classifyTableIdentity(row) {
  const best = row.bestTable;
  if (!best) return { status: "rejected", reason: "no_best_table" };

  const sample = best.sampleRows || [];
  const extracted = best.extractedRows || sample;
  const body = bodyRows(best);
  const header = norm((sample[0]?.cells || []).join(" "));
  const all = norm(cellsText(sample));
  const title = norm(row.title);
  const numericRows = numericPayloadRows(extracted);
  const bodyNumericRows = numericPayloadRows(body);
  const bodyMaxCellCount = Math.max(0, ...body.map(r => (r.cells || []).length));
  const bodyCompactPayloadRows = body.filter(r => (r.cells || []).length <= 2 && ((r.cells || []).join(" ").match(/-?\d+/g) || []).length >= 6).length;

  const playerStatsHeader =
    /\bnome\b|\bcognome\b|\bassist\b|\bassist\b|\bgoalscorer\b|\bscorer\b|\bplayer\b|\bp\. giocate\b/.test(header) ||
    (/\bsquadra\b/.test(header) && /\bgoal\b/.test(header) && !/\bclub\b|\bplayed\b|\bwon\b|\bdrawn\b|\blost\b|\bgf\b|\bga\b|\bgd\b|\bpoints\b|\bpts\b/.test(header));

  const fixtureHeader = /data|rezultat|statistici|date|result|fixture|match|program/.test(header);
  const standingsHeader = /club|klub|team|squadra|pos|pl|played|spiele|won|drawn|lost|gf|ga|gd|pts|punkte|points|classifica|tabulka|clasament|position/.test(header) || /\bz\b.*\bv\b.*\br\b.*\bp\b/.test(header);
  const wideStandingShape = best.rowCount >= 8 && best.maxCellCount >= 8 && best.numericCellCount >= 35 && numericRows.length >= 8;
  const compactStandingShape = best.rowCount >= 8 && bodyCompactPayloadRows >= 8 && /tabulka|clasament|classifica|standing|tabelle/.test(title + " " + header);
  const fixtureShape = best.rowCount >= 8 && fixtureHeader && /rezultat|result|date|data|match|meciuri|statistici/.test(all);

  if (playerStatsHeader) return { status: "rejected", reason: "scorer_or_player_stats_table_not_standings" };
  if (standingsHeader && wideStandingShape) return { status: "standings_table_identity_passed", reason: "wide_numeric_standings_shape" };
  if (compactStandingShape) return { status: "custom_standings_parser_required", reason: "compact_team_plus_numbers_in_single_cell" };
  if (fixtureShape) return { status: "custom_fixture_parser_required", reason: "fixture_or_results_table_shape" };

  return { status: "rejected", reason: "table_identity_weak_or_wrong_competition_table", debug: { bodyMaxCellCount, bodyNumericRows: bodyNumericRows.length, bodyCompactPayloadRows } };
}

await fs.mkdir(outDir, { recursive: true });

const extraction = JSON.parse(await fs.readFile(extractionPath, "utf8"));
const extractionRows = parseJsonl(await fs.readFile(extractionRowsPath, "utf8"));
const blocks = [];

if (extraction.status !== "passed") blocks.push("extraction_diagnostic_not_passed");
if (extraction.summary?.targetCount !== 7) blocks.push("target_count_not_7");

const rows = extractionRows.map(row => {
  const identity = classifyTableIdentity(row);
  return {
    slug: row.slug,
    batchIndex,
    routeIntent: row.routeIntent,
    finalUrl: row.finalUrl,
    finalHost: row.finalHost,
    fetchStatus: row.fetchStatus,
    title: row.title,
    tableCount: row.tableCount,
    bestTableRowCount: row.bestTable?.rowCount || 0,
    bestTableMaxCellCount: row.bestTable?.maxCellCount || 0,
    bestTableNumericCellCount: row.bestTable?.numericCellCount || 0,
    bestTableTeamLikeCellCount: row.bestTable?.teamLikeCellCount || 0,
    originalExtractionStatus: row.extractionStatus,
    tableIdentityStatus: identity.status,
    tableIdentityReason: identity.reason,
    tableIdentityDebug: identity.debug || null,
    extractionProofPlanningAllowedNow: identity.status === "standings_table_identity_passed",
    customParserPlanningRequired: ["custom_standings_parser_required", "custom_fixture_parser_required"].includes(identity.status),
    rejectedForProofPlanning: identity.status === "rejected",
    sampleRows: row.bestTable?.sampleRows || [],
    acceptedNow: false,
    canonicalWriteExecutedNow: false,
    lifecycleWriteExecutedNow: false,
    productionWriteExecutedNow: false,
    truthAssertionExecutedNow: false,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false,
    evidenceSha256: shaText(JSON.stringify({ slug: row.slug, bestTable: row.bestTable, identity }))
  };
});

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "bulk_batch_html_table_identity_gate",
  contractVersion: 2,
  batchIndex,
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  extractionPath: rel(extractionPath),
  extractionRowsPath: rel(extractionRowsPath),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    providerFetchExecutedNowCount: 0,
    extractionWriteExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    batchIndex,
    inputRowCount: rows.length,
    extractionProofPlanningAllowedCount: rows.filter(row => row.extractionProofPlanningAllowedNow).length,
    customParserPlanningRequiredCount: rows.filter(row => row.customParserPlanningRequired).length,
    rejectedForProofPlanningCount: rows.filter(row => row.rejectedForProofPlanning).length,
    extractionProofPlanningAllowedSlugs: rows.filter(row => row.extractionProofPlanningAllowedNow).map(row => row.slug),
    customParserPlanningRequiredSlugs: rows.filter(row => row.customParserPlanningRequired).map(row => row.slug),
    rejectedForProofPlanningSlugs: rows.filter(row => row.rejectedForProofPlanning).map(row => row.slug),
    tableIdentityStatusCounts: rows.reduce((acc, row) => {
      acc[row.tableIdentityStatus] = (acc[row.tableIdentityStatus] || 0) + 1;
      return acc;
    }, {}),
    acceptedNowCount: 0,
    productionWriteAllowedNow: false,
    truthAssertionAllowedNow: false,
    nextRecommendedLane: "build extraction proof runner only for table-identity-passed slugs; custom parser rows need separate parser design; rejected rows return to route discovery/rendered/API handling"
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
    title: row.title,
    originalExtractionStatus: row.originalExtractionStatus,
    tableIdentityStatus: row.tableIdentityStatus,
    tableIdentityReason: row.tableIdentityReason,
    extractionProofPlanningAllowedNow: row.extractionProofPlanningAllowedNow,
    customParserPlanningRequired: row.customParserPlanningRequired,
    rejectedForProofPlanning: row.rejectedForProofPlanning,
    sampleRows: row.sampleRows.slice(0, 3)
  })),
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
