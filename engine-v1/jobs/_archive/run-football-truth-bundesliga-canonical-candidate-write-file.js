import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const args = new Set(process.argv.slice(2));
const allowExecute = args.has("--allow-execute");
const allowCanonicalCandidateWrite = args.has("--allow-canonical-candidate-write");
const approvedByUser = args.has("--approved-by-user-bundesliga-official");

const planPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "bundesliga-exact-route-quality-gate-and-canonical-write-plan-2026-06-16",
  "bundesliga-exact-route-quality-gate-and-canonical-write-plan-2026-06-16.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "bundesliga-canonical-candidate-write-runner-2026-06-16"
);

const outputPath = path.join(
  outputDir,
  "bundesliga-canonical-candidate-write-runner-2026-06-16.json"
);

const expectedCandidatePath = path.join(
  "data",
  "football-truth",
  "_state",
  "canonical-standings-candidates",
  "bundesliga-official-standings-candidates-2026-06-16.json"
);

const expectedSha = "7f2d8691676139ebe8ad6aaba46852ee0c0444bec6474a6d3d34d8efeba2b39c";

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

if (!fs.existsSync(planPath)) {
  throw new Error(`Missing Bundesliga canonical candidate write plan: ${planPath}`);
}

const planText = fs.readFileSync(planPath, "utf8");
const plan = JSON.parse(planText);
const summary = plan.summary ?? {};
const payload = plan.plannedCanonicalCandidatePayload ?? null;
const candidateRows = Array.isArray(payload?.rows) ? payload.rows : [];
const candidateText = `${JSON.stringify(payload, null, 2)}\n`;
const candidateSha = sha256Text(candidateText);
const candidateRowsByCompetition = countBy(candidateRows, "competitionSlug");

const checks = [];
check(checks, "allowExecuteFlagPresent", allowExecute);
check(checks, "allowCanonicalCandidateWriteFlagPresent", allowCanonicalCandidateWrite);
check(checks, "approvedByUserBundesligaOfficialFlagPresent", approvedByUser);
check(checks, "sourcePlanPassed", summary.bundesligaExactRouteQualityGateAndCanonicalWritePlanStatus === "passed", { actual: summary.bundesligaExactRouteQualityGateAndCanonicalWritePlanStatus });
check(checks, "sourcePlanApprovalGateOpen", Number(summary.mayWriteCanonicalCandidateOnlyAfterExplicitUserApprovalCount ?? 0) === 1, { actual: summary.mayWriteCanonicalCandidateOnlyAfterExplicitUserApprovalCount });
check(checks, "sourcePlanNoImmediateCanonicalGate", Number(summary.mayBuildCanonicalCandidateNowCount ?? -1) === 0, { actual: summary.mayBuildCanonicalCandidateNowCount });
check(checks, "sourcePlanNoForbiddenActions", Number(summary.fetchExecutedNowCount ?? -1) === 0 && Number(summary.searchExecutedNowCount ?? -1) === 0 && Number(summary.broadSearchExecutedNowCount ?? -1) === 0 && Number(summary.canonicalWriteExecutedNowCount ?? -1) === 0 && Number(summary.productionWriteExecutedNowCount ?? -1) === 0 && Number(summary.truthAssertionExecutedNowCount ?? -1) === 0);
check(checks, "plannedPathExpected", path.normalize(summary.plannedCanonicalCandidatePath ?? "") === path.normalize(expectedCandidatePath), { actual: summary.plannedCanonicalCandidatePath, expected: expectedCandidatePath });
check(checks, "plannedShaExpected", summary.plannedCanonicalCandidateSha256 === expectedSha, { actual: summary.plannedCanonicalCandidateSha256, expected: expectedSha });
check(checks, "candidatePayloadPresent", Boolean(payload));
check(checks, "candidateShaMatchesPlan", candidateSha === expectedSha, { actual: candidateSha, expected: expectedSha });
check(checks, "candidateRowsThirtySix", candidateRows.length === 36, { actual: candidateRows.length, expected: 36 });
check(checks, "candidateRowsByCompetitionExpected", Number(candidateRowsByCompetition["ger.1"] ?? 0) === 18 && Number(candidateRowsByCompetition["ger.2"] ?? 0) === 18, { actual: candidateRowsByCompetition, expected: { "ger.1": 18, "ger.2": 18 } });
check(checks, "candidateRowIssuesZero", candidateRows.every((row) => Array.isArray(row.rowIssueCodes) && row.rowIssueCodes.length === 0));
check(checks, "productionAndTruthLocked", true);

