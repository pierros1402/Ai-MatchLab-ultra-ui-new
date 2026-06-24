import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const args = new Set(process.argv.slice(2));

if (!args.has("--allow-browser-render")) {
  throw new Error("Refusing browser render without --allow-browser-render");
}

const OUT_DIR = path.join(ROOT, "data", "football-truth", "_diagnostics", `blocked-official-rendered-table-cell-inspection-${DATE}`);

const TARGETS = [
  {
    competitionSlug: "eng.1",
    familyId: "premierleague_official_rendered",
    seasonScopeCandidate: "previous_completed",
    seasonLabelCandidate: "2025-2026",
    sourceHost: "premierleague.com",
    sourceUrl: "https://www.premierleague.com/en/tables/premier-league/2025-26/all-matchweeks",
    expectedRows: 20,
    expectedTeamSignals: ["Arsenal", "Manchester City", "Liverpool", "Chelsea", "Tottenham", "Manchester United", "Newcastle", "Aston Villa"]
  },
  {
    competitionSlug: "eng.1",
    familyId: "premierleague_official_rendered",
    seasonScopeCandidate: "new_not_started_or_current_active",
    seasonLabelCandidate: "2026-2027",
    sourceHost: "premierleague.com",
    sourceUrl: "https://www.premierleague.com/en/tables/premier-league/2026-27/all-matchweeks",
    expectedRows: 20,
    expectedTeamSignals: ["Arsenal", "Manchester City", "Liverpool", "Chelsea", "Tottenham", "Manchester United", "Newcastle", "Aston Villa"]
  },
  {
    competitionSlug: "ita.1",
    familyId: "serie_a_official_rendered",
    seasonScopeCandidate: "previous_completed_or_current_active",
    seasonLabelCandidate: "2025-2026",
    sourceHost: "en.legaseriea.it",
    sourceUrl: "https://en.legaseriea.it/serie-a/standings",
    expectedRows: 20,
    expectedTeamSignals: ["Inter", "Milan", "Napoli", "Juventus", "Roma", "Lazio", "Atalanta", "Fiorentina", "Bologna"]
  },
  {
    competitionSlug: "ita.1",
    familyId: "serie_a_official_rendered",
    seasonScopeCandidate: "previous_completed_or_current_active",
    seasonLabelCandidate: "2025-2026",
    sourceHost: "www.legaseriea.it",
    sourceUrl: "https://www.legaseriea.it/serie-a/classifica",
    expectedRows: 20,
    expectedTeamSignals: ["Inter", "Milan", "Napoli", "Juventus", "Roma", "Lazio", "Atalanta", "Fiorentina", "Bologna"]
  }
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function rel(filePath) {
  return path.relative(ROOT, filePath).replaceAll("\\", "/");
}

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function stripTags(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function extractBlocks(html, tagName) {
  const re = new RegExp(`<${tagName}\\b[\\s\\S]*?<\\/${tagName}>`, "gi");
  return String(html || "").match(re) || [];
}

function extractRowsFromTable(tableHtml) {
  const rowBlocks = extractBlocks(tableHtml, "tr");
  return rowBlocks.map((rowHtml) => {
    const cellBlocks = rowHtml.match(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi) || [];
    return cellBlocks.map((cellHtml) => stripTags(cellHtml)).filter(Boolean);
  }).filter((row) => row.length > 0);
}

function numericCells(row) {
  return row.map((cell) => {
    const cleaned = String(cell).replace(/[^\d-]/g, "");
    if (!cleaned || cleaned === "-") return null;
    const parsed = Number.parseInt(cleaned, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }).filter((value) => value !== null);
}

function scoreTeamSignals(target, text) {
  const n = normalizeText(text);
  return (target.expectedTeamSignals || []).filter((signal) => n.includes(normalizeText(signal)));
}

function inspectTable(target, tableHtml, index) {
  const rows = extractRowsFromTable(tableHtml);
  const text = stripTags(tableHtml);
  const signals = scoreTeamSignals(target, text);
  const dataLikeRows = rows.filter((row) => {
    const nums = numericCells(row);
    return nums.length >= 4 && row.some((cell) => /[A-Za-zÀ-ž]/.test(cell));
  });
  const allNumericValues = dataLikeRows.flatMap((row) => numericCells(row));
  const zeroNumericCount = allNumericValues.filter((value) => value === 0).length;
  const positiveNumericCount = allNumericValues.filter((value) => value > 0).length;
  return {
    tableIndex: index,
    rowCount: rows.length,
    maxCellCount: rows.reduce((max, row) => Math.max(max, row.length), 0),
    teamSignalCount: signals.length,
    teamSignals: signals,
    dataLikeRowCount: dataLikeRows.length,
    zeroNumericCount,
    positiveNumericCount,
    allZeroLike: allNumericValues.length > 0 && positiveNumericCount === 0,
    firstRows: rows.slice(0, 8),
    bestDataLikeRows: dataLikeRows.slice(0, 8)
  };
}

function extractJsonScriptHints(html) {
  const scripts = extractBlocks(html, "script");
  return scripts.map((scriptHtml, index) => {
    const text = stripTags(scriptHtml);
    const raw = scriptHtml.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "");
    const lower = raw.toLowerCase();
    const score =
      (lower.includes("standings") ? 5 : 0) +
      (lower.includes("table") ? 2 : 0) +
      (lower.includes("team") ? 2 : 0) +
      (lower.includes("points") ? 3 : 0) +
      (lower.includes("rank") ? 2 : 0) +
      (lower.includes("__next_data__") ? 4 : 0);
    return {
      scriptIndex: index,
      score,
      length: raw.length,
      hasNextData: lower.includes("__next_data__"),
      hasStandings: lower.includes("standings"),
      hasPoints: lower.includes("points"),
      hasTeam: lower.includes("team"),
      snippet: text.slice(0, 500)
    };
  }).filter((hint) => hint.score > 0).sort((a, b) => b.score - a.score || b.length - a.length).slice(0, 20);
}

function renderWithChrome(chrome, target) {
  const result = spawnSync(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--disable-default-apps",
    "--hide-scrollbars",
    "--window-size=1600,2400",
    "--virtual-time-budget=12000",
    "--dump-dom",
    target.sourceUrl
  ], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 80 * 1024 * 1024
  });
  return {
    exitCode: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || ""
  };
}

