import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const DATA_ROOT = path.join(ROOT, "data", "football-truth");
const DIAG_ROOT = path.join(DATA_ROOT, "_diagnostics");
const STATE_DIR = path.join(DATA_ROOT, "_state", "season-start-date-evidence");
const args = new Set(process.argv.slice(2));

if (!args.has("--allow-state-write")) {
  throw new Error("Refusing accepted start-date evidence state write without --allow-state-write");
}

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

function latestFile(pattern, root) {
  const files = walk(root).filter((file) => pattern.test(file));
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] || null;
}

function hostFromUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; }
}

function loadExistingRows() {
  const latestJsonl = latestFile(/accepted-season-start-date-evidence-\d{4}-\d{2}-\d{2}\.jsonl$/, STATE_DIR);
  const rows = parseJsonlSafe(latestJsonl);
  if (rows.length > 0) return { latestJsonl, rows };

  const latestJson = latestFile(/accepted-season-start-date-evidence-\d{4}-\d{2}-\d{2}\.json$/, STATE_DIR);
  if (!latestJson || !fs.existsSync(latestJson)) return { latestJson: null, rows: [] };

  const parsed = JSON.parse(fs.readFileSync(latestJson, "utf8"));
  return {
    latestJson,
    rows:
      Array.isArray(parsed) ? parsed :
      Array.isArray(parsed.acceptedRows) ? parsed.acceptedRows :
      Array.isArray(parsed.rows) ? parsed.rows :
      []
  };
}

ensureDir(STATE_DIR);

const readyPath = latestFile(/start-date-materialization-ready-for-approval-\d{4}-\d{2}-\d{2}\.jsonl$/, DIAG_ROOT);
if (!readyPath) throw new Error("Missing start-date materialization ready-for-approval pack");

const readyRows = parseJsonlSafe(readyPath);
const approvedRows = readyRows.filter((row) =>
  row.competitionSlug === "ksa.1" &&
  row.startDateIso === "2026-08-13" &&
  row.seasonLabel === "2026-2027" &&
  row.sourceHost === "spl.com.sa" &&
  row.approvalGateStatus === "ready_for_explicit_user_approval" &&
  row.allGatesPassedBeforeApproval === true &&
  row.plannedAcceptedStateRow
);

if (approvedRows.length !== 1) {
  throw new Error(`Expected exactly one approved ksa.1 ready row, got ${approvedRows.length}`);
}

const approved = approvedRows[0];
if (hostFromUrl(approved.evidenceUrl) !== "spl.com.sa") {
  throw new Error("Approved evidence URL host does not match spl.com.sa");
}

const existing = loadExistingRows();
const existingWithoutKsa = existing.rows.filter((row) => row.competitionSlug !== "ksa.1");
const previousHadKsa = existing.rows.some((row) => row.competitionSlug === "ksa.1");

const stateRow = {
  competitionSlug: "ksa.1",
  competitionName: "Saudi Pro League",
  nextSeasonStartDate: "2026-08-13",
  seasonLabel: "2026-2027",
  evidenceStatus: "accepted_strict_official_start_date_v2_date_local_governance",
  evidenceReviewVersion: "api_start_date_evidence_review_v2_date_local_governance",
  evidenceHost: "spl.com.sa",
  evidenceUrl: approved.evidenceUrl,
  evidenceTitle: "SPL confirms 2026-27 season calendar",
  evidenceMatchedText: approved.evidenceDateText || "August 13, 2026",
  evidenceContext: approved.evidenceContext,
  evidenceGovernanceType: approved.evidenceGovernanceType,
  sourceReviewPath: rel(readyPath),
  materializedAt: new Date().toISOString(),
  materializedFromApprovalPack: rel(readyPath),
  qualityGateStatus: "verified",
  validationStatus: "passed",
  stateContractVersion: 1
};

const mergedRows = [...existingWithoutKsa, stateRow].sort((a, b) =>
  String(a.competitionSlug).localeCompare(String(b.competitionSlug)) ||
  String(a.seasonLabel || "").localeCompare(String(b.seasonLabel || ""))
);

const stateJsonPath = path.join(STATE_DIR, `accepted-season-start-date-evidence-${DATE}.json`);
const stateJsonlPath = path.join(STATE_DIR, `accepted-season-start-date-evidence-${DATE}.jsonl`);

const summary = {
  status: "passed",
  runner: "materialize_approved_start_date_evidence",
  sourceReadyForApprovalPath: rel(readyPath),
  previousAcceptedStartDateEvidenceCount: existing.rows.length,
  previousHadKsaRow: previousHadKsa,
  materializedCount: 1,
  acceptedStartDateEvidenceCount: mergedRows.length,
  materializedCompetitionSlugs: ["ksa.1"],
  acceptedCompetitionSlugs: mergedRows.map((row) => row.competitionSlug),
  schemaCompatibility: "ledger_contract_nextSeasonStartDate_qualityGate_validationStatus",
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  stateWriteExecutedNowCount: 2,
  rawPayloadWriteExecutedNowCount: 0
};

fs.writeFileSync(stateJsonPath, JSON.stringify({ summary, acceptedRows: mergedRows }, null, 2) + "\n", "utf8");
fs.writeFileSync(stateJsonlPath, mergedRows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  outputJson: rel(stateJsonPath),
  outputJsonl: rel(stateJsonlPath),
  summary
}, null, 2));
