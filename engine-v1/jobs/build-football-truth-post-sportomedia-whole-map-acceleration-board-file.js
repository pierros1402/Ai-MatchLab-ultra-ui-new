import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-sportomedia-whole-map-acceleration-board-2026-06-16"
);

const outputPath = path.join(
  outputDir,
  "post-sportomedia-whole-map-acceleration-board-2026-06-16.json"
);

const canonicalCandidateDir = path.join(
  "data",
  "football-truth",
  "_state",
  "canonical-standings-candidates"
);

const jobsDir = path.join("engine-v1", "jobs");

const expectedCompletedControlledCandidates = {
  "esp.1": 20,
  "esp.2": 22,
  "nor.1": 16,
  "nor.2": 16,
  "swe.1": 16,
  "swe.2": 16
};

function sha256Text(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function walkFiles(dir, predicate, limit = 2000) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length && out.length < limit) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".git" || entry.name === "node_modules") continue;
        stack.push(full);
      } else if (!predicate || predicate(full)) {
        out.push(full);
        if (out.length >= limit) break;
      }
    }
  }
  return out.sort();
}

function findArraysWithCompetitionSlug(value, arrays = []) {
  if (Array.isArray(value)) {
    if (value.length > 0 && value.every((item) => item && typeof item === "object" && !Array.isArray(item)) && value.some((item) => item.competitionSlug)) {
      arrays.push(value);
    }
    for (const item of value) findArraysWithCompetitionSlug(item, arrays);
  } else if (value && typeof value === "object") {
    for (const child of Object.values(value)) findArraysWithCompetitionSlug(child, arrays);
  }
  return arrays;
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = String(row[key] ?? "unknown");
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== "").map(String))].sort();
}

