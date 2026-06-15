import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";
const ALLOW_WRITE = process.argv.includes("--allow-write");

const approvalPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "six-league-explicit-write-approval-gate-2026-06-15",
  "six-league-explicit-write-approval-gate-2026-06-15.json"
);

const candidatePlanPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "six-league-controlled-promotion-candidate-plan-2026-06-15",
  "six-league-controlled-promotion-candidate-plan-2026-06-15.json"
);

const memoryPath = path.join("data", "football-truth", "source-authority-memory.json");

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "six-league-controlled-write-runner-2026-06-15"
);

const outputPath = path.join(outDir, "six-league-controlled-write-runner-2026-06-15.json");
const backupPath = path.join(outDir, "source-authority-memory.before-six-league-controlled-write-2026-06-15.json");

const targetCompetitions = ["esp.1", "esp.2", "nor.1", "nor.2", "swe.1", "swe.2"];

const canonicalAreaMap = {
  standings_statistics: "standingsStats",
  fixtures_results: "fixturesResults",
  season_state: "seasonState",
  next_active_restart_date: "nextActiveRestartDate"
};

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required input file: ${filePath}`);
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assertZero(value, name) {
  if (value !== undefined && value !== null && value !== 0) {
    throw new Error(`Expected ${name}=0, got ${value}`);
  }
}

function assertFalse(value, name) {
  if (value !== undefined && value !== null && value !== false) {
    throw new Error(`Expected ${name}=false, got ${value}`);
  }
}

function countWhere(rows, predicate) {
  return rows.filter(predicate).length;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function assertApprovalGate(approval) {
  const s = approval.summary || {};

  if (s.writeApprovalRowCount !== 18) throw new Error(`Expected writeApprovalRowCount=18, got ${s.writeApprovalRowCount}`);
  if (s.approvedWriteApprovalRowCount !== 18) throw new Error(`Expected approvedWriteApprovalRowCount=18, got ${s.approvedWriteApprovalRowCount}`);
  if (s.blockedWriteApprovalRowCount !== 0) throw new Error(`Expected blockedWriteApprovalRowCount=0, got ${s.blockedWriteApprovalRowCount}`);
  if (s.allCompetitionWriteApprovalsReadyCount !== 6) throw new Error(`Expected allCompetitionWriteApprovalsReadyCount=6, got ${s.allCompetitionWriteApprovalsReadyCount}`);
  if (s.mayBuildSixLeagueControlledWriteRunnerCount !== 1) throw new Error("Expected mayBuildSixLeagueControlledWriteRunnerCount=1");
  if (s.nextRunnerMayStageCanonicalWriteCount !== 18) throw new Error("Expected nextRunnerMayStageCanonicalWriteCount=18");
  if (s.nextRunnerMayStageTruthAssertionCount !== 18) throw new Error("Expected nextRunnerMayStageTruthAssertionCount=18");

  [
    "writeApprovalIsExecutionPermissionNowCount",
    "writeApprovalIsFetchPermissionNowCount",
    "writeApprovalIsSearchPermissionNowCount",
    "writeApprovalIsBroadSearchPermissionNowCount",
    "writeApprovalIsClassifierPermissionNowCount",
    "writeApprovalIsCanonicalWritePermissionNowCount",
    "writeApprovalIsProductionWritePermissionNowCount",
    "writeApprovalIsTruthAssertionPermissionNowCount",
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "seasonStateTruthAssertedCount",
    "sixLeagueExplicitWriteApprovalGateTruthCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `approval.summary.${key}`));

  assertZero(approval.canonicalWrites, "approval.canonicalWrites");
  assertFalse(approval.productionWrite, "approval.productionWrite");
  assertFalse(approval.sourceFetch?.executed, "approval.sourceFetch.executed");
  assertFalse(approval.searchProviderUsed, "approval.searchProviderUsed");
  assertFalse(approval.broadSearchUsed, "approval.broadSearchUsed");
  assertFalse(approval.classifierExecuted, "approval.classifierExecuted");
}

function assertCandidatePlan(candidatePlan) {
  const s = candidatePlan.summary || {};

  if (s.promotionCandidateRowCount !== 18) throw new Error(`Expected promotionCandidateRowCount=18, got ${s.promotionCandidateRowCount}`);
  if (s.blockedPromotionCandidateRowCount !== 0) throw new Error(`Expected blockedPromotionCandidateRowCount=0, got ${s.blockedPromotionCandidateRowCount}`);
  if (s.allCompetitionPromotionPackagesReadyCount !== 6) throw new Error("Expected all competition promotion packages ready");

  [
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "seasonStateTruthAssertedCount",
    "sixLeagueControlledPromotionCandidatePlanTruthCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `candidatePlan.summary.${key}`));

  assertZero(candidatePlan.canonicalWrites, "candidatePlan.canonicalWrites");
  assertFalse(candidatePlan.productionWrite, "candidatePlan.productionWrite");
  assertFalse(candidatePlan.sourceFetch?.executed, "candidatePlan.sourceFetch.executed");
  assertFalse(candidatePlan.searchProviderUsed, "candidatePlan.searchProviderUsed");
  assertFalse(candidatePlan.broadSearchUsed, "candidatePlan.broadSearchUsed");
  assertFalse(candidatePlan.classifierExecuted, "candidatePlan.classifierExecuted");
}

function findSlugKey(record) {
  for (const key of ["competitionSlug", "slug", "competitionId", "competition"]) {
    if (typeof record?.[key] === "string") return key;
  }
  return "competitionSlug";
}

function recordSlug(record) {
  for (const key of ["competitionSlug", "slug", "competitionId", "competition"]) {
    if (typeof record?.[key] === "string") return record[key];
  }
  return null;
}

function familyForSlug(slug) {
  if (slug.startsWith("esp.")) return "laliga";
  if (slug.startsWith("nor.")) return "norway_ntf";
  if (slug.startsWith("swe.")) return "sportomedia";
  return "unknown";
}

function ensureRecord(memory, slug) {
  const existing = memory.records.find((record) => recordSlug(record) === slug);

  if (existing) {
    return { record: existing, created: false };
  }

  const record = {
    competitionSlug: slug,
    family: familyForSlug(slug),
    controlledEvidenceStatus: "created_by_six_league_controlled_write_runner",
    createdAt: new Date().toISOString()
  };

  memory.records.push(record);
  return { record, created: true };
}

function promotionCandidateForApprovalRow(row, candidateRows) {
  return candidateRows.find(
    (candidate) =>
      candidate.promotionCandidateRowId === row.promotionCandidateRowId &&
      candidate.competitionSlug === row.competitionSlug &&
      candidate.evidenceArea === row.evidenceArea
  );
}

function buildAreaEvidenceObject({ approvalRow, candidateRow, canonicalTargetArea, promotedAt }) {
  return {
    status: "trusted_source_authority_evidence_promoted",
    evidenceArea: approvalRow.evidenceArea,
    canonicalTargetArea,
    competitionSlug: approvalRow.competitionSlug,
    family: approvalRow.family,
    sourceRawPayloadFile: approvalRow.sourceRawPayloadFile,
    sourceRoutePurpose: approvalRow.sourceRoutePurpose,
    writeApprovalRowId: approvalRow.writeApprovalRowId,
    previewRowId: approvalRow.previewRowId,
    promotionCandidateRowId: approvalRow.promotionCandidateRowId,
    controlledPromotionLane: approvalRow.controlledPromotionLane,
    routeBackedCandidate: true,
    parserSignalBackedCandidate: candidateRow?.parserSignalBackedCandidate === true,
    sourceResponseRawTextLength: candidateRow?.sourceResponseRawTextLength || null,
    promotedAt,
    promotionMode: "controlled_write_runner_explicit_allow_write",
    truthAssertionStatus: "source_backed_evidence_area_asserted_from_approved_controlled_pipeline",
    productionWrite: false
  };
}

const approval = readJson(approvalPath);
const candidatePlan = readJson(candidatePlanPath);
const memory = readJson(memoryPath);

assertApprovalGate(approval);
assertCandidatePlan(candidatePlan);

if (!ALLOW_WRITE) {
  throw new Error("Refusing to mutate source-authority-memory.json without explicit --allow-write");
}

if (!Array.isArray(memory.records)) {
  throw new Error("source-authority-memory.json must contain a records array");
}

const approvalRows = Array.isArray(approval.writeApprovalRows) ? approval.writeApprovalRows : [];
const approvedRows = approvalRows.filter((row) => row.approvalStatus === "approved_to_build_controlled_write_runner");
const candidateRows = Array.isArray(candidatePlan.promotionCandidateRows) ? candidatePlan.promotionCandidateRows : [];

if (approvedRows.length !== 18) {
  throw new Error(`Expected 18 approved write rows, got ${approvedRows.length}`);
}

const approvedCompetitions = unique(approvedRows.map((row) => row.competitionSlug)).sort();

if (JSON.stringify(approvedCompetitions) !== JSON.stringify(targetCompetitions)) {
  throw new Error(`Unexpected approved competition set: ${JSON.stringify(approvedCompetitions)}`);
}

for (const row of approvedRows) {
  if (!targetCompetitions.includes(row.competitionSlug)) {
    throw new Error(`Blocked write outside approved six-league set: ${row.competitionSlug}`);
  }

  if (!canonicalAreaMap[row.evidenceArea]) {
    throw new Error(`Unknown evidence area: ${row.evidenceArea}`);
  }

  if (!fs.existsSync(row.sourceRawPayloadFile)) {
    throw new Error(`Missing raw payload file for approved row: ${row.sourceRawPayloadFile}`);
  }

  if (row.nextRunnerMayStageCanonicalWrite !== true || row.nextRunnerMayStageTruthAssertion !== true) {
    throw new Error(`Approved row lacks next-runner write permissions: ${row.writeApprovalRowId}`);
  }

  if (row.nextRunnerRequiresExplicitAllowWriteFlag !== true) {
    throw new Error(`Approved row does not require explicit allow-write flag: ${row.writeApprovalRowId}`);
  }
}

fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(memoryPath, backupPath);

const beforeRecordCount = memory.records.length;
const beforeTargetRecordCount = countWhere(memory.records, (record) => targetCompetitions.includes(recordSlug(record)));
const promotedAt = new Date().toISOString();

const writeRows = [];
const createdCompetitionSlugs = new Set();
const updatedCompetitionSlugs = new Set();

for (const approvalRow of approvedRows) {
  const canonicalTargetArea = canonicalAreaMap[approvalRow.evidenceArea];
  const candidateRow = promotionCandidateForApprovalRow(approvalRow, candidateRows);
  const { record, created } = ensureRecord(memory, approvalRow.competitionSlug);

  const slugKey = findSlugKey(record);
  record[slugKey] = approvalRow.competitionSlug;

  if (!record.family) record.family = approvalRow.family;
  if (!record.providerFamily) record.providerFamily = approvalRow.family;

  record.controlledSixLeagueEvidencePromotion = {
    status: "six_league_controlled_evidence_promoted",
    lastPromotedAt: promotedAt,
    sourceApprovalGate: approvalPath.replace(/\\/g, "/"),
    sourceCandidatePlan: candidatePlanPath.replace(/\\/g, "/"),
    productionWrite: false,
    canonicalWriteRequiresExplicitApproval: true,
    truthAssertionRequiresExplicitApproval: true
  };

  record[canonicalTargetArea] = buildAreaEvidenceObject({
    approvalRow,
    candidateRow,
    canonicalTargetArea,
    promotedAt
  });

  record.updatedAt = promotedAt;

  if (created) createdCompetitionSlugs.add(approvalRow.competitionSlug);
  else updatedCompetitionSlugs.add(approvalRow.competitionSlug);

  writeRows.push({
    controlledWriteRowId: `six_league_controlled_write_${String(writeRows.length + 1).padStart(2, "0")}`,
    writeApprovalRowId: approvalRow.writeApprovalRowId,
    competitionSlug: approvalRow.competitionSlug,
    family: approvalRow.family,
    evidenceArea: approvalRow.evidenceArea,
    canonicalTargetArea,
    sourceRawPayloadFile: approvalRow.sourceRawPayloadFile,
    writeStatus: "staged_to_source_authority_memory",
    canonicalWriteExecutedNow: true,
    truthAssertionStagedNow: true,
    productionWriteExecutedNow: false
  });
}

memory.updatedAt = promotedAt;
memory.lastControlledWrite = {
  status: "six_league_controlled_write_completed",
  date: DATE,
  promotedAt,
  targetCompetitions,
  stagedCanonicalEvidenceAreaWriteCount: writeRows.length,
  stagedTruthAssertionCount: writeRows.length,
  sourceApprovalGate: approvalPath.replace(/\\/g, "/"),
  diagnosticsOutput: outputPath.replace(/\\/g, "/"),
  productionWrite: false
};

writeJson(memoryPath, memory);

const afterMemory = readJson(memoryPath);
const afterRecordCount = afterMemory.records.length;
const afterTargetRecords = afterMemory.records.filter((record) => targetCompetitions.includes(recordSlug(record)));

const missingTargetRecords = targetCompetitions.filter(
  (slug) => !afterTargetRecords.some((record) => recordSlug(record) === slug)
);

const missingTargetAreas = [];

for (const slug of targetCompetitions) {
  const record = afterTargetRecords.find((item) => recordSlug(item) === slug);
  const requiredAreas = slug.startsWith("esp.")
    ? ["nextActiveRestartDate"]
    : ["standingsStats", "fixturesResults", "seasonState", "nextActiveRestartDate"];

  for (const area of requiredAreas) {
    if (!record?.[area]) {
      missingTargetAreas.push({ competitionSlug: slug, canonicalTargetArea: area });
    }
  }
}

if (missingTargetRecords.length > 0 || missingTargetAreas.length > 0) {
  throw new Error(
    `Post-write verification failed. missingTargetRecords=${JSON.stringify(missingTargetRecords)} missingTargetAreas=${JSON.stringify(missingTargetAreas)}`
  );
}

const summary = {
  sixLeagueControlledWriteRunnerReadCount: 1,
  allowWriteFlagPresent: ALLOW_WRITE,

  sourceWriteApprovalRowCount: approvalRows.length,
  approvedWriteApprovalRowCount: approvedRows.length,
  blockedWriteApprovalRowCount: approvalRows.length - approvedRows.length,

  targetMemoryFile: memoryPath.replace(/\\/g, "/"),
  memoryBackupPath: backupPath.replace(/\\/g, "/"),
  memoryRecordCountBefore: beforeRecordCount,
  memoryRecordCountAfter: afterRecordCount,
  targetCompetitionRecordCountBefore: beforeTargetRecordCount,
  targetCompetitionRecordCountAfter: afterTargetRecords.length,

  controlledWriteRowCount: writeRows.length,
  upsertedCompetitionRecordCount: targetCompetitions.length,
  createdCompetitionRecordCount: createdCompetitionSlugs.size,
  updatedCompetitionRecordCount: updatedCompetitionSlugs.size,

  laligaControlledWriteCount: countWhere(writeRows, (row) => row.family === "laliga"),
  norwayNtfControlledWriteCount: countWhere(writeRows, (row) => row.family === "norway_ntf"),
  sportomediaControlledWriteCount: countWhere(writeRows, (row) => row.family === "sportomedia"),

  standingsStatsControlledWriteCount: countWhere(writeRows, (row) => row.canonicalTargetArea === "standingsStats"),
  fixturesResultsControlledWriteCount: countWhere(writeRows, (row) => row.canonicalTargetArea === "fixturesResults"),
  seasonStateControlledWriteCount: countWhere(writeRows, (row) => row.canonicalTargetArea === "seasonState"),
  nextActiveRestartDateControlledWriteCount: countWhere(writeRows, (row) => row.canonicalTargetArea === "nextActiveRestartDate"),

  stagedCanonicalEvidenceAreaWriteCount: writeRows.length,
  stagedTruthAssertionCount: writeRows.length,

  fetchExecutedNowCount: 0,
  searchExecutedNowCount: 0,
  broadSearchExecutedNowCount: 0,
  classifierExecutedNowCount: 0,

  canonicalWriteExecutedNowCount: writeRows.length,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: writeRows.length,
  seasonStateTruthAssertedCount: countWhere(writeRows, (row) => row.canonicalTargetArea === "seasonState"),

  canonicalWrites: writeRows.length,
  productionWrite: false
};

const artifact = {
  job: "run-football-truth-six-league-controlled-write-runner-file",
  date: DATE,
  generatedAt: promotedAt,
  mode: "actual_controlled_source_authority_memory_write_explicit_allow_write",
  dryRun: false,
  inputs: {
    sixLeagueExplicitWriteApprovalGate: approvalPath,
    sixLeagueControlledPromotionCandidatePlan: candidatePlanPath,
    sourceAuthorityMemory: memoryPath
  },
  policy: {
    explicitAllowWriteFlagRequired: true,
    writeOnlyApprovedSixLeagueRows: true,
    targetMemoryFile: memoryPath.replace(/\\/g, "/"),
    backupBeforeWrite: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noProductionWrite: true
  },
  summary,
  writeRows,
  missingTargetRecords,
  missingTargetAreas,
  sourceFetch: { allowed: false, executed: false },
  searchProviderUsed: false,
  broadSearchUsed: false,
  classifierExecuted: false,
  canonicalWrites: writeRows.length,
  productionWrite: false
};

writeJson(outputPath, artifact);

console.log(JSON.stringify({ output: outputPath, ...summary }, null, 2));
