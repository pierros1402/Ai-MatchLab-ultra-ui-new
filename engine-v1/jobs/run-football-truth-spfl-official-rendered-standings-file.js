#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = path.join(ROOT, "data", "football-truth", "_diagnostics", `spfl-official-rendered-standings-${DATE}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

const CHROME_PATH = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const renderTimeoutMs = 45000;

const targets = [
  {
    competitionSlug: "sco.1",
    competitionName: "Scottish Premiership",
    seasonScope: "previous_completed",
    seasonLabel: "2025-2026",
    sourceHost: "spfl.co.uk",
    sourceUrl: "https://spfl.co.uk/league/premiership/table",
    expectedRowCount: 12
  },
  {
    competitionSlug: "sco.2",
    competitionName: "Scottish Championship",
    seasonScope: "previous_completed",
    seasonLabel: "2025-2026",
    sourceHost: "spfl.co.uk",
    sourceUrl: "https://spfl.co.uk/league/championship/table",
    expectedRowCount: 10
  }
];

function rel(p) {
  return path.relative(ROOT, p).replaceAll("\\", "/");
}

function htmlDecode(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

function stripHtml(s) {
  return htmlDecode(String(s || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function parseSignedInt(text) {
  const t = String(text || "").replace(/,/g, "").trim();
  if (!/^-?\d+$/.test(t)) return null;
  return Number(t);
}

function renderDom(url) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(CHROME_PATH)) {
      reject(new Error(`Chrome not found at ${CHROME_PATH}`));
      return;
    }

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

    const child = spawn(CHROME_PATH, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
      reject(new Error(`Chrome render timeout after ${renderTimeoutMs}ms for ${url}`));
    }, renderTimeoutMs);

    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(`Chrome exited ${code} for ${url}: ${stderr.slice(0, 1000)}`));
        return;
      }
      resolve({ dom: stdout, stderr, exitCode: code });
    });
  });
}

