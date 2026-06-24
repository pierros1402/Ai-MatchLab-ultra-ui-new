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
const OUT_DIR = path.join(DIAG_ROOT, `browser-schema-review-table-route-queue-${DATE}`);
const args = new Set(process.argv.slice(2));

if (!args.has("--allow-browser-render")) throw new Error("Refusing browser render without --allow-browser-render");

const CHROME_TIMEOUT_MS = Number(process.env.BROWSER_SCHEMA_REVIEW_TIMEOUT_MS || "28000");

const EXPECTED_ROWS = {
  "nor.1": 16,
  "geo.1": 10,
  "geo.2": 10
};

const TEAM_SIGNALS = {
  "nor.1": ["Bodø/Glimt", "Brann", "Viking", "Rosenborg", "Molde", "Tromsø"],
  "geo.1": ["Dinamo Tbilisi", "Dila", "Torpedo Kutaisi", "Iberia", "Saburtalo"],
  "geo.2": ["Sioni", "Rustavi", "WIT Georgia", "Spaeri", "Gareji"]
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
  }).filter((row) => row.length);
}

function numericValue(cell) {
  const cleaned = String(cell || "").replace(/[^\d-]/g, "");
  if (!cleaned || cleaned === "-") return null;
  const n = Number.parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : null;
}

function numericValues(row) {
  return row.map(numericValue).filter((value) => value !== null);
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
    n.includes("team") || n.includes("club") || n.includes("lag") || n.includes("klubb") ||
    n.includes("pos") || n.includes("rank") || n.includes("position") ||
    ((n.includes("pts") || n.includes("points") || n.includes("poeng") || n.includes("p")) &&
     (n.includes("played") || n.includes("matches") || n.includes("kamper") || n.includes("ks") || n.includes("mp"))) ||
    ((n.includes("w") || n.includes("s") || n.includes("won")) &&
     (n.includes("d") || n.includes("u") || n.includes("draw")) &&
     (n.includes("l") || n.includes("t") || n.includes("lost")))
  );
}

function inferSchema(rows) {
  const headerIndex = rows.findIndex(looksLikeHeader);
  const header = headerIndex >= 0 ? rows[headerIndex] : [];
  const norm = header.map(normalizeText);

  const find = (patterns) => norm.findIndex((cell) => patterns.some((p) => cell === p || cell.includes(p)));

  let position = find(["pos", "position", "rank", "#"]);
  let team = find(["team", "club", "lag", "klubb"]);
  let played = find(["pl", "played", "matches", "mp", "p", "ks", "kamper"]);
  let won = find(["w", "won", "s", "seier"]);
  let drawn = find(["d", "drawn", "draw", "u", "uavgjort"]);
  let lost = find(["l", "lost", "t", "tap"]);
  let gf = find(["gf", "goals for", "for", "scoret", "mål for", "mf"]);
  let ga = find(["ga", "goals against", "against", "innsluppet", "mål mot", "mm"]);
  let gd = find(["gd", "goal difference", "diff", "+/-", "forskjell"]);
  let points = find(["pts", "points", "poeng", "p"]);

  if (team < 0 && headerIndex >= 0) {
    const dataCandidate = rows.slice(headerIndex + 1).find((row) => row.some((cell) => /[A-Za-zÀ-žΑ-ωԱ-Ֆა-ჰ]/.test(cell)) && numericValues(row).length >= 4);
    if (dataCandidate) team = dataCandidate.findIndex((cell) => /[A-Za-zÀ-žΑ-ωԱ-Ֆა-ჰ]/.test(cell));
  }

  if (position < 0 && team >= 0 && rows.slice(headerIndex + 1).some((row) => numericValue(row[0]) !== null)) position = 0;

  if (points < 0 && headerIndex >= 0) {
    const dataRows = rows.slice(headerIndex + 1).filter((row) => numericValues(row).length >= 4);
    const maxCols = Math.max(0, ...dataRows.map((row) => row.length));
    if (maxCols > 0) points = maxCols - 1;
  }

  return { headerIndex, header, columns: { position, team, played, won, drawn, lost, goalsFor: gf, goalsAgainst: ga, goalDifference: gd, points } };
}

