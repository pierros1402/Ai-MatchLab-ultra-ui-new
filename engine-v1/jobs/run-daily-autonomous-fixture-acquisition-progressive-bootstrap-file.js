#!/usr/bin/env node

import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    date: "",
    output: "",
    outputDir: "",
    wave: "1",
    maxLeagues: 0,
    maxTargets: 0,
    maxBatches: 0,
    batchSize: 8,
    fetchLimit: 20,
    timeoutMs: 12000,
    batchTimeoutMs: 180000,
    allowSearch: false,
    allowFetch: false,
    keepIntermediates: false,
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--allow-search") {
      args.allowSearch = true;
      continue;
    }

    if (arg === "--allow-fetch") {
      args.allowFetch = true;
      continue;
    }

    if (arg === "--keep-intermediates") {
      args.keepIntermediates = true;
      continue;
    }

    if (arg === "--date" && argv[i + 1]) {
      args.date = String(argv[++i]);
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      args.output = String(argv[++i]);
      continue;
    }

    if (arg === "--output-dir" && argv[i + 1]) {
      args.outputDir = String(argv[++i]);
      continue;
    }

    if (arg === "--wave" && argv[i + 1]) {
      args.wave = String(argv[++i]);
      continue;
    }

    if (arg === "--max-leagues" && argv[i + 1]) {
      args.maxLeagues = Number(argv[++i]);
      continue;
    }

    if (arg === "--max-targets" && argv[i + 1]) {
      args.maxTargets = Number(argv[++i]);
      continue;
    }

    if (arg === "--max-batches" && argv[i + 1]) {
      args.maxBatches = Number(argv[++i]);
      continue;
    }

    if (arg === "--batch-size" && argv[i + 1]) {
      args.batchSize = Number(argv[++i]);
      continue;
    }

    if (arg === "--fetch-limit" && argv[i + 1]) {
      args.fetchLimit = Number(argv[++i]);
      continue;
    }

    if (arg === "--timeout-ms" && argv[i + 1]) {
      args.timeoutMs = Number(argv[++i]);
      continue;
    }

    if (arg === "--batch-timeout-ms" && argv[i + 1]) {
      args.batchTimeoutMs = Number(argv[++i]);
      continue;
    }

    throw new Error("unknown or incomplete argument: " + arg);
  }

  return args;
}

