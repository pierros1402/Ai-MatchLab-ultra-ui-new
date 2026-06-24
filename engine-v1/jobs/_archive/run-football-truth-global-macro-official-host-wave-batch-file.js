import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const allowFetch = process.argv.includes("--allow-fetch");
const batchId = process.argv.find(arg => arg.startsWith("--batch-id="))?.split("=")[1] || "global-macro-official-host-wave-001";

const planPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-macro-official-host-wave-plan-${today}`, `football-truth-global-macro-official-host-wave-plan-${today}.json`);
const planRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-macro-official-host-wave-plan-${today}`, `football-truth-global-macro-official-host-wave-plan-rows-${today}.jsonl`);

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-macro-official-host-wave-${batchId}-${today}`);
const outPath = path.join(outDir, `football-truth-global-macro-official-host-wave-${batchId}-${today}.json`);
const rowsPath = path.join(outDir, `football-truth-global-macro-official-host-wave-${batchId}-rows-${today}.jsonl`);

function rel(file) { return path.relative(root, file).replaceAll("\\", "/"); }
function parseJsonl(text) { return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }
function shaText(text) { return crypto.createHash("sha256").update(String(text || "")).digest("hex"); }
function stripHtml(value) { return String(value || "").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/\s+/g," ").trim(); }
function norm(value) { return stripHtml(value).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu,"").replace(/\s+/g," ").trim(); }
function titleOf(html) { const m=String(html||"").match(/<title[^>]*>([\s\S]*?)<\/title>/i); return stripHtml(m?.[1] || "").slice(0,180); }
function hostOf(url) { try { return new URL(url).host.toLowerCase().replace(/^www\./,""); } catch { return ""; } }
function uniq(values) { return [...new Set((values || []).filter(Boolean))]; }

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

function candidateRowsFromCells(cells) {
  const c = cells.map(stripHtml);
  const out = [];

  if (c.length >= 6) {
    const m = c[0].match(/^(\d+)[.\s]+(.+)$/);
    if (m) {
      out.push(withArithmetic({
        position: parseIntLoose(m[1]), teamName: m[2],
        played: parseIntLoose(c[1]), wins: parseIntLoose(c[2]), draws: parseIntLoose(c[3]), losses: parseIntLoose(c[4]), points: parseIntLoose(c[5])
      }, "position_team_combined_cell", c));
    }
  }

  if (c.length >= 10) {
    out.push(withArithmetic({
      position: parseIntLoose(c[0]), teamName: c[1],
      played: parseIntLoose(c[2]), wins: parseIntLoose(c[3]), draws: parseIntLoose(c[4]), losses: parseIntLoose(c[5]),
      goalsFor: parseIntLoose(c[6]), goalsAgainst: parseIntLoose(c[7]),
      goalDifference: parseSignedPrefix(c[8]), points: parseIntLoose(c[9])
    }, "pos_team_played_wdl_gf_ga_gd_pts", c));
  }

  if (c.length >= 8) {
    out.push(withArithmetic({
      position: parseIntLoose(c[0]), teamName: c[1],
      points: parseIntLoose(c[2]), played: parseIntLoose(c[3]), wins: parseIntLoose(c[4]), draws: parseIntLoose(c[5]), losses: parseIntLoose(c[6]),
      goalDifference: parseSignedPrefix(c[7])
    }, "pos_team_points_played_wdl_gd", c));
  }

  if (c.length >= 7) {
    out.push(withArithmetic({
      position: parseIntLoose(c[0]), teamName: c[1],
      played: parseIntLoose(c[2]), wins: parseIntLoose(c[3]), draws: parseIntLoose(c[4]), losses: parseIntLoose(c[5]), points: parseIntLoose(c[6])
    }, "pos_team_played_wdl_points", c));
  }

  if (c.length >= 4) {
    out.push(withArithmetic({
      position: parseIntLoose(c[0]), teamName: c[1],
      played: parseIntLoose(c[2]), points: parseIntLoose(c[3])
    }, "pos_team_played_points_only", c));
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

  let extractionStatus = "macro_no_extractable_table";
  if (parsedRows.length >= 8 && selected.duplicateTeamNameCount === 0 && selected.arithmeticPassedRowCount >= Math.ceil(parsedRows.length * 0.7) && maxPlayed != null && maxPlayed > 0) {
    extractionStatus = "macro_proof_shape_nonzero_candidate_after_review";
  } else if (parsedRows.length >= 8 && selected.duplicateTeamNameCount === 0 && allRowsZeroPlayed && allRowsZeroPoints) {
    extractionStatus = "macro_zero_played_start_date_lane";
  } else if (parsedRows.length >= 4) {
    extractionStatus = "macro_extraction_review_required";
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
    sampleParsedRows: parsedRows.slice(0, 8),
    parsedRows
  };
}

function routeScore(url, fetched) {
  const html = fetched.text || "";
  const finalUrl = fetched.response?.url || url;
  const text = `${finalUrl} ${titleOf(html)} ${stripHtml(html).slice(0, 60000)}`;
  const tableCount = (html.match(/<table\b/gi) || []).length;
  const trCount = (html.match(/<tr\b/gi) || []).length;
  const standingHints = (text.match(/standings|table|classification|classifica|clasificacion|posiciones|tabla|tabela|rank|points|pts|played|wins|draws|losses|league|division|tabelle/gi) || []).length;
  const fixtureHints = (text.match(/fixture|fixtures|schedule|calendar|calendario|results|matches|spielplan/gi) || []).length;
  const hasChallenge = /just a moment|captcha|access denied|forbidden/i.test(text.slice(0, 10000));
  const status = fetched.response?.status ?? null;

  let score = 0;
  if ((status ?? 0) >= 200 && (status ?? 0) < 400) score += 50;
  if (hasChallenge) score -= 200;
  score += Math.min(standingHints, 35) * 5;
  if (tableCount >= 1 && trCount >= 8) score += 80;
  if (/standings|table|tabelle|classement|clasificacion/i.test(finalUrl)) score += 45;
  if (fixtureHints >= 4 && standingHints < 8) score -= 25;
  return { score, tableCount, trCount, standingHints, fixtureHints, hasChallenge };
}

async function fetchWithTimeout(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; AI-MatchLab-FootballTruth/1.0; +macro-official-host-wave)",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.7",
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

const blocks = [];
if (!allowFetch) blocks.push("missing_allow_fetch");

const plan = JSON.parse(await fs.readFile(planPath, "utf8"));
const planRows = parseJsonl(await fs.readFile(planRowsPath, "utf8"));
if (plan.status !== "passed") blocks.push("plan_not_passed");

const batch = plan.batches?.find(b => b.batchId === batchId);
if (!batch) blocks.push("batch_missing");

const bySlug = new Map(planRows.map(row => [row.slug, row]));
const targets = (batch?.slugs || []).map(slug => bySlug.get(slug)).filter(Boolean);
if (targets.length !== (batch?.targetCount || 0)) blocks.push("target_count_mismatch");

const rows = [];
let fetchCount = 0;

if (allowFetch && blocks.length === 0) {
  let index = 0;
  for (const target of targets) {
    index += 1;
    console.log(`[${index}/${targets.length}] ${target.slug} urls=${target.plannedUrlCount}`);

    if (!target.plannedUrls?.length) {
      rows.push({
        slug: target.slug,
        displayName: target.displayName,
        macroFinalLane: "macro_missing_official_host_allowlist",
        plannedUrlCount: 0,
        fetchedUrlCount: 0,
        acceptedNow: false,
        canonicalWriteExecutedNow: false,
        lifecycleWriteExecutedNow: false,
        productionWriteExecutedNow: false,
        truthAssertionExecutedNow: false,
        rawPayloadCommitted: false,
        fullRawPayloadWritten: false
      });
      continue;
    }

    const fetchedRows = [];
    for (const url of target.plannedUrls) {
      const fetched = await fetchWithTimeout(url);
      fetchCount += 1;
      const score = routeScore(url, fetched);
      fetchedRows.push({
        url,
        finalUrl: fetched.response?.url || url,
        finalHost: hostOf(fetched.response?.url || url),
        fetchStatus: fetched.response?.status ?? null,
        title: titleOf(fetched.text || ""),
        bodyLength: (fetched.text || "").length,
        bodySha256: fetched.text ? shaText(fetched.text) : null,
        fetchError: fetched.error,
        timedOut: fetched.timedOut,
        ...score,
        text: fetched.text || ""
      });
    }

    const selected = [...fetchedRows].sort((a,b) => b.score - a.score || b.bodyLength - a.bodyLength)[0];
    let extraction = null;
    let macroFinalLane = "macro_official_route_fetch_failed_or_blocked";

    if (selected && (selected.fetchStatus ?? 0) >= 200 && (selected.fetchStatus ?? 0) < 400 && !selected.hasChallenge) {
      extraction = extractBestStandings(selected.text);
      macroFinalLane = extraction.extractionStatus;

      if (macroFinalLane === "macro_no_extractable_table" && selected.standingHints >= 15) {
        macroFinalLane = "macro_rendered_or_api_required";
      } else if (macroFinalLane === "macro_no_extractable_table" && selected.score >= 150) {
        macroFinalLane = "macro_surface_review_required";
      }
    }

    rows.push({
      slug: target.slug,
      displayName: target.displayName,
      plannedUrlCount: target.plannedUrlCount,
      fetchedUrlCount: fetchedRows.length,
      selectedUrl: selected?.url || null,
      selectedFinalUrl: selected?.finalUrl || null,
      selectedHost: selected?.finalHost || null,
      selectedFetchStatus: selected?.fetchStatus ?? null,
      selectedTitle: selected?.title || null,
      selectedScore: selected?.score ?? null,
      selectedTableCount: selected?.tableCount ?? 0,
      selectedTrCount: selected?.trCount ?? 0,
      selectedStandingHints: selected?.standingHints ?? 0,
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
      macroFinalLane,
      sampleParsedRows: extraction?.sampleParsedRows || [],
      acceptedNow: false,
      canonicalWriteExecutedNow: false,
      lifecycleWriteExecutedNow: false,
      productionWriteExecutedNow: false,
      truthAssertionExecutedNow: false,
      rawPayloadCommitted: false,
      fullRawPayloadWritten: false
    });
  }
}

const laneCounts = rows.reduce((acc, row) => {
  acc[row.macroFinalLane] = (acc[row.macroFinalLane || "unknown"] || 0) + 1;
  return acc;
}, {});

const report = {
  status: blocks.length ? "failed" : "passed",
  runner: "football_truth_global_macro_official_host_wave_batch",
  contractVersion: 1,
  batchId,
  generatedAt: new Date().toISOString(),
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  inputPlanPath: rel(planPath),
  inputPlanRowsPath: rel(planRowsPath),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: fetchCount,
    controlledOfficialHostFetchExecutedNowCount: fetchCount,
    canonicalWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    batchId,
    targetCount: targets.length,
    attemptedFetchCount: fetchCount,
    macroFinalLaneCounts: laneCounts,
    proofShapeNonzeroSlugs: rows.filter(row => row.macroFinalLane === "macro_proof_shape_nonzero_candidate_after_review").map(row => row.slug),
    zeroPlayedStartDateLaneSlugs: rows.filter(row => row.macroFinalLane === "macro_zero_played_start_date_lane").map(row => row.slug),
    extractionReviewRequiredSlugs: rows.filter(row => row.macroFinalLane === "macro_extraction_review_required").map(row => row.slug),
    renderedOrApiRequiredSlugs: rows.filter(row => row.macroFinalLane === "macro_rendered_or_api_required").map(row => row.slug),
    surfaceReviewRequiredSlugs: rows.filter(row => row.macroFinalLane === "macro_surface_review_required").map(row => row.slug),
    missingOfficialHostAllowlistSlugs: rows.filter(row => row.macroFinalLane === "macro_missing_official_host_allowlist").map(row => row.slug),
    blockedOrNoRouteSlugs: rows.filter(row => row.macroFinalLane === "macro_official_route_fetch_failed_or_blocked" || row.macroFinalLane === "macro_no_extractable_table").map(row => row.slug),
    acceptedNowCount: 0,
    nextRecommendedLane: "continue macro batches; do not run micro-gates until all macro batches are complete"
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
  blocks: report.blocks
}, null, 2));

if (blocks.length) process.exitCode = 1;
