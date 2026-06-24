import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const DATA_ROOT = path.join(ROOT, "data", "football-truth");
const DIAG_ROOT = path.join(DATA_ROOT, "_diagnostics");
const OUT_DIR = path.join(DIAG_ROOT, `api-start-date-evidence-review-${DATE}`);

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
  let m = raw.match(/^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s*(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})$/i);
  if (m) return { iso: isoDate(Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1])), parser: "day_month_year" };

  m = raw.match(/^([A-Za-z]+)\s+(\d{1,2})\s+(20\d{2})$/i);
  if (m) return { iso: isoDate(Number(m[3]), MONTHS[m[1].toLowerCase()], Number(m[2])), parser: "month_day_year" };

  m = raw.match(/^(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(20\d{2})$/);
  if (m) return { iso: isoDate(Number(m[3]), Number(m[2]), Number(m[1])), parser: "day_month_year_numeric" };

  m = raw.match(/^(20\d{2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})$/);
  if (m) return { iso: isoDate(Number(m[1]), Number(m[2]), Number(m[3])), parser: "year_month_day_numeric" };

  return { iso: null, parser: "unparsed" };
}

function readAcceptedStateSlugs() {
  const files = walk(path.join(DATA_ROOT, "_state")).filter((file) => /accepted-season-start-date-evidence-\d{4}-\d{2}-\d{2}\.jsonl$/.test(file));
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  const rows = parseJsonlSafe(files[0]);
  return new Set(rows.map((row) => row.competitionSlug).filter(Boolean));
}

function hostFromUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; }
}

function cleanEvidenceUrl(url) {
  const raw = String(url || "");
  try {
    const u = new URL(raw);
    const pathParts = u.pathname.split("/");
    const badIndex = pathParts.findIndex((part) => /%3e|%3c|%7b|%22|%20/i.test(part));
    if (badIndex > 0) {
      u.pathname = pathParts.slice(0, badIndex).join("/") || "/";
      u.search = "";
      u.hash = "";
      return u.toString();
    }
    return u.toString();
  } catch {
    return raw;
  }
}

function review(row, acceptedSlugs) {
  const parsed = parseDateText(row.dateText);
  const context = String(row.context || "");
  const n = normalizeText(context);
  const title = normalizeText(row.title || "");
  const url = cleanEvidenceUrl(row.finalUrl || row.sourceApiUrl || "");
  const duplicateExistingState = acceptedSlugs.has(row.competitionSlug);

  const targetWindowPassed = !!parsed.iso && parsed.iso >= "2026-07-01" && parsed.iso <= "2027-06-30";

  const seasonSubject =
    n.includes("season") || n.includes("league") || n.includes("competition") || n.includes("campaign") ||
    n.includes("calendar") || n.includes("schedule") || n.includes("fixture") || n.includes("matchweek") ||
    n.includes("round");

  const startGoverned =
    n.includes("start") || n.includes("starts") || n.includes("begin") || n.includes("begins") ||
    n.includes("kick off") || n.includes("kicks off") || n.includes("commence") || n.includes("opening");

  const endGoverned =
    n.includes("end") || n.includes("ends") || n.includes("conclude") || n.includes("concludes") ||
    n.includes("final round") || n.includes("final day") || n.includes("last round") || n.includes("wrap up");

  const articleOrPageDate =
    n.includes("published") || n.includes("updated") || n.includes("release day") || n.includes("released on") ||
    n.includes("news article") || n.includes("copyright") || n.includes("privacy") || n.includes("cookie");

  const likelyValidOfficialUrl = !!url && hostFromUrl(url) === row.officialHost;
  const yearSeasonSignal = n.includes("2026-27") || n.includes("2026/27") || n.includes("2026 27") || n.includes("2026-2027") || n.includes("2026 2027") || title.includes("2026-27") || title.includes("2026/27");

  const accepted =
    row.governedStartMention === true &&
    parsed.iso &&
    targetWindowPassed &&
    seasonSubject &&
    startGoverned &&
    !endGoverned &&
    !articleOrPageDate &&
    likelyValidOfficialUrl &&
    !duplicateExistingState;

  const strictReviewStatus =
    accepted ? "accepted_materializable_api_start_date_candidate" :
    duplicateExistingState ? "duplicate_existing_accepted_start_date_state" :
    !parsed.iso ? "rejected_unparsed_date" :
    !targetWindowPassed ? "rejected_outside_2026_2027_window" :
    endGoverned ? "rejected_end_or_final_date" :
    articleOrPageDate ? "rejected_article_or_page_date" :
    !seasonSubject ? "rejected_missing_season_subject" :
    !startGoverned ? "rejected_missing_start_governance" :
    !likelyValidOfficialUrl ? "rejected_non_official_or_malformed_url" :
    "rejected_unclassified";

  return {
    ...row,
    evidenceUrl: url,
    parsedDateIso: parsed.iso,
    dateParser: parsed.parser,
    targetSeasonLabel: "2026-2027",
    duplicateExistingState,
    acceptedAsMaterializableApiStartDateCandidate: accepted,
    strictReviewStatus,
    strictReviewSignals: {
      targetWindowPassed,
      seasonSubject,
      startGoverned,
      endGoverned,
      articleOrPageDate,
      likelyValidOfficialUrl,
      yearSeasonSignal
    }
  };
}