function positiveInteger(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function selectRows(input, keys) {
  if (Array.isArray(input)) return input;
  for (const key of keys) {
    if (Array.isArray(input?.[key])) return input[key];
  }
  return [];
}

function statePathForDate(date) {
  return path.join(repoRoot, "data", "football-truth", "_state", "league-day-activity", date + ".json");
}

function seasonWatchPath() {
  return path.join(repoRoot, "data", "football-truth", "_state", "league-season-watch", "league-season-watch.json");
}

function runNodeJob(jobName, args, label) {
  const result = spawnSync(process.execPath, [path.join(__dirname, jobName), ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 60
  });

  const step = {
    label,
    job: jobName,
    exitCode: result.status,
    stdoutTail: asText(result.stdout).slice(-5000),
    stderrTail: asText(result.stderr).slice(-5000)
  };

  if (result.status !== 0) {
    const error = new Error(label + " failed with exit " + result.status);
    error.step = step;
    throw error;
  }

  return step;
}

function progressiveArgs(args, outputDir, passName, includeFetch) {
  const outDir = path.join(outputDir, passName);
  const cmd = [
    "--date", args.date,
    "--output-dir", outDir,
    "--wave", args.wave,
    "--batch-size", String(positiveInteger(args.batchSize, 8)),
    "--timeout-ms", String(positiveInteger(args.timeoutMs, 12000)),
    "--batch-timeout-ms", String(positiveInteger(args.batchTimeoutMs, 180000)),
    "--keep-intermediates"
  ];

  if (positiveInteger(args.maxLeagues, 0)) {
    cmd.push("--max-leagues", String(positiveInteger(args.maxLeagues, 0)));
  }

  if (positiveInteger(args.maxTargets, 0)) {
    cmd.push("--max-targets", String(positiveInteger(args.maxTargets, 0)));
  }

  if (positiveInteger(args.maxBatches, 0)) {
    cmd.push("--max-batches", String(positiveInteger(args.maxBatches, 0)));
  }

  if (args.allowSearch) {
    cmd.push("--allow-search");
  }

  if (includeFetch) {
    cmd.push("--allow-fetch");
    cmd.push("--fetch-limit", String(positiveInteger(args.fetchLimit, 20)));
  }

  return {
    args: cmd,
    outputDir: outDir,
    reportPath: path.join(outDir, "daily-autonomous-fixture-acquisition-progressive-" + args.date + ".json")
  };
}

function compactProgressiveReport(reportPath) {
  if (!fs.existsSync(reportPath)) {
    return {
      exists: false,
      path: reportPath
    };
  }

  const report = readJson(reportPath);
  return {
    exists: true,
    path: reportPath,
    ok: report.ok === true,
    mode: report.mode || "",
    summary: report.summary || {},
    readyCoverage: report.readyCoverage || {},
    evidenceCoverage: report.evidenceCoverage || {},
    guarantees: report.guarantees || {}
  };
}

function assertReadOnly(report) {
  const summary = report.summary || {};
  const guarantees = report.guarantees || {};

  if (summary.canonicalWrites !== 0) throw new Error("summary.canonicalWrites must be 0");
  if (summary.productionWrite !== false) throw new Error("summary.productionWrite must be false");
  if (guarantees.canonicalWrites !== 0) throw new Error("guarantees.canonicalWrites must be 0");
  if (guarantees.productionWrite !== false) throw new Error("guarantees.productionWrite must be false");
}

function runPipeline(args) {
  if (!args.date) throw new Error("--date YYYY-MM-DD is required");
  if (!args.allowSearch) throw new Error("Bootstrap wrapper is fail-closed: pass --allow-search.");
  if (!args.allowFetch) throw new Error("Bootstrap wrapper needs --allow-fetch so it can create league-day-activity state.");

  const outputDir = args.outputDir
    ? path.resolve(args.outputDir)
    : fs.mkdtempSync(path.join(os.tmpdir(), "aiml-progressive-bootstrap-" + args.date + "-"));

  fs.mkdirSync(outputDir, { recursive: true });

  const statePath = statePathForDate(args.date);
  const watchPath = seasonWatchPath();
  const stateExistedBefore = fs.existsSync(statePath);
  const steps = [];

  const bootstrap = progressiveArgs(args, outputDir, "pass1-bootstrap-state", true);
  steps.push(runNodeJob(
    "run-daily-autonomous-fixture-acquisition-progressive-file.js",
    bootstrap.args,
    "pass1 bootstrap progressive run"
  ));

  const stateExistsAfterBootstrap = fs.existsSync(statePath);
  const bootstrapState = stateExistsAfterBootstrap ? readJson(statePath) : null;
  const bootstrapStateRows = selectRows(bootstrapState, ["leagueDayActivityRows", "dayActivityRows", "rows"]);

  if (!stateExistsAfterBootstrap || bootstrapStateRows.length === 0) {
    const failedReport = {
      ok: false,
      job: "run-daily-autonomous-fixture-acquisition-progressive-bootstrap-file",
      mode: "read_only_progressive_state_bootstrap_failed",
      generatedAt: new Date().toISOString(),
      date: args.date,
      summary: {
        stateExistedBefore,
        stateExistsAfterBootstrap,
        bootstrapStateRowCount: bootstrapStateRows.length,
        pass2Executed: false,
        canonicalWrites: 0,
        productionWrite: false,
        dryRun: true
      },
      paths: {
        outputDir,
        leagueDayActivityState: statePath,
        leagueSeasonWatchState: watchPath,
        pass1Report: bootstrap.reportPath
      },
      pass1: compactProgressiveReport(bootstrap.reportPath),
      executedSteps: steps,
      guarantees: {
        sourceFetch: true,
        fetchRequiresExplicitAllowFetch: true,
        searchRequiresExplicitAllowSearch: true,
        noCanonicalPromotion: true,
        canonicalWrites: 0,
        productionWrite: false,
        dryRun: true
      }
    };

    assertReadOnly(failedReport);

    const failedOutput = args.output
      ? path.resolve(args.output)
      : path.join(outputDir, "daily-autonomous-fixture-acquisition-progressive-bootstrap-" + args.date + ".json");

    writeJson(failedOutput, failedReport);
    return { report: failedReport, outputPath: failedOutput };
  }

  const routed = progressiveArgs(args, outputDir, "pass2-routed-by-day-activity-state", args.allowFetch);
  steps.push(runNodeJob(
    "run-daily-autonomous-fixture-acquisition-progressive-file.js",
    routed.args,
    "pass2 routed progressive run"
  ));

  const pass1 = compactProgressiveReport(bootstrap.reportPath);
  const pass2 = compactProgressiveReport(routed.reportPath);

  const report = {
    ok: true,
    job: "run-daily-autonomous-fixture-acquisition-progressive-bootstrap-file",
    mode: "read_only_progressive_bootstrap_then_routed_acquisition",
    generatedAt: new Date().toISOString(),
    date: args.date,
    summary: {
      stateExistedBefore,
      stateExistsAfterBootstrap,
      bootstrapStateRowCount: bootstrapStateRows.length,
      pass2Executed: true,
      pass2DayActivityRoutingApplied: pass2.summary?.dayActivityRoutingApplied === true,
      pass2ReadyForFetchLeagueCount: pass2.summary?.readyForFetchLeagueCount || 0,
      pass2ZeroReadyLeagueCount: pass2.summary?.zeroReadyLeagueCount || 0,
      pass2TargetDateFixtureEvidenceRowCount: pass2.summary?.targetDateFixtureEvidenceRowCount || 0,
      pass2FixtureEvidenceLeagueCount: pass2.summary?.fixtureEvidenceLeagueCount || 0,
      pass2TargetDateFixtureAcquisitionRequiredCount: pass2.summary?.targetDateFixtureAcquisitionRequiredCount || 0,
      pass2ValuePipelineCandidateCount: pass2.summary?.valuePipelineCandidateCount || 0,
      pass2ContinueAutonomousSearchCount: pass2.summary?.continueAutonomousSearchCount || 0,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    paths: {
      outputDir,
      leagueDayActivityState: statePath,
      leagueSeasonWatchState: watchPath,
      pass1Report: bootstrap.reportPath,
      pass2Report: routed.reportPath
    },
    pass1,
    pass2,
    executedSteps: steps,
    guarantees: {
      sourceFetch: true,
      fetchRequiresExplicitAllowFetch: true,
      searchRequiresExplicitAllowSearch: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };

  assertReadOnly(report);

  const outputPath = args.output
    ? path.resolve(args.output)
    : path.join(outputDir, "daily-autonomous-fixture-acquisition-progressive-bootstrap-" + args.date + ".json");

  writeJson(outputPath, report);

  if (!args.keepIntermediates && !args.outputDir) {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }

  return { report, outputPath };
}

function runSelfTest() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-progressive-bootstrap-self-test-"));
  const date = "2099-01-01";
  const statePath = path.join(tmpDir, "state.json");

  const report = {
    ok: true,
    job: "run-daily-autonomous-fixture-acquisition-progressive-bootstrap-file",
    mode: "self_test",
    generatedAt: new Date().toISOString(),
    date,
    summary: {
      stateExistedBefore: false,
      stateExistsAfterBootstrap: true,
      bootstrapStateRowCount: 1,
      pass2Executed: true,
      pass2DayActivityRoutingApplied: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    paths: {
      leagueDayActivityState: statePath
    },
    guarantees: {
      sourceFetch: false,
      fetchRequiresExplicitAllowFetch: true,
      searchRequiresExplicitAllowSearch: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };

  assertReadOnly(report);
  fs.rmSync(tmpDir, { recursive: true, force: true });

  return {
    ok: true,
    selfTest: "run-daily-autonomous-fixture-acquisition-progressive-bootstrap-file",
    summary: report.summary,
    guarantees: report.guarantees
  };
}

try {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    process.exit(0);
  }

  const { report, outputPath } = runPipeline(args);
  console.log(JSON.stringify({
    ok: report.ok,
    outputPath,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  if (error && error.step) {
    console.error(JSON.stringify(error.step, null, 2));
  }
  process.exit(1);
}
