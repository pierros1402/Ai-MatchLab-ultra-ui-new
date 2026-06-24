import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const allowExecute = args.has("--allow-execute");
const allowFetch = args.has("--allow-fetch");

const inputPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-sportomedia-accepted-asset-micro-probe-plan-2026-06-16",
  "controlled-sportomedia-accepted-asset-micro-probe-plan-2026-06-16.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-sportomedia-accepted-asset-micro-probe-runner-2026-06-16"
);

const outputPath = path.join(
  outputDir,
  "controlled-sportomedia-accepted-asset-micro-probe-runner-2026-06-16.json"
);

const expectedCompetitions = ["swe.1", "swe.2"];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256Buffer(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function uniqueSorted(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== "").map(String))].sort();
}

function isPreferredSportomediaMainJsAssetUrl(url) {
  return /^https:\/\/(allsvenskan|superettan)\.se\/wp-content\/themes\/sef-leagues\/build\/main\.js(\?|$)/i.test(String(url));
}

function runCurl(label, curlArgs) {
  const startedAtUtc = new Date().toISOString();
  const result = spawnSync("curl.exe", curlArgs, {
    encoding: "utf8",
    timeout: 12000,
    maxBuffer: 1024 * 1024,
    windowsHide: true
  });

  return {
    label,
    startedAtUtc,
    finishedAtUtc: new Date().toISOString(),
    status: result.error?.code === "ETIMEDOUT" ? "timeout_killed" : "exited",
    exitCode: result.status,
    signal: result.signal,
    errorCode: result.error?.code ?? null,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

function check(checks, name, passed, details = {}) {
  checks.push({ name, passed: Boolean(passed), ...details });
}

if (!fs.existsSync(inputPath)) {
  throw new Error(`Missing micro probe plan: ${inputPath}`);
}

const inputText = fs.readFileSync(inputPath, "utf8");
const plan = JSON.parse(inputText);
const planRows = Array.isArray(plan.microProbeRows) ? plan.microProbeRows : [];
const selectedRows = planRows
  .filter((row) => isPreferredSportomediaMainJsAssetUrl(row.assetUrl))
  .sort((a, b) => String(a.competitionSlug).localeCompare(String(b.competitionSlug)));

const outOfScopeRows = planRows
  .filter((row) => !isPreferredSportomediaMainJsAssetUrl(row.assetUrl))
  .map((row) => ({
    sourcePlanRowId: row.sportomediaAcceptedAssetMicroProbePlanRowId,
    competitionSlug: row.competitionSlug,
    assetUrl: row.assetUrl,
    outOfScopeReason: "not_preferred_sportomedia_sef_leagues_main_js_asset"
  }));

const checks = [];
check(checks, "allowExecuteFlagPresent", allowExecute);
check(checks, "allowFetchFlagPresent", allowFetch);
check(checks, "planStatusPassed", plan.summary?.controlledSportomediaAcceptedAssetMicroProbePlanStatus === "passed", {
  actual: plan.summary?.controlledSportomediaAcceptedAssetMicroProbePlanStatus
});
check(checks, "planRowsExpectedCount", planRows.length === 4, { actual: planRows.length, expected: 4 });
check(checks, "selectedPreferredMainJsRowCount", selectedRows.length === 2, { actual: selectedRows.length, expected: 2 });
check(checks, "selectedCompetitionsExpected", JSON.stringify(uniqueSorted(selectedRows.map((row) => row.competitionSlug))) === JSON.stringify(expectedCompetitions), {
  actual: uniqueSorted(selectedRows.map((row) => row.competitionSlug)),
  expected: expectedCompetitions
});
check(checks, "allSelectedRowsArePreferredSportomediaMainJsAssets", selectedRows.every((row) => isPreferredSportomediaMainJsAssetUrl(row.assetUrl)));
check(checks, "outOfScopeRowsAreExcludedPluginNoise", outOfScopeRows.length === 2, { actual: outOfScopeRows.length, expected: 2 });
check(checks, "planBlockedCanonicalProductionTruth", Number(plan.summary?.canonicalWriteExecutedNowCount ?? -1) === 0 && Number(plan.summary?.productionWriteExecutedNowCount ?? -1) === 0 && Number(plan.summary?.truthAssertionExecutedNowCount ?? -1) === 0);

const preflightBlockedCount = checks.filter((entry) => !entry.passed).length;

if (preflightBlockedCount !== 0 || !allowExecute || !allowFetch) {
  const output = {
    output: outputPath,
    job: "run-football-truth-controlled-sportomedia-accepted-asset-micro-probe-runner-file",
    generatedAtUtc: new Date().toISOString(),
    status: "blocked_preflight",
    inputPath,
    inputSha256: sha256Text(inputText),
    checks,
    outOfScopeRows,
    probeRows: [],
    summary: {
      status: "blocked_preflight",
      planRowCount: planRows.length,
      selectedProbeRowCount: 0,
      outOfScopeRowCount: outOfScopeRows.length,
      fetchExecutedNowCount: 0,
      searchExecutedNowCount: 0,
      broadSearchExecutedNowCount: 0,
      canonicalWriteExecutedNowCount: 0,
      productionWriteExecutedNowCount: 0,
      truthAssertionExecutedNowCount: 0,
      preflightBlockedCount
    }
  };

  writeJson(outputPath, output);
  console.log(JSON.stringify(output.summary, null, 2));
  process.exitCode = 1;
} else {
  const probeRows = [];

  for (const row of selectedRows) {
    fs.mkdirSync(outputDir, { recursive: true });

    const safeRowId = String(row.sportomediaAcceptedAssetMicroProbePlanRowId).replace(/[^a-z0-9_-]+/gi, "_");
    const tempFile = path.join(outputDir, `${row.competitionSlug}-${safeRowId}.range-0-2047.txt`);
    if (fs.existsSync(tempFile)) fs.rmSync(tempFile, { force: true });

    const head = runCurl("curl_head", [
      "--head",
      "--location",
      "--ipv4",
      "--http1.1",
      "--connect-timeout", "4",
      "--max-time", "8",
      "--silent",
      "--show-error",
      "--output", "NUL",
      "--write-out", "HTTP=%{http_code} FINAL=%{url_effective} TYPE=%{content_type} SIZE=%{size_download} TIME=%{time_total}",
      row.assetUrl
    ]);

    const range = runCurl("curl_tiny_range_0_2047", [
      "--location",
      "--ipv4",
      "--http1.1",
      "--connect-timeout", "4",
      "--max-time", "8",
      "--range", "0-2047",
      "--silent",
      "--show-error",
      "--output", tempFile,
      "--write-out", "HTTP=%{http_code} FINAL=%{url_effective} TYPE=%{content_type} SIZE=%{size_download} TIME=%{time_total}",
      row.assetUrl
    ]);

    const rangeExists = fs.existsSync(tempFile);
    const rangeBuffer = rangeExists ? fs.readFileSync(tempFile) : Buffer.from("");
    const rangeText = rangeBuffer.toString("utf8").slice(0, 512);

    probeRows.push({
      sourcePlanRowId: row.sportomediaAcceptedAssetMicroProbePlanRowId,
      competitionSlug: row.competitionSlug,
      providerFamily: row.providerFamily,
      assetUrl: row.assetUrl,
      assetPriorityScore: row.assetPriorityScore,
      head,
      range,
      rangeTempFile: tempFile,
      rangeSize: rangeBuffer.length,
      rangeSha256: rangeBuffer.length > 0 ? sha256Buffer(rangeBuffer) : null,
      first512Chars: rangeText,
      probeStatus: head.status === "timeout_killed" || range.status === "timeout_killed"
        ? "timeout_or_killed"
        : range.exitCode === 0 && rangeBuffer.length > 0
          ? "fetched_tiny_range"
          : "no_tiny_range_content"
    });
  }

  const timeoutOrKilledCount = probeRows.filter((row) => row.probeStatus === "timeout_or_killed").length;
  const fetchedTinyRangeCount = probeRows.filter((row) => row.probeStatus === "fetched_tiny_range").length;
  const blockedProbeCount = probeRows.filter((row) => row.probeStatus !== "fetched_tiny_range").length;

  const output = {
    output: outputPath,
    job: "run-football-truth-controlled-sportomedia-accepted-asset-micro-probe-runner-file",
    generatedAtUtc: new Date().toISOString(),
    status: blockedProbeCount === 0 ? "passed" : "passed_with_probe_gaps",
    inputPath,
    inputSha256: sha256Text(inputText),
    policy: {
      controlledFetchOnly: true,
      preferredSportomediaMainJsAssetsOnly: true,
      pluginAssetsExcluded: true,
      noSearch: true,
      noBroadSearch: true,
      noCanonicalWrite: true,
      noProductionWrite: true,
      noTruthAssertion: true
    },
    checks,
    outOfScopeRows,
    probeRows,
    summary: {
      status: blockedProbeCount === 0 ? "passed" : "passed_with_probe_gaps",
      planRowCount: planRows.length,
      selectedProbeRowCount: selectedRows.length,
      outOfScopeRowCount: outOfScopeRows.length,
      fetchedTinyRangeCount,
      timeoutOrKilledCount,
      blockedProbeCount,
      fetchExecutedNowCount: probeRows.length * 2,
      searchExecutedNowCount: 0,
      broadSearchExecutedNowCount: 0,
      canonicalWriteExecutedNowCount: 0,
      productionWriteExecutedNowCount: 0,
      truthAssertionExecutedNowCount: 0,
      preflightBlockedCount: 0
    }
  };

  writeJson(outputPath, output);

  console.log(JSON.stringify({
    output: output.output,
    status: output.summary.status,
    planRowCount: output.summary.planRowCount,
    selectedProbeRowCount: output.summary.selectedProbeRowCount,
    outOfScopeRowCount: output.summary.outOfScopeRowCount,
    fetchedTinyRangeCount: output.summary.fetchedTinyRangeCount,
    timeoutOrKilledCount: output.summary.timeoutOrKilledCount,
    blockedProbeCount: output.summary.blockedProbeCount,
    fetchExecutedNowCount: output.summary.fetchExecutedNowCount,
    searchExecutedNowCount: output.summary.searchExecutedNowCount,
    broadSearchExecutedNowCount: output.summary.broadSearchExecutedNowCount,
    canonicalWriteExecutedNowCount: output.summary.canonicalWriteExecutedNowCount,
    productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
    truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount
  }, null, 2));
}
