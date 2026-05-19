#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..");

function cleanString(value) {
  return String(value ?? "").trim();
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolFlag(args, name) {
  return args.includes(`--${name}`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

function resolveRootPath(...parts) {
  return path.resolve(ROOT_DIR, ...parts);
}

function resolveDataPath(...parts) {
  return resolveRootPath("data", ...parts);
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    date: "",
    limit: 5,
    minAgeHours: 0,
    maxSearchDescriptors: 6,
    maxTargetsPerMatch: 4,
    maxTasksPerMatch: 3,
    allowFetch: false,
    resolvedUrlsFile: "",
    output: "",
    keepIntermediate: false,
    timeoutMs: 10000,
    maxBytes: 300000,
    maxTextChars: 20000,
    selfTest: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--self-test") {
      out.selfTest = true;
      continue;
    }

    if (arg === "--allow-fetch") {
      out.allowFetch = true;
      continue;
    }

    if (arg === "--keep-intermediate") {
      out.keepIntermediate = true;
      continue;
    }

    const nextValue = () => {
      index += 1;
      return cleanString(argv[index]);
    };

    if (arg === "--date") out.date = nextValue();
    else if (arg.startsWith("--date=")) out.date = cleanString(arg.slice("--date=".length));
    else if (arg === "--limit") out.limit = toInt(nextValue(), out.limit);
    else if (arg.startsWith("--limit=")) out.limit = toInt(arg.slice("--limit=".length), out.limit);
    else if (arg === "--min-age-hours") out.minAgeHours = toInt(nextValue(), out.minAgeHours);
    else if (arg.startsWith("--min-age-hours=")) out.minAgeHours = toInt(arg.slice("--min-age-hours=".length), out.minAgeHours);
    else if (arg === "--max-search-descriptors") out.maxSearchDescriptors = toInt(nextValue(), out.maxSearchDescriptors);
    else if (arg.startsWith("--max-search-descriptors=")) out.maxSearchDescriptors = toInt(arg.slice("--max-search-descriptors=".length), out.maxSearchDescriptors);
    else if (arg === "--max-targets-per-match") out.maxTargetsPerMatch = toInt(nextValue(), out.maxTargetsPerMatch);
    else if (arg.startsWith("--max-targets-per-match=")) out.maxTargetsPerMatch = toInt(arg.slice("--max-targets-per-match=".length), out.maxTargetsPerMatch);
    else if (arg === "--max-tasks-per-match") out.maxTasksPerMatch = toInt(nextValue(), out.maxTasksPerMatch);
    else if (arg.startsWith("--max-tasks-per-match=")) out.maxTasksPerMatch = toInt(arg.slice("--max-tasks-per-match=".length), out.maxTasksPerMatch);
    else if (arg === "--resolved-urls-file") out.resolvedUrlsFile = nextValue();
    else if (arg.startsWith("--resolved-urls-file=")) out.resolvedUrlsFile = cleanString(arg.slice("--resolved-urls-file=".length));
    else if (arg === "--output") out.output = nextValue();
    else if (arg.startsWith("--output=")) out.output = cleanString(arg.slice("--output=".length));
    else if (arg === "--timeout-ms") out.timeoutMs = toInt(nextValue(), out.timeoutMs);
    else if (arg.startsWith("--timeout-ms=")) out.timeoutMs = toInt(arg.slice("--timeout-ms=".length), out.timeoutMs);
    else if (arg === "--max-bytes") out.maxBytes = toInt(nextValue(), out.maxBytes);
    else if (arg.startsWith("--max-bytes=")) out.maxBytes = toInt(arg.slice("--max-bytes=".length), out.maxBytes);
    else if (arg === "--max-text-chars") out.maxTextChars = toInt(nextValue(), out.maxTextChars);
    else if (arg.startsWith("--max-text-chars=")) out.maxTextChars = toInt(arg.slice("--max-text-chars=".length), out.maxTextChars);
    else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (!out.selfTest && !out.date) {
    throw new Error("missing required --date YYYY-MM-DD");
  }

  return out;
}

function runNodeScript(scriptRelativePath, args, options = {}) {
  const scriptPath = resolveRootPath(scriptRelativePath);
  const allowedExitCodes = options.allowedExitCodes || [0];

  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: ROOT_DIR,
    encoding: "utf8",
    windowsHide: true
  });

  const exitCode = Number(result.status ?? 1);
  const step = {
    script: scriptRelativePath,
    args,
    exitCode,
    stdout: result.stdout || "",
    stderr: result.stderr || ""
  };

  if (!allowedExitCodes.includes(exitCode)) {
    const error = new Error(`${scriptRelativePath} failed with exit code ${exitCode}`);
    error.step = step;
    throw error;
  }

  return step;
}