function readJsonSafe(filePath) {
  try {
    const text = fs.readFileSync(filePath, "utf8");
    return { ok: true, text, json: JSON.parse(text), sha256: sha256Text(text) };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

function detectJobSignals() {
  const jobFiles = walkFiles(jobsDir, (file) => file.endsWith(".js"), 1500);
  const rows = jobFiles.map((file) => {
    const name = path.basename(file).toLowerCase();
    const signals = [];
    for (const token of [
      "bundesliga",
      "laliga",
      "norway",
      "sportomedia",
      "spfl",
      "loi",
      "torneopal",
      "configured",
      "reusable",
      "family",
      "standings",
      "canonical",
      "fifa"
    ]) {
      if (name.includes(token)) signals.push(token);
    }
    return { file, name: path.basename(file), signals };
  }).filter((row) => row.signals.length > 0);

  return {
    jobFileCount: jobFiles.length,
    signaledJobFileCount: rows.length,
    signalCounts: rows.flatMap((row) => row.signals).reduce((acc, signal) => {
      acc[signal] = (acc[signal] ?? 0) + 1;
      return acc;
    }, {}),
    rows: rows.slice(0, 250)
  };
}

function canonicalCandidateInventory() {
  const files = walkFiles(canonicalCandidateDir, (file) => file.endsWith(".json"), 200);
  const fileRows = [];

  for (const file of files) {
    const parsed = readJsonSafe(file);
    if (!parsed.ok) {
      fileRows.push({
        file,
        parseStatus: "parse_failed",
        parseError: parsed.error,
        rowCount: 0,
        competitions: [],
        rowsByCompetition: {}
      });
      continue;
    }

    const arrays = findArraysWithCompetitionSlug(parsed.json);
    const bestArray = arrays.sort((a, b) => b.length - a.length)[0] ?? [];
    const rowsByCompetition = countBy(bestArray, "competitionSlug");

    fileRows.push({
      file,
      parseStatus: "parsed",
      sha256: parsed.sha256,
      rowCount: bestArray.length,
      competitions: unique(bestArray.map((row) => row.competitionSlug)),
      rowsByCompetition
    });
  }

  const allRowsByCompetition = {};
  for (const fileRow of fileRows) {
    for (const [slug, count] of Object.entries(fileRow.rowsByCompetition)) {
      allRowsByCompetition[slug] = (allRowsByCompetition[slug] ?? 0) + Number(count);
    }
  }

  return {
    fileCount: files.length,
    files: fileRows,
    coveredCompetitionCount: Object.keys(allRowsByCompetition).length,
    totalCandidateRowCount: Object.values(allRowsByCompetition).reduce((sum, value) => sum + Number(value), 0),
    rowsByCompetition: Object.fromEntries(Object.entries(allRowsByCompetition).sort(([a], [b]) => a.localeCompare(b)))
  };
}

function buildNextLaneBoard(candidateInventory, jobSignals) {
  const covered = candidateInventory.rowsByCompetition;
  const controlledComplete = Object.entries(expectedCompletedControlledCandidates).every(([slug, count]) => Number(covered[slug] ?? 0) === count);
  const missingControlled = Object.entries(expectedCompletedControlledCandidates)
    .filter(([slug, count]) => Number(covered[slug] ?? 0) !== count)
    .map(([slug, count]) => ({ competitionSlug: slug, expectedRows: count, actualRows: Number(covered[slug] ?? 0) }));

  const bundesligaCandidateOpen =
    !covered["ger.1"] &&
    !covered["ger.2"] &&
    Number(jobSignals.signalCounts.bundesliga ?? 0) > 0;

  const reusableFamilySignals =
    Number(jobSignals.signalCounts.configured ?? 0) +
    Number(jobSignals.signalCounts.reusable ?? 0) +
    Number(jobSignals.signalCounts.family ?? 0);

  const nextLaneRows = [];

  if (bundesligaCandidateOpen) {
    nextLaneRows.push({
      priority: 1,
      laneId: "controlled_bundesliga_official_standings_table",
      laneStatus: "recommended_next",
      reason: "high-value two-league official standings lane has existing local job signals and no canonical standings candidate yet",
      targetCompetitions: ["ger.1", "ger.2"],
      intendedActionNext: "build controlled no-write Bundesliga exact official standings extraction plan",
      mayFetchInNextRunnerOnlyIfExplicitAllowFetchFlagPresent: true,
      mayWriteCanonicalNow: false,
      mayWriteProductionNow: false,
      mayAssertTruthNow: false
    });
  }

  nextLaneRows.push({
    priority: bundesligaCandidateOpen ? 2 : 1,
    laneId: "whole_map_reusable_family_batch_acceleration",
    laneStatus: bundesligaCandidateOpen ? "queued_after_bundesliga" : "recommended_next",
    reason: "move away from single-provider forensics and pack the next reusable family batch from existing local contracts",
    targetCompetitions: "batch_from_existing_local_contracts",
    intendedActionNext: "build no-fetch reusable family batch packer for standings lanes not already covered by canonical candidates",
    localReusableFamilySignalCount: reusableFamilySignals,
    mayFetchInNextRunnerOnlyIfExplicitAllowFetchFlagPresent: true,
    mayWriteCanonicalNow: false,
    mayWriteProductionNow: false,
    mayAssertTruthNow: false
  });

  return {
    controlledComplete,
    missingControlled,
    nextLaneRows
  };
}

function check(checks, name, passed, details = {}) {
  checks.push({ name, passed: Boolean(passed), ...details });
}

const candidateInventory = canonicalCandidateInventory();
const jobSignals = detectJobSignals();
const nextLaneBoard = buildNextLaneBoard(candidateInventory, jobSignals);

const checks = [];
check(checks, "canonicalCandidateDirPresent", fs.existsSync(canonicalCandidateDir), { actual: canonicalCandidateDir });
check(checks, "canonicalCandidateFilesPresent", candidateInventory.fileCount >= 3, { actual: candidateInventory.fileCount, expectedAtLeast: 3 });
check(checks, "controlledCompletedCandidateCompetitionsCovered", nextLaneBoard.controlledComplete, { missingControlled: nextLaneBoard.missingControlled });
check(checks, "controlledCandidateRowsExpectedTotal", candidateInventory.totalCandidateRowCount >= 106, { actual: candidateInventory.totalCandidateRowCount, expectedAtLeast: 106 });
check(checks, "jobsDirPresent", fs.existsSync(jobsDir), { actual: jobsDir });
check(checks, "jobSignalsDetected", jobSignals.signaledJobFileCount > 0, { actual: jobSignals.signaledJobFileCount });
check(checks, "nextLaneRowsPresent", nextLaneBoard.nextLaneRows.length > 0, { actual: nextLaneBoard.nextLaneRows.length });
check(checks, "noFetchSearchWriteInThisJob", true);
check(checks, "productionAndTruthLocked", true);

const blockedCheckCount = checks.filter((entry) => !entry.passed).length;
const passedCheckCount = checks.filter((entry) => entry.passed).length;

const output = {
  output: outputPath,
  job: "build-football-truth-post-sportomedia-whole-map-acceleration-board-file",
  generatedAtUtc: new Date().toISOString(),
  policy: {
    boardOnly: true,
    noFetchInThisJob: true,
    noSearchInThisJob: true,
    noBroadSearchInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true
  },
  summary: {
    postSportomediaWholeMapAccelerationBoardStatus: blockedCheckCount === 0 ? "passed" : "blocked",
    canonicalCandidateFileCount: candidateInventory.fileCount,
    canonicalCandidateCoveredCompetitionCount: candidateInventory.coveredCompetitionCount,
    canonicalCandidateTotalRowCount: candidateInventory.totalCandidateRowCount,
    controlledCompletedCandidateCompetitionCount: Object.keys(expectedCompletedControlledCandidates).length,
    controlledCompletedCandidateRowsExpected: Object.values(expectedCompletedControlledCandidates).reduce((sum, value) => sum + value, 0),
    controlledCompletedCandidatesCovered: nextLaneBoard.controlledComplete,
    nextLaneRowCount: nextLaneBoard.nextLaneRows.length,
    recommendedNextLaneId: nextLaneBoard.nextLaneRows.find((row) => row.laneStatus === "recommended_next")?.laneId ?? null,
    mayBuildRecommendedNextLanePlanCount: nextLaneBoard.nextLaneRows.some((row) => row.laneStatus === "recommended_next") ? 1 : 0,
    fetchExecutedNowCount: 0,
    searchExecutedNowCount: 0,
    broadSearchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    checkCount: checks.length,
    passedCheckCount,
    blockedCheckCount
  },
  checks,
  candidateInventory,
  jobSignals,
  nextLaneBoard
};

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  postSportomediaWholeMapAccelerationBoardStatus: output.summary.postSportomediaWholeMapAccelerationBoardStatus,
  canonicalCandidateFileCount: output.summary.canonicalCandidateFileCount,
  canonicalCandidateCoveredCompetitionCount: output.summary.canonicalCandidateCoveredCompetitionCount,
  canonicalCandidateTotalRowCount: output.summary.canonicalCandidateTotalRowCount,
  controlledCompletedCandidatesCovered: output.summary.controlledCompletedCandidatesCovered,
  recommendedNextLaneId: output.summary.recommendedNextLaneId,
  nextLaneRowCount: output.summary.nextLaneRowCount,
  mayBuildRecommendedNextLanePlanCount: output.summary.mayBuildRecommendedNextLanePlanCount,
  fetchExecutedNowCount: output.summary.fetchExecutedNowCount,
  searchExecutedNowCount: output.summary.searchExecutedNowCount,
  broadSearchExecutedNowCount: output.summary.broadSearchExecutedNowCount,
  canonicalWriteExecutedNowCount: output.summary.canonicalWriteExecutedNowCount,
  productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount,
  blockedCheckCount: output.summary.blockedCheckCount
}, null, 2));

if (blockedCheckCount !== 0) process.exitCode = 1;