const preflightBlockedCount = checks.filter((entry) => !entry.passed).length;

if (preflightBlockedCount !== 0 || !allowExecute || !allowCanonicalCandidateWrite || !approvedByUser) {
  const output = {
    output: outputPath,
    job: "run-football-truth-bundesliga-canonical-candidate-write-file",
    generatedAtUtc: new Date().toISOString(),
    status: "blocked_preflight",
    sourcePlanPath: planPath,
    sourcePlanSha256: sha256Text(planText),
    checks,
    summary: {
      status: "blocked_preflight",
      canonicalCandidateWriteExecutedNowCount: 0,
      writtenCanonicalCandidatePath: null,
      writtenCanonicalCandidateSha256: null,
      plannedCanonicalCandidateSha256: summary.plannedCanonicalCandidateSha256 ?? null,
      writtenCanonicalCandidateRowCount: 0,
      writtenCanonicalCandidateRowsByCompetition: {},
      fetchExecutedNowCount: 0,
      searchExecutedNowCount: 0,
      broadSearchExecutedNowCount: 0,
      productionWriteExecutedNowCount: 0,
      truthAssertionExecutedNowCount: 0,
      preflightBlockedCount,
      postBlockedCount: 0
    }
  };
  writeJson(outputPath, output);
  console.log(JSON.stringify(output.summary, null, 2));
  process.exitCode = 1;
} else {
  fs.mkdirSync(path.dirname(expectedCandidatePath), { recursive: true });
  fs.writeFileSync(expectedCandidatePath, candidateText, "utf8");

  const writtenText = fs.readFileSync(expectedCandidatePath, "utf8");
  const writtenSha = sha256Text(writtenText);
  const written = JSON.parse(writtenText);
  const writtenRows = Array.isArray(written.rows) ? written.rows : [];
  const writtenRowsByCompetition = countBy(writtenRows, "competitionSlug");

  const postChecks = [];
  check(postChecks, "writtenFileExists", fs.existsSync(expectedCandidatePath), { actual: expectedCandidatePath });
  check(postChecks, "writtenShaMatchesExpected", writtenSha === expectedSha, { actual: writtenSha, expected: expectedSha });
  check(postChecks, "writtenRowCountThirtySix", writtenRows.length === 36, { actual: writtenRows.length, expected: 36 });
  check(postChecks, "writtenRowsByCompetitionExpected", Number(writtenRowsByCompetition["ger.1"] ?? 0) === 18 && Number(writtenRowsByCompetition["ger.2"] ?? 0) === 18, { actual: writtenRowsByCompetition, expected: { "ger.1": 18, "ger.2": 18 } });
  check(postChecks, "writtenNoRowIssues", writtenRows.every((row) => Array.isArray(row.rowIssueCodes) && row.rowIssueCodes.length === 0));

  const postBlockedCount = postChecks.filter((entry) => !entry.passed).length;

  const output = {
    output: outputPath,
    job: "run-football-truth-bundesliga-canonical-candidate-write-file",
    generatedAtUtc: new Date().toISOString(),
    status: postBlockedCount === 0 ? "passed" : "blocked_postwrite",
    sourcePlanPath: planPath,
    sourcePlanSha256: sha256Text(planText),
    writtenCanonicalCandidatePath: expectedCandidatePath,
    checks,
    postChecks,
    summary: {
      status: postBlockedCount === 0 ? "passed" : "blocked_postwrite",
      canonicalCandidateWriteExecutedNowCount: 1,
      writtenCanonicalCandidatePath: expectedCandidatePath,
      writtenCanonicalCandidateSha256: writtenSha,
      plannedCanonicalCandidateSha256: summary.plannedCanonicalCandidateSha256,
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