function summarizeJsonFile(file, fallback = {}) {
  if (!fs.existsSync(file)) return fallback;

  try {
    const payload = readJson(file);
    return {
      ok: payload?.ok ?? null,
      summary: payload?.summary || null,
      counts: payload?.counts || null,
      selectedRows: payload?.selectedRows ?? null,
      verdict: payload?.verdict || null,
      exitCode: payload?.exitCode ?? null,
      guarantees: payload?.guarantees || null
    };
  } catch (error) {
    return {
      error: error?.message || String(error)
    };
  }
}

function compactVerification(wrapperReport) {
  const verification = wrapperReport?.reports?.verification || null;
  if (!verification) return null;

  return {
    ok: verification.ok ?? null,
    verdict: verification.verdict || null,
    exitCode: verification.exitCode ?? null,
    verificationMode: verification.verificationMode || null,
    score: verification.score || null,
    summary: verification.summary || null,
    counts: verification.counts || null
  };
}

function buildOutputPaths(options) {
  const safeDate = options.date.replace(/[^0-9-]/g, "");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const diagnosticDir = resolveDataPath("football-truth", "_diagnostics");
  const intermediateDir = resolveDataPath("football-truth", "_diagnostics", `_consensus-smoke-${safeDate}-${stamp}`);

  return {
    safeDate,
    diagnosticDir,
    intermediateDir,
    output: options.output
      ? path.resolve(ROOT_DIR, options.output)
      : path.join(diagnosticDir, `final-result-consensus-smoke-${safeDate}.json`),
    watchsetCopy: path.join(intermediateDir, "watchset.json"),
    discoverClassify: path.join(intermediateDir, "discover-classify.json"),
    searchTargets: path.join(intermediateDir, "search-targets.json"),
    resolutionTasks: path.join(intermediateDir, "resolution-tasks.json"),
    validatedUrls: path.join(intermediateDir, "validated-url-resolutions.json"),
    wrapperReport: path.join(intermediateDir, "source-snapshot-evidence-diagnostic.json")
  };
}

async function runConsensusSmokeDay(options) {
  const paths = buildOutputPaths(options);
  fs.mkdirSync(paths.intermediateDir, { recursive: true });

  const steps = [];
  const startedAt = new Date().toISOString();

  steps.push(runNodeScript("engine-v1/jobs/build-final-result-watchset.js", [
    `--date=${options.date}`,
    `--min-age-hours=${options.minAgeHours}`,
    "--warn-only"
  ]));

  const generatedWatchset = resolveDataPath("final-result-watchsets", `${options.date}.json`);
  if (!fs.existsSync(generatedWatchset)) {
    throw new Error(`watchset was not generated: ${generatedWatchset}`);
  }
  fs.copyFileSync(generatedWatchset, paths.watchsetCopy);

  steps.push(runNodeScript("engine-v1/jobs/discover-and-classify-final-result-sources-watchset-day.js", [
    `--date=${options.date}`,
    `--limit=${options.limit}`,
    `--min-age-hours=${options.minAgeHours}`,
    `--max-search-descriptors=${options.maxSearchDescriptors}`,
    `--output=${paths.discoverClassify}`
  ]));

  steps.push(runNodeScript("engine-v1/jobs/materialize-final-result-source-search-targets-file.js", [
    "--input",
    paths.discoverClassify,
    "--output",
    paths.searchTargets,
    `--max-targets-per-match=${options.maxTargetsPerMatch}`
  ]));

  steps.push(runNodeScript("engine-v1/jobs/materialize-final-result-source-resolution-tasks-file.js", [
    "--input",
    paths.searchTargets,
    "--output",
    paths.resolutionTasks,
    `--max-tasks-per-match=${options.maxTasksPerMatch}`
  ]));

  let validationSummary = null;
  let wrapperSummary = null;
  let wrapperVerification = null;
  let stage = "resolution_tasks_ready";
  let exitCode = 0;

  if (options.resolvedUrlsFile) {
    const resolvedUrlsPath = path.resolve(ROOT_DIR, options.resolvedUrlsFile);
    if (!fs.existsSync(resolvedUrlsPath)) {
      throw new Error(`resolved URLs file not found: ${resolvedUrlsPath}`);
    }

    stage = "validating_resolved_urls";

    steps.push(runNodeScript("engine-v1/jobs/validate-final-result-source-url-resolutions-file.js", [
      "--input",
      resolvedUrlsPath,
      "--output",
      paths.validatedUrls
    ]));

    validationSummary = summarizeJsonFile(paths.validatedUrls);

    stage = "running_source_snapshot_evidence_diagnostic";

    const wrapperArgs = [
      "--input",
      paths.validatedUrls,
      "--output",
      paths.wrapperReport,
      `--limit=${options.limit}`,
      `--timeout-ms=${options.timeoutMs}`,
      `--max-bytes=${options.maxBytes}`,
      `--max-text-chars=${options.maxTextChars}`,
      "--keep-intermediate"
    ];

    if (options.allowFetch) wrapperArgs.push("--allow-fetch");

    const wrapperStep = runNodeScript("engine-v1/jobs/run-final-result-source-snapshot-evidence-diagnostic-file.js", wrapperArgs, {
      allowedExitCodes: [0, 1, 2]
    });
    steps.push(wrapperStep);

    wrapperSummary = summarizeJsonFile(paths.wrapperReport);

    if (fs.existsSync(paths.wrapperReport)) {
      const wrapperReport = readJson(paths.wrapperReport);
      wrapperVerification = compactVerification(wrapperReport);
      exitCode = Number(wrapperReport?.exitCode ?? wrapperStep.exitCode ?? 1);
    } else {
      exitCode = wrapperStep.exitCode;
    }

    stage = "source_snapshot_evidence_diagnostic_complete";
  }

  const report = {
    ok: true,
    job: "run-final-result-consensus-smoke-day",
    generatedAt: new Date().toISOString(),
    startedAt,
    dayKey: options.date,
    stage,
    exitCode,
    input: {
      date: options.date,
      limit: options.limit,
      minAgeHours: options.minAgeHours,
      resolvedUrlsFile: options.resolvedUrlsFile || null,
      allowFetch: options.allowFetch
    },
    outputs: {
      report: paths.output,
      intermediateDir: paths.intermediateDir,
      watchset: paths.watchsetCopy,
      discoverClassify: paths.discoverClassify,
      searchTargets: paths.searchTargets,
      resolutionTasks: paths.resolutionTasks,
      validatedUrls: options.resolvedUrlsFile ? paths.validatedUrls : null,
      wrapperReport: options.resolvedUrlsFile ? paths.wrapperReport : null
    },
    summaries: {
      watchset: summarizeJsonFile(paths.watchsetCopy),
      discoverClassify: summarizeJsonFile(paths.discoverClassify),
      searchTargets: summarizeJsonFile(paths.searchTargets),
      resolutionTasks: summarizeJsonFile(paths.resolutionTasks),
      validation: validationSummary,
      wrapper: wrapperSummary,
      verification: wrapperVerification
    },
    steps: steps.map((step) => ({
      script: step.script,
      exitCode: step.exitCode
    })),
    guarantees: {
      readOnlyDiagnostic: true,
      canonicalWrites: 0,
      noFinalTruthProductionDecision: true,
      noCanonicalPromotion: true,
      noProductionRepair: true,
      noFixtureWrite: true,
      noHistoryWrite: true,
      noValueWrite: true,
      noDetailsWrite: true,
      fetchOptInRequired: true,
      fetchAllowed: Boolean(options.allowFetch),
      fetchRequested: Boolean(options.resolvedUrlsFile && options.allowFetch)
    }
  };

  writeJson(paths.output, report);

  return report;
}

