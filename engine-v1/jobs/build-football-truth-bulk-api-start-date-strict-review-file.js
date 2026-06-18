import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const DIAG_ROOT = path.join(ROOT, "data", "football-truth", "_diagnostics");
const OUT_DIR = path.join(DIAG_ROOT, `bulk-api-start-date-strict-review-${DATE}`);

const ALREADY_SATISFIED = new Set(["eng.1", "ksa.1"]);

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function rel(p) { return path.relative(ROOT, p).replaceAll("\\", "/"); }
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}
function latestFile(re) {
  const files = walk(DIAG_ROOT).filter((f) => re.test(f));
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] || null;
}
function readJsonl(file) {
  return fs.readFileSync(file, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}
function norm(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
function hostFromUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}
function canonicalDate(dateText, context, host) {
  const t = String(dateText || "").trim();
  const c = norm(context);
  const monthNames = {
    january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
    july: "07", august: "08", september: "09", october: "10", november: "11", december: "12"
  };

  let m = t.match(/\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(2026|2027)\b/i);
  if (m) return `${m[3]}-${monthNames[m[2].toLowerCase()]}-${String(m[1]).padStart(2, "0")}`;

  m = t.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(2026|2027)\b/i);
  if (m) return `${m[3]}-${monthNames[m[1].toLowerCase()]}-${String(m[2]).padStart(2, "0")}`;

  m = t.match(/\b(2026|2027)[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;

  m = t.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](2026|2027)\b/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]), y = m[3];
    const hostLower = String(host || "").toLowerCase();

    if (a > 12 && b <= 12) return `${y}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
    if (b > 12 && a <= 12) return `${y}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;

    const monthNameInContext = Object.keys(monthNames).find((month) => c.includes(month));
    if (monthNameInContext) {
      const mm = Number(monthNames[monthNameInContext]);
      if (a === mm) return `${y}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
      if (b === mm) return `${y}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
    }

    const isUsHost = /\.(com|org)$/.test(hostLower) && /(usl|usa|mls|nwsl|unitedsoccer)/.test(hostLower);
    if (isUsHost) return `${y}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;

    return null;
  }

  return null;
}
function reviewCandidate(c) {
  const context = String(c.context || "");
  const n = norm(context);
  const host = c.officialHost || hostFromUrl(c.finalUrl || c.apiUrl);
  const date = canonicalDate(c.dateText, context, host);

  const directStart =
    /\b(regular season|new season|league season|campaign|season)\b.{0,90}\b(kick(?:s)? off|start(?:s)?|begin(?:s)?|open(?:s|ing)?|commence(?:s)?)\b/.test(n) ||
    /\b(kick(?:s)? off|start(?:s)?|begin(?:s)?|open(?:s|ing)?|commence(?:s)?)\b.{0,90}\b(regular season|new season|league season|campaign|season)\b/.test(n) ||
    /\b(opening weekend|opening match|opening round|opening fixture|opening matchday)\b/.test(n);

  const badContext =
    /\b(published|updated|posted|copyright|privacy|cookie|all rights reserved|news archive|article|media release|download|sync|add to calendar|filter|standings|club stats|match center)\b/.test(n) ||
    /\b(end|ends|ending|conclude|concludes|finish|finishes|final day|final round|championship final|playoffs?|postseason)\b/.test(n);

  const numericOnly = /^\d{1,2}[-/.]\d{1,2}[-/.](2026|2027)$/.test(String(c.dateText || "").trim());
  const monthNamedInContext = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/.test(n);

  let status = "rejected";
  let reason = [];

  if (ALREADY_SATISFIED.has(c.competitionSlug)) reason.push("already_satisfied_slug");
  if (!date) reason.push("ambiguous_or_unparseable_date");
  if (!directStart) reason.push("no_direct_start_governance");
  if (badContext) reason.push("bad_or_non_start_context");
  if (numericOnly && !monthNamedInContext && !/(uslchampionship|mlsnextpro|cplsoccer)/i.test(host)) reason.push("numeric_only_without_month_name_context");

  if (date && directStart && !badContext && !ALREADY_SATISFIED.has(c.competitionSlug)) {
    status = "accepted_strict_start_date_candidate";
    reason = ["direct_start_governance_passed"];
  }

  return {
    competitionSlug: c.competitionSlug,
    taskType: c.taskType,
    officialHost: c.officialHost,
    sourceHost: hostFromUrl(c.finalUrl || c.apiUrl),
    finalUrl: c.finalUrl,
    apiUrl: c.apiUrl,
    dateText: c.dateText,
    parsedDate: date,
    governedStartMention: Boolean(c.governedStartMention),
    directStartGovernancePassed: directStart,
    badContextDetected: badContext,
    numericOnly,
    monthNamedInContext,
    reviewStatus: status,
    reviewReason: reason.join("|"),
    context
  };
}

ensureDir(OUT_DIR);

const sourcePath = latestFile(/bulk-api-hint-start-date-candidates-\d{4}-\d{2}-\d{2}\.jsonl$/);
if (!sourcePath) throw new Error("Missing bulk API hint start-date candidates file");

const all = readJsonl(sourcePath);
const governed = all.filter((c) => c.governedStartMention);
const reviewed = governed.map(reviewCandidate);

const dedupedMap = new Map();
for (const r of reviewed) {
  const key = `${r.competitionSlug}|${r.parsedDate || r.dateText}|${r.reviewStatus}`;
  if (!dedupedMap.has(key)) dedupedMap.set(key, r);
}
const deduped = [...dedupedMap.values()];

const accepted = deduped.filter((r) => r.reviewStatus === "accepted_strict_start_date_candidate");
const rejected = deduped.filter((r) => r.reviewStatus !== "accepted_strict_start_date_candidate");

const summary = {
  status: "passed",
  runner: "bulk_api_start_date_strict_review",
  sourceStartDateCandidatesPath: rel(sourcePath),
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  rawPayloadWriteExecutedNowCount: 0,
  inputStartDateCandidateCount: all.length,
  governedStartDateCandidateCount: governed.length,
  dedupedGovernedCandidateCount: deduped.length,
  acceptedStrictStartDateCandidateCount: accepted.length,
  rejectedStrictStartDateCandidateCount: rejected.length,
  acceptedCompetitionSlugs: accepted.map((r) => r.competitionSlug),
  rejectedCompetitionSlugs: [...new Set(rejected.map((r) => r.competitionSlug))].sort(),
  recommendedNextLane:
    accepted.length > 0
      ? "build_start_date_materialization_approval_pack_for_strict_accepted_candidates"
      : "bulk_table_signal_review_or_expand_official_host_registry"
};

const outPath = path.join(OUT_DIR, `bulk-api-start-date-strict-review-${DATE}.json`);
const acceptedPath = path.join(OUT_DIR, `bulk-api-start-date-strict-accepted-${DATE}.jsonl`);
const rejectedPath = path.join(OUT_DIR, `bulk-api-start-date-strict-rejected-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({ summary, accepted, rejected, reviewed: deduped }, null, 2) + "\n", "utf8");
fs.writeFileSync(acceptedPath, accepted.map((r) => JSON.stringify(r)).join("\n") + (accepted.length ? "\n" : ""), "utf8");
fs.writeFileSync(rejectedPath, rejected.map((r) => JSON.stringify(r)).join("\n") + (rejected.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({ output: rel(outPath), acceptedOutput: rel(acceptedPath), rejectedOutput: rel(rejectedPath), summary }, null, 2));
