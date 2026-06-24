import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const DATA_ROOT = path.join(ROOT, "data", "football-truth");
const DIAG_ROOT = path.join(DATA_ROOT, "_diagnostics");
const OUT_DIR = path.join(DIAG_ROOT, `api-start-date-evidence-review-v2-${DATE}`);

const MONTHS = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5,
  june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9,
  october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12
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
    }
    return u.toString();
  } catch {
    return raw;
  }
}

function readAcceptedStateSlugs() {
  const files = walk(path.join(DATA_ROOT, "_state")).filter((file) => /accepted-season-start-date-evidence-\d{4}-\d{2}-\d{2}\.jsonl$/.test(file));
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  const rows = parseJsonlSafe(files[0]);
  return new Set(rows.map((row) => row.competitionSlug).filter(Boolean));
}

function regexEscape(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dateLocalGovernance(context, dateText) {
  const c = String(context || "").replace(/\s+/g, " ");
  const variants = [
    String(dateText || ""),
    String(dateText || "").replace(",", ""),
    String(dateText || "").replace(/,/g, " ")
  ].filter(Boolean);
  let index = -1;
  let used = null;

  for (const variant of variants) {
    const re = new RegExp(regexEscape(variant).replace(/\s+/g, "\\s+"), "i");
    const m = c.match(re);
    if (m && typeof m.index === "number") {
      index = m.index;
      used = m[0];
      break;
    }
  }

  if (index < 0) {
    return {
      dateFoundInContext: false,
      localContext: c.slice(0, 520),
      startGovernedLocal: false,
      endGovernedLocal: false,
      seasonSubjectLocal: false,
      governanceType: "date_not_found"
    };
  }

  const dateEnd = index + used.length;
  const before = c.slice(Math.max(0, index - 180), index);
  const after = c.slice(dateEnd, Math.min(c.length, dateEnd + 120));
  const localContext = `${before}${used}${after}`.trim();
  const beforeN = normalizeText(before);
  const afterN = normalizeText(after);
  const localN = normalizeText(localContext);

  const startBeforeMatch = beforeN.match(/\b(start|starts|starting|begin|begins|beginning|kick off|kicks off|commence|commences|opening|opens|launch|launches)\b[^.;:]{0,140}$/);
  const endBeforeMatch = beforeN.match(/\b(end|ends|ending|conclude|concludes|concluding|finish|finishes|final day|final round|last round|wrap up)\b[^.;:]{0,140}$/);

  const startAfterMatch = afterN.match(/^[^.;:]{0,60}\b(start|starts|begin|begins|kick off|kicks off|commence|commences|opening)\b/);
  const endAfterMatch = afterN.match(/^[^.;:]{0,60}\b(end|ends|conclude|concludes|finish|finishes|final day|final round|last round)\b/);

  const seasonSubjectLocal =
    /\b(season|league|competition|campaign|calendar|schedule|fixture|fixtures|matchweek|round|matchday)\b/.test(localN);

  let governanceType = "none";
  if (startBeforeMatch && !endBeforeMatch) governanceType = "start_before_date";
  else if (endBeforeMatch && !startBeforeMatch) governanceType = "end_before_date";
  else if (startBeforeMatch && endBeforeMatch) {
    governanceType = beforeN.lastIndexOf(startBeforeMatch[1]) > beforeN.lastIndexOf(endBeforeMatch[1]) ? "start_before_date" : "end_before_date";
  } else if (startAfterMatch && !endAfterMatch) governanceType = "start_after_date";
  else if (endAfterMatch && !startAfterMatch) governanceType = "end_after_date";

  return {
    dateFoundInContext: true,
    localContext,
    startGovernedLocal: governanceType.startsWith("start"),
    endGovernedLocal: governanceType.startsWith("end"),
    seasonSubjectLocal,
    governanceType
  };
}

function review(row, acceptedSlugs) {
  const parsed = parseDateText(row.dateText);
  const evidenceUrl = cleanEvidenceUrl(row.finalUrl || row.sourceApiUrl || "");
  const duplicateExistingState = acceptedSlugs.has(row.competitionSlug);
  const local = dateLocalGovernance(row.context || "", row.dateText);

  const targetWindowPassed = !!parsed.iso && parsed.iso >= "2026-07-01" && parsed.iso <= "2027-06-30";
  const officialUrlPassed = !!evidenceUrl && hostFromUrl(evidenceUrl) === row.officialHost;

  const titleN = normalizeText(row.title || "");
  const contextN = normalizeText(row.context || "");
  const yearSeasonSignal =
    titleN.includes("2026-27") || titleN.includes("2026/27") || titleN.includes("2026 27") ||
    contextN.includes("2026-27") || contextN.includes("2026/27") || contextN.includes("2026 27") ||
    contextN.includes("2026-2027") || contextN.includes("2026 2027");

  const articleOrPageDate =
    local.localContext && /\b(published|updated|copyright|privacy|cookie|release day|released on)\b/.test(normalizeText(local.localContext));

  const accepted =
    row.governedStartMention === true &&
    parsed.iso &&
    targetWindowPassed &&
    officialUrlPassed &&
    local.dateFoundInContext &&
    local.seasonSubjectLocal &&
    local.startGovernedLocal &&
    !local.endGovernedLocal &&
    !articleOrPageDate &&
    !duplicateExistingState;

  const strictReviewStatus =
    accepted ? "accepted_materializable_api_start_date_candidate_v2" :
    duplicateExistingState ? "duplicate_existing_accepted_start_date_state" :
    !parsed.iso ? "rejected_unparsed_date" :
    !targetWindowPassed ? "rejected_outside_2026_2027_window" :
    !officialUrlPassed ? "rejected_non_official_or_malformed_url" :
    !local.dateFoundInContext ? "rejected_date_not_found_in_context" :
    articleOrPageDate ? "rejected_article_or_page_date" :
    local.endGovernedLocal ? "rejected_date_local_end_or_final_governance" :
    !local.startGovernedLocal ? "rejected_missing_date_local_start_governance" :
    !local.seasonSubjectLocal ? "rejected_missing_date_local_season_subject" :
    "rejected_unclassified";

  return {
    ...row,
    evidenceUrl,
    parsedDateIso: parsed.iso,
    dateParser: parsed.parser,
    targetSeasonLabel: "2026-2027",
    duplicateExistingState,
    acceptedAsMaterializableApiStartDateCandidateV2: accepted,
    strictReviewStatus,
    dateLocalGovernance: local,
    strictReviewSignals: {
      targetWindowPassed,
      officialUrlPassed,
      yearSeasonSignal,
      articleOrPageDate
    }
  };
}

ensureDir(OUT_DIR);

const sourcePath = latestFile(/controlled-api-hint-start-date-candidates-\d{4}-\d{2}-\d{2}\.jsonl$/);
if (!sourcePath) throw new Error("Missing controlled API hint start-date candidates");

const rows = parseJsonlSafe(sourcePath);
const acceptedStateSlugs = readAcceptedStateSlugs();
const rawReviews = rows.map((row) => review(row, acceptedStateSlugs));

const deduped = new Map();
for (const row of rawReviews) {
  const key = `${row.competitionSlug}|${row.parsedDateIso || row.dateText}|${row.evidenceUrl}`;
  const score =
    (row.acceptedAsMaterializableApiStartDateCandidateV2 ? 1000 : 0) +
    (row.dateLocalGovernance.startGovernedLocal ? 200 : 0) +
    (row.dateLocalGovernance.seasonSubjectLocal ? 100 : 0) +
    (row.strictReviewSignals.yearSeasonSignal ? 50 : 0);
  const prev = deduped.get(key);
  const prevScore = prev ? (
    (prev.acceptedAsMaterializableApiStartDateCandidateV2 ? 1000 : 0) +
    (prev.dateLocalGovernance.startGovernedLocal ? 200 : 0) +
    (prev.dateLocalGovernance.seasonSubjectLocal ? 100 : 0) +
    (prev.strictReviewSignals.yearSeasonSignal ? 50 : 0)
  ) : -1;
  if (!prev || score > prevScore) deduped.set(key, row);
}

const reviews = [...deduped.values()].sort((a, b) =>
  Number(b.acceptedAsMaterializableApiStartDateCandidateV2) - Number(a.acceptedAsMaterializableApiStartDateCandidateV2) ||
  String(a.competitionSlug).localeCompare(String(b.competitionSlug)) ||
  String(a.parsedDateIso || "").localeCompare(String(b.parsedDateIso || ""))
);

const accepted = reviews.filter((row) => row.acceptedAsMaterializableApiStartDateCandidateV2);
const rejected = reviews.filter((row) => !row.acceptedAsMaterializableApiStartDateCandidateV2);

const summary = {
  status: "passed",
  runner: "api_start_date_evidence_review_v2_date_local_governance",
  sourceApiStartDateCandidatesPath: rel(sourcePath),
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  rawPayloadWriteExecutedNowCount: 0,
  inputCandidateCount: rows.length,
  dedupedCandidateCount: reviews.length,
  strictAcceptedCandidateCount: accepted.length,
  rejectedCandidateCount: rejected.length,
  acceptedCompetitionSlugs: accepted.map((row) => row.competitionSlug),
  existingAcceptedStartDateStateSlugs: [...acceptedStateSlugs],
  statusCounts: reviews.reduce((acc, row) => {
    acc[row.strictReviewStatus] = (acc[row.strictReviewStatus] || 0) + 1;
    return acc;
  }, {}),
  recommendedNextLane:
    accepted.length > 0
      ? "materialize_api_start_date_evidence_after_explicit_approval_gate"
      : "continue_host_first_source_mining_for_start_dates_and_previous_completed_routes"
};

const outPath = path.join(OUT_DIR, `api-start-date-evidence-review-v2-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `api-start-date-evidence-review-v2-rows-${DATE}.jsonl`);
const acceptedPath = path.join(OUT_DIR, `api-start-date-accepted-evidence-candidates-v2-${DATE}.jsonl`);
const rejectedPath = path.join(OUT_DIR, `api-start-date-rejected-evidence-candidates-v2-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({ summary, accepted, rejected, reviews }, null, 2) + "\n", "utf8");
fs.writeFileSync(rowsPath, reviews.map((row) => JSON.stringify(row)).join("\n") + (reviews.length ? "\n" : ""), "utf8");
fs.writeFileSync(acceptedPath, accepted.map((row) => JSON.stringify(row)).join("\n") + (accepted.length ? "\n" : ""), "utf8");
fs.writeFileSync(rejectedPath, rejected.map((row) => JSON.stringify(row)).join("\n") + (rejected.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  reviewRowsOutput: rel(rowsPath),
  acceptedCandidatesOutput: rel(acceptedPath),
  rejectedCandidatesOutput: rel(rejectedPath),
  summary
}, null, 2));
