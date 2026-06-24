import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const DATA_ROOT = path.join(ROOT, "data", "football-truth");
const DIAG_ROOT = path.join(DATA_ROOT, "_diagnostics");
const OUT_DIR = path.join(DIAG_ROOT, `start-date-materialization-approval-pack-${DATE}`);

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

function latestFile(pattern, root = DIAG_ROOT) {
  const files = walk(root).filter((file) => pattern.test(file));
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] || null;
}

function hostFromUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; }
}

function readExistingAcceptedRows() {
  const stateRoot = path.join(DATA_ROOT, "_state");
  const jsonl = latestFile(/accepted-season-start-date-evidence-\d{4}-\d{2}-\d{2}\.jsonl$/, stateRoot);
  return parseJsonlSafe(jsonl);
}

ensureDir(OUT_DIR);

const acceptedSourcePath = latestFile(/api-start-date-accepted-evidence-candidates-v2-\d{4}-\d{2}-\d{2}\.jsonl$/);
if (!acceptedSourcePath) throw new Error("Missing accepted API start-date candidates v2 file");

const acceptedCandidates = parseJsonlSafe(acceptedSourcePath);
const existingAcceptedRows = readExistingAcceptedRows();
const existingAcceptedSlugs = new Set(existingAcceptedRows.map((row) => row.competitionSlug).filter(Boolean));

const materializationRows = acceptedCandidates.map((candidate) => {
  const evidenceHost = hostFromUrl(candidate.evidenceUrl);
  const duplicateExistingState = existingAcceptedSlugs.has(candidate.competitionSlug);
  const gates = {
    sourceReviewRunner: "api_start_date_evidence_review_v2_date_local_governance",
    acceptedReviewStatus: candidate.strictReviewStatus,
    dateLocalGovernance: candidate.dateLocalGovernance,
    targetWindowPassed: candidate.strictReviewSignals?.targetWindowPassed === true,
    officialUrlPassed: candidate.strictReviewSignals?.officialUrlPassed === true,
    notDuplicateExistingState: !duplicateExistingState,
    evidenceHostMatchesOfficialHost: evidenceHost === candidate.officialHost,
    explicitApprovalRequiredBeforeStateWrite: true
  };

  const allGatesPassedBeforeApproval =
    candidate.acceptedAsMaterializableApiStartDateCandidateV2 === true &&
    candidate.parsedDateIso === "2026-08-13" &&
    candidate.targetSeasonLabel === "2026-2027" &&
    candidate.officialHost === "spl.com.sa" &&
    gates.targetWindowPassed &&
    gates.officialUrlPassed &&
    gates.evidenceHostMatchesOfficialHost &&
    gates.notDuplicateExistingState;

  return {
    competitionSlug: candidate.competitionSlug,
    displayName: candidate.displayName,
    seasonLabel: candidate.targetSeasonLabel,
    seasonScope: "next_season_start_date",
    startDateIso: candidate.parsedDateIso,
    evidenceDateText: candidate.dateText,
    sourceHost: candidate.officialHost,
    evidenceUrl: candidate.evidenceUrl,
    evidenceContext: candidate.dateLocalGovernance?.localContext || candidate.context,
    evidenceGovernanceType: candidate.dateLocalGovernance?.governanceType || null,
    approvalGateStatus: allGatesPassedBeforeApproval ? "ready_for_explicit_user_approval" : "blocked_before_approval",
    allGatesPassedBeforeApproval,
    duplicateExistingState,
    gates,
    plannedAcceptedStateRow: allGatesPassedBeforeApproval ? {
      competitionSlug: candidate.competitionSlug,
      displayName: candidate.displayName,
      seasonLabel: candidate.targetSeasonLabel,
      startDateIso: candidate.parsedDateIso,
      sourceHost: candidate.officialHost,
      evidenceUrl: candidate.evidenceUrl,
      evidenceText: candidate.dateLocalGovernance?.localContext || candidate.context,
      evidenceDateText: candidate.dateText,
      evidenceGovernanceType: candidate.dateLocalGovernance?.governanceType || null,
      sourceReviewRunner: "api_start_date_evidence_review_v2_date_local_governance",
      acceptedAt: DATE
    } : null
  };
});

const readyRows = materializationRows.filter((row) => row.approvalGateStatus === "ready_for_explicit_user_approval");
const blockedRows = materializationRows.filter((row) => row.approvalGateStatus !== "ready_for_explicit_user_approval");

const summary = {
  status: "passed",
  runner: "start_date_materialization_approval_pack",
  sourceAcceptedCandidatesPath: rel(acceptedSourcePath),
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  stateWriteExecutedNowCount: 0,
  rawPayloadWriteExecutedNowCount: 0,
  inputAcceptedCandidateCount: acceptedCandidates.length,
  readyForExplicitApprovalCount: readyRows.length,
  blockedBeforeApprovalCount: blockedRows.length,
  readyCompetitionSlugs: readyRows.map((row) => row.competitionSlug),
  existingAcceptedStartDateStateSlugs: [...existingAcceptedSlugs],
  explicitApprovalRequiredBeforeStateWrite: true,
  recommendedNextLane:
    readyRows.length > 0
      ? "after_user_approval_materialize_start_date_state_then_rerun_season_lane_and_lifecycle_ledgers"
      : "continue_source_mining_no_materialization_ready"
};

const outPath = path.join(OUT_DIR, `start-date-materialization-approval-pack-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `start-date-materialization-approval-pack-rows-${DATE}.jsonl`);
const readyPath = path.join(OUT_DIR, `start-date-materialization-ready-for-approval-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({ summary, readyRows, blockedRows, materializationRows }, null, 2) + "\n", "utf8");
fs.writeFileSync(rowsPath, materializationRows.map((row) => JSON.stringify(row)).join("\n") + (materializationRows.length ? "\n" : ""), "utf8");
fs.writeFileSync(readyPath, readyRows.map((row) => JSON.stringify(row)).join("\n") + (readyRows.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  readyForApprovalOutput: rel(readyPath),
  summary
}, null, 2));
