import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const DATA_ROOT = path.join(ROOT, "data", "football-truth");
const DIAG_ROOT = path.join(DATA_ROOT, "_diagnostics");
const OUT_DIR = path.join(DIAG_ROOT, `route-hint-evidence-review-${DATE}`);

const MONTHS = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sept: 9, sep: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12
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

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isoDate(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDateText(dateText) {
  const raw = String(dateText || "").replace(/,/g, " ").replace(/\s+/g, " ").trim();
  let m;

  m = raw.match(/^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s*(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})$/i);
  if (m) return { iso: isoDate(Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1])), parser: "day_month_year" };

  m = raw.match(/^([A-Za-z]+)\s+(\d{1,2})\s+(20\d{2})$/i);
  if (m) return { iso: isoDate(Number(m[3]), MONTHS[m[1].toLowerCase()], Number(m[2])), parser: "month_day_year" };

  m = raw.match(/^(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(20\d{2})$/);
  if (m) return { iso: isoDate(Number(m[3]), Number(m[2]), Number(m[1])), parser: "day_month_year_numeric" };

  m = raw.match(/^(20\d{2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})$/);
  if (m) return { iso: isoDate(Number(m[1]), Number(m[2]), Number(m[3])), parser: "year_month_day_numeric" };

  m = raw.match(/^(\d{1,2})\s*\/\s*(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})$/i);
  if (m) return { iso: isoDate(Number(m[4]), MONTHS[m[3].toLowerCase()], Number(m[1])), parser: "range_day_month_year_first_day" };

  return { iso: null, parser: "unparsed" };
}

function inRange(iso, start, end) {
  return !!iso && iso >= start && iso <= end;
}

function nearbyDateContext(context, dateText) {
  const c = String(context || "");
  const i = c.indexOf(String(dateText || ""));
  if (i < 0) return c.slice(0, 500);
  return c.slice(Math.max(0, i - 220), Math.min(c.length, i + String(dateText).length + 260));
}

function startDateReview(row, acceptedStateSlugs) {
  const parsed = parseDateText(row.dateText);
  const context = String(row.context || "");
  const near = nearbyDateContext(context, row.dateText);
  const n = normalizeText(near);
  const full = normalizeText(`${row.title || ""} ${context}`);

  const hasSeasonSubject =
    n.includes("season") || n.includes("league") || n.includes("competition") || n.includes("campaign") ||
    n.includes("fixture") || n.includes("calendar") || n.includes("schedule") || n.includes("opening") ||
    n.includes("round") || n.includes("matchday");

  const hasStartGovernance =
    n.includes("start") || n.includes("begin") || n.includes("kick") || n.includes("commence") ||
    n.includes("opening") || n.includes("round 1") || n.includes("matchday 1");

  const hasEndGovernance =
    n.includes("end") || n.includes("ends") || n.includes("final") || n.includes("conclude") ||
    n.includes("concludes") || n.includes("finish") || n.includes("last match") || n.includes("ends on");

  const pageOrArticleDate =
    n.includes("published") || n.includes("updated") || n.includes("release day") || n.includes("released") ||
    n.includes("news") && !hasStartGovernance ||
    full.includes("all you need to know") && !n.includes("saturday 22 august 2026");

  const targetWindowStart = "2026-07-01";
  const targetWindowEnd = "2027-06-30";
  const likelyArticleOrFixtureReleaseDate =
    parsed.iso && parsed.iso < "2026-07-01";

  const duplicateExistingState = acceptedStateSlugs.has(row.competitionSlug);

  const accepted =
    row.governedStartMention === true &&
    parsed.iso &&
    inRange(parsed.iso, targetWindowStart, targetWindowEnd) &&
    hasSeasonSubject &&
    hasStartGovernance &&
    !hasEndGovernance &&
    !pageOrArticleDate &&
    !likelyArticleOrFixtureReleaseDate &&
    !duplicateExistingState;

  const reviewStatus =
    accepted ? "accepted_materializable_start_date_candidate" :
    duplicateExistingState ? "duplicate_existing_accepted_start_date_state" :
    !parsed.iso ? "rejected_unparsed_date" :
    !inRange(parsed.iso, targetWindowStart, targetWindowEnd) ? "rejected_outside_target_season_window" :
    likelyArticleOrFixtureReleaseDate ? "rejected_likely_article_or_fixture_release_date" :
    hasEndGovernance ? "rejected_season_end_or_final_date" :
    pageOrArticleDate ? "rejected_page_or_article_date" :
    !hasSeasonSubject || !hasStartGovernance ? "rejected_not_strictly_governed_start_date" :
    "rejected_unclassified";

  return {
    ...row,
    parsedDateIso: parsed.iso,
    dateParser: parsed.parser,
    targetSeasonLabel: "2026-2027",
    duplicateExistingState,
    strictReviewStatus: reviewStatus,
    acceptedAsMaterializableStartDateCandidate: accepted,
    strictReviewContext: near,
    strictReviewSignals: {
      hasSeasonSubject,
      hasStartGovernance,
      hasEndGovernance,
      pageOrArticleDate,
      likelyArticleOrFixtureReleaseDate
    }
  };
}