function selfTest() {
  const parsed = parseArgs([
    "--date=2026-05-18",
    "--limit=2",
    "--min-age-hours=0",
    "--max-search-descriptors=4",
    "--max-targets-per-match=3",
    "--max-tasks-per-match=2",
    "--resolved-urls-file=tmp/input.json",
    "--output=tmp/output.json",
    "--allow-fetch",
    "--keep-intermediate"
  ]);

  const ok = parsed.date === "2026-05-18" &&
    parsed.limit === 2 &&
    parsed.minAgeHours === 0 &&
    parsed.maxSearchDescriptors === 4 &&
    parsed.maxTargetsPerMatch === 3 &&
    parsed.maxTasksPerMatch === 2 &&
    parsed.resolvedUrlsFile === "tmp/input.json" &&
    parsed.output === "tmp/output.json" &&
    parsed.allowFetch === true &&
    parsed.keepIntermediate === true;

  return {
    ok,
    selfTest: "run-final-result-consensus-smoke-day",
    canonicalWrites: 0,
    noFetch: true,
    noFinalTruthDecision: true,
    noCanonicalPromotion: true
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isMain) {
  Promise.resolve()
    .then(async () => {
      const options = parseArgs();

      if (options.selfTest) {
        console.log(JSON.stringify(selfTest(), null, 2));
        return;
      }

      const report = await runConsensusSmokeDay(options);
      console.log(JSON.stringify({
        ok: report.ok,
        dayKey: report.dayKey,
        stage: report.stage,
        exitCode: report.exitCode,
        output: report.outputs.report,
        intermediateDir: report.outputs.intermediateDir,
        verification: report.summaries.verification,
        guarantees: report.guarantees
      }, null, 2));

      if (report.exitCode && report.exitCode !== 0 && report.stage === "source_snapshot_evidence_diagnostic_complete") {
        process.exitCode = report.exitCode;
      }
    })
    .catch((error) => {
      console.error(error?.stack || error?.message || String(error));
      process.exit(1);
    });
}

export {
  parseArgs,
  runConsensusSmokeDay,
  selfTest
};
