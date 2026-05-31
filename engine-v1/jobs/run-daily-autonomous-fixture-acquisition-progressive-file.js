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
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    date: "",
    inputPlan: "",
    output: "",
    outputDir: "",
    wave: "all",
    maxLeagues: 0,
    maxTargets: 0,
    maxBatches: 0,
    batchSize: 8,
    sourceIndex: "",
    allowSearch: false,
    allowFetch: false,
    resume: false,
    keepIntermediates: false,
    timeoutMs: 12000,
    maxChars: 120000,
    batchTimeoutMs: 180000,
    fetchLimit: 20,
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

    if (arg === "--resume") {
      args.resume = true;
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

    if (arg === "--input-plan" && argv[i + 1]) {
      args.inputPlan = String(argv[++i]);
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

    if (arg === "--source-index" && argv[i + 1]) {
      args.sourceIndex = String(argv[++i]);
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

    if (arg === "--batch-timeout-ms" && argv[i + 1]) {
      args.batchTimeoutMs = Number(argv[++i]);
      continue;
    }

    if (arg === "--fetch-limit" && argv[i + 1]) {
      args.fetchLimit = Number(argv[++i]);
      continue;
    }

    throw new Error(`unknown or incomplete argument: ${arg}`);
  }

  return args;
}

function positiveInteger(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function jobPath(name) {
  return path.join(__dirname, name);
}

function runNodeJob(name, args, stepName) {
  const result = spawnSync(process.execPath, [jobPath(name), ...args], {
    cwd: path.resolve(__dirname, "..", ".."),
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 30
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

function selectRows(input, keys) {
  if (Array.isArray(input)) return input;
  for (const key of keys) {
    if (Array.isArray(input?.[key])) return input[key];
  }
  return [];
}

function leagueOf(row) {
  return asText(row.leagueSlug || row.slug || row.league);
}

function targetDateOf(row) {
  return asText(row.dayKey || row.targetDate || row.date);
}

function capTargetsPerLeague(rows, perLeagueLimit) {
  const limit = positiveInteger(perLeagueLimit, 1);
  const counts = new Map();
  const out = [];

  for (const row of rows) {
    const league = leagueOf(row);
    if (!league) continue;

    const count = counts.get(league) || 0;
    if (count >= limit) continue;

    counts.set(league, count + 1);
    out.push(row);
  }

  return out;
}

function intentOf(row) {
  return asText(row.intent || row.queryIntent || row.searchIntent);
}

function expectedSourceFamilyOf(row) {
  return asText(row.expectedSourceFamily || row.sourceFamily || row.sourceClass);
}

function diversifyTargetsPerLeague(rows, perLeagueLimit) {
  const limit = positiveInteger(perLeagueLimit, 4);
  const grouped = rowsByLeague(rows);
  const out = [];

  const preferredIntents = [
    "official_fixture_url_surface_probe",
    "official_fixture_url_surface",
    "official_date_fixture_page",
    "official_league_fixture_calendar",
    "trusted_independent_fixture_listing",
    "supplemental_scoreboard_crosscheck",
    "federation_competition_calendar",
    "broad_fixture_discovery",
    "fallback_relevant_fixture_search"
  ];

  for (const [league, leagueRows] of grouped.entries()) {
    const selected = [];
    const usedKeys = new Set();

    for (const intent of preferredIntents) {
      const candidate = leagueRows.find((row) => intentOf(row) === intent);
      if (!candidate) continue;

      const key = asText(candidate.query || candidate.url || JSON.stringify(candidate));
      if (key && usedKeys.has(key)) continue;

      selected.push(candidate);
      if (key) usedKeys.add(key);
      if (selected.length >= limit) break;
    }

    for (const candidate of leagueRows) {
      if (selected.length >= limit) break;

      const key = asText(candidate.query || candidate.url || JSON.stringify(candidate));
      if (key && usedKeys.has(key)) continue;

      selected.push(candidate);
      if (key) usedKeys.add(key);
    }

    out.push(...selected);
  }

  return out;
}

function capTotalTargets(rows, args) {
  let cap = positiveInteger(args.maxTargets, 0);
  const batchSize = positiveInteger(args.batchSize, 8);
  const maxBatches = positiveInteger(args.maxBatches, 0);

  if (!cap && maxBatches) cap = batchSize * maxBatches;
  if (!cap) return rows;

  return rows.slice(0, cap);
}

function uniqueLeagues(rows) {
  return Array.from(new Set(rows.map(leagueOf).filter(Boolean))).sort();
}

function rowsByLeague(rows) {
  const map = new Map();
  for (const row of rows) {
    const league = leagueOf(row);
    if (!league) continue;
    if (!map.has(league)) map.set(league, []);
    map.get(league).push(row);
  }
  return map;
}

function readyRows(input) {
  return selectRows(input, ["readyForFetchRows", "rows", "items"]).filter((row) => {
    return row.readyForFetch === true || asText(row.fetchPurpose) || asText(row.resolvedUrl);
  });
}

function summarizeReadyCoverage(selectedLeagues, fetchRowsReport) {
  const ready = readyRows(fetchRowsReport);
  const readyLeagueSet = new Set(ready.map(leagueOf).filter(Boolean));
  const zeroReadyLeagues = selectedLeagues.filter((league) => !readyLeagueSet.has(league));

  const rejectedRows = selectRows(fetchRowsReport, ["rejectedRows"]);
  const topRejectionReasons = {};
  for (const row of rejectedRows) {
    const reason = asText(row.rejectionReason || row.reason || row.status || "unknown");
    topRejectionReasons[reason] = (topRejectionReasons[reason] || 0) + 1;
  }

  return {
    selectedLeagueCount: selectedLeagues.length,
    readyForFetchLeagueCount: readyLeagueSet.size,
    zeroReadyLeagueCount: zeroReadyLeagues.length,
    zeroReadyLeagues,
    readyForFetchRowCount: ready.length,
    rejectedCandidateRowCount: rejectedRows.length,
    topRejectionReasons
  };
}

function summarizeEvidenceCoverage(extractReport) {
  if (!extractReport) {
    return {
      fetchExecuted: false,
      fetchedSnapshotCount: 0,
      fixtureEvidenceLeagueCount: 0,
      targetDateFixtureEvidenceRowCount: 0,
      targetCompetitionEvidenceCandidateCount: 0,
      secondSourceCandidateCount: 0,
      blockedEvidenceRowCount: 0
    };
  }

  const evidenceRows = selectRows(extractReport, ["evidenceRows"]);
  const targetRows = evidenceRows.filter((row) => {
    const state = asText(row.extractionState);
    return state === "candidate_target_competition_fixture_rows_needs_validation";
  });

  return {
    fetchExecuted: true,
    fetchedSnapshotCount: extractReport.summary?.inputSnapshotCount || 0,
    fixtureEvidenceLeagueCount: uniqueLeagues(targetRows).length,
    targetDateFixtureEvidenceRowCount: targetRows.length,
    targetCompetitionEvidenceCandidateCount: extractReport.summary?.targetCompetitionEvidenceCandidateCount || 0,
    secondSourceCandidateCount: targetRows.length,
    blockedEvidenceRowCount: evidenceRows.length - targetRows.length,
    byExtractionState: extractReport.byExtractionState || {},
    byLeague: extractReport.byLeague || {}
  };
}

function assertReadOnly(report) {
  const summary = report.summary || {};
  const guarantees = report.guarantees || {};

  if (summary.canonicalWrites !== 0) throw new Error("summary.canonicalWrites must be 0");
  if (summary.productionWrite !== false) throw new Error("summary.productionWrite must be false");
  if (guarantees.canonicalWrites !== 0) throw new Error("guarantees.canonicalWrites must be 0");
  if (guarantees.productionWrite !== false) throw new Error("guarantees.productionWrite must be false");
  if (guarantees.noCanonicalPromotion !== true) throw new Error("must keep noCanonicalPromotion:true");
}

function buildPaths(baseDir, date) {
  return {
    plan: path.join(baseDir, `active-league-plan-${date}.json`),
    workset: path.join(baseDir, `autonomous-workset-${date}.json`),
    allTargets: path.join(baseDir, `autonomous-targets-all-${date}.json`),
    wave1Targets: path.join(baseDir, `wave1-targets-${date}.json`),
    wave1Search: path.join(baseDir, `wave1-search-results-${date}.json`),
    wave1SearchDir: path.join(baseDir, "wave1-search-batches"),
    wave1Validated: path.join(baseDir, `wave1-validated-${date}.json`),
    wave1Ranked: path.join(baseDir, `wave1-ranked-${date}.json`),
    wave1ReviewRows: path.join(baseDir, `wave1-review-rows-${date}.json`),
    wave1FetchRows: path.join(baseDir, `wave1-fetch-rows-${date}.json`),
    wave2Targets: path.join(baseDir, `wave2-targets-${date}.json`),
    wave2Search: path.join(baseDir, `wave2-search-results-${date}.json`),
    wave2SearchDir: path.join(baseDir, "wave2-search-batches"),
    wave2Validated: path.join(baseDir, `wave2-validated-${date}.json`),
    wave2Ranked: path.join(baseDir, `wave2-ranked-${date}.json`),
    wave2ReviewRows: path.join(baseDir, `wave2-review-rows-${date}.json`),
    wave2FetchRows: path.join(baseDir, `wave2-fetch-rows-${date}.json`),
    mergedFetchRows: path.join(baseDir, `merged-fetch-rows-${date}.json`),
    fetched: path.join(baseDir, `fetched-source-candidate-snapshots-${date}.json`),
    classified: path.join(baseDir, `classified-source-candidate-snapshots-${date}.json`),
    evidence: path.join(baseDir, `source-candidate-evidence-${date}.json`)
  };
}

function runSearchWave({ args, paths, waveName, selectedTargetsPath, searchPath, searchDir, validatedPath, rankedPath, reviewRowsPath, fetchRowsPath }) {
  const steps = [];

  const batchArgs = [
    "--targets", selectedTargetsPath,
    "--output", searchPath,
    "--output-dir", searchDir,
    "--batch-size", String(positiveInteger(args.batchSize, 8)),
    "--timeout-ms", String(positiveInteger(args.timeoutMs, 12000)),
    "--max-chars", String(positiveInteger(args.maxChars, 120000)),
    "--batch-timeout-ms", String(positiveInteger(args.batchTimeoutMs, 180000))
  ];

  if (args.sourceIndex) batchArgs.push("--source-index", args.sourceIndex);
  if (args.allowSearch) batchArgs.push("--allow-search");
  if (args.resume) batchArgs.push("--resume");

  steps.push(runNodeJob("run-fixture-league-date-autonomous-search-batches-file.js", batchArgs, `${waveName} search batches`));

  steps.push(runNodeJob("validate-fixture-league-date-autonomous-search-results-file.js", [
    "--input", searchPath,
    "--output", validatedPath
  ], `${waveName} validate search results`));

  steps.push(runNodeJob("rank-fixture-league-date-autonomous-search-results-file.js", [
    "--targets", selectedTargetsPath,
    "--search-results", validatedPath,
    "--output", rankedPath,
    "--per-target-limit", "10",
    "--per-league-limit", "20"
  ], `${waveName} rank candidates`));

  steps.push(runNodeJob("materialize-fixture-league-date-ranked-candidates-review-rows-file.js", [
    "--input", rankedPath,
    "--output", reviewRowsPath
  ], `${waveName} review rows`));

  steps.push(runNodeJob("materialize-fixture-league-date-source-candidate-fetch-rows-file.js", [
    "--input", reviewRowsPath,
    "--output", fetchRowsPath
  ], `${waveName} fetch rows`));

  const fetchRowsReport = readJson(fetchRowsPath);
  assertReadOnly(fetchRowsReport);

  return {
    waveName,
    steps,
    search: readJson(searchPath),
    fetchRowsReport
  };
}

function mergeFetchRows(outputPath, reports) {
  const ready = [];
  const rejected = [];
  const seen = new Set();

  for (const report of reports.filter(Boolean)) {
    for (const row of readyRows(report)) {
      const key = asText(row.resolvedUrl || row.candidateUrl || row.url);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      ready.push(row);
    }

    for (const row of selectRows(report, ["rejectedRows"])) rejected.push(row);
  }

  const merged = {
    ok: true,
    job: "run-daily-autonomous-fixture-acquisition-progressive-file",
    mode: "read_only_merged_ready_fetch_rows",
    generatedAt: new Date().toISOString(),
    summary: {
      readyForFetchCount: ready.length,
      rejectedCandidateRowCount: rejected.length,
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    readyForFetchRows: ready,
    rejectedRows: rejected
  };

  writeJson(outputPath, merged);
  return merged;
}

function runPipeline(args) {
  if (!args.date) throw new Error("--date YYYY-MM-DD is required");
  if (!["1", "2", "all"].includes(args.wave)) throw new Error("--wave must be 1, 2, or all");
  if (!args.allowSearch && !args.sourceIndex) {
    throw new Error("Search is fail-closed: pass --allow-search or --source-index");
  }

  const outputDir = args.outputDir
    ? path.resolve(args.outputDir)
    : fs.mkdtempSync(path.join(os.tmpdir(), `aiml-daily-autonomous-progressive-${args.date}-`));

  fs.mkdirSync(outputDir, { recursive: true });

  const paths = buildPaths(outputDir, args.date);
  const steps = [];

  if (args.inputPlan) {
    fs.copyFileSync(path.resolve(args.inputPlan), paths.plan);
  } else {
    steps.push(runNodeJob("build-active-league-acquisition-plan-file.js", [
      "--date", args.date,
      "--output", paths.plan
    ], "active league plan"));
  }

  const worksetArgs = [
    "--input", paths.plan,
    "--output", paths.workset
  ];

  if (positiveInteger(args.maxLeagues, 0)) {
    worksetArgs.push("--limit", String(positiveInteger(args.maxLeagues, 0)));
  }

  steps.push(runNodeJob("build-fixture-league-date-autonomous-source-discovery-workset-file.js", worksetArgs, "autonomous discovery workset"));

  steps.push(runNodeJob("build-fixture-league-date-autonomous-source-candidate-targets-file.js", [
    "--input", paths.workset,
    "--output", paths.allTargets
  ], "autonomous source candidate targets"));

  const workset = readJson(paths.workset);
  const allTargets = readJson(paths.allTargets);
  const workRows = selectRows(workset, ["workRows"]);
  const selectedLeagues = uniqueLeagues(workRows);
  const targetRows = selectRows(allTargets, ["searchTargetRows"]);

  const waveReports = [];
  const waveFetchReports = [];

  if (args.wave === "1" || args.wave === "all") {
    const wave1Targets = capTotalTargets(diversifyTargetsPerLeague(targetRows, 6), args);
    writeJson(paths.wave1Targets, {
      ok: true,
      job: "run-daily-autonomous-fixture-acquisition-progressive-file",
      mode: "read_only_wave1_targets",
      generatedAt: new Date().toISOString(),
      wave: 1,
      searchTargetRows: wave1Targets,
      guarantees: {
        sourceFetch: false,
        canonicalWrites: 0,
        productionWrite: false,
        dryRun: true
      }
    });

    const wave1 = runSearchWave({
      args,
      paths,
      waveName: "wave1",
      selectedTargetsPath: paths.wave1Targets,
      searchPath: paths.wave1Search,
      searchDir: paths.wave1SearchDir,
      validatedPath: paths.wave1Validated,
      rankedPath: paths.wave1Ranked,
      reviewRowsPath: paths.wave1ReviewRows,
      fetchRowsPath: paths.wave1FetchRows
    });

    waveReports.push(wave1);
    waveFetchReports.push(wave1.fetchRowsReport);
  }

  if (args.wave === "2" || args.wave === "all") {
    const previousFetchRows = waveFetchReports[0] || (fs.existsSync(paths.wave1FetchRows) ? readJson(paths.wave1FetchRows) : null);
    const previousReady = previousFetchRows ? summarizeReadyCoverage(selectedLeagues, previousFetchRows) : { zeroReadyLeagues: selectedLeagues };
    const zeroReadySet = new Set(previousReady.zeroReadyLeagues || selectedLeagues);
    const wave2SourceTargets = targetRows.filter((row) => zeroReadySet.has(leagueOf(row)));
    const wave2Targets = capTotalTargets(capTargetsPerLeague(wave2SourceTargets, 3), args);

    writeJson(paths.wave2Targets, {
      ok: true,
      job: "run-daily-autonomous-fixture-acquisition-progressive-file",
      mode: "read_only_wave2_zero_ready_targets",
      generatedAt: new Date().toISOString(),
      wave: 2,
      zeroReadyLeagueCount: zeroReadySet.size,
      searchTargetRows: wave2Targets,
      guarantees: {
        sourceFetch: false,
        canonicalWrites: 0,
        productionWrite: false,
        dryRun: true
      }
    });

    if (wave2Targets.length > 0) {
      const wave2 = runSearchWave({
        args,
        paths,
        waveName: "wave2",
        selectedTargetsPath: paths.wave2Targets,
        searchPath: paths.wave2Search,
        searchDir: paths.wave2SearchDir,
        validatedPath: paths.wave2Validated,
        rankedPath: paths.wave2Ranked,
        reviewRowsPath: paths.wave2ReviewRows,
        fetchRowsPath: paths.wave2FetchRows
      });

      waveReports.push(wave2);
      waveFetchReports.push(wave2.fetchRowsReport);
    }
  }

  const mergedFetchRows = mergeFetchRows(paths.mergedFetchRows, waveFetchReports);
  const readyCoverage = summarizeReadyCoverage(selectedLeagues, mergedFetchRows);

  let fetchReport = null;
  let classifyReport = null;
  let extractReport = null;
  const fetchSteps = [];

  if (args.allowFetch) {
    fetchSteps.push(runNodeJob("fetch-fixture-league-date-autonomous-ranked-candidate-snapshots-file.js", [
      "--input", paths.mergedFetchRows,
      "--output", paths.fetched,
      "--allow-fetch",
      "--limit", String(positiveInteger(args.fetchLimit, 20)),
      "--timeout-ms", String(positiveInteger(args.timeoutMs, 12000))
    ], "controlled fetch candidate snapshots"));

    fetchSteps.push(runNodeJob("classify-fixture-league-date-source-candidate-snapshots-file.js", [
      "--input", paths.fetched,
      "--output", paths.classified
    ], "classify fetched candidate snapshots"));

    fetchSteps.push(runNodeJob("extract-fixture-league-date-source-candidate-evidence-file.js", [
      "--input", paths.classified,
      "--output", paths.evidence
    ], "extract fixture evidence from classified snapshots"));

    fetchReport = readJson(paths.fetched);
    classifyReport = readJson(paths.classified);
    extractReport = readJson(paths.evidence);
  }

  const evidenceCoverage = summarizeEvidenceCoverage(extractReport);

  const report = {
    ok: true,
    job: "run-daily-autonomous-fixture-acquisition-progressive-file",
    mode: "read_only_daily_autonomous_fixture_acquisition_progressive",
    generatedAt: new Date().toISOString(),
    date: args.date,
    wave: args.wave,
    sourceInput: {
      inputPlanProvided: Boolean(args.inputPlan),
      sourceIndexProvided: Boolean(args.sourceIndex),
      allowSearch: args.allowSearch === true,
      allowFetch: args.allowFetch === true,
      maxLeagues: args.maxLeagues,
      maxTargets: args.maxTargets,
      maxBatches: args.maxBatches,
      batchSize: args.batchSize
    },
    summary: {
      totalEligibleLeagues: selectedLeagues.length,
      searchedLeagueCount: uniqueLeagues([
        ...selectRows(fs.existsSync(paths.wave1Targets) ? readJson(paths.wave1Targets) : {}, ["searchTargetRows"]),
        ...selectRows(fs.existsSync(paths.wave2Targets) ? readJson(paths.wave2Targets) : {}, ["searchTargetRows"])
      ]).length,
      readyForFetchLeagueCount: readyCoverage.readyForFetchLeagueCount,
      zeroReadyLeagueCount: readyCoverage.zeroReadyLeagueCount,
      readyForFetchRowCount: readyCoverage.readyForFetchRowCount,
      targetDateFixtureEvidenceRowCount: evidenceCoverage.targetDateFixtureEvidenceRowCount,
      fixtureEvidenceLeagueCount: evidenceCoverage.fixtureEvidenceLeagueCount,
      secondSourceCandidateCount: evidenceCoverage.secondSourceCandidateCount,
      blockedEvidenceRowCount: evidenceCoverage.blockedEvidenceRowCount,
      sourceFetch: args.allowFetch === true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    readyCoverage,
    evidenceCoverage,
    paths,
    stepSummaries: {
      plan: fs.existsSync(paths.plan) ? readJson(paths.plan).summary || {} : {},
      workset: fs.existsSync(paths.workset) ? readJson(paths.workset).summary || {} : {},
      targets: fs.existsSync(paths.allTargets) ? readJson(paths.allTargets).summary || {} : {},
      fetched: fetchReport?.summary || null,
      classified: classifyReport?.summary || null,
      evidence: extractReport?.summary || null
    },
    executedSteps: [
      ...steps,
      ...waveReports.flatMap((row) => row.steps || []),
      ...fetchSteps
    ],
    guarantees: {
      searchRequiresExplicitAllowSearchOrSourceIndex: true,
      fetchRequiresExplicitAllowFetch: true,
      sourceFetch: args.allowFetch === true,
      noFetch: args.allowFetch !== true,
      noUrlFetch: args.allowFetch !== true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };

  assertReadOnly(report);

  const outputPath = args.output
    ? path.resolve(args.output)
    : path.join(outputDir, `daily-autonomous-fixture-acquisition-progressive-${args.date}.json`);

  writeJson(outputPath, report);

  if (!args.keepIntermediates && !args.outputDir) {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }

  return { report, outputPath };
}

function runSelfTest() {
  const sampleTargets = {
    searchTargetRows: [
      { leagueSlug: "a.1", query: "A official fixtures", compositeScore: 100 },
      { leagueSlug: "a.1", query: "A federation fixtures", compositeScore: 90 },
      { leagueSlug: "b.1", query: "B official fixtures", compositeScore: 100 },
      { leagueSlug: "b.1", query: "B trusted fixtures", compositeScore: 80 }
    ]
  };

  const wave1 = capTargetsPerLeague(sampleTargets.searchTargetRows, 1);
  if (wave1.length !== 2) throw new Error("wave1 must keep one target per league");

  const wave2 = capTargetsPerLeague(sampleTargets.searchTargetRows.filter((row) => row.leagueSlug === "b.1"), 3);
  if (wave2.length !== 2) throw new Error("wave2 must keep only zero-ready league targets");

  const coverage = summarizeReadyCoverage(["a.1", "b.1"], {
    readyForFetchRows: [{ leagueSlug: "a.1", resolvedUrl: "https://example.test/a", readyForFetch: true }],
    rejectedRows: [{ leagueSlug: "b.1", rejectionReason: "no_official_fixture_candidate" }]
  });

  if (coverage.readyForFetchLeagueCount !== 1) throw new Error("expected 1 ready league");
  if (coverage.zeroReadyLeagueCount !== 1) throw new Error("expected 1 zero-ready league");
  if (coverage.zeroReadyLeagues[0] !== "b.1") throw new Error("expected b.1 as zero-ready");

  const report = {
    summary: { canonicalWrites: 0, productionWrite: false },
    guarantees: { canonicalWrites: 0, productionWrite: false, noCanonicalPromotion: true }
  };
  assertReadOnly(report);

  return {
    ok: true,
    selfTest: "run-daily-autonomous-fixture-acquisition-progressive-file",
    summary: {
      wave1TargetCount: wave1.length,
      wave2TargetCount: wave2.length,
      readyForFetchLeagueCount: coverage.readyForFetchLeagueCount,
      zeroReadyLeagueCount: coverage.zeroReadyLeagueCount
    },
    guarantees: report.guarantees
  };
}

async function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const { report, outputPath } = runPipeline(args);

  console.log(JSON.stringify({
    ok: true,
    output: outputPath,
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