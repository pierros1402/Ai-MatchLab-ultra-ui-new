import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const allowFetch = process.argv.includes("--allow-fetch");
const batchIndex = Number((process.argv.find(arg => arg.startsWith("--batch=")) || "--batch=2").split("=")[1]);
const pad = String(batchIndex).padStart(3, "0");

const probePath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-route-candidate-identity-surface-probe-${today}`, `bulk-batch-route-candidate-identity-surface-probe-batch-${pad}-${today}.json`);
const probeRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-route-candidate-identity-surface-probe-${today}`, `bulk-batch-route-candidate-identity-surface-probe-batch-${pad}-rows-${today}.jsonl`);

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-srb1-html-table-extraction-diagnostic-${today}`);
const outPath = path.join(outDir, `bulk-batch-srb1-html-table-extraction-diagnostic-batch-${pad}-${today}.json`);
const rowsPath = path.join(outDir, `bulk-batch-srb1-html-table-extraction-diagnostic-batch-${pad}-rows-${today}.jsonl`);

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function shaText(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripTags(value) {
  return decodeEntities(String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function titleOf(html) {
  const m = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return stripTags(m?.[1] || "").slice(0, 180);
}

function hostOf(url) {
  try { return new URL(url).host.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

function parseIntCell(value) {
  const cleaned = String(value || "").replace(/[^\d+-]/g, "");
  if (!/^[+-]?\d+$/.test(cleaned)) return null;
  return Number.parseInt(cleaned, 10);
}

function isIntCell(value) {
  return parseIntCell(value) !== null;
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
        "user-agent": "Mozilla/5.0 (compatible; AI-MatchLab-FootballTruth/1.0; +srb1-html-table-extraction-diagnostic)",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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

function parseTables(html) {
  const tableMatches = String(html || "").match(/<table\b[\s\S]*?<\/table>/gi) || [];
  const tables = [];

  for (let tableIndex = 0; tableIndex < tableMatches.length; tableIndex++) {
    const tableHtml = tableMatches[tableIndex];
    const rowMatches = tableHtml.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
    const parsedRows = [];

    for (let rowIndex = 0; rowIndex < rowMatches.length; rowIndex++) {
      const cellMatches = [...rowMatches[rowIndex].matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi)];
      const cells = cellMatches.map(match => stripTags(match[2])).filter(cell => cell.length > 0);
      if (cells.length > 0) parsedRows.push({ rowIndex, cells });
    }

    const headerText = (parsedRows[0]?.cells || []).join(" ");
    const numericCellCount = parsedRows.flatMap(row => row.cells).filter(isIntCell).length;
    const teamLikeCellCount = parsedRows.flatMap(row => row.cells).filter(cell => /[A-Za-zА-Яа-яČĆŽŠĐčćžšđ]/.test(cell) && cell.length >= 2 && cell.length <= 80).length;
    const standingsTermCount = (stripTags(tableHtml).match(/tabela|poz|tim|ekipa|klub|utak|pob|ner|por|gol|bod|pts|table|standings|mozzart|super liga/gi) || []).length;

    let score = 0;
    score += Math.min(parsedRows.length, 30) * 5;
    score += Math.min(numericCellCount, 160);
    score += Math.min(teamLikeCellCount, 80);
    score += standingsTermCount * 15;
    if (parsedRows.length >= 8) score += 80;
    if (parsedRows.some(row => row.cells.length >= 7)) score += 80;

    tables.push({
      tableIndex,
      rowCount: parsedRows.length,
      maxCellCount: Math.max(0, ...parsedRows.map(row => row.cells.length)),
      numericCellCount,
      teamLikeCellCount,
      standingsTermCount,
      score,
      rows: parsedRows,
      sampleRows: parsedRows.slice(0, 10)
    });
  }

  return tables.sort((a, b) => b.score - a.score || b.rowCount - a.rowCount);
}

function splitGoalCell(value) {
  const s = String(value || "").trim();
  const m = s.match(/^(\d+)\s*[:\-]\s*(\d+)$/);
  if (!m) return null;
  return [Number.parseInt(m[1], 10), Number.parseInt(m[2], 10)];
}

function parseStandingRows(table) {
  const rows = [];
  const body = table.rows.slice(1);

  for (const source of body) {
    const cells = source.cells;
    const numericCells = cells.map((cell, index) => ({ cell, index, value: parseIntCell(cell), goals: splitGoalCell(cell) }));

    let parsed = null;

    const splitGoalIndex = numericCells.findIndex(item => item.goals);
    if (splitGoalIndex >= 0) {
      const beforeGoal = numericCells.slice(0, splitGoalIndex).filter(item => item.value !== null);
      const afterGoal = numericCells.slice(splitGoalIndex + 1).filter(item => item.value !== null);
      if (beforeGoal.length >= 5 && afterGoal.length >= 1) {
        const position = beforeGoal[0]?.value ?? rows.length + 1;
        const played = beforeGoal[1]?.value ?? null;
        const wins = beforeGoal[2]?.value ?? null;
        const draws = beforeGoal[3]?.value ?? null;
        const losses = beforeGoal[4]?.value ?? null;
        const [goalsFor, goalsAgainst] = numericCells[splitGoalIndex].goals;
        const goalDifference = goalsFor - goalsAgainst;
        const points = afterGoal[afterGoal.length - 1].value;
        const teamName = cells.slice(0, numericCells[splitGoalIndex].index).filter(cell => !isIntCell(cell) && !/^-+$/.test(cell)).join(" ").replace(/\s+/g, " ").trim();
        parsed = { position, teamName, played, wins, draws, losses, goalsFor, goalsAgainst, goalDifference, points };
      }
    }

    if (!parsed) {
      const ints = numericCells.filter(item => item.value !== null);
      if (ints.length >= 8) {
        const fieldNums = ints.slice(-8);
        const positionNums = ints.slice(0, Math.max(0, ints.length - 8));
        const position = positionNums.length > 0 ? positionNums[0].value : rows.length + 1;
        const [played, wins, draws, losses, goalsFor, goalsAgainst, goalDifference, points] = fieldNums.map(item => item.value);
        const tailStart = fieldNums[0].index;
        const teamName = cells.slice(0, tailStart).filter((cell, index) => {
          const t = String(cell || "").trim();
          if (!t) return false;
          if (index === 0 && isIntCell(t)) return false;
          if (/^-+$/.test(t)) return false;
          return true;
        }).join(" ").replace(/\s+/g, " ").trim();
        parsed = { position, teamName, played, wins, draws, losses, goalsFor, goalsAgainst, goalDifference, points };
      }
    }

    if (!parsed || !parsed.teamName || parsed.teamName.length < 2) {
      continue;
    }

    const arithmeticBlocks = [];
    if (parsed.played !== parsed.wins + parsed.draws + parsed.losses) arithmeticBlocks.push("played_not_equal_wdl");
    if (parsed.goalDifference !== parsed.goalsFor - parsed.goalsAgainst) arithmeticBlocks.push("gd_not_equal_gf_minus_ga");
    if ([parsed.played, parsed.wins, parsed.draws, parsed.losses, parsed.goalsFor, parsed.goalsAgainst, parsed.points].some(v => typeof v !== "number" || v < 0)) arithmeticBlocks.push("bad_or_negative_numeric_stat");

    rows.push({
      slug: "srb.1",
      sourceRowIndex: source.rowIndex,
      position: parsed.position,
      teamName: parsed.teamName,
      played: parsed.played,
      wins: parsed.wins,
      draws: parsed.draws,
      losses: parsed.losses,
      goalsFor: parsed.goalsFor,
      goalsAgainst: parsed.goalsAgainst,
      goalDifference: parsed.goalDifference,
      points: parsed.points,
      arithmeticPassed: arithmeticBlocks.length === 0,
      arithmeticBlocks,
      sourceCells: cells
    });
  }

  return rows;
}

function classifyProof(rows) {
  const blocks = [];
  if (rows.length < 8) blocks.push("too_few_rows");
  if (rows.length > 20) blocks.push("too_many_rows");
  if (rows.some(row => !row.arithmeticPassed)) blocks.push("arithmetic_failed");
  if (new Set(rows.map(row => row.teamName.toLowerCase())).size !== rows.length) blocks.push("duplicate_team_names");
  if (rows.length > 0 && rows.every(row => row.played === 0)) blocks.push("all_rows_zero_played");
  if (rows.length > 0 && rows.every(row => row.points === 0)) blocks.push("all_rows_zero_points");
  return blocks;
}

await fs.mkdir(outDir, { recursive: true });

const probe = JSON.parse(await fs.readFile(probePath, "utf8"));
const probeRows = parseJsonl(await fs.readFile(probeRowsPath, "utf8"));
const blocks = [];

if (!allowFetch) blocks.push("missing_allow_fetch");
if (probe.status !== "passed") blocks.push("surface_probe_not_passed");
if (!probe.summary?.parserPlanningAllowedSlugs?.includes("srb.1")) blocks.push("srb1_not_parser_planning_allowed");

const target = probeRows.find(row => row.slug === "srb.1" && row.candidateSurfaceStatus === "candidate_surface_parser_planning_allowed");
if (!target) blocks.push("missing_srb1_target");

let row = null;

if (allowFetch && blocks.length === 0) {
  console.log(`[1/1] extract srb.1 ${target.finalUrl}`);
  const startedAt = new Date().toISOString();
  const fetched = await fetchWithTimeout(target.finalUrl, 20000);
  const endedAt = new Date().toISOString();

  const html = fetched.text || "";
  const tables = parseTables(html);
  const bestTable = tables[0] || null;
  const standingsRows = bestTable ? parseStandingRows(bestTable) : [];
  const validationBlocks = classifyProof(standingsRows);

  if (fetched.error) validationBlocks.push("fetch_error");
  if (fetched.timedOut) validationBlocks.push("fetch_timeout");
  if (!((fetched.response?.status ?? 0) >= 200 && (fetched.response?.status ?? 0) < 400)) validationBlocks.push("status_not_2xx_or_3xx");
  if (!bestTable) validationBlocks.push("no_table_selected");

  const zeroPlayedOnly = validationBlocks.includes("all_rows_zero_played") && validationBlocks.every(block => ["all_rows_zero_played", "all_rows_zero_points"].includes(block));

  const extractionDiagnosticStatus =
    validationBlocks.length === 0 ? "proof_shape_passed_nonzero_standings" :
    zeroPlayedOnly ? "proof_shape_passed_zero_played_table_needs_start_date_lane" :
    "proof_shape_needs_parser_review";

  const finalUrl = fetched.response?.url || target.finalUrl;

  row = {
    slug: "srb.1",
    batchIndex,
    inputUrl: target.finalUrl,
    finalUrl,
    finalHost: hostOf(finalUrl),
    fetchStatus: fetched.response?.status ?? null,
    contentType: fetched.response?.headers?.get("content-type") || null,
    title: titleOf(html),
    bodyLength: html.length,
    bodySha256: html ? shaText(html) : null,
    startedAt,
    endedAt,
    fetchError: fetched.error,
    timedOut: fetched.timedOut,
    tableCount: tables.length,
    selectedTableIndex: bestTable?.tableIndex ?? null,
    selectedTableRowCount: bestTable?.rowCount ?? 0,
    selectedTableMaxCellCount: bestTable?.maxCellCount ?? 0,
    selectedTableScore: bestTable?.score ?? 0,
    selectedTableSampleRows: bestTable?.sampleRows || [],
    extractedStandingRowCount: standingsRows.length,
    minPlayed: standingsRows.length ? Math.min(...standingsRows.map(r => r.played)) : null,
    maxPlayed: standingsRows.length ? Math.max(...standingsRows.map(r => r.played)) : null,
    arithmeticPassedRowCount: standingsRows.filter(r => r.arithmeticPassed).length,
    arithmeticFailedRowCount: standingsRows.filter(r => !r.arithmeticPassed).length,
    duplicateTeamNameCount: standingsRows.length - new Set(standingsRows.map(r => r.teamName.toLowerCase())).size,
    validationBlocks,
    extractionDiagnosticStatus,
    standingsRows,
    acceptedNow: false,
    canonicalWriteExecutedNow: false,
    lifecycleWriteExecutedNow: false,
    productionWriteExecutedNow: false,
    truthAssertionExecutedNow: false,
    rawPayloadWritten: false,
    rawPayloadCommitted: false
  };
}

const rows = row ? [row] : [];

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "bulk_batch_srb1_html_table_extraction_diagnostic",
  contractVersion: 1,
  batchIndex,
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  probePath: rel(probePath),
  probeRowsPath: rel(probeRowsPath),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: rows.length,
    controlledHtmlTableExtractionFetchExecutedNowCount: rows.length,
    canonicalWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    batchIndex,
    targetCount: target ? 1 : 0,
    attemptedFetchCount: rows.length,
    proofShapePassedNonzeroCount: rows.filter(r => r.extractionDiagnosticStatus === "proof_shape_passed_nonzero_standings").length,
    proofShapePassedZeroPlayedCount: rows.filter(r => r.extractionDiagnosticStatus === "proof_shape_passed_zero_played_table_needs_start_date_lane").length,
    parserReviewRequiredCount: rows.filter(r => r.extractionDiagnosticStatus === "proof_shape_needs_parser_review").length,
    proofShapePassedNonzeroSlugs: rows.filter(r => r.extractionDiagnosticStatus === "proof_shape_passed_nonzero_standings").map(r => r.slug),
    proofShapePassedZeroPlayedSlugs: rows.filter(r => r.extractionDiagnosticStatus === "proof_shape_passed_zero_played_table_needs_start_date_lane").map(r => r.slug),
    parserReviewRequiredSlugs: rows.filter(r => r.extractionDiagnosticStatus === "proof_shape_needs_parser_review").map(r => r.slug),
    validationBlocksBySlug: Object.fromEntries(rows.map(r => [r.slug, r.validationBlocks])),
    acceptedNowCount: 0,
    productionWriteAllowedNow: false,
    truthAssertionAllowedNow: false,
    nextRecommendedLane: "inspect diagnostic output; if proof shape passes, verify and build approval board; otherwise build custom parser review"
  },
  rows,
  blocks
};

await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsPath, rows.map(r => JSON.stringify(r)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  guardrails: report.guardrails,
  summary: report.summary,
  rows: report.rows.map(r => ({
    slug: r.slug,
    fetchStatus: r.fetchStatus,
    title: r.title,
    tableCount: r.tableCount,
    selectedTableRowCount: r.selectedTableRowCount,
    selectedTableMaxCellCount: r.selectedTableMaxCellCount,
    extractedStandingRowCount: r.extractedStandingRowCount,
    minPlayed: r.minPlayed,
    maxPlayed: r.maxPlayed,
    arithmeticPassedRowCount: r.arithmeticPassedRowCount,
    arithmeticFailedRowCount: r.arithmeticFailedRowCount,
    duplicateTeamNameCount: r.duplicateTeamNameCount,
    extractionDiagnosticStatus: r.extractionDiagnosticStatus,
    validationBlocks: r.validationBlocks,
    selectedTableSampleRows: r.selectedTableSampleRows.slice(0, 6),
    sampleStandingsRows: r.standingsRows.slice(0, 6).map(s => ({
      position: s.position,
      teamName: s.teamName,
      played: s.played,
      wins: s.wins,
      draws: s.draws,
      losses: s.losses,
      goalsFor: s.goalsFor,
      goalsAgainst: s.goalsAgainst,
      goalDifference: s.goalDifference,
      points: s.points,
      arithmeticPassed: s.arithmeticPassed,
      arithmeticBlocks: s.arithmeticBlocks
    }))
  })),
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
