import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const DIAG_ROOT = path.join(ROOT, "data", "football-truth", "_diagnostics");
const OUT_DIR = path.join(DIAG_ROOT, `bulk-api-start-date-materialization-approval-pack-${DATE}`);

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function rel(p) { return path.relative(ROOT, p).replaceAll("\\", "/"); }
function sha(value) { return crypto.createHash("sha256").update(String(value)).digest("hex"); }
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
function startEvidencePhrase(context, dateText) {
  const flat = String(context || "").replace(/\s+/g, " ").trim();
  const idx = flat.indexOf(dateText);
  if (idx >= 0) return flat.slice(Math.max(0, idx - 220), Math.min(flat.length, idx + 220)).trim();
  const n = norm(flat);
  const hits = ["kick off", "kicks off", "start", "starts", "begin", "begins", "opening"];
  const found = hits.map((h) => n.indexOf(h)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
  if (found >= 0) return flat.slice(Math.max(0, found - 220), Math.min(flat.length, found + 320)).trim();
  return flat.slice(0, 520);
}
function confidence(candidate) {
  const n = norm(candidate.context);
  const hasDirectStart = candidate.directStartGovernancePassed === true;
  const hasBad = candidate.badContextDetected === true;
  const numericOnly = candidate.numericOnly === true;
  const hasIsoDate = /\b2026-\d{2}-\d{2}\b/.test(candidate.context || "");
  const hasDateTimeAttr = /datetime\s*=\s*["']?2026-/i.test(candidate.context || "");
  const hasScheduleRoute = /(schedule|fixtures|league-season|regular-season)/i.test(candidate.finalUrl || "");
  const hasArticleSignals = /\b(news|article|release|story)\b/.test(n);
  let score = 0;
  if (hasDirectStart) score += 40;
  if (hasScheduleRoute) score += 20;
  if (hasIsoDate || hasDateTimeAttr) score += 20;
  if (numericOnly) score -= 10;
  if (hasArticleSignals) score -= 15;
  if (hasBad) score -= 40;
  return Math.max(0, Math.min(100, score));
}

ensureDir(OUT_DIR);

const acceptedPath = latestFile(/bulk-api-start-date-strict-accepted-\d{4}-\d{2}-\d{2}\.jsonl$/);
if (!acceptedPath) throw new Error("Missing strict accepted bulk API start-date candidates");

const accepted = readJsonl(acceptedPath);
const rows = accepted.map((c) => {
  const evidencePhrase = startEvidencePhrase(c.context, c.dateText);
  const evidenceConfidence = confidence(c);
  const materializationBlockedReason =
    evidenceConfidence < 70 ? "requires_manual_review_before_state_write" :
    c.numericOnly ? "numeric_date_requires_human_approval_before_state_write" :
    null;

  return {
    competitionSlug: c.competitionSlug,
    competitionName: c.competitionSlug === "usa.2" ? "USL Championship" : c.competitionSlug,
    seasonLabel: "2026",
    nextSeasonStartDate: c.parsedDate,
    evidenceHost: c.officialHost,
    evidenceUrl: c.finalUrl,
    evidenceStatus: "strict_review_accepted_pending_approval",
    qualityGateStatus: "approval_required",
    validationStatus: "pending_approval",
    sourceReviewStatus: c.reviewStatus,
    sourceReviewReason: c.reviewReason,
    dateText: c.dateText,
    evidencePhrase,
    evidenceContextSha256: sha(c.context),
    evidenceConfidence,
    materializationApprovalRequired: true,
    materializationBlockedReason,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    stateWriteExecutedNowCount: 0
  };
});

const summary = {
  status: "passed",
  runner: "bulk_api_start_date_materialization_approval_pack",
  sourceStrictAcceptedPath: rel(acceptedPath),
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  stateWriteExecutedNowCount: 0,
  approvalPackCandidateCount: rows.length,
  approvalRequiredCount: rows.filter((r) => r.materializationApprovalRequired).length,
  highConfidenceCount: rows.filter((r) => r.evidenceConfidence >= 70).length,
  blockedForManualReviewCount: rows.filter((r) => r.materializationBlockedReason).length,
  candidateSlugs: rows.map((r) => r.competitionSlug),
  recommendedNextLane: rows.length > 0
    ? "manual_approval_required_before_materializing_start_date_state"
    : "bulk_table_signal_review_or_expand_official_host_registry"
};

const outPath = path.join(OUT_DIR, `bulk-api-start-date-materialization-approval-pack-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `bulk-api-start-date-materialization-approval-pack-rows-${DATE}.jsonl`);
fs.writeFileSync(outPath, JSON.stringify({ summary, rows }, null, 2) + "\n", "utf8");
fs.writeFileSync(rowsPath, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({ output: rel(outPath), rowsOutput: rel(rowsPath), summary }, null, 2));