function tableRoutePriority(row) {
  const bestTables = Array.isArray(row.bestTables) ? row.bestTables : [];
  const best = bestTables[0] || {};
  return (
    Number(best.materializableTableCandidate ? 10000 : 0) +
    Number(best.rowCount || 0) * 100 +
    Number(best.dataLikeRowCount || 0) * 50 +
    Number(best.numericCount || 0) +
    Number(row.httpStatus >= 200 && row.httpStatus < 400 ? 500 : 0)
  );
}

function tableRouteReview(row) {
  const bestTables = Array.isArray(row.bestTables) ? row.bestTables : [];
  const best = bestTables[0] || null;
  const n = normalizeText(`${row.title || ""} ${row.finalUrl || ""}`);
  const currentnessBlocked =
    n.includes("/2026/") ||
    n.includes("2026") && ["jpn.1","jpn.2","usa.1"].includes(row.competitionSlug);
  const routeMayNeedBrowserSchema =
    best && best.materializableTableCandidate && !currentnessBlocked;
  return {
    ...row,
    routePriority: tableRoutePriority(row),
    currentnessBlocked,
    tableRouteReviewStatus:
      routeMayNeedBrowserSchema ? "browser_schema_review_candidate" :
      currentnessBlocked ? "blocked_current_or_new_season_route" :
      best ? "table_route_needs_manual_schema_review" :
      "weak_table_route",
    recommendedNextAction:
      routeMayNeedBrowserSchema ? "browser_render_schema_review_with_expected_rows_arithmetic_nonzero_gate" :
      currentnessBlocked ? "keep_for_current_or_new_season_lane_not_previous_completed" :
      "inspect_route_or_api_hints_before_promotion"
  };
}

function readAcceptedStateSlugs() {
  const files = walk(path.join(DATA_ROOT, "_state")).filter((file) => /accepted-season-start-date-evidence-\d{4}-\d{2}-\d{2}\.jsonl$/.test(file));
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  const rows = parseJsonlSafe(files[0]);
  return new Set(rows.map((row) => row.competitionSlug).filter(Boolean));
}

ensureDir(OUT_DIR);

const startDateCandidatesPath = latestFile(/controlled-route-hint-start-date-candidates-\d{4}-\d{2}-\d{2}\.jsonl$/);
const tableRouteCandidatesPath = latestFile(/controlled-route-hint-table-route-candidates-\d{4}-\d{2}-\d{2}\.jsonl$/);
if (!startDateCandidatesPath) throw new Error("Missing controlled route-hint start-date candidates");
if (!tableRouteCandidatesPath) throw new Error("Missing controlled route-hint table-route candidates");

const acceptedStateSlugs = readAcceptedStateSlugs();
const startRows = parseJsonlSafe(startDateCandidatesPath);
const tableRows = parseJsonlSafe(tableRouteCandidatesPath);

const startReviews = startRows
  .map((row) => startDateReview(row, acceptedStateSlugs))
  .sort((a, b) =>
    Number(b.acceptedAsMaterializableStartDateCandidate) - Number(a.acceptedAsMaterializableStartDateCandidate) ||
    String(a.competitionSlug).localeCompare(String(b.competitionSlug)) ||
    String(a.parsedDateIso || "").localeCompare(String(b.parsedDateIso || ""))
  );

