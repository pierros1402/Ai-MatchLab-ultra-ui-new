import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();

const sourcePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-sportomedia-accepted-asset-probe-plan-2026-06-15",
  "controlled-sportomedia-accepted-asset-probe-plan-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-sportomedia-accepted-asset-micro-probe-plan-2026-06-16"
);

const outputPath = path.join(
  outputDir,
  "controlled-sportomedia-accepted-asset-micro-probe-plan-2026-06-16.json"
);

const expectedCompetitions = ["swe.1", "swe.2"];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function uniqueSorted(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== "").map(String))].sort();
}

function looksLikeSportomediaAcceptedAssetUrl(value) {
  if (typeof value !== "string") return false;
  if (!/^https:\/\/(allsvenskan|superettan)\.se\//i.test(value)) return false;
  if (!/\.js(\?|$)/i.test(value)) return false;
  return true;
}

function normalizeAssetUrl(value) {
  return String(value).trim();
}

function scoreAssetUrl(url) {
  let score = 0;
  if (/\/wp-content\/themes\/sef-leagues\/build\/main\.js(\?|$)/i.test(url)) score += 100;
  if (/sef-leagues/i.test(url)) score += 30;
  if (/build\/main\.js/i.test(url)) score += 20;
  if (/allsvenskan\.se/i.test(url)) score += 2;
  if (/superettan\.se/i.test(url)) score += 2;
  return score;
}

function hostCompetition(url) {
  if (/^https:\/\/allsvenskan\.se\//i.test(url)) return "swe.1";
  if (/^https:\/\/superettan\.se\//i.test(url)) return "swe.2";
  return null;
}

function collectUrls(value, pathParts = [], rows = []) {
  if (typeof value === "string" && looksLikeSportomediaAcceptedAssetUrl(value)) {
    rows.push({
      url: normalizeAssetUrl(value),
      jsonPath: pathParts.join(".")
    });
    return rows;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectUrls(item, [...pathParts, String(index)], rows));
    return rows;
  }

  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      collectUrls(child, [...pathParts, key], rows);
    }
  }

  return rows;
}

