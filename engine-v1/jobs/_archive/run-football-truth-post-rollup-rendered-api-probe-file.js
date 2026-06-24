import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const allowBrowser = process.argv.includes("--allow-browser-render");

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const actionPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-post-rollup-action-batch-${today}`, `football-truth-post-rollup-action-batch-${today}.json`);
const planRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-macro-official-host-wave-plan-${today}`, `football-truth-global-macro-official-host-wave-plan-rows-${today}.jsonl`);

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-post-rollup-rendered-api-probe-${today}`);
const outPath = path.join(outDir, `football-truth-post-rollup-rendered-api-probe-${today}.json`);
const rowsPath = path.join(outDir, `football-truth-post-rollup-rendered-api-probe-rows-${today}.jsonl`);

function rel(file) { return path.relative(root, file).replaceAll("\\", "/"); }
function parseJsonl(text) { return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }
function shaText(text) { return crypto.createHash("sha256").update(String(text || "")).digest("hex"); }
function stripHtml(value) { return String(value || "").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/\s+/g," ").trim(); }
function norm(value) { return stripHtml(value).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu,"").replace(/\s+/g," ").trim(); }
function titleOf(html) { const m=String(html||"").match(/<title[^>]*>([\s\S]*?)<\/title>/i); return stripHtml(m?.[1] || "").slice(0,180); }
function hostOf(url) { try { return new URL(url).host.toLowerCase().replace(/^www\./,""); } catch { return ""; } }
function uniq(values) { return [...new Set((values || []).filter(Boolean))]; }
function sorted(values) { return uniq(values).sort((a,b) => a.localeCompare(b)); }

function parseIntLoose(value) {
  const s = stripHtml(value).replace(/[^\d\-+]/g, "");
  if (!s || s === "-" || s === "+") return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function parseSignedPrefix(value) {
  const m = stripHtml(value).match(/[+\-]?\d+/);
  if (!m) return null;
  const n = Number.parseInt(m[0], 10);
  return Number.isFinite(n) ? n : null;
}

function withArithmetic(row, parsedBy, rawCells) {
  if (!row || !row.teamName || String(row.teamName).includes("{{")) return null;
  if (row.goalDifference == null && row.goalsFor != null && row.goalsAgainst != null) row.goalDifference = row.goalsFor - row.goalsAgainst;

  const playedOk = row.played != null && row.wins != null && row.draws != null && row.losses != null ? row.played === row.wins + row.draws + row.losses : null;
  const gdOk = row.goalsFor != null && row.goalsAgainst != null && row.goalDifference != null ? row.goalDifference === row.goalsFor - row.goalsAgainst : null;
  const ptsOk = row.wins != null && row.draws != null && row.points != null ? row.points === row.wins * 3 + row.draws : null;

  return {
    parsedBy,
    position: row.position,
    teamName: stripHtml(row.teamName),
    played: row.played,
    wins: row.wins,
    draws: row.draws,
    losses: row.losses,
    goalsFor: row.goalsFor ?? null,
    goalsAgainst: row.goalsAgainst ?? null,
    goalDifference: row.goalDifference ?? null,
    points: row.points,
    playedArithmeticPassed: playedOk,
    goalDifferenceArithmeticPassed: gdOk,
    pointsArithmeticPassed: ptsOk,
    arithmeticPassed: playedOk !== false && gdOk !== false && ptsOk !== false && (playedOk === true || gdOk === true || ptsOk === true),
    rawCells
  };
}

function extractTables(html) {
  const tables = [];
  const tableRx = /<table\b[\s\S]*?<\/table>/gi;
  let tm;
  while ((tm = tableRx.exec(html)) !== null) {
    const tableHtml = tm[0];
    const rows = [];
    const rowRx = /<tr\b[\s\S]*?<\/tr>/gi;
    let rm;
    while ((rm = rowRx.exec(tableHtml)) !== null) {
      const cells = [];
      const cellRx = /<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi;
      let cm;
      while ((cm = cellRx.exec(rm[0])) !== null) cells.push(stripHtml(cm[1]));
      if (cells.length) rows.push(cells);
    }
    tables.push({ tableIndex: tables.length, rows });
  }
  return tables;
}

function candidateRowsFromCells(cells) {
  const c = cells.map(stripHtml);
  const out = [];

  if (c.length >= 6) {
    const m = c[0].match(/^(\d+)[.\s]+(.+)$/);
    if (m) {
      out.push(withArithmetic({
        position: parseIntLoose(m[1]), teamName: m[2],
        played: parseIntLoose(c[1]), wins: parseIntLoose(c[2]), draws: parseIntLoose(c[3]), losses: parseIntLoose(c[4]), points: parseIntLoose(c[5])
      }, "rendered_position_team_combined_cell", c));
    }
  }

  if (c.length >= 10) {
    out.push(withArithmetic({
      position: parseIntLoose(c[0]), teamName: c[1],
      played: parseIntLoose(c[2]), wins: parseIntLoose(c[3]), draws: parseIntLoose(c[4]), losses: parseIntLoose(c[5]),
      goalsFor: parseIntLoose(c[6]), goalsAgainst: parseIntLoose(c[7]), goalDifference: parseSignedPrefix(c[8]), points: parseIntLoose(c[9])
    }, "rendered_pos_team_played_wdl_gf_ga_gd_pts", c));
  }

  if (c.length >= 8) {
    out.push(withArithmetic({
      position: parseIntLoose(c[0]), teamName: c[1],
      points: parseIntLoose(c[2]), played: parseIntLoose(c[3]), wins: parseIntLoose(c[4]), draws: parseIntLoose(c[5]), losses: parseIntLoose(c[6]),
      goalDifference: parseSignedPrefix(c[7])
    }, "rendered_pos_team_points_played_wdl_gd", c));
  }

  if (c.length >= 7) {
    out.push(withArithmetic({
      position: parseIntLoose(c[0]), teamName: c[1],
      played: parseIntLoose(c[2]), wins: parseIntLoose(c[3]), draws: parseIntLoose(c[4]), losses: parseIntLoose(c[5]), points: parseIntLoose(c[6])
    }, "rendered_pos_team_played_wdl_points", c));
  }

  if (c.length >= 4) {
    out.push(withArithmetic({
      position: parseIntLoose(c[0]), teamName: c[1],
      played: parseIntLoose(c[2]), points: parseIntLoose(c[3])
    }, "rendered_pos_team_played_points_only", c));
  }

  return out.filter(Boolean).sort((a,b) => Number(b.arithmeticPassed) - Number(a.arithmeticPassed))[0] || null;
}

function extractBestStandings(html) {
  const tables = extractTables(html);
  const tableCandidates = tables.map(table => {
    const rows = [];
    for (const cells of table.rows) {
      const parsed = candidateRowsFromCells(cells);
      if (parsed && parsed.teamName && parsed.teamName.length >= 2) rows.push(parsed);
    }

    const duplicateTeamNameCount = rows.length - new Set(rows.map(row => norm(row.teamName))).size;
    const arithmeticPassedRowCount = rows.filter(row => row.arithmeticPassed).length;
    const playedValues = rows.map(row => row.played).filter(v => v != null);
    const maxPlayed = playedValues.length ? Math.max(...playedValues) : null;
    const score = rows.length * 20 + arithmeticPassedRowCount * 30 - duplicateTeamNameCount * 60 + (maxPlayed && maxPlayed > 0 ? 40 : 0);

    return { tableIndex: table.tableIndex, tableRowCount: table.rows.length, parsedRows: rows, duplicateTeamNameCount, arithmeticPassedRowCount, score };
  }).sort((a,b) => b.score - a.score);

  const selected = tableCandidates[0] || { tableIndex:null, tableRowCount:0, parsedRows:[], duplicateTeamNameCount:0, arithmeticPassedRowCount:0, score:0 };
  const parsedRows = selected.parsedRows || [];
  const playedValues = parsedRows.map(row => row.played).filter(v => v != null);
  const pointsValues = parsedRows.map(row => row.points).filter(v => v != null);
  const minPlayed = playedValues.length ? Math.min(...playedValues) : null;
  const maxPlayed = playedValues.length ? Math.max(...playedValues) : null;
  const allRowsZeroPlayed = parsedRows.length > 0 && playedValues.length === parsedRows.length && playedValues.every(v => v === 0);
  const allRowsZeroPoints = parsedRows.length > 0 && pointsValues.length === parsedRows.length && pointsValues.every(v => v === 0);
  const arithmeticFailedRowCount = parsedRows.filter(row => row.arithmeticPassed === false).length;

  let extractionStatus = "rendered_no_extractable_table";
  if (parsedRows.length >= 8 && selected.duplicateTeamNameCount === 0 && selected.arithmeticPassedRowCount >= Math.ceil(parsedRows.length * 0.7) && maxPlayed != null && maxPlayed > 0) {
    extractionStatus = "rendered_proof_shape_nonzero_candidate_after_review";
  } else if (parsedRows.length >= 8 && selected.duplicateTeamNameCount === 0 && allRowsZeroPlayed && allRowsZeroPoints) {
    extractionStatus = "rendered_zero_played_start_date_lane";
  } else if (parsedRows.length >= 4) {
    extractionStatus = "rendered_extraction_review_required";
  }

  return {
    tableCount: tables.length,
    selectedTableIndex: selected.tableIndex,
    selectedTableRowCount: selected.tableRowCount,
    extractedStandingRowCount: parsedRows.length,
    arithmeticPassedRowCount: selected.arithmeticPassedRowCount,
    arithmeticFailedRowCount,
    duplicateTeamNameCount: selected.duplicateTeamNameCount,
    minPlayed,
    maxPlayed,
    allRowsZeroPlayed,
    allRowsZeroPoints,
    extractionStatus,
    sampleParsedRows: parsedRows.slice(0, 8)
  };
}

function routeScore(url, html, error) {
  const text = `${url} ${titleOf(html)} ${stripHtml(html).slice(0, 80000)}`;
  const tableCount = (html.match(/<table\b/gi) || []).length;
  const trCount = (html.match(/<tr\b/gi) || []).length;
  const standingHints = (text.match(/standings|table|classification|classifica|clasificacion|posiciones|tabla|tabela|rank|points|pts|played|wins|draws|losses|league|division|tabelle|competitions|ladder/gi) || []).length;
  const apiHints = (html.match(/api|graphql|standings|competition|leagueTable|tables|rankings/gi) || []).length;
  const fixtureHints = (text.match(/fixture|fixtures|schedule|calendar|calendario|results|matches|spielplan/gi) || []).length;
  const hasChallenge = /just a moment|captcha|access denied|forbidden/i.test(text.slice(0, 12000));
  let score = 0;
  if (!error) score += 50;
  if (hasChallenge) score -= 200;
  score += Math.min(standingHints, 40) * 5;
  score += Math.min(apiHints, 30) * 2;
  if (tableCount >= 1 && trCount >= 8) score += 100;
  if (/standings|table|tabelle|classement|clasificacion/i.test(url)) score += 55;
  if (fixtureHints >= 4 && standingHints < 8) score -= 20;
  return { score, tableCount, trCount, standingHints, apiHints, fixtureHints, hasChallenge };
}

async function renderDom(url) {
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-sync",
    "--metrics-recording-only",
    "--mute-audio",
    "--window-size=1440,1200",
    "--virtual-time-budget=9000",
    "--dump-dom",
    url
  ];
  try {
    const result = await execFileAsync(chromePath, args, { timeout: 22000, maxBuffer: 15 * 1024 * 1024 });
    return { html: result.stdout || "", stderr: result.stderr || "", error: null, timedOut: false };
  } catch (error) {
    return {
      html: error.stdout || "",
      stderr: error.stderr || "",
      error: String(error?.message || error),
      timedOut: String(error?.message || "").toLowerCase().includes("timed out")
    };
  }
}

await fs.mkdir(outDir, { recursive: true });

const blocks = [];
if (!allowBrowser) blocks.push("missing_allow_browser_render");
if (!fssync.existsSync(chromePath)) blocks.push("chrome_not_found");

const action = JSON.parse(await fs.readFile(actionPath, "utf8"));
const planRows = parseJsonl(await fs.readFile(planRowsPath, "utf8"));

if (action.status !== "passed") blocks.push("action_batch_not_passed");

const targetSlugs = sorted(action.summary?.renderedOrApiRequiredSlugs || []);
const expectedTargetSlugs = ["eng.4", "eng.5", "gha.2", "irl.2"];
if (JSON.stringify(targetSlugs) !== JSON.stringify(expectedTargetSlugs)) blocks.push("target_slug_set_mismatch");

const bySlug = new Map(planRows.map(row => [row.slug, row]));
const targets = targetSlugs.map(slug => bySlug.get(slug)).filter(Boolean);
if (targets.length !== 4) blocks.push("target_rows_not_4");

const rows = [];
let browserRenderCount = 0;

if (allowBrowser && blocks.length === 0) {
  let targetIndex = 0;
  for (const target of targets) {
    targetIndex += 1;
    console.log(`[${targetIndex}/${targets.length}] ${target.slug} renderedUrls=${target.plannedUrls.length}`);

    const renderedRows = [];
    for (const url of target.plannedUrls) {
      const rendered = await renderDom(url);
      browserRenderCount += 1;
      const score = routeScore(url, rendered.html, rendered.error);
      renderedRows.push({
        url,
        finalHost: hostOf(url),
        renderStatus: rendered.error ? "render_error_or_timeout" : "rendered",
        timedOut: rendered.timedOut,
        error: rendered.error,
        title: titleOf(rendered.html),
        domLength: rendered.html.length,
        domSha256: rendered.html ? shaText(rendered.html) : null,
        stderrLength: rendered.stderr.length,
        ...score,
        html: rendered.html
      });
    }

    const selected = [...renderedRows].sort((a,b) => b.score - a.score || b.domLength - a.domLength)[0];
    const extraction = selected?.html ? extractBestStandings(selected.html) : null;

    let renderedFinalLane = "rendered_route_failed_or_blocked";
    if (selected && selected.renderStatus === "rendered" && !selected.hasChallenge) {
      renderedFinalLane = extraction?.extractionStatus || "rendered_no_extractable_table";
      if (renderedFinalLane === "rendered_no_extractable_table" && (selected.apiHints >= 10 || selected.standingHints >= 15)) {
        renderedFinalLane = "rendered_or_api_surface_confirmed_no_table";
      }
    }

    rows.push({
      slug: target.slug,
      displayName: target.displayName,
      plannedUrlCount: target.plannedUrlCount,
      renderedUrlCount: renderedRows.length,
      selectedUrl: selected?.url || null,
      selectedHost: selected?.finalHost || null,
      selectedRenderStatus: selected?.renderStatus || null,
      selectedTimedOut: selected?.timedOut || false,
      selectedTitle: selected?.title || null,
      selectedScore: selected?.score ?? null,
      selectedDomLength: selected?.domLength ?? 0,
      selectedDomSha256: selected?.domSha256 || null,
      selectedTableCount: selected?.tableCount ?? 0,
      selectedTrCount: selected?.trCount ?? 0,
      selectedStandingHints: selected?.standingHints ?? 0,
      selectedApiHints: selected?.apiHints ?? 0,
      selectedFixtureHints: selected?.fixtureHints ?? 0,
      tableCount: extraction?.tableCount ?? 0,
      selectedTableIndex: extraction?.selectedTableIndex ?? null,
      selectedTableRowCount: extraction?.selectedTableRowCount ?? 0,
      extractedStandingRowCount: extraction?.extractedStandingRowCount ?? 0,
      arithmeticPassedRowCount: extraction?.arithmeticPassedRowCount ?? 0,
      arithmeticFailedRowCount: extraction?.arithmeticFailedRowCount ?? 0,
      duplicateTeamNameCount: extraction?.duplicateTeamNameCount ?? 0,
      minPlayed: extraction?.minPlayed ?? null,
      maxPlayed: extraction?.maxPlayed ?? null,
      allRowsZeroPlayed: extraction?.allRowsZeroPlayed ?? false,
      allRowsZeroPoints: extraction?.allRowsZeroPoints ?? false,
      renderedFinalLane,
      sampleParsedRows: extraction?.sampleParsedRows || [],
      acceptedNow: false,
      reviewOnlyCandidateWriteExecutedNow: false,
      canonicalWriteExecutedNow: false,
      lifecycleWriteExecutedNow: false,
      productionWriteExecutedNow: false,
      truthAssertionExecutedNow: false,
      rawPayloadCommitted: false,
      fullRawPayloadWritten: false
    });
  }
}

const renderedFinalLaneCounts = rows.reduce((acc, row) => {
  acc[row.renderedFinalLane] = (acc[row.renderedFinalLane] || 0) + 1;
  return acc;
}, {});

const report = {
  status: blocks.length ? "failed" : "passed",
  runner: "football_truth_post_rollup_rendered_api_probe",
  contractVersion: 1,
  generatedAt: new Date().toISOString(),
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  inputs: {
    actionPath: rel(actionPath),
    planRowsPath: rel(planRowsPath)
  },
  guardrails: {
    searchExecutedNowCount: 0,
    browserRenderExecutedNowCount: browserRenderCount,
    fetchExecutedNowCount: 0,
    reviewOnlyCandidateWriteExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    targetCount: targets.length,
    attemptedBrowserRenderCount: browserRenderCount,
    renderedFinalLaneCounts,
    renderedProofShapeNonzeroSlugs: rows.filter(row => row.renderedFinalLane === "rendered_proof_shape_nonzero_candidate_after_review").map(row => row.slug),
    renderedZeroPlayedStartDateLaneSlugs: rows.filter(row => row.renderedFinalLane === "rendered_zero_played_start_date_lane").map(row => row.slug),
    renderedExtractionReviewRequiredSlugs: rows.filter(row => row.renderedFinalLane === "rendered_extraction_review_required").map(row => row.slug),
    renderedOrApiSurfaceConfirmedNoTableSlugs: rows.filter(row => row.renderedFinalLane === "rendered_or_api_surface_confirmed_no_table").map(row => row.slug),
    renderedNoExtractableTableSlugs: rows.filter(row => row.renderedFinalLane === "rendered_no_extractable_table").map(row => row.slug),
    renderedRouteFailedOrBlockedSlugs: rows.filter(row => row.renderedFinalLane === "rendered_route_failed_or_blocked").map(row => row.slug),
    acceptedNowCount: 0,
    nextRecommendedLane: "if renderedProofShapeNonzeroSlugs exist, run bulk season/league review; otherwise park rendered/API queue and move to zero-played start-date evidence"
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
  rows: rows.map(row => ({
    slug: row.slug,
    renderedFinalLane: row.renderedFinalLane,
    selectedUrl: row.selectedUrl,
    selectedTitle: row.selectedTitle,
    selectedScore: row.selectedScore,
    selectedDomLength: row.selectedDomLength,
    selectedTableCount: row.selectedTableCount,
    selectedTrCount: row.selectedTrCount,
    selectedStandingHints: row.selectedStandingHints,
    selectedApiHints: row.selectedApiHints,
    extractedStandingRowCount: row.extractedStandingRowCount,
    arithmeticPassedRowCount: row.arithmeticPassedRowCount,
    duplicateTeamNameCount: row.duplicateTeamNameCount,
    minPlayed: row.minPlayed,
    maxPlayed: row.maxPlayed,
    sampleParsedRows: row.sampleParsedRows.slice(0, 3)
  })),
  blocks: report.blocks
}, null, 2));

if (blocks.length) process.exitCode = 1;