const tableReviews = tableRows
  .map(tableRouteReview)
  .sort((a, b) => b.routePriority - a.routePriority || String(a.competitionSlug).localeCompare(String(b.competitionSlug)));

const acceptedStartDates = startReviews.filter((row) => row.acceptedAsMaterializableStartDateCandidate);
const duplicateStartDates = startReviews.filter((row) => row.duplicateExistingState);
const browserSchemaTableQueue = tableReviews.filter((row) => row.tableRouteReviewStatus === "browser_schema_review_candidate");

const summary = {
  status: "passed",
  runner: "route_hint_evidence_review",
  sourceStartDateCandidatesPath: rel(startDateCandidatesPath),
  sourceTableRouteCandidatesPath: rel(tableRouteCandidatesPath),
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  rawPayloadWriteExecutedNowCount: 0,
  inputStartDateCandidateCount: startRows.length,
  governedInputStartDateCandidateCount: startRows.filter((row) => row.governedStartMention).length,
  strictAcceptedStartDateCandidateCount: acceptedStartDates.length,
  duplicateExistingAcceptedStateCount: duplicateStartDates.length,
  acceptedStartDateCompetitionSlugs: acceptedStartDates.map((row) => row.competitionSlug),
  existingAcceptedStartDateStateSlugs: [...acceptedStateSlugs],
  rejectedStartDateCandidateCount: startReviews.length - acceptedStartDates.length,
  inputTableRouteCandidateCount: tableRows.length,
  browserSchemaTableQueueCount: browserSchemaTableQueue.length,
  currentnessBlockedTableRouteCount: tableReviews.filter((row) => row.currentnessBlocked).length,
  recommendedNextLane:
    acceptedStartDates.length > 0
      ? "materialize_strict_accepted_start_date_candidates_after_review_gate"
      : browserSchemaTableQueue.length > 0
        ? "run_browser_schema_review_for_table_route_queue"
        : "expand_api_hint_fetch_from_deepened_route_hints"
};

const outPath = path.join(OUT_DIR, `route-hint-evidence-review-${DATE}.json`);
const startRowsPath = path.join(OUT_DIR, `route-hint-start-date-review-rows-${DATE}.jsonl`);
const acceptedStartPath = path.join(OUT_DIR, `route-hint-accepted-start-date-candidates-${DATE}.jsonl`);
const tableRowsPath = path.join(OUT_DIR, `route-hint-table-route-review-rows-${DATE}.jsonl`);
const tableQueuePath = path.join(OUT_DIR, `route-hint-browser-schema-table-queue-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({
  summary,
  acceptedStartDateCandidates: acceptedStartDates,
  duplicateExistingStartDateCandidates: duplicateStartDates,
  startDateReviewSample: startReviews.slice(0, 80),
  browserSchemaTableQueue: browserSchemaTableQueue.slice(0, 120),
  tableRouteReviewSample: tableReviews.slice(0, 120)
}, null, 2) + "\n", "utf8");

fs.writeFileSync(startRowsPath, startReviews.map((row) => JSON.stringify(row)).join("\n") + (startReviews.length ? "\n" : ""), "utf8");
fs.writeFileSync(acceptedStartPath, acceptedStartDates.map((row) => JSON.stringify(row)).join("\n") + (acceptedStartDates.length ? "\n" : ""), "utf8");
fs.writeFileSync(tableRowsPath, tableReviews.map((row) => JSON.stringify(row)).join("\n") + (tableReviews.length ? "\n" : ""), "utf8");
fs.writeFileSync(tableQueuePath, browserSchemaTableQueue.map((row) => JSON.stringify(row)).join("\n") + (browserSchemaTableQueue.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  startDateReviewRowsOutput: rel(startRowsPath),
  acceptedStartDateCandidatesOutput: rel(acceptedStartPath),
  tableRouteReviewRowsOutput: rel(tableRowsPath),
  browserSchemaTableQueueOutput: rel(tableQueuePath),
  summary
}, null, 2));
