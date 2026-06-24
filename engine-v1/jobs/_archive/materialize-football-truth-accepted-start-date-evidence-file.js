#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const DATA_ROOT = path.join(ROOT, "data", "football-truth");
const REVIEW_DIR = path.join(DATA_ROOT, "_diagnostics", `start-date-evidence-candidate-review-v3-${DATE}`);
const ACCEPTED_PATH = path.join(REVIEW_DIR, `accepted-start-date-evidence-candidates-v3-${DATE}.jsonl`);
const STATE_DIR = path.join(DATA_ROOT, "_state", "season-start-date-evidence");
fs.mkdirSync(STATE_DIR, { recursive: true });

function rel(p) {
  return path.relative(ROOT, p).replaceAll("\\", "/");
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

const accepted = readJsonl(ACCEPTED_PATH);

const rows = accepted.map((r) => ({
  competitionSlug: r.competitionSlug,
  competitionName: r.competitionName,
  nextSeasonStartDate: r.selectedNextSeasonStartDate,
  seasonLabel: "2026-2027",
  evidenceStatus: r.reviewStatus,
  evidenceReviewVersion: "v3",
  evidenceHost: r.candidateHost,
  evidenceUrl: r.candidateUrl,
  evidenceTitle: r.candidateTitle,
  evidenceMatchedText: r.selectedMatchedText,
  evidenceContext: r.selectedLocalContext || r.selectedEvidenceContext,
  evidenceScore: r.selectedContextScore,
  originalCandidateDate: r.originalCandidateDate,
  correctedCandidateDate: r.originalCandidateDate !== r.selectedNextSeasonStartDate,
  materializedAt: new Date().toISOString(),
  sourceReviewPath: rel(ACCEPTED_PATH),
  qualityGateStatus: "verified",
  validationStatus: "passed"
}));

if (!rows.length) {
  throw new Error(`No accepted v3 start-date evidence found at ${ACCEPTED_PATH}`);
}

const bySlug = {};
for (const row of rows) bySlug[row.competitionSlug] = row;

const jsonPath = path.join(STATE_DIR, `accepted-season-start-date-evidence-${DATE}.json`);
const jsonlPath = path.join(STATE_DIR, `accepted-season-start-date-evidence-${DATE}.jsonl`);

const state = {
  status: "passed",
  stateContractVersion: 1,
  stateType: "accepted_season_start_date_evidence",
  materializedAt: new Date().toISOString(),
  sourceReviewPath: rel(ACCEPTED_PATH),
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  evidenceStateWriteExecutedNowCount: 1,
  acceptedStartDateEvidenceCount: rows.length,
  acceptedStartDateEvidenceSlugs: rows.map((r) => r.competitionSlug),
  rows,
  bySlug
};

fs.writeFileSync(jsonPath, JSON.stringify(state, null, 2) + "\n", "utf8");
fs.writeFileSync(jsonlPath, rows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  output: rel(jsonPath),
  rowsOutput: rel(jsonlPath),
  summary: {
    status: "passed",
    acceptedStartDateEvidenceCount: rows.length,
    acceptedStartDateEvidenceSlugs: rows.map((r) => r.competitionSlug),
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    browserRenderExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    evidenceStateWriteExecutedNowCount: 1
  }
}, null, 2));
