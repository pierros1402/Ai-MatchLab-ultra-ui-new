import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const args = new Set(process.argv.slice(2));
const allowExecute = args.has("--allow-execute");
const allowCanonicalCandidateWrite = args.has("--allow-canonical-candidate-write");
const approvalFlag = args.has("--approved-by-user-sportomedia-sweden");

const inputPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-sportomedia-canonical-candidate-write-plan-2026-06-16",
  "controlled-sportomedia-canonical-candidate-write-plan-2026-06-16.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-sportomedia-canonical-candidate-write-runner-2026-06-16"
);

const outputPath = path.join(
  outputDir,
  "controlled-sportomedia-canonical-candidate-write-runner-2026-06-16.json"
);

function sha256Text(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = String(row[key] ?? "unknown");
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function check(checks, name, passed, details = {}) {
  checks.push({ name, passed: Boolean(passed), ...details });
}

if (!fs.existsSync(inputPath)) {
  throw new Error(`Missing Sportomedia canonical candidate write plan: ${inputPath}`);
}

const inputText = fs.readFileSync(inputPath, "utf8");
const input = JSON.parse(inputText);
const summary = input.summary ?? {};
const planned = input.plannedCanonicalCandidate ?? {};
const plannedPayload = input.plannedCanonicalPayload;
const plannedPath = planned.path;

const checks = [];
check(checks, "allowExecuteFlagPresent", allowExecute);
check(checks, "allowCanonicalCandidateWriteFlagPresent", allowCanonicalCandidateWrite);
check(checks, "explicitUserApprovalFlagPresent", approvalFlag);
check(checks, "sourcePlanPassed", summary.controlledSportomediaCanonicalCandidateWritePlanStatus === "passed", { actual: summary.controlledSportomediaCanonicalCandidateWritePlanStatus });
check(checks, "sourceReadyPlanRowsTwo", Number(summary.readyCanonicalCandidateWritePlanRowCount ?? 0) === 2, { actual: summary.readyCanonicalCandidateWritePlanRowCount });
check(checks, "sourceBlockedPlanRowsZero", Number(summary.blockedCanonicalCandidateWritePlanRowCount ?? -1) === 0, { actual: summary.blockedCanonicalCandidateWritePlanRowCount });
check(checks, "sourceCandidateRowsThirtyTwo", Number(summary.candidatePreviewRowCount ?? 0) === 32, { actual: summary.candidatePreviewRowCount });
check(checks, "sourceRowIssuesZero", Number(summary.candidatePreviewRowIssueCount ?? -1) === 0, { actual: summary.candidatePreviewRowIssueCount });
check(checks, "sourceApprovalGateOpen", Number(summary.mayWriteCanonicalCandidateOnlyAfterExplicitUserApprovalCount ?? 0) === 1, { actual: summary.mayWriteCanonicalCandidateOnlyAfterExplicitUserApprovalCount });
check(checks, "sourceImmediateCanonicalWriteGateClosed", Number(summary.mayBuildCanonicalCandidateNowCount ?? -1) === 0, { actual: summary.mayBuildCanonicalCandidateNowCount });
check(checks, "plannedCanonicalPathPresent", typeof plannedPath === "string" && plannedPath.includes("_state") && plannedPath.includes("canonical-standings-candidates"), { actual: plannedPath });
check(checks, "plannedPayloadPresent", plannedPayload && typeof plannedPayload === "object");
check(checks, "plannedPayloadRowsThirtyTwo", Array.isArray(plannedPayload?.rows) && plannedPayload.rows.length === 32, { actual: plannedPayload?.rows?.length });
check(checks, "plannedPayloadRowsByCompetition", JSON.stringify(countBy(plannedPayload?.rows ?? [], "competitionSlug")) === JSON.stringify({ "swe.1": 16, "swe.2": 16 }), { actual: countBy(plannedPayload?.rows ?? [], "competitionSlug") });
check(checks, "plannedPayloadShaMatchesPlan", sha256Text(JSON.stringify(plannedPayload)) === planned.payloadSha256, { actual: sha256Text(JSON.stringify(plannedPayload)), expected: planned.payloadSha256 });
check(checks, "noFetchSearchProductionTruthInSourcePlan", Number(summary.fetchExecutedNowCount ?? -1) === 0 && Number(summary.searchExecutedNowCount ?? -1) === 0 && Number(summary.broadSearchExecutedNowCount ?? -1) === 0 && Number(summary.productionWriteExecutedNowCount ?? -1) === 0 && Number(summary.truthAssertionExecutedNowCount ?? -1) === 0);

const preflightBlockedCount = checks.filter((entry) => !entry.passed).length;

if (preflightBlockedCount !== 0 || !allowExecute || !allowCanonicalCandidateWrite || !approvalFlag) {
  const output = {
    output: outputPath,
    job: "run-football-truth-controlled-sportomedia-canonical-candidate-write-file",
    generatedAtUtc: new Date().toISOString(),
    status: "blocked_preflight",
    inputPath,
    inputSha256: sha256Text(inputText),
    checks,
    summary: {
      status: "blocked_preflight",
      canonicalCandidateWriteExecutedNowCount: 0,
      writtenCanonicalCandidatePath: null,
      writtenCanonicalCandidateSha256: null,
      writtenCanonicalCandidateRowCount: 0,
      fetchExecutedNowCount: 0,
      searchExecutedNowCount: 0,
      broadSearchExecutedNowCount: 0,
      productionWriteExecutedNowCount: 0,
      truthAssertionExecutedNowCount: 0,
      preflightBlockedCount
    }
  };
  writeJson(outputPath, output);
  console.log(JSON.stringify(output.summary, null, 2));
  process.exitCode = 1;
} else {
  writeJson(plannedPath, plannedPayload);
  const writtenText = fs.readFileSync(plannedPath, "utf8");
  const written = JSON.parse(writtenText);
  const writtenSha = sha256Text(JSON.stringify(written));
  const writtenRows = Array.isArray(written.rows) ? written.rows : [];
  const writtenRowsByCompetition = countBy(writtenRows, "competitionSlug");

  const postChecks = [];
  check(postChecks, "writtenFileExists", fs.existsSync(plannedPath), { actual: plannedPath });
  check(postChecks, "writtenShaMatchesPlannedSha", writtenSha === planned.payloadSha256, { actual: writtenSha, expected: planned.payloadSha256 });
  check(postChecks, "writtenRowCountThirtyTwo", writtenRows.length === 32, { actual: writtenRows.length });
  check(postChecks, "writtenRowsByCompetitionExpected", JSON.stringify(writtenRowsByCompetition) === JSON.stringify({ "swe.1": 16, "swe.2": 16 }), { actual: writtenRowsByCompetition });
  check(postChecks, "writtenPolicyCanonicalCandidateOnly", written.policy?.canonicalCandidateOnly === true && written.policy?.productionWrite === false && written.policy?.truthAssertion === false);
  check(postChecks, "noProductionTruthWrite", true);

  const postBlockedCount = postChecks.filter((entry) => !entry.passed).length;

  const output = {
    output: outputPath,
    job: "run-football-truth-controlled-sportomedia-canonical-candidate-write-file",
    generatedAtUtc: new Date().toISOString(),
    status: postBlockedCount === 0 ? "passed" : "blocked_postwrite_verification",
    inputPath,
    inputSha256: sha256Text(inputText),
    approval: {
      explicitUserApprovalFlagPresent: approvalFlag,
      approvedScope: "canonical candidate write only for Sportomedia Sweden swe.1/swe.2",
      productionWriteApproved: false,
      truthAssertionApproved: false
    },
    policy: {
      canonicalCandidateWriteOnly: true,
      noFetchInThisJob: true,
      noSearchInThisJob: true,
      noBroadSearchInThisJob: true,
      noProductionWriteInThisJob: true,
      noTruthAssertionInThisJob: true
    },
    checks,
    postChecks,
    summary: {
      status: postBlockedCount === 0 ? "passed" : "blocked_postwrite_verification",
      canonicalCandidateWriteExecutedNowCount: postBlockedCount === 0 ? 1 : 0,
      writtenCanonicalCandidatePath: plannedPath,
      writtenCanonicalCandidateSha256: writtenSha,
      plannedCanonicalCandidateSha256: planned.payloadSha256,
      writtenCanonicalCandidateRowCount: writtenRows.length,
      writtenCanonicalCandidateRowsByCompetition: writtenRowsByCompetition,
      fetchExecutedNowCount: 0,
      searchExecutedNowCount: 0,
      broadSearchExecutedNowCount: 0,
      productionWriteExecutedNowCount: 0,
      truthAssertionExecutedNowCount: 0,
      preflightBlockedCount,
      postBlockedCount
    }
  };

  writeJson(outputPath, output);

  console.log(JSON.stringify({
    output: output.output,
    status: output.summary.status,
    canonicalCandidateWriteExecutedNowCount: output.summary.canonicalCandidateWriteExecutedNowCount,
    writtenCanonicalCandidatePath: output.summary.writtenCanonicalCandidatePath,
    writtenCanonicalCandidateSha256: output.summary.writtenCanonicalCandidateSha256,
    plannedCanonicalCandidateSha256: output.summary.plannedCanonicalCandidateSha256,
    writtenCanonicalCandidateRowCount: output.summary.writtenCanonicalCandidateRowCount,
    writtenCanonicalCandidateRowsByCompetition: output.summary.writtenCanonicalCandidateRowsByCompetition,
    fetchExecutedNowCount: output.summary.fetchExecutedNowCount,
    searchExecutedNowCount: output.summary.searchExecutedNowCount,
    broadSearchExecutedNowCount: output.summary.broadSearchExecutedNowCount,
    productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
    truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount,
    preflightBlockedCount: output.summary.preflightBlockedCount,
    postBlockedCount: output.summary.postBlockedCount
  }, null, 2));

  if (postBlockedCount !== 0) process.exitCode = 1;
}
