#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import crypto from "node:crypto";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const allowRender = process.argv.includes("--allow-render");
if (!allowRender) throw new Error("Refusing browser rendering without --allow-render");

const browser = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
if (!fs.existsSync(browser)) throw new Error(`Chrome not found: ${browser}`);

const PACK_PATH = path.join(ROOT, "data", "football-truth", "_diagnostics", `bulk-official-rendered-expansion-board-${DATE}`, `bulk-rendered-cell-inspection-pack-${DATE}.jsonl`);
const OUT_DIR = path.join(ROOT, "data", "football-truth", "_diagnostics", `bulk-rendered-cell-shape-inspection-${DATE}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

function rel(p) { return path.relative(ROOT, p).replaceAll("\\", "/"); }
function readJsonl(p) {
  return fs.readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}
function sha256(s) { return crypto.createHash("sha256").update(s).digest("hex"); }
function cleanText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/\s+/g, " ")
    .trim();
}
function render(url, slug) {
  return new Promise((resolve) => {
    const args = [
      "--headless=new",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
      "--virtual-time-budget=12000",
      "--dump-dom",
      url
    ];
    const child = spawn(browser, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
    }, 45000);
    child.stdout.on("data", (d) => { stdout += d.toString("utf8"); });
    child.stderr.on("data", (d) => { stderr += d.toString("utf8"); });
    child.on("close", (code) => {
      clearTimeout(timer);
      const htmlPath = path.join(OUT_DIR, `${slug}-rendered.html`);
      const stderrPath = path.join(OUT_DIR, `${slug}-rendered.stderr.txt`);
      fs.writeFileSync(htmlPath, stdout, "utf8");
      fs.writeFileSync(stderrPath, stderr, "utf8");
      resolve({ code, html: stdout, stderr, htmlPath, stderrPath });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: -1, html: "", stderr: String(err.stack || err), htmlPath: null, stderrPath: null });
    });
  });
}
function parseTableShapes(html) {
  const tables = String(html || "").match(/<table\b[\s\S]*?<\/table>/gi) || [];
  return tables.map((table, tableIndex) => {
    const rowBlocks = table.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
    const rows = rowBlocks.slice(0, 8).map((rowHtml) => {
      const cells = [...rowHtml.matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
        .map((m) => cleanText(m[2]))
        .filter(Boolean);
      return cells.slice(0, 14);
    });
    const text = cleanText(table);
    const numericDensity = (text.match(/-?\d+/g) || []).length;
    return {
      tableIndex,
      tableLength: table.length,
      gridRowCount: rowBlocks.length,
      firstRows: rows,
      numericDensity,
      textPreview: text.slice(0, 700)
    };
  }).sort((a, b) => b.gridRowCount - a.gridRowCount || b.numericDensity - a.numericDensity || b.tableLength - a.tableLength);
}

if (!fs.existsSync(PACK_PATH)) throw new Error(`Missing inspection pack: ${PACK_PATH}`);

const pack = readJsonl(PACK_PATH).slice(0, 24);
const rows = [];
let browserRenderExecutedNowCount = 0;

for (const target of pack) {
  console.error(`RENDER_INSPECT ${target.rank} ${target.competitionSlug} ${target.sourceUrl}`);
  const rendered = await render(target.sourceUrl, target.competitionSlug);
  browserRenderExecutedNowCount++;
  const tableShapes = parseTableShapes(rendered.html);
  const hasExpectedRowCandidate = tableShapes.some((t) => Number(target.expectedRows || 0) > 0 && (t.gridRowCount === Number(target.expectedRows) + 1 || t.gridRowCount === Number(target.expectedRows)));
  const teamSignals = Array.isArray(target.expectedTeamSignals) ? target.expectedTeamSignals : [];
  const fullText = cleanText(rendered.html).toLowerCase();
  const expectedTeamSignalCount = teamSignals.filter((x) => fullText.includes(String(x).toLowerCase())).length;
  rows.push({
    rank: target.rank,
    competitionSlug: target.competitionSlug,
    competitionName: target.competitionName || null,
    sourceHost: target.sourceHost,
    sourceUrl: target.sourceUrl,
    expectedRows: target.expectedRows || null,
    renderExitCode: rendered.code,
    renderedByteCount: Buffer.byteLength(rendered.html),
    renderedSha256: sha256(rendered.html),
    renderedHtmlPath: rendered.htmlPath ? rel(rendered.htmlPath) : null,
    renderedStderrPath: rendered.stderrPath ? rel(rendered.stderrPath) : null,
    tableCount: tableShapes.length,
    topTableShapes: tableShapes.slice(0, 5),
    hasExpectedRowCandidate,
    expectedTeamSignalCount,
    inspectionStatus: rendered.code === 0 && Buffer.byteLength(rendered.html) > 10000 && tableShapes.length > 0
      ? "rendered_tables_found"
      : rendered.code === 0
        ? "rendered_no_table_or_low_content"
        : "render_failed",
    recommendedNextAction: hasExpectedRowCandidate || expectedTeamSignalCount > 0
      ? "build_native_or_family_parser_probe"
      : "route_or_currentness_review"
  });
}

const summary = {
  status: "passed",
  runner: "bulk_rendered_cell_shape_inspection",
  browser,
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  inspectedTargetCount: rows.length,
  renderedTablesFoundCount: rows.filter((r) => r.inspectionStatus === "rendered_tables_found").length,
  expectedRowCandidateCount: rows.filter((r) => r.hasExpectedRowCandidate).length,
  teamSignalPositiveCount: rows.filter((r) => r.expectedTeamSignalCount > 0).length,
  nativeParserProbeTargetCount: rows.filter((r) => r.recommendedNextAction === "build_native_or_family_parser_probe").length,
  recommendedNextLane: "build_bulk_native_parser_probe_for_targets_with_expected_row_or_team_signal"
};

const outPath = path.join(OUT_DIR, `bulk-rendered-cell-shape-inspection-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `bulk-rendered-cell-shape-inspection-rows-${DATE}.jsonl`);
fs.writeFileSync(outPath, JSON.stringify({ summary, rows }, null, 2) + "\n", "utf8");
fs.writeFileSync(rowsPath, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  summary
}, null, 2));