function buildMicroProbeRows(source) {
  const collected = collectUrls(source);
  const byUrl = new Map();

  for (const row of collected) {
    const existing = byUrl.get(row.url);
    const competitionSlug = hostCompetition(row.url);
    if (!existing) {
      byUrl.set(row.url, {
        competitionSlug,
        assetUrl: row.url,
        firstSeenJsonPath: row.jsonPath,
        seenJsonPaths: [row.jsonPath],
        priorityScore: scoreAssetUrl(row.url)
      });
    } else {
      existing.seenJsonPaths.push(row.jsonPath);
    }
  }

  return [...byUrl.values()]
    .filter((row) => expectedCompetitions.includes(row.competitionSlug))
    .sort((a, b) => {
      const comp = a.competitionSlug.localeCompare(b.competitionSlug);
      if (comp !== 0) return comp;
      return b.priorityScore - a.priorityScore || a.assetUrl.localeCompare(b.assetUrl);
    })
    .map((row, index) => ({
      sportomediaAcceptedAssetMicroProbePlanRowId: `sportomedia_accepted_asset_micro_probe_plan_${String(index + 1).padStart(2, "0")}`,
      competitionSlug: row.competitionSlug,
      providerFamily: "sportomedia",
      assetUrl: row.assetUrl,
      assetPriorityScore: row.priorityScore,
      sourceJsonPath: row.firstSeenJsonPath,
      sourceJsonPathCount: row.seenJsonPaths.length,
      microProbeContract: {
        purpose: "avoid_node_fetch_hang_by_using_external_process_timeout_and_tiny_network_scope",
        runnerMayRunOnlyAfterExplicitApproval: true,
        requiredFlags: ["--allow-execute", "--allow-fetch"],
        networkScope: "single_accepted_asset_url_per_row_only",
        allowedProbeMethodsInOrder: [
          {
            step: "curl_head",
            commandShape: "curl.exe --head --location --max-time 8 --connect-timeout 4 --silent --show-error --output NUL --write-out status/timing/size",
            timeoutGuard: "Start-Process plus Wait-Process timeout; kill process tree on timeout"
          },
          {
            step: "curl_tiny_range",
            commandShape: "curl.exe --location --range 0-2047 --max-time 8 --connect-timeout 4 --silent --show-error --output temp-file",
            timeoutGuard: "Start-Process plus Wait-Process timeout; kill process tree on timeout",
            runOnlyIfHeadIsInconclusive: true
          }
        ],
        forbiddenOperations: [
          "node_fetch_or_undici_fetch",
          "full_asset_download_without_range_limit",
          "broad_search",
          "canonical_write",
          "production_write",
          "truth_assertion"
        ]
      },
      planStatus: "ready_for_controlled_non_hanging_micro_probe_runner_after_user_approval",
      allowedNow: {
        mayFetchNow: false,
        maySearchNow: false,
        mayBroadSearchNow: false,
        mayWriteCanonicalNow: false,
        mayWriteProductionNow: false,
        mayAssertTruthNow: false
      }
    }));
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = String(row[key] ?? "unknown");
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function assertCheck(checks, name, passed, details = {}) {
  checks.push({ name, passed: Boolean(passed), ...details });
}

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Missing accepted asset probe plan diagnostic: ${sourcePath}`);
}

const sourceText = fs.readFileSync(sourcePath, "utf8");
const source = JSON.parse(sourceText);
const microProbeRows = buildMicroProbeRows(source);
const competitions = uniqueSorted(microProbeRows.map((row) => row.competitionSlug));

const checks = [];
assertCheck(checks, "sourceAcceptedAssetProbePlanExists", true, { sourcePath });
assertCheck(checks, "expectedCompetitionsCovered", JSON.stringify(competitions) === JSON.stringify(expectedCompetitions), { actual: competitions, expected: expectedCompetitions });
assertCheck(checks, "microProbeRowsExist", microProbeRows.length >= 2, { actual: microProbeRows.length, expectedMinimum: 2 });
assertCheck(checks, "allRowsUseAcceptedOfficialSwedishAssetHosts", microProbeRows.every((row) => /^https:\/\/(allsvenskan|superettan)\.se\//i.test(row.assetUrl)));
assertCheck(checks, "allRowsAreJavascriptAssets", microProbeRows.every((row) => /\.js(\?|$)/i.test(row.assetUrl)));
assertCheck(checks, "allRowsBlockFetchNow", microProbeRows.every((row) => row.allowedNow.mayFetchNow === false));
assertCheck(checks, "allRowsBlockSearchNow", microProbeRows.every((row) => row.allowedNow.maySearchNow === false && row.allowedNow.mayBroadSearchNow === false));
assertCheck(checks, "allRowsBlockCanonicalProductionTruthNow", microProbeRows.every((row) => row.allowedNow.mayWriteCanonicalNow === false && row.allowedNow.mayWriteProductionNow === false && row.allowedNow.mayAssertTruthNow === false));
assertCheck(checks, "runnerContractRequiresExternalTimeout", microProbeRows.every((row) => row.microProbeContract.allowedProbeMethodsInOrder.every((method) => /Wait-Process timeout/.test(method.timeoutGuard))));
assertCheck(checks, "runnerContractForbidsNodeFetch", microProbeRows.every((row) => row.microProbeContract.forbiddenOperations.includes("node_fetch_or_undici_fetch")));

const blockedCheckCount = checks.filter((check) => !check.passed).length;
const passedCheckCount = checks.filter((check) => check.passed).length;

const output = {
  output: outputPath,
  job: "build-football-truth-controlled-sportomedia-accepted-asset-micro-probe-plan-file",
  generatedAtUtc: new Date().toISOString(),
  sourcePaths: {
    sourcePath
  },
  sourceSha256: sha256Text(sourceText),
  policy: {
    planOnly: true,
    noFetchInThisJob: true,
    noSearchInThisJob: true,
    noBroadSearchInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true
  },
  summary: {
    controlledSportomediaAcceptedAssetMicroProbePlanStatus: blockedCheckCount === 0 ? "passed" : "blocked",
    acceptedAssetMicroProbePlanRowCount: microProbeRows.length,
    acceptedAssetMicroProbePlanCompetitions: competitions,
    acceptedAssetMicroProbeRowsByCompetition: countBy(microProbeRows, "competitionSlug"),
    preferredMainJsRowCount: microProbeRows.filter((row) => /\/wp-content\/themes\/sef-leagues\/build\/main\.js(\?|$)/i.test(row.assetUrl)).length,
    checkCount: checks.length,
    passedCheckCount,
    blockedCheckCount,
    mayBuildControlledSportomediaAcceptedAssetMicroProbeRunnerCount: blockedCheckCount === 0 ? 1 : 0,
    fetchExecutedNowCount: 0,
    searchExecutedNowCount: 0,
    broadSearchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    canonicalWrites: 0,
    productionWrite: false,
    truthAssertion: false
  },
  checks,
  microProbeRows
};

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  controlledSportomediaAcceptedAssetMicroProbePlanStatus: output.summary.controlledSportomediaAcceptedAssetMicroProbePlanStatus,
  acceptedAssetMicroProbePlanRowCount: output.summary.acceptedAssetMicroProbePlanRowCount,
  acceptedAssetMicroProbePlanCompetitions: output.summary.acceptedAssetMicroProbePlanCompetitions,
  acceptedAssetMicroProbeRowsByCompetition: output.summary.acceptedAssetMicroProbeRowsByCompetition,
  preferredMainJsRowCount: output.summary.preferredMainJsRowCount,
  mayBuildControlledSportomediaAcceptedAssetMicroProbeRunnerCount: output.summary.mayBuildControlledSportomediaAcceptedAssetMicroProbeRunnerCount,
  fetchExecutedNowCount: output.summary.fetchExecutedNowCount,
  searchExecutedNowCount: output.summary.searchExecutedNowCount,
  canonicalWriteExecutedNowCount: output.summary.canonicalWriteExecutedNowCount,
  productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedCheckCount !== 0) {
  process.exitCode = 1;
}