function parseRowsWithSchema(rows, schema) {
  if (schema.headerIndex < 0) return [];
  const { columns } = schema;
  const dataRows = rows.slice(schema.headerIndex + 1).filter((row) => {
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
    if (position === null) position = numericValue(String(row[0] || "").match(/^\s*\d+/)?.[0] || "");

    return {
      rawCells: row,
      position,
      team: parseTeam(get("team")),
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

function validate(slug, parsedRows) {
  const complete = parsedRows.filter((row) => ["played","won","drawn","lost","points"].every((key) => Number.isFinite(row[key])));
  const arithmeticPassedRows = complete.filter((row) => row.played === row.won + row.drawn + row.lost);
  const pointsPassedRows = complete.filter((row) => row.points === row.won * 3 + row.drawn);
  const totalPlayed = complete.reduce((sum, row) => sum + row.played, 0);
  const totalPoints = complete.reduce((sum, row) => sum + row.points, 0);
  const expectedRows = EXPECTED_ROWS[slug] || null;
  const expectedSignals = TEAM_SIGNALS[slug] || [];
  const teamText = normalizeText(parsedRows.map((row) => row.team).join(" "));
  const matchedSignals = expectedSignals.filter((signal) => teamText.includes(normalizeText(signal)));

  return {
    parsedRowCount: parsedRows.length,
    numericCompleteRowCount: complete.length,
    expectedRows,
    expectedRowsPassed: expectedRows ? parsedRows.length === expectedRows : null,
    arithmeticGatePassed: complete.length > 0 && complete.length === parsedRows.length && arithmeticPassedRows.length === complete.length && pointsPassedRows.length === complete.length,
    nonTrivialGatePassed: totalPlayed > 0 && totalPoints > 0 && complete.some((row) => row.played > 0) && Math.max(0, ...complete.map((row) => row.points || 0)) > 0,
    totalPlayed,
    totalPoints,
    maxPoints: Math.max(0, ...complete.map((row) => row.points || 0)),
    expectedTeamSignalCount: expectedSignals.length,
    matchedTeamSignalCount: matchedSignals.length,
    matchedTeamSignals: matchedSignals,
    teamSignalReviewPassed: expectedSignals.length === 0 ? null : matchedSignals.length >= 1
  };
}

function classifySeasonScope(slug, renderedUrl, title, text, validation) {
  const n = normalizeText(`${renderedUrl} ${title || ""} ${text.slice(0, 9000)}`);
  const calendarYearLeague = ["nor.1", "geo.1", "geo.2"].includes(slug);
  const has2025 = n.includes("2025");
  const has2026 = n.includes("2026");
  const has2025_2026 = n.includes("2025/26") || n.includes("2025-26") || n.includes("2025 2026");
  const hasCurrentWords = n.includes("current") || n.includes("live") || n.includes("season 2026") || n.includes("2026");
  const validNumeric = validation.arithmeticGatePassed && validation.nonTrivialGatePassed && validation.expectedRowsPassed === true;

  if (validNumeric && has2025_2026 && !calendarYearLeague) {
    return { lane: "previous_completed", seasonLabel: "2025-2026", status: "likely_previous_completed_2025_2026" };
  }

  if (validNumeric && calendarYearLeague && has2025 && !has2026) {
    return { lane: "previous_completed", seasonLabel: "2025", status: "likely_previous_completed_calendar_2025" };
  }

  if (validNumeric && calendarYearLeague && has2026) {
    return { lane: "current_or_new", seasonLabel: "2026", status: "likely_current_or_new_calendar_2026" };
  }

  if (validNumeric && hasCurrentWords) {
    return { lane: "current_or_new", seasonLabel: "2026", status: "likely_current_or_new_2026" };
  }

  return { lane: "review", seasonLabel: null, status: "season_scope_unresolved" };
}

function selectBestTable(slug, tableRowsList) {
  const inspected = tableRowsList.map((rows, tableIndex) => {
    const schema = inferSchema(rows);
    const parsedRows = parseRowsWithSchema(rows, schema);
    const validation = validate(slug, parsedRows);
    const score =
      (schema.headerIndex >= 0 ? 1000 : 0) +
      parsedRows.length * 80 +
      validation.numericCompleteRowCount * 50 +
      (validation.expectedRowsPassed === true ? 1000 : 0) +
      (validation.arithmeticGatePassed ? 1600 : 0) +
      (validation.nonTrivialGatePassed ? 1200 : 0) +
      (validation.teamSignalReviewPassed === true ? 300 : 0);
    return { tableIndex, rows, schema, parsedRows, validation, score };
  });

  inspected.sort((a, b) => b.score - a.score || b.parsedRows.length - a.parsedRows.length);
  return inspected[0] || null;
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
    "--window-size=1600,2800",
    "--virtual-time-budget=16000",
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

ensureDir(OUT_DIR);

const queuePath = latestFile(/route-hint-browser-schema-table-queue-\d{4}-\d{2}-\d{2}\.jsonl$/);
if (!queuePath) throw new Error("Missing browser schema table queue");

const queue = parseJsonlSafe(queuePath);
const chrome = chromePath();
if (!chrome) throw new Error("Chrome/Edge executable not found");

const reviews = [];
let browserRenderExecutedNowCount = 0;

for (const target of queue) {
  const url = target.finalUrl || target.hintUrl || target.url;
  console.log(`SCHEMA_REVIEW ${target.competitionSlug} ${url}`);
  const rendered = render(chrome, url);
  browserRenderExecutedNowCount++;
  const html = rendered.stdout || "";
  const text = stripHtml(html);
  const tableBlocks = extractBlocks(html, "table");
  const tableRowsList = tableBlocks.map(extractRowsFromTable);
  const best = selectBestTable(target.competitionSlug, tableRowsList);
  const validation = best?.validation || validate(target.competitionSlug, []);
  const season = classifySeasonScope(target.competitionSlug, url, extractTitle(html), text, validation);

  const acceptedPreviousCompleted =
    season.lane === "previous_completed" &&
    validation.expectedRowsPassed === true &&
    validation.arithmeticGatePassed &&
    validation.nonTrivialGatePassed;

  const acceptedCurrentOrNew =
    season.lane === "current_or_new" &&
    validation.expectedRowsPassed === true &&
    validation.arithmeticGatePassed &&
    validation.nonTrivialGatePassed;

  reviews.push({
    competitionSlug: target.competitionSlug,
    displayName: target.displayName,
    officialHost: target.officialHost,
    renderedUrl: url,
    browserExitCode: rendered.exitCode,
    browserSignal: rendered.signal,
    stderrSnippet: rendered.stderr.slice(0, 700),
    title: extractTitle(html),
    tableCount: tableBlocks.length,
    selectedTableIndex: best?.tableIndex ?? null,
    selectedTableScore: best?.score ?? 0,
    schema: best?.schema || null,
    validation,
    seasonScopeClassification: season,
    acceptedPreviousCompletedCandidate: acceptedPreviousCompleted,
    acceptedCurrentOrNewSeasonCandidate: acceptedCurrentOrNew,
    rejectionReasons: [
      validation.expectedRowsPassed !== true ? "expected_rows_gate_failed" : null,
      !validation.arithmeticGatePassed ? "arithmetic_gate_failed" : null,
      !validation.nonTrivialGatePassed ? "non_trivial_gate_failed" : null,
      season.lane === "review" ? "season_scope_unresolved" : null
    ].filter(Boolean),
    parsedRowsPreview: (best?.parsedRows || []).slice(0, 30),
    selectedTableFirstRows: (best?.rows || []).slice(0, 15),
    bodySnippet: text.slice(0, 1000)
  });
}

const previousAccepted = reviews.filter((row) => row.acceptedPreviousCompletedCandidate);
const currentAccepted = reviews.filter((row) => row.acceptedCurrentOrNewSeasonCandidate);
const rejected = reviews.filter((row) => !row.acceptedPreviousCompletedCandidate && !row.acceptedCurrentOrNewSeasonCandidate);

const summary = {
  status: "passed",
  runner: "browser_schema_review_table_route_queue",
  sourceQueuePath: rel(queuePath),
  inputQueueCount: queue.length,
  reviewedCount: reviews.length,
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  rawPayloadWriteExecutedNowCount: 0,
  previousCompletedAcceptedCandidateCount: previousAccepted.length,
  currentOrNewAcceptedCandidateCount: currentAccepted.length,
  rejectedCandidateCount: rejected.length,
  previousCompletedAcceptedSlugs: previousAccepted.map((row) => row.competitionSlug),
  currentOrNewAcceptedSlugs: currentAccepted.map((row) => row.competitionSlug),
  recommendedNextLane:
    previousAccepted.length > 0
      ? "promote_previous_completed_schema_candidates_after_user_approval_gate"
      : currentAccepted.length > 0
        ? "feed_current_or_new_season_lane_without_counting_as_previous_completed"
        : "mine_api_or_season_specific_previous_completed_routes_for_queue_hosts"
};

const outPath = path.join(OUT_DIR, `browser-schema-review-table-route-queue-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `browser-schema-review-table-route-queue-rows-${DATE}.jsonl`);
const previousAcceptedPath = path.join(OUT_DIR, `browser-schema-previous-completed-accepted-candidates-${DATE}.jsonl`);
const currentAcceptedPath = path.join(OUT_DIR, `browser-schema-current-or-new-accepted-candidates-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({ summary, previousAccepted, currentAccepted, rejected, reviews }, null, 2) + "\n", "utf8");
fs.writeFileSync(rowsPath, reviews.map((row) => JSON.stringify(row)).join("\n") + (reviews.length ? "\n" : ""), "utf8");
fs.writeFileSync(previousAcceptedPath, previousAccepted.map((row) => JSON.stringify(row)).join("\n") + (previousAccepted.length ? "\n" : ""), "utf8");
fs.writeFileSync(currentAcceptedPath, currentAccepted.map((row) => JSON.stringify(row)).join("\n") + (currentAccepted.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  previousCompletedAcceptedCandidatesOutput: rel(previousAcceptedPath),
  currentOrNewAcceptedCandidatesOutput: rel(currentAcceptedPath),
  summary
}, null, 2));