function inspectRendered(target, rendered) {
  const html = rendered.stdout || "";
  const bodyText = stripTags(html);
  const tables = extractBlocks(html, "table");
  const tableInspections = tables.map((tableHtml, index) => inspectTable(target, tableHtml, index));
  const sortedTables = [...tableInspections].sort((a, b) =>
    b.teamSignalCount - a.teamSignalCount ||
    b.dataLikeRowCount - a.dataLikeRowCount ||
    b.positiveNumericCount - a.positiveNumericCount ||
    b.rowCount - a.rowCount
  );
  const bodySignals = scoreTeamSignals(target, bodyText);
  const seasonLabelMentions = {
    has2025_26: /2025[\s/-]*26|2025[\s/-]*2026/i.test(bodyText),
    has2026_27: /2026[\s/-]*27|2026[\s/-]*2027/i.test(bodyText)
  };
  return {
    competitionSlug: target.competitionSlug,
    familyId: target.familyId,
    sourceUrl: target.sourceUrl,
    sourceHost: target.sourceHost,
    seasonScopeCandidate: target.seasonScopeCandidate,
    seasonLabelCandidate: target.seasonLabelCandidate,
    expectedRows: target.expectedRows,
    browserExitCode: rendered.exitCode,
    stderrSnippet: rendered.stderr.slice(0, 1000),
    renderedHtmlLength: html.length,
    renderedTextLength: bodyText.length,
    tableCount: tables.length,
    bodyTeamSignalCount: bodySignals.length,
    bodyTeamSignals: bodySignals,
    seasonLabelMentions,
    bestTables: sortedTables.slice(0, 8),
    jsonScriptHints: extractJsonScriptHints(html),
    bodySnippet: bodyText.slice(0, 1200)
  };
}

async function main() {
  ensureDir(OUT_DIR);
  const chrome = chromePath();
  if (!chrome) throw new Error("Chrome/Edge executable not found");

  const inspections = [];
  for (const target of TARGETS) {
    console.log(`RENDER ${target.competitionSlug} ${target.sourceUrl}`);
    const rendered = renderWithChrome(chrome, target);
    inspections.push(inspectRendered(target, rendered));
  }

  const summary = {
    status: inspections.length === TARGETS.length ? "passed" : "failed",
    runner: "blocked_official_rendered_table_cell_inspection",
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    browserRenderExecutedNowCount: TARGETS.length,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    targetCount: TARGETS.length,
    inspectedCompetitionSlugs: [...new Set(TARGETS.map((target) => target.competitionSlug))],
    tableBearingTargetCount: inspections.filter((inspection) => inspection.tableCount > 0).length,
    teamSignalPositiveTargetCount: inspections.filter((inspection) => inspection.bodyTeamSignalCount > 0 || inspection.bestTables.some((table) => table.teamSignalCount > 0)).length,
    allZeroLikeBestTableTargetCount: inspections.filter((inspection) => inspection.bestTables[0]?.allZeroLike).length,
    recommendedNextLane: "review_blocked_rendered_inspection_then_promote_only_previous_completed_non_zero_verified_schema"
  };

  const outPath = path.join(OUT_DIR, `blocked-official-rendered-table-cell-inspection-${DATE}.json`);
  const jsonlPath = path.join(OUT_DIR, `blocked-official-rendered-table-cell-inspection-rows-${DATE}.jsonl`);
  fs.writeFileSync(outPath, JSON.stringify({ summary, inspections }, null, 2) + "\n", "utf8");
  fs.writeFileSync(jsonlPath, inspections.map((inspection) => JSON.stringify(inspection)).join("\n") + "\n", "utf8");

  console.log(JSON.stringify({
    output: rel(outPath),
    rowsOutput: rel(jsonlPath),
    summary
  }, null, 2));

  if (summary.status !== "passed") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
