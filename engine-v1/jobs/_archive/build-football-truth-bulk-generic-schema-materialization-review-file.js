import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const DATA_ROOT = path.join(ROOT, "data", "football-truth");
const DIAG_ROOT = path.join(DATA_ROOT, "_diagnostics");
const OUT_DIR = path.join(DIAG_ROOT, `bulk-generic-schema-materialization-review-${DATE}`);
const args = new Set(process.argv.slice(2));

if (!args.has("--allow-browser-render")) throw new Error("Refusing browser render without --allow-browser-render");

const CHROME_TIMEOUT_MS = Number(process.env.BULK_GENERIC_MATERIALIZATION_CHROME_TIMEOUT_MS || "25000");

const EXPECTED_ROWS = {
  "aut.2": 16,
  "jpn.1": 20,
  "jpn.2": 20,
  "sui.1": 12,
  "sui.2": 10,
  "swe.1": 16,
  "usa.1": 30
};

const TEAM_SIGNALS = {
  "aut.2": ["Austria Lustenau", "Admira", "St. Polten", "Liefering"],
  "jpn.1": ["Kashima", "Urawa", "Yokohama", "Kawasaki", "Gamba"],
  "jpn.2": ["Consadole", "Vegalta", "JEF", "V-Varen", "Montedio"],
  "sui.1": ["Basel", "Young Boys", "Zurich", "Luzern", "Servette"],
  "sui.2": ["Aarau", "Vaduz", "Thun", "Wil", "Xamax"],
  "swe.1": ["Malmo", "AIK", "Hammarby", "Djurgarden", "Goteborg"],
  "usa.1": ["Inter Miami", "Los Angeles", "Atlanta", "Seattle", "Portland", "New York"]
};

function ensureDir(dirPath) { fs.mkdirSync(dirPath, { recursive: true }); }
function rel(filePath) { return path.relative(ROOT, filePath).replaceAll("\\", "/"); }

function walk(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function parseJsonlSafe(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

function latestFile(pattern) {
  const files = walk(DIAG_ROOT).filter((file) => pattern.test(file));
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] || null;
}

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
  ].filter(Boolean);
  for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
  return null;
}

function htmlDecode(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'");
}

function stripHtml(value) {
  return htmlDecode(String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " "))
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

function extractTitle(html) {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripHtml(match[1]).slice(0, 240) : null;
}

function extractBlocks(html, tagName) {
  return String(html || "").match(new RegExp(`<${tagName}\\b[\\s\\S]*?<\\/${tagName}>`, "gi")) || [];
}

function extractRowsFromTable(tableHtml) {
  const rowBlocks = extractBlocks(tableHtml, "tr");
  return rowBlocks.map((rowHtml) => {
    const cellBlocks = rowHtml.match(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi) || [];
    return cellBlocks.map((cellHtml) => stripHtml(cellHtml)).filter(Boolean);
  }).filter((row) => row.length > 0);
}

function numericValue(cell) {
  const cleaned = String(cell || "").replace(/[^\d-]/g, "");
  if (!cleaned || cleaned === "-") return null;
  const n = Number.parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : null;
}

function numericValues(row) {
  return row.map(numericValue).filter((v) => v !== null);
}

