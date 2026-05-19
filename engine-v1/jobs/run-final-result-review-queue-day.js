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

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

function resolveFromRoot(file) {
  if (!file) return "";
  return path.isAbsolute(file) ? file : path.resolve(ROOT_DIR, file);
}

function relativeFromRoot(file) {
  return path.relative(ROOT_DIR, file).replace(/\\/g, "/");
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    date: "",
    resolvedUrlsFile: "",
    outputDir: "",
    allowFetch: false,
    keepIntermediate: false,
    limit: 5,
    minAgeHours: 0,
    maxSearchDescriptors: 6,
    maxTargetsPerMatch: 4,
    maxTasksPerMatch: 3,
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
    else if (arg === "--resolved-urls-file") out.resolvedUrlsFile = nextValue();
    else if (arg.startsWith("--resolved-urls-file=")) out.resolvedUrlsFile = cleanString(arg.slice("--resolved-urls-file=".length));
    else if (arg === "--output-dir") out.outputDir = nextValue();
    else if (arg.startsWith("--output-dir=")) out.outputDir = cleanString(arg.slice("--output-dir=".length));
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

  if (!out.selfTest && !out.date) throw new Error("missing required --date YYYY-MM-DD");
  if (!out.selfTest && !out.resolvedUrlsFile) throw new Error("missing required --resolved-urls-file <file>");
  if (!out.selfTest && !out.allowFetch) throw new Error("fetch is blocked unless explicit --allow-fetch is provided");

  return out;
}

function buildOutputPaths(options) {
  const outputDir = resolveFromRoot(options.outputDir || path.join("data", "football-truth", "_review-queue", options.date));

  return {
    outputDir,
    smokeReport: path.join(outputDir, "final-result-consensus-smoke-report.json"),
    reviewSummary: path.join(outputDir, "final-result-review-summary.json"),
    reviewQueue: path.join(outputDir, "final-result-review-queue.json"),
    wrapperReport: path.join(outputDir, "final-result-review-queue-day-report.json")
  };
}

function runNodeJob(scriptRelativePath, args, options = {}) {
  const scriptPath = path.resolve(ROOT_DIR, scriptRelativePath);
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: ROOT_DIR,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  const allowedExitCodes = options.allowedExitCodes || [0];

  if (!allowedExitCodes.includes(result.status)) {
    const message = [
      `job failed: ${scriptRelativePath}`,
      `exitCode: ${result.status}`,
      result.stdout ? `stdout:\n${result.stdout}` : "",
      result.stderr ? `stderr:\n${result.stderr}` : ""
    ].filter(Boolean).join("\n");

    throw new Error(message);
  }

  return {
    script: scriptRelativePath,
    exitCode: result.status,
    stdout: cleanString(result.stdout),
    stderr: cleanString(result.stderr)
  };
}

function compactJsonFile(file) {
  if (!fs.existsSync(file)) return null;
  return readJson(file);
}

