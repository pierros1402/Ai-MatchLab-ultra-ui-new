#!/usr/bin/env node

import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    targets: "",
    output: "",
    outputDir: "",
    sourceIndex: "",
    allowSearch: false,
    resume: false,
    selfTest: false,
    limit: 0,
    batchSize: 25,
    timeoutMs: 12000,
    maxChars: 120000,
    batchTimeoutMs: 180000
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--allow-search") {
      args.allowSearch = true;
      continue;
    }

    if (arg === "--resume") {
      args.resume = true;
      continue;
    }

    if (arg === "--targets" && argv[index + 1]) {
      args.targets = argv[++index];
      continue;
    }

    if (arg === "--output" && argv[index + 1]) {
      args.output = argv[++index];
      continue;
    }

    if (arg === "--output-dir" && argv[index + 1]) {
      args.outputDir = argv[++index];
      continue;
    }

    if (arg === "--source-index" && argv[index + 1]) {
      args.sourceIndex = argv[++index];
      continue;
    }

    if (arg === "--limit" && argv[index + 1]) {
      args.limit = Number(argv[++index]);
      continue;
    }

    if (arg === "--batch-size" && argv[index + 1]) {
      args.batchSize = Number(argv[++index]);
      continue;
    }

    if (arg === "--timeout-ms" && argv[index + 1]) {
      args.timeoutMs = Number(argv[++index]);
      continue;
    }

    if (arg === "--max-chars" && argv[index + 1]) {
      args.maxChars = Number(argv[++index]);
      continue;
    }

    if (arg === "--batch-timeout-ms" && argv[index + 1]) {
      args.batchTimeoutMs = Number(argv[++index]);
      continue;
    }

    throw new Error(`unknown or incomplete argument: ${arg}`);
  }

  return args;
}

