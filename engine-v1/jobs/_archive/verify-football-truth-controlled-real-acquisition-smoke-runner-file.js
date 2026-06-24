import fs from "node:fs";
import path from "node:path";

const sourcePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-real-acquisition-smoke-runner-2026-06-15",
  "controlled-real-acquisition-smoke-runner-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-real-acquisition-smoke-runner-verification-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "controlled-real-acquisition-smoke-runner-verification-2026-06-15.json"
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function countNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function countBoolean(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function assertEqual(name, actual, expected, checks) {
  const passed = Object.is(actual, expected);
  checks.push({ name, actual, expected, passed });
  return passed;
}

function assertTrue(name, actual, checks) {
  const passed = actual === true;
  checks.push({ name, actual, expected: true, passed });
  return passed;
}

fs.mkdirSync(outputDir, { recursive: true });

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Missing source smoke runner diagnostic: ${sourcePath}`);
}

const source = readJson(sourcePath);
const sourceSummary = source && source.summary && typeof source.summary === "object" ? source.summary : source;
const checks = [];

const summary = {
  output: outputPath,
  sourcePath,
  controlledRealAcquisitionSmokeRunnerVerificationReadCount: 1,

  sourceSmokeRunnerOutputExists: fs.existsSync(sourcePath),
  sourceSummaryPresent: sourceSummary !== source || Object.prototype.hasOwnProperty.call(source, "summary"),

  controlledFetchAttemptCount: countNumber(sourceSummary.controlledFetchAttemptCount),
  controlledSearchAttemptCount: countNumber(sourceSummary.controlledSearchAttemptCount),
  controlledRealAcquisitionAttemptCount: countNumber(sourceSummary.controlledRealAcquisitionAttemptCount),

  respondedControlledFetchAttemptCount: countNumber(sourceSummary.respondedControlledFetchAttemptCount),
  respondedControlledSearchAttemptCount: countNumber(sourceSummary.respondedControlledSearchAttemptCount),

  okControlledFetchAttemptCount: countNumber(sourceSummary.okControlledFetchAttemptCount),
  okControlledSearchAttemptCount: countNumber(sourceSummary.okControlledSearchAttemptCount),

  acceptedEvidenceRowCount: countNumber(sourceSummary.acceptedEvidenceRowCount),
  acceptedEvidenceCompetitionCount: countNumber(sourceSummary.acceptedEvidenceCompetitionCount),
  standingsOrSeasonStateDeltaCandidateCount: countNumber(sourceSummary.standingsOrSeasonStateDeltaCandidateCount),
  canonicalWriteCandidateOnlyCount: countNumber(sourceSummary.canonicalWriteCandidateOnlyCount),

  laligaAcceptedEvidenceCount: countNumber(sourceSummary.laligaAcceptedEvidenceCount),
  norwayNtfAcceptedEvidenceCount: countNumber(sourceSummary.norwayNtfAcceptedEvidenceCount),
  sportomediaAcceptedEvidenceCount: countNumber(sourceSummary.sportomediaAcceptedEvidenceCount),

  controlledRealAcquisitionProducedEvidenceCount: countNumber(sourceSummary.controlledRealAcquisitionProducedEvidenceCount),
  mayVerifyControlledRealAcquisitionSmokeRunnerCount: countNumber(sourceSummary.mayVerifyControlledRealAcquisitionSmokeRunnerCount),

  fetchExecutedNowCount: countNumber(sourceSummary.fetchExecutedNowCount),
  searchExecutedNowCount: countNumber(sourceSummary.searchExecutedNowCount),
  broadSearchExecutedNowCount: countNumber(sourceSummary.broadSearchExecutedNowCount),
  classifierExecutedNowCount: countNumber(sourceSummary.classifierExecutedNowCount),
  canonicalWriteExecutedNowCount: countNumber(sourceSummary.canonicalWriteExecutedNowCount),
  productionWriteExecutedNowCount: countNumber(sourceSummary.productionWriteExecutedNowCount),
  truthAssertionExecutedNowCount: countNumber(sourceSummary.truthAssertionExecutedNowCount),

  canonicalWrites: countNumber(sourceSummary.canonicalWrites ?? source.canonicalWrites),
  productionWrite: countBoolean(sourceSummary.productionWrite ?? source.productionWrite)
};

assertTrue("sourceSmokeRunnerOutputExists", summary.sourceSmokeRunnerOutputExists, checks);
assertTrue("sourceSummaryPresent", summary.sourceSummaryPresent, checks);

assertEqual("controlledFetchAttemptCount", summary.controlledFetchAttemptCount, 6, checks);
assertEqual("controlledSearchAttemptCount", summary.controlledSearchAttemptCount, 6, checks);
assertEqual("controlledRealAcquisitionAttemptCount", summary.controlledRealAcquisitionAttemptCount, 12, checks);

assertEqual("respondedControlledFetchAttemptCount", summary.respondedControlledFetchAttemptCount, 6, checks);
assertEqual("respondedControlledSearchAttemptCount", summary.respondedControlledSearchAttemptCount, 6, checks);

assertEqual("okControlledFetchAttemptCount", summary.okControlledFetchAttemptCount, 6, checks);
assertEqual("okControlledSearchAttemptCount", summary.okControlledSearchAttemptCount, 6, checks);

assertEqual("acceptedEvidenceRowCount", summary.acceptedEvidenceRowCount, 12, checks);
assertEqual("acceptedEvidenceCompetitionCount", summary.acceptedEvidenceCompetitionCount, 6, checks);
assertEqual("standingsOrSeasonStateDeltaCandidateCount", summary.standingsOrSeasonStateDeltaCandidateCount, 12, checks);
assertEqual("canonicalWriteCandidateOnlyCount", summary.canonicalWriteCandidateOnlyCount, 12, checks);

assertEqual("laligaAcceptedEvidenceCount", summary.laligaAcceptedEvidenceCount, 4, checks);
assertEqual("norwayNtfAcceptedEvidenceCount", summary.norwayNtfAcceptedEvidenceCount, 4, checks);
assertEqual("sportomediaAcceptedEvidenceCount", summary.sportomediaAcceptedEvidenceCount, 4, checks);

assertEqual("controlledRealAcquisitionProducedEvidenceCount", summary.controlledRealAcquisitionProducedEvidenceCount, 1, checks);
assertEqual("mayVerifyControlledRealAcquisitionSmokeRunnerCount", summary.mayVerifyControlledRealAcquisitionSmokeRunnerCount, 1, checks);

assertEqual("fetchExecutedNowCount", summary.fetchExecutedNowCount, 6, checks);
assertEqual("searchExecutedNowCount", summary.searchExecutedNowCount, 6, checks);
assertEqual("broadSearchExecutedNowCount", summary.broadSearchExecutedNowCount, 0, checks);
assertEqual("classifierExecutedNowCount", summary.classifierExecutedNowCount, 0, checks);
assertEqual("canonicalWriteExecutedNowCount", summary.canonicalWriteExecutedNowCount, 0, checks);
assertEqual("productionWriteExecutedNowCount", summary.productionWriteExecutedNowCount, 0, checks);
assertEqual("truthAssertionExecutedNowCount", summary.truthAssertionExecutedNowCount, 0, checks);

assertEqual("canonicalWrites", summary.canonicalWrites, 0, checks);
assertEqual("productionWrite", summary.productionWrite, false, checks);

summary.verificationCheckCount = checks.length;
summary.passedVerificationCheckCount = checks.filter((check) => check.passed).length;
summary.blockedVerificationCheckCount = checks.filter((check) => !check.passed).length;
summary.controlledRealAcquisitionSmokeRunnerVerifiedCount = summary.blockedVerificationCheckCount === 0 ? 1 : 0;
summary.mayBuildAcceptedEvidencePromotionMeasurementBoardCount = summary.controlledRealAcquisitionSmokeRunnerVerifiedCount;
summary.verificationStatus = summary.blockedVerificationCheckCount === 0 ? "passed" : "blocked";
summary.checks = checks;

fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`);

console.log(JSON.stringify({
  output: summary.output,
  verificationStatus: summary.verificationStatus,
  verificationCheckCount: summary.verificationCheckCount,
  passedVerificationCheckCount: summary.passedVerificationCheckCount,
  blockedVerificationCheckCount: summary.blockedVerificationCheckCount,
  controlledRealAcquisitionSmokeRunnerVerifiedCount: summary.controlledRealAcquisitionSmokeRunnerVerifiedCount,
  mayBuildAcceptedEvidencePromotionMeasurementBoardCount: summary.mayBuildAcceptedEvidencePromotionMeasurementBoardCount
}, null, 2));

if (summary.blockedVerificationCheckCount !== 0) {
  process.exitCode = 1;
}