async function run(options) {
  const paths = buildOutputPaths(options);
  fs.mkdirSync(paths.outputDir, { recursive: true });

  const resolvedUrlsFile = resolveFromRoot(options.resolvedUrlsFile);
  if (!fs.existsSync(resolvedUrlsFile)) {
    throw new Error(`resolved URLs file not found: ${resolvedUrlsFile}`);
  }

  const smokeArgs = [
    `--date=${options.date}`,
    `--limit=${options.limit}`,
    `--min-age-hours=${options.minAgeHours}`,
    `--max-search-descriptors=${options.maxSearchDescriptors}`,
    `--max-targets-per-match=${options.maxTargetsPerMatch}`,
    `--max-tasks-per-match=${options.maxTasksPerMatch}`,
    `--resolved-urls-file=${resolvedUrlsFile}`,
    `--output=${paths.smokeReport}`,
    `--timeout-ms=${options.timeoutMs}`,
    `--max-bytes=${options.maxBytes}`,
    `--max-text-chars=${options.maxTextChars}`
  ];

  if (options.allowFetch) smokeArgs.push("--allow-fetch");
  if (options.keepIntermediate) smokeArgs.push("--keep-intermediate");

  const smokeRun = runNodeJob("engine-v1/jobs/run-final-result-consensus-smoke-day.js", smokeArgs, {
    allowedExitCodes: [0, 1, 2]
  });

  const summaryRun = runNodeJob("engine-v1/jobs/build-final-result-consensus-review-summary-file.js", [
    `--input=${paths.smokeReport}`,
    `--output=${paths.reviewSummary}`
  ]);

  const queueRun = runNodeJob("engine-v1/jobs/build-final-result-review-queue-file.js", [
    `--input=${paths.reviewSummary}`,
    `--output=${paths.reviewQueue}`
  ]);

  const smokeReport = compactJsonFile(paths.smokeReport);
  const reviewSummary = compactJsonFile(paths.reviewSummary);
  const reviewQueue = compactJsonFile(paths.reviewQueue);

  const report = {
    ok: true,
    job: "run-final-result-review-queue-day",
    generatedAt: new Date().toISOString(),
    dayKey: options.date,
    stage: "review_queue_ready",
    exitCode: smokeReport?.exitCode ?? smokeRun.exitCode,
    runs: {
      smoke: smokeRun,
      summary: summaryRun,
      queue: queueRun
    },
    summaries: {
      smoke: {
        ok: smokeReport?.ok ?? null,
        stage: smokeReport?.stage || null,
        exitCode: smokeReport?.exitCode ?? null,
        validation: smokeReport?.summaries?.validation || null,
        wrapper: smokeReport?.summaries?.wrapper || null,
        verification: smokeReport?.summaries?.verification || null
      },
      reviewSummary: reviewSummary?.summary || null,
      reviewQueue: reviewQueue?.summary || null
    },
    outputs: {
      outputDir: relativeFromRoot(paths.outputDir),
      smokeReport: relativeFromRoot(paths.smokeReport),
      reviewSummary: relativeFromRoot(paths.reviewSummary),
      reviewQueue: relativeFromRoot(paths.reviewQueue),
      wrapperReport: relativeFromRoot(paths.wrapperReport)
    },
    guarantees: {
      readOnlyReviewQueueDay: true,
      canonicalWrites: 0,
      fetchOptInRequired: true,
      fetchAllowed: options.allowFetch === true,
      noFinalTruthProductionDecision: true,
      noCanonicalPromotion: true,
      noProductionRepair: true,
      noFixtureWrite: true,
      noHistoryWrite: true,
      noValueWrite: true,
      noDetailsWrite: true
    }
  };

  writeJson(paths.wrapperReport, report);

  return report;
}

function selfTest() {
  const paths = buildOutputPaths({
    date: "2026-05-18",
    outputDir: "data/football-truth/_review-queue/self-test"
  });

  return {
    ok: paths.outputDir.endsWith(path.join("data", "football-truth", "_review-queue", "self-test")) &&
      paths.smokeReport.endsWith("final-result-consensus-smoke-report.json") &&
      parseArgs(["--self-test"]).selfTest === true,
    selfTest: "run-final-result-review-queue-day",
    paths: {
      outputDir: relativeFromRoot(paths.outputDir),
      smokeReport: relativeFromRoot(paths.smokeReport),
      reviewSummary: relativeFromRoot(paths.reviewSummary),
      reviewQueue: relativeFromRoot(paths.reviewQueue),
      wrapperReport: relativeFromRoot(paths.wrapperReport)
    },
    guarantees: {
      readOnlyReviewQueueDay: true,
      canonicalWrites: 0,
      fetchOptInRequired: true,
      noFinalTruthProductionDecision: true,
      noCanonicalPromotion: true,
      noProductionRepair: true,
      noFixtureWrite: true,
      noHistoryWrite: true,
      noValueWrite: true,
      noDetailsWrite: true
    }
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

      const report = await run(options);
      console.log(JSON.stringify({
        ok: report.ok,
        dayKey: report.dayKey,
        stage: report.stage,
        exitCode: report.exitCode,
        summaries: report.summaries,
        outputs: report.outputs,
        guarantees: report.guarantees
      }, null, 2));
    })
    .catch((error) => {
      console.error(error?.stack || error?.message || String(error));
      process.exit(1);
    });
}

export {
  parseArgs,
  buildOutputPaths,
  run,
  selfTest
};