function selectTargets(input) {
  if (Array.isArray(input)) return input;

  for (const key of ["searchTargetRows", "candidateTargetRows", "targets", "rows", "items"]) {
    if (Array.isArray(input?.[key])) return input[key];
  }

  return [];
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function batchLabel(index) {
  return String(index + 1).padStart(4, "0");
}

function logProgress(message, details = {}) {
  const payload = {
    at: new Date().toISOString(),
    ...details
  };

  console.log(`[autonomous-search-batches] ${message} ${JSON.stringify(payload)}`);
}

function collectJobPath() {
  return path.join(__dirname, "collect-fixture-league-date-autonomous-search-results-file.js");
}

function runCollectJob(args, timeoutMs) {
  return spawnSync(process.execPath, [collectJobPath(), ...args], {
    cwd: path.resolve(__dirname, "..", ".."),
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
    timeout: positiveInteger(timeoutMs, 180000)
  });
}

function buildProgressReport(state, status) {
  const searchResultRowCount = state.completedBatches.reduce(
    (sum, row) => sum + Number(row.searchResultRowCount || 0),
    0
  );

  return {
    ok: status === "complete" && state.failedBatches.length === 0,
    job: "run-fixture-league-date-autonomous-search-batches-file",
    mode: "read_only_autonomous_search_batch_progress",
    generatedAt: new Date().toISOString(),
    status,
    summary: {
      searchTargetCount: state.searchTargetCount,
      selectedSearchTargetCount: state.selectedSearchTargetCount,
      batchSize: state.batchSize,
      batchCount: state.batchCount,
      completedBatchCount: state.completedBatches.length,
      resumedBatchCount: state.resumedBatches.length,
      failedBatchCount: state.failedBatches.length,
      searchResultRowCount,
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    guarantees: {
      noFakeSearch: true,
      noWebSearchWithoutProvider: true,
      searchRequiresExplicitAllowSearch: true,
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    paths: state.paths,
    completedBatches: state.completedBatches,
    resumedBatches: state.resumedBatches,
    failedBatches: state.failedBatches
  };
}

function runBatchPipeline(args) {
  if (!args.targets) throw new Error("--targets is required");
  if (!args.output) throw new Error("--output is required");
  if (!args.outputDir) throw new Error("--output-dir is required");
  if (!args.allowSearch && !args.sourceIndex) {
    throw new Error("Search collection is fail-closed: pass --allow-search or --source-index");
  }

  const allTargets = selectTargets(readJson(args.targets));
  const selectedTargets = Number.isFinite(args.limit) && args.limit > 0
    ? allTargets.slice(0, args.limit)
    : allTargets;

  const batchSize = positiveInteger(args.batchSize, 25);
  const outputDir = path.resolve(args.outputDir);
  const batchesDir = path.join(outputDir, "search-batches");
  const batchTargetsDir = path.join(outputDir, "search-batch-targets");
  const progressOutput = path.join(outputDir, "autonomous-search-batch-progress.json");

  fs.mkdirSync(batchesDir, { recursive: true });
  fs.mkdirSync(batchTargetsDir, { recursive: true });

  const batches = [];
  for (let index = 0; index < selectedTargets.length; index += batchSize) {
    batches.push(selectedTargets.slice(index, index + batchSize));
  }

  const state = {
    searchTargetCount: allTargets.length,
    selectedSearchTargetCount: selectedTargets.length,
    batchSize,
    batchCount: batches.length,
    completedBatches: [],
    resumedBatches: [],
    failedBatches: [],
    paths: {
      output: path.resolve(args.output),
      outputDir,
      batchesDir,
      batchTargetsDir,
      progressOutput
    }
  };

  writeJson(progressOutput, buildProgressReport(state, "running"));

  logProgress("started", {
    searchTargetCount: state.searchTargetCount,
    selectedSearchTargetCount: state.selectedSearchTargetCount,
    batchSize: state.batchSize,
    batchCount: state.batchCount,
    output: state.paths.output,
    progressOutput: state.paths.progressOutput,
    sourceFetch: false,
    canonicalWrites: 0,
    productionWrite: false
  });

  const mergedSearchResultRows = [];
  const mergedSearchAttempts = [];

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const label = batchLabel(batchIndex);
    const batchTargets = batches[batchIndex];
    const batchTargetsPath = path.join(batchTargetsDir, `autonomous-search-targets-batch-${label}.json`);
    const batchOutputPath = path.join(batchesDir, `autonomous-search-results-batch-${label}.json`);

    logProgress("batch_start", {
      batchNumber: batchIndex + 1,
      batchCount: batches.length,
      selectedSearchTargetCount: batchTargets.length,
      completedBatchCount: state.completedBatches.length,
      resumedBatchCount: state.resumedBatches.length,
      failedBatchCount: state.failedBatches.length
    });

    writeJson(batchTargetsPath, {
      ok: true,
      job: "run-fixture-league-date-autonomous-search-batches-file",
      mode: "read_only_search_batch_targets",
      generatedAt: new Date().toISOString(),
      batch: {
        batchIndex,
        batchNumber: batchIndex + 1,
        batchCount: batches.length
      },
      searchTargetRows: batchTargets,
      guarantees: {
        sourceFetch: false,
        canonicalWrites: 0,
        productionWrite: false,
        dryRun: true
      }
    });

    let batchReport = null;

    if (args.resume && fs.existsSync(batchOutputPath)) {
      try {
        batchReport = readJson(batchOutputPath);
        state.resumedBatches.push({
          batchIndex,
          batchNumber: batchIndex + 1,
          output: batchOutputPath,
          selectedSearchTargetCount: batchReport.summary?.selectedSearchTargetCount || batchTargets.length,
          searchResultRowCount: batchReport.summary?.searchResultRowCount || 0,
          status: asText(batchReport.status || "resumed")
        });

        logProgress("batch_resume", {
          batchNumber: batchIndex + 1,
          batchCount: batches.length,
          output: batchOutputPath,
          searchResultRowCount: batchReport.summary?.searchResultRowCount || 0
        });
      } catch {
        batchReport = null;
      }
    }

    if (!batchReport) {
      const collectArgs = [
        "--targets", batchTargetsPath,
        "--output", batchOutputPath,
        "--limit", String(batchTargets.length),
        "--timeout-ms", String(args.timeoutMs),
        "--max-chars", String(args.maxChars)
      ];

      if (args.sourceIndex) collectArgs.push("--source-index", args.sourceIndex);
      if (args.allowSearch) collectArgs.push("--allow-search");

      const result = runCollectJob(collectArgs, args.batchTimeoutMs);

      if (result.status !== 0) {
        logProgress("batch_failed", {
          batchNumber: batchIndex + 1,
          batchCount: batches.length,
          timedOut: Boolean(result.error && result.error.code === "ETIMEDOUT"),
          error: result.error?.message || result.stderr || `collect exited ${result.status}`
        });

        state.failedBatches.push({
          batchIndex,
          batchNumber: batchIndex + 1,
          output: batchOutputPath,
          selectedSearchTargetCount: batchTargets.length,
          timedOut: Boolean(result.error && result.error.code === "ETIMEDOUT"),
          error: result.error?.message || result.stderr || `collect exited ${result.status}`
        });

        writeJson(progressOutput, buildProgressReport(state, "running_with_batch_failures"));
        continue;
      }

      batchReport = readJson(batchOutputPath);
    }

    for (const row of batchReport.searchResultRows || []) mergedSearchResultRows.push(row);
    for (const row of batchReport.searchAttempts || []) mergedSearchAttempts.push(row);

    state.completedBatches.push({
      batchIndex,
      batchNumber: batchIndex + 1,
      output: batchOutputPath,
      selectedSearchTargetCount: batchReport.summary?.selectedSearchTargetCount || batchTargets.length,
      searchResultRowCount: batchReport.summary?.searchResultRowCount || 0,
      status: asText(batchReport.status)
    });

    logProgress("batch_done", {
      batchNumber: batchIndex + 1,
      batchCount: batches.length,
      selectedSearchTargetCount: batchReport.summary?.selectedSearchTargetCount || batchTargets.length,
      batchSearchResultRowCount: batchReport.summary?.searchResultRowCount || 0,
      totalSearchResultRowCount: mergedSearchResultRows.length,
      completedBatchCount: state.completedBatches.length,
      resumedBatchCount: state.resumedBatches.length,
      failedBatchCount: state.failedBatches.length,
      output: batchOutputPath
    });

    writeJson(progressOutput, buildProgressReport(state, "running"));
  }

  const byStatus = {};
  for (const attempt of mergedSearchAttempts) {
    const key = asText(attempt.status || "unknown") || "unknown";
    byStatus[key] = (byStatus[key] || 0) + 1;
  }

  const finalReport = {
    ok: state.failedBatches.length === 0 && mergedSearchResultRows.length > 0,
    job: "run-fixture-league-date-autonomous-search-batches-file",
    mode: "read_only_autonomous_search_batch_orchestrator",
    generatedAt: new Date().toISOString(),
    status: state.failedBatches.length > 0
      ? "completed_with_batch_failures"
      : (mergedSearchResultRows.length > 0 ? "completed" : "completed_no_results"),
    summary: {
      searchTargetCount: allTargets.length,
      selectedSearchTargetCount: selectedTargets.length,
      batchSize,
      batchCount: batches.length,
      completedBatchCount: state.completedBatches.length,
      resumedBatchCount: state.resumedBatches.length,
      failedBatchCount: state.failedBatches.length,
      searchResultRowCount: mergedSearchResultRows.length,
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      byStatus
    },
    guarantees: {
      noFakeSearch: true,
      noWebSearchWithoutProvider: true,
      searchRequiresExplicitAllowSearch: true,
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    paths: state.paths,
    completedBatches: state.completedBatches,
    resumedBatches: state.resumedBatches,
    failedBatches: state.failedBatches,
    searchAttempts: mergedSearchAttempts,
    searchResultRows: mergedSearchResultRows
  };

  writeJson(path.resolve(args.output), finalReport);
  writeJson(progressOutput, buildProgressReport(state, "complete"));

  logProgress("complete", {
    status: finalReport.status,
    selectedSearchTargetCount: finalReport.summary.selectedSearchTargetCount,
    batchCount: finalReport.summary.batchCount,
    completedBatchCount: finalReport.summary.completedBatchCount,
    resumedBatchCount: finalReport.summary.resumedBatchCount,
    failedBatchCount: finalReport.summary.failedBatchCount,
    searchResultRowCount: finalReport.summary.searchResultRowCount,
    output: path.resolve(args.output),
    progressOutput
  });

  return finalReport;
}

function runSelfTest() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-search-batches-self-test-"));
  const targetsPath = path.join(tempDir, "targets.json");
  const sourceIndexPath = path.join(tempDir, "source-index.json");
  const outputPath = path.join(tempDir, "merged.json");
  const outputDir = path.join(tempDir, "out");

  writeJson(targetsPath, {
    searchTargetRows: [
      {
        searchTargetId: "2026-05-22:gre.1:official_league_fixture_calendar:official_league:0",
        leagueSlug: "gre.1",
        dayKey: "2026-05-22",
        query: "Super League Greece fixtures 2026-05-22"
      },
      {
        searchTargetId: "2026-05-22:bel.1:official_league_fixture_calendar:official_league:0",
        leagueSlug: "bel.1",
        dayKey: "2026-05-22",
        query: "Belgian Pro League fixtures 2026-05-22"
      }
    ]
  });

  writeJson(sourceIndexPath, {
    sourceIndexRows: [
      {
        searchTargetId: "2026-05-22:gre.1:official_league_fixture_calendar:official_league:0",
        title: "Super League Greece official fixtures",
        snippet: "Official fixture schedule.",
        url: "https://www.slgr.gr/en/schedule/",
        provider: "self_test_source_index"
      },
      {
        searchTargetId: "2026-05-22:bel.1:official_league_fixture_calendar:official_league:0",
        title: "Belgian Pro League official fixtures",
        snippet: "Official fixture schedule.",
        url: "https://www.proleague.be/calendar",
        provider: "self_test_source_index"
      }
    ]
  });

  const first = runBatchPipeline({
    targets: targetsPath,
    output: outputPath,
    outputDir,
    sourceIndex: sourceIndexPath,
    allowSearch: false,
    resume: false,
    limit: 0,
    batchSize: 1,
    timeoutMs: 5000,
    maxChars: 20000,
    batchTimeoutMs: 30000
  });

  if (first.summary.batchCount !== 2) throw new Error("expected 2 batches");
  if (first.summary.completedBatchCount !== 2) throw new Error("expected 2 completed batches");
  if (first.summary.searchResultRowCount !== 2) throw new Error("expected 2 merged search rows");

  const resumed = runBatchPipeline({
    targets: targetsPath,
    output: outputPath,
    outputDir,
    sourceIndex: sourceIndexPath,
    allowSearch: false,
    resume: true,
    limit: 0,
    batchSize: 1,
    timeoutMs: 5000,
    maxChars: 20000,
    batchTimeoutMs: 30000
  });

  if (resumed.summary.resumedBatchCount !== 2) throw new Error("expected 2 resumed batches");
  if (resumed.summary.searchResultRowCount !== 2) throw new Error("expected 2 resumed rows");
  if (resumed.guarantees.sourceFetch !== false) throw new Error("must not fetch");
  if (resumed.guarantees.canonicalWrites !== 0) throw new Error("must not write canonical rows");

  return {
    ok: true,
    selfTest: "run-fixture-league-date-autonomous-search-batches-file",
    summary: resumed.summary,
    guarantees: resumed.guarantees
  };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const report = runBatchPipeline(args);

  console.log(JSON.stringify({
    ok: true,
    output: path.resolve(args.output),
    outputDir: path.resolve(args.outputDir),
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main();