ensureDir(OUT_DIR);

const sourcePath = latestFile(/controlled-api-hint-start-date-candidates-\d{4}-\d{2}-\d{2}\.jsonl$/);
if (!sourcePath) throw new Error("Missing controlled API hint start-date candidates");

const acceptedStateSlugs = readAcceptedStateSlugs();
const rows = parseJsonlSafe(sourcePath);

const reviewRowsRaw = rows.map((row) => review(row, acceptedStateSlugs));

const deduped = new Map();
for (const row of reviewRowsRaw) {
  const key = `${row.competitionSlug}|${row.parsedDateIso || row.dateText}|${row.evidenceUrl}`;
  const prev = deduped.get(key);
  const score =
    (row.acceptedAsMaterializableApiStartDateCandidate ? 1000 : 0) +
    (row.strictReviewSignals.startGoverned ? 100 : 0) +
    (row.strictReviewSignals.seasonSubject ? 100 : 0) +
    (row.strictReviewSignals.yearSeasonSignal ? 50 : 0);
  const prevScore = prev ? (
    (prev.acceptedAsMaterializableApiStartDateCandidate ? 1000 : 0) +
    (prev.strictReviewSignals.startGoverned ? 100 : 0) +
    (prev.strictReviewSignals.seasonSubject ? 100 : 0) +
    (prev.strictReviewSignals.yearSeasonSignal ? 50 : 0)
  ) : -1;
  if (!prev || score > prevScore) deduped.set(key, row);
}

const reviewRows = [...deduped.values()].sort((a, b) =>
  Number(b.acceptedAsMaterializableApiStartDateCandidate) - Number(a.acceptedAsMaterializableApiStartDateCandidate) ||
  String(a.competitionSlug).localeCompare(String(b.competitionSlug)) ||
  String(a.parsedDateIso || "").localeCompare(String(b.parsedDateIso || ""))
);

const accepted = reviewRows.filter((row) => row.acceptedAsMaterializableApiStartDateCandidate);
const rejected = reviewRows.filter((row) => !row.acceptedAsMaterializableApiStartDateCandidate);

const summary = {
  status: "passed",
  runner: "api_start_date_evidence_review",
  sourceApiStartDateCandidatesPath: rel(sourcePath),
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  rawPayloadWriteExecutedNowCount: 0,
  inputCandidateCount: rows.length,
  dedupedCandidateCount: reviewRows.length,
  governedInputCandidateCount: rows.filter((row) => row.governedStartMention).length,
  strictAcceptedCandidateCount: accepted.length,
  rejectedCandidateCount: rejected.length,
  acceptedCompetitionSlugs: accepted.map((row) => row.competitionSlug),
  existingAcceptedStartDateStateSlugs: [...acceptedStateSlugs],
  statusCounts: reviewRows.reduce((acc, row) => {
    acc[row.strictReviewStatus] = (acc[row.strictReviewStatus] || 0) + 1;
    return acc;
  }, {}),
  recommendedNextLane:
    accepted.length > 0
      ? "materialize_api_start_date_evidence_after_explicit_approval_gate"
      : "continue_host_first_source_mining_for_start_dates_and_previous_completed_routes"
};

const outPath = path.join(OUT_DIR, `api-start-date-evidence-review-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `api-start-date-evidence-review-rows-${DATE}.jsonl`);
const acceptedPath = path.join(OUT_DIR, `api-start-date-accepted-evidence-candidates-${DATE}.jsonl`);
const rejectedPath = path.join(OUT_DIR, `api-start-date-rejected-evidence-candidates-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({ summary, accepted, rejected, reviewRows }, null, 2) + "\n", "utf8");
fs.writeFileSync(rowsPath, reviewRows.map((row) => JSON.stringify(row)).join("\n") + (reviewRows.length ? "\n" : ""), "utf8");
fs.writeFileSync(acceptedPath, accepted.map((row) => JSON.stringify(row)).join("\n") + (accepted.length ? "\n" : ""), "utf8");
fs.writeFileSync(rejectedPath, rejected.map((row) => JSON.stringify(row)).join("\n") + (rejected.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  reviewRowsOutput: rel(rowsPath),
  acceptedCandidatesOutput: rel(acceptedPath),
  rejectedCandidatesOutput: rel(rejectedPath),
  summary
}, null, 2));
