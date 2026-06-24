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
    date: "",
    output: "",
    outputDir: "",
    sourceIndex: "",
    leagueSlugs: [],
    limit: 1,
    searchLimit: 1,
    perTargetLimit: 10,
    perLeagueLimit: 20,
    timeoutMs: 8000,
    maxChars: 60000,
    allowSearch: false,
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

    if (arg === "--keep-intermediates") {
      args.keepIntermediates = true;
      continue;
    }

    if (arg === "--date" && argv[i + 1]) {
      args.date = argv[++i];
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      args.output = argv[++i];
      continue;
    }

    if (arg === "--output-dir" && argv[i + 1]) {
      args.outputDir = argv[++i];
      continue;
    }

    if (arg === "--source-index" && argv[i + 1]) {
      args.sourceIndex = argv[++i];
      continue;
    }

    if (arg === "--league-slugs" && argv[i + 1]) {
      args.leagueSlugs = String(argv[++i]).split(",").map((value) => value.trim()).filter(Boolean);
      continue;
    }

    if (arg === "--limit" && argv[i + 1]) {
      args.limit = Number(argv[++i]);
      continue;
    }

    if (arg === "--search-limit" && argv[i + 1]) {
      args.searchLimit = Number(argv[++i]);
      continue;
    }

    if (arg === "--per-target-limit" && argv[i + 1]) {
      args.perTargetLimit = Number(argv[++i]);
      continue;
    }

    if (arg === "--per-league-limit" && argv[i + 1]) {
      args.perLeagueLimit = Number(argv[++i]);
      continue;
    }

    if (arg === "--timeout-ms" && argv[i + 1]) {
      args.timeoutMs = Number(argv[++i]);
      continue;
    }

    if (arg === "--max-chars" && argv[i + 1]) {
      args.maxChars = Number(argv[++i]);
      continue;
    }

    throw new Error(`unknown or incomplete argument: ${arg}`);
  }

  return args;
}

function jobPath(name) {
  return path.join(__dirname, name);
}

function runNodeJob(name, args, stepName) {
  const result = spawnSync(process.execPath, [jobPath(name), ...args], {
    cwd: path.resolve(__dirname, "..", ".."),
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20
  });

  if (result.status !== 0) {
    const error = new Error(`${stepName} failed with exit ${result.status}`);
    error.stdout = result.stdout;
    error.stderr = result.stderr;
    throw error;
  }

  return {
    stepName,
    job: name,
    exitCode: result.status,
    stdoutTail: asText(result.stdout).slice(-4000),
    stderrTail: asText(result.stderr).slice(-4000)
  };
}

function summarizeStep(filePath) {
  const json = readJson(filePath);
  return {
    ok: json.ok,
    status: json.status || "",
    summary: json.summary || {},
    guarantees: json.guarantees || {}
  };
}

function safeDate() {
  return new Date().toISOString().slice(0, 10);
}

function buildPaths(baseDir, date) {
  return {
    plan: path.join(baseDir, `active-league-plan-${date}.json`),
    workset: path.join(baseDir, `autonomous-workset-${date}.json`),
    targets: path.join(baseDir, `autonomous-targets-${date}.json`),
    collected: path.join(baseDir, `autonomous-search-results-${date}.json`),
    validated: path.join(baseDir, `autonomous-search-results-validated-${date}.json`),
    ranked: path.join(baseDir, `autonomous-ranked-candidates-${date}.json`),
    reviewRows: path.join(baseDir, `autonomous-ranked-review-rows-${date}.json`),
    fetchRows: path.join(baseDir, `autonomous-ready-fetch-rows-${date}.json`)
  };
}

function assertReadOnlyGuarantees(report) {
  const guarantees = report.guarantees || {};
  const summary = report.summary || {};

  if (guarantees.sourceFetch !== false) throw new Error("final report must keep sourceFetch:false");
  if (guarantees.noFetch !== true) throw new Error("final report must keep noFetch:true");
  if (guarantees.noUrlFetch !== true) throw new Error("final report must keep noUrlFetch:true");
  if (guarantees.noCanonicalPromotion !== true) throw new Error("final report must keep noCanonicalPromotion:true");
  if (guarantees.canonicalWrites !== 0 || summary.canonicalWrites !== 0) throw new Error("canonicalWrites must be 0");
  if (guarantees.productionWrite !== false || summary.productionWrite !== false) throw new Error("productionWrite must be false");
}