function parseTeam(cell) {
  return String(cell || "")
    .replace(/^\s*\d+\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeHeader(row) {
  const n = normalizeText(row.join(" "));
  return (
    n.includes("team") || n.includes("club") || n.includes("pos club") || n.includes("standings") ||
    ((n.includes("pts") || n.includes("points") || n.includes("pnt")) && (n.includes("played") || /\bp\b/.test(n) || /\bpl\b/.test(n))) ||
    ((n.includes("gf") || n.includes("ga") || n.includes("gd")) && (n.includes("w") || n.includes("d") || n.includes("l")))
  );
}

function headerCellIs(cell, patterns) {
  const n = normalizeText(cell);
  return patterns.some((p) => n === p || n.includes(p));
}

function inferSchema(rows) {
  const headerIndex = rows.findIndex(looksLikeHeader);
  const header = headerIndex >= 0 ? rows[headerIndex] : [];
  const norm = header.map(normalizeText);
  const indexOf = (patterns) => norm.findIndex((cell) => patterns.some((p) => cell === p || cell.includes(p)));

  let position = indexOf(["pos", "position", "rank", "#"]);
  let team = indexOf(["team", "club", "squad"]);
  let played = indexOf(["pl", "played", "matches", "mp", "p", "g", "gs"]);
  let won = indexOf(["w", "won"]);
  let drawn = indexOf(["d", "drawn"]);
  let lost = indexOf(["l", "lost"]);
  let gf = indexOf(["gf", "goals for", "for", "dv"]);
  let ga = indexOf(["ga", "goals against", "against", "dt"]);
  let gd = indexOf(["gd", "goal difference", "diff", "ds"]);
  let points = indexOf(["pts", "points", "pt", "pnt", "punten"]);

  const combinedPosClub = header.some((cell) => headerCellIs(cell, ["pos club", "position club", "rank club"]));
  if (combinedPosClub) {
    position = 0;
    team = 0;
  }

  if (headerIndex >= 0 && team < 0) {
    const candidate = rows.slice(headerIndex + 1).find((row) => row.some((cell) => /[A-Za-zÀ-žΑ-ωԱ-Ֆა-ჰ]/.test(cell)) && numericValues(row).length >= 4);
    if (candidate) {
      const firstText = candidate.findIndex((cell) => /[A-Za-zÀ-žΑ-ωԱ-Ֆა-ჰ]/.test(cell));
      if (firstText >= 0) team = firstText;
    }
  }

  if (points < 0 && headerIndex >= 0) {
    const likely = rows.slice(headerIndex + 1).filter((row) => numericValues(row).length >= 4);
    const maxCols = Math.max(...likely.map((row) => row.length), 0);
    if (maxCols > 0) points = maxCols - 1;
  }

  return {
    headerIndex,
    header,
    columns: { position, team, played, won, drawn, lost, goalsFor: gf, goalsAgainst: ga, goalDifference: gd, points }
  };
}

function parseRowsWithSchema(rows, schema) {
  const { headerIndex, columns } = schema;
  if (headerIndex < 0) return [];
  const dataRows = rows.slice(headerIndex + 1).filter((row) => {
    const nums = numericValues(row);
    return row.length >= 5 && nums.length >= 4 && row.some((cell) => /[A-Za-zÀ-žΑ-ωԱ-Ֆა-ჰ]/.test(cell));
  });

  return dataRows.map((row) => {
    const get = (key) => {
      const idx = columns[key];
      return idx >= 0 && idx < row.length ? row[idx] : null;
    };
    const getNum = (key) => numericValue(get(key));
    let position = getNum("position");
    if (position === null && columns.position === columns.team) position = numericValue(String(get("team") || "").match(/^\s*\d+/)?.[0] || "");
    const team = parseTeam(get("team"));
    return {
      rawCells: row,
      position,
      team,
      played: getNum("played"),
      won: getNum("won"),
      drawn: getNum("drawn"),
      lost: getNum("lost"),
      goalsFor: getNum("goalsFor"),
      goalsAgainst: getNum("goalsAgainst"),
      goalDifference: getNum("goalDifference"),
      points: getNum("points")
    };
  }).filter((row) => row.team);
}

function validateRows(slug, parsedRows) {
  const numericCompleteRows = parsedRows.filter((row) =>
    ["played","won","drawn","lost","points"].every((key) => Number.isFinite(row[key]))
  );
  const arithmeticRows = numericCompleteRows.filter((row) => row.played === row.won + row.drawn + row.lost);
  const pointsRows = numericCompleteRows.filter((row) => row.points === row.won * 3 + row.drawn);
  const totalPlayed = numericCompleteRows.reduce((sum, row) => sum + row.played, 0);
  const totalPoints = numericCompleteRows.reduce((sum, row) => sum + row.points, 0);
  const expectedRows = EXPECTED_ROWS[slug] || null;
  const expectedTeamSignals = TEAM_SIGNALS[slug] || [];
  const normalizedTeams = normalizeText(parsedRows.map((row) => row.team).join(" "));
  const matchedTeamSignals = expectedTeamSignals.filter((signal) => normalizedTeams.includes(normalizeText(signal)));
  return {
    parsedRowCount: parsedRows.length,
    numericCompleteRowCount: numericCompleteRows.length,
    arithmeticPassedRowCount: arithmeticRows.length,
    pointsPassedRowCount: pointsRows.length,
    totalPlayed,
    totalPoints,
    maxPoints: Math.max(0, ...numericCompleteRows.map((row) => row.points || 0)),
    expectedRows,
    expectedRowsPassed: expectedRows ? parsedRows.length === expectedRows : null,
    expectedTeamSignalCount: expectedTeamSignals.length,
    matchedTeamSignalCount: matchedTeamSignals.length,
    matchedTeamSignals,
    arithmeticGatePassed: numericCompleteRows.length > 0 && numericCompleteRows.length === parsedRows.length && arithmeticRows.length === numericCompleteRows.length && pointsRows.length === numericCompleteRows.length,
    nonTrivialPreviousCompletedGatePassed: totalPlayed > 0 && totalPoints > 0 && numericCompleteRows.some((row) => row.played > 0) && Math.max(0, ...numericCompleteRows.map((row) => row.points || 0)) > 0
  };
}

function seasonCurrentnessReview(target, htmlText, renderedUrl) {
  const n = normalizeText(`${renderedUrl} ${target.title || ""} ${htmlText.slice(0, 6000)}`);
  const has2026Url = /\/2026\/|2026/.test(renderedUrl);
  const has2025 = n.includes("2025");
  const has2026 = n.includes("2026");
  const has2025_26 = n.includes("2025/26") || n.includes("2025-26") || n.includes("2025 26") || n.includes("2025 2026");
  const calendarYearLikely = ["jpn.1","jpn.2","swe.1","usa.1"].includes(target.competitionSlug);
  let status = "season_scope_needs_review";
  if (has2025_26 && !has2026Url) status = "likely_previous_completed_2025_2026_candidate";
  if (calendarYearLikely && has2026) status = "likely_current_or_new_calendar_year_2026_not_previous_completed";
  if (has2026Url) status = "likely_current_or_new_2026_route_not_previous_completed";
  return { has2025, has2026, has2025_26, calendarYearLikely, status };
}

function render(chrome, url) {
  const result = spawnSync(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--disable-default-apps",
    "--hide-scrollbars",
    "--window-size=1600,2600",
    "--virtual-time-budget=14000",
    "--dump-dom",
    url
  ], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 90 * 1024 * 1024,
    timeout: CHROME_TIMEOUT_MS
  });
  return { exitCode: result.status, signal: result.signal || null, stdout: result.stdout || "", stderr: result.stderr || "" };
}