function parseTableRowsFromDom(dom, target) {
  const tableBlocks = String(dom || "").match(/<table\b[\s\S]*?<\/table>/gi) || [];
  const candidateTables = [];

  for (let tableIndex = 0; tableIndex < tableBlocks.length; tableIndex++) {
    const table = tableBlocks[tableIndex];
    const rowBlocks = table.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
    const parsedRows = [];

    for (const rowHtml of rowBlocks) {
      const cells = [...rowHtml.matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
        .map((m) => stripHtml(m[2]))
        .map((x) => x.replace(/\s+/g, " ").trim())
        .filter(Boolean);

      if (cells.length < 4) continue;

      const position = parseSignedInt(cells[0]);
      if (!Number.isInteger(position) || position < 1 || position > 30) continue;

      let teamIndex = -1;
      for (let i = 1; i < cells.length; i++) {
        const cell = cells[i];
        if (/[A-Za-zÀ-ž]/.test(cell) && parseSignedInt(cell) === null) {
          teamIndex = i;
          break;
        }
      }
      if (teamIndex < 0) continue;

      const teamName = cells[teamIndex]
        .replace(/\b(FC|F\.C\.)\b$/i, "FC")
        .replace(/\s+/g, " ")
        .trim();

      const numericCells = cells.slice(teamIndex + 1)
        .map((cell) => parseSignedInt(cell))
        .filter((n) => Number.isInteger(n));

      if (numericCells.length < 3) continue;

      let played = null;
      let won = null;
      let drawn = null;
      let lost = null;
      let goalDifference = null;
      let points = null;
      let parserMode = null;

      if (numericCells.length >= 6) {
        played = numericCells[0];
        won = numericCells[1];
        drawn = numericCells[2];
        lost = numericCells[3];
        goalDifference = numericCells[numericCells.length - 2];
        points = numericCells[numericCells.length - 1];
        parserMode = "full_pld_w_d_l_gd_pts";
      } else {
        played = numericCells[0];
        goalDifference = numericCells[numericCells.length - 2];
        points = numericCells[numericCells.length - 1];
        parserMode = "limited_pld_gd_pts";
      }

      parsedRows.push({
        competitionSlug: target.competitionSlug,
        competitionName: target.competitionName,
        seasonScope: target.seasonScope,
        seasonLabel: target.seasonLabel,
        seasonStartDate: null,
        seasonEndDate: null,
        nextSeasonStartDate: null,
        sourceHost: target.sourceHost,
        sourceUrl: target.sourceUrl,
        sourceFamily: "spfl_official_rendered",
        rowSource: "browser_rendered_official_spfl_table",
        tableIndex,
        parserMode,
        position,
        teamName,
        played,
        won,
        drawn,
        lost,
        goalDifference,
        points,
        rawCells: cells,
        acceptedAt: new Date().toISOString()
      });
    }

    candidateTables.push({
      tableIndex,
      parsedRowCount: parsedRows.length,
      parsedRows,
      tableTextPreview: stripHtml(table).slice(0, 1200)
    });
  }

  candidateTables.sort((a, b) => b.parsedRowCount - a.parsedRowCount || a.tableIndex - b.tableIndex);
  return candidateTables;
}

function verifyRows(rows, target) {
  const expectedRowCountPassed = rows.length === target.expectedRowCount;
  const positions = rows.map((r) => r.position).sort((a, b) => a - b);
  const positionsPassed = positions.length === target.expectedRowCount && positions.every((p, i) => p === i + 1);
  const numericShapePassed = rows.every((r) =>
    Number.isInteger(r.played) &&
    Number.isInteger(r.goalDifference) &&
    Number.isInteger(r.points) &&
    r.played >= 0 &&
    r.points >= 0
  );

  const fullRows = rows.filter((r) =>
    Number.isInteger(r.won) &&
    Number.isInteger(r.drawn) &&
    Number.isInteger(r.lost)
  );

  const arithmeticRowsPassed = fullRows.length > 0 && fullRows.every((r) =>
    r.played === r.won + r.drawn + r.lost &&
    r.points === r.won * 3 + r.drawn
  );

  const arithmeticGateStatus =
    arithmeticRowsPassed ? "passed_full_wdl_points_gate" :
    numericShapePassed ? "limited_columns_numeric_shape_gate_only" :
    "failed";

  const verified = expectedRowCountPassed && positionsPassed && numericShapePassed && arithmeticGateStatus !== "failed";

  return {
    verified,
    expectedRowCountPassed,
    positionsPassed,
    numericShapePassed,
    arithmeticRowsPassed,
    arithmeticGateStatus,
    fullArithmeticRowCount: fullRows.length,
    rowCount: rows.length,
    expectedRowCount: target.expectedRowCount
  };
}

const targetReports = [];
const acceptedRows = [];
let browserRenderExecutedNowCount = 0;

for (const target of targets) {
  console.error(`RENDER ${target.competitionSlug} ${target.sourceUrl}`);
  const rendered = await renderDom(target.sourceUrl);
  browserRenderExecutedNowCount++;

  const domPath = path.join(OUT_DIR, `rendered-dom-${target.competitionSlug}-${DATE}.html`);
  fs.writeFileSync(domPath, rendered.dom, "utf8");

  const candidateTables = parseTableRowsFromDom(rendered.dom, target);
  const bestTable = candidateTables[0] || { tableIndex: null, parsedRowCount: 0, parsedRows: [], tableTextPreview: "" };
  const verification = verifyRows(bestTable.parsedRows, target);

  if (verification.verified) {
    acceptedRows.push(...bestTable.parsedRows.map((row) => ({
      ...row,
      verificationStatus: "verified",
      arithmeticGateStatus: verification.arithmeticGateStatus,
      expectedRowCount: target.expectedRowCount
    })));
  }

  targetReports.push({
    competitionSlug: target.competitionSlug,
    competitionName: target.competitionName,
    sourceUrl: target.sourceUrl,
    expectedRowCount: target.expectedRowCount,
    renderedDomPath: rel(domPath),
    renderedDomByteCount: Buffer.byteLength(rendered.dom),
    tableCount: candidateTables.length,
    bestTableIndex: bestTable.tableIndex,
    bestTableParsedRowCount: bestTable.parsedRowCount,
    verification,
    bestTablePreview: bestTable.tableTextPreview,
    bestRowsPreview: bestTable.parsedRows.slice(0, 15)
  });
}

const verifiedTargetCount = targetReports.filter((r) => r.verification.verified).length;
const reviewTargetCount = targetReports.length - verifiedTargetCount;

const summary = {
  status: reviewTargetCount === 0 ? "passed" : "review",
  runner: "spfl_official_rendered_standings",
  sourceFamily: "spfl_official_rendered",
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  targetCount: targets.length,
  verifiedTargetCount,
  reviewTargetCount,
  acceptedRowCount: acceptedRows.length,
  verifiedCompetitionSlugs: targetReports.filter((r) => r.verification.verified).map((r) => r.competitionSlug),
  reviewCompetitionSlugs: targetReports.filter((r) => !r.verification.verified).map((r) => r.competitionSlug),
  arithmeticGateStatuses: Object.fromEntries(targetReports.map((r) => [r.competitionSlug, r.verification.arithmeticGateStatus])),
  recommendedNextLane: reviewTargetCount === 0
    ? "integrate_spfl_official_rendered_family_into_config_driven_browser_adapter_and_rerun_lifecycle_ledger"
    : "inspect_spfl_rendered_table_shape_before_integration"
};

const reportPath = path.join(OUT_DIR, `spfl-official-rendered-standings-report-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `spfl-official-rendered-standings-rows-${DATE}.jsonl`);

fs.writeFileSync(reportPath, JSON.stringify({ summary, targetReports }, null, 2) + "\n", "utf8");
fs.writeFileSync(rowsPath, acceptedRows.map((r) => JSON.stringify(r)).join("\n") + (acceptedRows.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(reportPath),
  rowsOutput: rel(rowsPath),
  summary
}, null, 2));