function buildReport(args, paths, steps) {
  const stepSummaries = {
    plan: summarizeStep(paths.plan),
    workset: summarizeStep(paths.workset),
    targets: summarizeStep(paths.targets),
    collected: summarizeStep(paths.collected),
    validated: summarizeStep(paths.validated),
    ranked: summarizeStep(paths.ranked),
    reviewRows: summarizeStep(paths.reviewRows),
    fetchRows: summarizeStep(paths.fetchRows)
  };

  assertReadOnlyGuarantees(stepSummaries.fetchRows);

  const fetchRows = readJson(paths.fetchRows);
  const reviewRows = readJson(paths.reviewRows);

  return {
    ok: true,
    job: "run-active-league-autonomous-ready-fetch-plan-file",
    generatedAt: new Date().toISOString(),
    mode: "read_only_active_league_autonomous_ready_fetch_plan",
    date: args.date,
    sourceInput: {
      sourceIndexProvided: Boolean(args.sourceIndex),
      allowSearch: args.allowSearch === true,
      leagueSlugs: args.leagueSlugs || [],
      limit: args.limit,
      searchLimit: args.searchLimit,
      perTargetLimit: args.perTargetLimit,
      perLeagueLimit: args.perLeagueLimit
    },
    summary: {
      activeLeagueCount: stepSummaries.plan.summary.totalActiveLeagues || 0,
      selectedLeagueCount: stepSummaries.workset.summary.selectedRowCount || 0,
      searchTargetCount: stepSummaries.targets.summary.searchTargetCount || 0,
      collectedSearchResultCount: stepSummaries.collected.summary.searchResultRowCount || 0,
      validSearchResultCount: stepSummaries.validated.summary.validRowCount || 0,
      rankedCandidateCount: stepSummaries.ranked.summary.candidateUrlCount || 0,
      reviewRowCount: stepSummaries.reviewRows.summary.reviewRowCount || 0,
      primaryCandidateCount: stepSummaries.reviewRows.summary.primaryCandidateCount || 0,
      supplementalOnlyCount: stepSummaries.reviewRows.summary.supplementalOnlyCount || 0,
      notTruthReadyCount: stepSummaries.reviewRows.summary.notTruthReadyCount || 0,
      readyForFetchCount: stepSummaries.fetchRows.summary.readyForFetchCount || 0,
      rejectedCandidateRowCount: stepSummaries.fetchRows.summary.rejectedCandidateRowCount || 0,
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    paths,
    stepSummaries,
    readyForFetchRows: fetchRows.readyForFetchRows || [],
    rejectedRows: fetchRows.rejectedRows || [],
    reviewRows: reviewRows.reviewRows || [],
    executedSteps: steps,
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

function runPipeline(args) {
  if (!args.date) throw new Error("--date is required");
  if (!args.output && !args.outputDir) throw new Error("--output or --output-dir is required");
  if (!args.allowSearch && !args.sourceIndex) {
    throw new Error("Search collection is fail-closed: pass --allow-search or --source-index");
  }

  const baseDir = args.outputDir
    ? path.resolve(args.outputDir)
    : fs.mkdtempSync(path.join(os.tmpdir(), `aiml-ready-fetch-plan-${args.date}-`));

  fs.mkdirSync(baseDir, { recursive: true });
  const paths = buildPaths(baseDir, args.date);
  const steps = [];

  steps.push(runNodeJob("build-active-league-acquisition-plan-file.js", [
    "--date", args.date,
    "--output", paths.plan
  ], "active league plan"));

  const worksetArgs = [
    "--input", paths.plan,
    "--output", paths.workset,
    "--limit", String(args.limit)
  ];

  if (Array.isArray(args.leagueSlugs) && args.leagueSlugs.length > 0) {
    worksetArgs.push("--league-slugs", args.leagueSlugs.join(","));
  }

  steps.push(runNodeJob("build-fixture-league-date-autonomous-source-discovery-workset-file.js", worksetArgs, "autonomous discovery workset"));

  steps.push(runNodeJob("build-fixture-league-date-autonomous-source-candidate-targets-file.js", [
    "--input", paths.workset,
    "--output", paths.targets
  ], "autonomous source candidate targets"));

  const collectArgs = [
    "--targets", paths.targets,
    "--output", paths.collected,
    "--limit", String(args.searchLimit),
    "--timeout-ms", String(args.timeoutMs),
    "--max-chars", String(args.maxChars)
  ];

  if (args.sourceIndex) collectArgs.push("--source-index", args.sourceIndex);
  if (args.allowSearch) collectArgs.push("--allow-search");

  steps.push(runNodeJob("collect-fixture-league-date-autonomous-search-results-file.js", collectArgs, "autonomous search results"));

  steps.push(runNodeJob("validate-fixture-league-date-autonomous-search-results-file.js", [
    "--input", paths.collected,
    "--output", paths.validated
  ], "validate autonomous search results"));

  steps.push(runNodeJob("rank-fixture-league-date-autonomous-search-results-file.js", [
    "--targets", paths.targets,
    "--search-results", paths.validated,
    "--output", paths.ranked,
    "--per-target-limit", String(args.perTargetLimit),
    "--per-league-limit", String(args.perLeagueLimit)
  ], "rank autonomous candidates"));

  steps.push(runNodeJob("materialize-fixture-league-date-ranked-candidates-review-rows-file.js", [
    "--input", paths.ranked,
    "--output", paths.reviewRows
  ], "ranked candidates to review rows"));

  steps.push(runNodeJob("materialize-fixture-league-date-source-candidate-fetch-rows-file.js", [
    "--input", paths.reviewRows,
    "--output", paths.fetchRows
  ], "source candidate fetch rows"));

  const report = buildReport(args, paths, steps);

  if (args.output) {
    writeJson(path.resolve(args.output), report);
  }

  if (!args.keepIntermediates && !args.outputDir) {
    fs.rmSync(baseDir, { recursive: true, force: true });
  }

  return report;
}

function runSelfTest() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-ready-fetch-plan-self-test-"));
  const date = "2026-05-28";
  const sourceIndex = path.join(tempDir, "source-index.json");
  const output = path.join(tempDir, "report.json");

  writeJson(sourceIndex, {
    sourceIndexRows: [
      {
        searchTargetId: "2026-05-28:eng.1:official_league_fixture_calendar:official_league:0",
        title: "Premier League fixtures",
        snippet: "Official Premier League fixtures and schedule.",
        url: "https://www.premierleague.com/fixtures",
        provider: "self_test_source_index"
      },
      {
        searchTargetId: "2026-05-28:eng.1:official_league_fixture_calendar:official_league:0",
        title: "ESPN Premier League fixtures",
        snippet: "Premier League fixtures and schedule.",
        url: "https://www.espn.com/soccer/fixtures/_/league/eng.1",
        provider: "self_test_source_index"
      }
    ]
  });

  const report = runPipeline({
    date,
    output,
    outputDir: tempDir,
    sourceIndex,
    limit: 1,
    searchLimit: 1,
    perTargetLimit: 10,
    perLeagueLimit: 20,
    timeoutMs: 8000,
    maxChars: 60000,
    allowSearch: false,
    keepIntermediates: true
  });

  if (report.summary.selectedLeagueCount !== 1) throw new Error("self-test expected 1 selected league");
  if (report.summary.readyForFetchCount < 1) throw new Error("self-test expected at least 1 ready fetch row");
  if (!report.readyForFetchRows.some((row) => asText(row.resolvedUrl).includes("premierleague.com"))) {
    throw new Error("self-test expected Premier League official URL in ready rows");
  }
  if (report.readyForFetchRows.some((row) => asText(row.resolvedUrl).includes("espn.com"))) {
    throw new Error("self-test must not allow ESPN as fetch-ready truth source");
  }

  assertReadOnlyGuarantees(report);
  fs.rmSync(tempDir, { recursive: true, force: true });

  return {
    ok: true,
    selfTest: "run-active-league-autonomous-ready-fetch-plan-file",
    summary: report.summary,
    guarantees: report.guarantees
  };
}

async function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const report = runPipeline(args);
  console.log(JSON.stringify({
    ok: true,
    output: args.output || "",
    outputDir: args.outputDir || "",
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    if (error?.stdout) console.error(`\n--- stdout tail ---\n${error.stdout}`);
    if (error?.stderr) console.error(`\n--- stderr tail ---\n${error.stderr}`);
    process.exitCode = 1;
  });
}