function bestTable(rowsByTable) {
  const inspected = rowsByTable.map((rows, tableIndex) => {
    const schema = inferSchema(rows);
    const parsedRows = parseRowsWithSchema(rows, schema);
    const validation = validateRows("__unknown__", parsedRows);
    const score =
      (schema.headerIndex >= 0 ? 100 : 0) +
      parsedRows.length * 20 +
      validation.numericCompleteRowCount * 10 +
      (validation.arithmeticGatePassed ? 400 : 0) +
      (validation.nonTrivialPreviousCompletedGatePassed ? 300 : 0);
    return { tableIndex, rows, schema, parsedRows, validation, score };
  });
  inspected.sort((a, b) => b.score - a.score || b.parsedRows.length - a.parsedRows.length);
  return inspected[0] || null;
}

ensureDir(OUT_DIR);

const materializablePath = latestFile(/bulk-host-first-standings-materializable-candidates-\d{4}-\d{2}-\d{2}\.jsonl$/);
if (!materializablePath) throw new Error("Missing bulk host-first materializable candidates");

const candidates = parseJsonlSafe(materializablePath);
const chrome = chromePath();
if (!chrome) throw new Error("Chrome/Edge executable not found");

const reviews = [];
let browserRenderExecutedNowCount = 0;

for (const target of candidates) {
  const renderedUrl = target.renderedUrl || target.finalUrl || target.url;
  if (!renderedUrl) continue;
  console.log(`REVIEW ${target.competitionSlug} ${renderedUrl}`);
  const rendered = render(chrome, renderedUrl);
  browserRenderExecutedNowCount++;
  const html = rendered.stdout || "";
  const htmlText = stripHtml(html);
  const tableBlocks = extractBlocks(html, "table");
  const rowsByTable = tableBlocks.map(extractRowsFromTable);
  const best = bestTable(rowsByTable);
  const schema = best?.schema || { headerIndex: -1, header: [], columns: {} };
  const parsedRows = best?.parsedRows || [];
  const validation = validateRows(target.competitionSlug, parsedRows);
  const currentness = seasonCurrentnessReview(target, htmlText, renderedUrl);

  const acceptedAsPreviousCompletedMaterializationCandidate =
    validation.expectedRowsPassed === true &&
    validation.arithmeticGatePassed &&
    validation.nonTrivialPreviousCompletedGatePassed &&
    currentness.status === "likely_previous_completed_2025_2026_candidate";

  reviews.push({
    competitionSlug: target.competitionSlug,
    displayName: target.displayName,
    officialHost: target.officialHost,
    renderedUrl,
    browserExitCode: rendered.exitCode,
    browserSignal: rendered.signal,
    stderrSnippet: rendered.stderr.slice(0, 700),
    title: extractTitle(html),
    tableCount: tableBlocks.length,
    selectedTableIndex: best?.tableIndex ?? null,
    selectedTableScore: best?.score ?? 0,
    schema,
    validation,
    seasonCurrentnessReview: currentness,
    acceptedAsPreviousCompletedMaterializationCandidate,
    rejectionReasons: [
      validation.expectedRowsPassed !== true ? "expected_rows_gate_not_passed_or_missing" : null,
      !validation.arithmeticGatePassed ? "arithmetic_gate_failed" : null,
      !validation.nonTrivialPreviousCompletedGatePassed ? "non_trivial_previous_completed_gate_failed" : null,
      currentness.status !== "likely_previous_completed_2025_2026_candidate" ? `season_currentness_not_previous_completed:${currentness.status}` : null
    ].filter(Boolean),
    parsedRowsPreview: parsedRows.slice(0, 20),
    selectedTableFirstRows: (best?.rows || []).slice(0, 12)
  });
}

const accepted = reviews.filter((row) => row.acceptedAsPreviousCompletedMaterializationCandidate);
const arithmeticPassed = reviews.filter((row) => row.validation.arithmeticGatePassed);
const expectedRowsPassed = reviews.filter((row) => row.validation.expectedRowsPassed === true);
const nonTrivialPassed = reviews.filter((row) => row.validation.nonTrivialPreviousCompletedGatePassed);
const currentnessBlocked = reviews.filter((row) => row.rejectionReasons.some((reason) => reason.startsWith("season_currentness_not_previous_completed")));

const summary = {
  status: "passed",
  runner: "bulk_generic_schema_materialization_review",
  sourceMaterializableCandidatesPath: rel(materializablePath),
  inputCandidateCount: candidates.length,
  reviewedCandidateCount: reviews.length,
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  rawPayloadWriteExecutedNowCount: 0,
  expectedRowsPassedCount: expectedRowsPassed.length,
  arithmeticGatePassedCount: arithmeticPassed.length,
  nonTrivialPreviousCompletedGatePassedCount: nonTrivialPassed.length,
  currentnessBlockedCount: currentnessBlocked.length,
  acceptedPreviousCompletedMaterializationCandidateCount: accepted.length,
  acceptedCompetitionSlugs: accepted.map((row) => row.competitionSlug),
  recommendedNextLane:
    accepted.length > 0
      ? "promote_accepted_generic_schema_candidates_to_central_adapter_after_review"
      : "use_currentness_blocked_candidates_for_current_season_lane_and_continue_api_or_route_mining_for_previous_completed"
};

const outPath = path.join(OUT_DIR, `bulk-generic-schema-materialization-review-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `bulk-generic-schema-materialization-review-rows-${DATE}.jsonl`);
const acceptedPath = path.join(OUT_DIR, `bulk-generic-schema-accepted-materialization-candidates-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({ summary, accepted, reviews }, null, 2) + "\n", "utf8");
fs.writeFileSync(rowsPath, reviews.map((row) => JSON.stringify(row)).join("\n") + (reviews.length ? "\n" : ""), "utf8");
fs.writeFileSync(acceptedPath, accepted.map((row) => JSON.stringify(row)).join("\n") + (accepted.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  acceptedCandidatesOutput: rel(acceptedPath),
  summary
}, null, 2));
